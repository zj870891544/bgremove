import type { LandingContent } from "@/content/pages";
import type { Locale, LocalizedSlug, NonDefaultLocale } from "./config";
import en, { type UiDict } from "./ui/en";
import de from "./locales/de";
import es from "./locales/es";
import fr from "./locales/fr";
import id from "./locales/id";
import it from "./locales/it";
import ja from "./locales/ja";
import ko from "./locales/ko";
import pl from "./locales/pl";
import pt from "./locales/pt";
import ru from "./locales/ru";
import tr from "./locales/tr";
import vi from "./locales/vi";
import zh from "./locales/zh";
import dePages from "./pages/de";
import esPages from "./pages/es";
import frPages from "./pages/fr";
import idPages from "./pages/id";
import itPages from "./pages/it";
import jaPages from "./pages/ja";
import koPages from "./pages/ko";
import plPages from "./pages/pl";
import ptPages from "./pages/pt";
import ruPages from "./pages/ru";
import trPages from "./pages/tr";
import viPages from "./pages/vi";
import zhPages from "./pages/zh";

/** A localized keyword page; its two generic FAQs (free, privacy) are borrowed from the home page. */
export type LocalePage = { label: string; content: LandingContent };
export type LocaleBundle = { ui: UiDict; home: LandingContent };
export type LocalePages = Record<LocalizedSlug, LocalePage>;

const bundles: Record<NonDefaultLocale, LocaleBundle & { pages: LocalePages }> = {
  es: { ...es, pages: esPages },
  pt: { ...pt, pages: ptPages },
  fr: { ...fr, pages: frPages },
  de: { ...de, pages: dePages },
  it: { ...it, pages: itPages },
  pl: { ...pl, pages: plPages },
  ru: { ...ru, pages: ruPages },
  tr: { ...tr, pages: trPages },
  id: { ...id, pages: idPages },
  vi: { ...vi, pages: viPages },
  ja: { ...ja, pages: jaPages },
  ko: { ...ko, pages: koPages },
  zh: { ...zh, pages: zhPages },
};

export function getUi(locale: Locale): UiDict {
  return locale === "en" ? en : bundles[locale].ui;
}

export function getLocaleHome(locale: NonDefaultLocale): LandingContent {
  return bundles[locale].home;
}

export function getLocalePage(locale: NonDefaultLocale, slug: LocalizedSlug): LocalePage {
  const b = bundles[locale];
  const page = b.pages[slug];
  return { ...page, content: { ...page.content, faqs: [...page.content.faqs, b.home.faqs[0], b.home.faqs[1]] } };
}

/** Home + localized keyword pages of a language, for nav, footer and "related" links. */
export function localeLinks(locale: Locale): { slug: string; label: string }[] {
  if (locale === "en") return [];
  const b = bundles[locale];
  return [{ slug: "", label: b.ui.nav.home }, ...Object.entries(b.pages).map(([slug, p]) => ({ slug, label: p.label }))];
}
