"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { zipSync } from "fflate";
import { getEngineStatus, subscribeEngine } from "@/lib/remover/engine";
import {
  type Background,
  type ExportFormat,
  baseName,
  buildMask,
  downloadBlob,
  exportImage,
  historyBudgetBytes,
  thumbnail,
  updateCut,
} from "@/lib/remover/render";
import { type Item, useRemover } from "./RemoverProvider";
import Stage, { type StageMode } from "./Stage";
import { Logo } from "@/components/Logo";
import { track } from "@/lib/analytics";
import { useI18n } from "@/i18n/I18nProvider";
import { fmt } from "@/i18n/ui/en";

const COLORS = [
  "#ffffff", "#000000", "#f3f4f6", "#1f2937", "#ef4444", "#f97316",
  "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#438edb", "#6366f1",
  "#a855f7", "#ec4899", "#fde2e4", "#e0f2fe",
];

const GRADIENTS: [string, string][] = [
  ["#5940f5", "#b13df5"],
  ["#ff7a59", "#ffcf5c"],
  ["#00c6ff", "#0072ff"],
  ["#43e97b", "#38f9d7"],
  ["#fbc2eb", "#a6c1ee"],
  ["#232526", "#414345"],
];

const PHOTOS = ["studio", "office", "beach", "city", "forest"];

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(url: string) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      })
    );
  }
  return imageCache.get(url)!;
}

function historyLimit(it: Item) {
  return Math.max(1, Math.min(10, Math.floor(historyBudgetBytes() / Math.max(1, it.width * it.height * 4))));
}

function useEngine() {
  return useSyncExternalStore(subscribeEngine, getEngineStatus, getEngineStatus);
}

function sameBg(a: Background, b: Background) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "color" && b.kind === "color") return a.color === b.color;
  if (a.kind === "gradient" && b.kind === "gradient") return a.from === b.from && a.to === b.to;
  if (a.kind === "image" && b.kind === "image") return a.url === b.url;
  return true;
}

