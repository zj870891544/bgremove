export const site = {
  name: "BGRemove",
  domain: "bgremove.cc",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://bgremove.cc").replace(/\/$/, ""),
  tagline: "Remove BG from any image — free, instant, private",
  description:
    "Remove BG from images in seconds with BGRemove. Free AI background remover that makes transparent PNGs, white backgrounds and new backdrops — right in your browser, no sign-up, no upload.",
  email: "hello@bgremove.cc",
  twitter: "@bgremove",
};

/** Optional runtime knobs, all set at build time via NEXT_PUBLIC_* env vars. */
export const engineConfig = {
  model: process.env.NEXT_PUBLIC_BG_MODEL || "onnx-community/BiRefNet_lite-ONNX",
  transformersVersion: process.env.NEXT_PUBLIC_TRANSFORMERS_VERSION || "4.3.1",
  /** If set, images are POSTed here (multipart "image") and a PNG cut-out is expected back. */
  apiUrl: process.env.NEXT_PUBLIC_BG_API_URL || "",
};

export const mainNav = [
  { href: "/remove-background", label: "Remove Background" },
  { href: "/background-remover", label: "Background Remover" },
  { href: "/transparent-background", label: "Transparent PNG" },
  { href: "/change-background-color", label: "Change Color" },
  { href: "/remove-bg-alternative", label: "remove.bg Alternative" },
];

export const footerNav = [
  {
    title: "Tools",
    links: [
      { href: "/", label: "Remove BG" },
      { href: "/remove-background", label: "Remove Background" },
      { href: "/background-remover", label: "Background Remover" },
      { href: "/background-remove", label: "Background Remove" },
      { href: "/bg-remove", label: "BG Remove" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/transparent-background", label: "Make Background Transparent" },
      { href: "/white-background", label: "White Background Maker" },
      { href: "/change-background-color", label: "Change Background Color" },
      { href: "/remove-bg-alternative", label: "Free remove.bg Alternative" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: `mailto:${site.email}`, label: "Contact" },
    ],
  },
];
