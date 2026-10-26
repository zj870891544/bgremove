import { notFound } from "next/navigation";
import SiteShell from "@/components/SiteShell";
import { isLocale, nonDefaultLocales } from "@/i18n/config";
import { baseMetadata, baseViewport } from "@/lib/seo";
import "../globals.css";

export const dynamicParams = false;
export const metadata = baseMetadata;
export const viewport = baseViewport;

export function generateStaticParams() {
  return nonDefaultLocales.map((lang) => ({ lang }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang) || lang === "en") notFound();
  return <SiteShell locale={lang}>{children}</SiteShell>;
}
