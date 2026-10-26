import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Logo } from "@/components/Logo";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "404 – Page not found | BGRemove",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${jakarta.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-line/70">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
            <Link href="/" aria-label="BGRemove home">
              <Logo />
            </Link>
          </div>
        </header>
        <main className="mx-auto flex max-w-xl flex-1 flex-col items-center px-4 py-28 text-center">
          <p className="checker flex h-24 w-24 items-center justify-center rounded-3xl text-3xl font-extrabold text-brand ring-1 ring-line">404</p>
          <h1 className="mt-6 text-3xl font-extrabold">This page has been removed — like a background.</h1>
          <p className="mt-3 text-ink-soft">The page you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/" className="mt-8 rounded-full bg-brand px-7 py-3 font-bold text-white hover:bg-brand-dark">
            Remove a background
          </Link>
        </main>
      </body>
    </html>
  );
}
