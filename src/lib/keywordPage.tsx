import LandingPage from "@/components/LandingPage";
import { pageBySlug } from "@/content/pages";
import { landingMetadata } from "@/lib/seo";

/** One English keyword landing page (route files stay one-liners). */
export function keywordPage(slug: string) {
  const content = pageBySlug.get(slug);
  if (!content) throw new Error(`Unknown landing page: ${slug}`);
  return {
    metadata: landingMetadata(content),
    Page: function KeywordPage() {
      return <LandingPage content={content} />;
    },
  };
}
