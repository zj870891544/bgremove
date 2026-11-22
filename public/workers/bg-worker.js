// BGRemove background-removal worker.
// Runs the segmentation model off the main thread so the UI never freezes.
// Loaded as a module worker: new Worker('/workers/bg-worker.js', { type: 'module' })
//
// Protocol
//   main -> worker  { type: 'init', device, gpuModel, cpuModel, model, version, modelHost }
//                   device: 'auto' (try WebGPU, fallback CPU) | 'webgpu' (GPU only) | 'wasm' (CPU only)
//   main -> worker  { type: 'run', id, bitmap, refineCrop? }  (bitmap is transferred)
//   worker -> main  { type: 'progress', loaded, total }
//   worker -> main  { type: 'ready', device, dtype, model }
//   worker -> main  { type: 'result', id, mask, width, height, ms, passes }
//   worker -> main  { type: 'error', id?, message, init?, device?, model? }
//
// A failed WebGPU session can leave ONNX Runtime unusable for later sessions in the
// same worker, so when a backend fails the main thread starts a fresh worker for the
// next tier instead of retrying here.

const DEFAULTS = {
  version: '4.3.1',
  // 1024px WebGPU-compatible BiRefNet-lite (<=7 storage buffers, fp16, MIT).
  gpuModel: 'wonfy/BiRefNet_lite-ONNX-webgpu',
  // 512px BiRefNet-lite keeps foreground selection consistent on CPU/WASM.
  cpuModel: 'studioludens/birefnet-lite-512',
};

// Keep up to 2048px on the worker canvas so 2-stage coarse-to-fine crop refinement
// preserves high-frequency edge detail while single-pass masks stay lean.
const MAX_INPUT_SIDE = 2048;
const PASS2_MIN_INPUT_SIDE = 480;
const PASS2_MAX_WORK_SIDE = 1536;
const PASS2_ALPHA_THRESHOLD = 20;
const PASS2_PAD_RATIO = 0.14;
const PASS2_MIN_PIXEL_GAIN = 1.3;

let tf = null;
let segmenterPromise = null;
let config = { ...DEFAULTS, model: '', device: 'auto', modelHost: '' };

async function loadTransformers() {
  if (tf) return tf;
  tf = await import(
    `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${config.version}/dist/transformers.min.js`
  );
  tf.env.allowLocalModels = false;
  tf.env.useBrowserCache = true;
  if (config.modelHost) tf.env.remoteHost = config.modelHost;
  return tf;
}

// These exports have different graph/output contracts. Unknown overrides retain
// the original transformers.js background-removal pipeline contract.
const RAW_MODELS = {
  'wonfy/BiRefNet_lite-ONNX-webgpu': {
    raw: true,
    logits: true,
    minBuffers: 7,
    // The ONNX file is internally fp16. fp32 here prevents a second filename suffix.
    dtype: 'fp32',
    model_file_name: 'model_fp16',
    reportDtype: 'fp16',
    inputSize: 1024,
  },
  'wonfy/BiRefNet-ONNX-webgpu': {
    raw: true,
    logits: true,
    minBuffers: 7,
    dtype: 'fp32',
    model_file_name: 'model_fp16',
    reportDtype: 'fp16',
    inputSize: 1024,
  },
  'jiabins0303/birefnet-lite-1024-webgpu': {
    raw: true,
    logits: true,
    minBuffers: 8,
    dtype: 'fp32',
    model_file_name: 'model_fp16',
    reportDtype: 'fp16',
    inputSize: 1024,
  },
  'studioludens/birefnet-lite-512': {
    raw: true,
    logits: true,
    minBuffers: 7,
    dtype: 'fp16',
    inputSize: 512,
  },
};
// A GPU that hangs during the warm-up run is treated as failed so the next tier can take over.
const GPU_WARMUP_TIMEOUT_MS = 45_000;

