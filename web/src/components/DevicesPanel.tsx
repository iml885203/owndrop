import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Laptop, Plus, Smartphone, Terminal, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { ApiTokenView, CreatedApiToken } from "../types";
import { formatRelativeTime } from "../utils";

interface DevicesPanelProps {
  open: boolean;
  onClose: () => void;
  onFlash: (msg: string) => void;
}

export function DevicesPanel({ open, onClose, onFlash }: DevicesPanelProps) {
  const [tokens, setTokens] = useState<ApiTokenView[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<CreatedApiToken | null>(null);
  const [guideTab, setGuideTab] = useState<"raycast" | "ios" | "cli">("raycast");
  const [copiedKey, setCopiedKey] = useState("");

  const origin = window.location.origin;

  const loadTokens = async () => {
    setLoading(true);
    try {
      setTokens(await api.listTokens());
    } catch (err) {
      onFlash((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setFreshToken(null);
      void loadTokens();
    }
  }, [open]);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deviceName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await api.createToken(trimmed);
      setFreshToken(created);
      setDeviceName("");
      await loadTokens();
      onFlash(`Created token for ${created.name}`);
    } catch (err) {
      onFlash((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: ApiTokenView) => {
    if (!window.confirm(`Revoke access for "${token.name}"? This device will be disconnected immediately.`)) {
      return;
    }
    try {
      await api.revokeToken(token.id);
      await loadTokens();
      onFlash(`Revoked ${token.name}`);
    } catch (err) {
      onFlash((err as Error).message);
    }
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1800);
    } catch {
      onFlash("Could not copy to clipboard");
    }
  };

  const tokenPlaceholder = freshToken?.token ?? "<YOUR_DEVICE_TOKEN>";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Connected Devices & Integrations"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-[var(--accent)]" />
            <h2 className="m-0 text-base font-semibold">Connected Devices &amp; Zero-Browser Setup</h2>
          </div>
          <button type="button" className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Create Device Token */}
          <section>
            <h3 className="m-0 text-sm font-semibold">1. Create a Device Token</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Each device gets its own revocable token and automatic device label (e.g., MacBook Pro, Windows PC, iPhone).
            </p>
            <form onSubmit={(e) => void handleCreate(e)} className="mt-3 flex gap-2">
              <input
                className="field text-sm"
                placeholder="e.g. MacBook Raycast, iPhone Shortcuts, Work Windows"
                value={deviceName}
                maxLength={48}
                onChange={(e) => setDeviceName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary shrink-0" disabled={creating || !deviceName.trim()}>
                <Plus className="size-4" />
                <span>Create</span>
              </button>
            </form>

            {freshToken && (
              <div className="mt-3 rounded-xl border border-[var(--accent)] bg-[var(--subtle)] p-3.5">
                <div className="text-xs font-semibold text-[var(--accent)]">
                  Token for "{freshToken.name}" — copy now, it will not be shown again:
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
                    {freshToken.token}
                  </code>
                  <button
                    type="button"
                    className="btn btn-outline shrink-0"
                    onClick={() => void copyValue("fresh", freshToken.token)}
                  >
                    {copiedKey === "fresh" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    <span>{copiedKey === "fresh" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Active Tokens List */}
            <div className="mt-4">
              {loading ? (
                <p className="text-xs text-[var(--muted)]">Loading devices…</p>
              ) : tokens.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No device tokens yet. Create one above for Raycast or iPhone.</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] p-0">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-[var(--muted)]">
                          <code>{t.prefix}…</code> · Created {formatRelativeTime(t.createdAt)}
                          {t.lastUsedAt ? ` · Last used ${formatRelativeTime(t.lastUsedAt)}` : " · Never used"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger !min-h-8 !px-2.5 text-xs"
                        onClick={() => void handleRevoke(t)}
                      >
                        <Trash2 className="size-3.5" />
                        <span>Revoke</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Interactive Integration Guide */}
          <section className="border-t border-[var(--border)] pt-5">
            <h3 className="m-0 text-sm font-semibold">2. Connect Without Opening a Browser</h3>
            <div className="mt-3 flex gap-1.5 rounded-xl bg-[var(--subtle)] p-1">
              <button
                type="button"
                className={`btn flex-1 !min-h-9 text-xs ${guideTab === "raycast" ? "btn-outline" : "btn-ghost"}`}
                onClick={() => setGuideTab("raycast")}
              >
                <Laptop className="size-3.5" />
                <span>Raycast (Mac &amp; Win)</span>
              </button>
              <button
                type="button"
                className={`btn flex-1 !min-h-9 text-xs ${guideTab === "ios" ? "btn-outline" : "btn-ghost"}`}
                onClick={() => setGuideTab("ios")}
              >
                <Smartphone className="size-3.5" />
                <span>iPhone Shortcuts</span>
              </button>
              <button
                type="button"
                className={`btn flex-1 !min-h-9 text-xs ${guideTab === "cli" ? "btn-outline" : "btn-ghost"}`}
                onClick={() => setGuideTab("cli")}
              >
                <Terminal className="size-3.5" />
                <span>CLI / curl</span>
              </button>
            </div>

            {guideTab === "raycast" && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--border)] p-4 text-xs leading-relaxed">
                <p className="m-0 text-[var(--muted)]">
                  Install the <strong>OwnDrop</strong> extension in Raycast (works on both <strong>macOS</strong> and{" "}
                  <strong>Windows</strong>), then paste these preferences:
                </p>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--subtle)] px-3 py-2">
                  <span>
                    <strong>Server URL:</strong> <code>{origin}</code>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-7 !px-2 text-xs"
                    onClick={() => void copyValue("origin", origin)}
                  >
                    {copiedKey === "origin" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
                <p className="m-0 text-[var(--muted)]">
                  Recommended hotkeys: bind <strong>Drop Clipboard</strong> and <strong>Copy Latest Drop</strong> so you never need to open a browser tab again.
                </p>
              </div>
            )}

            {guideTab === "ios" && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--border)] p-4 text-xs leading-relaxed text-[var(--muted)]">
                <p className="m-0 text-[var(--ink)] font-medium">Send from iOS Share Sheet ("Send to OwnDrop"):</p>
                <ol className="m-0 list-decimal space-y-1 pl-4">
                  <li>Open Apple Shortcuts → create shortcut → enable <strong>Show in Share Sheet</strong> (Any input).</li>
                  <li>
                    Add <strong>Get Contents of URL</strong>:
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      <li>For files/photos: <code>POST {origin}/api/items/file</code> (Form field <code>file</code>)</li>
                      <li>For text/URLs: <code>POST {origin}/api/items/text</code> (JSON <code>{`{"text": "<input>"}`}</code>)</li>
                      <li>Header: <code>Authorization: Bearer {tokenPlaceholder}</code></li>
                    </ul>
                  </li>
                </ol>
                <p className="m-0 pt-1 text-[var(--ink)] font-medium">Receive in 1 tap ("Get Latest OwnDrop"):</p>
                <p className="m-0">
                  Call <code>GET {origin}/api/items/latest</code> with the same Bearer header → Copy <code>text</code> to Clipboard (or fetch <code>/api/files/&#123;id&#125;</code> for images/files). Bind to Action Button or Control Center.
                </p>
              </div>
            )}

            {guideTab === "cli" && (
              <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] p-4 text-xs">
                <pre className="m-0 overflow-x-auto rounded-lg bg-[var(--subtle)] p-3 text-[11px] leading-relaxed">
{`# Send text
curl -X POST "${origin}/api/items/text" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello from terminal"}'

# Upload a file
curl -X POST "${origin}/api/items/file" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -F "file=@/path/to/photo.png"

# Copy latest item (macOS)
curl -s "${origin}/api/items/latest" \\
  -H "Authorization: Bearer ${tokenPlaceholder}" | jq -r .text | pbcopy`}
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
