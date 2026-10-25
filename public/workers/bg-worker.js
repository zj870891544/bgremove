// BGRemove background-removal worker.
// Runs the segmentation model off the main thread so the UI never freezes.
// Loaded as a module worker: new Worker('/workers/bg-worker.js', { type: 'module' })
//
// Protocol
//   main -> worker  { type: 'init', model, version }
//   main -> worker  { type: 'run', id, bitmap }         (bitmap is transferred)
//   worker -> main  { type: 'progress', loaded, total }
//   worker -> main  { type: 'ready', device, dtype }
//   worker -> main  { type: 'result', id, mask, width, height, ms }
//   worker -> main  { type: 'error', id?, message }

const DEFAULT_VERSION = '4.3.1';
const DEFAULT_MODEL = 'onnx-community/BiRefNet_lite-ONNX';
// The model works at 1024x1024 internally; feeding it more pixels only costs time.
const MAX_INPUT_SIDE = 1280;

let segmenterPromise = null;
let tf = null;

async function loadTransformers(version) {
  if (tf) return tf;
  tf = await import(
    `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version}/dist/transformers.min.js`
  );
  tf.env.allowLocalModels = false;
  tf.env.useBrowserCache = true;
  return tf;
}

async function hasWebGPU() {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
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

async function createSegmenter(model, version) {
  const { pipeline } = await loadTransformers(version);
  const progress_callback = makeProgressReporter();
  const gpu = await hasWebGPU();
  const attempts = gpu
    ? [
        { device: 'webgpu', dtype: 'fp16' },
        { device: 'wasm', dtype: 'fp16' },
        { device: 'wasm', dtype: 'fp32' },
      ]
    : [
        { device: 'wasm', dtype: 'fp16' },
        { device: 'wasm', dtype: 'fp32' },
      ];

  let lastError;
  for (const opts of attempts) {
    try {
      const segmenter = await pipeline('background-removal', model, {
        ...opts,
        progress_callback,
      });
      // Warm-up run: compiles shaders / kernels so the first real image is fast,
      // and surfaces unsupported-op errors before we commit to this backend.
      const tiny = new tf.RawImage(new Uint8ClampedArray(64 * 64 * 4).fill(128), 64, 64, 4);
      await segmenter(tiny);
      self.postMessage({ type: 'ready', ...opts });
      return segmenter;
    } catch (err) {
      lastError = err;
      console.warn('[bg-worker] backend failed', opts, err);
    }
  }
  throw lastError || new Error('No inference backend available');
}

function getSegmenter(model, version) {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter(model, version).catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

let config = { model: DEFAULT_MODEL, version: DEFAULT_VERSION };

async function run(id, bitmap) {
  const segmenter = await getSegmenter(config.model, config.version);
  const t0 = performance.now();

  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const { data } = ctx.getImageData(0, 0, width, height);

  const input = new tf.RawImage(data, width, height, 4);
  const output = await segmenter(input);
  const rgba = output.data;
  const channels = output.channels;
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0, j = channels - 1; i < mask.length; i++, j += channels) {
    mask[i] = rgba[j];
  }

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
        model: msg.model || DEFAULT_MODEL,
        version: msg.version || DEFAULT_VERSION,
      };
      await getSegmenter(config.model, config.version);
    } else if (msg.type === 'run') {
      await run(msg.id, msg.bitmap);
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      message: (err && err.message) || String(err),
    });
  }
};
