"use client";

type Params = Record<string, string | number | boolean | undefined>;

type AnalyticsWindow = Window & {
  gtag?: (cmd: "event", name: string, params?: Params) => void;
  plausible?: (name: string, opts?: { props?: Params }) => void;
};

/**
 * Product events (upload, success, failure, download). Sent to whichever analytics
 * tool is loaded — GA4 and/or Plausible — and silently dropped when none is.
 */
export function track(name: string, params: Params = {}) {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  try {
    w.gtag?.("event", name, params);
    w.plausible?.(name, { props: params });
  } catch {
    // Analytics must never break the tool.
  }
  if (process.env.NODE_ENV !== "production") console.debug("[track]", name, params);
}
