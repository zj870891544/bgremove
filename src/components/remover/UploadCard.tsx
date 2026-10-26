"use client";

import { useEffect, useState } from "react";
import { warmUp } from "@/lib/remover/engine";
import type { BgPreset } from "@/content/pages";
import { useI18n } from "@/i18n/I18nProvider";
import { useRemover } from "./RemoverProvider";

export const SAMPLES = ["woman", "dog", "headphones", "plant"] as const;

export default function UploadCard({ preset }: { preset?: BgPreset }) {
  const { pickFiles, addUrl, setPreset } = useRemover();
  const { ui } = useI18n();
  const t = ui.upload;
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    setPreset(preset);
    return () => setPreset(undefined);
  }, [preset, setPreset]);

  const submitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^https?:\/\//i.test(url.trim())) {
      setError(t.badUrl);
      return;
    }
    setLoadingUrl(true);
    try {
      await addUrl(url.trim(), preset);
      setUrl("");
    } catch {
      setError(t.urlFailed);
    } finally {
      setLoadingUrl(false);
    }
  };

  return (
    <div className="relative rounded-[28px] bg-white p-6 shadow-card ring-1 ring-line sm:p-8" onPointerEnter={warmUp}>
      <div className="rounded-2xl border-2 border-dashed border-brand/25 bg-mist/50 px-5 py-9 text-center">
        <button
          type="button"
          onClick={() => pickFiles(preset)}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-lg font-bold text-white shadow-float transition hover:-translate-y-0.5 hover:bg-brand-dark focus-visible:outline-4 focus-visible:outline-brand/30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          {t.button}
        </button>
        <p className="mt-4 text-sm font-medium text-ink-soft">
          {t.or}{" "}
          <button type="button" onClick={() => setShowUrl((v) => !v)} className="font-semibold text-brand underline-offset-2 hover:underline">
            {t.enterUrl}
          </button>
        </p>
        {showUrl && (
          <form onSubmit={submitUrl} className="mx-auto mt-4 flex max-w-md gap-2">
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
              aria-label="Image URL"
              autoFocus
            />
            <button type="submit" disabled={loadingUrl} className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {loadingUrl ? "…" : t.go}
            </button>
          </form>
        )}
        {error && <p className="mx-auto mt-2 max-w-md text-xs text-pop">{error}</p>}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-sm font-semibold text-ink-soft">
          {t.noImage}
          <br className="hidden sm:block" /> {t.tryThese}
        </p>
        <div className="flex gap-2">
          {SAMPLES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => addUrl(`/samples/${id}.jpg`, preset)}
              className="h-14 w-14 overflow-hidden rounded-xl ring-2 ring-transparent transition hover:-translate-y-0.5 hover:ring-brand sm:h-16 sm:w-16"
              aria-label={`${t.tryThese.replace(/[:：]\s*$/, "")}: ${t.samples[id]}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/samples/${id}-thumb.jpg`} alt={t.samples[id]} className="h-full w-full object-cover" width={64} height={64} />
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 flex items-center gap-2 text-xs text-ink-mute">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        {t.privacy}
      </p>
    </div>
  );
}
