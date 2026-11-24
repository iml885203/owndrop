import { randomUuid, sha256Hex } from "./crypto.js";
import type { ApiTokenView, DbAdapter, DropItem, LinkPreview, StoredFileMeta } from "./types.js";

interface ItemRow {
  id: string;
  kind: "text" | "image" | "file";
  text: string | null;
  name: string | null;
  mime: string | null;
  size: number;
  storage_key: string | null;
  device: string;
  pinned: number;
  preview_status: "pending" | "ready" | "failed" | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  link_site_name: string | null;
  link_favicon: string | null;
  created_at: string;
}

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface PendingUploadRow {
  id: string;
  storage_key: string;
  name: string;
  mime: string;
  expected_size: number;
  device: string;
  expires_at: number;
}

interface OidcTxRow {
  state: string;
  nonce: string;
  code_verifier: string;
  browser_binding_hash: string;
  expires_at: number;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned.length > 0 ? cleaned : "untitled-file";
}

export function sanitizeDevice(device: string): string {
  return device
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 48);
}

function rowToItem(row: ItemRow): DropItem {
  const item: DropItem = {
    id: row.id,
    type: row.kind,
    size: Number(row.size),
    device: row.device,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at,
  };
  if (row.text !== null) item.text = row.text;
  if (row.name !== null) item.name = row.name;
  if (row.mime !== null) item.mime = row.mime;
  if (row.preview_status !== null) item.previewStatus = row.preview_status;
  if (row.link_title !== null) {
    item.linkPreview = {
      title: row.link_title,
      description: row.link_description ?? "",
      ...(row.link_image ? { image: row.link_image } : {}),
      ...(row.link_site_name ? { siteName: row.link_site_name } : {}),
      ...(row.link_favicon ? { favicon: row.link_favicon } : {}),
    };
  }
  return item;
}

export class DropRepository {
  constructor(
    private readonly db: DbAdapter,
    private readonly retentionDays: number,
    private readonly maxStorageBytes: number,
  ) {}

