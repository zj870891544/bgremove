import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

// Exercise the production engine in isolated browser-like environments without
// downloading models or requiring a particular GPU on the machine running tests.
const source = readFileSync(new URL("../src/lib/remover/engine.ts", import.meta.url), "utf8");
const engineCode = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const EXPECTED_WORKER_URL = "/workers/bg-worker.js?v=20261121.1";

function bitmap(label = "original") {
  return {
    width: 32,
    height: 32,
    label,
    closed: false,
    detached: false,
    close() { this.closed = true; },
  };
}

function createHarness(plans = [], {
  navigator: nav,
  engineConfig: configOverrides = {},
  fetch: customFetch,
  remoteRgba,
} = {}) {
  const workers = [];
  const timers = new Map();
  const events = [];
  const remaining = [...plans];
  let nextTimer = 1;

  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.plan = remaining.shift();
      assert.ok(this.plan, `Unexpected worker restart (#${workers.length + 1})`);
      this.terminated = false;
      this.runMessages = [];
      workers.push(this);
    }

    terminate() { this.terminated = true; }

    emit(data) { this.onmessage?.({ data }); }

    postMessage(message) {
      if (message.type === "init") {
        this.initMessage = message;
        this.requestedDevice = message.device;
        this.requestedGpuModel = message.gpuModel;
        this.requestedCpuModel = message.cpuModel;
        this.requestedModel = message.model;
        queueMicrotask(() => {
          if (this.terminated) return;
          if (this.plan.init === "hang") return;
          if (this.plan.init === "error") {
            this.emit({
              type: "error",
              init: true,
              message: this.plan.initMessage || "Model fetch failed",
              ...(this.plan.initDevice ? { device: this.plan.initDevice } : {}),
              ...(this.plan.initModel ? { model: this.plan.initModel } : {}),
            });
          } else {
            const device = this.plan.device ?? "wasm";
            const model = this.plan.model ?? (device === "webgpu" ? message.gpuModel : message.cpuModel);
            this.emit({ type: "ready", device, model });
          }
        });
        return;
      }

      // Transferring a bitmap detaches the main-thread object. A retry must
      // preserve its own usable source instead of reusing the transferred one.
      assert.equal(message.bitmap.detached, false, "A detached bitmap was reused");
      message.bitmap.detached = true;
      this.input = message.bitmap;
      this.runMessages.push(message);
      const outcome = Array.isArray(this.plan.run) ? this.plan.run.shift() : this.plan.run;
      queueMicrotask(() => {
        if (this.terminated) return;
        if (outcome === "hang") return;
        if (outcome === "crash") {
          this.onerror?.({ message: "Worker process crashed" });
        } else if (outcome === "messageerror") {
          this.onmessageerror?.({});
        } else if (outcome === "error") {
          this.emit({ type: "error", id: message.id, message: "Inference failed" });
        } else {
          this.emit({
            type: "result",
            id: message.id,
            mask: new Uint8ClampedArray([255]),
            width: 1,
            height: 1,
            ms: 1,
            passes: this.plan.passes ?? 1,
          });
        }
      });
    }
  }

  class FakeFormData {
    constructor() { this.entries = []; }
    append(k, v) { this.entries.push([k, v]); }
  }

  class FakeOffscreenCanvas {
    constructor(width, height) { Object.assign(this, { width, height }); }
    getContext() {
      return {
        drawImage() {},
        getImageData: () => ({
          data: remoteRgba ?? new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]),
        }),
      };
    }
  }

  const engineModule = { exports: {} };
  const context = {
    module: engineModule,
    exports: engineModule.exports,
    Worker: FakeWorker,
    FormData: FakeFormData,
    OffscreenCanvas: FakeOffscreenCanvas,
    Uint8ClampedArray,
    Error,
    Map,
    Set,
    Promise,
    performance: { now: () => 10 },
    console: { warn() {} },
    self: { crossOriginIsolated: true },
    fetch: customFetch,
    async createImageBitmap(input) {
      if (input && input.remoteBlob) {
        return {
          width: input.width ?? 2,
          height: input.height ?? 1,
          closed: false,
          close() { this.closed = true; },
        };
      }
      assert.equal(input.detached, false, "Cannot copy a detached bitmap");
      return bitmap("copy");
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "@/lib/analytics") return { track(name, props) { events.push({ name, props }); } };
      if (name === "@/lib/site") {
        return {
          engineConfig: {
            apiUrl: "",
            gpuModel: "gpu-1024-model",
            gpuFallbackModel: "gpu-512-model",
            gpuUltraModel: "gpu-ultra-model",
            cpuModel: "quality-cpu-model",
            cpuFallbackModel: "compat-cpu-model",
            transformersVersion: "test-version",
            modelHost: "",
            ...configOverrides,
          },
        };
      }
      throw new Error(`Unexpected engine import: ${name}`);
    },
  };
  if (nav !== undefined) {
    context.navigator = nav;
  }

  vm.runInNewContext(engineCode, context);

  return {
    engine: engineModule.exports,
    workers,
    timers,
    events,
    expireNextTimer() {
      const timer = timers.entries().next().value;
      assert.ok(timer, "Expected an active watchdog");
      const [id, callback] = timer;
      timers.delete(id);
      callback();
    },
  };
}

