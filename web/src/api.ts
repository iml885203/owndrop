import type { ApiTokenView, CreatedApiToken, DropItem, MeInfo, SessionInfo } from "./types";

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed (${res.status})`);
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
        throw new Error(`Direct storage upload failed (${putRes.status})`);
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
