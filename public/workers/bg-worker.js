// BGRemove background-removal worker.
// Runs the segmentation model off the main thread so the UI never freezes.
// Loaded as a module worker: new Worker('/workers/bg-worker.js', { type: 'module' })
//
// Protocol
//   main -> worker  { type: 'init', device, gpuModel, cpuModel, version, modelHost }
//                   device: 'auto' (try WebGPU) | 'wasm' (CPU only)
//   main -> worker  { type: 'run', id, bitmap }         (bitmap is transferred)
//   worker -> main  { type: 'progress', loaded, total }
//   worker -> main  { type: 'ready', device, dtype, model }
//   worker -> main  { type: 'result', id, mask, width, height, ms }
//   worker -> main  { type: 'error', id?, message, init? }
//
// A failed WebGPU session can leave ONNX Runtime unusable for later sessions in the
// same worker, so when every GPU option fails the main thread starts a fresh worker
// with device 'wasm' instead of retrying here.

const DEFAULTS = {
  version: '4.3.1',
  // Best quality (MIT). Needs WebGPU: far too memory-hungry for the WASM backend.
  gpuModel: 'onnx-community/BiRefNet_lite-ONNX',
  // Lighter ISNet (Apache-2.0), in fp16 for the WASM/CPU backend (int8 visibly hurts edges). Works everywhere.
  cpuModel: 'Ko033/isnet-general-use-onnx',
};

// The models work at 1024x1024 internally; feeding them more pixels only costs time.
const MAX_INPUT_SIDE = 1280;

let tf = null;
let segmenterPromise = null;
let config = { ...DEFAULTS, device: 'auto', modelHost: '' };

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

// BiRefNet has a shader stage that binds 11 storage buffers. Apple GPUs (and some others)
// cap this at 10, so on those we skip the big download and go straight to the CPU model.
const GPU_MIN_STORAGE_BUFFERS = 11;
// A GPU that hangs during the warm-up run is treated as failed so the CPU fallback can take over.
const GPU_WARMUP_TIMEOUT_MS = 45_000;

async function canRunGpuModel() {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter && adapter.limits.maxStorageBuffersPerShaderStage >= GPU_MIN_STORAGE_BUFFERS;
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

async function createSegmenter() {
  const { RawImage } = await loadTransformers();
  const gpu = config.device !== 'wasm' && (await canRunGpuModel());
  // A GPU failure is reported to the main thread, which retries in a clean CPU-only worker.
  const attempts = gpu
    ? [{ model: config.gpuModel, device: 'webgpu', dtype: 'fp16' }]
    : [{ model: config.cpuModel, device: 'wasm', dtype: 'fp16', raw: true }];

  let lastError;
  for (const opts of attempts) {
    try {
      const segment = opts.raw ? await loadRaw(opts) : await loadPipeline(opts);
      // Warm-up run: compiles shaders / kernels so the first real image is fast,
      // and surfaces unsupported-op errors before we commit to this backend.
      const warm = segment(new RawImage(new Uint8ClampedArray(64 * 64 * 4).fill(128), 64, 64, 4));
      await (opts.device === 'webgpu' ? withTimeout(warm, GPU_WARMUP_TIMEOUT_MS, 'GPU warm-up timed out') : warm);
      self.postMessage({ type: 'ready', device: opts.device, dtype: opts.dtype, model: opts.model });
      return segment;
    } catch (err) {
      lastError = err;
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
 * Plain ONNX segmentation models without a pipeline (ISNet): run the session directly,
 * then min-max normalise the probability map (as rembg does) and resize it to the input.
 */
async function loadRaw(opts) {
  const progress_callback = makeProgressReporter();
  const model = await tf.AutoModel.from_pretrained(opts.model, {
    device: opts.device,
    dtype: opts.dtype,
    config: { model_type: 'custom' },
    progress_callback,
  });
  const processor = await tf.AutoProcessor.from_pretrained(opts.model, { progress_callback });
  return async (image) => {
    const { pixel_values } = await processor(image);
    const outputs = await model({ input_image: pixel_values });
    let t = outputs[Object.keys(outputs)[0]];
    if (t.type !== 'float32') t = t.to('float32');
    const [h, w] = t.dims.slice(-2);
    const src = t.data;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < src.length; i++) {
      if (src[i] < min) min = src[i];
      if (src[i] > max) max = src[i];
    }
    const k = max > min ? 255 / (max - min) : 255;
    const small = new Uint8ClampedArray(w * h);
    for (let i = 0; i < small.length; i++) small[i] = (src[i] - min) * k;
    const resized = await new tf.RawImage(small, w, h, 1).resize(image.width, image.height);
    return resized.data;
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

async function run(id, bitmap) {
  const segmenter = await getSegmenter();
  const t0 = performance.now();

  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, width, height);

  const mask = await segmenter(new tf.RawImage(data, width, height, 4));

  self.postMessage(
    { type: 'result', id, mask, width, height, ms: Math.round(performance.now() - t0) },
    [mask.buffer]
  );
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      config = {
        version: msg.version || DEFAULTS.version,
        gpuModel: msg.gpuModel || DEFAULTS.gpuModel,
        cpuModel: msg.cpuModel || DEFAULTS.cpuModel,
        device: msg.device || 'auto',
        modelHost: msg.modelHost || '',
      };
      try {
        await getSegmenter();
      } catch (err) {
        self.postMessage({ type: 'error', init: true, message: (err && err.message) || String(err) });
      }
    } else if (msg.type === 'run') {
      await run(msg.id, msg.bitmap);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: (err && err.message) || String(err) });
  }
};