async function canRunGpuModel(minBuffers) {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter && adapter.features.has('shader-f16') &&
      adapter.limits.maxStorageBuffersPerShaderStage >= minBuffers;
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function makeProgressReporter() {
  const files = new Map();
  let last = 0;
  return (p) => {
    if (p.status === 'progress' && p.file) {
      files.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
    } else if (p.status === 'done' && p.file && files.has(p.file)) {
      const f = files.get(p.file);
      files.set(p.file, { loaded: f.total, total: f.total });
    } else {
      return;
    }
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    const now = Date.now();
    if (now - last > 120 || loaded === total) {
      last = now;
      self.postMessage({ type: 'progress', loaded, total });
    }
  };
}

function tagBackendError(err, device, model) {
  const wrapped = err instanceof Error ? err : new Error(String(err));
  wrapped.device = device;
  wrapped.model = model;
  return wrapped;
}

async function createSegmenter() {
  const { RawImage } = await loadTransformers();
  const gpuModelName = config.gpuModel || config.model || DEFAULTS.gpuModel;
  const cpuModelName = config.cpuModel || config.model || DEFAULTS.cpuModel;
  const gpuOptions = {
    model: gpuModelName,
    device: 'webgpu',
    dtype: 'fp16',
    minBuffers: 11,
    inputSize: 1024,
    ...RAW_MODELS[gpuModelName],
  };
  const cpuOptions = {
    model: cpuModelName,
    dtype: 'fp16',
    raw: true,
    inputSize: 1024,
    ...RAW_MODELS[cpuModelName],
    device: 'wasm',
  };

  let attempts;
  if (config.device === 'wasm') {
    attempts = [cpuOptions];
  } else if (config.device === 'webgpu') {
    const gpuOk = await canRunGpuModel(gpuOptions.minBuffers);
    if (!gpuOk) {
      throw tagBackendError(
        new Error('WebGPU adapter does not meet model requirements'),
        'webgpu',
        gpuOptions.model
      );
    }
    attempts = [gpuOptions];
  } else {
    const gpu = await canRunGpuModel(gpuOptions.minBuffers);
    // Failure is reported to the main thread for a clean fallback worker.
    attempts = gpu ? [gpuOptions] : [cpuOptions];
  }

  let lastError;
  for (const opts of attempts) {
    try {
      const segment = opts.raw ? await loadRaw(opts) : await loadPipeline(opts);
      // GPU warm-up compiles shaders and catches unsupported operations. CPU
      // sessions are already compiled at load time; their first run is the image.
      if (opts.device === 'webgpu') {
        const warm = segment(new RawImage(new Uint8ClampedArray(64 * 64 * 4).fill(128), 64, 64, 4));
        await withTimeout(warm, GPU_WARMUP_TIMEOUT_MS, 'GPU warm-up timed out');
      }
      self.postMessage({ type: 'ready', device: opts.device, dtype: opts.reportDtype || opts.dtype, model: opts.model });
      return {
        segment,
        meta: {
          device: opts.device,
          model: opts.model,
          logits: !!opts.logits,
          inputSize: opts.inputSize || 1024,
        },
      };
    } catch (err) {
      lastError = tagBackendError(err, opts.device, opts.model);
      console.warn('[bg-worker] backend failed', opts.model, opts.device, opts.dtype, err);
    }
  }
  throw lastError || new Error('No inference backend available');
}

/** Models with a transformers.js pipeline (BiRefNet). Returns a single-channel mask at input size. */
async function loadPipeline(opts) {
  const seg = await tf.pipeline('background-removal', opts.model, {
    device: opts.device,
    dtype: opts.dtype,
    progress_callback: makeProgressReporter(),
  });
  return async (image) => {
    const out = await seg(image);
    const mask = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0, j = out.channels - 1; i < mask.length; i++, j += out.channels) mask[i] = out.data[j];
    return mask;
  };
}

/**
 * Plain ONNX segmentation models: BiRefNet exports logits (sigmoid), while ISNet
 * exports probabilities (min-max as in rembg). Mixing those contracts destroys alpha.
 */