export default function EditorModal() {
  const { items, activeId, setActive, setOpen, patch, touch, removeItem, retry, pickFiles } = useRemover();
  const item = items.find((i) => i.id === activeId) ?? items[0];
  const [tab, setTab] = useState<"bg" | "brush">("bg");
  const [mode, setMode] = useState<StageMode>("view");
  const [brushMode, setBrushMode] = useState<"erase" | "restore">("erase");
  const [brush, setBrush] = useState(36);
  const [busy, setBusy] = useState<string | null>(null);
  const engine = useEngine();
  const { ui } = useI18n();
  const t = ui.editor;

  const stageMode: StageMode = tab === "brush" ? brushMode : mode;
  const done = item?.status === "done";

  const close = useCallback(() => setOpen(false), [setOpen]);

  const setBg = (bg: Background) => {
    if (!item) return;
    patch(item.id, { bg });
  };

  const snapshot = useCallback(() => {
    if (!item?.mask) return;
    const ctx = item.mask.getContext("2d", { willReadFrequently: true })!;
    const snap = ctx.getImageData(0, 0, item.width, item.height);
    const history = [...item.history, snap].slice(-historyLimit(item));
    patch(item.id, { history });
  }, [item, patch]);

  const strokeEnd = useCallback(() => {
    if (!item?.cut) return;
    patch(item.id, { resultThumb: thumbnail(item.cut), version: item.version + 1 });
  }, [item, patch]);

  const undo = useCallback(() => {
    if (!item?.mask || !item.cut || !item.original || !item.history.length) return;
    const history = item.history.slice(0, -1);
    const snap = item.history[item.history.length - 1];
    item.mask.getContext("2d")!.putImageData(snap, 0, 0);
    updateCut(item.cut, item.original, item.mask);
    patch(item.id, { history, resultThumb: thumbnail(item.cut), version: item.version + 1 });
  }, [item, patch]);

  const resetMask = () => {
    if (!item?.raw || !item.original || !item.cut) return;
    snapshot();
    const fresh = buildMask(item.raw, item.width, item.height);
    const ctx = item.mask!.getContext("2d")!;
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(fresh, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    updateCut(item.cut, item.original, item.mask!);
    touch(item.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close, undo]);

  const download = async (format: ExportFormat) => {
    if (!item?.cut || !item.original) return;
    setBusy(format);
    try {
      const blob = await exportImage(item.original, item.cut, item.bg, format);
      downloadBlob(blob, `${baseName(item.name)}-bgremove.${format}`);
      track("download", { format, bg: item.bg.kind, edited: item.history.length > 0 });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    const ready = items.filter((i) => i.status === "done" && i.cut && i.original);
    if (!ready.length) return;
    setBusy("zip");
    try {
      const files: Record<string, [Uint8Array, { level: 0 }]> = {};
      const used = new Set<string>();
      for (const it of ready) {
        const blob = await exportImage(it.original!, it.cut!, it.bg, "png");
        let name = `${baseName(it.name)}-bgremove.png`;
        for (let n = 2; used.has(name); n++) name = `${baseName(it.name)}-bgremove-${n}.png`;
        used.add(name);
        files[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
      }
      const zip = zipSync(files);
      downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `bgremove-${ready.length}-images.zip`);
      track("download_zip", { count: ready.length });
    } finally {
      setBusy(null);
    }
  };

  const applyPhoto = async (url: string) => {
    const image = await loadImg(url);
    setBg({ kind: "image", image, url });
  };

  const uploadBg = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const image = await loadImg(url);
      setBg({ kind: "image", image, url });
    };
    input.click();
  };

  if (!item) return null;

  const doneCount = items.filter((i) => i.status === "done").length;
  const loadingModel = engine.state === "loading" && item.status !== "done" && item.status !== "error";
  const pct = engine.state === "loading" && engine.total ? Math.round((engine.loaded / engine.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Background remover editor">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <button onClick={close} className="shrink-0" aria-label="Back to site">
          <Logo />
        </button>
        <div className="mx-2 hidden h-6 w-px bg-line sm:block" />
        <p className="min-w-0 truncate text-sm font-medium text-ink-soft">
          {item.name}
          {item.width > 0 && <span className="ml-2 text-ink-mute">{item.width} × {item.height}</span>}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => pickFiles()}
            className="hidden rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-mist sm:block"
          >
            {t.addImages}
          </button>
          <button onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-mist" aria-label={t.close}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Stage */}
        <section className="relative flex min-h-[42vh] flex-1 flex-col bg-mist">
          <div className="flex items-center justify-center gap-2 px-3 pt-3">
            {tab === "bg" ? (
              <div className="inline-flex rounded-full bg-white p-1 shadow-card">
                {(["view", "compare"] as const).map((m) => (
                  <button
                    key={m}
                    disabled={!done}
                    onClick={() => setMode(m)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${mode === m ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
                  >
                    {m === "view" ? t.result : t.compare}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-ink-soft shadow-card">
                {brushMode === "erase" ? t.paintErase : t.paintRestore}
              </p>
            )}
            <button
              onClick={undo}
              disabled={!item.history.length}
              className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold text-ink shadow-card disabled:opacity-40"
              aria-label={t.undo}
              title={`${t.undo} (Ctrl/⌘ + Z)`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
              <span className="hidden sm:inline">{t.undo}</span>
            </button>
          </div>

          <div className="relative min-h-0 flex-1 p-4 sm:p-8">
            {item.width > 0 ? (
              <Stage item={item} mode={stageMode} brush={brush} onStrokeStart={snapshot} onStrokeEnd={strokeEnd} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="h-48 w-48 animate-pulse rounded-xl bg-white" />
              </div>
            )}

            {item.status !== "done" && item.status !== "error" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
                <div className="w-full max-w-sm rounded-2xl bg-white/95 px-5 py-4 shadow-card backdrop-blur">
                  <p className="text-sm font-bold text-ink">
                    {loadingModel
                      ? `${t.loadingModel}${pct ? ` · ${pct}%` : "…"}`
                      : item.status === "queued"
                        ? t.queued
                        : t.removing}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-mute">
                    {loadingModel ? t.loadingNote : t.runningNote}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                    {loadingModel && pct ? (
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                    ) : (
                      <div className="animate-shimmer h-full w-full rounded-full bg-[linear-gradient(90deg,transparent,#5940f5,transparent)] bg-[length:200%_100%]" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {item.status === "error" && (
              <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
                <div className="w-full max-w-sm rounded-2xl bg-white px-5 py-4 text-center shadow-card">
                  <p className="text-sm font-bold text-ink">{t.failed}</p>
                  <p className="mt-1 break-words text-xs text-ink-mute">{item.error}</p>
                  <button onClick={() => retry(item.id)} className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                    {t.retry}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Batch strip */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-line bg-white px-3 py-2">
            <button
              onClick={() => pickFiles()}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line text-2xl text-ink-mute hover:border-brand hover:text-brand"
              aria-label="Add more images"
            >
              +
            </button>
            {items.map((it) => (
              <div key={it.id} className="group relative shrink-0">
                <button
                  onClick={() => setActive(it.id)}
                  className={`checker-sm block h-14 w-14 overflow-hidden rounded-lg ring-2 transition ${it.id === item.id ? "ring-brand" : "ring-transparent hover:ring-line"}`}
                  aria-label={`Open ${it.name}`}
                >
                  {(it.resultThumb || it.thumb) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.resultThumb || it.thumb} alt="" className="h-full w-full object-contain" />
                  )}
                  {it.status !== "done" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/50">
                      {it.status === "error" ? (
                        <span className="text-lg font-bold text-pop">!</span>
                      ) : (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                      )}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => removeItem(it.id)}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-white group-hover:flex"
                  aria-label={`Remove ${it.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Side panel */}
        <aside className="flex w-full shrink-0 flex-col border-line bg-white lg:w-[360px] lg:border-l">
          <div className="space-y-2 border-b border-line p-4">
            <button
              disabled={!done || !!busy}
              onClick={() => download("png")}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3.5 text-base font-bold text-white shadow-float transition hover:bg-brand-dark disabled:opacity-50 disabled:shadow-none"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14" /></svg>
              {busy === "png" ? t.preparing : t.download}
            </button>
            <p className="text-center text-xs text-ink-mute">
              {done ? fmt(t.fullRes, { w: item.width, h: item.height }) : t.notReady}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!done || !!busy} onClick={() => download("jpg")} className="rounded-full border border-line py-2 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-40">
                {busy === "jpg" ? "…" : "JPG"}
              </button>
              <button disabled={!done || !!busy} onClick={() => download("webp")} className="rounded-full border border-line py-2 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-40">
                {busy === "webp" ? "…" : "WebP"}
              </button>
            </div>
            {items.length > 1 && (
              <button
                disabled={!doneCount || !!busy}
                onClick={downloadAll}
                className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                {busy === "zip" ? t.zipping : fmt(t.zip, { done: doneCount, total: items.length })}
              </button>
            )}
          </div>

          <div className="flex border-b border-line px-4">
            {([
              ["bg", t.tabBg],
              ["brush", t.tabBrush],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold ${tab === k ? "border-brand text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`flex-1 overflow-y-auto p-4 ${!done ? "pointer-events-none opacity-50" : ""}`}>
            {tab === "bg" ? (
              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">{t.basic}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <Swatch active={item.bg.kind === "transparent"} onClick={() => setBg({ kind: "transparent" })} label={t.transparent}>
                      <span className="checker-sm block h-full w-full" />
                    </Swatch>
                    <Swatch active={item.bg.kind === "blur"} onClick={() => setBg({ kind: "blur", amount: 24 })} label={t.blur}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {item.thumb && <img src={item.thumb} alt="" className="h-full w-full scale-125 object-cover blur-[3px]" />}
                    </Swatch>
                    <Swatch active={sameBg(item.bg, { kind: "color", color: "#ffffff" })} onClick={() => setBg({ kind: "color", color: "#ffffff" })} label={t.white}>
                      <span className="block h-full w-full bg-white" />
                    </Swatch>
                    <label className={`relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg ring-2 ${item.bg.kind === "color" && !COLORS.includes(item.bg.color) ? "ring-brand" : "ring-line"}`} title={t.custom}>
                      <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" />
                      <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-ink">+</span>
                      <input
                        type="color"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        value={item.bg.kind === "color" ? item.bg.color : "#5940f5"}
                        onChange={(e) => setBg({ kind: "color", color: e.target.value })}
                        aria-label="Pick a custom background colour"
                      />
                    </label>
                  </div>
                  {item.bg.kind === "blur" && (
                    <div className="mt-3">
                      <label className="flex items-center justify-between text-xs font-semibold text-ink-soft">
                        {t.blurStrength} <span>{item.bg.amount}</span>
                      </label>
                      <input
                        type="range"
                        min={6}
                        max={60}
                        step={2}
                        value={item.bg.amount}
                        onChange={(e) => setBg({ kind: "blur", amount: Number(e.target.value) })}
                        className="slider mt-2 w-full"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">{t.colors}</h3>
                  <div className="grid grid-cols-8 gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setBg({ kind: "color", color: c })}
                        className={`aspect-square rounded-md ring-2 ring-offset-1 ${sameBg(item.bg, { kind: "color", color: c }) ? "ring-brand" : "ring-transparent"} border border-black/10`}
                        style={{ background: c }}
                        aria-label={`Background colour ${c}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">{t.gradients}</h3>
                  <div className="grid grid-cols-6 gap-1.5">
                    {GRADIENTS.map(([from, to]) => (
                      <button
                        key={from + to}
                        onClick={() => setBg({ kind: "gradient", from, to })}
                        className={`aspect-square rounded-md ring-2 ring-offset-1 ${sameBg(item.bg, { kind: "gradient", from, to }) ? "ring-brand" : "ring-transparent"}`}
                        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                        aria-label={`Gradient ${from} to ${to}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-mute">{t.photos}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={uploadBg}
                      className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand"
                    >
                      <span className="text-lg leading-none">↑</span>
                      {t.uploadBg}
                    </button>
                    {PHOTOS.map((p) => {
                      const url = `/backgrounds/${p}.jpg`;
                      return (
                        <button
                          key={p}
                          onClick={() => applyPhoto(url)}
                          className={`aspect-[4/3] overflow-hidden rounded-lg ring-2 ring-offset-1 ${sameBg(item.bg, { kind: "image", image: null as never, url }) ? "ring-brand" : "ring-transparent"}`}
                          aria-label={`${p} background`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/backgrounds/${p}-thumb.jpg`} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {(["erase", "restore"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setBrushMode(m)}
                      className={`rounded-xl border-2 px-3 py-3 text-left transition ${brushMode === m ? (m === "erase" ? "border-pop bg-pop/5" : "border-mint bg-mint/5") : "border-line hover:bg-mist"}`}
                    >
                      <span className="block text-sm font-bold text-ink">{m === "erase" ? t.erase : t.restore}</span>
                      <span className="block text-xs text-ink-mute">{m === "erase" ? t.eraseHint : t.restoreHint}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-ink-soft">
                    {t.brushSize} <span>{brush}px</span>
                  </label>
                  <input type="range" min={6} max={160} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="slider mt-2 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={undo} disabled={!item.history.length} className="rounded-full border border-line py-2 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-40">
                    {t.undo}
                  </button>
                  <button onClick={resetMask} className="rounded-full border border-line py-2 text-sm font-semibold text-ink hover:bg-mist">
                    {t.reset}
                  </button>
                </div>
                <p className="rounded-xl bg-mist p-3 text-xs leading-relaxed text-ink-soft">{t.tip}</p>
              </div>
            )}
          </div>

          {item.ms !== undefined && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-ink-mute">
              {fmt(t.processedIn, { s: (item.ms / 1000).toFixed(1) })}
              {engine.state === "ready" && ` · ${engine.device === "webgpu" ? "GPU" : "CPU"}`}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Swatch({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`aspect-square overflow-hidden rounded-lg ring-2 ${active ? "ring-brand" : "ring-line"}`}
    >
      {children}
    </button>
  );
}
