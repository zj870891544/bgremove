import type { MetadataRoute } from "next";
import { pages } from "@/content/pages";
import { isLocalizedSlug, localizedSlugs, nonDefaultLocales, pageAlternates } from "@/i18n/config";
import { site } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const languages = pageAlternates("", site.url);
  const homes = [
    { url: site.url, lastModified, changeFrequency: "weekly" as const, priority: 1, alternates: { languages } },
    ...nonDefaultLocales.map((code) => ({
      url: `${site.url}/${code}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
      alternates: { languages },
    })),
  ];
  const tools = pages
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${site.url}/${p.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
      ...(isLocalizedSlug(p.slug) ? { alternates: { languages: pageAlternates(p.slug, site.url) } } : {}),
    }));
  const localizedTools = localizedSlugs.flatMap((slug) =>
    nonDefaultLocales.map((code) => ({
      url: `${site.url}/${code}/${slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      alternates: { languages: pageAlternates(slug, site.url) },
    }))
  );
  const legal = ["about", "privacy", "terms"].map((s) => ({
    url: `${site.url}/${s}`,
    lastModified,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));
  return [...homes, ...tools, ...localizedTools, ...legal];
}
