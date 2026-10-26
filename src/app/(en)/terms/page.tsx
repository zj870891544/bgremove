import type { Metadata } from "next";
import TextPage from "@/components/TextPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using the BGRemove background remover.",
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <TextPage title="Terms of Service" updated="October 25, 2026">
      <p>By using {site.domain} you agree to these terms.</p>
      <h2>Use of the service</h2>
      <ul>
        <li>BGRemove is provided free of charge, &quot;as is&quot;, without warranties of any kind.</li>
        <li>You are responsible for having the rights to any image you process and for how you use the results.</li>
        <li>Do not use the service for unlawful content or to infringe others&apos; rights.</li>
      </ul>
      <h2>Your content</h2>
      <p>You keep all rights to your images and results. Because processing happens on your device, we never receive or claim any rights to them.</p>
      <h2>Trademarks</h2>
      <p>
        Third-party names such as remove.bg and Canva are trademarks of their respective owners. BGRemove is independent and not affiliated with them.
      </p>
      <h2>Liability</h2>
      <p>To the maximum extent permitted by law, we are not liable for any damages arising from the use of the service.</p>
      <h2>Contact</h2>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
    </TextPage>
  );
}