async function loadRaw(opts) {
  const progress_callback = makeProgressReporter();
  const model = await tf.AutoModel.from_pretrained(opts.model, {
    device: opts.device,
    dtype: opts.dtype,
    ...(opts.logits ? {} : { config: { model_type: 'custom' } }),
    ...(opts.model_file_name ? { model_file_name: opts.model_file_name } : {}),
    progress_callback,
  });
  const processor = await tf.AutoProcessor.from_pretrained(opts.model, { progress_callback });
  return async (image) => {
    const { pixel_values } = await processor(image);
    const tensors = new Set([pixel_values]);
    try {
      const outputs = await model({ input_image: pixel_values });
      Object.values(outputs).forEach((t) => tensors.add(t));
      let t = outputs[Object.keys(outputs)[0]];
      if (t.type !== 'float32') {
        t = t.to('float32');
        tensors.add(t);
      }
      const [h, w] = t.dims.slice(-2);
      const src = t.data;
      const small = new Uint8ClampedArray(w * h);
      if (opts.logits) {
        for (let i = 0; i < small.length; i++) small[i] = 255 / (1 + Math.exp(-src[i]));
      } else {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < src.length; i++) {
          if (src[i] < min) min = src[i];
          if (src[i] > max) max = src[i];
        }
        const k = max > min ? 255 / (max - min) : 255;
        for (let i = 0; i < small.length; i++) small[i] = (src[i] - min) * k;
      }
      if (w === image.width && h === image.height) return small;
      return (await new tf.RawImage(small, w, h, 1).resize(image.width, image.height)).data;
    } finally {
      // Inference reuses a session across a batch; release its per-image tensors.
      tensors.forEach((t) => t.dispose?.());
    }
  };
}

