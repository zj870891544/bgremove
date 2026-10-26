"use client";

import type { MaskResult } from "./engine";

/**
 * Phones and low-memory devices get tighter limits: iOS Safari refuses canvases above
 * ~16.7 MP and kills the tab when total canvas memory gets too high.
 */
export function isConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return ios || /Android/.test(ua) || (mem !== undefined && mem <= 4);
}

/** Longest side / total pixels we keep for editing and exporting. Larger photos are downscaled. */
function limits() {
  return isConstrainedDevice() ? { side: 4096, pixels: 8_000_000 } : { side: 5000, pixels: 16_000_000 };
}

/** Budget for erase/restore undo snapshots (each one is a full-size RGBA copy of the mask). */
export function historyBudgetBytes() {
  return isConstrainedDevice() ? 64_000_000 : 240_000_000;
}

const HEIC_RE = /\.(heic|heif)$/i;

export function isHeic(file: Blob, name = "") {
  return /image\/hei[cf]/i.test(file.type) || HEIC_RE.test(name);
}

let heicLib: Promise<(o: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>> | null = null;

/** iPhone photos: browsers other than Safari can't decode HEIC, so convert it with heic2any (loaded on demand). */
async function heicToJpeg(file: Blob): Promise<Blob> {
  heicLib ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => resolve((window as unknown as { heic2any: never }).heic2any);
    s.onerror = () => {
      heicLib = null;
      reject(new Error("Could not load the HEIC converter"));
    };
    document.head.appendChild(s);
  });
  const convert = await heicLib;
  const out = await convert({ blob: file, toType: "image/jpeg", quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some browsers can't decode certain formats via createImageBitmap; fall back to <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export type Background =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string }
  | { kind: "image"; image: HTMLImageElement | ImageBitmap; url: string }
  | { kind: "blur"; amount: number };

export type Rect = { x: number; y: number; w: number; h: number };

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export async function decodeImage(file: Blob, name = "") {
  let bitmap: ImageBitmap;
  try {
    bitmap = await toBitmap(file);
  } catch (err) {
    if (!isHeic(file, name)) {
      throw new Error("This file couldn't be opened as an image. Try a JPG, PNG or WebP.", { cause: err });
    }
    bitmap = await toBitmap(await heicToJpeg(file));
  }
  const { side, pixels } = limits();
  let scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  scale = Math.min(scale, Math.sqrt(pixels / (bitmap.width * bitmap.height)));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { canvas, width, height };
}

/** Mask canvas: white pixels whose alpha is the predicted foreground probability. */
export function buildMask(result: MaskResult, width: number, height: number) {
  const small = makeCanvas(result.width, result.height);
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(result.width, result.height);
  const d = img.data;
  for (let i = 0, j = 0; i < result.mask.length; i++, j += 4) {
    d[j] = 255;
    d[j + 1] = 255;
    d[j + 2] = 255;
    d[j + 3] = result.mask[i];
  }
  sctx.putImageData(img, 0, 0);
  const mask = makeCanvas(width, height);
  const mctx = mask.getContext("2d", { willReadFrequently: true })!;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(small, 0, 0, width, height);
  return mask;
}

/** Recompute the cut-out (original × mask) — optionally only inside a dirty rectangle. */
export function updateCut(cut: HTMLCanvasElement, original: HTMLCanvasElement, mask: HTMLCanvasElement, r?: Rect) {
  const ctx = cut.getContext("2d")!;
  const { x, y, w, h } = r ?? { x: 0, y: 0, w: cut.width, h: cut.height };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(original, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}

const blurCache = new WeakMap<HTMLCanvasElement, Map<number, HTMLCanvasElement>>();

/** Cheap, cross-browser blur: downscale then upscale with smoothing (ctx.filter isn't in every Safari). */
function blurred(original: HTMLCanvasElement, amount: number) {
  let byAmount = blurCache.get(original);
  if (!byAmount) blurCache.set(original, (byAmount = new Map()));
  const hit = byAmount.get(amount);
  if (hit) return hit;
  const factor = Math.max(4, amount);
  const w = Math.max(2, Math.round(original.width / factor));
  const h = Math.max(2, Math.round(original.height / factor));
  const a = makeCanvas(w, h);
  const actx = a.getContext("2d")!;
  actx.imageSmoothingQuality = "high";
  actx.drawImage(original, 0, 0, w, h);
  // A second, half-size pass smooths out the blockiness of a single downscale.
  const b = makeCanvas(Math.max(2, w >> 1), Math.max(2, h >> 1));
  const bctx = b.getContext("2d")!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(a, 0, 0, b.width, b.height);
  actx.clearRect(0, 0, w, h);
  actx.drawImage(b, 0, 0, w, h);
  byAmount.set(amount, a);
  return a;
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  const s = Math.max(w / src.width, h / src.height);
  const dw = src.width * s;
  const dh = src.height * s;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  original: HTMLCanvasElement,
  w: number,
  h: number
) {
  switch (bg.kind) {
    case "transparent":
      return;
    case "color":
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      return;
    case "gradient": {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, bg.from);
      g.addColorStop(1, bg.to);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    case "image":
      drawCover(ctx, bg.image as HTMLImageElement, w, h);
      return;
    case "blur":
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(blurred(original, bg.amount), 0, 0, w, h);
      return;
  }
}

export function renderFull(original: HTMLCanvasElement, cut: HTMLCanvasElement, bg: Background) {
  const out = makeCanvas(original.width, original.height);
  const ctx = out.getContext("2d")!;
  drawBackground(ctx, bg, original, out.width, out.height);
  ctx.drawImage(cut, 0, 0);
  return out;
}

export type ExportFormat = "png" | "jpg" | "webp";

export function exportImage(
  original: HTMLCanvasElement,
  cut: HTMLCanvasElement,
  bg: Background,
  format: ExportFormat
): Promise<Blob> {
  // JPG has no alpha channel, so a transparent result gets a white backdrop.
  const effective: Background = format === "jpg" && bg.kind === "transparent" ? { kind: "color", color: "#ffffff" } : bg;
  const canvas = renderFull(original, cut, effective);
  const type = format === "png" ? "image/png" : format === "jpg" ? "image/jpeg" : "image/webp";
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        releaseCanvas(canvas);
        if (b) resolve(b);
        else reject(new Error("Export failed"));
      },
      type,
      format === "png" ? undefined : 0.92
    )
  );
}

/** Safari holds on to canvas memory until GC; shrinking the canvas frees it right away. */
export function releaseCanvas(c?: HTMLCanvasElement) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

export function thumbnail(source: HTMLCanvasElement, max = 160): string {
  const s = Math.min(1, max / Math.max(source.width, source.height));
  const c = makeCanvas(Math.max(1, Math.round(source.width * s)), Math.max(1, Math.round(source.height * s)));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
