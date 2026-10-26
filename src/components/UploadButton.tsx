"use client";

import { warmUp } from "@/lib/remover/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { useRemover } from "./remover/RemoverProvider";

export default function UploadButton({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  const { pickFiles } = useRemover();
  const { ui } = useI18n();
  return (
    <button type="button" onClick={() => pickFiles()} onPointerEnter={warmUp} className={className}>
      {children ?? ui.upload.button}
    </button>
  );
}