test("both initial and fallback workers use the bumped versioned worker script URL", async () => {
  const harness = createHarness([{ device: "webgpu", run: "error" }, { device: "webgpu" }]);

  await harness.engine.removeBackground({}, bitmap());

  assert.equal(harness.workers.length, 2);
  for (const worker of harness.workers) {
    assert.equal(worker.url, EXPECTED_WORKER_URL);
    assert.equal(worker.options.type, "module");
  }
});

test("default quality tier picks hd on desktop/node and fast on mobile or low-memory devices", () => {
  const nodeHarness = createHarness([]);
  assert.equal(nodeHarness.engine.getQualityTier(), "hd");

  const desktopHarness = createHarness([], {
    navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", deviceMemory: 16 },
  });
  assert.equal(desktopHarness.engine.getQualityTier(), "hd");

  const mobileHarness = createHarness([], {
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", deviceMemory: 8 },
  });
  assert.equal(mobileHarness.engine.getQualityTier(), "fast");

  const lowMemHarness = createHarness([], {
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", deviceMemory: 4 },
  });
  assert.equal(lowMemHarness.engine.getQualityTier(), "fast");
});

test("setQualityTier notifies subscribers and detectCapabilities reports WebGPU limits", async () => {
  const harness = createHarness([], {
    navigator: {
      userAgent: "Desktop",
      gpu: {
        async requestAdapter() {
          return {
            features: new Set(["shader-f16"]),
            limits: { maxStorageBuffersPerShaderStage: 10 },
          };
        },
      },
    },
  });

  const seen = [];
  const unsub = harness.engine.subscribeQualityTier((t) => seen.push(t));
  harness.engine.setQualityTier("ultra");
  harness.engine.setQualityTier("ultra"); // duplicate ignored
  harness.engine.setQualityTier("fast");
  unsub();
  harness.engine.setQualityTier("hd");

  assert.deepEqual(seen, ["ultra", "fast"]);
  assert.equal(harness.engine.getQualityTier(), "hd");

  const caps = await harness.engine.detectCapabilities();
  assert.deepEqual({ ...caps }, { webgpu: true, shaderF16: true, maxStorageBuffers: 10 });

  const noGpu = createHarness([]);
  assert.deepEqual({ ...(await noGpu.engine.detectCapabilities()) }, {
    webgpu: false,
    shaderF16: false,
    maxStorageBuffers: 0,
  });
});

test("CPU removal completes and returns full MaskResult metadata", async () => {
  const harness = createHarness([{ passes: 2 }]);
  const input = bitmap();

  const result = await harness.engine.removeBackground({}, input, { refineCrop: true });

  assert.equal(result.mask[0], 255);
  assert.equal(result.passes, 2);
  assert.equal(result.device, "wasm");
  assert.equal(result.model, "quality-cpu-model");
  assert.equal(result.tier, "hd");
  assert.equal(harness.workers[0].runMessages[0].refineCrop, true);
  assert.equal(input.closed, true);
  assert.equal(harness.timers.size, 0);
});

