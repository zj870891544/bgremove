export default function TextPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      {updated && <p className="mt-2 text-sm text-ink-mute">Last updated: {updated}</p>}
      <div className="mt-8 space-y-4 text-[17px] leading-relaxed text-ink-soft [&_a]:text-brand [&_a]:underline [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </article>
  );
}
