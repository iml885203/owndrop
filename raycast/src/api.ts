import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPreferenceValues } from "@raycast/api";

export interface ExtensionPreferences {
  serverUrl: string;
  apiToken: string;
}

export interface LinkPreview {
  title: string;
  description: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

export interface DropItem {
  id: string;
  type: "text" | "image" | "file";
  text?: string;
  name?: string;
  mime?: string;
  size: number;
  device: string;
  pinned: boolean;
  linkPreview?: LinkPreview;
  createdAt: string;
}

export interface MeInfo {
  device: string | null;
  version: string;
  maxFileMb: number;
  maxPresignedFileMb: number;
  directUploadEnabled: boolean;
}

function getConfig(): { baseUrl: string; token: string } {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const baseUrl = prefs.serverUrl.trim().replace(/\/+$/, "");
  const token = prefs.apiToken.trim();
  if (
    !baseUrl.startsWith("https://") &&
    !baseUrl.startsWith("http://localhost") &&
    !baseUrl.startsWith("http://127.0.0.1")
  ) {
    throw new Error("Server URL must start with https:// (or http://localhost for local dev).");
  }
  if (!token) {
    throw new Error("Device API Token is required in extension preferences.");
  }
  return { baseUrl, token };
}

export function getServerUrl(): string {
  return getConfig().baseUrl;
}

async function apiFetch<T>(apiPath: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = getConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("User-Agent", "OwnDrop-Raycast/1.0");

  const res = await fetch(`${baseUrl}${apiPath}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `OwnDrop returned HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getMe(): Promise<MeInfo> {
  return apiFetch<MeInfo>("/api/me");
}

export async function listDrops(query = "", limit = 50): Promise<DropItem[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("q", query.trim());
  return apiFetch<DropItem[]>(`/api/items?${params.toString()}`);
}

export async function getLatestDrop(): Promise<DropItem> {
  return apiFetch<DropItem>("/api/items/latest");
}

export async function dropText(text: string): Promise<DropItem> {
  return apiFetch<DropItem>("/api/items/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".zip": "application/zip",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return map[ext] ?? "application/octet-stream";
}

export function normalizeLocalPath(rawPath: string): string {
  if (rawPath.startsWith("file://")) {
    try {
      return fileURLToPath(rawPath);
    } catch {
      return decodeURIComponent(rawPath.replace(/^file:\/\//, ""));
    }
  }
  return rawPath;
}

export async function dropFileFromPath(rawPath: string): Promise<DropItem> {
  const localPath = normalizeLocalPath(rawPath);
  const stat = await fs.stat(localPath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${path.basename(localPath)}`);
  }

  const name = path.basename(localPath);
  const mime = guessMime(name);
  const bytes = await fs.readFile(localPath);
  const me = await getMe().catch(() => null);
  const directLimit = (me?.maxFileMb ?? 90) * 1024 * 1024;

  if (me?.directUploadEnabled && bytes.byteLength > directLimit) {
    const presigned = await apiFetch<{
      uploadId: string;
      url: string;
      method: "PUT";
      headers: Record<string, string>;
    }>("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mime, size: bytes.byteLength }),
    });

    const putRes = await fetch(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: bytes,
    });
    if (!putRes.ok) {
      throw new Error(`Direct upload failed (${putRes.status})`);
    }
    return apiFetch<DropItem>("/api/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: presigned.uploadId }),
    });
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), name);
  return apiFetch<DropItem>("/api/items/file", {
    method: "POST",
    body: form,
  });
}

export async function setDropPinned(id: string, pinned: boolean): Promise<void> {
  await apiFetch<void>(`/api/items/${encodeURIComponent(id)}/pin`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
}

export async function deleteDrop(id: string): Promise<void> {
  await apiFetch<void>(`/api/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function downloadDropToDownloads(item: DropItem): Promise<string> {
  const { baseUrl, token } = getConfig();
  const res = await fetch(`${baseUrl}/api/files/${encodeURIComponent(item.id)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "OwnDrop-Raycast/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download file (HTTP ${res.status})`);
  }

  const downloadsDir = path.join(os.homedir(), "Downloads");
  await fs.mkdir(downloadsDir, { recursive: true });

  const safeName = (item.name || `owndrop-${item.id}`).replace(/[/\\:*?"<>|]/g, "_");
  const parsed = path.parse(safeName);
  let target = path.join(downloadsDir, safeName);
  for (let i = 1; i < 100; i++) {
    try {
      await fs.access(target);
      target = path.join(downloadsDir, `${parsed.name}-${i}${parsed.ext}`);
    } catch {
      break;
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(target, buffer);
  return target;
}

export function extractUrl(text?: string): string | null {
  const trimmed = text?.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
