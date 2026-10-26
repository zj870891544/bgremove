import { notFound } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import { isLocale, isLocalizedSlug, localizedSlugs } from "@/i18n/config";
import { getLocalePage } from "@/i18n";
import { landingMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return localizedSlugs.map((slug) => ({ slug }));
}

async function resolve(params: PageProps<"/[lang]/[slug]">["params"]) {
  const { lang, slug } = await params;
  if (!isLocale(lang) || lang === "en" || !isLocalizedSlug(slug)) return null;
  return { lang, page: getLocalePage(lang, slug) };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/[slug]">) {
  const r = await resolve(params);
  return r ? landingMetadata(r.page.content, r.lang) : {};
}

export default async function LocaleKeywordPage({ params }: PageProps<"/[lang]/[slug]">) {
  const r = await resolve(params);
  if (!r) notFound();
  return <LandingPage content={r.page.content} locale={r.lang} label={r.page.label} />;
}
