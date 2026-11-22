import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/remover/postprocess.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = { exports: {} };
// This is a trusted, pure module. Use the current V8 realm, like a normal
// module, so cross-context globals do not distort the performance check.
vm.compileFunction(code, ["module", "exports"])(mod, mod.exports);

const { cleanAlphaMask, fastGuidedUpsample, decontaminateForeground } = mod.exports;

/** Reference center-aligned bilinear resize for baseline MAE comparison. */
function bilinearResize(src, srcW, srcH, dstW, dstH) {
  const out = new Uint8ClampedArray(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.max(0, Math.min(srcH - 1, ((y + 0.5) * srcH) / dstH - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = Math.max(0, Math.min(srcW - 1, ((x + 0.5) * srcW) / dstW - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;
      const top = src[y0 * srcW + x0] * (1 - fx) + src[y0 * srcW + x1] * fx;
      const bot = src[y1 * srcW + x0] * (1 - fx) + src[y1 * srcW + x1] * fx;
      out[y * dstW + x] = Math.round(top * (1 - fy) + bot * fy);
    }
  }
  return out;
}

/** Downsample a full-res mask via box averaging to simulate a coarse low-res segmentation prediction. */
function downsampleBox(src, fullW, fullH, lowW, lowH) {
  const out = new Uint8ClampedArray(lowW * lowH);
  const bx = fullW / lowW;
  const by = fullH / lowH;
  for (let ly = 0; ly < lowH; ly++) {
    const y0 = Math.floor(ly * by);
    const y1 = Math.max(y0 + 1, Math.floor((ly + 1) * by));
    for (let lx = 0; lx < lowW; lx++) {
      const x0 = Math.floor(lx * bx);
      const x1 = Math.max(x0 + 1, Math.floor((lx + 1) * bx));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += src[y * fullW + x];
          count++;
        }
      }
      out[ly * lowW + lx] = Math.round(sum / count);
    }
  }
  return out;
}

test("cleanAlphaMask removes dust, preserves solids, and rescales mid-range monotonically", () => {
  const all = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  const snapshot = new Uint8ClampedArray(all);

  const cleaned = cleanAlphaMask(all);
  assert.deepEqual(all, snapshot, "Input mask must not be mutated");

  for (let i = 0; i <= 3; i++) {
    assert.equal(cleaned[i], 0, `Value ${i} should map to 0`);
  }
  for (let i = 252; i <= 255; i++) {
    assert.equal(cleaned[i], 255, `Value ${i} should map to 255`);
  }
  for (let i = 4; i <= 251; i++) {
    assert.ok(cleaned[i] >= 1 && cleaned[i] <= 254, `Mid value ${i} must stay in [1, 254], got ${cleaned[i]}`);
    assert.ok(cleaned[i] >= cleaned[i - 1], `Output must be monotonic at ${i}`);
  }
  assert.equal(cleaned[4], 1);
  assert.equal(cleaned[251], 254);

  // Custom cutoffs and empty input
  const custom = cleanAlphaMask(new Uint8ClampedArray([0, 10, 11, 128, 244, 245, 255]), 10, 245);
  assert.deepEqual([...custom], [0, 0, 1, 128, 254, 255, 255]);
  assert.equal(cleanAlphaMask(new Uint8ClampedArray(0)).length, 0);
});

test("fastGuidedUpsample sharply improves MAE and edge sharpness over bilinear upsampling", () => {
  const fullW = 256;
  const fullH = 256;
  const lowW = 32;
  const lowH = 32;

  const gt = new Uint8ClampedArray(fullW * fullH);
  const guide = new Uint8ClampedArray(fullW * fullH * 4);
  const cx = 128;
  const cy = 128;
  const radius = 70;

  for (let y = 0; y < fullH; y++) {
    for (let x = 0; x < fullW; x++) {
      const idx = y * fullW + x;
      const dist = Math.hypot(x - cx, y - cy);
      const inside = dist <= radius;
      gt[idx] = inside ? 255 : 0;

      // Bright subject with a dark interior pattern deep inside; dark background with a bright stripe far outside
      let r, g, b;
      if (inside) {
        const deepPattern = dist < 30 && ((x >> 3) & 1) === 0;
        r = deepPattern ? 35 : 230;
        g = deepPattern ? 35 : 225;
        b = deepPattern ? 40 : 215;
      } else {
        const farBgStripe = dist > 100 && ((y >> 3) & 1) === 0;
        r = farBgStripe ? 210 : 25;
        g = farBgStripe ? 210 : 30;
        b = farBgStripe ? 210 : 35;
      }
      const p = idx * 4;
      guide[p] = r;
      guide[p + 1] = g;
      guide[p + 2] = b;
      guide[p + 3] = 255;
    }
  }

  const lowMask = downsampleBox(gt, fullW, fullH, lowW, lowH);
  const bilinear = bilinearResize(lowMask, lowW, lowH, fullW, fullH);
  const guided = fastGuidedUpsample(lowMask, lowW, lowH, guide, fullW, fullH);

  let bilinearErr = 0;
  let guidedErr = 0;
  let bilinearMidCount = 0;
  let guidedMidCount = 0;
  let farBgLeaks = 0;
  let deepInteriorHoles = 0;

  for (let y = 0; y < fullH; y++) {
    for (let x = 0; x < fullW; x++) {
      const idx = y * fullW + x;
      bilinearErr += Math.abs(bilinear[idx] - gt[idx]);
      guidedErr += Math.abs(guided[idx] - gt[idx]);
      if (bilinear[idx] > 20 && bilinear[idx] < 235) bilinearMidCount++;
      if (guided[idx] > 20 && guided[idx] < 235) guidedMidCount++;

      const dist = Math.hypot(x - cx, y - cy);
      if (dist > 100 && guided[idx] !== 0) farBgLeaks++;
      if (dist < 30 && guided[idx] !== 255) deepInteriorHoles++;
    }
  }

  const bilinearMAE = bilinearErr / (fullW * fullH);
  const guidedMAE = guidedErr / (fullW * fullH);

  assert.ok(
    guidedMAE < bilinearMAE * 0.55,
    `Guided MAE (${guidedMAE.toFixed(3)}) should beat bilinear MAE (${bilinearMAE.toFixed(3)}) by >45%`
  );
  assert.ok(
    guidedMidCount < bilinearMidCount * 0.6,
    `Guided transition band (${guidedMidCount} px) should be much sharper than bilinear (${bilinearMidCount} px)`
  );
  assert.equal(farBgLeaks, 0, "Stability safeguard must prevent ghost opacity on patterned far background");
  assert.equal(deepInteriorHoles, 0, "Stability safeguard must prevent texture holes deep inside solid subject");
});

test("fastGuidedUpsample handles edge cases: empty, 1x1, all-0, all-255, and non-square", () => {
  // Empty
  assert.equal(fastGuidedUpsample(new Uint8ClampedArray(0), 0, 0, new Uint8ClampedArray(0), 0, 0).length, 0);

  // 1x1
  const one = fastGuidedUpsample(new Uint8ClampedArray([137]), 1, 1, new Uint8ClampedArray([10, 20, 30, 255]), 1, 1);
  assert.deepEqual([...one], [137]);

  // All-0 fast path
  const zeroGuide = new Uint8ClampedArray(64 * 48 * 4).fill(180);
  const zeros = fastGuidedUpsample(new Uint8ClampedArray(16 * 12), 16, 12, zeroGuide, 64, 48);
  assert.equal(zeros.length, 64 * 48);
  assert.equal(zeros.every((v) => v === 0), true, "All-zero mask must remain strictly zero");

  // All-255 fast path
  const solidLow = new Uint8ClampedArray(16 * 12).fill(255);
  const solids = fastGuidedUpsample(solidLow, 16, 12, zeroGuide, 64, 48);
  assert.equal(solids.length, 64 * 48);
  assert.equal(solids.every((v) => v === 255), true, "All-255 mask must remain strictly 255");

  // Non-square larger than workMaxSide (tests working-res downscale + bilinear upsample path)
  const fullW = 900;
  const fullH = 300;
  const lowW = 90;
  const lowH = 30;
  const gt = new Uint8ClampedArray(fullW * fullH);
  const guide = new Uint8ClampedArray(fullW * fullH * 4);
  for (let y = 0; y < fullH; y++) {
    for (let x = 0; x < fullW; x++) {
      const idx = y * fullW + x;
      const inside = x >= 220 && x < 680 && y >= 50 && y < 250;
      gt[idx] = inside ? 255 : 0;
      const c = inside ? 240 : 20;
      const p = idx * 4;
      guide[p] = c;
      guide[p + 1] = c;
      guide[p + 2] = c;
      guide[p + 3] = 255;
    }
  }
  const low = downsampleBox(gt, fullW, fullH, lowW, lowH);
  const bilinear = bilinearResize(low, lowW, lowH, fullW, fullH);
  const guided = fastGuidedUpsample(low, lowW, lowH, guide, fullW, fullH, { workMaxSide: 450 });

  let bErr = 0;
  let gErr = 0;
  for (let i = 0; i < gt.length; i++) {
    bErr += Math.abs(bilinear[i] - gt[i]);
    gErr += Math.abs(guided[i] - gt[i]);
  }
  assert.ok(gErr < bErr * 0.5, `Non-square guided error (${gErr}) should be <50% of bilinear (${bErr})`);
});

test("guided refinement preserves confident native-resolution alpha when the guide has no matching edge", () => {
  const w = 32;
  const h = 12;
  const mask = new Uint8ClampedArray(w * h);
  const guide = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      mask[i] = x < w / 2 ? 0 : 255;
      guide.set([150, 150, 150, 255], i * 4);
    }
  }
  const snapshot = new Uint8ClampedArray(mask);
  const refined = fastGuidedUpsample(mask, w, h, guide, w, h);
  assert.deepEqual(refined, snapshot, "A flat guide cannot justify extending the silhouette or eroding its interior");
  assert.deepEqual(mask, snapshot, "The AI matte must not be mutated");
});

