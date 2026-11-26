import { locale, t } from "./i18n";
import type { ApiTokenView, CreatedApiToken, DropItem, MeInfo, SessionInfo } from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, detail?: string) {
    super(localizeApiError(status, detail));
    this.name = "ApiError";
  }
}

function localizeApiError(status: number, detail?: string): string {
  if (detail === "Invalid password") return t("invalidPassword");
  if (detail === "Too many login attempts. Please wait a few minutes.") return t("loginLimited");
  const textLimit = detail?.match(/^Text must be between 1 and (\d+) bytes$/);
  if (textLimit) return t("textTooLarge", { max: Number(textLimit[1]) });
  if (status === 413) return t("fileTooLarge");
  if (locale === "en" && detail) return detail;
  if (status === 404) return t("notFound");
  return t("requestFailed", { status });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return t("networkFailed");
  return locale === "en" && error instanceof Error ? error.message : t("unexpectedError");
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, typeof body?.error === "string" ? body.error : undefined);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getSession: () => requestJson<SessionInfo>("/api/session"),
  getMe: () => requestJson<MeInfo>("/api/me"),

  login: (password: string) =>
    requestJson<{ authenticated: boolean }>("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    requestJson<void>("/api/logout", {
      method: "POST",
    }),

  listItems: (q = "", limit = 100) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", String(limit));
    return requestJson<DropItem[]>(`/api/items?${params.toString()}`);
  },

  addText: (text: string, device: string) =>
    requestJson<DropItem>("/api/items/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, device }),
    }),

  uploadFile: async (file: File, device: string, me: MeInfo | null): Promise<DropItem> => {
    const directLimitBytes = (me?.maxFileMb ?? 90) * 1024 * 1024;
    if (me?.directUploadEnabled && file.size > directLimitBytes) {
      const presigned = await requestJson<{
        uploadId: string;
        url: string;
        method: "PUT";
        headers: Record<string, string>;
      }>("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          device,
        }),
      });
      const putRes = await fetch(presigned.url, {
        method: presigned.method,
        headers: presigned.headers,
        body: file,
      });
      if (!putRes.ok) {
        throw new ApiError(putRes.status, `Direct storage upload failed (${putRes.status})`);
      }
      return requestJson<DropItem>("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: presigned.uploadId }),
      });
    }

    const form = new FormData();
    form.append("device", device);
    form.append("file", file);
    return requestJson<DropItem>("/api/items/file", {
      method: "POST",
      body: form,
    });
  },

  setPinned: (id: string, pinned: boolean) =>
    requestJson<void>(`/api/items/${encodeURIComponent(id)}/pin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }),

  deleteItem: (id: string) =>
    requestJson<void>(`/api/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  listTokens: () => requestJson<ApiTokenView[]>("/api/tokens"),

  createToken: (name: string) =>
    requestJson<CreatedApiToken>("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  revokeToken: (id: string) =>
    requestJson<void>(`/api/tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
