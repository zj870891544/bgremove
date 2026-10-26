"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type MaskResult, removeBackground, warmUp } from "@/lib/remover/engine";
import { type Background, buildMask, decodeImage, isHeic, makeCanvas, releaseCanvas, thumbnail, updateCut } from "@/lib/remover/render";
import { track } from "@/lib/analytics";
import type { BgPreset } from "@/content/pages";
import { useI18n } from "@/i18n/I18nProvider";
import EditorModal from "./EditorModal";

export type Item = {
  id: string;
  name: string;
  file: Blob;
  status: "loading" | "queued" | "processing" | "done" | "error";
  error?: string;
  width: number;
  height: number;
  original?: HTMLCanvasElement;
  /** The model's raw prediction, kept so "Reset to AI result" can rebuild the mask. */
  raw?: MaskResult;
  mask?: HTMLCanvasElement;
  cut?: HTMLCanvasElement;
  thumb?: string;
  resultThumb?: string;
  bg: Background;
  history: ImageData[];
  ms?: number;
  /** Bumped whenever canvases are mutated, so views know to repaint. */
  version: number;
};

type Ctx = {
  items: Item[];
  activeId: string | null;
  open: boolean;
  setActive: (id: string) => void;
  setOpen: (open: boolean) => void;
  addFiles: (files: File[] | FileList, preset?: BgPreset) => void;
  addUrl: (url: string, preset?: BgPreset) => Promise<void>;
  removeItem: (id: string) => void;
  retry: (id: string) => void;
  patch: (id: string, p: Partial<Item>) => void;
  touch: (id: string) => void;
  pickFiles: (preset?: BgPreset) => void;
  setPreset: (p: BgPreset | undefined) => void;
};

const RemoverContext = createContext<Ctx | null>(null);

export function useRemover() {
  const ctx = useContext(RemoverContext);
  if (!ctx) throw new Error("useRemover must be used inside <RemoverProvider>");
  return ctx;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif,image/heic,image/heif,.heic,.heif";

function presetBg(p?: BgPreset): Background {
  return p === "white" ? { kind: "color", color: "#ffffff" } : { kind: "transparent" };
}

let uid = 0;

export default function RemoverProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef<BgPreset | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const { ui } = useI18n();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const touch = useCallback((id: string) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, version: it.version + 1 } : it)));
  }, []);

  const process = useCallback(
    async (id: string, file: Blob, name: string) => {
      try {
        const decoded = await decodeImage(file, name);
        patch(id, {
          status: "queued",
          original: decoded.canvas,
          width: decoded.width,
          height: decoded.height,
          thumb: thumbnail(decoded.canvas),
        });
        const bitmap = await createImageBitmap(decoded.canvas);
        patch(id, { status: "processing" });
        const result = await removeBackground(file, bitmap);
        const mask = buildMask(result, decoded.width, decoded.height);
        const cut = makeCanvas(decoded.width, decoded.height);
        updateCut(cut, decoded.canvas, mask);
        patch(id, { status: "done", raw: result, mask, cut, resultThumb: thumbnail(cut), ms: result.ms });
        track("bg_removed", { ms: result.ms, megapixels: Math.round((decoded.width * decoded.height) / 1e5) / 10 });
      } catch (err) {
        console.error(err);
        track("bg_remove_failed", { message: err instanceof Error ? err.message.slice(0, 100) : "unknown" });
        patch(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    },
    [patch]
  );

  const addBlobs = useCallback(
    (blobs: { blob: Blob; name: string }[], preset?: BgPreset) => {
      const images = blobs.filter(
        (b) => b.blob.type.startsWith("image/") || isHeic(b.blob, b.name) || /\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(b.name)
      );
      if (!images.length) return;
      track("image_added", { count: images.length, heic: images.some((b) => isHeic(b.blob, b.name)) });
      warmUp();
      const bg = presetBg(preset ?? presetRef.current);
      const created: Item[] = images.map(({ blob, name }) => ({
        id: `img-${Date.now()}-${uid++}`,
        name,
        file: blob,
        status: "loading",
        width: 0,
        height: 0,
        bg,
        history: [],
        version: 0,
      }));
      setItems((list) => [...list, ...created]);
      setActiveId(created[0].id);
      setOpen(true);
      created.forEach((it) => process(it.id, it.file, it.name));
    },
    [process]
  );

  const addFiles = useCallback(
    (files: File[] | FileList, preset?: BgPreset) => {
      addBlobs(
        Array.from(files).map((f) => ({ blob: f, name: f.name || "image.png" })),
        preset
      );
    },
    [addBlobs]
  );

  const addUrl = useCallback(
    async (url: string, preset?: BgPreset) => {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`Could not load image (${res.status})`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("That link is not an image");
      const name = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop() || "image.jpg");
      addBlobs([{ blob, name }], preset);
    },
    [addBlobs]
  );

  const removeItem = useCallback((id: string) => {
    const gone = itemsRef.current.find((it) => it.id === id);
    // Free the canvases once the editor has stopped drawing them.
    if (gone) setTimeout(() => [gone.original, gone.mask, gone.cut].forEach(releaseCanvas), 1000);
    setItems((list) => {
      const next = list.filter((it) => it.id !== id);
      setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      if (!next.length) setOpen(false);
      return next;
    });
  }, []);

  const retry = useCallback(
    (id: string) => {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it) return;
      patch(id, { status: "loading", error: undefined });
      process(id, it.file, it.name);
    },
    [patch, process]
  );

  const pickFiles = useCallback((preset?: BgPreset) => {
    if (preset) presetRef.current = preset;
    warmUp();
    inputRef.current?.click();
  }, []);

  const setPreset = useCallback((p: BgPreset | undefined) => {
    presetRef.current = p;
  }, []);

  // Report uncaught errors so failures on real devices show up in analytics.
  useEffect(() => {
    const onError = (e: ErrorEvent) => track("js_error", { message: String(e.message).slice(0, 100) });
    const onRejection = (e: PromiseRejectionEvent) =>
      track("js_error", { message: String(e.reason?.message ?? e.reason).slice(0, 100) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Global drag & drop and clipboard paste — works anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
      warmUp();
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || isHeic(f, f.name));
      if (files.length) {
        e.preventDefault();
        addFiles(files.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}-${i}.png`, { type: f.type })));
        return;
      }
      // Pasting a plain image URL outside of text inputs loads it too.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const text = e.clipboardData?.getData("text")?.trim();
      if (text && /^https?:\/\/\S+$/i.test(text)) addUrl(text).catch(() => undefined);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [addFiles, addUrl]);

  const value = useMemo<Ctx>(
    () => ({
      items,
      activeId,
      open,
      setActive: setActiveId,
      setOpen,
      addFiles,
      addUrl,
      removeItem,
      retry,
      patch,
      touch,
      pickFiles,
      setPreset,
    }),
    [items, activeId, open, addFiles, addUrl, removeItem, retry, patch, touch, pickFiles, setPreset]
  );

  return (
    <RemoverContext.Provider value={value}>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-brand/15 p-6 backdrop-blur-sm">
          <div className="rounded-3xl border-4 border-dashed border-brand bg-white/90 px-10 py-12 text-center shadow-float">
            <p className="text-2xl font-extrabold text-ink">{ui.upload.dropTitle}</p>
            <p className="mt-2 text-ink-soft">{ui.upload.dropSub}</p>
          </div>
        </div>
      )}
      {open && items.length > 0 && <EditorModal />}
    </RemoverContext.Provider>
  );
}