test("guided upsampling keeps certain background transparent and certain foreground solid near the transition", () => {
  const lowW = 8;
  const lowH = 6;
  const w = 32;
  const h = 24;
  const mask = new Uint8ClampedArray(lowW * lowH);
  for (let y = 0; y < lowH; y++) {
    for (let x = 0; x < lowW; x++) {
      mask[y * lowW + x] = x < 3 ? 0 : x === 3 ? 64 : x === 4 ? 192 : 255;
    }
  }
  const guide = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) guide.set([150, 150, 150, 255], i * 4);
  const bilinear = bilinearResize(mask, lowW, lowH, w, h);
  const refined = fastGuidedUpsample(mask, lowW, lowH, guide, w, h);
  let background = 0;
  let foreground = 0;
  let transition = 0;
  for (let i = 0; i < refined.length; i++) {
    if (bilinear[i] === 0) {
      background++;
      assert.equal(refined[i], 0, `Confident background at ${i} must stay transparent`);
    } else if (bilinear[i] === 255) {
      foreground++;
      assert.equal(refined[i], 255, `Confident foreground at ${i} must stay solid`);
    } else {
      transition++;
      assert.ok(refined[i] >= 0 && refined[i] <= 255);
    }
  }
  assert.ok(background > 0 && foreground > 0 && transition > 0, "Fixture must cover all three confidence regions");
});

