"use client";

import { track } from "@/lib/analytics";
import { engineConfig } from "@/lib/site";

export type QualityTier = "fast" | "hd" | "ultra";

export type EngineCapabilities = {
  webgpu: boolean;
  shaderF16: boolean;
  maxStorageBuffers: number;
};

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading"; loaded: number; total: number; tier?: QualityTier }
  | { state: "ready"; device: string; model: string; tier: QualityTier }
  | { state: "error"; message: string };

export type MaskResult = {
  mask: Uint8ClampedArray;
  width: number;
  height: number;
  ms: number;
  passes?: number;
  model?: string;
  device?: string;
  tier?: QualityTier;
  rgba?: Uint8ClampedArray;
};

type Listener = (s: EngineStatus) => void;
type TierListener = (t: QualityTier) => void;

type BootStep = {
  device: "auto" | "wasm";
  gpuModel?: string;
  cpuModel: string;
};

type WorkerResultPayload = {
  mask: Uint8ClampedArray;
  width: number;
  height: number;
  ms: number;
  passes?: number;
};

class InitFailureError extends Error {
  device?: string;
  model?: string;
  constructor(message: string, device?: string, model?: string) {
    super(message);
    this.device = device;
    this.model = model;
  }
}

function detectDefaultTier(): QualityTier {
  if (typeof navigator === "undefined") return "hd";
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mobile || (typeof mem === "number" && mem <= 4)) return "fast";
  return "hd";
}

let worker: Worker | null = null;
let status: EngineStatus = { state: "idle" };
let qualityTier: QualityTier = detectDefaultTier();
let ready: Promise<void> | null = null;
let activeTier: QualityTier | null = null;
let activeLadder: BootStep[] = [];
let activeStepIndex = 0;
let activeDevice: string | undefined;
let activeModel: string | undefined;
let activeGpuUnavailable = false;
let activeFailedCombos = new Set<string>();
let bootGeneration = 0;
let activeLoadTimer: ReturnType<typeof setTimeout> | null = null;
let activeBootAbort: ((err: Error) => void) | null = null;
let capabilitiesPromise: Promise<EngineCapabilities> | null = null;

const listeners = new Set<Listener>();
const tierListeners = new Set<TierListener>();
const pending = new Map<number, { resolve: (r: WorkerResultPayload) => void; reject: (e: Error) => void }>();
let nextId = 1;
const MODEL_IDLE_TIMEOUT_MS = 120_000;
const GPU_RUN_TIMEOUT_MS = 45_000;
const CPU_RUN_TIMEOUT_MS = 120_000;
// Worker and app must change together: an older cached worker can interpret a
// newer model's logits with the wrong alpha conversion.
const WORKER_URL = "/workers/bg-worker.js?v=20261121.1";
// Inference runs one image at a time; extra requests wait their turn.
let queue: Promise<unknown> = Promise.resolve();
let activeRunCount = 0;

function setStatus(s: EngineStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

export function getEngineStatus(): EngineStatus {
  return status;
}

export function subscribeEngine(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getQualityTier(): QualityTier {
  return qualityTier;
}

export function setQualityTier(tier: QualityTier): void {
  if (qualityTier === tier) return;
  qualityTier = tier;
  tierListeners.forEach((l) => l(tier));
}

export function subscribeQualityTier(l: TierListener): () => void {
  tierListeners.add(l);
  return () => {
    tierListeners.delete(l);
  };
}

export function detectCapabilities(): Promise<EngineCapabilities> {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async (): Promise<EngineCapabilities> => {
      try {
        if (typeof navigator === "undefined" || !("gpu" in navigator)) {
          return { webgpu: false, shaderF16: false, maxStorageBuffers: 0 };
        }
        const gpu = (navigator as Navigator & {
          gpu?: {
            requestAdapter(): Promise<{
              features?: { has(name: string): boolean };
              limits?: { maxStorageBuffersPerShaderStage?: number };
            } | null>;
          };
        }).gpu;
        if (!gpu) return { webgpu: false, shaderF16: false, maxStorageBuffers: 0 };
        const adapter = await gpu.requestAdapter();
        if (!adapter) return { webgpu: false, shaderF16: false, maxStorageBuffers: 0 };
        return {
          webgpu: true,
          shaderF16: !!adapter.features?.has("shader-f16"),
          maxStorageBuffers: adapter.limits?.maxStorageBuffersPerShaderStage ?? 0,
        };
      } catch {
        return { webgpu: false, shaderF16: false, maxStorageBuffers: 0 };
      }
    })();
  }
  return capabilitiesPromise;
}

