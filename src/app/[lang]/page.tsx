import { notFound } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import { isLocale } from "@/i18n/config";
import { getLocaleHome } from "@/i18n";
import { landingMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang) || lang === "en") return {};
  return landingMetadata(getLocaleHome(lang), lang);
}

export default async function LocaleHome({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang) || lang === "en") notFound();
  return <LandingPage content={getLocaleHome(lang)} locale={lang} />;
}
