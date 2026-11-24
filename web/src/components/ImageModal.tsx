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
      onFlash("Use long-press or Download to save this image.");
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
        onFlash("This browser does not support file sharing; use Download.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onFlash("Could not open share sheet.");
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
      aria-label="Image preview"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 truncate text-sm text-[var(--muted)]">
            <span className="font-medium text-[var(--ink)]">{item.name || "Image"}</span>
            {" · "}
            {formatBytes(item.size)}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost" onClick={() => onCopyImage(item)}>
              <Copy className="size-4" />
              <span>Copy</span>
            </button>
            {typeof navigator.share === "function" && (
              <button type="button" className="btn btn-ghost" disabled={sharing} onClick={() => void shareNative()}>
                <Share2 className="size-4" />
                <span>{sharing ? "Preparing…" : "Share / Save"}</span>
              </button>
            )}
            <a href={src} download={item.name || "image"} className="btn btn-ghost">
              <Download className="size-4" />
              <span>Download</span>
            </a>
            <button type="button" className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--subtle)] p-4">
          <img src={src} alt={item.name || "Preview"} className="max-h-[75vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
