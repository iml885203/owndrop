import { Hono } from "hono";
import type { Context } from "hono";
import { AuthService } from "./auth.js";
import { randomUuid } from "./crypto.js";
import { DropRepository, sanitizeFilename } from "./db.js";
import { OidcService } from "./oidc.js";
import { extractStandaloneUrl, fetchLinkPreview } from "./preview.js";
import type { AppDependencies, AuthContext, BlobRange } from "./types.js";

const MAX_TEXT_BYTES = 65_536;

export function parseByteRange(headerValue: string | null, totalSize: number): BlobRange | null {
  if (!headerValue || totalSize <= 0) return null;
  if (!headerValue.startsWith("bytes=")) return null;
  const spec = headerValue.slice("bytes=".length);
  if (spec.includes(",")) return null;
  const dash = spec.indexOf("-");
  if (dash === -1) return null;

  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  if (startStr === "") {
    const suffix = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const clamped = Math.min(suffix, totalSize);
    return { start: totalSize - clamped, end: totalSize - 1 };
  }

  const start = Number.parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;
  const end = endStr === "" ? totalSize - 1 : Math.min(Number.parseInt(endStr, 10), totalSize - 1);
  if (!Number.isFinite(end) || start > end) return null;
  return { start, end };
}

function encodeContentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}