test("HD 4-tier fallback steps cleanly through 1024 GPU -> 512 GPU -> 512 WASM -> ISNet WASM", async () => {
  const harness = createHarness([
    { device: "webgpu", run: "error" },
    { device: "webgpu", run: "crash" },
    { device: "wasm", run: "hang" },
    { device: "wasm", passes: 1 },
  ]);
  const input = bitmap();

  const job = harness.engine.removeBackground({}, input);
  await nextTurn();
  // Expire the 512 WASM run watchdog once steps 0 & 1 have failed through microtasks.
  harness.expireNextTimer();
  const result = await job;

  assert.equal(harness.workers.length, 4);
  assert.equal(harness.workers[0].requestedDevice, "auto");
  assert.equal(harness.workers[0].requestedGpuModel, "gpu-1024-model");
  assert.equal(harness.workers[0].input.label, "copy");
  assert.equal(harness.workers[0].terminated, true);

  assert.equal(harness.workers[1].requestedDevice, "auto");
  assert.equal(harness.workers[1].requestedGpuModel, "gpu-512-model");
  assert.equal(harness.workers[1].input.label, "copy");
  assert.equal(harness.workers[1].terminated, true);

  assert.equal(harness.workers[2].requestedDevice, "wasm");
  assert.equal(harness.workers[2].requestedCpuModel, "quality-cpu-model");
  assert.equal(harness.workers[2].input.label, "copy");
  assert.equal(harness.workers[2].terminated, true);

  assert.equal(harness.workers[3].requestedDevice, "wasm");
  assert.equal(harness.workers[3].requestedCpuModel, "compat-cpu-model");
  assert.equal(harness.workers[3].input, input);
  assert.equal(harness.workers[3].terminated, false);

  assert.equal(result.mask[0], 255);
  assert.equal(result.device, "wasm");
  assert.equal(result.model, "compat-cpu-model");
  assert.equal(result.tier, "hd");
  assert.equal(harness.engine.getEngineStatus().state, "ready");
  assert.equal(harness.engine.getEngineStatus().model, "compat-cpu-model");
  assert.equal(input.closed, true);
  assert.equal(harness.timers.size, 0);
});

test("Ultra tier steps through Ultra -> HD -> 512 GPU -> 512 WASM on init/run failures", async () => {
  const harness = createHarness([
    { init: "error", initDevice: "webgpu", initModel: "gpu-ultra-model" },
    { init: "error", initDevice: "webgpu", initModel: "gpu-1024-model" },
    { device: "webgpu", run: "error" },
    { device: "wasm" },
  ]);

  const result = await harness.engine.removeBackground({}, bitmap(), { tier: "ultra" });

  assert.equal(harness.workers.length, 4);
  assert.equal(harness.workers[0].requestedGpuModel, "gpu-ultra-model");
  assert.equal(harness.workers[1].requestedGpuModel, "gpu-1024-model");
  assert.equal(harness.workers[2].requestedGpuModel, "gpu-512-model");
  assert.equal(harness.workers[3].requestedDevice, "wasm");
  assert.equal(harness.workers[3].requestedCpuModel, "quality-cpu-model");
  assert.equal(result.device, "wasm");
  assert.equal(result.model, "quality-cpu-model");
  assert.equal(result.tier, "ultra");
  assert.equal(harness.timers.size, 0);
});

for (const outcome of ["error", "crash", "hang"]) {
  test(`when auto resolves on CPU, a ${outcome} skips remaining GPU tiers and jumps straight to ISNet WASM`, async () => {
    const harness = createHarness([{ device: "wasm", run: outcome }, { device: "wasm" }]);
    const input = bitmap();
    const job = harness.engine.removeBackground({}, input);
    if (outcome === "hang") {
      await nextTurn();
      harness.expireNextTimer();
    }
    const result = await job;

    assert.equal(result.mask[0], 255);
    assert.equal(harness.workers.length, 2, "Must skip unused GPU tiers and duplicate quality CPU step");
    assert.equal(harness.workers[0].requestedDevice, "auto");
    assert.equal(harness.workers[0].requestedCpuModel, "quality-cpu-model");
    assert.equal(harness.workers[0].input.label, "copy");
    assert.equal(harness.workers[0].terminated, true);
    assert.equal(harness.workers[1].requestedDevice, "wasm");
    assert.equal(harness.workers[1].requestedCpuModel, "compat-cpu-model");
    assert.equal(harness.workers[1].input, input);
    assert.equal(harness.engine.getEngineStatus().model, "compat-cpu-model");
    assert.equal(input.closed, true);
    assert.equal(harness.timers.size, 0);
    if (outcome === "error") {
      assert.equal(harness.events.some((event) => event.name === "engine_cpu_fallback"), true);
    }
  });
}

