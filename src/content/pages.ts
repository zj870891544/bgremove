export type Faq = { q: string; a: string };
export type Block = { title: string; text: string };

export type BgPreset = "transparent" | "white";

export type LandingContent = {
  /** URL path segment; "" is the home page. */
  slug: string;
  /** Primary keyword this page is built to rank for. */
  keyword: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  h1Accent: string;
  sub: string;
  howTo: string;
  defaultBg?: BgPreset;
  intro: { heading: string; paragraphs: string[] };
  steps: Block[];
  useCases: Block[];
  article: { heading: string; paragraphs: string[] }[];
  faqs: Faq[];
  related: string[];
};

const commonFaqs: Record<string, Faq> = {
  free: {
    q: "Is BGRemove really free?",
    a: "Yes. Removing a background, editing the cut-out and downloading the full-resolution PNG costs nothing and needs no account. There are no credits, no watermarks and no daily limit, because the AI runs on your own device instead of our servers.",
  },
  privacy: {
    q: "Are my images uploaded to a server?",
    a: "No. The background removal model is downloaded once and then runs locally in your browser using WebGPU or WebAssembly. Your photos never leave your device, which makes BGRemove safe for product shots, ID photos and client work.",
  },
  formats: {
    q: "Which image formats are supported?",
    a: "You can drop in JPG, JPEG, PNG, WebP, AVIF, BMP and GIF (first frame) images. Results download as a transparent PNG, or as JPG and WebP when you add a solid colour or photo background.",
  },
  first: {
    q: "Why does the first image take longer?",
    a: "The first time you use BGRemove your browser downloads the AI model (about 90–115 MB depending on your device). It is cached afterwards, so every following image — even on later visits — is processed in a couple of seconds.",
  },
  commercial: {
    q: "Can I use the results commercially?",
    a: "Yes. Images you process are yours. You can use the cut-outs for online stores, ads, client projects, print or anything else, as long as you have the rights to the original photo.",
  },
  mobile: {
    q: "Does it work on iPhone and Android?",
    a: "Yes. BGRemove runs in any modern mobile browser — Safari, Chrome, Edge, Samsung Internet. Open bgremove.cc, tap Upload Image, pick a photo from your gallery and save the result back to your phone.",
  },
};

