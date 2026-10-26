import type { Metadata } from "next";
import TextPage from "@/components/TextPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "BGRemove processes your images locally in your browser. Read how we handle data.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <TextPage title="Privacy Policy" updated="October 25, 2026">
      <p>
        This policy explains what information {site.domain} (&quot;BGRemove&quot;, &quot;we&quot;) handles when you use the website.
      </p>
      <h2>Your images</h2>
      <p>
        <strong>Images you process are not uploaded to our servers.</strong> Background removal runs inside your browser. Your files stay in your
        device&apos;s memory while the tab is open and are discarded when you close it or remove them from the editor. If you load an image from
        a URL, your browser fetches it directly from that address.
      </p>
      <h2>AI model downloads</h2>
      <p>
        The first time you use the tool, your browser downloads the AI model and runtime files from public content delivery networks (such as
        Hugging Face and jsDelivr). Those providers receive standard request data like your IP address and user agent, as with any web request.
        The files are cached in your browser for later visits.
      </p>
      <h2>Analytics and advertising</h2>
      <p>
        We may use privacy-respecting analytics (for example Google Analytics) to understand aggregate usage such as page views and device types.
        If we show ads, ad partners may use cookies to serve and measure ads. You can block cookies in your browser settings at any time.
      </p>
      <h2>Children</h2>
      <p>The service is not directed at children under 13 and we do not knowingly collect their personal information.</p>
      <h2>Changes and contact</h2>
      <p>
        We may update this policy and will change the date above when we do. Contact: <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </TextPage>
  );
}
