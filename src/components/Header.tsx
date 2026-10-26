import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { UiDict } from "@/i18n/ui/en";
import LanguageMenu from "./LanguageMenu";
import { Logo } from "./Logo";
import UploadButton from "./UploadButton";

export type NavItem = { href: string; label: string };

export default function Header({ nav, home, ui, locale }: { nav: NavItem[]; home: string; ui: UiDict; locale: Locale }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href={home} aria-label="BGRemove home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-mist hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LanguageMenu locale={locale} label={ui.nav.language} />
          <UploadButton className="hidden whitespace-nowrap rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand sm:inline-flex" />
          <details className="group relative xl:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-mist [&::-webkit-details-marker]:hidden" aria-label={ui.nav.menu}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 top-12 w-64 rounded-2xl border border-line bg-white p-2 shadow-card">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-mist">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
