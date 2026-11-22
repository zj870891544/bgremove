/**
 * Pure matting post-processing utilities (zero DOM/Canvas imports).
 *
 * Implements:
 * 1. Alpha denoising / contrast tightening (`cleanAlphaMask`)
 * 2. He & Sun (2015) Fast Guided Filter upsampling with O(N) separable box filters (`fastGuidedUpsample`)
 * 3. Multi-scale blur-fusion foreground/background color estimation + regularized closed-form
 *    color unmixing / defringing (`decontaminateForeground`)
 */

export type RefineOptions = {
  guidedRefine?: boolean;
  defringe?: boolean;
  defringeStrength?: number;
  cleanAlpha?: boolean;
};

const LUMA_R = 0.2126 / 255;
const LUMA_G = 0.7152 / 255;
const LUMA_B = 0.0722 / 255;

type BilinearLUT = {
  i0: Int32Array;
  i1: Int32Array;
  frac: Float32Array;
};

/**
 * Center-aligned bilinear resampling lookup table (matches Canvas / OpenCV INTER_LINEAR).
 * Guarantees all indices lie in [0, srcLen - 1] with zero out-of-bounds access.
 */
function buildBilinearLUT(srcLen: number, dstLen: number): BilinearLUT {
  const i0 = new Int32Array(dstLen);
  const i1 = new Int32Array(dstLen);
  const frac = new Float32Array(dstLen);
  if (srcLen <= 1 || dstLen <= 0) {
    return { i0, i1, frac };
  }
  const scale = srcLen / dstLen;
  const maxIdx = srcLen - 1;
  for (let d = 0; d < dstLen; d++) {
    const pos = (d + 0.5) * scale - 0.5;
    if (pos <= 0) {
      i0[d] = 0;
      i1[d] = 0;
      frac[d] = 0;
    } else if (pos >= maxIdx) {
      i0[d] = maxIdx;
      i1[d] = maxIdx;
      frac[d] = 0;
    } else {
      const lo = pos | 0;
      i0[d] = lo;
      i1[d] = lo + 1;
      frac[d] = pos - lo;
    }
  }
  return { i0, i1, frac };
}

/**
 * O(N) separable normalized box filter using a Float64 horizontal prefix sum and
 * a Float64 row-major vertical sliding window (cache-friendly, zero drift, handles r >= w/h).
 */
function boxFilter1(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  tmp: Float32Array,
  prefix: Float64Array,
  colSum: Float64Array
): void {
  const n = w * h;
  if (n === 0) return;
  if (r <= 0) {
    dst.set(src);
    return;
  }

  // Horizontal pass (prefix sum per row)
  for (let y = 0; y < h; y++) {
    const row = y * w;
    prefix[0] = 0;
    for (let x = 0; x < w; x++) {
      prefix[x + 1] = prefix[x] + src[row + x];
    }
    for (let x = 0; x < w; x++) {
      const x0 = x > r ? x - r : 0;
      const x1 = x + r < w - 1 ? x + r : w - 1;
      tmp[row + x] = (prefix[x1 + 1] - prefix[x0]) / (x1 - x0 + 1);
    }
  }

  // Vertical pass (row-major sliding window)
  const initEnd = r < h - 1 ? r : h - 1;
  colSum.fill(0, 0, w);
  for (let y = 0; y <= initEnd; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      colSum[x] += tmp[row + x];
    }
  }
  let count = initEnd + 1;

  for (let y = 0; y < h; y++) {
    if (y > 0) {
      const addY = y + r;
      if (addY < h) {
        const addRow = addY * w;
        for (let x = 0; x < w; x++) {
          colSum[x] += tmp[addRow + x];
        }
        count++;
      }
      const subY = y - r - 1;
      if (subY >= 0) {
        const subRow = subY * w;
        for (let x = 0; x < w; x++) {
          colSum[x] -= tmp[subRow + x];
        }
        count--;
      }
    }
    const inv = 1 / count;
    const outRow = y * w;
    for (let x = 0; x < w; x++) {
      dst[outRow + x] = colSum[x] * inv;
    }
  }
}

/**
 * Joint 4-channel O(N) separable normalized box filter (R*w, G*w, B*w, w).
 * Shares window bounds and reciprocal count across all 4 planes for throughput.
 */