test("an auto init failure reported on wasm jumps straight to compat CPU without retrying GPU tiers", async () => {
  const harness = createHarness([
    { init: "error", initDevice: "wasm", initModel: "quality-cpu-model" },
    { device: "wasm" },
  ]);

  const result = await harness.engine.removeBackground({}, bitmap());

  assert.equal(harness.workers.length, 2);
  assert.equal(harness.workers[0].requestedDevice, "auto");
  assert.equal(harness.workers[1].requestedDevice, "wasm");
  assert.equal(harness.workers[1].requestedCpuModel, "compat-cpu-model");
  assert.equal(result.model, "compat-cpu-model");
  assert.equal(harness.timers.size, 0);
});

test("switching quality tier cleanly replaces the worker and serializes safely with active runs", async () => {
  const harness = createHarness([
    { device: "webgpu" },
    { device: "webgpu" },
    { device: "webgpu" },
  ]);

  const first = await harness.engine.removeBackground({}, bitmap("first"), { tier: "hd" });
  assert.equal(first.model, "gpu-1024-model");
  assert.equal(first.tier, "hd");

  // Switch directly to ultra via removeBackground options
  const second = await harness.engine.removeBackground({}, bitmap("second"), { tier: "ultra" });
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.workers[1].requestedGpuModel, "gpu-ultra-model");
  assert.equal(second.model, "gpu-ultra-model");
  assert.equal(second.tier, "ultra");

  // Queue an active run on ultra and concurrently call warmUp("fast"):
  // warmUp("fast") must wait until the active ultra job finishes rather than aborting it.
  const activeRun = harness.engine.removeBackground({}, bitmap("third"), { tier: "ultra" });
  const warmFast = harness.engine.warmUp("fast");
  const third = await activeRun;
  await warmFast;

  assert.equal(third.model, "gpu-ultra-model");
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(harness.workers[2].requestedGpuModel, "gpu-512-model");
  assert.equal(harness.engine.getEngineStatus().tier, "fast");
  assert.equal(harness.timers.size, 0);
});

test("warmUp ignores non-tier event arguments such as React PointerEvent handlers", async () => {
  const harness = createHarness([{ device: "webgpu" }]);
  await harness.engine.warmUp({ type: "pointerenter" });

  assert.equal(harness.workers.length, 1);
  assert.equal(harness.workers[0].requestedGpuModel, "gpu-1024-model");
  assert.equal(harness.engine.getEngineStatus().state, "ready");
  assert.equal(harness.engine.getEngineStatus().tier, "hd");
  assert.equal(harness.timers.size, 0);
});

test("switching tier via warmUp while an earlier warmUp is still loading cancels the old timer cleanly", async () => {
  const harness = createHarness([
    { init: "hang" },
    { device: "webgpu" },
  ]);

  const slowHd = harness.engine.warmUp("hd");
  assert.equal(harness.timers.size, 1);

  await harness.engine.warmUp("fast");
  await slowHd.catch(() => undefined);

  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.workers[1].requestedGpuModel, "gpu-512-model");
  assert.equal(harness.engine.getEngineStatus().state, "ready");
  assert.equal(harness.engine.getEngineStatus().tier, "fast");
  assert.equal(harness.timers.size, 0);
});

test("a failed compatibility inference stops after exhausting the ladder and releases the next queued image", async () => {
  const harness = createHarness([{ device: "wasm", run: "error" }, { device: "wasm", run: ["error", "success"] }]);
  const input = bitmap();
  const failed = harness.engine.removeBackground({}, input);
  const rejection = assert.rejects(failed, /Inference failed/);
  const next = harness.engine.removeBackground({}, bitmap("next"));

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(harness.workers.length, 2, "The compatibility model must not recursively retry itself");
  assert.equal(input.closed, true);
  assert.equal(harness.timers.size, 0);
});