  async listItems(query = "", limit = 100): Promise<DropItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const trimmed = query.trim();
    const needle = `%${trimmed}%`;
    const rows = await this.db.queryAll<ItemRow>(
      `SELECT id, kind, text, name, mime, size, storage_key, device, pinned,
              preview_status, link_title, link_description, link_image, link_site_name, link_favicon, created_at
       FROM items
       WHERE ?1 = '%%' OR COALESCE(text, '') LIKE ?1 OR COALESCE(name, '') LIKE ?1 OR device LIKE ?1
       ORDER BY pinned DESC, created_at DESC
       LIMIT ?2`,
      [needle, safeLimit],
    );
    return rows.map(rowToItem);
  }

  async getLatestItem(): Promise<DropItem | null> {
    const row = await this.db.queryFirst<ItemRow>(
      `SELECT id, kind, text, name, mime, size, storage_key, device, pinned,
              preview_status, link_title, link_description, link_image, link_site_name, link_favicon, created_at
       FROM items
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    return row ? rowToItem(row) : null;
  }

  async getItem(id: string): Promise<DropItem | null> {
    const row = await this.db.queryFirst<ItemRow>(
      `SELECT id, kind, text, name, mime, size, storage_key, device, pinned,
              preview_status, link_title, link_description, link_image, link_site_name, link_favicon, created_at
       FROM items WHERE id = ?1`,
      [id],
    );
    return row ? rowToItem(row) : null;
  }

  async addText(text: string, device: string): Promise<DropItem> {
    const id = randomUuid();
    const cleanDevice = sanitizeDevice(device);
    const createdAt = new Date().toISOString();
    const size = new TextEncoder().encode(text).byteLength;
    await this.db.execute(
      `INSERT INTO items (id, kind, text, size, device, pinned, created_at)
       VALUES (?1, 'text', ?2, ?3, ?4, 0, ?5)`,
      [id, text, size, cleanDevice, createdAt],
    );
    return {
      id,
      type: "text",
      text,
      size,
      device: cleanDevice,
      pinned: false,
      createdAt,
    };
  }

  async addFileRecord(params: {
    id?: string;
    storageKey: string;
    name: string;
    mime: string;
    size: number;
    device: string;
  }): Promise<DropItem> {
    const id = params.id ?? randomUuid();
    const safeName = sanitizeFilename(params.name);
    const cleanDevice = sanitizeDevice(params.device);
    const kind = params.mime.startsWith("image/") ? "image" : "file";
    const createdAt = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO items (id, kind, name, mime, size, storage_key, device, pinned, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`,
      [id, kind, safeName, params.mime, params.size, params.storageKey, cleanDevice, createdAt],
    );
    return {
      id,
      type: kind,
      name: safeName,
      mime: params.mime,
      size: params.size,
      device: cleanDevice,
      pinned: false,
      createdAt,
    };
  }

  async setPinned(id: string, pinned: boolean): Promise<boolean> {
    const res = await this.db.execute(`UPDATE items SET pinned = ?2 WHERE id = ?1`, [id, pinned ? 1 : 0]);
    return res.changes > 0;
  }

  async removeItem(id: string): Promise<{ deleted: boolean; storageKey?: string }> {
    const row = await this.db.queryFirst<{ storage_key: string | null }>(
      `SELECT storage_key FROM items WHERE id = ?1`,
      [id],
    );
    if (!row) return { deleted: false };
    const res = await this.db.execute(`DELETE FROM items WHERE id = ?1`, [id]);
    return {
      deleted: res.changes > 0,
      ...(row.storage_key ? { storageKey: row.storage_key } : {}),
    };
  }

  async findFile(id: string): Promise<StoredFileMeta | null> {
    const row = await this.db.queryFirst<{
      id: string;
      storage_key: string;
      name: string | null;
      mime: string | null;
      size: number;
    }>(`SELECT id, storage_key, name, mime, size FROM items WHERE id = ?1 AND storage_key IS NOT NULL`, [id]);
    if (!row) return null;
    return {
      id: row.id,
      storageKey: row.storage_key,
      name: row.name ?? "download",
      mime: row.mime ?? "application/octet-stream",
      size: Number(row.size),
    };
  }

  async queueLinkPreview(id: string): Promise<void> {
    await this.db.execute(`UPDATE items SET preview_status = 'pending' WHERE id = ?1 AND kind = 'text'`, [id]);
  }

  async saveLinkPreview(id: string, preview: LinkPreview): Promise<void> {
    await this.db.execute(
      `UPDATE items
       SET preview_status = 'ready', link_title = ?2, link_description = ?3,
           link_image = ?4, link_site_name = ?5, link_favicon = ?6
       WHERE id = ?1`,
      [
        id,
        preview.title,
        preview.description,
        preview.image ?? null,
        preview.siteName ?? null,
        preview.favicon ?? null,
      ],
    );
  }

  async failLinkPreview(id: string): Promise<void> {
    await this.db.execute(`UPDATE items SET preview_status = 'failed' WHERE id = ?1`, [id]);
  }

  /**
   * Removes expired items, expired sessions/transactions/pending uploads,
   * and enforces total file storage cap. Returns storage keys to delete from BlobStore.
   */
  async cleanup(nowMs = Date.now()): Promise<{ removedStorageKeys: string[]; removedCount: number }> {
    const cutoff = new Date(nowMs - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const nowSec = Math.floor(nowMs / 1000);
    const removedStorageKeys: string[] = [];

    const expiredFiles = await this.db.queryAll<{ storage_key: string }>(
      `SELECT storage_key FROM items WHERE created_at < ?1 AND storage_key IS NOT NULL`,
      [cutoff],
    );
    for (const row of expiredFiles) removedStorageKeys.push(row.storage_key);

    const expiredDel = await this.db.execute(`DELETE FROM items WHERE created_at < ?1`, [cutoff]);
    let removedCount = expiredDel.changes;

    await this.db.execute(`DELETE FROM sessions WHERE expires_at < ?1`, [nowSec]);
    await this.db.execute(`DELETE FROM oidc_transactions WHERE expires_at < ?1`, [nowSec]);
    const expiredPending = await this.db.queryAll<{ storage_key: string }>(
      `SELECT storage_key FROM pending_uploads WHERE expires_at < ?1`,
      [nowSec],
    );
    for (const row of expiredPending) removedStorageKeys.push(row.storage_key);
    await this.db.execute(`DELETE FROM pending_uploads WHERE expires_at < ?1`, [nowSec]);

    const evicted = await this.enforceStorageLimit();
    removedStorageKeys.push(...evicted);
    removedCount += evicted.length;

    return { removedStorageKeys, removedCount };
  }

  async enforceStorageLimit(): Promise<string[]> {
    const evictedKeys: string[] = [];
    while (true) {
      const sumRow = await this.db.queryFirst<{ total: number }>(
        `SELECT COALESCE(SUM(size), 0) AS total FROM items WHERE storage_key IS NOT NULL`,
      );
      const total = Number(sumRow?.total ?? 0);
      if (total <= this.maxStorageBytes) break;

      const oldest = await this.db.queryFirst<{ id: string; storage_key: string }>(
        `SELECT id, storage_key FROM items WHERE storage_key IS NOT NULL ORDER BY created_at ASC LIMIT 1`,
      );
      if (!oldest) break;
      await this.db.execute(`DELETE FROM items WHERE id = ?1`, [oldest.id]);
      evictedKeys.push(oldest.storage_key);
    }
    return evictedKeys;
  }

  // --- Multi-Device API Tokens ---

  async listTokens(): Promise<ApiTokenView[]> {
    const rows = await this.db.queryAll<TokenRow>(
      `SELECT id, name, prefix, created_at, last_used_at, revoked_at
       FROM api_tokens
       WHERE revoked_at IS NULL
       ORDER BY created_at DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.created_at,
      ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
      ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
    }));
  }

  async createToken(name: string, rawToken: string): Promise<ApiTokenView> {
    const id = randomUuid();
    const cleanName = sanitizeDevice(name) || "Unnamed Device";
    const prefix = rawToken.slice(0, 10);
    const tokenHash = await sha256Hex(rawToken);
    const createdAt = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO api_tokens (id, name, prefix, token_hash, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
      [id, cleanName, prefix, tokenHash, createdAt],
    );
    return { id, name: cleanName, prefix, createdAt };
  }

  async findActiveTokenByRaw(rawToken: string): Promise<{ id: string; name: string } | null> {
    const tokenHash = await sha256Hex(rawToken);
    const row = await this.db.queryFirst<{ id: string; name: string }>(
      `SELECT id, name FROM api_tokens WHERE token_hash = ?1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    return row ?? null;
  }

  async touchToken(id: string): Promise<void> {
    await this.db.execute(`UPDATE api_tokens SET last_used_at = ?2 WHERE id = ?1`, [id, new Date().toISOString()]);
  }

  async revokeToken(id: string): Promise<boolean> {
    const res = await this.db.execute(
      `UPDATE api_tokens SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL`,
      [id, new Date().toISOString()],
    );
    return res.changes > 0;
  }

  // --- Durable Browser Sessions ---

  async createSession(sessionId: string, subject: string, ttlSeconds: number): Promise<void> {
    const idHash = await sha256Hex(sessionId);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const createdAt = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO sessions (id_hash, subject, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)`,
      [idHash, subject, expiresAt, createdAt],
    );
  }

  async verifySession(sessionId: string): Promise<{ subject: string } | null> {
    const idHash = await sha256Hex(sessionId);
    const nowSec = Math.floor(Date.now() / 1000);
    const row = await this.db.queryFirst<{ subject: string; expires_at: number }>(
      `SELECT subject, expires_at FROM sessions WHERE id_hash = ?1`,
      [idHash],
    );
    if (!row || Number(row.expires_at) <= nowSec) return null;
    return { subject: row.subject };
  }

  async deleteSession(sessionId: string): Promise<void> {
    const idHash = await sha256Hex(sessionId);
    await this.db.execute(`DELETE FROM sessions WHERE id_hash = ?1`, [idHash]);
  }

  // --- OIDC Transactions ---

  async createOidcTransaction(tx: {
    state: string;
    nonce: string;
    codeVerifier: string;
    browserBindingHash: string;
    ttlSeconds: number;
  }): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + tx.ttlSeconds;
    await this.db.execute(
      `INSERT INTO oidc_transactions (state, nonce, code_verifier, browser_binding_hash, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
      [tx.state, tx.nonce, tx.codeVerifier, tx.browserBindingHash, expiresAt],
    );
  }

  async consumeOidcTransaction(state: string): Promise<OidcTxRow | null> {
    const row = await this.db.queryFirst<OidcTxRow>(
      `SELECT state, nonce, code_verifier, browser_binding_hash, expires_at FROM oidc_transactions WHERE state = ?1`,
      [state],
    );
    if (!row) return null;
    await this.db.execute(`DELETE FROM oidc_transactions WHERE state = ?1`, [state]);
    if (Number(row.expires_at) <= Math.floor(Date.now() / 1000)) return null;
    return row;
  }

  // --- Presigned Direct Uploads (R2) ---

  async createPendingUpload(upload: {
    id: string;
    storageKey: string;
    name: string;
    mime: string;
    expectedSize: number;
    device: string;
    ttlSeconds: number;
  }): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + upload.ttlSeconds;
    await this.db.execute(
      `INSERT INTO pending_uploads (id, storage_key, name, mime, expected_size, device, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      [upload.id, upload.storageKey, sanitizeFilename(upload.name), upload.mime, upload.expectedSize, sanitizeDevice(upload.device), expiresAt],
    );
  }

  async consumePendingUpload(id: string): Promise<PendingUploadRow | null> {
    const row = await this.db.queryFirst<PendingUploadRow>(
      `SELECT id, storage_key, name, mime, expected_size, device, expires_at FROM pending_uploads WHERE id = ?1`,
      [id],
    );
    if (!row) return null;
    await this.db.execute(`DELETE FROM pending_uploads WHERE id = ?1`, [id]);
    if (Number(row.expires_at) <= Math.floor(Date.now() / 1000)) return null;
    return row;
  }

  async getStorageStats(): Promise<{ itemCount: number; fileBytes: number }> {
    const row = await this.db.queryFirst<{ item_count: number; file_bytes: number }>(
      `SELECT COUNT(*) AS item_count, COALESCE(SUM(CASE WHEN storage_key IS NOT NULL THEN size ELSE 0 END), 0) AS file_bytes FROM items`,
    );
    return {
      itemCount: Number(row?.item_count ?? 0),
      fileBytes: Number(row?.file_bytes ?? 0),
    };
  }
}
