# BGRemove.cc — free AI background remover

A fully static Next.js site that removes image backgrounds **in the browser** (no server, no GPU bill),
built to rank for the high-volume keywords `remove bg`, `remove background`, `background remover`,
`background remove` and `bg remove`.

## Features

- Upload by button, drag & drop anywhere, paste (Ctrl/⌘+V), image URL, or sample images
- Automatic background removal in a Web Worker with three quality tiers (`Fast` / `HD` / `Ultra`):
  - **HD (desktop default)**: BiRefNet-lite 1024 on WebGPU ([`wonfy/BiRefNet_lite-ONNX-webgpu`](https://huggingface.co/wonfy/BiRefNet_lite-ONNX-webgpu), 123.2 MB fp16, ≤7 storage buffers, MIT)
  - **Ultra (WebGPU)**: full Swin-L BiRefNet 1024 ([`wonfy/BiRefNet-ONNX-webgpu`](https://huggingface.co/wonfy/BiRefNet-ONNX-webgpu), 520.2 MB fp16, ≤7 storage buffers, MIT)
  - **Fast (mobile default) & GPU fallback / CPU default**: BiRefNet-lite 512 ([`studioludens/birefnet-lite-512`](https://huggingface.co/studioludens/birefnet-lite-512), 98.5 MB fp16, ≤7 storage buffers, MIT)
  - **4-tier automatic fallback ladder**: if a GPU tier fails during load or inference, a fresh worker steps down (`Ultra 1024 → HD 1024 GPU → 512 GPU → 512 WASM → ISNet fp16 WASM`); devices without WebGPU skip GPU retries cleanly
  - **2-stage coarse-to-fine crop refinement**: automatically zooms into smaller or wide-aspect subjects for a second high-resolution pass with seam-free cosine-feathered blending
  - **Edge matting post-processing**: Fast Guided Filter full-res edge alignment and foreground color decontamination (defringing) to remove coloured background halos around hair and fur
  - BiRefNet uses sigmoid on logits; ISNet uses its probability-map normalization. Models load once and are cached;
    processing speed depends on the device and model, and first use also compiles the inference graph.
- Editor: before/after slider, erase/restore brush with undo, reset to AI result
- Backgrounds: transparent, white, any colour, gradients, blur, preset photos, your own photo
- Downloads at original resolution: PNG / JPG / WebP, batch ZIP
- SEO: one landing page per keyword, unique copy, FAQ + WebApplication + Breadcrumb JSON-LD,
  canonical URLs, Open Graph, `sitemap.xml`, `robots.txt`, web manifest

## Keyword → page map

| Page | Primary keyword |
| --- | --- |
| `/` | remove bg |
| `/remove-background` | remove background (from image) |
| `/background-remover` | background remover |
| `/background-remove` | background remove |
| `/bg-remove` | bg remove (exact-match with the domain) |
| `/transparent-background` | make background transparent |
| `/white-background` | white background |
| `/change-background-color` | change background color |
| `/remove-bg-alternative` | remove.bg alternative |

All copy lives in `src/content/pages.ts`. Add a new landing page by adding an entry — the route,
sitemap entry, metadata and structured data are generated automatically.

## Languages

English lives at the root (`/`, `/remove-background`, …). Thirteen more languages — `es pt fr de it pl ru tr id vi ja ko zh` —
each have four localized pages:

| Path | Page |
| --- | --- |
| `/{code}` | home (remove bg) |
| `/{code}/transparent-background` | make background transparent |
| `/{code}/white-background` | white background (editor opens with white preset) |
| `/{code}/change-background-color` | change background color |

Each of these pages lists its 13 siblings plus English via `hreflang` (and `x-default` → the English URL),
both in `<head>` and in `sitemap.xml`. The language menu switches to the same page in the other language.

| Code | Primary local keyword | Code | Primary local keyword |
| --- | --- | --- | --- |
| es | quitar fondo | ru | удалить фон |
| pt | remover fundo | tr | arka plan silme |
| fr | supprimer l'arrière-plan | id | hapus background / remove bg |
| de | hintergrund entfernen | vi | xóa phông |
| it | rimuovere sfondo | ja | 背景透過 |
| pl | usuń tło | ko | 배경 제거 / 누끼 |
| zh | 抠图 / 去除背景 | | |

Long-tail pages use local search terms too, e.g. ja 透過PNG作成 / 背景を白にする, zh 白底图 / 证件照换底色,
id ganti background foto (pas foto merah/biru), ko 흰 배경 / 배경색 바꾸기.

- Interface strings: `src/i18n/ui/en.ts` (source of truth, typed) and `src/i18n/locales/{code}.ts` (`ui` + `home`).
- Long-tail page copy: `src/i18n/pages/{code}.ts`. Their "is it free / is it private" FAQs are reused from the home page.
- Add a language: add it to `src/i18n/config.ts`, create `src/i18n/locales/{code}.ts` and `src/i18n/pages/{code}.ts`, register both in `src/i18n/index.ts`.
- Translate another page type: add its slug to `localizedSlugs` in `src/i18n/config.ts` and an entry to every `src/i18n/pages/{code}.ts` (TypeScript flags any language you miss).
- English visitors whose browser prefers a supported language see a one-line suggestion banner (no automatic redirect, so every URL stays crawlable).
- `/remove-background`, `/background-remover`, `/background-remove`, `/bg-remove`, `/remove-bg-alternative`, About, Privacy and Terms are English-only (those keywords are English searches).
- Production model downloads use the R2 mirror at `https://models.bgremove.cc/`, so they do not depend on access to huggingface.co.

## Develop

When changing the model or worker output contract, bump the worker URL revision in
`src/lib/remover/engine.ts` with the worker change. `/workers/*` must revalidate;
Cloudflare browser-cache settings must respect those origin headers. Otherwise an
old cached worker can apply the wrong alpha conversion to a newer model.

```bash
npm install
npm run dev -- -p 3100
```

## Build & deploy

```bash
npm run build      # static site in ./out
```

Upload `out/` to Cloudflare Pages (recommended: free, unlimited bandwidth), Vercel, Netlify or any
static host. On Cloudflare Pages: build command `npm run build`, output directory `out`.

## Configuration (`.env.local`, all optional)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, default `https://bgremove.cc` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 measurement ID (receives product events) |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Cloudflare Web Analytics token (cookie-free page views) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible domain (cookie-free, receives product events) |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Google Search Console token |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Bing Webmaster token |
| `NEXT_PUBLIC_BG_GPU_MODEL` | HD WebGPU model; default `wonfy/BiRefNet_lite-ONNX-webgpu` (1024px, ≤7 buffers, fp16). Also supports `jiabins0303/birefnet-lite-1024-webgpu` and `studioludens/birefnet-lite-512` |
| `NEXT_PUBLIC_BG_GPU_FALLBACK_MODEL` | Fast tier & lighter WebGPU fallback model; default `studioludens/birefnet-lite-512` |
| `NEXT_PUBLIC_BG_ULTRA_MODEL` | Ultra WebGPU model (full Swin-L BiRefNet 1024); default `wonfy/BiRefNet-ONNX-webgpu` |
| `NEXT_PUBLIC_BG_CPU_MODEL` | Preferred CPU/WASM model; default `studioludens/birefnet-lite-512` |
| `NEXT_PUBLIC_BG_CPU_FALLBACK_MODEL` | Last-resort CPU/WASM model; default `Ko033/isnet-general-use-onnx` |
| `NEXT_PUBLIC_MODEL_HOST` | Mirror of model files (e.g. `https://models.bgremove.cc/`) |
| `NEXT_PUBLIC_BG_API_URL` | Use a server API instead (POST multipart `image`, returns PNG) |

### Mirroring models to Cloudflare R2

The default command mirrors all four shipped ONNX model repositories to R2, including the 520 MB Ultra model. It temporarily deploys an authenticated Worker bound only to the selected bucket, streams the allowlisted public Hugging Face files directly into R2, and then deletes the helper. This avoids local download bottlenecks and Wrangler's 300 MiB object-upload limit. The helper does not accept arbitrary upstream URLs, and its random upload secret is passed over stdin rather than stored in source or command arguments.

Create the target bucket first and authenticate with `wrangler login` (Workers deployment and R2 access are needed). Then run:

```bash
# Read-only preview: no bucket, Worker, secret, download or upload is created
node scripts/mirror-models-r2.mjs --bucket bgremove-models --dry-run

# Stream all four shipped models from Hugging Face to R2 in the cloud
node scripts/mirror-models-r2.mjs --bucket bgremove-models

# Mirror a subset of the shipped models
node scripts/mirror-models-r2.mjs --bucket bgremove-models \
  --models wonfy/BiRefNet_lite-ONNX-webgpu,studioludens/birefnet-lite-512

# Optional local download path; large shipped models use 64 MiB multipart uploads
node scripts/mirror-models-r2.mjs --bucket bgremove-models --local \
  --cache-dir /tmp/bgremove-r2-models
```

`--local` also supports custom Hugging Face hosts and repositories for files under Wrangler's limit. The temporary multipart helper is deliberately restricted to the four shipped public model repositories; use an S3 multipart client for larger custom/private models. `HF_TOKEN` is used only for local source downloads. Set `CLOUDFLARE_ACCOUNT_ID` when selecting between multiple Cloudflare accounts.

Attach a public custom domain (e.g. `https://models.bgremove.cc`) to the R2 bucket, configure CORS for `GET` / `HEAD` from the site origins, verify all model files, and set `NEXT_PUBLIC_MODEL_HOST=https://models.bgremove.cc/` before building the Pages site.

### Product events

`src/lib/analytics.ts` sends these to GA4 / Plausible when configured:
`image_added`, `bg_removed`, `bg_remove_failed`, `download`, `download_zip`,
`engine_ready` (device, model, cross-origin isolated?), `engine_gpu_fallback`, `engine_cpu_fallback`, `engine_failed`, `js_error`.

### Production search and analytics

- Canonical origin: `https://bgremove.cc`; Cloudflare redirects `www` to the apex with a 301, preserving paths and query strings.
- Google Search Console: verified Domain property `bgremove.cc`. Keep the apex `google-site-verification` DNS TXT record in place.
- Bing Webmaster Tools: verified by importing only `bgremove.cc` from Search Console.
- Both search consoles have been submitted `https://bgremove.cc/sitemap.xml`; submission and indexing are separate stages.
- GA4: property `560701392`, web stream `16203271050`, measurement ID `G-CFTYVGZ3JK`. The existing `download` event is a key event, and the property is linked to Search Console.
- Google signals and advertising personalization are disabled. Analytics records product events, not images or file names; the Privacy Policy describes this collection.
- `robots.txt` allows public pages. Cloudflare's search/agent crawler controls allow access, including OAI-SearchBot and ChatGPT-User. Crawl permission does not guarantee indexing or recommendations.

Setup check on October 26, 2026: Bing fetched the sitemap successfully and discovered all 64 URLs.
Google accepted the sitemap submissions but its sitemap report still showed "Couldn't fetch" at the end of setup.
Google's live URL test fetched the sitemap successfully (crawl allowed, page fetch successful), and live tests plus
indexing requests for `/` and `/zh` succeeded. The sitemap was resubmitted after that live test; its report needs a later
processing check. These accepted requests do not mean the pages are already indexed.

The measurement ID is public configuration. `.env.example` contains the current production values;
copy them into your build environment (or `.env.local`) before building. For the current direct-upload Pages project:

```bash
npm run build
npx wrangler pages deploy out --project-name bgremove --branch main --commit-dirty=true
```

## Launch checklist

**Accounts & DNS (owner)**
- [x] Cloudflare Pages project `bgremove` → build `npm run build`, output `out`, Node 20+
- [x] Custom domain `bgremove.cc`; add `www.bgremove.cc` too and create a Cloudflare
      *Redirect Rule*: `www.bgremove.cc/*` → `https://bgremove.cc/${1}` (301).
      (`_redirects` can't do host-level redirects on Pages.)
- [x] Check the live site is cross-origin isolated: DevTools console → `crossOriginIsolated` is `true`
- [ ] Email routing for `hello@bgremove.cc` (Cloudflare Email Routing → your inbox)
- [x] Mirror all four shipped model repositories to R2 and set
      `NEXT_PUBLIC_MODEL_HOST=https://models.bgremove.cc/` (verified 2026-11-22)
- [x] Google Search Console + Bing Webmaster: verify, submit `https://bgremove.cc/sitemap.xml`
- [x] Analytics: GA4 configured and real page-view, image-processing and download events received

**Real-device test pass** (for each: sample image, own photo, change background, erase brush, download)
- [ ] iPhone Safari — incl. a photo straight from the camera roll and a 12 MP+ photo
- [ ] Mac Safari (no multi-threading there: expect ~3× slower than Chrome)
- [ ] Windows Chrome/Edge with a dedicated GPU — confirms the BiRefNet WebGPU path
      (footer of the editor shows `· GPU`)
- [ ] Android Chrome (mid/low-end phone)
- [ ] Firefox desktop
- [ ] Drag a `.heic` file into desktop Chrome

### Assets

- `public/og.png`, `public/logo.png`, `src/app/icon.svg`, `src/app/favicon.ico` — own artwork; regenerate if branding changes.
- Sample and background photos come from Unsplash (free commercial use, no attribution required).
  The portrait (`samples/woman.jpg`) shows a real person without a model release; replace it with a
  released or AI-generated portrait before running paid ads with it.
- `samples/*-cut.webp` were produced by this tool.