export const pages: LandingContent[] = [
  {
    slug: "",
    keyword: "remove bg",
    metaTitle: "Remove BG Free – AI Background Remover, Transparent PNG in 1 Click | BGRemove",
    metaDescription:
      "Remove BG from images 100% automatically and free. BGRemove erases photo backgrounds in seconds, gives you HD transparent PNGs and lets you add a new background — no sign-up, no upload.",
    h1: "Remove BG from images",
    h1Accent: "100% free & automatic",
    sub: "Drop a photo and get a clean transparent PNG in seconds. Full resolution, no watermark, no account — and your image never leaves your device.",
    howTo: "How to remove bg from an image in 3 steps",
    intro: {
      heading: "The fastest way to remove bg from a photo",
      paragraphs: [
        "BGRemove is a free remove bg tool powered by a state-of-the-art segmentation model. It finds the subject in your picture — a person, a pet, a product, a car, a logo — and removes everything behind it, including the tricky parts like hair, fur and see-through edges.",
        "Unlike most background removers, BGRemove does the work inside your browser. That means no queue, no upload wait, no file size paywall, and no copy of your image stored on someone else's server.",
      ],
    },
    steps: [
      { title: "Upload your image", text: "Click Upload Image, drag a file onto the page, paste with Ctrl/⌘ + V, or enter an image URL." },
      { title: "AI removes the background", text: "The model separates the subject from the background automatically — usually in 1–3 seconds." },
      { title: "Edit and download", text: "Keep it transparent or pick a colour, blur or photo background, then download the HD PNG or JPG." },
    ],
    useCases: [
      { title: "E-commerce product photos", text: "Create the clean white or transparent backgrounds that Amazon, Shopify, eBay and Etsy listings need." },
      { title: "Profile pictures & headshots", text: "Turn a casual selfie into a professional headshot for LinkedIn, CVs and team pages." },
      { title: "Design & marketing", text: "Cut out people and objects for thumbnails, posters, social posts, banners and presentations." },
      { title: "Cars & real estate", text: "Swap grey skies and busy lots for a clean showroom backdrop that makes listings stand out." },
    ],
    article: [
      {
        heading: "What does “remove bg” actually do?",
        paragraphs: [
          "“Remove bg” is shorthand for removing the background of an image — keeping the foreground subject and making every other pixel transparent. The result is usually saved as a PNG, because PNG supports an alpha channel that stores transparency. You can then place that cut-out on any colour, gradient or photo without a visible box around it.",
          "Doing this by hand in Photoshop means tracing edges with the pen tool or painting a layer mask, which can take 10–30 minutes for a photo with hair. An AI background remover does the same job in a second by predicting, pixel by pixel, how much of each point belongs to the subject.",
        ],
      },
      {
        heading: "Why BGRemove is different",
        paragraphs: [
          "Most online background removers give you a small preview for free and charge credits for the full-resolution file. BGRemove keeps your original resolution for every download, because processing happens on your hardware rather than on paid cloud GPUs.",
          "You also get the essentials that usually sit behind a paywall: an erase/restore brush to fix edges, solid colours, blurred and photo backgrounds, batch processing for multiple images, and one-click ZIP download.",
        ],
      },
    ],
    faqs: [
      commonFaqs.free,
      {
        q: "Is BGRemove the same as removebg?",
        a: "No. Many people type “removebg” or “remove bg” when they want any tool that removes an image background. BGRemove is an independent remove bg tool — free, unlimited and private — and is not affiliated with remove.bg or Canva.",
      },
      commonFaqs.privacy,
      commonFaqs.first,
      commonFaqs.formats,
      commonFaqs.commercial,
      commonFaqs.mobile,
    ],
    related: ["remove-background", "background-remover", "transparent-background", "remove-bg-alternative"],
  },
  {
    slug: "remove-background",
    keyword: "remove background",
    metaTitle: "Remove Background from Image Free – Online, HD & Instant | BGRemove",
    metaDescription:
      "Remove background from any image online for free. Upload a JPG or PNG and BGRemove's AI deletes the background in seconds. Download a transparent PNG in full HD — no watermark, no sign-up.",
    h1: "Remove background",
    h1Accent: "from any image, free",
    sub: "People, products, animals, cars, logos and signatures — BGRemove cuts them out with clean edges and gives you the full-resolution result.",
    howTo: "How to remove background from an image",
    intro: {
      heading: "Remove background from image online in three seconds",
      paragraphs: [
        "Need to remove the background from a picture right now? Upload it here and BGRemove does the rest. The AI detects the main subject, builds a precise mask and removes the background while keeping fine details such as strands of hair, pet fur, lace and glass reflections.",
        "There's nothing to install and nothing to learn. It works the same on Windows, macOS, Linux, ChromeOS, iPhone and Android, directly in the browser you're using to read this page.",
      ],
    },
    steps: [
      { title: "Choose a photo", text: "Select a JPG, PNG or WebP from your computer or phone — or try one of our sample images." },
      { title: "Wait a moment", text: "The background is removed automatically. You'll see the cut-out on a transparent checkerboard." },
      { title: "Save the result", text: "Download a transparent PNG, or add a new background first and save as JPG." },
    ],
    useCases: [
      { title: "Remove background from a signature", text: "Scan or photograph your signature, remove the paper background and drop it into PDFs and contracts." },
      { title: "Remove background from a logo", text: "Turn a logo on a white or coloured box into a transparent PNG that works on any website header." },
      { title: "Remove background from a portrait", text: "Isolate a person for passport-style photos, avatars, YouTube thumbnails and event flyers." },
      { title: "Remove background from a product", text: "Make consistent catalogue images where every item sits on the same clean background." },
    ],
    article: [
      {
        heading: "How to remove a background without Photoshop",
        paragraphs: [
          "Traditional editors like Photoshop, GIMP or Affinity can remove a background, but they require selection tools, refine-edge passes and layer masks. BGRemove replaces all of that with a single click: the neural network outputs a soft alpha matte, so edges are anti-aliased instead of jagged.",
          "If the AI misses a spot — say, a hand blending into a similar-coloured wall — switch to the Erase/Restore brush in the editor, paint over the area and you're done. Undo is always one click away.",
        ],
      },
      {
        heading: "Tips for the cleanest result",
        paragraphs: [
          "Use a photo where the subject is in focus and reasonably separated from the background. Good contrast between subject and background helps, but it isn't required — the model handles cluttered scenes well.",
          "Higher-resolution originals produce sharper downloads. BGRemove keeps your original pixel dimensions, so a 4000 × 3000 photo gives you a 4000 × 3000 transparent PNG.",
        ],
      },
    ],
    faqs: [
      { q: "How do I remove the background from an image for free?", a: "Open bgremove.cc, click Upload Image and choose your photo. The background is removed automatically and you can download the transparent PNG for free in full resolution." },
      { q: "Can I remove the background from a picture on my phone?", a: "Yes. The tool works in mobile Safari and Chrome. Tap Upload Image, choose a photo from your camera roll and download the result to your phone." },
      commonFaqs.privacy,
      commonFaqs.formats,
      { q: "Can I fix areas the AI got wrong?", a: "Yes. Open the Erase/Restore tab in the editor. Erase removes leftover background, Restore paints the original pixels back. You can change the brush size and undo any stroke." },
      commonFaqs.commercial,
    ],
    related: ["", "background-remover", "transparent-background", "white-background"],
  },
  {
    slug: "background-remover",
    keyword: "background remover",
    metaTitle: "Free AI Background Remover – Remove Image Backgrounds Instantly | BGRemove",
    metaDescription:
      "BGRemove is a free AI background remover for photos. Erase backgrounds automatically, refine edges with a brush, add colours or new backdrops and batch-process images. Private and unlimited.",
    h1: "Free AI background remover",
    h1Accent: "with pro-level edges",
    sub: "An online background remover that handles hair, fur and complex edges — with built-in editing, batch mode and unlimited HD downloads.",
    howTo: "How to use the AI background remover",
    intro: {
      heading: "A background remover that respects your time and your privacy",
      paragraphs: [
        "BGRemove is built on dichotomous image segmentation models (BiRefNet and IS-Net) — open models designed specifically for separating a subject from its background at high resolution. They produce smooth, natural edges instead of the hard, haloed outlines you get from older tools.",
        "Because the background remover runs locally, there's no limit on how many images you process and no reason for us to downscale your results. It's the same quality for the 1st image and the 1,000th.",
      ],
    },
    steps: [
      { title: "Add one or many images", text: "Select several files at once to use batch mode — each is processed in turn." },
      { title: "Review each cut-out", text: "Use the before/after slider to check edges, then touch up with the Erase/Restore brush if needed." },
      { title: "Export everything", text: "Download images one by one or grab them all as a single ZIP file." },
    ],
    useCases: [
      { title: "Online sellers", text: "Batch-process an entire product shoot and upload marketplace-ready images in minutes." },
      { title: "Photographers", text: "Speed up compositing and deliver cut-outs to clients without hours of masking." },
      { title: "Social media creators", text: "Make scroll-stopping thumbnails, stickers and story graphics from any photo." },
      { title: "Developers & designers", text: "Quickly prepare transparent assets for apps, websites, mock-ups and slides." },
    ],
    article: [
      {
        heading: "What makes a good background remover?",
        paragraphs: [
          "Three things: edge quality, speed and control. Edge quality decides whether the cut-out looks natural on a new background. Speed decides whether you can process a whole catalogue. Control decides whether you can fix the inevitable tricky image yourself.",
          "BGRemove scores on all three: a soft alpha matte for natural edges, GPU-accelerated inference through WebGPU where available, and a manual brush plus undo when you need it.",
        ],
      },
      {
        heading: "Background remover vs. manual masking",
        paragraphs: [
          "Manual masking still wins for highly artistic composites, but for 95% of everyday photos an AI background remover is faster and just as clean. Use BGRemove for the heavy lifting, then fine-tune the remaining pixels with the brush instead of starting from zero.",
        ],
      },
    ],
    faqs: [
      { q: "What is the best free background remover?", a: "The best tool is the one that gives you full-resolution results without a paywall. BGRemove offers HD downloads, editing, batch mode and privacy at no cost, which makes it a strong free alternative to paid background removers." },
      { q: "Can I remove backgrounds from multiple images at once?", a: "Yes. Select or drop several images and BGRemove processes them one after another. When they're done, use Download all to get a ZIP file." },
      commonFaqs.first,
      commonFaqs.privacy,
      commonFaqs.free,
      commonFaqs.mobile,
    ],
    related: ["", "remove-background", "change-background-color", "remove-bg-alternative"],
  },
  {
    slug: "background-remove",
    keyword: "background remove",
    metaTitle: "Background Remove Online – Free Image Background Remove Tool | BGRemove",
    metaDescription:
      "Background remove in one click. Upload a photo and BGRemove removes the background automatically, then lets you download a transparent PNG or add a new background. Free and unlimited.",
    h1: "Background remove",
    h1Accent: "in one click",
    sub: "Upload, remove, download. A simple background remove tool for anyone — no design skills, no software, no sign-up.",
    howTo: "Background remove in 3 simple steps",
    intro: {
      heading: "Simple background remove for everyday photos",
      paragraphs: [
        "Sometimes you just need the background gone — for a school project, a marketplace listing, a presentation or a meme. BGRemove keeps it simple: one button to upload, an automatic background remove, and one button to download.",
        "If you want more, the editor is right there: change the background colour, blur the original background for a portrait effect, or place your subject on a new photo.",
      ],
    },
    steps: [
      { title: "Upload", text: "Pick any picture — JPG, PNG, WebP or AVIF, up to large camera resolutions." },
      { title: "Remove", text: "Background remove happens automatically, right in your browser." },
      { title: "Download", text: "Save a transparent PNG or a JPG with your chosen background." },
    ],
    useCases: [
      { title: "Students & teachers", text: "Cut out images for slides, worksheets and posters without fighting with Office tools." },
      { title: "Small businesses", text: "Make menu items, product photos and flyers look professional for free." },
      { title: "Personal projects", text: "Create stickers, collages, greeting cards and family photo edits." },
      { title: "Documents", text: "Remove backgrounds from stamps, signatures and ID photos for forms." },
    ],
    article: [
      {
        heading: "Background remove vs. background blur",
        paragraphs: [
          "A background remove deletes everything except the subject and leaves transparency. A background blur keeps the scene but softens it, like a portrait-mode photo. BGRemove does both: remove the background first, then choose Blur in the Background panel to bring the original scene back as a soft bokeh.",
        ],
      },
      {
        heading: "Does background remove reduce quality?",
        paragraphs: [
          "Not with BGRemove. The subject pixels are untouched — only the alpha channel changes. Downloads keep your original width and height, and PNG export is lossless.",
        ],
      },
    ],
    faqs: [
      { q: "How does automatic background remove work?", a: "An AI segmentation model looks at the whole image and predicts, for every pixel, whether it belongs to the foreground. That prediction becomes a transparency mask applied to your original photo." },
      commonFaqs.free,
      commonFaqs.formats,
      commonFaqs.privacy,
      commonFaqs.commercial,
    ],
    related: ["", "bg-remove", "white-background", "transparent-background"],
  },
  {
    slug: "bg-remove",
    keyword: "bg remove",
    metaTitle: "BG Remove – Free Online Image BG Remover, No Sign-up | BGRemove.cc",
    metaDescription:
      "BG remove for free at BGRemove.cc. Remove image bg automatically, get a transparent PNG in HD and change the bg to any colour or photo. Fast, private, unlimited.",
    h1: "BG remove",
    h1Accent: "fast, free, private",
    sub: "BGRemove.cc removes image bg instantly — then lets you swap in a new bg colour or photo before you download.",
    howTo: "BG remove in 3 steps",
    intro: {
      heading: "Online bg remove that runs on your device",
      paragraphs: [
        "BGRemove.cc was built for one job: the quickest possible bg remove. There's no landing-page maze and no upsell between you and the download — the tool sits right at the top of every page.",
        "Behind the scenes a modern AI model runs locally through WebGPU or WebAssembly. After a one-time model download, bg remove takes about as long as opening the image.",
      ],
    },
    steps: [
      { title: "Drop your image", text: "Drag it onto the page or paste it from your clipboard." },
      { title: "BG removed", text: "Watch the background disappear and compare with the before/after slider." },
      { title: "New bg or none", text: "Download transparent, or choose a white, colour, blur or photo bg." },
    ],
    useCases: [
      { title: "Stickers & emojis", text: "Turn photos of pets and friends into stickers for WhatsApp, Telegram and Discord." },
      { title: "Thumbnails", text: "Cut out your face and drop it onto bold colours for YouTube and TikTok covers." },
      { title: "Listings", text: "Clean up product and car photos for Facebook Marketplace and classified ads." },
      { title: "Avatars", text: "Create a crisp profile picture with a solid-colour bg for any platform." },
    ],
    article: [
      {
        heading: "Why “bg remove” tools became essential",
        paragraphs: [
          "Visual platforms reward clean, consistent images. Marketplaces require white backgrounds, social feeds favour bold cut-out graphics and design tools are built around layering transparent assets. A reliable bg remove tool is now as basic as a crop tool.",
        ],
      },
      {
        heading: "Keep it private",
        paragraphs: [
          "Many free bg remove sites upload your photo to their servers and keep it for model training. BGRemove.cc never receives your image at all — the processing happens in your browser tab and disappears when you close it.",
        ],
      },
    ],
    faqs: [
      { q: "Is BGRemove.cc free for bg remove?", a: "Yes. Every bg remove and every HD download is free with no account and no watermark." },
      commonFaqs.privacy,
      commonFaqs.first,
      commonFaqs.mobile,
      commonFaqs.formats,
    ],
    related: ["", "background-remove", "change-background-color", "remove-background"],
  },
  {
    slug: "transparent-background",
    keyword: "make background transparent",
    metaTitle: "Make Background Transparent – Free Transparent PNG Maker | BGRemove",
    metaDescription:
      "Make an image background transparent in seconds. BGRemove turns any JPG or photo into a transparent PNG automatically — perfect for logos, products and graphics. Free, HD, no sign-up.",
    h1: "Make background transparent",
    h1Accent: "& download a PNG",
    sub: "Turn any JPG into a transparent PNG automatically. Ideal for logos, product photos, stickers and design assets.",
    howTo: "How to make a background transparent",
    defaultBg: "transparent",
    intro: {
      heading: "Create transparent PNGs from any photo",
      paragraphs: [
        "A transparent background lets an image sit naturally on top of anything — a website header, a slide, a T-shirt mock-up or another photo. BGRemove detects the subject and makes every background pixel fully transparent, with soft partial transparency along the edges so there's no white halo.",
        "The result is a standard PNG with an alpha channel that opens in Canva, Figma, PowerPoint, Google Slides, Photoshop, Word and every browser.",
      ],
    },
    steps: [
      { title: "Upload a JPG or PNG", text: "Any image works, including screenshots and scans." },
      { title: "Background turns transparent", text: "The checkerboard pattern shows exactly which areas are see-through." },
      { title: "Download PNG", text: "Click Download to save the transparent PNG at full resolution." },
    ],
    useCases: [
      { title: "Logos", text: "Remove the white box around a logo so it blends into dark and coloured headers." },
      { title: "Print on demand", text: "Prepare transparent artwork for T-shirts, mugs and stickers." },
      { title: "Presentations", text: "Place people and objects on slides without ugly rectangles." },
      { title: "Web graphics", text: "Create hero images, icons and illustrations that work on any section colour." },
    ],
    article: [
      {
        heading: "JPG vs. PNG: why transparency needs PNG",
        paragraphs: [
          "JPG has no alpha channel, so it can't store transparency — transparent areas are always filled with a colour when you save as JPG. PNG and WebP both support alpha. BGRemove saves transparent results as PNG by default because it's the most compatible format.",
        ],
      },
      {
        heading: "Making a logo background transparent",
        paragraphs: [
          "Logos with thin text or outlines benefit from a high-resolution source. Upload the largest version you have; if small interior gaps (like the inside of an “o”) keep their background, use the Erase brush with a small size to clear them.",
        ],
      },
    ],
    faqs: [
      { q: "How do I make the background of a picture transparent?", a: "Upload the picture to BGRemove. The background is removed automatically and shown as a checkerboard. Click Download to save a transparent PNG." },
      { q: "Why does my transparent PNG show a white background?", a: "Some viewers (like Windows Photos or email previews) display transparency as white. Open the PNG in a design tool or place it on a coloured background to see the transparency." },
      commonFaqs.free,
      commonFaqs.formats,
      commonFaqs.privacy,
    ],
    related: ["", "remove-background", "white-background", "change-background-color"],
  },
  {
    slug: "white-background",
    keyword: "white background",
    metaTitle: "Add White Background to Photo – Free White Background Maker | BGRemove",
    metaDescription:
      "Make a photo background white in one click. BGRemove removes the original background and replaces it with pure white — perfect for Amazon product photos, passport and ID pictures.",
    h1: "White background maker",
    h1Accent: "for products & portraits",
    sub: "Replace any background with pure white (#FFFFFF) automatically — the standard for Amazon, Shopify, passports and professional headshots.",
    howTo: "How to add a white background to a photo",
    defaultBg: "white",
    intro: {
      heading: "Pure white backgrounds without a studio",
      paragraphs: [
        "Marketplaces such as Amazon require the main product image to sit on a pure white background (RGB 255, 255, 255). Getting that in-camera needs lighting gear and a sweep. BGRemove gets you there from a phone photo: it removes the original background and fills it with exact white.",
        "Prefer off-white or a brand colour? Pick any colour in the Background panel — the cut-out updates instantly.",
      ],
    },
    steps: [
      { title: "Upload your photo", text: "A product shot, portrait or document photo." },
      { title: "White is applied", text: "The background is removed and replaced with pure white automatically." },
      { title: "Download JPG or PNG", text: "Export a white-background JPG ready for upload." },
    ],
    useCases: [
      { title: "Amazon & marketplace listings", text: "Meet main-image white-background rules on Amazon, eBay, Walmart and more." },
      { title: "Passport & ID photos", text: "Create a plain white background for visa, passport and badge photos." },
      { title: "Headshots", text: "Give team photos a consistent, clean, corporate look." },
      { title: "Catalogues", text: "Make every product image match for a professional online store." },
    ],
    article: [
      {
        heading: "Amazon white background requirements",
        paragraphs: [
          "Amazon asks that the main image uses a pure white background, shows the product only, and fills most of the frame. After using BGRemove, check the framing — you can crop in any image tool — and export as JPG at 1000 px or larger on the longest side so zoom works.",
        ],
      },
      {
        heading: "White background for passport photos",
        paragraphs: [
          "Many countries require a white or light-grey background for passport photos. BGRemove gives you a clean white base; make sure you still follow your country's rules on size, head position and lighting.",
        ],
      },
    ],
    faqs: [
      { q: "How do I change a photo background to white?", a: "Upload your photo to this page. BGRemove removes the background and applies pure white automatically. Click Download to save the result as a JPG or PNG." },
      { q: "Is the white exactly #FFFFFF?", a: "Yes. The default white is RGB 255, 255, 255. You can switch to any other colour using the colour picker." },
      commonFaqs.free,
      commonFaqs.commercial,
      commonFaqs.privacy,
    ],
    related: ["", "transparent-background", "change-background-color", "remove-background"],
  },
  {
    slug: "change-background-color",
    keyword: "change background color",
    metaTitle: "Change Background Color of Photo Online Free – Any Color, 1 Click | BGRemove",
    metaDescription:
      "Change the background color of any photo online for free. BGRemove removes the background with AI and lets you pick white, black, blue, red, any custom colour, a blur or a new photo.",
    h1: "Change background color",
    h1Accent: "of any photo",
    sub: "Remove the background, then paint a new one: white, black, blue, red, pastel, your brand colour — or a blurred or photo backdrop.",
    howTo: "How to change the background color of a photo",
    intro: {
      heading: "Swap the background colour in seconds",
      paragraphs: [
        "Changing the background colour of a photo used to mean masking in Photoshop. With BGRemove, the AI removes the old background automatically and the editor lets you choose a new colour with one tap. Preview updates live, so you can try ten colours in ten seconds.",
        "Beyond solid colours you can choose gradients, blur the original background, or upload your own background image.",
      ],
    },
    steps: [
      { title: "Upload your photo", text: "The background is removed automatically." },
      { title: "Pick a colour", text: "Choose a preset swatch or any custom colour with the picker." },
      { title: "Download", text: "Save the recoloured photo as a JPG, PNG or WebP." },
    ],
    useCases: [
      { title: "Brand-consistent visuals", text: "Put every team photo or product on your exact brand colour." },
      { title: "Social media posts", text: "Bold, flat colour backgrounds make subjects pop in the feed." },
      { title: "ID & visa photos", text: "Switch to the white, blue or red background an application requires." },
      { title: "E-commerce variants", text: "Test which background colour converts best for your listings." },
    ],
    article: [
      {
        heading: "Choosing the right background colour",
        paragraphs: [
          "White is clean and neutral; black feels premium; saturated colours draw attention on social media; soft pastels feel friendly. Pick a colour that contrasts with the subject's dominant tones so the edges stay crisp.",
        ],
      },
      {
        heading: "Popular colours: blue, red and white backgrounds",
        paragraphs: [
          "Blue backgrounds are common for official ID photos in some countries, red for certain visa and school photos, and white for passports and marketplaces. BGRemove includes these as one-tap presets.",
        ],
      },
    ],
    faqs: [
      { q: "How can I change the background colour of a photo for free?", a: "Upload the photo here, wait for the background to be removed, then choose a colour in the Background panel and download." },
      { q: "Can I use my own background image?", a: "Yes. In the Background panel choose Photo and upload any image. Your subject is placed on top of it automatically." },
      commonFaqs.free,
      commonFaqs.privacy,
      commonFaqs.mobile,
    ],
    related: ["", "white-background", "transparent-background", "background-remover"],
  },
  {
    slug: "remove-bg-alternative",
    keyword: "remove.bg alternative",
    metaTitle: "Free remove.bg Alternative – Unlimited HD Downloads, No Credits | BGRemove",
    metaDescription:
      "Looking for a free remove.bg alternative? BGRemove removes image backgrounds automatically with unlimited full-resolution downloads, no credits, no account and 100% in-browser privacy.",
    h1: "The free remove.bg alternative",
    h1Accent: "with unlimited HD",
    sub: "Same one-click background removal you know — with full-resolution downloads, no credits and no uploads.",
    howTo: "Switching from remove.bg takes 3 steps",
    intro: {
      heading: "Why people look for a remove.bg alternative",
      paragraphs: [
        "remove.bg popularised one-click background removal and is now part of Canva. Its free tier gives a reduced-resolution preview, while full-resolution downloads use paid credits. If you need HD files regularly, those credits add up.",
        "BGRemove is an independent tool built for that gap: the same upload-and-done workflow, but every download keeps your original resolution and nothing is metered, because the AI runs in your browser.",
      ],
    },
    steps: [
      { title: "Upload like you're used to", text: "Drag, drop, paste or pick a file — the workflow will feel familiar." },
      { title: "Automatic removal", text: "Open-source segmentation AI separates subject and background with soft, natural edges." },
      { title: "Download in full HD", text: "No credits, no preview size limit, no watermark." },
    ],
    useCases: [
      { title: "Bulk sellers", text: "Process whole catalogues without buying credit packs." },
      { title: "Agencies & freelancers", text: "Keep client images on your machine for confidentiality." },
      { title: "Canva users", text: "Make transparent PNGs here and drop them into any design tool you like." },
      { title: "Teams on a budget", text: "Give everyone a background remover without per-seat pricing." },
    ],
    article: [
      {
        heading: "BGRemove vs. remove.bg at a glance",
        paragraphs: [
          "Both tools remove backgrounds automatically and both offer editing and new-background options. The key differences are resolution and data handling: BGRemove gives you full resolution for free and never uploads your image; remove.bg processes images on its servers and meters HD downloads with credits.",
          "remove.bg offers an API and app integrations that BGRemove doesn't (yet). If you need a hosted API, remove.bg is a mature choice; if you need free HD cut-outs from the browser, BGRemove is built for you.",
        ],
      },
      {
        heading: "Not affiliated",
        paragraphs: [
          "BGRemove is an independent project and is not affiliated with, endorsed by or sponsored by remove.bg, Kaleido or Canva. “remove.bg” is a trademark of its respective owner and is used here only to describe compatibility and comparison.",
        ],
      },
    ],
    faqs: [
      { q: "Is BGRemove the same as remove.bg?", a: "No. BGRemove is a separate, independent background remover. It offers a similar one-click workflow but runs in your browser with free full-resolution downloads." },
      { q: "Is there a free remove.bg alternative with HD downloads?", a: "Yes — BGRemove lets you download every result at its original resolution for free, with no credits or watermark." },
      commonFaqs.privacy,
      commonFaqs.first,
      commonFaqs.commercial,
    ],
    related: ["", "background-remover", "remove-background", "bg-remove"],
  },
];

export const pageBySlug = new Map(pages.map((p) => [p.slug, p]));

export const pageLabel: Record<string, string> = {
  "": "Remove BG",
  "remove-background": "Remove Background from Image",
  "background-remover": "AI Background Remover",
  "background-remove": "Background Remove",
  "bg-remove": "BG Remove",
  "transparent-background": "Make Background Transparent",
  "white-background": "White Background Maker",
  "change-background-color": "Change Background Color",
  "remove-bg-alternative": "Free remove.bg Alternative",
};