function stepKey(step: BootStep): string {
  return step.device === "wasm"
    ? `wasm|${step.cpuModel}`
    : `auto|${step.gpuModel || ""}|${step.cpuModel}`;
}

function buildLadder(tier: QualityTier): BootStep[] {
  const gpuUltra = engineConfig.gpuUltraModel || engineConfig.gpuModel;
  const gpuMain = engineConfig.gpuModel;
  const gpuFallback = engineConfig.gpuFallbackModel || engineConfig.cpuModel;
  const cpuMain = engineConfig.cpuModel;
  const cpuFallback = engineConfig.cpuFallbackModel;

  const raw: BootStep[] = [];
  if (tier === "ultra") {
    raw.push({ device: "auto", gpuModel: gpuUltra, cpuModel: cpuMain });
  }
  if (tier === "ultra" || tier === "hd") {
    raw.push({ device: "auto", gpuModel: gpuMain, cpuModel: cpuMain });
  }
  raw.push(
    { device: "auto", gpuModel: gpuFallback, cpuModel: cpuMain },
    { device: "wasm", cpuModel: cpuMain },
    { device: "wasm", cpuModel: cpuFallback },
  );

  const seen = new Set<string>();
  const deduped: BootStep[] = [];
  for (const step of raw) {
    const key = stepKey(step);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(step);
    }
  }
  return deduped;
}

function findNextStepIndex(
  ladder: BootStep[],
  startIndex: number,
  gpuUnavailable: boolean,
  failedCombos: ReadonlySet<string>,
): number {
  for (let i = startIndex; i < ladder.length; i++) {
    const step = ladder[i];
    if (gpuUnavailable && step.device === "auto") continue;
    if (failedCombos.has(stepKey(step))) continue;
    if (step.device === "wasm" && failedCombos.has(`wasm|${step.cpuModel}`)) continue;
    if (step.device === "auto" && step.gpuModel && failedCombos.has(`webgpu|${step.gpuModel}`)) continue;
    return i;
  }
  return -1;
}

function clearLoadTimer() {
  if (activeLoadTimer !== null) {
    clearTimeout(activeLoadTimer);
    activeLoadTimer = null;
  }
}

function stopWorker(w: Worker, error: Error) {
  w.terminate();
  if (worker !== w) return;
  clearLoadTimer();
  const abortBoot = activeBootAbort;
  activeBootAbort = null;
  worker = null;
  pending.forEach((job) => job.reject(error));
  pending.clear();
  abortBoot?.(error);
}

function clearEngineSession() {
  ready = null;
  activeTier = null;
  activeLadder = [];
  activeStepIndex = 0;
  activeDevice = undefined;
  activeModel = undefined;
  activeGpuUnavailable = false;
  activeFailedCombos = new Set<string>();
}

function failEngine(error: Error): never {
  clearEngineSession();
  setStatus({ state: "error", message: error.message });
  track("engine_failed", { message: error.message.slice(0, 100) });
  throw error;
}

function resetForTierSwitch() {
  bootGeneration++;
  if (worker) {
    stopWorker(worker, new Error("Switching quality tier"));
  }
  clearEngineSession();
}

