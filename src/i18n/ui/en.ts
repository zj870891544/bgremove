/** Interface strings. Every other language file must provide the same keys. */
const en = {
  nav: { home: "Remove BG", how: "How it works", faq: "FAQ", menu: "Menu", language: "Language" },
  upload: {
    button: "Upload Image",
    or: "or drop a file, paste an image (Ctrl/⌘ + V) or",
    enterUrl: "enter a URL",
    go: "Go",
    badUrl: "Please enter a link starting with http:// or https://",
    urlFailed: "We couldn't load that link — the site may block downloads. Save the image and upload it instead.",
    noImage: "No image?",
    tryThese: "Try one of these:",
    samples: { woman: "Portrait", dog: "Pet", headphones: "Product", plant: "Object" },
    privacy: "Processed on your device — your images are never uploaded.",
    dropTitle: "Drop images anywhere",
    dropSub: "We'll remove the background instantly",
  },
  editor: {
    addImages: "+ Add images",
    close: "Close editor",
    result: "Result",
    compare: "Before / After",
    before: "Before",
    after: "After",
    paintErase: "Paint over areas to erase",
    paintRestore: "Paint over areas to restore",
    undo: "Undo",
    loadingModel: "Loading AI model",
    queued: "Waiting in queue…",
    removing: "Removing background…",
    loadingNote: "One-time download, cached for next time. Your image stays on your device.",
    runningNote: "Running locally in your browser — nothing is uploaded.",
    failed: "Couldn't process this image",
    retry: "Try again",
    download: "Download HD PNG",
    preparing: "Preparing…",
    fullRes: "Full resolution {w} × {h} · free, no watermark",
    notReady: "Available when processing finishes",
    zip: "Download all as ZIP ({done}/{total})",
    zipping: "Zipping…",
    tabBg: "Background",
    tabBrush: "Erase / Restore",
    basic: "Basic",
    colors: "Colours",
    gradients: "Gradients",
    photos: "Photos",
    uploadBg: "Upload",
    transparent: "Transparent",
    blur: "Blur original",
    white: "White",
    custom: "Custom colour",
    blurStrength: "Blur strength",
    erase: "Erase",
    restore: "Restore",
    eraseHint: "Remove leftover background",
    restoreHint: "Bring back lost details",
    brushSize: "Brush size",
    reset: "Reset to AI result",
    tip: "Tip: the faded image shows the original photo. Use Restore to paint parts of it back, and Erase to clear leftovers. Press Ctrl/⌘ + Z to undo.",
    processedIn: "Processed on your device in {s}s",
  },
  page: {
    badge: "Free · No sign-up · Runs in your browser",
    checks: ["Full-HD PNG", "No watermark", "Batch & ZIP", "Mobile-friendly"],
    examples: { woman: "People", dog: "Animals", headphones: "Products", plant: "Objects" },
    dragToCompare: "drag to compare",
    tryNow: "Try it now — it's free",
    featuresTitle: "Everything you need, nothing you don't",
    features: [
      { title: "Fully automatic", text: "One click. The AI finds the subject and removes the background — no selections, no masking." },
      { title: "Full-resolution, free", text: "Download the HD result at your original size. No credits, no watermark, no low-res preview." },
      { title: "Private by design", text: "Images are processed on your own device. Nothing is uploaded, stored or used for training." },
      { title: "Erase & restore brush", text: "Touch up the edges in seconds: erase leftovers or paint back details the AI missed." },
      { title: "Batch processing", text: "Drop many images at once and download them all together as a ZIP file." },
      { title: "New backgrounds", text: "Transparent, white, any colour, gradients, blur or your own photo — previewed live." },
    ],
    useCasesTitle: "Made for every kind of image",
    faqTitle: "Frequently asked questions",
    relatedTitle: "More free background tools",
    ctaTitle: "Ready to remove the background?",
    ctaSub: "Drop an image anywhere on this page, or click below. Results in seconds — free forever.",
    exampleAlt: "{page} example: {subject}",
  },
  footer: {
    tagline: "Free AI background remover. Remove bg from photos, make transparent PNGs and add new backgrounds — privately, in your browser.",
    tools: "Tools",
    company: "Company",
    languages: "Languages",
    about: "About",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    contact: "Contact",
    rights: "All rights reserved.",
    disclaimer: "Not affiliated with remove.bg, Kaleido or Canva. Sample photos from Unsplash.",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type UiDict = Widen<typeof en>;

export default en as UiDict;

/** Tiny "{name}" interpolation. */
export function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
