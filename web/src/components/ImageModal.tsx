import { t } from "../i18n";
import { useState } from "react";
import { Copy, Download, Share2, X } from "lucide-react";
import type { DropItem } from "../types";
import { formatBytes } from "../utils";

interface ImageModalProps {
  item: DropItem | null;
  onClose: () => void;
  onCopyImage: (item: DropItem) => void;
  onFlash: (msg: string) => void;
}

export function ImageModal({ item, onClose, onCopyImage, onFlash }: ImageModalProps) {
  const [sharing, setSharing] = useState(false);
  if (!item) return null;

  const src = `/api/files/${encodeURIComponent(item.id)}`;

  const shareNative = async () => {
    if (!navigator.share) {
      onFlash(t("longPress"));
      return;
    }
    setSharing(true);
    try {
      const res = await fetch(src, { credentials: "same-origin" });
      const blob = await res.blob();
      const file = new File([blob], item.name || "owndrop-image.png", { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        onFlash(t("shareUnsupported"));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onFlash(t("shareFailed"));
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={t("imagePreview")}
      onClick={onClose}
    >
      <div
        className="card @container flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-44 items-baseline gap-2 text-sm">
            <span className="truncate font-medium text-[var(--ink)]" title={item.name || t("image")}>
              {item.name || t("image")}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[var(--muted)]">{formatBytes(item.size)}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
            <button type="button" className="btn btn-ghost min-w-11" aria-label={t("copy")} onClick={() => onCopyImage(item)}>
              <Copy className="size-4" />
              <span className="hidden @min-[30rem]:inline">{t("copy")}</span>
            </button>
            {typeof navigator.share === "function" && (
              <button type="button" className="btn btn-ghost min-w-11" aria-label={sharing ? t("preparing") : t("shareSave")} disabled={sharing} onClick={() => void shareNative()}>
                <Share2 className="size-4" />
                <span className="hidden @min-[30rem]:inline">{sharing ? t("preparing") : t("shareSave")}</span>
              </button>
            )}
            <a href={src} download={item.name || "image"} className="btn btn-ghost min-w-11" aria-label={t("download")}>
              <Download className="size-4" />
              <span className="hidden @min-[30rem]:inline">{t("download")}</span>
            </a>
            <button type="button" className="btn btn-ghost min-w-11 px-2!" onClick={onClose} aria-label={t("close")}>
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--subtle)] p-4">
          <img src={src} alt={item.name || t("preview")} className="max-h-[75vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