test("decontaminateForeground removes >80% yellow spill on black subject without altering alpha=0 or alpha>=254", () => {
  const width = 160;
  const height = 160;
  const fgColor = [15, 15, 15];
  const bgColor = [250, 220, 10];
  const cx = 80;
  const cy = 80;
  const innerR = 40;
  const bandW = 6; // 6px semi-transparent anti-aliased transition band

  const rgba = new Uint8ClampedArray(width * height * 4);
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dist = Math.hypot(x - cx, y - cy);
      let a;
      if (dist <= innerR) {
        a = 255;
      } else if (dist < innerR + bandW) {
        // Linear transition across 6px band
        const frac = 1 - (dist - innerR) / bandW;
        a = Math.max(1, Math.min(253, Math.round(frac * 255)));
      } else {
        a = 0;
      }
      alpha[idx] = a;

      const af = a / 255;
      const p = idx * 4;
      // Add slight spatial variation on pure background and solid interior to verify bit-exact preservation
      if (a === 255) {
        rgba[p] = fgColor[0] + (x & 3);
        rgba[p + 1] = fgColor[1] + (y & 3);
        rgba[p + 2] = fgColor[2];
        rgba[p + 3] = 255;
      } else if (a === 0) {
        rgba[p] = bgColor[0] - (x & 3);
        rgba[p + 1] = bgColor[1] - (y & 3);
        rgba[p + 2] = bgColor[2] + (x & 3);
        rgba[p + 3] = 255;
      } else {
        rgba[p] = Math.round(af * fgColor[0] + (1 - af) * bgColor[0]);
        rgba[p + 1] = Math.round(af * fgColor[1] + (1 - af) * bgColor[1]);
        rgba[p + 2] = Math.round(af * fgColor[2] + (1 - af) * bgColor[2]);
        rgba[p + 3] = 255;
      }
    }
  }

  const inputCopy = new Uint8ClampedArray(rgba);
  const out = decontaminateForeground(rgba, alpha, width, height);

  assert.deepEqual(rgba, inputCopy, "Input RGBA must not be mutated");

  let beforeSpill = 0;
  let afterSpill = 0;
  let edgePixels = 0;

  for (let i = 0; i < width * height; i++) {
    const a = alpha[i];
    const p = i * 4;
    if (a === 0 || a >= 254) {
      assert.equal(out[p], rgba[p], `Untouched pixel R mismatch at i=${i}, alpha=${a}`);
      assert.equal(out[p + 1], rgba[p + 1], `Untouched pixel G mismatch at i=${i}, alpha=${a}`);
      assert.equal(out[p + 2], rgba[p + 2], `Untouched pixel B mismatch at i=${i}, alpha=${a}`);
      assert.equal(out[p + 3], rgba[p + 3], `Untouched pixel A mismatch at i=${i}, alpha=${a}`);
    } else {
      beforeSpill +=
        Math.abs(rgba[p] - fgColor[0]) +
        Math.abs(rgba[p + 1] - fgColor[1]) +
        Math.abs(rgba[p + 2] - fgColor[2]);
      afterSpill +=
        Math.abs(out[p] - fgColor[0]) +
        Math.abs(out[p + 1] - fgColor[1]) +
        Math.abs(out[p + 2] - fgColor[2]);
      edgePixels++;
    }
  }

  assert.ok(edgePixels > 1000, "Test image should have a substantial 6px transition band");
  const reduction = 1 - afterSpill / beforeSpill;
  assert.ok(
    reduction > 0.8,
    `Expected >80% yellow spill reduction, got ${(reduction * 100).toFixed(1)}% (before=${beforeSpill}, after=${afterSpill})`
  );
});

