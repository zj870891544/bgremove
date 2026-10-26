/** English lives at the site root; every other language at /{code}. */
export const locales = [
  { code: "en", name: "English", hreflang: "en" },
  { code: "es", name: "Español", hreflang: "es" },
  { code: "pt", name: "Português", hreflang: "pt" },
  { code: "fr", name: "Français", hreflang: "fr" },
  { code: "de", name: "Deutsch", hreflang: "de" },
  { code: "it", name: "Italiano", hreflang: "it" },
  { code: "pl", name: "Polski", hreflang: "pl" },
  { code: "ru", name: "Русский", hreflang: "ru" },
  { code: "tr", name: "Türkçe", hreflang: "tr" },
  { code: "id", name: "Bahasa Indonesia", hreflang: "id" },
  { code: "vi", name: "Tiếng Việt", hreflang: "vi" },
  { code: "ja", name: "日本語", hreflang: "ja" },
  { code: "ko", name: "한국어", hreflang: "ko" },
  { code: "zh", name: "简体中文", hreflang: "zh-Hans" },
] as const;

export type Locale = (typeof locales)[number]["code"];
export type NonDefaultLocale = Exclude<Locale, "en">;

export const defaultLocale: Locale = "en";

export const nonDefaultLocales = locales.filter((l) => l.code !== "en").map((l) => l.code) as NonDefaultLocale[];

export function isLocale(v: string): v is Locale {
  return locales.some((l) => l.code === v);
}

/** Home URL path of a language. */
export function localeHome(code: Locale) {
  return code === "en" ? "/" : `/${code}`;
}

/** Keyword pages that exist in every language (the rest are English-only). */
export const localizedSlugs = ["transparent-background", "white-background", "change-background-color"] as const;
export type LocalizedSlug = (typeof localizedSlugs)[number];

export function isLocalizedSlug(slug: string): slug is LocalizedSlug {
  return (localizedSlugs as readonly string[]).includes(slug);
}

/** URL path of a page ("" = home) in a language. */
export function localePath(code: Locale, slug = "") {
  if (!slug) return localeHome(code);
  return code === "en" ? `/${slug}` : `/${code}/${slug}`;
}

/** hreflang map for a page that exists in every language, for <link rel="alternate"> and the sitemap. */
export function pageAlternates(slug = "", absolute = "") {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l.hreflang] = `${absolute}${localePath(l.code, slug)}`;
  languages["x-default"] = `${absolute}${localePath("en", slug)}`;
  return languages;
}

export function homeAlternates(absolute = "") {
  return pageAlternates("", absolute);
}