function boxFilter4(
  src0: Float32Array,
  src1: Float32Array,
  src2: Float32Array,
  src3: Float32Array,
  dst0: Float32Array,
  dst1: Float32Array,
  dst2: Float32Array,
  dst3: Float32Array,
  w: number,
  h: number,
  r: number,
  tmp0: Float32Array,
  tmp1: Float32Array,
  tmp2: Float32Array,
  tmp3: Float32Array,
  p0: Float64Array,
  p1: Float64Array,
  p2: Float64Array,
  p3: Float64Array,
  c0: Float64Array,
  c1: Float64Array,
  c2: Float64Array,
  c3: Float64Array
): void {
  const n = w * h;
  if (n === 0) return;
  if (r <= 0) {
    dst0.set(src0);
    dst1.set(src1);
    dst2.set(src2);
    dst3.set(src3);
    return;
  }

  for (let y = 0; y < h; y++) {
    const row = y * w;
    p0[0] = 0;
    p1[0] = 0;
    p2[0] = 0;
    p3[0] = 0;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      p0[x + 1] = p0[x] + src0[idx];
      p1[x + 1] = p1[x] + src1[idx];
      p2[x + 1] = p2[x] + src2[idx];
      p3[x + 1] = p3[x] + src3[idx];
    }
    for (let x = 0; x < w; x++) {
      const x0 = x > r ? x - r : 0;
      const x1 = x + r < w - 1 ? x + r : w - 1;
      const inv = 1 / (x1 - x0 + 1);
      const idx = row + x;
      tmp0[idx] = (p0[x1 + 1] - p0[x0]) * inv;
      tmp1[idx] = (p1[x1 + 1] - p1[x0]) * inv;
      tmp2[idx] = (p2[x1 + 1] - p2[x0]) * inv;
      tmp3[idx] = (p3[x1 + 1] - p3[x0]) * inv;
    }
  }

  const initEnd = r < h - 1 ? r : h - 1;
  c0.fill(0, 0, w);
  c1.fill(0, 0, w);
  c2.fill(0, 0, w);
  c3.fill(0, 0, w);
  for (let y = 0; y <= initEnd; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      c0[x] += tmp0[idx];
      c1[x] += tmp1[idx];
      c2[x] += tmp2[idx];
      c3[x] += tmp3[idx];
    }
  }
  let count = initEnd + 1;

  for (let y = 0; y < h; y++) {
    if (y > 0) {
      const addY = y + r;
      if (addY < h) {
        const addRow = addY * w;
        for (let x = 0; x < w; x++) {
          const idx = addRow + x;
          c0[x] += tmp0[idx];
          c1[x] += tmp1[idx];
          c2[x] += tmp2[idx];
          c3[x] += tmp3[idx];
        }
        count++;
      }
      const subY = y - r - 1;
      if (subY >= 0) {
        const subRow = subY * w;
        for (let x = 0; x < w; x++) {
          const idx = subRow + x;
          c0[x] -= tmp0[idx];
          c1[x] -= tmp1[idx];
          c2[x] -= tmp2[idx];
          c3[x] -= tmp3[idx];
        }
        count--;
      }
    }
    const inv = 1 / count;
    const outRow = y * w;
    for (let x = 0; x < w; x++) {
      const idx = outRow + x;
      dst0[idx] = c0[x] * inv;
      dst1[idx] = c1[x] * inv;
      dst2[idx] = c2[x] * inv;
      dst3[idx] = c3[x] * inv;
    }
  }
}

/**
 * Clean faint background dust and near-solid interior noise in an alpha matte.
 * Maps `<= lowCut` to `0`, `>= highCut` to `255`, and linearly rescales `(lowCut, highCut)` into `[1, 254]`.
 */
export function cleanAlphaMask(
  mask: Uint8ClampedArray,
  lowCut = 3,
  highCut = 252
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length);
  if (mask.length === 0) return out;

  const rawLow = Number.isFinite(lowCut) ? lowCut : 3;
  const rawHigh = Number.isFinite(highCut) ? highCut : 252;
  const low = Math.max(0, Math.min(254, Math.round(rawLow)));
  const high = Math.max(low + 1, Math.min(255, Math.round(rawHigh)));
  const span = high - low;

  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    if (v <= low) {
      lut[v] = 0;
    } else if (v >= high) {
      lut[v] = 255;
    } else {
      const scaled = Math.round(((v - low) / span) * 255);
      lut[v] = scaled < 1 ? 1 : scaled > 254 ? 254 : scaled;
    }
  }

  for (let i = 0; i < mask.length; i++) {
    out[i] = lut[mask[i]];
  }
  return out;
}

/**
 * He & Sun (2015) Fast Guided Filter upsampling.
 * Aligns a coarse low-resolution alpha mask to high-resolution photo edges in O(N) time
 * with a neighborhood stability safeguard against background ghosting and solid-interior holes.
 */
