import SiteShell from "@/components/SiteShell";
import { baseMetadata, baseViewport } from "@/lib/seo";
import "../globals.css";

export const metadata = baseMetadata;
export const viewport = baseViewport;

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
