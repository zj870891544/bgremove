import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import Header, { type NavItem } from "@/components/Header";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import LanguageSuggest from "@/components/LanguageSuggest";
import RemoverProvider from "@/components/remover/RemoverProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { type Locale, localePath, locales } from "@/i18n/config";
import { getUi, localeLinks } from "@/i18n";
import { mainNav, site } from "@/lib/site";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
});

const gaId = process.env.NEXT_PUBLIC_GA_ID;
const cfBeacon = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

/** <html> … </html> shared by the English and the localized root layouts. */
export default function SiteShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const ui = getUi(locale);
  const home = locale === "en" ? "/" : `/${locale}`;
  const nav: NavItem[] =
    locale === "en"
      ? mainNav
      : localeLinks(locale).map((l) => ({ href: localePath(locale, l.slug), label: l.label }));
  const htmlLang = locales.find((l) => l.code === locale)!.hreflang;

  return (
    <html lang={htmlLang} className={`${jakarta.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: site.name,
              alternateName: ["BG Remove", "BGRemove.cc"],
              url: site.url,
              inLanguage: locales.map((l) => l.hreflang),
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: site.name,
              url: site.url,
              logo: `${site.url}/logo.png`,
              email: site.email,
            },
          ]}
        />
        <I18nProvider locale={locale} ui={ui}>
          <RemoverProvider>
            <LanguageSuggest />
            <Header nav={nav} home={home} ui={ui} locale={locale} />
            <main className="flex-1">{children}</main>
            <Footer locale={locale} ui={ui} />
          </RemoverProvider>
        </I18nProvider>
        {cfBeacon && (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfBeacon })}
            strategy="afterInteractive"
          />
        )}
        {plausibleDomain && (
          <Script src="https://plausible.io/js/script.js" data-domain={plausibleDomain} strategy="afterInteractive" />
        )}
        {gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
