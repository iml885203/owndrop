import { t } from "../i18n";
import { useRef, useState } from "react";
import { Check, Clipboard, Pencil, Send, Upload } from "lucide-react";

interface ComposerProps {
  device: string;
  onDeviceChange: (name: string) => void;
  busy: boolean;
  uploadProgress: string;
  maxFileMb: number;
  maxPresignedFileMb: number;
  directUploadEnabled: boolean;
  onSendText: (text: string) => Promise<void>;
  onUploadFiles: (files: File[]) => Promise<void>;
  onPasteAndSend: () => Promise<void>;
}

export function Composer({
  device,
  onDeviceChange,
  busy,
  uploadProgress,
  maxFileMb,
  maxPresignedFileMb,
  directUploadEnabled,
  onSendText,
  onUploadFiles,
  onPasteAndSend,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [editingDevice, setEditingDevice] = useState(false);
  const [deviceDraft, setDeviceDraft] = useState(device);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitText = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    await onSendText(trimmed);
    setText("");
  };

  const commitDevice = () => {
    const clean = deviceDraft.trim();
    if (clean) onDeviceChange(clean);
    else setDeviceDraft(device);
    setEditingDevice(false);
  };

  return (
    <section className="card p-5 md:sticky md:top-20">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-tight">{t("dropAnything")}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("sendToDevices")}</p>
        </div>
      </div>

      <div className="mb-4">
        {editingDevice ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              commitDevice();
            }}
          >
            <input
              className="field !h-8 !py-1 text-xs"
              value={deviceDraft}
              maxLength={48}
              autoFocus
              onChange={(e) => setDeviceDraft(e.target.value)}
              onBlur={commitDevice}
              aria-label={t("deviceName")}
            />
            <button type="submit" className="btn btn-outline !min-h-8 !px-2.5" aria-label={t("saveDeviceName")}>
              <Check className="size-3.5" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDeviceDraft(device);
              setEditingDevice(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--subtle)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer border-0"
            title={t("renameDevice")}
          >
            <span>{t("fromDevice", { device })}</span>
            <Pencil className="size-3" />
          </button>
        )}
      </div>

      <textarea
        className="field min-h-[112px] resize-y text-sm leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t("textOrLink")}
        placeholder={t("pastePlaceholder")}
        maxLength={65536}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submitText();
          }
        }}
      />

      <button
        type="button"
        className="btn btn-primary mt-3 w-full"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        title="⌘ or Ctrl + Enter"
        disabled={busy || !text.trim()}
        onClick={() => void submitText()}
      >
        <Send className="size-4" />
        <span>{t("dropText")}</span>
      </button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            if (list.length > 0) void onUploadFiles(list);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-outline min-w-0 px-2! py-1!"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-4 shrink-0" />
          <span className="min-w-0">{uploadProgress || t("uploadFiles")}</span>
        </button>
        <button
          type="button"
          className="btn btn-outline min-w-0 px-2! py-1!"
          disabled={busy}
          onClick={() => void onPasteAndSend()}
        >
          <Clipboard className="size-4 shrink-0" />
          <span className="min-w-0">{t("pasteDrop")}</span>
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        {t("fileLimit", { size: directUploadEnabled ? maxPresignedFileMb : maxFileMb })}
      </p>
    </section>
  );
}