/** Spawn a worker and resolve once its model is loaded and warmed up. */
function boot(step: BootStep, tier: QualityTier): Promise<{ device: string; model: string }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_URL, { type: "module" });
    worker = w;
    let initialized = false;
    let settled = false;

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      activeBootAbort = null;
      reject(error);
    };

    activeBootAbort = (error: Error) => {
      settleReject(error);
    };

    const fail = (error: Error) => {
      if (worker !== w) return;
      clearLoadTimer();
      const hadPending = pending.size > 0;
      stopWorker(w, error);
      // Rejecting the already-resolved boot promise alone would leave an active
      // image (and every queued image after it) waiting forever.
      if (initialized) {
        ready = null;
        activeTier = null;
        if (!hadPending) {
          setStatus({ state: "error", message: error.message });
          track("engine_failed", { message: error.message.slice(0, 100) });
        }
      }
      settleReject(error);
    };

    const resetLoadTimer = () => {
      clearLoadTimer();
      activeLoadTimer = setTimeout(
        () => fail(new Error("Model loading stalled. Check your connection and try again.")),
        MODEL_IDLE_TIMEOUT_MS
      );
    };

    resetLoadTimer();

    w.onmessage = (e: MessageEvent) => {
      if (worker !== w) return;
      const msg = e.data;
      if (msg.type === "progress") {
        if (!initialized) {
          resetLoadTimer();
          setStatus({ state: "loading", loaded: msg.loaded, total: msg.total, tier });
        }
      } else if (msg.type === "ready") {
        clearLoadTimer();
        initialized = true;
        settled = true;
        activeBootAbort = null;
        setStatus({ state: "ready", device: msg.device, model: msg.model, tier });
        track("engine_ready", {
          device: msg.device,
          model: msg.model,
          tier,
          isolated: typeof self !== "undefined" ? self.crossOriginIsolated : false,
        });
        resolve({ device: msg.device, model: msg.model });
      } else if (msg.type === "result") {
        pending.get(msg.id)?.resolve({
          mask: msg.mask,
          width: msg.width,
          height: msg.height,
          ms: msg.ms,
          passes: msg.passes,
        });
        pending.delete(msg.id);
      } else if (msg.type === "error") {
        if (msg.init) {
          fail(new InitFailureError(msg.message, msg.device, msg.model));
        } else if (pending.has(msg.id)) {
          pending.get(msg.id)!.reject(new Error(msg.message));
          pending.delete(msg.id);
        }
      }
    };

    w.onerror = (e) => {
      fail(new Error(e.message || "Background removal worker failed"));
    };
    w.onmessageerror = () => fail(new Error("Could not read the background removal result. Try again."));

    try {
      w.postMessage({
        type: "init",
        device: step.device,
        ...(step.gpuModel ? { gpuModel: step.gpuModel } : {}),
        cpuModel: step.cpuModel,
        ...(step.device === "wasm" ? { model: step.cpuModel } : {}),
        version: engineConfig.transformersVersion,
        modelHost: engineConfig.modelHost,
      });
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function bootLadderFrom(
  tier: QualityTier,
  ladder: BootStep[],
  startIndex: number,
  initialGpuUnavailable: boolean,
  failedCombos: Set<string>,
  generation: number,
): Promise<void> {
  let gpuUnavailable = initialGpuUnavailable;
  let index = findNextStepIndex(ladder, startIndex, gpuUnavailable, failedCombos);
  let lastError: Error = new Error("No inference backend available");

  while (index !== -1) {
    if (generation !== bootGeneration) {
      throw new Error("Switching quality tier");
    }
    const step = ladder[index];
    setStatus({ state: "loading", loaded: 0, total: 0, tier });
    try {
      const resolved = await boot(step, tier);
      if (generation !== bootGeneration) {
        throw new Error("Switching quality tier");
      }
      if (step.device === "auto" && resolved.device === "wasm") {
        gpuUnavailable = true;
      }
      activeTier = tier;
      activeLadder = ladder;
      activeStepIndex = index;
      activeDevice = resolved.device;
      activeModel = resolved.model;
      activeGpuUnavailable = gpuUnavailable;
      return;
    } catch (err) {
      if (generation !== bootGeneration) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      failedCombos.add(stepKey(step));
      const reportedDevice = err instanceof InitFailureError ? err.device : undefined;
      const reportedModel = err instanceof InitFailureError ? err.model : undefined;
      if (reportedDevice && reportedModel) {
        failedCombos.add(`${reportedDevice}|${reportedModel}`);
      }
      if (reportedDevice === "wasm") {
        gpuUnavailable = true;
      }
      const nextIndex = findNextStepIndex(ladder, index + 1, gpuUnavailable, failedCombos);
      if (nextIndex !== -1) {
        const fromCpu = reportedDevice === "wasm" || step.device === "wasm";
        console.warn("[engine] Backend failed, stepping down fallback ladder", lastError);
        track(fromCpu ? "engine_cpu_fallback" : "engine_gpu_fallback", {
          message: lastError.message.slice(0, 100),
          tier,
        });
      }
      index = nextIndex;
    }
  }

  throw lastError;
}

function ensureReady(targetTier: QualityTier): Promise<void> {
  if (ready && activeTier === targetTier) return ready;
  if (activeTier !== null && activeTier !== targetTier) {
    resetForTierSwitch();
  }
  const ladder = buildLadder(targetTier);
  const generation = ++bootGeneration;
  activeTier = targetTier;
  activeLadder = ladder;
  activeStepIndex = 0;
  activeDevice = undefined;
  activeModel = undefined;
  activeGpuUnavailable = false;
  const failedCombos = new Set<string>();
  activeFailedCombos = failedCombos;

  const p = bootLadderFrom(targetTier, ladder, 0, false, failedCombos, generation).catch((error) => {
    if (generation !== bootGeneration) throw error;
    return failEngine(error instanceof Error ? error : new Error(String(error)));
  });
  ready = p;
  // Fire-and-forget callers (hover prefetch) shouldn't surface unhandled rejections.
  p.catch(() => undefined);
  return p;
}

function isQualityTier(value: unknown): value is QualityTier {
  return value === "fast" || value === "hd" || value === "ultra";
}

/** Start loading the model early (e.g. when the user hovers the upload button). */
export function warmUp(tier?: QualityTier): Promise<void>;
export function warmUp(event?: unknown): Promise<void>;
export function warmUp(tierOrEvent?: QualityTier | unknown): Promise<void> {
  if (engineConfig.apiUrl) return Promise.resolve();
  const targetTier = isQualityTier(tierOrEvent) ? tierOrEvent : qualityTier;
  if (ready && activeTier === targetTier) return ready;
  if (activeRunCount > 0) {
    const task = queue.then(() => ensureReady(targetTier));
    queue = task.catch(() => undefined);
    task.catch(() => undefined);
    return task;
  }
  return ensureReady(targetTier);
}

function runWorker(source: ImageBitmap, refineCrop?: boolean): Promise<WorkerResultPayload> {
  const id = nextId++;
  const w = worker!;
  return new Promise<WorkerResultPayload>((resolve, reject) => {
    const timeout = status.state === "ready" && status.device === "webgpu" ? GPU_RUN_TIMEOUT_MS : CPU_RUN_TIMEOUT_MS;
    const timer = setTimeout(() => {
      const error = new Error("Background removal timed out. Try again or use a smaller image.");
      ready = null;
      activeTier = null;
      stopWorker(w, error);
    }, timeout);
    pending.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    try {
      w.postMessage(
        {
          type: "run",
          id,
          bitmap: source,
          ...(refineCrop === undefined ? {} : { refineCrop }),
        },
        [source]
      );
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      source.close();
      reject(error);
    }
  });
}

async function runLocal(source: ImageBitmap, targetTier: QualityTier, refineCrop?: boolean): Promise<MaskResult> {
  try {
    while (true) {
      await ensureReady(targetTier);
      const stepLadder = activeLadder;
      const stepIndex = activeStepIndex;
      const stepDevice = activeDevice;
      const stepModel = activeModel;
      const stepGpuUnavailable = activeGpuUnavailable || stepDevice === "wasm";

      const probeFailed = new Set(activeFailedCombos);
      if (stepDevice && stepModel) probeFailed.add(`${stepDevice}|${stepModel}`);
      const nextIdx = findNextStepIndex(stepLadder, stepIndex + 1, stepGpuUnavailable, probeFailed);
      const canFallback = nextIdx !== -1;

      try {
        // Keep the source for clean fallback retries if the current GPU or CPU
        // model crashes, exhausts memory, or hangs on this image.
        const input = canFallback ? await createImageBitmap(source) : source;
        const payload = await runWorker(input, refineCrop);
        return {
          ...payload,
          passes: payload.passes ?? 1,
          model: stepModel,
          device: stepDevice,
          tier: targetTier,
        };
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (!canFallback) {
          if (!worker) {
            clearEngineSession();
            setStatus({ state: "error", message: failure.message });
            track("engine_failed", { message: failure.message.slice(0, 100), tier: targetTier });
          }
          throw failure;
        }
        if (worker) stopWorker(worker, failure);
        if (stepDevice && stepModel) activeFailedCombos.add(`${stepDevice}|${stepModel}`);
        if (stepDevice === "wasm") activeGpuUnavailable = true;
        console.warn("[engine] Inference failed, stepping down fallback ladder", failure);
        track(stepDevice === "wasm" ? "engine_cpu_fallback" : "engine_gpu_fallback", {
          message: failure.message.slice(0, 100),
          tier: targetTier,
        });
        const generation = ++bootGeneration;
        activeTier = targetTier;
        const nextReady = bootLadderFrom(
          targetTier,
          stepLadder,
          nextIdx,
          activeGpuUnavailable,
          activeFailedCombos,
          generation
        ).catch((bootErr) => {
          if (generation !== bootGeneration) throw bootErr;
          return failEngine(bootErr instanceof Error ? bootErr : new Error(String(bootErr)));
        });
        ready = nextReady;
        nextReady.catch(() => undefined);
      }
    }
  } finally {
    source.close();
  }
}

/** Remote engine: POST the image, receive a PNG cut-out, preserve both alpha mask and RGB. */
async function runRemote(file: Blob, source: ImageBitmap | null | undefined, tier: QualityTier): Promise<MaskResult> {
  try {
    const t0 = performance.now();
    const body = new FormData();
    body.append("image", file);
    const res = await fetch(engineConfig.apiUrl, { method: "POST", body });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    try {
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const mask = new Uint8ClampedArray(bmp.width * bmp.height);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
      return {
        mask,
        rgba: new Uint8ClampedArray(data),
        width: bmp.width,
        height: bmp.height,
        ms: Math.round(performance.now() - t0),
        passes: 1,
        device: "remote",
        model: "remote",
        tier,
      };
    } finally {
      bmp.close?.();
    }
  } finally {
    source?.close?.();
  }
}

export function removeBackground(
  file: Blob,
  bitmap: ImageBitmap,
  options?: { tier?: QualityTier; refineCrop?: boolean }
): Promise<MaskResult> {
  const targetTier = options?.tier ?? qualityTier;
  activeRunCount++;
  const job = queue
    .then(() =>
      engineConfig.apiUrl
        ? runRemote(file, bitmap, targetTier)
        : runLocal(bitmap, targetTier, options?.refineCrop)
    )
    .finally(() => {
      activeRunCount--;
    });
  queue = job.catch(() => undefined);
  return job;
}