test("decontaminateForeground eliminates dark halo on light golden fur over dark background", () => {
  const width = 180;
  const height = 140;
  const fgColor = [220, 180, 120];
  const bgColor = [20, 25, 30];

  const rgba = new Uint8ClampedArray(width * height * 4);
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let a;
      if (x < 75) {
        a = 255;
      } else if (x < 85) {
        // 10px soft fur edge
        const frac = 1 - (x - 74) / 11;
        a = Math.max(1, Math.min(253, Math.round(frac * 255)));
      } else {
        a = 0;
      }
      alpha[idx] = a;
      const af = a / 255;
      const p = idx * 4;
      rgba[p] = Math.round(af * fgColor[0] + (1 - af) * bgColor[0]);
      rgba[p + 1] = Math.round(af * fgColor[1] + (1 - af) * bgColor[1]);
      rgba[p + 2] = Math.round(af * fgColor[2] + (1 - af) * bgColor[2]);
      rgba[p + 3] = 255;
    }
  }

  const out = decontaminateForeground(rgba, alpha, width, height);

  let beforeErr = 0;
  let afterErr = 0;
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i];
    if (a === 0 || a >= 254) continue;
    const p = i * 4;
    beforeErr +=
      Math.abs(rgba[p] - fgColor[0]) +
      Math.abs(rgba[p + 1] - fgColor[1]) +
      Math.abs(rgba[p + 2] - fgColor[2]);
    afterErr +=
      Math.abs(out[p] - fgColor[0]) +
      Math.abs(out[p + 1] - fgColor[1]) +
      Math.abs(out[p + 2] - fgColor[2]);
  }

  const reduction = 1 - afterErr / beforeErr;
  assert.ok(
    reduction > 0.8,
    `Expected >80% dark halo elimination on golden fur, got ${(reduction * 100).toFixed(1)}%`
  );
});

