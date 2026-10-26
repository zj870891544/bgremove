import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: deploy the `out/` folder to Cloudflare Pages, Vercel, Netlify, S3…
  output: "export",
  images: { unoptimized: true },
  // English and the other languages use separate root layouts, so the 404 page needs its own shell.
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