function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sampleMaskBilinear(mask, w, h, fx, fy) {
  const sx = clamp(fx, 0, w - 1);
  const sy = clamp(fy, 0, h - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = sx - x0;
  const ty = sy - y0;
  const row0 = y0 * w;
  const row1 = y1 * w;
  const top = mask[row0 + x0] * (1 - tx) + mask[row0 + x1] * tx;
  const bot = mask[row1 + x0] * (1 - tx) + mask[row1 + x1] * tx;
  return top * (1 - ty) + bot * ty;
}

function cosineFeather(t) {
  const c = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}

/**
 * Inspect Pass-1 mask to decide whether a zoomed Pass-2 crop will add real detail.
 * Returns crop coordinates in both mask and source-canvas space, or null to skip.
 */
function planCropRefinement(pass1Mask, maskW, maskH, srcW, srcH) {
  const total = maskW * maskH;
  if (total === 0) return null;

  let fgCount = 0;
  let minX = maskW;
  let minY = maskH;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < maskH; y++) {
    const row = y * maskW;
    for (let x = 0; x < maskW; x++) {
      if (pass1Mask[row + x] >= PASS2_ALPHA_THRESHOLD) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (fgCount === 0 || maxX < minX || maxY < minY) return null;
  const fgRatio = fgCount / total;
  if (!(fgRatio > 0.004 && fgRatio < 0.95)) return null;

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const bboxAreaRatio = (bboxW * bboxH) / total;
  const aspect = Math.max(srcW / srcH, srcH / srcW);
  if (!(bboxAreaRatio < 0.55 || aspect > 1.45)) return null;

  const padX = Math.max(2, Math.round(bboxW * PASS2_PAD_RATIO));
  const padY = Math.max(2, Math.round(bboxH * PASS2_PAD_RATIO));
  const mX0 = Math.max(0, minX - padX);
  const mY0 = Math.max(0, minY - padY);
  const mX1 = Math.min(maskW, maxX + 1 + padX);
  const mY1 = Math.min(maskH, maxY + 1 + padY);
  const paddedMaskCropW = mX1 - mX0;
  const paddedMaskCropH = mY1 - mY0;

  // Skip when the padded crop essentially spans the full source image on both axes.
  if (paddedMaskCropW >= maskW * 0.95 && paddedMaskCropH >= maskH * 0.95) return null;

  const srcX0 = Math.max(0, Math.floor((mX0 / maskW) * srcW));
  const srcY0 = Math.max(0, Math.floor((mY0 / maskH) * srcH));
  const srcX1 = Math.min(srcW, Math.ceil((mX1 / maskW) * srcW));
  const srcY1 = Math.min(srcH, Math.ceil((mY1 / maskH) * srcH));
  const srcCropW = srcX1 - srcX0;
  const srcCropH = srcY1 - srcY0;
  if (srcCropW < 2 || srcCropH < 2) return null;

  const cropPixelGain = Math.max(srcCropW, srcCropH) / Math.max(1, Math.max(paddedMaskCropW, paddedMaskCropH));
  if (cropPixelGain < PASS2_MIN_PIXEL_GAIN) return null;

  return { srcX0, srcY0, srcX1, srcY1, srcCropW, srcCropH };
}

/**
 * Composite Pass-2 crop mask over Pass-1 mask at working resolution with cosine
 * feathering along interior crop edges only (never feathering along image borders).
 */
function compositeRefinedMask(pass1Mask, maskW, maskH, pass2Mask, cropInW, cropInH, srcW, srcH, plan) {
  const outMax = Math.min(PASS2_MAX_WORK_SIDE, Math.max(srcW, srcH));
  const outScale = outMax / Math.max(srcW, srcH);
  const outW = Math.max(1, Math.round(srcW * outScale));
  const outH = Math.max(1, Math.round(srcH * outScale));

  const outMask = new Uint8ClampedArray(outW * outH);
  if (maskW === outW && maskH === outH) {
    outMask.set(pass1Mask);
  } else {
    const scaleX = maskW / outW;
    const scaleY = maskH / outH;
    for (let y = 0; y < outH; y++) {
      const fy = (y + 0.5) * scaleY - 0.5;
      const row = y * outW;
      for (let x = 0; x < outW; x++) {
        const fx = (x + 0.5) * scaleX - 0.5;
        outMask[row + x] = Math.round(sampleMaskBilinear(pass1Mask, maskW, maskH, fx, fy));
      }
    }
  }

  const dstX0 = clamp(Math.round((plan.srcX0 / srcW) * outW), 0, outW);
  const dstY0 = clamp(Math.round((plan.srcY0 / srcH) * outH), 0, outH);
  const dstX1 = clamp(Math.round((plan.srcX1 / srcW) * outW), dstX0, outW);
  const dstY1 = clamp(Math.round((plan.srcY1 / srcH) * outH), dstY0, outH);
  const dstCropW = dstX1 - dstX0;
  const dstCropH = dstY1 - dstY0;
  if (dstCropW < 2 || dstCropH < 2) {
    return { mask: outMask, width: outW, height: outH };
  }

  const maxHFeather = Math.floor(dstCropW / 3);
  const maxVFeather = Math.floor(dstCropH / 3);
  const rawHFeather = clamp(Math.round(dstCropW * 0.08), 8, 24);
  const rawVFeather = clamp(Math.round(dstCropH * 0.08), 8, 24);
  const featherLeft = dstX0 > 0 ? Math.min(rawHFeather, maxHFeather) : 0;
  const featherRight = dstX1 < outW ? Math.min(rawHFeather, maxHFeather) : 0;
  const featherTop = dstY0 > 0 ? Math.min(rawVFeather, maxVFeather) : 0;
  const featherBottom = dstY1 < outH ? Math.min(rawVFeather, maxVFeather) : 0;

  const cropScaleX = cropInW / dstCropW;
  const cropScaleY = cropInH / dstCropH;

  for (let ly = 0; ly < dstCropH; ly++) {
    let wy = 1;
    if (featherTop > 0 && ly < featherTop) {
      wy = Math.min(wy, cosineFeather((ly + 0.5) / featherTop));
    }
    if (featherBottom > 0 && dstCropH - 1 - ly < featherBottom) {
      wy = Math.min(wy, cosineFeather((dstCropH - 0.5 - ly) / featherBottom));
    }
    const fy = (ly + 0.5) * cropScaleY - 0.5;
    const outRow = (dstY0 + ly) * outW;
    for (let lx = 0; lx < dstCropW; lx++) {
      let wx = 1;
      if (featherLeft > 0 && lx < featherLeft) {
        wx = Math.min(wx, cosineFeather((lx + 0.5) / featherLeft));
      }
      if (featherRight > 0 && dstCropW - 1 - lx < featherRight) {
        wx = Math.min(wx, cosineFeather((dstCropW - 0.5 - lx) / featherRight));
      }
      const w = wx * wy;
      const fx = (lx + 0.5) * cropScaleX - 0.5;
      const p2 = sampleMaskBilinear(pass2Mask, cropInW, cropInH, fx, fy);
      const idx = outRow + dstX0 + lx;
      if (w >= 1) {
        outMask[idx] = Math.round(p2);
      } else {
        outMask[idx] = Math.round(outMask[idx] * (1 - w) + p2 * w);
      }
    }
  }

  return { mask: outMask, width: outW, height: outH };
}

function toTransferableMask(mask) {
  if (
    mask instanceof Uint8ClampedArray &&
    mask.byteOffset === 0 &&
    mask.byteLength === mask.buffer.byteLength
  ) {
    return mask;
  }
  return new Uint8ClampedArray(mask);
}

async function run(id, bitmap, opts = {}) {
  let canvas = null;
  try {
    const { segment, meta } = await getSegmenter();
    const t0 = performance.now();

    const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const modelInputSize = meta.inputSize || 1024;
    const pass1Max = Math.min(Math.max(width, height), modelInputSize);
    const pass1Scale = pass1Max / Math.max(width, height);
    const pass1W = Math.max(1, Math.round(width * pass1Scale));
    const pass1H = Math.max(1, Math.round(height * pass1Scale));

    let pass1Rgba;
    if (pass1W === width && pass1H === height) {
      pass1Rgba = ctx.getImageData(0, 0, width, height).data;
    } else {
      const pass1Canvas = new OffscreenCanvas(pass1W, pass1H);
      try {
        const pass1Ctx = pass1Canvas.getContext('2d', { willReadFrequently: true });
        pass1Ctx.drawImage(canvas, 0, 0, width, height, 0, 0, pass1W, pass1H);
        pass1Rgba = pass1Ctx.getImageData(0, 0, pass1W, pass1H).data;
      } finally {
        pass1Canvas.width = 0;
        pass1Canvas.height = 0;
      }
    }

    const pass1Mask = await segment(new tf.RawImage(pass1Rgba, pass1W, pass1H, 4));

    let outMask = pass1Mask;
    let outW = pass1W;
    let outH = pass1H;
    let passes = 1;

    const shouldConsiderRefine =
      opts.refineCrop !== false &&
      meta.logits &&
      Math.max(width, height) >= PASS2_MIN_INPUT_SIDE;

    if (shouldConsiderRefine) {
      const plan = planCropRefinement(pass1Mask, pass1W, pass1H, width, height);
      if (plan) {
        const cropScale = Math.min(1, PASS2_MAX_WORK_SIDE / Math.max(plan.srcCropW, plan.srcCropH));
        const cropInW = Math.max(1, Math.round(plan.srcCropW * cropScale));
        const cropInH = Math.max(1, Math.round(plan.srcCropH * cropScale));
        let cropRgba;
        const cropCanvas = new OffscreenCanvas(cropInW, cropInH);
        try {
          const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
          cropCtx.drawImage(
            canvas,
            plan.srcX0,
            plan.srcY0,
            plan.srcCropW,
            plan.srcCropH,
            0,
            0,
            cropInW,
            cropInH
          );
          cropRgba = cropCtx.getImageData(0, 0, cropInW, cropInH).data;
        } finally {
          cropCanvas.width = 0;
          cropCanvas.height = 0;
        }

        const pass2Mask = await segment(new tf.RawImage(cropRgba, cropInW, cropInH, 4));
        const composited = compositeRefinedMask(
          pass1Mask,
          pass1W,
          pass1H,
          pass2Mask,
          cropInW,
          cropInH,
          width,
          height,
          plan
        );
        outMask = composited.mask;
        outW = composited.width;
        outH = composited.height;
        passes = 2;
      }
    }

    const transferable = toTransferableMask(outMask);
    self.postMessage(
      {
        type: 'result',
        id,
        mask: transferable,
        width: outW,
        height: outH,
        ms: Math.round(performance.now() - t0),
        passes,
      },
      [transferable.buffer]
    );
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap?.close?.();
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      config = {
        version: msg.version || DEFAULTS.version,
        gpuModel: msg.gpuModel || msg.model || DEFAULTS.gpuModel,
        cpuModel: msg.cpuModel || msg.model || DEFAULTS.cpuModel,
        model: msg.model || '',
        device: msg.device || 'auto',
        modelHost: msg.modelHost || '',
      };
      try {
        await getSegmenter();
      } catch (err) {
        self.postMessage({
          type: 'error',
          init: true,
          message: (err && err.message) || String(err),
          ...(err && err.device ? { device: err.device } : {}),
          ...(err && err.model ? { model: err.model } : {}),
        });
      }
    } else if (msg.type === 'run') {
      await run(msg.id, msg.bitmap, { refineCrop: msg.refineCrop });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: (err && err.message) || String(err) });
  }
};
