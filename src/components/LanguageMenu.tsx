"use client";

import { usePathname } from "next/navigation";
import { type Locale, isLocale, isLocalizedSlug, localePath, locales } from "@/i18n/config";

/** The page's path without its language prefix: "" for a home page, else the slug. */
export function currentSlug(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] && isLocale(parts[0])) parts.shift();
  return parts.join("/");
}

/** Where a language link should point: the same page if it is translated, otherwise that language's home. */
export function equivalentPath(pathname: string, target: Locale) {
  const slug = currentSlug(pathname);
  return localePath(target, slug && isLocalizedSlug(slug) ? slug : "");
}

const globe = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

export default function LanguageMenu({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() || "/";
  const current = locales.find((l) => l.code === locale)!;
  return (
    <details className="group relative">
      <summary
        className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-ink-soft hover:bg-mist hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={label}
      >
        {globe}
        <span className="hidden sm:inline xl:hidden 2xl:inline">{current.name}</span>
      </summary>
      <div className="absolute right-0 top-12 grid max-h-[70vh] w-56 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-card">
        {locales.map((l) => (
          <a
            key={l.code}
            href={equivalentPath(pathname, l.code)}
            hrefLang={l.hreflang}
            lang={l.hreflang}
            className={`rounded-xl px-3 py-2 text-sm hover:bg-mist ${l.code === locale ? "font-bold text-brand" : "text-ink"}`}
          >
            {l.name}
          </a>
        ))}
      </div>
    </details>
  );
}