export function createOwnDropApp(deps: AppDependencies) {
  const { db, blobs, config, waitUntil, fetchImpl = fetch } = deps;
  const repo = new DropRepository(db, config.retentionDays, config.maxStorageBytes);
  const auth = new AuthService(config, repo, waitUntil);
  const oidc = config.oidc ? new OidcService(config.oidc, config.origin, repo, auth, fetchImpl) : null;

  const app = new Hono<{ Variables: { auth: AuthContext } }>();

  // Security headers on all API/auth responses
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/auth/")) {
      c.header("Cache-Control", "no-store");
    }
  });

  const requireAuth = async (c: Context<{ Variables: { auth: AuthContext } }>): Promise<AuthContext | Response> => {
    const ctx = await auth.authenticateRequest(c.req.raw.headers);
    if (!ctx) return c.json({ error: "Unauthorized" }, 401);
    c.set("auth", ctx);
    return ctx;
  };

  const requireMutationOrigin = (c: Context, authCtx: AuthContext): Response | null => {
    // Bearer tokens (Raycast, iOS Shortcuts, CLI) do not require browser Origin header.
    if (authCtx.kind !== "session") return null;
    if (!auth.isOriginValid(c.req.raw.headers)) {
      return c.json({ error: "Origin verification failed" }, 403);
    }
    return null;
  };

  const runBackground = (promise: Promise<unknown>) => {
    if (waitUntil) waitUntil(promise);
    else void promise;
  };

  // --- Health & Session ---

  app.get("/api/health", (c) => c.json({ status: "ok", version: config.version }));

  app.get("/api/session", async (c) => {
    const ctx = await auth.authenticateRequest(c.req.raw.headers);
    return c.json({
      authenticated: ctx !== null,
      oidcEnabled: oidc !== null,
      passwordEnabled: config.password.length > 0,
    });
  });

  app.get("/api/me", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const stats = await repo.getStorageStats();
    return c.json({
      authKind: authCtx.kind,
      device: authCtx.deviceName ?? null,
      version: config.version,
      maxFileMb: Math.floor(config.maxFileBytes / (1024 * 1024)),
      maxPresignedFileMb: Math.floor(config.maxPresignedFileBytes / (1024 * 1024)),
      maxStorageMb: Math.floor(config.maxStorageBytes / (1024 * 1024)),
      directUploadEnabled: typeof blobs.presignPut === "function",
      retentionDays: config.retentionDays,
      stats,
    });
  });

  // --- Password Login & Logout ---

  app.post("/api/login", async (c) => {
    if (!auth.isOriginValid(c.req.raw.headers)) {
      return c.json({ error: "Origin verification failed" }, 403);
    }
    if (!config.password) {
      return c.json({ error: "Password login is disabled; use OIDC" }, 400);
    }
    const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null;
    if (!body || typeof body.password !== "string" || !body.password) {
      return c.json({ error: "Password is required" }, 400);
    }
    const result = await auth.verifyPasswordLogin(body.password, auth.clientKey(c.req.raw.headers));
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    c.header("Set-Cookie", result.cookie);
    return c.json({ authenticated: true });
  });

  app.post("/api/logout", async (c) => {
    if (!auth.isOriginValid(c.req.raw.headers)) {
      return c.json({ error: "Origin verification failed" }, 403);
    }
    const cleared = await auth.logoutFromCookie(c.req.header("cookie"));
    c.header("Set-Cookie", cleared);
    return c.body(null, 204);
  });

  // --- Standard OIDC PKCE Flow ---

  app.get("/auth/oidc", async (c) => {
    if (!oidc) return c.json({ error: "OIDC is not configured" }, 404);
    try {
      const { redirectUrl, setCookie } = await oidc.startLogin();
      c.header("Set-Cookie", setCookie);
      return c.redirect(redirectUrl, 302);
    } catch {
      return c.redirect("/?error=oidc", 302);
    }
  });

  app.get("/auth/callback", async (c) => {
    if (!oidc) return c.json({ error: "OIDC is not configured" }, 404);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.redirect("/?error=oidc", 302);
    }
    try {
      const { sessionCookie, clearBindingCookie } = await oidc.handleCallback(code, state, c.req.header("cookie"));
      c.header("Set-Cookie", clearBindingCookie, { append: true });
      c.header("Set-Cookie", sessionCookie, { append: true });
      return c.redirect("/", 302);
    } catch {
      return c.redirect("/?error=oidc", 302);
    }
  });

  // --- Items API ---

  app.get("/api/items", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const q = c.req.query("q") ?? "";
    const limitParam = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const items = await repo.listItems(q, Number.isFinite(limitParam) ? limitParam : 100);
    return c.json(items);
  });

  app.get("/api/items/latest", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const latest = await repo.getLatestItem();
    if (!latest) return c.json({ error: "No items yet" }, 404);
    return c.json(latest);
  });

  app.post("/api/items/text", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const body = (await c.req.json().catch(() => null)) as { text?: unknown; device?: unknown } | null;
    if (!body || typeof body.text !== "string") {
      return c.json({ error: "Missing text field" }, 400);
    }
    const text = body.text.trim();
    const byteLen = new TextEncoder().encode(text).byteLength;
    if (!text || byteLen > MAX_TEXT_BYTES) {
      return c.json({ error: `Text must be between 1 and ${MAX_TEXT_BYTES} bytes` }, 400);
    }

    const explicitDevice = typeof body.device === "string" && body.device.trim() ? body.device.trim() : "";
    const device = explicitDevice || authCtx.deviceName || "Web";
    const item = await repo.addText(text, device);

    const url = extractStandaloneUrl(text);
    if (url) {
      await repo.queueLinkPreview(item.id);
      item.previewStatus = "pending";
      runBackground(
        (async () => {
          const preview = await fetchLinkPreview(url, fetchImpl);
          if (preview) await repo.saveLinkPreview(item.id, preview);
          else await repo.failLinkPreview(item.id);
        })().catch(() => {}),
      );
    }

    return c.json(item, 201);
  });

  app.post("/api/items/file", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Invalid multipart form data" }, 400);
    }

    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      return c.json({ error: "Missing file field" }, 400);
    }

    const file = fileEntry as File;
    if (file.size > config.maxFileBytes) {
      return c.json(
        { error: `File exceeds direct upload limit of ${Math.floor(config.maxFileBytes / (1024 * 1024))} MB` },
        413,
      );
    }

    const deviceField = formData.get("device");
    const explicitDevice = typeof deviceField === "string" && deviceField.trim() ? deviceField.trim() : "";
    const device = explicitDevice || authCtx.deviceName || "Web";

    const id = randomUuid();
    const storageKey = id;
    const mime = file.type || "application/octet-stream";
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > config.maxFileBytes) {
      return c.json({ error: "File exceeds maximum allowed size" }, 413);
    }

    await blobs.put(storageKey, buffer, mime, buffer.byteLength);

    try {
      const item = await repo.addFileRecord({
        id,
        storageKey,
        name: file.name || "untitled-file",
        mime,
        size: buffer.byteLength,
        device,
      });

      const evictedKeys = await repo.enforceStorageLimit();
      if (evictedKeys.length > 0) {
        runBackground(Promise.allSettled(evictedKeys.map((key) => blobs.delete(key))));
      }
      return c.json(item, 201);
    } catch (error) {
      await blobs.delete(storageKey).catch(() => {});
      throw error;
    }
  });

  // --- Presigned Direct Uploads (R2 large file bypass > 90MB) ---

  app.post("/api/uploads/presign", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    if (typeof blobs.presignPut !== "function") {
      return c.json({ error: "Direct presigned uploads are not enabled on this server" }, 501);
    }

    const body = (await c.req.json().catch(() => null)) as {
      name?: unknown;
      mime?: unknown;
      size?: unknown;
      device?: unknown;
    } | null;
    if (!body || typeof body.name !== "string" || typeof body.size !== "number" || !Number.isFinite(body.size) || body.size <= 0) {
      return c.json({ error: "Valid name and size are required" }, 400);
    }
    if (body.size > config.maxPresignedFileBytes) {
      return c.json(
        { error: `File exceeds maximum size of ${Math.floor(config.maxPresignedFileBytes / (1024 * 1024))} MB` },
        413,
      );
    }

    const mime = typeof body.mime === "string" && body.mime.trim() ? body.mime.trim() : "application/octet-stream";
    const explicitDevice = typeof body.device === "string" && body.device.trim() ? body.device.trim() : "";
    const device = explicitDevice || authCtx.deviceName || "Web";

    const id = randomUuid();
    const storageKey = id;
    const ttlSeconds = 900;
    const presigned = await blobs.presignPut(storageKey, mime, Math.floor(body.size), ttlSeconds);

    await repo.createPendingUpload({
      id,
      storageKey,
      name: sanitizeFilename(body.name),
      mime,
      expectedSize: Math.floor(body.size),
      device,
      ttlSeconds,
    });

    return c.json({ uploadId: id, ...presigned }, 201);
  });

  app.post("/api/uploads/complete", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const body = (await c.req.json().catch(() => null)) as { uploadId?: unknown } | null;
    if (!body || typeof body.uploadId !== "string") {
      return c.json({ error: "uploadId is required" }, 400);
    }

    const pending = await repo.consumePendingUpload(body.uploadId);
    if (!pending) {
      return c.json({ error: "Upload session not found or expired" }, 404);
    }

    const head = await blobs.head(pending.storage_key);
    if (!head) {
      return c.json({ error: "Uploaded object not found in storage" }, 400);
    }
    if (head.size > config.maxPresignedFileBytes) {
      await blobs.delete(pending.storage_key).catch(() => {});
      return c.json({ error: "Uploaded object exceeds allowed size" }, 413);
    }

    const item = await repo.addFileRecord({
      id: pending.id,
      storageKey: pending.storage_key,
      name: pending.name,
      mime: pending.mime,
      size: head.size,
      device: pending.device,
    });

    const evictedKeys = await repo.enforceStorageLimit();
    if (evictedKeys.length > 0) {
      runBackground(Promise.allSettled(evictedKeys.map((key) => blobs.delete(key))));
    }

    return c.json(item, 201);
  });

  app.put("/api/items/:id/pin", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const body = (await c.req.json().catch(() => null)) as { pinned?: unknown } | null;
    if (!body || typeof body.pinned !== "boolean") {
      return c.json({ error: "pinned boolean is required" }, 400);
    }

    const updated = await repo.setPinned(c.req.param("id"), body.pinned);
    if (!updated) return c.json({ error: "Item not found" }, 404);
    return c.body(null, 204);
  });

  app.delete("/api/items/:id", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const { deleted, storageKey } = await repo.removeItem(c.req.param("id"));
    if (!deleted) return c.json({ error: "Item not found" }, 404);
    if (storageKey) {
      await blobs.delete(storageKey).catch(() => {});
    }
    return c.body(null, 204);
  });

  app.get("/api/files/:id", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;

    const file = await repo.findFile(c.req.param("id"));
    if (!file) return c.json({ error: "File not found" }, 404);

    const range = parseByteRange(c.req.header("range") ?? null, file.size);
    const read = await blobs.get(file.storageKey, range ?? undefined);
    if (!read) return c.json({ error: "File payload missing" }, 404);

    const headers = new Headers({
      "Content-Type": file.mime,
      "Accept-Ranges": "bytes",
      "Content-Disposition": encodeContentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    });

    if (range) {
      const contentLength = range.end - range.start + 1;
      headers.set("Content-Length", String(contentLength));
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
      return new Response(read.body, { status: 206, headers });
    }

    headers.set("Content-Length", String(file.size));
    return new Response(read.body, { status: 200, headers });
  });

  // --- Multi-Device API Token Management (Browser session only) ---

  app.get("/api/tokens", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    if (authCtx.kind !== "session") {
      return c.json({ error: "Device tokens can only be managed from a browser session" }, 403);
    }
    const tokens = await repo.listTokens();
    return c.json(tokens);
  });

  app.post("/api/tokens", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    if (authCtx.kind !== "session") {
      return c.json({ error: "Device tokens can only be managed from a browser session" }, 403);
    }
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Device name is required" }, 400);
    }

    const rawToken = auth.generateDeviceToken();
    const record = await repo.createToken(body.name, rawToken);
    return c.json({ ...record, token: rawToken }, 201);
  });

  app.delete("/api/tokens/:id", async (c) => {
    const authCtx = await requireAuth(c);
    if (authCtx instanceof Response) return authCtx;
    if (authCtx.kind !== "session") {
      return c.json({ error: "Device tokens can only be managed from a browser session" }, 403);
    }
    const originErr = requireMutationOrigin(c, authCtx);
    if (originErr) return originErr;

    const revoked = await repo.revokeToken(c.req.param("id"));
    if (!revoked) return c.json({ error: "Token not found" }, 404);
    return c.body(null, 204);
  });

  return { app, repo, auth };
}
