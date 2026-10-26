"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { drawBackground, type Rect, updateCut } from "@/lib/remover/render";
import { useI18n } from "@/i18n/I18nProvider";
import type { Item } from "./RemoverProvider";

export type StageMode = "view" | "compare" | "erase" | "restore";

type Props = {
  item: Item;
  mode: StageMode;
  brush: number;
  onStrokeStart: () => void;
  onStrokeEnd: () => void;
};

export default function Stage({ item, mode, brush, onStrokeStart, onStrokeEnd }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [split, setSplit] = useState(0.5);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const { ui } = useI18n();

  const { width: iw, height: ih } = item;

  // Fit the image inside the available area.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = iw && ih && box.w && box.h ? Math.min(box.w / iw, box.h / ih, 1.5) : 0;
  const dw = Math.round(iw * scale);
  const dh = Math.round(ih * scale);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const { original, cut } = item;
    if (!canvas || !original || !dw) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(dw * dpr);
    const ch = Math.round(dh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cw, ch);
    if (!cut) {
      ctx.drawImage(original, 0, 0, cw, ch);
      return;
    }
    drawBackground(ctx, item.bg, original, cw, ch);
    if (mode === "erase" || mode === "restore") {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(original, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(cut, 0, 0, cw, ch);
    if (mode === "compare") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cw * split, ch);
      ctx.clip();
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(original, 0, 0, cw, ch);
      ctx.restore();
    }
  }, [item, dw, dh, mode, split]);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf.current);
  }, [paint, item.version]);

  const toImage = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * iw, y: ((e.clientY - r.top) / r.height) * ih, r };
  };

  const strokeTo = (to: { x: number; y: number }) => {
    const { mask, cut, original } = item;
    if (!mask || !cut || !original) return;
    const from = drawing.current ?? to;
    const radius = brush / 2 / scale;
    const ctx = mask.getContext("2d")!;
    ctx.save();
    ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y + 0.01);
    ctx.stroke();
    ctx.restore();
    const pad = radius + 2;
    const rect: Rect = {
      x: Math.floor(Math.min(from.x, to.x) - pad),
      y: Math.floor(Math.min(from.y, to.y) - pad),
      w: Math.ceil(Math.abs(to.x - from.x) + pad * 2),
      h: Math.ceil(Math.abs(to.y - from.y) + pad * 2),
    };
    updateCut(cut, original, mask, rect);
    drawing.current = to;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);
  };

  const brushing = (mode === "erase" || mode === "restore") && item.status === "done";

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === "compare") {
      dragSplit(e);
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (!brushing) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    onStrokeStart();
    const p = toImage(e);
    drawing.current = null;
    strokeTo(p);
  };

  const dragSplit = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    setSplit(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === "compare") {
      if (e.buttons) dragSplit(e);
      return;
    }
    if (!brushing) return;
    const r = canvasRef.current!.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    if (drawing.current && e.buttons) strokeTo(toImage(e));
  };

  const endStroke = () => {
    if (drawing.current) {
      drawing.current = null;
      onStrokeEnd();
    }
  };

  const showChecker = item.bg.kind === "transparent" || item.status !== "done";

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center">
      {dw > 0 && (
        <div
          className={`relative overflow-hidden rounded-xl shadow-card ${showChecker ? "checker" : "bg-white"}`}
          style={{ width: dw, height: dh }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none select-none"
            style={{ cursor: brushing ? "none" : mode === "compare" ? "ew-resize" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => setCursor(null)}
          />
          {(item.status === "processing" || item.status === "queued" || item.status === "loading") && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-0 bg-white/30" />
              <div className="animate-scan absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-brand/40 to-transparent" />
            </div>
          )}
          {mode === "compare" && item.status === "done" && (
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split * 100}%` }}>
              <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
              <div className="absolute top-1/2 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-card">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg>
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{ui.editor.after}</span>
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{ui.editor.before}</span>
            </div>
          )}
          {brushing && cursor && (
            <div
              className={`pointer-events-none absolute rounded-full border-2 ${mode === "erase" ? "border-pop bg-pop/15" : "border-mint bg-mint/15"}`}
              style={{ width: brush, height: brush, left: cursor.x - brush / 2, top: cursor.y - brush / 2 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
