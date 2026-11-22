import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Run the shipped worker, substituting only its CDN import. Model/GPU selection,
// logit conversion, and 2-stage crop refinement remain the production code.
const workerSource = readFileSync(new URL("../public/workers/bg-worker.js", import.meta.url), "utf8");
const workerCode = workerSource.replace(/await import\(\s*`[^`]+`\s*\)/, "await loadFakeTransformers()");
assert.notEqual(workerCode, workerSource, "Expected to replace the worker's runtime import");

const DEFAULT_GPU_MODEL = "wonfy/BiRefNet_lite-ONNX-webgpu";
const ULTRA_GPU_MODEL = "wonfy/BiRefNet-ONNX-webgpu";
const DEFAULT_CPU_MODEL = "studioludens/birefnet-lite-512";
const GPU_MODEL_1024_8BUF = "jiabins0303/birefnet-lite-1024-webgpu";
const ISNET_MODEL = "Ko033/isnet-general-use-onnx";
const LEGACY_GPU_MODEL = "onnx-community/BiRefNet_lite-ONNX";

function createHarness({
  buffers = 10,
  shaderF16 = true,
  hasGpu = true,
  output = [-2, 0, 2, 10],
  outputSequence,
  outputFactory,
  outputType = "float32",
  failModelLoad = false,
  failInference = false,
} = {}) {
  const messages = [];
  const modelLoads = [];
  const pipelineLoads = [];
  const drawCalls = [];
  const canvases = [];
  const inferenceInputs = [];
  let adapterRequests = 0;
  let floatConversions = 0;
  let disposedInputs = 0;
  let disposedOutputs = 0;
  let inferenceCalls = 0;

  class FakeRawImage {
    constructor(data, width, height, channels) {
      Object.assign(this, { data, width, height, channels });
    }

    async resize(width, height) {
      if (width === this.width && height === this.height) return this;
      const out = new Uint8ClampedArray(width * height * this.channels);
      const sx = this.width / width;
      const sy = this.height / height;
      for (let y = 0; y < height; y++) {
        const srcY = Math.min(this.height - 1, Math.floor((y + 0.5) * sy));
        for (let x = 0; x < width; x++) {
          const srcX = Math.min(this.width - 1, Math.floor((x + 0.5) * sx));
          const dstIdx = (y * width + x) * this.channels;
          const srcIdx = (srcY * this.width + srcX) * this.channels;
          for (let c = 0; c < this.channels; c++) {
            out[dstIdx + c] = this.data[srcIdx + c];
          }
        }
      }
      return new FakeRawImage(out, width, height, this.channels);
    }
  }

  const transformers = {
    env: {},
    RawImage: FakeRawImage,
    AutoModel: {
      async from_pretrained(model, options) {
        modelLoads.push({ model, options });
        if (failModelLoad) throw new Error("GPU model failed to load");
        return async ({ input_image }) => {
          assert.equal(input_image.channels, 4);
          inferenceInputs.push({ width: input_image.width, height: input_image.height });
          const callIndex = inferenceCalls++;
          if (failInference) throw new Error("GPU inference failed");

          let dims = [1, 1, 2, 2];
          let data;
          if (outputFactory) {
            const produced = outputFactory(input_image, callIndex);
            dims = produced.dims;
            data = produced.data instanceof Float32Array ? produced.data : new Float32Array(produced.data);
          } else {
            const values = outputSequence ? outputSequence[callIndex] : output;
            assert.ok(values, "Unexpected extra inference consumed the fixture outputs");
            data = values instanceof Float32Array ? values : new Float32Array(values);
          }

          const tensor = {
            type: outputType,
            dims,
            data,
            dispose() { disposedOutputs++; },
            to(type) {
              assert.equal(type, "float32");
              floatConversions++;
              return { ...this, type };
            },
          };
          return { output_image: tensor };
        };
      },
    },
    AutoProcessor: {
      async from_pretrained() {
        return async (image) => {
          image.dispose = () => { disposedInputs++; };
          return { pixel_values: image };
        };
      },
    },
    async pipeline(task, model, options) {
      pipelineLoads.push({ task, model, options });
      return async (image) => {
        const data = new Uint8ClampedArray(image.width * image.height * 4);
        for (let i = 0; i < image.width * image.height; i++) data[i * 4 + 3] = 200;
        return new FakeRawImage(data, image.width, image.height, 4);
      };
    },
  };

  const workerSelf = { postMessage(message) { messages.push(message); } };
  const navigator = hasGpu ? {
    gpu: {
      async requestAdapter() {
        adapterRequests++;
        return {
          limits: { maxStorageBuffersPerShaderStage: buffers },
          features: new Set(shaderF16 ? ["shader-f16"] : []),
        };
      },
    },
  } : {};

  class FakeOffscreenCanvas {
    constructor(width, height) {
      Object.assign(this, { width, height });
      canvases.push(this);
    }
    getContext() {
      return {
        drawImage: (...args) => {
          drawCalls.push({ targetW: this.width, targetH: this.height, args });
        },
        getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(127) }),
      };
    }
  }

  vm.runInNewContext(workerCode, {
    self: workerSelf,
    navigator,
    loadFakeTransformers: async () => transformers,
    Uint8ClampedArray,
    Float32Array,
    OffscreenCanvas: FakeOffscreenCanvas,
    performance: { now: () => 1 },
    console: { warn() {} },
    setTimeout,
    clearTimeout,
  });

  return {
    messages,
    modelLoads,
    pipelineLoads,
    drawCalls,
    canvases,
    inferenceInputs,
    get adapterRequests() { return adapterRequests; },
    get floatConversions() { return floatConversions; },
    get disposedInputs() { return disposedInputs; },
    get disposedOutputs() { return disposedOutputs; },
    get inferenceCalls() { return inferenceCalls; },
    async init(options = {}) {
      await workerSelf.onmessage({ data: { type: "init", ...options } });
      return messages.findLast((message) => message.type === "ready" || message.type === "error");
    },
    async run(id = 7, { width = 2, height = 2, refineCrop } = {}) {
      const bitmap = { width, height, closed: false, close() { this.closed = true; } };
      await workerSelf.onmessage({
        data: { type: "run", id, bitmap, ...(refineCrop === undefined ? {} : { refineCrop }) },
      });
      return { bitmap, message: messages.findLast((message) => message.id === id) };
    },
  };
}

/** Build a logit grid with `insideVal` in [x0, x1) x [y0, y1) and `outsideVal` elsewhere. */
function makeBoxLogits(w, h, { x0, y0, x1, y1, insideVal = 6, outsideVal = -8 }) {
  const data = new Float32Array(w * h);
  data.fill(outsideVal);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      data[y * w + x] = insideVal;
    }
  }
  return { dims: [1, 1, h, w], data };
}

test("Apple's ten-buffer adapter uses default BiRefNet-lite 1024 WebGPU model", async () => {
  const worker = createHarness({ buffers: 10 });
  const ready = await worker.init();

  assert.equal(ready.type, "ready");
  assert.equal(ready.device, "webgpu");
  assert.equal(ready.model, DEFAULT_GPU_MODEL);
  assert.equal(ready.dtype, "fp16");
  assert.equal(worker.pipelineLoads.length, 0);
  assert.equal(worker.modelLoads.length, 1);
  assert.equal(worker.modelLoads[0].options.model_file_name, "model_fp16");
  assert.equal(worker.modelLoads[0].options.dtype, "fp32");
});

test("both wonfy 1024 models and studioludens 512 run at the seven-buffer boundary", async () => {
  for (const [model, expectedDtype, expectedFile] of [
    [DEFAULT_GPU_MODEL, "fp32", "model_fp16"],
    [ULTRA_GPU_MODEL, "fp32", "model_fp16"],
    [DEFAULT_CPU_MODEL, "fp16", undefined],
  ]) {
    const worker = createHarness({ buffers: 7 });
    const ready = await worker.init({ gpuModel: model });

    assert.equal(ready.type, "ready");
    assert.equal(ready.device, "webgpu");
    assert.equal(ready.model, model);
    assert.equal(ready.dtype, "fp16");
    assert.equal(worker.modelLoads[0].options.dtype, expectedDtype);
    assert.equal(worker.modelLoads[0].options.model_file_name, expectedFile);
  }
});

for (const [label, adapter] of [
  ["fewer than seven storage buffers", { buffers: 6 }],
  ["no fp16 shader support", { shaderF16: false }],
  ["no WebGPU", { hasGpu: false }],
]) {
  test(`an adapter with ${label} uses the default 512 CPU model`, async () => {
    const worker = createHarness(adapter);
    const ready = await worker.init();

    assert.equal(ready.type, "ready");
    assert.equal(ready.device, "wasm");
    assert.equal(ready.model, DEFAULT_CPU_MODEL);
    assert.equal(worker.modelLoads.length, 1);
    assert.equal(worker.modelLoads[0].options.device, "wasm");
  });
}

test("explicit single-target init supports device:'webgpu' and device:'wasm' with model field", async () => {
  const gpuWorker = createHarness({ buffers: 7 });
  const gpuReady = await gpuWorker.init({ device: "webgpu", model: ULTRA_GPU_MODEL });
  assert.equal(gpuReady.type, "ready");
  assert.equal(gpuReady.device, "webgpu");
  assert.equal(gpuReady.model, ULTRA_GPU_MODEL);

  const limitedGpu = createHarness({ buffers: 6 });
  const gpuErr = await limitedGpu.init({ device: "webgpu", model: ULTRA_GPU_MODEL });
  assert.equal(gpuErr.type, "error");
  assert.equal(gpuErr.init, true);
  assert.equal(gpuErr.device, "webgpu");
  assert.equal(gpuErr.model, ULTRA_GPU_MODEL);

  const cpuWorker = createHarness({ output: [0.2, 0.4, 0.6, 0.8] });
  const cpuReady = await cpuWorker.init({ device: "wasm", model: ISNET_MODEL });
  assert.equal(cpuReady.type, "ready");
  assert.equal(cpuReady.device, "wasm");
  assert.equal(cpuReady.model, ISNET_MODEL);
  assert.equal(cpuWorker.adapterRequests, 0);
  const { message } = await cpuWorker.run();
  assert.deepEqual(Array.from(message.mask), [0, 85, 170, 255]);
});

test("a forced CPU retry does not touch the GPU adapter", async () => {
  const worker = createHarness();
  const ready = await worker.init({ device: "wasm" });

  assert.equal(ready.device, "wasm");
  assert.equal(ready.model, DEFAULT_CPU_MODEL);
  assert.equal(worker.adapterRequests, 0);
});

test("GPU logits become alpha through sigmoid, preserving uncertain pixels", async () => {
  const worker = createHarness({ output: [-Infinity, -2, 0, Infinity], outputType: "float16" });
  await worker.init();
  const { bitmap, message } = await worker.run();

  assert.equal(message.type, "result");
  assert.deepEqual(Array.from(message.mask), [0, 30, 128, 255]);
  assert.equal(message.width, 2);
  assert.equal(message.height, 2);
  assert.equal(message.passes, 1);
  assert.equal(bitmap.closed, true);
  assert.ok(worker.floatConversions >= 1);
  assert.equal(worker.disposedInputs, 2, "Release both warm-up and image input tensors");
  assert.equal(worker.disposedOutputs, 4, "Release both source fp16 and converted fp32 outputs");
});

test("constant zero logits remain half opaque instead of being erased by min-max", async () => {
  const worker = createHarness({ output: [0, 0, 0, 0] });
  await worker.init();
  const { message } = await worker.run();

  assert.deepEqual(Array.from(message.mask), [128, 128, 128, 128]);
  assert.equal(message.passes, 1);
});

test("the default CPU model uses the same BiRefNet sigmoid contract", async () => {
  const worker = createHarness({ output: [-Infinity, -2, 0, Infinity] });
  const ready = await worker.init({ device: "wasm" });
  const { message } = await worker.run();

  assert.equal(ready.model, DEFAULT_CPU_MODEL);
  assert.deepEqual(Array.from(message.mask), [0, 30, 128, 255]);
  assert.equal(message.passes, 1);
});

test("CPU initialization avoids a synthetic warm-up and consecutive real images keep their own outputs", async () => {
  const worker = createHarness({
    outputSequence: [[-Infinity, -2, 0, Infinity], [Infinity, 0, -2, -Infinity]],
  });
  const ready = await worker.init({ device: "wasm" });

  assert.equal(ready.type, "ready");
  assert.equal(worker.inferenceCalls, 0, "CPU initialization must not run a dummy image");
  const first = await worker.run(1);
  const second = await worker.run(2);

  assert.deepEqual(Array.from(first.message.mask), [0, 30, 128, 255]);
  assert.deepEqual(Array.from(second.message.mask), [255, 128, 30, 0]);
  assert.equal(worker.inferenceCalls, 2);
  assert.equal(worker.modelLoads.length, 1, "Reuse the loaded session for a batch");
  assert.equal(worker.disposedInputs, 2);
  assert.equal(worker.disposedOutputs, 2);
  assert.equal(first.bitmap.closed, true);
  assert.equal(second.bitmap.closed, true);
});

test("CPU ISNet retains probability min-max normalization and skips 2-stage crop refinement", async () => {
  const worker = createHarness({
    outputFactory: () => ({
      dims: [1, 1, 2, 2],
      data: new Float32Array([0.2, 0.4, 0.6, 0.8]),
    }),
  });
  await worker.init({ device: "wasm", cpuModel: ISNET_MODEL });
  const small = await worker.run(1);
  assert.deepEqual(Array.from(small.message.mask), [0, 85, 170, 255]);
  assert.equal(small.message.passes, 1);

  const large = await worker.run(2, { width: 1600, height: 1200 });
  assert.equal(large.message.passes, 1);
  assert.equal(large.message.width, 1024);
  assert.equal(large.message.height, 768);
});

test("the optional 8-buffer 1024 GPU graph keeps its minBuffers, fp16 filename, and sigmoid contract", async () => {
  const limited = createHarness({ buffers: 7 });
  const cpuReady = await limited.init({ gpuModel: GPU_MODEL_1024_8BUF });
  assert.equal(cpuReady.device, "wasm");

  const worker = createHarness({ buffers: 8, output: [0, 0, 0, 0] });
  const ready = await worker.init({ gpuModel: GPU_MODEL_1024_8BUF });
  const { message } = await worker.run();

  assert.equal(ready.device, "webgpu");
  assert.equal(ready.model, GPU_MODEL_1024_8BUF);
  assert.equal(ready.dtype, "fp16");
  assert.equal(worker.pipelineLoads.length, 0);
  assert.equal(worker.modelLoads[0].options.model_file_name, "model_fp16");
  assert.equal(worker.modelLoads[0].options.dtype, "fp32");
  assert.deepEqual(Array.from(message.mask), [128, 128, 128, 128]);
});

for (const [label, failure] of [
  ["model loading", { failModelLoad: true }],
  ["warm-up inference", { failInference: true }],
]) {
  test(`GPU ${label} failure reports device/model and asks the main thread to retry in a fresh worker`, async () => {
    const worker = createHarness(failure);
    const result = await worker.init();

    assert.equal(result.type, "error");
    assert.equal(result.init, true);
    assert.equal(result.device, "webgpu");
    assert.equal(result.model, DEFAULT_GPU_MODEL);
    assert.equal(worker.modelLoads.length, 1, "A failed GPU session must not be reused for CPU fallback");
    assert.equal(worker.modelLoads[0].options.device, "webgpu");
    assert.equal(worker.messages.some((message) => message.type === "ready"), false);
    if (failure.failInference) {
      assert.equal(worker.disposedInputs, 1, "Release the input tensor when inference rejects");
    }
  });
}

test("legacy GPU overrides still respect their eleven-buffer requirement", async () => {
  const limited = createHarness({ buffers: 10 });
  const cpuReady = await limited.init({ gpuModel: LEGACY_GPU_MODEL });
  assert.equal(cpuReady.device, "wasm");
  assert.equal(limited.pipelineLoads.length, 0);

  const capable = createHarness({ buffers: 11 });
  const gpuReady = await capable.init({ gpuModel: LEGACY_GPU_MODEL });
  assert.equal(gpuReady.device, "webgpu");
  assert.equal(capable.pipelineLoads.length, 1);
  assert.equal(capable.pipelineLoads[0].task, "background-removal");
  const { message } = await capable.run();
  assert.deepEqual(Array.from(message.mask), [200, 200, 200, 200]);
  assert.equal(message.passes, 1);
});

test("single-pass high-res output stays bounded by modelInputSize without wasteful upscaling", async () => {
  const worker = createHarness({
    outputFactory: () => ({ dims: [1, 1, 2, 2], data: new Float32Array([5, 5, 5, 5]) }),
  });
  await worker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const { message } = await worker.run(10, { width: 2000, height: 1500, refineCrop: false });

  assert.equal(message.type, "result");
  assert.equal(message.passes, 1);
  assert.equal(message.width, 512);
  assert.equal(message.height, 384);
  assert.equal(message.mask.length, 512 * 384);
  assert.equal(worker.inferenceCalls, 1);
});

test("2-stage coarse-to-fine crop refinement triggers on smaller subjects and blends seamlessly", async () => {
  const worker = createHarness({
    outputFactory: (inputImage, callIndex) => {
      if (callIndex === 0) {
        // Pass 1 on 512x384: centered subject (~25% width x 25% height => bboxAreaRatio ~0.0625)
        // Use logit 0 (alpha=128) inside subject and -6 (alpha=1) outside so we can verify blending.
        return makeBoxLogits(inputImage.width, inputImage.height, {
          x0: 192,
          y0: 144,
          x1: 320,
          y1: 240,
          insideVal: 0,
          outsideVal: -6,
        });
      }
      // Pass 2 on zoomed crop: strong foreground logit (alpha ~249) across the whole crop.
      const data = new Float32Array(inputImage.width * inputImage.height).fill(3.8);
      return { dims: [1, 1, inputImage.height, inputImage.width], data };
    },
  });

  await worker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const { bitmap, message } = await worker.run(11, { width: 1600, height: 1200 });

  assert.equal(bitmap.closed, true);
  assert.equal(message.type, "result");
  assert.equal(message.passes, 2);
  assert.equal(message.width, 1536);
  assert.equal(message.height, 1152);
  assert.equal(worker.inferenceCalls, 2);
  assert.equal(worker.disposedInputs, 2);
  assert.equal(worker.disposedOutputs, 2);

  // Far outside the crop remains Pass-1 background (~1).
  assert.ok(message.mask[0] <= 2, `Expected background at corner, got ${message.mask[0]}`);

  // Center of the subject uses full Pass-2 alpha (~249).
  const centerIdx = Math.floor(message.height / 2) * message.width + Math.floor(message.width / 2);
  assert.ok(message.mask[centerIdx] >= 245, `Expected refined Pass-2 alpha at center, got ${message.mask[centerIdx]}`);

  // Along the interior left boundary of the crop (x = dstX0), blending transitions smoothly from Pass-1 (~1)
  // rather than jumping abruptly straight to Pass-2 (~249).
  const cropDraw = worker.drawCalls.find((call) => call.args.length === 9 && call.args[1] > 0);
  assert.ok(cropDraw, "Expected crop extraction drawImage call with non-zero source offset");
  const srcX0 = cropDraw.args[1];
  const dstX0 = Math.round((srcX0 / 1600) * message.width);
  const midY = Math.floor(message.height / 2);
  const justOutside = message.mask[midY * message.width + (dstX0 - 1)];
  const onBoundary = message.mask[midY * message.width + dstX0];
  assert.ok(
    Math.abs(onBoundary - justOutside) < 15,
    `Expected smooth feather across interior crop seam (outside=${justOutside}, boundary=${onBoundary})`
  );
});

test("2-stage crop refinement does NOT feather along image borders, only interior crop edges", async () => {
  const worker = createHarness({
    outputFactory: (inputImage, callIndex) => {
      if (callIndex === 0) {
        // Subject touches top-left image border (x0=0, y0=0), occupying 25% x 25%.
        return makeBoxLogits(inputImage.width, inputImage.height, {
          x0: 0,
          y0: 0,
          x1: 128,
          y1: 96,
          insideVal: 0, // alpha = 128
          outsideVal: -8, // alpha = 0
        });
      }
      // Pass 2 returns alpha ~248 everywhere inside the crop.
      const data = new Float32Array(inputImage.width * inputImage.height).fill(3.5);
      return { dims: [1, 1, inputImage.height, inputImage.width], data };
    },
  });

  await worker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const { message } = await worker.run(12, { width: 1600, height: 1200 });

  assert.equal(message.passes, 2);
  // Top-left pixel (0, 0) lies on both left and top image borders -> NO feathering -> full Pass-2 (~247).
  assert.ok(
    message.mask[0] >= 240,
    `Image-border pixel must not be feathered toward Pass-1 (got ${message.mask[0]})`
  );

  // Interior right edge of the crop IS feathered smoothly toward Pass-1 (~0).
  const cropDraw = worker.drawCalls.find((call) => call.args.length === 9 && call.args[3] < 1600);
  assert.ok(cropDraw);
  const srcX1 = cropDraw.args[1] + cropDraw.args[3];
  const dstX1 = Math.round((srcX1 / 1600) * message.width);
  const rightEdgePixel = message.mask[20 * message.width + (dstX1 - 1)];
  assert.ok(
    rightEdgePixel < 20,
    `Interior right crop edge should feather cleanly toward Pass-1 background (got ${rightEdgePixel})`
  );
});

test("2-stage crop refinement triggers on wide aspect ratios (> 1.45) even when bboxAreaRatio >= 0.55", async () => {
  const worker = createHarness({
    outputFactory: (inputImage, callIndex) => {
      if (callIndex === 0) {
        // 2000x800 => pass1W=512, pass1H=205. Subject is 60% wide x 100% tall (bboxAreaRatio=0.60).
        return makeBoxLogits(inputImage.width, inputImage.height, {
          x0: 100,
          y0: 0,
          x1: 408,
          y1: inputImage.height,
          insideVal: 4,
          outsideVal: -8,
        });
      }
      const data = new Float32Array(inputImage.width * inputImage.height).fill(4);
      return { dims: [1, 1, inputImage.height, inputImage.width], data };
    },
  });

  await worker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const { message } = await worker.run(13, { width: 2000, height: 800 });

  assert.equal(message.passes, 2);
  assert.equal(worker.inferenceCalls, 2);
});

test("2-stage crop refinement skips when disabled, small input, low pixel gain, large bbox, or full-frame", async () => {
  // 1. Small input (< 480)
  const smallWorker = createHarness({
    outputFactory: (img) => makeBoxLogits(img.width, img.height, { x0: 80, y0: 60, x1: 160, y1: 120 }),
  });
  await smallWorker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const smallRes = await smallWorker.run(20, { width: 400, height: 300 });
  assert.equal(smallRes.message.passes, 1);

  // 2. Low pixel gain: 800x600 on 1024 model => Pass 1 already runs at full 800x600 (gain = 1.0 < 1.3)
  const lowGainWorker = createHarness({
    outputFactory: (img) => makeBoxLogits(img.width, img.height, { x0: 250, y0: 200, x1: 450, y1: 350 }),
  });
  await lowGainWorker.init({ gpuModel: DEFAULT_GPU_MODEL });
  const lowGainRes = await lowGainWorker.run(21, { width: 800, height: 600 });
  assert.equal(lowGainRes.message.passes, 1);

  // 3. Large subject (bboxAreaRatio = 0.72 >= 0.55 on 4:3 image)
  const largeSubjectWorker = createHarness({
    outputFactory: (img) => makeBoxLogits(img.width, img.height, { x0: 40, y0: 30, x1: 472, y1: 354 }),
  });
  await largeSubjectWorker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const largeSubjectRes = await largeSubjectWorker.run(22, { width: 1600, height: 1200 });
  assert.equal(largeSubjectRes.message.passes, 1);

  // 4. Empty mask (fgRatio = 0)
  const emptyWorker = createHarness({
    outputFactory: (img) => ({
      dims: [1, 1, img.height, img.width],
      data: new Float32Array(img.width * img.height).fill(-8),
    }),
  });
  await emptyWorker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const emptyRes = await emptyWorker.run(23, { width: 1600, height: 1200 });
  assert.equal(emptyRes.message.passes, 1);

  // 5. Full-frame subject on wide panorama (padded crop spans 100% of both axes)
  const fullWideWorker = createHarness({
    outputFactory: (img) => ({
      dims: [1, 1, img.height, img.width],
      data: new Float32Array(img.width * img.height).fill(4),
    }),
  });
  await fullWideWorker.init({ device: "wasm", cpuModel: DEFAULT_CPU_MODEL });
  const fullWideRes = await fullWideWorker.run(24, { width: 2000, height: 800 });
  assert.equal(fullWideRes.message.passes, 1);
});

test("bitmap and offscreen canvases are released even if inference rejects with an error", async () => {
  const worker = createHarness({ failInference: true });
  await worker.init({ device: "wasm" });
  const { bitmap, message } = await worker.run(30, { width: 64, height: 64 });

  assert.equal(message.type, "error");
  assert.equal(bitmap.closed, true);
  assert.ok(worker.canvases.length >= 1);
  for (const canvas of worker.canvases) {
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  }
});