export function fastGuidedUpsample(
  lowMask: Uint8ClampedArray,
  lowW: number,
  lowH: number,
  guideRgba: Uint8ClampedArray,
  fullW: number,
  fullH: number,
  options?: { radius?: number; eps?: number; workMaxSide?: number }
): Uint8ClampedArray {
  if (fullW <= 0 || fullH <= 0) {
    return new Uint8ClampedArray(0);
  }
  const fullN = fullW * fullH;
  if (lowW <= 0 || lowH <= 0 || lowMask.length < lowW * lowH) {
    return new Uint8ClampedArray(fullN);
  }

  const lowN = lowW * lowH;
  let minVal = 255;
  let maxVal = 0;
  for (let i = 0; i < lowN; i++) {
    const v = lowMask[i];
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  // Fast-path constant masks (zero artifacts)
  if (maxVal === 0) {
    return new Uint8ClampedArray(fullN);
  }
  if (minVal === 255) {
    const solid = new Uint8ClampedArray(fullN);
    solid.fill(255);
    return solid;
  }

  // Trivial 1x1 output or missing guide data: clean bilinear fallback
  if ((fullW === 1 && fullH === 1) || guideRgba.length < fullN * 4) {
    const out = new Uint8ClampedArray(fullN);
    const xLut = buildBilinearLUT(lowW, fullW);
    const yLut = buildBilinearLUT(lowH, fullH);
    for (let y = 0; y < fullH; y++) {
      const r0 = yLut.i0[y] * lowW;
      const r1 = yLut.i1[y] * lowW;
      const fy = yLut.frac[y];
      const oRow = y * fullW;
      for (let x = 0; x < fullW; x++) {
        const x0 = xLut.i0[x];
        const x1 = xLut.i1[x];
        const fx = xLut.frac[x];
        const top = lowMask[r0 + x0] + (lowMask[r0 + x1] - lowMask[r0 + x0]) * fx;
        const bot = lowMask[r1 + x0] + (lowMask[r1 + x1] - lowMask[r1 + x0]) * fx;
        out[oRow + x] = Math.round(top + (bot - top) * fy);
      }
    }
    return out;
  }

  // Working resolution: match the native scale of lowMask (bounded by fullW x fullH and workMaxSide)
  // so workI and workP share the same spatial footprint for accurate linear regression (a, b),
  // then bilinearly upsample (meanA, meanB) to full resolution (He & Sun 2015 Fast Guided Filter).
  const rawMaxSide = options?.workMaxSide;
  const workMaxSide = Math.max(1, Math.floor(rawMaxSide !== undefined && Number.isFinite(rawMaxSide) ? rawMaxSide : 768));
  let workW: number;
  let workH: number;
  if (lowW <= fullW && lowH <= fullH && Math.max(lowW, lowH) <= workMaxSide) {
    workW = lowW;
    workH = lowH;
  } else {
    const maxFull = Math.max(fullW, fullH);
    const maxLow = Math.max(lowW, lowH);
    const targetMax = Math.min(workMaxSide, maxFull, maxLow);
    const workScale = targetMax / maxFull;
    workW = Math.max(1, Math.min(fullW, Math.round(fullW * workScale)));
    workH = Math.max(1, Math.min(fullH, Math.round(fullH * workScale)));
  }
  const workN = workW * workH;
  const sameAsFull = workW === fullW && workH === fullH;

  // Compute working luminance I (0..1), using exact box-area averaging when downscaling >= 2x
  // so workI matches the pixel footprint of the coarse mask without aliasing.
  const workI = new Float32Array(workN);
  if (sameAsFull) {
    for (let i = 0, j = 0; i < workN; i++, j += 4) {
      workI[i] =
        guideRgba[j] * LUMA_R +
        guideRgba[j + 1] * LUMA_G +
        guideRgba[j + 2] * LUMA_B;
    }
  } else if (fullW >= workW * 2 || fullH >= workH * 2) {
    for (let wy = 0; wy < workH; wy++) {
      const y0 = Math.floor((wy * fullH) / workH);
      const y1 = Math.min(fullH, Math.max(y0 + 1, Math.floor(((wy + 1) * fullH) / workH)));
      const wRow = wy * workW;
      for (let wx = 0; wx < workW; wx++) {
        const x0 = Math.floor((wx * fullW) / workW);
        const x1 = Math.min(fullW, Math.max(x0 + 1, Math.floor(((wx + 1) * fullW) / workW)));
        let sum = 0;
        let cnt = 0;
        for (let y = y0; y < y1; y++) {
          const row = y * fullW;
          for (let x = x0; x < x1; x++) {
            const p = (row + x) << 2;
            sum += guideRgba[p] * LUMA_R + guideRgba[p + 1] * LUMA_G + guideRgba[p + 2] * LUMA_B;
            cnt++;
          }
        }
        workI[wRow + wx] = sum / cnt;
      }
    }
  } else {
    const gxLut = buildBilinearLUT(fullW, workW);
    const gyLut = buildBilinearLUT(fullH, workH);
    for (let y = 0; y < workH; y++) {
      const r0 = gyLut.i0[y] * fullW;
      const r1 = gyLut.i1[y] * fullW;
      const fy = gyLut.frac[y];
      const invFy = 1 - fy;
      const wRow = y * workW;
      for (let x = 0; x < workW; x++) {
        const x0 = gxLut.i0[x];
        const x1 = gxLut.i1[x];
        const fx = gxLut.frac[x];
        const invFx = 1 - fx;
        const p00 = (r0 + x0) << 2;
        const p10 = (r0 + x1) << 2;
        const p01 = (r1 + x0) << 2;
        const p11 = (r1 + x1) << 2;
        const l00 = guideRgba[p00] * LUMA_R + guideRgba[p00 + 1] * LUMA_G + guideRgba[p00 + 2] * LUMA_B;
        const l10 = guideRgba[p10] * LUMA_R + guideRgba[p10 + 1] * LUMA_G + guideRgba[p10 + 2] * LUMA_B;
        const l01 = guideRgba[p01] * LUMA_R + guideRgba[p01 + 1] * LUMA_G + guideRgba[p01 + 2] * LUMA_B;
        const l11 = guideRgba[p11] * LUMA_R + guideRgba[p11 + 1] * LUMA_G + guideRgba[p11 + 2] * LUMA_B;
        workI[wRow + x] = (l00 * invFx + l10 * fx) * invFy + (l01 * invFx + l11 * fx) * fy;
      }
    }
  }

  // Resample lowMask to working resolution (0..1)
  const workP = new Float32Array(workN);
  const inv255 = 1 / 255;
  if (lowW === workW && lowH === workH) {
    for (let i = 0; i < workN; i++) {
      workP[i] = lowMask[i] * inv255;
    }
  } else {
    const pxLut = buildBilinearLUT(lowW, workW);
    const pyLut = buildBilinearLUT(lowH, workH);
    for (let y = 0; y < workH; y++) {
      const r0 = pyLut.i0[y] * lowW;
      const r1 = pyLut.i1[y] * lowW;
      const fy = pyLut.frac[y];
      const wRow = y * workW;
      for (let x = 0; x < workW; x++) {
        const x0 = pxLut.i0[x];
        const x1 = pxLut.i1[x];
        const fx = pxLut.frac[x];
        const top = lowMask[r0 + x0] + (lowMask[r0 + x1] - lowMask[r0 + x0]) * fx;
        const bot = lowMask[r1 + x0] + (lowMask[r1 + x1] - lowMask[r1 + x0]) * fx;
        workP[wRow + x] = (top + (bot - top) * fy) * inv255;
      }
    }
  }

  // Guided filter parameters (proportional ~2-6px at working resolution, eps = 0.0025)
  const workMax = Math.max(workW, workH);
  const maxSensibleR = Math.max(1, Math.floor(Math.min(workW, workH) / 2));
  const autoR = Math.max(2, Math.min(6, Math.round(workMax / 192) + 2));
  const rawRadius = options?.radius;
  const r =
    rawRadius !== undefined && Number.isFinite(rawRadius)
      ? Math.max(1, Math.floor(rawRadius))
      : Math.max(1, Math.min(maxSensibleR, autoR));
  const rawEps = options?.eps;
  const eps = Math.max(1e-8, rawEps !== undefined && Number.isFinite(rawEps) ? rawEps : 0.0025);

  // Allocate reusable work buffers
  const tmp = new Float32Array(workN);
  const prefix = new Float64Array(workW + 1);
  const colSum = new Float64Array(workW);

  const meanI = new Float32Array(workN);
  const meanP = new Float32Array(workN);
  const buf1 = new Float32Array(workN);
  const buf2 = new Float32Array(workN);

  boxFilter1(workI, meanI, workW, workH, r, tmp, prefix, colSum);
  boxFilter1(workP, meanP, workW, workH, r, tmp, prefix, colSum);

  // meanII in buf2 (using buf1 = I*I)
  for (let i = 0; i < workN; i++) {
    const v = workI[i];
    buf1[i] = v * v;
  }
  boxFilter1(buf1, buf2, workW, workH, r, tmp, prefix, colSum);

  // varI in buf2, then IP in buf1
  for (let i = 0; i < workN; i++) {
    const mi = meanI[i];
    const v = buf2[i] - mi * mi;
    buf2[i] = v > 0 ? v : 0;
    buf1[i] = workI[i] * workP[i];
  }

  // meanIP -> overwrite tmp? No, tmp is box scratch; reuse another buffer for a and b
  const aBuf = new Float32Array(workN);
  const bBuf = new Float32Array(workN);
  boxFilter1(buf1, aBuf, workW, workH, r, tmp, prefix, colSum); // aBuf temporarily holds meanIP

  for (let i = 0; i < workN; i++) {
    const mi = meanI[i];
    const mp = meanP[i];
    const covIP = aBuf[i] - mi * mp;
    const a = covIP / (buf2[i] + eps);
    aBuf[i] = a;
    bBuf[i] = mp - a * mi;
  }

  // Smooth a and b -> meanA (in buf1), meanB (in buf2)
  boxFilter1(aBuf, buf1, workW, workH, r, tmp, prefix, colSum);
  boxFilter1(bBuf, buf2, workW, workH, r, tmp, prefix, colSum);
  const meanA = buf1;
  const meanB = buf2;

  // Refine only uncertain matte pixels. A bright/textured photo neighborhood
  // must not turn confident background into a halo or punch holes in solid
  // foreground, even when its box-filtered neighborhood contains both classes.
  const out = new Uint8ClampedArray(fullN);

  if (sameAsFull) {
    for (let i = 0; i < fullN; i++) {
      const mp = meanP[i];
      const pf = workP[i];
      if (pf <= 0.002) {
        out[i] = 0;
      } else if (pf >= 0.998) {
        out[i] = 255;
      } else {
        let w = 1;
        if (mp < 0.04) w = mp > 0.005 ? (mp - 0.005) / 0.035 : 0;
        else if (mp > 0.96) w = mp < 0.995 ? (0.995 - mp) / 0.035 : 0;
        const q = meanA[i] * workI[i] + meanB[i];
        const blended = pf + (q - pf) * w;
        const v = Math.round(blended * 255);
        out[i] = v <= 0 ? 0 : v >= 255 ? 255 : v;
      }
    }
    return out;
  }

  const wxLut = buildBilinearLUT(workW, fullW);
  const wyLut = buildBilinearLUT(workH, fullH);
  const pxLut = buildBilinearLUT(lowW, fullW);
  const pyLut = buildBilinearLUT(lowH, fullH);

  for (let y = 0; y < fullH; y++) {
    const wr0 = wyLut.i0[y] * workW;
    const wr1 = wyLut.i1[y] * workW;
    const wfy = wyLut.frac[y];
    const wInvFy = 1 - wfy;

    const pr0 = pyLut.i0[y] * lowW;
    const pr1 = pyLut.i1[y] * lowW;
    const pfy = pyLut.frac[y];

    const outRow = y * fullW;

    for (let x = 0; x < fullW; x++) {
      const wx0 = wxLut.i0[x];
      const wx1 = wxLut.i1[x];
      const wfx = wxLut.frac[x];
      const wInvFx = 1 - wfx;

      const idx00 = wr0 + wx0;
      const idx10 = wr0 + wx1;
      const idx01 = wr1 + wx0;
      const idx11 = wr1 + wx1;

      const mp =
        (meanP[idx00] * wInvFx + meanP[idx10] * wfx) * wInvFy +
        (meanP[idx01] * wInvFx + meanP[idx11] * wfx) * wfy;

      const px0 = pxLut.i0[x];
      const px1 = pxLut.i1[x];
      const pfx = pxLut.frac[x];
      const pTop = lowMask[pr0 + px0] + (lowMask[pr0 + px1] - lowMask[pr0 + px0]) * pfx;
      const pBot = lowMask[pr1 + px0] + (lowMask[pr1 + px1] - lowMask[pr1 + px0]) * pfx;
      const pf = (pTop + (pBot - pTop) * pfy) * inv255;

      const outIdx = outRow + x;
      if (pf <= 0.002) {
        out[outIdx] = 0;
        continue;
      }
      if (pf >= 0.998) {
        out[outIdx] = 255;
        continue;
      }

      let w = 1;
      if (mp < 0.04) w = mp > 0.005 ? (mp - 0.005) / 0.035 : 0;
      else if (mp > 0.96) w = mp < 0.995 ? (0.995 - mp) / 0.035 : 0;

      const ma =
        (meanA[idx00] * wInvFx + meanA[idx10] * wfx) * wInvFy +
        (meanA[idx01] * wInvFx + meanA[idx11] * wfx) * wfy;
      const mb =
        (meanB[idx00] * wInvFx + meanB[idx10] * wfx) * wInvFy +
        (meanB[idx01] * wInvFx + meanB[idx11] * wfx) * wfy;

      const p = outIdx << 2;
      const luma =
        guideRgba[p] * LUMA_R +
        guideRgba[p + 1] * LUMA_G +
        guideRgba[p + 2] * LUMA_B;
      const q = ma * luma + mb;
      const blended = pf + (q - pf) * w;
      const v = Math.round(blended * 255);
      out[outIdx] = v <= 0 ? 0 : v >= 255 ? 255 : v;
    }
  }

  return out;
}

type ColorField = {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
};

/**
 * Multi-scale blur-fusion color field estimator.
 * Prioritizes high-confidence pure pixels across fine-to-coarse radii so clean foreground/background
 * colors propagate smoothly across soft transition bands without edge contamination, with graceful
 * multi-tier fallbacks when high-confidence pixels are scarce.
 */
function estimateColorField(
  srcR: Float32Array,
  srcG: Float32Array,
  srcB: Float32Array,
  workAlpha: Float32Array,
  needEval: Uint8Array | null,
  workW: number,
  workH: number,
  isForeground: boolean,
  radii: number[],
  scratch: {
    wR: Float32Array;
    wG: Float32Array;
    wB: Float32Array;
    wW: Float32Array;
    bR: Float32Array;
    bG: Float32Array;
    bB: Float32Array;
    bW: Float32Array;
    t0: Float32Array;
    t1: Float32Array;
    t2: Float32Array;
    t3: Float32Array;
    p0: Float64Array;
    p1: Float64Array;
    p2: Float64Array;
    p3: Float64Array;
    c0: Float64Array;
    c1: Float64Array;
    c2: Float64Array;
    c3: Float64Array;
  }
): ColorField {
  const n = workW * workH;
  const accR = new Float32Array(n);
  const accG = new Float32Array(n);
  const accB = new Float32Array(n);
  const accW = new Float32Array(n);

  const { wR, wG, wB, wW, bR, bG, bB, bW, t0, t1, t2, t3, p0, p1, p2, p3, c0, c1, c2, c3 } = scratch;

  const measureMinW = (): number => {
    let minW = 1;
    if (needEval) {
      for (let i = 0; i < n; i++) {
        if (needEval[i] && accW[i] < minW) minW = accW[i];
      }
    } else {
      for (let i = 0; i < n; i++) {
        if (accW[i] < minW) minW = accW[i];
      }
    }
    return minW;
  };

  const runTier = (
    tierRadii: number[],
    weightFn: (a: number) => number,
    confThreshold: number
  ): { minAccW: number; globalR: number; globalG: number; globalB: number; globalW: number } => {
    let gR = 0;
    let gG = 0;
    let gB = 0;
    let gW = 0;
    for (let i = 0; i < n; i++) {
      const w = weightFn(workAlpha[i]);
      wW[i] = w;
      if (w > 0) {
        const r = srcR[i] * w;
        const g = srcG[i] * w;
        const b = srcB[i] * w;
        wR[i] = r;
        wG[i] = g;
        wB[i] = b;
        gR += r;
        gG += g;
        gB += b;
        gW += w;
      } else {
        wR[i] = 0;
        wG[i] = 0;
        wB[i] = 0;
      }
    }

    if (gW <= 1e-6) {
      return { minAccW: measureMinW(), globalR: 0, globalG: 0, globalB: 0, globalW: 0 };
    }

    for (let s = 0; s < tierRadii.length; s++) {
      boxFilter4(
        wR, wG, wB, wW,
        bR, bG, bB, bW,
        workW, workH, tierRadii[s],
        t0, t1, t2, t3,
        p0, p1, p2, p3,
        c0, c1, c2, c3
      );

      for (let i = 0; i < n; i++) {
        const curW = accW[i];
        if (curW >= 0.999) continue;
        const bw = bW[i];
        if (bw > 1e-6) {
          const conf = bw >= confThreshold ? 1 : bw / confThreshold;
          const add = (1 - curW) * conf;
          const invBw = 1 / bw;
          accR[i] += bR[i] * invBw * add;
          accG[i] += bG[i] * invBw * add;
          accB[i] += bB[i] * invBw * add;
          accW[i] = curW + add;
        }
      }

      const minW = measureMinW();
      if (minW >= 0.99) {
        return { minAccW: minW, globalR: gR, globalG: gG, globalB: gB, globalW: gW };
      }
    }

    return { minAccW: measureMinW(), globalR: gR, globalG: gG, globalB: gB, globalW: gW };
  };

  // Tier 1: pure high-confidence interior/background pixels (prevents transition spill from entering F_est/B_est)
  let fallbackR = 0;
  let fallbackG = 0;
  let fallbackB = 0;
  let fallbackW = 0;

  const t1Res = runTier(
    radii,
    isForeground
      ? (a) => (a >= 0.92 ? a * a : 0)
      : (a) => (a <= 0.08 ? (1 - a) * (1 - a) : 0),
    0.04
  );
  if (t1Res.globalW > 0) {
    fallbackR = t1Res.globalR / t1Res.globalW;
    fallbackG = t1Res.globalG / t1Res.globalW;
    fallbackB = t1Res.globalB / t1Res.globalW;
    fallbackW = t1Res.globalW;
  }

  // Tier 2: medium-confidence fallback (a > 0.5 or a < 0.5) if any region still lacks coverage
  const coarseRadii = radii.length > 1 ? radii.slice(1) : radii;
  if (t1Res.minAccW < 0.95) {
    const t2Res = runTier(
      coarseRadii,
      isForeground
        ? (a) => (a > 0.5 ? a * a : 0)
        : (a) => (a < 0.5 ? (1 - a) * (1 - a) : 0),
      0.04
    );
    if (fallbackW === 0 && t2Res.globalW > 0) {
      fallbackR = t2Res.globalR / t2Res.globalW;
      fallbackG = t2Res.globalG / t2Res.globalW;
      fallbackB = t2Res.globalB / t2Res.globalW;
      fallbackW = t2Res.globalW;
    }

    // Tier 3: soft fallback (a^2 or (1-a)^2) when half-plane pixels are scarce everywhere
    if (t2Res.minAccW < 0.5) {
      const lastRadius = [radii[radii.length - 1]];
      const t3Res = runTier(
        lastRadius,
        isForeground ? (a) => a * a : (a) => (1 - a) * (1 - a),
        0.02
      );
      if (fallbackW === 0 && t3Res.globalW > 0) {
        fallbackR = t3Res.globalR / t3Res.globalW;
        fallbackG = t3Res.globalG / t3Res.globalW;
        fallbackB = t3Res.globalB / t3Res.globalW;
        fallbackW = t3Res.globalW;
      }
    }
  }

  // Normalize accumulated color field, falling back to global mean or pixel's own RGB
  for (let i = 0; i < n; i++) {
    const w = accW[i];
    if (w >= 0.999) {
      continue;
    }
    if (w > 1e-6) {
      const invW = 1 / w;
      accR[i] *= invW;
      accG[i] *= invW;
      accB[i] *= invW;
    } else if (fallbackW > 0) {
      accR[i] = fallbackR;
      accG[i] = fallbackG;
      accB[i] = fallbackB;
    } else {
      accR[i] = srcR[i];
      accG[i] = srcG[i];
      accB[i] = srcB[i];
    }
  }

  return { r: accR, g: accG, b: accB };
}

/**
 * Multi-Scale Blur-Fusion Foreground Color Decontamination (Defringing).
 *
 * Eliminates background color spill along semi-transparent edges (hair, fur, anti-aliased silhouettes)
 * while leaving solid interior (`alpha >= 254`) and pure background (`alpha === 0`) pixels
 * bit-for-bit identical to the input so manual Restore brush edits remain accurate.
 */
export function decontaminateForeground(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { strength?: number; workMaxSide?: number }
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (width <= 0 || height <= 0) return out;

  const rawStrength = options?.strength;
  const strength = Math.max(
    0,
    Math.min(1, rawStrength !== undefined && Number.isFinite(rawStrength) ? rawStrength : 0.9)
  );
  if (strength <= 0) return out;

  const n = width * height;
  if (rgba.length < n * 4 || alpha.length < n) return out;

  // Fast-path: skip if there are no pixels in the semi-transparent transition band [1, 253]
  let hasEdgeBand = false;
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a >= 1 && a <= 253) {
      hasEdgeBand = true;
      break;
    }
  }
  if (!hasEdgeBand) return out;

  // Working resolution preserving aspect ratio (memory-safe up to 16MP+)
  const rawWorkMax = options?.workMaxSide;
  const workMaxSide = Math.max(
    1,
    Math.floor(rawWorkMax !== undefined && Number.isFinite(rawWorkMax) ? rawWorkMax : 512)
  );
  const maxDim = Math.max(width, height);
  const workScale = maxDim > workMaxSide ? workMaxSide / maxDim : 1;
  const workW = Math.max(1, Math.min(width, Math.round(width * workScale)));
  const workH = Math.max(1, Math.min(height, Math.round(height * workScale)));
  const workN = workW * workH;
  const sameAsFull = workW === width && workH === height;

  const srcR = new Float32Array(workN);
  const srcG = new Float32Array(workN);
  const srcB = new Float32Array(workN);
  const workA = new Float32Array(workN);
  const inv255 = 1 / 255;

  if (sameAsFull) {
    for (let i = 0, j = 0; i < workN; i++, j += 4) {
      srcR[i] = rgba[j];
      srcG[i] = rgba[j + 1];
      srcB[i] = rgba[j + 2];
      workA[i] = alpha[i] * inv255;
    }
  } else {
    // Center-aligned nearest sampling preserves unblended true foreground/background pixels
    const sx = new Int32Array(workW);
    for (let x = 0; x < workW; x++) {
      sx[x] = Math.min(width - 1, Math.floor(((x + 0.5) * width) / workW));
    }
    for (let y = 0; y < workH; y++) {
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / workH));
      const sRow = sy * width;
      const wRow = y * workW;
      for (let x = 0; x < workW; x++) {
        const sIdx = sRow + sx[x];
        const p = sIdx << 2;
        const wIdx = wRow + x;
        srcR[wIdx] = rgba[p];
        srcG[wIdx] = rgba[p + 1];
        srcB[wIdx] = rgba[p + 2];
        workA[wIdx] = alpha[sIdx] * inv255;
      }
    }
  }

  // Deduplicated multi-scale blur radii bounded to working image dimensions
  const maxWork = Math.max(workW, workH);
  const rawRadii = [3, 9, 24];
  const radii: number[] = [];
  for (let i = 0; i < rawRadii.length; i++) {
    const clamped = Math.max(1, Math.min(rawRadii[i], Math.max(1, maxWork - 1)));
    if (radii.length === 0 || radii[radii.length - 1] !== clamped) {
      radii.push(clamped);
    }
  }

  const scratch = {
    wR: new Float32Array(workN),
    wG: new Float32Array(workN),
    wB: new Float32Array(workN),
    wW: new Float32Array(workN),
    bR: new Float32Array(workN),
    bG: new Float32Array(workN),
    bB: new Float32Array(workN),
    bW: new Float32Array(workN),
    t0: new Float32Array(workN),
    t1: new Float32Array(workN),
    t2: new Float32Array(workN),
    t3: new Float32Array(workN),
    p0: new Float64Array(workW + 1),
    p1: new Float64Array(workW + 1),
    p2: new Float64Array(workW + 1),
    p3: new Float64Array(workW + 1),
    c0: new Float64Array(workW),
    c1: new Float64Array(workW),
    c2: new Float64Array(workW),
    c3: new Float64Array(workW),
  };

  // Mark working pixels around alpha transitions so early-exit checks only evaluate
  // pixels that can actually be read during transition-band unmixing.
  const needBuf = new Uint8Array(workN);
  let needCount = 0;
  for (let y = 0; y < workH; y++) {
    const row = y * workW;
    for (let x = 0; x < workW; x++) {
      const idx = row + x;
      const a = workA[idx];
      if (a > 0.002 && a < 0.998) {
        if (!needBuf[idx]) { needBuf[idx] = 1; needCount++; }
        if (x > 0 && !needBuf[idx - 1]) { needBuf[idx - 1] = 1; needCount++; }
        if (x + 1 < workW && !needBuf[idx + 1]) { needBuf[idx + 1] = 1; needCount++; }
        if (y > 0 && !needBuf[idx - workW]) { needBuf[idx - workW] = 1; needCount++; }
        if (y + 1 < workH && !needBuf[idx + workW]) { needBuf[idx + workW] = 1; needCount++; }
      } else {
        if (x + 1 < workW && Math.abs(a - workA[idx + 1]) > 0.01) {
          if (!needBuf[idx]) { needBuf[idx] = 1; needCount++; }
          if (!needBuf[idx + 1]) { needBuf[idx + 1] = 1; needCount++; }
        }
        if (y + 1 < workH && Math.abs(a - workA[idx + workW]) > 0.01) {
          if (!needBuf[idx]) { needBuf[idx] = 1; needCount++; }
          if (!needBuf[idx + workW]) { needBuf[idx + workW] = 1; needCount++; }
        }
      }
    }
  }
  const needEval = needCount > 0 ? needBuf : null;

  const fg = estimateColorField(srcR, srcG, srcB, workA, needEval, workW, workH, true, radii, scratch);
  const bg = estimateColorField(srcR, srcG, srcB, workA, needEval, workW, workH, false, radii, scratch);

  const LAMBDA = 0.06;

  if (sameAsFull) {
    for (let i = 0; i < n; i++) {
      const aByte = alpha[i];
      if (aByte === 0 || aByte >= 254) continue;

      const a = aByte * inv255;
      const invA = 1 - a;
      const invDenom = 1 / (a * a + LAMBDA);
      const taper = a > 0.85 ? invA / 0.15 : 1;
      const mix = strength * taper;
      const invMix = 1 - mix;
      const p = i << 2;

      const origR = rgba[p];
      const origG = rgba[p + 1];
      const origB = rgba[p + 2];

      let uR = (a * (origR - invA * bg.r[i]) + LAMBDA * fg.r[i]) * invDenom;
      let uG = (a * (origG - invA * bg.g[i]) + LAMBDA * fg.g[i]) * invDenom;
      let uB = (a * (origB - invA * bg.b[i]) + LAMBDA * fg.b[i]) * invDenom;

      if (uR < 0) uR = 0; else if (uR > 255) uR = 255;
      if (uG < 0) uG = 0; else if (uG > 255) uG = 255;
      if (uB < 0) uB = 0; else if (uB > 255) uB = 255;

      out[p] = Math.round(origR * invMix + uR * mix);
      out[p + 1] = Math.round(origG * invMix + uG * mix);
      out[p + 2] = Math.round(origB * invMix + uB * mix);
    }
    return out;
  }

  const xLut = buildBilinearLUT(workW, width);
  const yLut = buildBilinearLUT(workH, height);

  for (let y = 0; y < height; y++) {
    const wr0 = yLut.i0[y] * workW;
    const wr1 = yLut.i1[y] * workW;
    const fy = yLut.frac[y];
    const invFy = 1 - fy;
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const i = row + x;
      const aByte = alpha[i];
      if (aByte === 0 || aByte >= 254) continue;

      const x0 = xLut.i0[x];
      const x1 = xLut.i1[x];
      const fx = xLut.frac[x];
      const invFx = 1 - fx;

      const w00 = invFx * invFy;
      const w10 = fx * invFy;
      const w01 = invFx * fy;
      const w11 = fx * fy;

      const idx00 = wr0 + x0;
      const idx10 = wr0 + x1;
      const idx01 = wr1 + x0;
      const idx11 = wr1 + x1;

      const fR = fg.r[idx00] * w00 + fg.r[idx10] * w10 + fg.r[idx01] * w01 + fg.r[idx11] * w11;
      const fG = fg.g[idx00] * w00 + fg.g[idx10] * w10 + fg.g[idx01] * w01 + fg.g[idx11] * w11;
      const fB = fg.b[idx00] * w00 + fg.b[idx10] * w10 + fg.b[idx01] * w01 + fg.b[idx11] * w11;

      const bR = bg.r[idx00] * w00 + bg.r[idx10] * w10 + bg.r[idx01] * w01 + bg.r[idx11] * w11;
      const bG = bg.g[idx00] * w00 + bg.g[idx10] * w10 + bg.g[idx01] * w01 + bg.g[idx11] * w11;
      const bB = bg.b[idx00] * w00 + bg.b[idx10] * w10 + bg.b[idx01] * w01 + bg.b[idx11] * w11;

      const a = aByte * inv255;
      const invA = 1 - a;
      const invDenom = 1 / (a * a + LAMBDA);
      const taper = a > 0.85 ? invA / 0.15 : 1;
      const mix = strength * taper;
      const invMix = 1 - mix;
      const p = i << 2;

      const origR = rgba[p];
      const origG = rgba[p + 1];
      const origB = rgba[p + 2];

      let uR = (a * (origR - invA * bR) + LAMBDA * fR) * invDenom;
      let uG = (a * (origG - invA * bG) + LAMBDA * fG) * invDenom;
      let uB = (a * (origB - invA * bB) + LAMBDA * fB) * invDenom;

      if (uR < 0) uR = 0; else if (uR > 255) uR = 255;
      if (uG < 0) uG = 0; else if (uG > 255) uG = 255;
      if (uB < 0) uB = 0; else if (uB > 255) uB = 255;

      out[p] = Math.round(origR * invMix + uR * mix);
      out[p + 1] = Math.round(origG * invMix + uG * mix);
      out[p + 2] = Math.round(origB * invMix + uB * mix);
    }
  }

  return out;
}