test("compatibility model loading failure rejects the image and a later queued image can recover", async () => {
  const harness = createHarness([{ device: "wasm", run: "error" }, { init: "error" }, { device: "wasm" }]);
  const input = bitmap();
  const failed = harness.engine.removeBackground({}, input);
  const rejection = assert.rejects(failed, /Model fetch failed/);
  const next = harness.engine.removeBackground({}, bitmap());

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(input.closed, true);
  assert.equal(harness.timers.size, 0);
});

test("a compatibility CPU worker crash rejects that image and lets the next queued image run", async () => {
  const harness = createHarness([
    { init: "error", initDevice: "wasm", initModel: "quality-cpu-model" },
    { device: "wasm", run: "crash" },
    { device: "wasm" },
  ]);
  const failed = harness.engine.removeBackground({}, bitmap());
  const rejection = assert.rejects(failed, /Worker process crashed/);
  const next = harness.engine.removeBackground({}, bitmap());

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(harness.timers.size, 0);
});

test("a compatibility CPU timeout rejects that image without blocking the queue", async () => {
  const harness = createHarness([
    { init: "error", initDevice: "wasm", initModel: "quality-cpu-model" },
    { device: "wasm", run: "hang" },
    { device: "wasm" },
  ]);
  const failed = harness.engine.removeBackground({}, bitmap());
  const rejection = assert.rejects(failed, /timed out/);
  const next = harness.engine.removeBackground({}, bitmap());
  await nextTurn();

  harness.expireNextTimer();

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(harness.timers.size, 0);
});

test("unreadable worker messages fail the active image and release the queue", async () => {
  const harness = createHarness([
    { init: "error", initDevice: "wasm", initModel: "quality-cpu-model" },
    { device: "wasm", run: "messageerror" },
    { device: "wasm" },
  ]);
  const failed = harness.engine.removeBackground({}, bitmap());
  const rejection = assert.rejects(failed, /Could not read/);
  const next = harness.engine.removeBackground({}, bitmap());

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(harness.timers.size, 0);
});

test("stalled model loading steps down to the next tier cleanly", async () => {
  const harness = createHarness([{ init: "hang" }, { device: "webgpu" }]);
  const job = harness.engine.removeBackground({}, bitmap());
  await nextTurn();

  harness.expireNextTimer();
  const result = await job;

  assert.equal(result.mask[0], 255);
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.workers[1].requestedGpuModel, "gpu-512-model");
  assert.equal(harness.timers.size, 0);
});

test("model network errors across the entire ladder settle and a later queued image can recover", async () => {
  const harness = createHarness([
    { init: "error" },
    { init: "error" },
    { init: "error" },
    { init: "error" },
    { device: "wasm" },
  ]);
  const input = bitmap();
  const failed = harness.engine.removeBackground({}, input);
  const rejection = assert.rejects(failed, /Model fetch failed/);
  const next = harness.engine.removeBackground({}, bitmap());

  await rejection;
  assert.equal((await next).mask[0], 255);
  assert.equal(input.closed, true);
  assert.equal(harness.workers[0].terminated, true);
  assert.equal(harness.workers[1].terminated, true);
  assert.equal(harness.workers[2].terminated, true);
  assert.equal(harness.workers[3].terminated, true);
  assert.equal(harness.timers.size, 0);
});

test("remote engine preserves both alpha mask and decontaminated RGBA pixels", async () => {
  const rgba = new Uint8ClampedArray([12, 34, 56, 255, 200, 150, 100, 90]);
  const harness = createHarness([], {
    engineConfig: { apiUrl: "https://api.example.com/cut" },
    remoteRgba: rgba,
    fetch: async (url, init) => {
      assert.equal(url, "https://api.example.com/cut");
      assert.equal(init.method, "POST");
      return {
        ok: true,
        status: 200,
        async blob() { return { remoteBlob: true, width: 2, height: 1 }; },
      };
    },
  });

  const input = bitmap("remote-src");
  const result = await harness.engine.removeBackground({ fake: true }, input, { tier: "hd" });

  assert.deepEqual(Array.from(result.mask), [255, 90]);
  assert.deepEqual(Array.from(result.rgba), Array.from(rgba));
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.equal(result.passes, 1);
  assert.equal(result.device, "remote");
  assert.equal(result.model, "remote");
  assert.equal(result.tier, "hd");
  assert.equal(input.closed, true);
});
