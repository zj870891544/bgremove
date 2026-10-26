# BGRemove.cc — free AI background remover

A fully static Next.js site that removes image backgrounds **in the browser** (no server, no GPU bill),
built to rank for the high-volume keywords `remove bg`, `remove background`, `background remover`,
`background remove` and `bg remove`.

## Features

- Upload by button, drag & drop anywhere, paste (Ctrl/⌘+V), image URL, or sample images
- Automatic background removal in a Web Worker
  - WebGPU with enough storage-buffer slots → BiRefNet-lite (MIT, best edges)
  - Otherwise (incl. Apple GPUs, or if the GPU run fails/hangs) → a fresh worker running
    ISNet fp16 on multi-threaded WASM (Apache-2.0), ~2 s per image on a laptop
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
- Mainland China: huggingface.co is blocked there, so `/zh` only works for those users once the models are mirrored (`NEXT_PUBLIC_MODEL_HOST`).

## Develop

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
| `NEXT_PUBLIC_BG_GPU_MODEL` | Hugging Face model id for WebGPU |
| `NEXT_PUBLIC_BG_CPU_MODEL` | Hugging Face model id for CPU / fallback |
| `NEXT_PUBLIC_MODEL_HOST` | Mirror of model files (e.g. `https://models.bgremove.cc/`) |
| `NEXT_PUBLIC_BG_API_URL` | Use a server API instead (POST multipart `image`, returns PNG) |

### Product events

`src/lib/analytics.ts` sends these to GA4 / Plausible when configured:
`image_added`, `bg_removed`, `bg_remove_failed`, `download`, `download_zip`,
`engine_ready` (device, model, cross-origin isolated?), `engine_gpu_fallback`, `engine_failed`, `js_error`.

## Launch checklist

**Accounts & DNS (owner)**
- [ ] Cloudflare Pages project → build `npm run build`, output `out`, Node 20+
- [ ] Custom domain `bgremove.cc`; add `www.bgremove.cc` too and create a Cloudflare
      *Redirect Rule*: `www.bgremove.cc/*` → `https://bgremove.cc/${1}` (301).
      (`_redirects` can't do host-level redirects on Pages.)
- [ ] Check the live site is cross-origin isolated: DevTools console → `crossOriginIsolated` is `true`
- [ ] Email routing for `hello@bgremove.cc` (Cloudflare Email Routing → your inbox)
- [ ] Mirror both model repos to your own Hugging Face account (or R2) and set
      `NEXT_PUBLIC_BG_GPU_MODEL` / `NEXT_PUBLIC_BG_CPU_MODEL` / `NEXT_PUBLIC_MODEL_HOST`
- [ ] Google Search Console + Bing Webmaster: verify, submit `https://bgremove.cc/sitemap.xml`
- [ ] Analytics: enable Cloudflare Web Analytics and/or set GA4 / Plausible env vars

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