test("decontaminateForeground handles strength=0, binary masks, and scarce high-confidence fallbacks", () => {
  const w = 64;
  const h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 100;
    rgba[i * 4 + 1] = 150;
    rgba[i * 4 + 2] = 200;
    rgba[i * 4 + 3] = 255;
    // Translucent mask with NO pixels >= 240 and NO pixels <= 15 (exercises Tier 2/3 fallback)
    alpha[i] = i % w < 32 ? 170 : 80;
  }

  // strength = 0 returns exact copy
  const zeroOut = decontaminateForeground(rgba, alpha, w, h, { strength: 0 });
  assert.deepEqual(zeroOut, rgba);

  // Translucent fallback succeeds with finite valid byte values
  const fallbackOut = decontaminateForeground(rgba, alpha, w, h, { strength: 0.9 });
  assert.equal(fallbackOut.length, rgba.length);
  for (let i = 0; i < fallbackOut.length; i++) {
    assert.ok(Number.isFinite(fallbackOut[i]) && fallbackOut[i] >= 0 && fallbackOut[i] <= 255);
  }

  // Pure binary mask (no pixels in [1, 253]) is unchanged
  const binAlpha = new Uint8ClampedArray(w * h).map((_, i) => (i % w < 32 ? 255 : 0));
  const binOut = decontaminateForeground(rgba, binAlpha, w, h);
  assert.deepEqual(binOut, rgba);
});

