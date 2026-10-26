import type { Metadata, Viewport } from "next";
import type { LandingContent } from "@/content/pages";
import { type Locale, isLocalizedSlug, localePath, pageAlternates } from "@/i18n/config";
import { site } from "./site";

export const baseMetadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} – Remove BG from Images Free`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  formatDetection: { telephone: false },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const baseViewport: Viewport = {
  themeColor: "#5940f5",
  width: "device-width",
  initialScale: 1,
};

export function landingMetadata(p: LandingContent, locale: Locale = "en"): Metadata {
  const path = localePath(locale, p.slug);
  const multilingual = !p.slug || isLocalizedSlug(p.slug);
  return {
    title: { absolute: p.metaTitle },
    description: p.metaDescription,
    keywords: [p.keyword, "remove bg", "removebg", "remove background", "background remover", "background remove", "bg remove", "transparent background", "remove background from image"],
    // Home and the localized keyword pages exist in every language; the rest are English-only.
    alternates: multilingual ? { canonical: path, languages: pageAlternates(p.slug) } : { canonical: path },
    openGraph: {
      type: "website",
      locale,
      url: path,
      siteName: site.name,
      title: p.metaTitle,
      description: p.metaDescription,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "BGRemove – free AI background remover" }],
    },
    twitter: {
      card: "summary_large_image",
      title: p.metaTitle,
      description: p.metaDescription,
      images: ["/og.png"],
    },
  };
}
