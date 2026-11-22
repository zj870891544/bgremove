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
  /** Default HD model used when WebGPU is available (1024x1024, <=7 buffers, 123.2MB fp16, MIT). */
  gpuModel: process.env.NEXT_PUBLIC_BG_GPU_MODEL || "wonfy/BiRefNet_lite-ONNX-webgpu",
  /** Lighter GPU fallback / Fast tier model (512x512, <=7 buffers, 98.5MB fp16, MIT). */
  gpuFallbackModel: process.env.NEXT_PUBLIC_BG_GPU_FALLBACK_MODEL || "studioludens/birefnet-lite-512",
  /** Ultra-precision full Swin-L BiRefNet 1024 model for WebGPU (<=7 buffers, 520.2MB fp16, MIT). */
  gpuUltraModel: process.env.NEXT_PUBLIC_BG_ULTRA_MODEL || "wonfy/BiRefNet-ONNX-webgpu",
  /** Preferred CPU/WASM model so foreground selection stays consistent across devices. */
  cpuModel: process.env.NEXT_PUBLIC_BG_CPU_MODEL || "studioludens/birefnet-lite-512",
  /** Last-resort model in a fresh worker if the preferred model fails or exhausts memory. */
  cpuFallbackModel: process.env.NEXT_PUBLIC_BG_CPU_FALLBACK_MODEL || "Ko033/isnet-general-use-onnx",
  /** Mirror of the Hugging Face model files (e.g. your own R2/CDN bucket). Empty = huggingface.co. */
  modelHost: process.env.NEXT_PUBLIC_MODEL_HOST || "",
  transformersVersion: process.env.NEXT_PUBLIC_TRANSFORMERS_VERSION || "4.3.1",
  /** If set, images are POSTed here (multipart "image") and a PNG cut-out is expected back. */
  apiUrl: process.env.NEXT_PUBLIC_BG_API_URL || "",
};

export const mainNav = [
  { href: "/", label: "Remove BG" },
  { href: "/remove-background", label: "Remove Background" },
  { href: "/background-remover", label: "Background Remover" },
  { href: "/bg-remove", label: "BG Remove" },
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