test("performance sanity: 1024x1024 fastGuidedUpsample and decontaminateForeground run well under 500ms", (t) => {
  const fullW = 1024;
  const fullH = 1024;
  const lowW = 256;
  const lowH = 256;

  const guide = new Uint8ClampedArray(fullW * fullH * 4);
  const alpha = new Uint8ClampedArray(fullW * fullH);
  const cx = 512;
  const cy = 512;
  const rInner = 300;
  const band = 8;

  for (let y = 0; y < fullH; y++) {
    const dy = y - cy;
    for (let x = 0; x < fullW; x++) {
      const idx = y * fullW + x;
      const dist = Math.hypot(x - cx, dy);
      let a;
      if (dist <= rInner) a = 255;
      else if (dist < rInner + band) a = Math.max(1, Math.min(253, Math.round((1 - (dist - rInner) / band) * 255)));
      else a = 0;
      alpha[idx] = a;
      const af = a / 255;
      const p = idx << 2;
      guide[p] = Math.round(af * 25 + (1 - af) * 245);
      guide[p + 1] = Math.round(af * 30 + (1 - af) * 215);
      guide[p + 2] = Math.round(af * 40 + (1 - af) * 20);
      guide[p + 3] = 255;
    }
  }

  const lowMask = downsampleBox(alpha, fullW, fullH, lowW, lowH);

  // Measure steady-state execution, excluding the first-call JIT cost. A fixed
  // three-sample median limits one-off scheduling noise without changing the
  // 500ms budget or retrying until a measurement passes.
  const warmMask = fastGuidedUpsample(lowMask, lowW, lowH, guide, fullW, fullH);
  decontaminateForeground(guide, warmMask, fullW, fullH);

  const samples = [];
  for (let run = 0; run < 3; run++) {
    const guidedCpuStart = process.cpuUsage();
    const guidedThreadStart = process.threadCpuUsage?.();
    const t0 = performance.now();
    const upsampled = fastGuidedUpsample(lowMask, lowW, lowH, guide, fullW, fullH);
    const guidedMs = performance.now() - t0;
    const guidedCpu = process.cpuUsage(guidedCpuStart);
    const guidedThreadCpu = guidedThreadStart && process.threadCpuUsage(guidedThreadStart);

    const defringeCpuStart = process.cpuUsage();
    const defringeThreadStart = process.threadCpuUsage?.();
    const t1 = performance.now();
    const defringed = decontaminateForeground(guide, upsampled, fullW, fullH);
    const defringeMs = performance.now() - t1;
    const defringeCpu = process.cpuUsage(defringeCpuStart);
    const defringeThreadCpu = defringeThreadStart && process.threadCpuUsage(defringeThreadStart);

    assert.equal(upsampled.length, fullW * fullH);
    assert.equal(defringed.length, fullW * fullH * 4);
    samples.push({
      guidedMs,
      defringeMs,
      guidedCpuMs: (guidedCpu.user + guidedCpu.system) / 1000,
      defringeCpuMs: (defringeCpu.user + defringeCpu.system) / 1000,
      guidedThreadCpuMs: guidedThreadCpu && (guidedThreadCpu.user + guidedThreadCpu.system) / 1000,
      defringeThreadCpuMs: defringeThreadCpu && (defringeThreadCpu.user + defringeThreadCpu.system) / 1000,
    });
  }

  const median = (values) => [...values].sort((a, b) => a - b)[1];
  const guidedMs = median(samples.map((sample) => sample.guidedMs));
  const defringeMs = median(samples.map((sample) => sample.defringeMs));
  t.diagnostic(`Native V8 steady-state samples (ms): ${JSON.stringify(samples.map((sample) => ({
    guided: Number(sample.guidedMs.toFixed(1)),
    defringe: Number(sample.defringeMs.toFixed(1)),
    guidedCpu: Number(sample.guidedCpuMs.toFixed(1)),
    defringeCpu: Number(sample.defringeCpuMs.toFixed(1)),
    guidedThreadCpu: sample.guidedThreadCpuMs === undefined ? undefined : Number(sample.guidedThreadCpuMs.toFixed(1)),
    defringeThreadCpu: sample.defringeThreadCpuMs === undefined ? undefined : Number(sample.defringeThreadCpuMs.toFixed(1)),
  })))}`);
  t.diagnostic(`Median guided=${guidedMs.toFixed(1)}ms, defringe=${defringeMs.toFixed(1)}ms; each budget < 500ms`);
  assert.ok(guidedMs < 500, `1024x1024 fastGuidedUpsample median took ${guidedMs.toFixed(1)}ms (budget < 500ms)`);
  assert.ok(defringeMs < 500, `1024x1024 decontaminateForeground median took ${defringeMs.toFixed(1)}ms (budget < 500ms)`);
});

