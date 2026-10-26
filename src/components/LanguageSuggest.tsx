"use client";

import { useEffect, useState } from "react";
import { type Locale, isLocalizedSlug, locales } from "@/i18n/config";
import { currentSlug, equivalentPath } from "./LanguageMenu";
import { useI18n } from "@/i18n/I18nProvider";

const KEY = "bgremove:lang-suggest-dismissed";

/**
 * On English pages that are translated, offer the visitor's browser language if we have it.
 * A suggestion instead of an automatic redirect keeps every URL crawlable as-is.
 */
export default function LanguageSuggest() {
  const { locale } = useI18n();
  const [target, setTarget] = useState<Locale | null>(null);

  useEffect(() => {
    const slug = currentSlug(location.pathname);
    if (locale !== "en" || (slug && !isLocalizedSlug(slug))) return;
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      // Storage blocked: still fine to show the suggestion.
    }
    for (const pref of navigator.languages ?? [navigator.language]) {
      const base = pref.toLowerCase().split("-")[0];
      if (base === "en") return;
      const hit = locales.find((l) => l.code === base);
      if (hit) {
        // Deferred so the banner never blocks first paint.
        const t = setTimeout(() => setTarget(hit.code), 0);
        return () => clearTimeout(t);
      }
    }
  }, [locale]);

  if (!target) return null;
  const l = locales.find((x) => x.code === target)!;
  const dismiss = () => {
    setTarget(null);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-white" lang={l.hreflang}>
      <span>
        {SUGGEST[target] ?? "This page is available in"} <b>{l.name}</b>
      </span>
      <a href={equivalentPath(location.pathname, target)} hrefLang={l.hreflang} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink hover:bg-brand-soft">
        {l.name} →
      </a>
      <button onClick={dismiss} aria-label="Dismiss" className="ml-1 text-white/70 hover:text-white">
        ×
      </button>
    </div>
  );
}

/** Shown in the visitor's own language, so it can't come from the (English) page dictionary. */
const SUGGEST: Partial<Record<Locale, string>> = {
  es: "Esta página está disponible en",
  pt: "Esta página está disponível em",
  fr: "Cette page est disponible en",
  de: "Diese Seite gibt es auch auf",
  it: "Questa pagina è disponibile in",
  pl: "Ta strona jest dostępna w języku",
  ru: "Эта страница доступна на языке:",
  tr: "Bu sayfa şu dilde de mevcut:",
  id: "Halaman ini tersedia dalam",
  vi: "Trang này có bằng",
  ja: "このページは次の言語でもご覧いただけます：",
  ko: "이 페이지는 다음 언어로도 제공됩니다:",
  zh: "本页面提供以下语言版本：",
};
