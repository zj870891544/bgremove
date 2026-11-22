import type { Metadata } from "next";
import Link from "next/link";
import TextPage from "@/components/TextPage";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "BGRemove is a free, private AI background remover that runs entirely in your browser.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <TextPage title="About BGRemove">
      <p>
        BGRemove ({site.domain}) is a free tool that removes the background from images automatically. We built it because background removal
        has become an everyday task — for sellers, designers, students and anyone who shares photos — and it shouldn&apos;t require credits,
        subscriptions or uploading personal photos to a stranger&apos;s server.
      </p>
      <h2>How it works</h2>
      <p>
        Your browser downloads a BiRefNet model and runs it locally using WebGPU or WebAssembly through
        Transformers.js and ONNX Runtime. HD is the desktop default, while phones use the lighter Fast model. You can also choose Ultra on supported devices. If a model fails, the tool retries with a lighter model. The model predicts a transparency mask for your photo, which we apply to
        the original pixels so your download keeps its full resolution.
      </p>
      <h2>What it costs</h2>
      <p>
        Nothing. Because the heavy lifting happens on your device, our running costs are tiny, and we can keep the tool free with no limits.
      </p>
      <h2>Contact</h2>
      <p>
        Questions, feedback or partnership ideas: <a href={`mailto:${site.email}`}>{site.email}</a>. Ready to try it?{" "}
        <Link href="/">Remove a background now</Link>.
      </p>
    </TextPage>
  );
}
