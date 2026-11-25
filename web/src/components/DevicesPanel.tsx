import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, X } from "lucide-react";
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
      setFreshToken((current) => current?.id === token.id ? null : current);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Devices"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-[var(--accent)]" />
            <h2 className="m-0 text-base font-semibold">Devices</h2>
          </div>
          <button type="button" className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Create Device Token */}
          <section>
            <h3 className="m-0 text-sm font-semibold">Add a device</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Create a token to connect an app or device.
            </p>
            <form onSubmit={(e) => void handleCreate(e)} className="mt-3 flex gap-2">
              <input
                className="field text-sm"
                aria-label="Device name"
                placeholder="Device name"
                value={deviceName}
                maxLength={48}
                onChange={(e) => setDeviceName(e.target.value)}
              />
              <button type="submit" className="btn btn-primary shrink-0" disabled={creating || !deviceName.trim()}>
                <Plus className="size-4" />
                <span>Add device</span>
              </button>
            </form>

            {freshToken && (
              <div className="mt-3 rounded-xl border border-[var(--accent)] bg-[var(--subtle)] p-3.5">
                <p className="m-0 text-sm font-semibold">{freshToken.name} is ready to connect</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Copy the details now. The token is shown only once.
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-2"
                  onClick={() => void copyValue("connection-details", `owndrop-setup:v1 ${origin} ${freshToken.token}`)}
                >
                  {copiedKey === "connection-details" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  <span>{copiedKey === "connection-details" ? "Copied" : "Copy Connection Details"}</span>
                </button>
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-[var(--muted)]">Manual setup</summary>
                  <dl className="my-2 space-y-2">
                    <div>
                      <dt>Server URL</dt>
                      <dd className="m-0 break-all"><code>{origin}</code></dd>
                    </div>
                    <div>
                      <dt>Device token</dt>
                      <dd className="m-0 break-all"><code>{freshToken.token}</code></dd>
                    </div>
                  </dl>
                  <button type="button" className="btn btn-outline" onClick={() => void copyValue("fresh", freshToken.token)}>
                    {copiedKey === "fresh" ? "Copied" : "Copy token"}
                  </button>
                </details>
              </div>
            )}

            {/* Active Tokens List */}
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold">Connected devices</h3>
              {loading ? (
                <p className="text-xs text-[var(--muted)]">Loading devices…</p>
              ) : tokens.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No connected devices yet.</p>
              ) : (
                <ul className="m-0 list-none divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] p-0">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {t.lastUsedAt ? `Last used ${formatRelativeTime(t.lastUsedAt)}` : "Never used"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger !min-h-8 !px-2.5 text-xs"
                        aria-label={`Revoke ${t.name}`}
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

          <a
            className="text-xs text-[var(--muted)] underline underline-offset-4"
            href="https://github.com/iml885203/owndrop#-connect-your-devices-zero-browser-workflow"
            target="_blank"
            rel="noreferrer"
          >
            Connection guides
          </a>
        </div>
      </div>
    </div>
  );
}
