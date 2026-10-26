import Link from "next/link";
import { type LandingContent, pageBySlug, pageLabel } from "@/content/pages";
import { type Locale, localePath, locales } from "@/i18n/config";
import { getUi, localeLinks } from "@/i18n";
import { fmt } from "@/i18n/ui/en";
import { site } from "@/lib/site";
import CompareDemo from "./CompareDemo";
import JsonLd from "./JsonLd";
import UploadButton from "./UploadButton";
import UploadCard from "./remover/UploadCard";

const EXAMPLES = [
  { id: "woman", backdrop: undefined },
  { id: "dog", backdrop: "linear-gradient(135deg,#fbc2eb,#a6c1ee)" },
  { id: "headphones", backdrop: "#ffffff" },
  { id: "plant", backdrop: "center/cover url(/backgrounds/studio.jpg)" },
] as const;

const FEATURE_ICONS = [
  "M12 3v18M3 12h18",
  "M4 4h16v16H4zM4 9h16M9 4v16",
  "M12 11V7a4 4 0 1 1 8 0M5 11h14v10H5z",
  "m15 5 4 4L8 20H4v-4z",
  "M3 7h18M3 12h18M3 17h18",
  "M4 16l4-4 4 4 8-8",
];

export default function LandingPage({ content, locale = "en", label }: { content: LandingContent; locale?: Locale; label?: string }) {
  const ui = getUi(locale);
  const t = ui.page;
  const isHome = !content.slug;
  const path = localePath(locale, content.slug);
  const url = `${site.url}${path === "/" ? "" : path}`;
  const pageName = label ?? (isHome ? ui.nav.home : pageLabel[content.slug]);
  const homeUrl = `${site.url}${locale === "en" ? "" : localePath(locale)}`;
  const related =
    locale === "en"
      ? content.related.filter((slug) => pageBySlug.has(slug)).map((slug) => ({ slug, label: pageLabel[slug] }))
      : localeLinks(locale).filter((l) => l.slug !== content.slug);

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${site.name} – ${pageName}`,
      url,
      inLanguage: locales.find((l) => l.code === locale)!.hreflang,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires a modern browser with WebAssembly",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: content.metaDescription,
      featureList: t.features.map((f) => f.title).join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  if (content.slug) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "BGRemove", item: homeUrl },
        { "@type": "ListItem", position: 2, name: pageLabel[content.slug], item: url },
      ],
    });
  }

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero */}
      <section className="hero-glow relative">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24 lg:pt-16">
          <div className="order-1">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" /> {t.badge}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl xl:text-[3.5rem]">
              {content.h1}
              <span className="text-gradient block">{content.h1Accent}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">{content.sub}</p>
            <div className="mt-8 hidden lg:block">
              <CompareDemo
                before="/samples/woman-800.webp"
                after="/samples/woman-cut.webp"
                alt={fmt(t.exampleAlt, { page: pageName, subject: t.examples.woman })}
                auto
                priority
                className="aspect-[16/10] w-full max-w-lg rounded-3xl shadow-card [&_img]:object-[50%_22%]"
              />
            </div>
          </div>
          <div className="order-2">
            <UploadCard preset={content.defaultBg} />
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              {t.checks.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#19c39c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Intro + examples */}
      <section id="examples" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{content.intro.heading}</h2>
          <div className="prose-seo mt-5 text-lg leading-relaxed text-ink-soft">
            {content.intro.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {EXAMPLES.map((ex) => (
            <figure key={ex.id} className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line">
              <CompareDemo
                before={`/samples/${ex.id}-800.webp`}
                after={`/samples/${ex.id}-cut.webp`}
                alt={fmt(t.exampleAlt, { page: pageName, subject: t.examples[ex.id] })}
                backdrop={ex.backdrop}
                className="aspect-square w-full"
              />
              <figcaption className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
                {t.examples[ex.id]}
                <span className="text-xs font-medium text-ink-mute">{t.dragToCompare}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-to" className="bg-mist/70">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            {content.howTo}
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {content.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-line">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <UploadButton className="rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-float transition hover:bg-brand-dark">
              {t.tryNow}
            </UploadButton>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">{t.featuresTitle}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f, i) => (
            <div key={f.title} className="rounded-2xl p-6 ring-1 ring-line transition hover:shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={FEATURE_ICONS[i]} /></svg>
              </span>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-[32px] bg-ink px-6 py-14 text-white sm:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.useCasesTitle}</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {content.useCases.map((u) => (
              <div key={u.title}>
                <h3 className="text-lg font-bold">{u.title}</h3>
                <p className="mt-2 leading-relaxed text-white/70">{u.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Article */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {content.article.map((a) => (
          <article key={a.heading} className="mb-12 last:mb-0">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{a.heading}</h2>
            <div className="prose-seo mt-4 text-[17px] leading-relaxed text-ink-soft">
              {a.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">{t.faqTitle}</h2>
        <div className="mt-8 divide-y divide-line rounded-2xl ring-1 ring-line">
          {content.faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-bold">
                <h3>{f.q}</h3>
                <span className="text-xl text-brand transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Related tools */}
      {related.length > 0 && (
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-extrabold tracking-tight">{t.relatedTitle}</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {related.map((r) => (
              <Link
                key={r.slug}
                href={localePath(locale, r.slug)}
                className="group flex items-center justify-between rounded-2xl px-5 py-4 font-semibold ring-1 ring-line transition hover:bg-mist hover:ring-brand/40"
              >
                {r.label}
                <span className="text-brand transition group-hover:translate-x-1">→</span>
              </Link>
            ))}
        </div>
      </section>
      )}

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="hero-glow flex flex-col items-center rounded-[32px] bg-brand-soft/60 px-6 py-14 text-center ring-1 ring-brand/10">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            {content.keyword === "remove.bg alternative" ? "Ready to try the free alternative?" : t.ctaTitle}
          </h2>
          <p className="mt-3 max-w-xl text-ink-soft">{t.ctaSub}</p>
          <UploadButton className="mt-7 rounded-full bg-brand px-8 py-4 text-lg font-bold text-white shadow-float transition hover:bg-brand-dark" />
        </div>
      </section>
    </>
  );
}
