"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  before: string;
  after: string;
  alt: string;
  /** CSS background placed behind the cut-out. Defaults to the transparency checkerboard. */
  backdrop?: string;
  auto?: boolean;
  className?: string;
  priority?: boolean;
};

/** Before/after slider used for marketing visuals. Auto-sweeps until the user drags it. */
export default function CompareDemo({ before, after, alt, backdrop, auto = false, className = "", priority = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!auto || touched) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      setPos(50 + Math.sin((t - t0) / 1400) * 38);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, touched]);

  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden ${backdrop ? "" : "checker"} ${className}`}
      style={backdrop ? { background: backdrop } : undefined}
      onPointerDown={(e) => {
        setTouched(true);
        (e.target as Element).setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
      role="slider"
      aria-label={`Before and after: ${alt}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { setTouched(true); setPos((p) => Math.max(0, p - 5)); }
        if (e.key === "ArrowRight") { setTouched(true); setPos((p) => Math.min(100, p + 5)); }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`${alt} with background removed`} className="pointer-events-none block h-full w-full object-cover" draggable={false} loading={priority ? "eager" : "lazy"} />
      <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${alt} original`} className="block h-full w-full object-cover" draggable={false} loading={priority ? "eager" : "lazy"} />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90 shadow" />
        <div className="absolute top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-card">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f1020" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg>
        </div>
      </div>
    </div>
  );
}
