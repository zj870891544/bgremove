import Link from "next/link";
import { type Locale, localeHome, localePath, locales } from "@/i18n/config";
import { localeLinks } from "@/i18n";
import type { UiDict } from "@/i18n/ui/en";
import { footerNav, site } from "@/lib/site";
import { Logo } from "./Logo";

type Col = { title: string; links: { href: string; label: string }[] };

export default function Footer({ locale, ui }: { locale: Locale; ui: UiDict }) {
  const company: Col = {
    title: ui.footer.company,
    links: [
      { href: "/about", label: ui.footer.about },
      { href: "/privacy", label: ui.footer.privacy },
      { href: "/terms", label: ui.footer.terms },
      { href: `mailto:${site.email}`, label: ui.footer.contact },
    ],
  };
  // English keeps its keyword-rich tool columns; other languages link to their own sections.
  const cols: Col[] =
    locale === "en"
      ? [...footerNav.slice(0, 2), company]
      : [
          {
            title: ui.footer.tools,
            links: localeLinks(locale).map((l) => ({ href: localePath(locale, l.slug), label: l.label })),
          },
          company,
        ];

  return (
    <footer className="mt-24 border-t border-line bg-mist/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">{ui.footer.tagline}</p>
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <h2 className="text-sm font-bold text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("mailto:") ? (
                    <a href={l.href} className="text-sm text-ink-soft hover:text-brand">{l.label}</a>
                  ) : (
                    <Link href={l.href} className="text-sm text-ink-soft hover:text-brand">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="text-sm font-bold text-ink">{ui.footer.languages}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-1">
            {locales.map((l) => (
              <li key={l.code}>
                <a href={localeHome(l.code)} hrefLang={l.hreflang} lang={l.hreflang} className={`text-sm hover:text-brand ${l.code === locale ? "font-bold text-ink" : "text-ink-soft"}`}>
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} {site.domain}. {ui.footer.rights}</p>
          <p>{ui.footer.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
