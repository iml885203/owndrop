import { Copy, Download, ExternalLink, FileText, Pin, Share2, Trash2, ZoomIn } from "lucide-react";
import type { DropItem } from "../types";
import { extractWebUrl, formatBytes, formatRelativeTime, linkHost } from "../utils";

interface ItemCardProps {
  item: DropItem;
  pinning: boolean;
  onPinToggle: (item: DropItem) => void;
  onCopyText: (text: string) => void;
  onCopyImage: (item: DropItem) => void;
  onPreviewImage: (item: DropItem) => void;
  onDelete: (item: DropItem) => void;
}

export function ItemCard({
  item,
  pinning,
  onPinToggle,
  onCopyText,
  onCopyImage,
  onPreviewImage,
  onDelete,
}: ItemCardProps) {
  const url = item.type === "text" ? extractWebUrl(item.text) : "";
  const isVideo = Boolean(item.mime?.startsWith("video/"));
  const fileHref = `/api/files/${encodeURIComponent(item.id)}`;

  return (
    <li className="border-b border-[var(--border)] py-4 first:border-t">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {item.type === "image" && (
            <button
              type="button"
              onClick={() => onPreviewImage(item)}
              className="group relative mb-2.5 block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-0 cursor-zoom-in"
              aria-label={`Preview ${item.name || "image"}`}
            >
              <img
                src={fileHref}
                alt={item.name || "Uploaded image"}
                loading="lazy"
                className="max-h-56 w-auto max-w-full object-contain"
              />
              <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="size-3.5" />
                Preview
              </span>
            </button>
          )}

          {isVideo && (
            <video
              src={fileHref}
              controls
              preload="metadata"
              playsInline
              className="mb-2.5 max-h-64 w-full max-w-md rounded-xl bg-black"
            />
          )}

          {item.type === "text" && url ? (
            <div className="space-y-2">
              {item.linkPreview && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] no-underline transition-colors hover:bg-[var(--subtle)]"
                >
                  {item.linkPreview.image && (
                    <img
                      src={item.linkPreview.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="hidden h-24 w-32 shrink-0 object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                      {item.linkPreview.favicon && (
                        <img
                          src={item.linkPreview.favicon}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                          className="size-3.5 rounded-xs"
                        />
                      )}
                      <span className="truncate">{item.linkPreview.siteName || linkHost(url)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm font-semibold text-[var(--ink)]">
                      {item.linkPreview.title}
                    </div>
                    {item.linkPreview.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                        {item.linkPreview.description}
                      </div>
                    )}
                  </div>
                </a>
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 break-all text-sm font-medium text-[var(--accent)] hover:underline"
              >
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
                <span>{item.text}</span>
              </a>
            </div>
          ) : item.type === "text" ? (
            <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ink)]">
              {item.text}
            </p>
          ) : item.type === "file" ? (
            <a
              href={fileHref}
              download={item.name}
              className="inline-flex items-center gap-2 break-all text-sm font-semibold text-[var(--ink)] no-underline hover:underline"
            >
              <FileText className="size-4 shrink-0 text-[var(--accent)]" />
              <span>{item.name}</span>
            </a>
          ) : (
            <div className="text-xs font-medium text-[var(--muted)]">{item.name || "Image"}</div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            {item.pinned && (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--accent)]">
                <Pin className="size-3" />
                Pinned
              </span>
            )}
            <span>{item.device || "Unknown"}</span>
            <span>{formatRelativeTime(item.createdAt)}</span>
            <span>{formatBytes(item.size)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {item.type === "text" && item.text && (
            <button
              type="button"
              className="btn btn-ghost !px-2.5"
              onClick={() => onCopyText(item.text!)}
            >
              <Copy className="size-4" />
              <span>Copy</span>
            </button>
          )}

          {item.type === "image" && (
            <button
              type="button"
              className="btn btn-ghost !px-2.5"
              onClick={() => onCopyImage(item)}
            >
              <Copy className="size-4" />
              <span className="hidden sm:inline">Copy</span>
            </button>
          )}

          {item.type !== "text" && (
            <a href={fileHref} download={item.name} className="btn btn-ghost !px-2.5">
              <Download className="size-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}

          {item.type === "image" && (
            <button
              type="button"
              className="btn btn-ghost !px-2.5"
              onClick={() => onPreviewImage(item)}
              title="Share / Preview"
              aria-label="Share or preview image"
            >
              <Share2 className="size-4" />
              <span className="sm:hidden">Save</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-ghost !px-2.5"
            disabled={pinning}
            onClick={() => onPinToggle(item)}
            title={item.pinned ? "Unpin" : "Pin to top"}
            aria-label={item.pinned ? "Unpin" : "Pin to top"}
          >
            <Pin className={`size-4 ${item.pinned ? "text-[var(--accent)]" : ""}`} />
          </button>

          <button
            type="button"
            className="btn btn-danger !px-2.5"
            onClick={() => onDelete(item)}
            aria-label="Delete item"
            title="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