test("decontaminateForeground works accurately on downscaled working path (non-square > workMaxSide) and multi-color foreground", () => {
  // 1200x400 triggers workMaxSide=512 downscaling + bilinear sampling of F_est / B_est
  const width = 1200;
  const height = 400;
  const leftFg = [220, 30, 30];   // red left half
  const rightFg = [30, 60, 220];  // blue right half
  const bgColor = [20, 230, 40];  // bright green background

  const rgba = new Uint8ClampedArray(width * height * 4);
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const fg = x < width / 2 ? leftFg : rightFg;
      let a;
      if (y >= 110 && y <= 290 && x >= 120 && x <= 1080) {
        a = 255;
      } else {
        const dx = x < 120 ? 120 - x : x > 1080 ? x - 1080 : 0;
        const dy = y < 110 ? 110 - y : y > 290 ? y - 290 : 0;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          a = Math.max(1, Math.min(253, Math.round((1 - dist / 10) * 255)));
        } else {
          a = 0;
        }
      }
      alpha[idx] = a;
      const af = a / 255;
      const p = idx << 2;
      rgba[p] = Math.round(af * fg[0] + (1 - af) * bgColor[0]);
      rgba[p + 1] = Math.round(af * fg[1] + (1 - af) * bgColor[1]);
      rgba[p + 2] = Math.round(af * fg[2] + (1 - af) * bgColor[2]);
      rgba[p + 3] = 255;
    }
  }

  const out = decontaminateForeground(rgba, alpha, width, height);

  let leftBefore = 0, leftAfter = 0;
  let rightBefore = 0, rightAfter = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const a = alpha[idx];
      const p = idx << 2;
      if (a === 0 || a >= 254) {
        assert.equal(out[p], rgba[p]);
        assert.equal(out[p + 1], rgba[p + 1]);
        assert.equal(out[p + 2], rgba[p + 2]);
        assert.equal(out[p + 3], rgba[p + 3]);
      } else if (x < 500) {
        leftBefore += Math.abs(rgba[p] - leftFg[0]) + Math.abs(rgba[p + 1] - leftFg[1]) + Math.abs(rgba[p + 2] - leftFg[2]);
        leftAfter += Math.abs(out[p] - leftFg[0]) + Math.abs(out[p + 1] - leftFg[1]) + Math.abs(out[p + 2] - leftFg[2]);
      } else if (x > 700) {
        rightBefore += Math.abs(rgba[p] - rightFg[0]) + Math.abs(rgba[p + 1] - rightFg[1]) + Math.abs(rgba[p + 2] - rightFg[2]);
        rightAfter += Math.abs(out[p] - rightFg[0]) + Math.abs(out[p + 1] - rightFg[1]) + Math.abs(out[p + 2] - rightFg[2]);
      }
    }
  }

  assert.ok(1 - leftAfter / leftBefore > 0.8, `Red-half spill reduction should exceed 80%, got ${((1 - leftAfter / leftBefore) * 100).toFixed(1)}%`);
  assert.ok(1 - rightAfter / rightBefore > 0.8, `Blue-half spill reduction should exceed 80%, got ${((1 - rightAfter / rightBefore) * 100).toFixed(1)}%`);
});

test("extreme 1xN and Nx1 dimensions stay finite and bounded without errors", () => {
  const w = 1;
  const h = 32;
  const lowMask = new Uint8ClampedArray(8).map((_, i) => (i < 4 ? 0 : 255));
  const guide = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const c = y < 16 ? 20 : 230;
    guide[y * 4] = c;
    guide[y * 4 + 1] = c;
    guide[y * 4 + 2] = c;
    guide[y * 4 + 3] = 255;
  }

  const gVert = fastGuidedUpsample(lowMask, 1, 8, guide, 1, 32);
  assert.equal(gVert.length, 32);
  assert.equal(gVert[0], 0);
  assert.equal(gVert[31], 255);

  const gHoriz = fastGuidedUpsample(lowMask, 8, 1, guide, 32, 1);
  assert.equal(gHoriz.length, 32);
  assert.equal(gHoriz[0], 0);
  assert.equal(gHoriz[31], 255);

  const dVert = decontaminateForeground(guide, gVert, 1, 32);
  assert.equal(dVert.length, guide.length);
  const dHoriz = decontaminateForeground(guide, gHoriz, 32, 1);
  assert.equal(dHoriz.length, guide.length);
});
