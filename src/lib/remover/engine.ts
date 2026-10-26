"use client";

import { track } from "@/lib/analytics";
import { engineConfig } from "@/lib/site";

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading"; loaded: number; total: number }
  | { state: "ready"; device: string; model: string }
  | { state: "error"; message: string };

export type MaskResult = { mask: Uint8ClampedArray; width: number; height: number; ms: number };

type Listener = (s: EngineStatus) => void;

let worker: Worker | null = null;
let status: EngineStatus = { state: "idle" };
let ready: Promise<void> | null = null;
const listeners = new Set<Listener>();
const pending = new Map<number, { resolve: (r: MaskResult) => void; reject: (e: Error) => void }>();
let nextId = 1;
// Inference runs one image at a time; extra requests wait their turn.
let queue: Promise<unknown> = Promise.resolve();

function setStatus(s: EngineStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

export function getEngineStatus() {
  return status;
}

export function subscribeEngine(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Spawn a worker and resolve once its model is loaded and warmed up. */
function boot(device: "auto" | "wasm"): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = new Worker("/workers/bg-worker.js", { type: "module" });
    worker = w;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "progress") {
        if (status.state !== "ready") setStatus({ state: "loading", loaded: msg.loaded, total: msg.total });
      } else if (msg.type === "ready") {
        setStatus({ state: "ready", device: msg.device, model: msg.model });
        track("engine_ready", { device: msg.device, model: msg.model, isolated: self.crossOriginIsolated });
        resolve();
      } else if (msg.type === "result") {
        pending.get(msg.id)?.resolve({ mask: msg.mask, width: msg.width, height: msg.height, ms: msg.ms });
        pending.delete(msg.id);
      } else if (msg.type === "error") {
        if (msg.init) {
          w.terminate();
          reject(new Error(msg.message));
        } else if (pending.has(msg.id)) {
          pending.get(msg.id)!.reject(new Error(msg.message));
          pending.delete(msg.id);
        }
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "Worker failed to start"));
    };
    w.postMessage({
      type: "init",
      device,
      gpuModel: engineConfig.gpuModel,
      cpuModel: engineConfig.cpuModel,
      version: engineConfig.transformersVersion,
      modelHost: engineConfig.modelHost,
    });
  });
}

/** Start loading the model early (e.g. when the user hovers the upload button). */
export function warmUp(): Promise<void> {
  if (engineConfig.apiUrl) return Promise.resolve();
  if (!ready) {
    setStatus({ state: "loading", loaded: 0, total: 0 });
    ready = boot("auto")
      .catch((err) => {
        // WebGPU exists but couldn't run any model: start over on the CPU in a clean worker.
        console.warn("[engine] GPU backend failed, falling back to CPU", err);
        track("engine_gpu_fallback", { message: String(err?.message ?? err).slice(0, 100) });
        setStatus({ state: "loading", loaded: 0, total: 0 });
        return boot("wasm");
      })
      .catch((err: Error) => {
        setStatus({ state: "error", message: err.message });
        track("engine_failed", { message: err.message.slice(0, 100) });
        ready = null;
        throw err;
      });
    // Fire-and-forget callers (hover prefetch) shouldn't surface unhandled rejections.
    ready.catch(() => undefined);
  }
  return ready;
}

async function runLocal(source: ImageBitmap): Promise<MaskResult> {
  await warmUp();
  const id = nextId++;
  return new Promise<MaskResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type: "run", id, bitmap: source }, [source]);
  });
}

/** Remote engine: POST the image, receive a PNG cut-out, read its alpha channel. */
async function runRemote(file: Blob): Promise<MaskResult> {
  const t0 = performance.now();
  const body = new FormData();
  body.append("image", file);
  const res = await fetch(engineConfig.apiUrl, { method: "POST", body });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const mask = new Uint8ClampedArray(bmp.width * bmp.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
  return { mask, width: bmp.width, height: bmp.height, ms: Math.round(performance.now() - t0) };
}

export function removeBackground(file: Blob, bitmap: ImageBitmap): Promise<MaskResult> {
  const job = queue.then(() => (engineConfig.apiUrl ? runRemote(file) : runLocal(bitmap)));
  queue = job.catch(() => undefined);
  return job;
}
