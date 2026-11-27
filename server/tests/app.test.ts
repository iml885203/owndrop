import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createOwnDropApp } from "../app.js";
import { parseAppConfig } from "../config.js";
import { FsBlobStore } from "../adapters/node/fs-store.js";
import { NodeSqliteAdapter } from "../adapters/node/sqlite.js";
import type { AppConfig, BlobStore, DropItem, PresignPutResult } from "../types.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

interface TestHarness {
  app: ReturnType<typeof createOwnDropApp>["app"];
  repo: ReturnType<typeof createOwnDropApp>["repo"];
  blobs: FsBlobStore;
  db: NodeSqliteAdapter;
  dir: string;
  config: AppConfig;
  pendingTasks: Promise<unknown>[];
  flushBackground: () => Promise<void>;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createHarness(overrides: Partial<AppConfig> = {}, options?: {
  enablePresign?: boolean;
  fetchImpl?: typeof fetch;
}): TestHarness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owndrop-test-"));
  tempDirs.push(dir);
  const db = new NodeSqliteAdapter(path.join(dir, "test.sqlite"));
  db.applyMigrations(MIGRATIONS_DIR);
  const fsBlobs = new FsBlobStore(path.join(dir, "uploads"));

  const blobs: BlobStore = options?.enablePresign
    ? Object.assign(Object.create(Object.getPrototypeOf(fsBlobs)), fsBlobs, {
        presignPut: async (key: string, contentType: string, _size: number, ttlSeconds: number): Promise<PresignPutResult> => ({
          url: `https://r2.test/bucket/${key}?signed=1`,
          method: "PUT",
          headers: { "Content-Type": contentType },
          expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        }),
      })
    : fsBlobs;

  const config: AppConfig = {
    origin: "https://drop.example.test",
    password: "correct-horse-battery-staple",
    sessionSecret: "0123456789abcdef0123456789abcdef0123456789abcdef",
    apiToken: "static-machine-token-at-least-32-characters-long",
    sessionDays: 180,
    retentionDays: 90,
    maxFileBytes: 5 * 1024 * 1024,
    maxPresignedFileBytes: 50 * 1024 * 1024,
    maxStorageBytes: 1024 * 1024,
    version: "1.0.0",
    ...overrides,
  };

  const pendingTasks: Promise<unknown>[] = [];
  const { app, repo } = createOwnDropApp({
    db,
    blobs,
    config,
    waitUntil: (p) => {
      pendingTasks.push(p);
    },
    fetchImpl: options?.fetchImpl,
  });

  return {
    app,
    repo,
    blobs: fsBlobs,
    db,
    dir,
    config,
    pendingTasks,
    flushBackground: async () => {
      await Promise.allSettled(pendingTasks.splice(0));
    },
  };
}

async function loginAsBrowser(harness: TestHarness): Promise<string> {
  const res = await harness.app.request("/api/login", {
    method: "POST",
    headers: {
      Origin: harness.config.origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: harness.config.password }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

describe("OwnDrop Core API", () => {
  it("handles password login, session persistence, CSRF origin check, and durable logout", async () => {
    const h = createHarness();
    const health = await h.app.request("/api/health");
    expect(health.status).toBe(200);

    // Reject login without valid Origin
    const badOrigin = await h.app.request("/api/login", {
      method: "POST",
      headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
      body: JSON.stringify({ password: h.config.password }),
    });
    expect(badOrigin.status).toBe(403);

    // Reject wrong password
    const wrongPw = await h.app.request("/api/login", {
      method: "POST",
      headers: { Origin: h.config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(wrongPw.status).toBe(401);

    // Successful login
    const cookie = await loginAsBrowser(h);
    const session = await h.app.request("/api/session", { headers: { Cookie: cookie } });
    expect(await session.json()).toEqual({
      authenticated: true,
      oidcEnabled: false,
      passwordEnabled: true,
    });

    // Logout revokes session server-side
    const logout = await h.app.request("/api/logout", {
      method: "POST",
      headers: { Origin: h.config.origin, Cookie: cookie },
    });
    expect(logout.status).toBe(204);

    // Old cookie is now rejected
    const afterLogout = await h.app.request("/api/items", { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
  });

  it("supports multi-device tokens with auto device tagging and independent revocation", async () => {
    const h = createHarness();
    const cookie = await loginAsBrowser(h);

    // Create two device tokens
    const macRes = await h.app.request("/api/tokens", {
      method: "POST",
      headers: { Origin: h.config.origin, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "MacBook Pro" }),
    });
    expect(macRes.status).toBe(201);
    const macToken = (await macRes.json()) as { id: string; token: string; name: string; prefix: string };
    expect(macToken.token.startsWith("owd_")).toBe(true);

    const iphoneRes = await h.app.request("/api/tokens", {
      method: "POST",
      headers: { Origin: h.config.origin, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "iPhone 16" }),
    });
    const iphoneToken = (await iphoneRes.json()) as { id: string; token: string };

    // Device token works without Origin header and auto-fills device name
    const sendRes = await h.app.request("/api/items/text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${macToken.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "hello from raycast" }),
    });
    expect(sendRes.status).toBe(201);
    const item = (await sendRes.json()) as DropItem;
    expect(item.device).toBe("MacBook Pro");

    // /api/me reflects device token identity
    const meRes = await h.app.request("/api/me", {
      headers: { Authorization: `Bearer ${macToken.token}` },
    });
    expect(meRes.status).toBe(200);
    expect((await meRes.json()).device).toBe("MacBook Pro");

    // Device tokens cannot manage other tokens
    const forbiddenTokens = await h.app.request("/api/tokens", {
      headers: { Authorization: `Bearer ${macToken.token}` },
    });
    expect(forbiddenTokens.status).toBe(403);

    // Revoke Mac token; iPhone token continues working
    const revokeRes = await h.app.request(`/api/tokens/${macToken.id}`, {
      method: "DELETE",
      headers: { Origin: h.config.origin, Cookie: cookie },
    });
    expect(revokeRes.status).toBe(204);

    const macDenied = await h.app.request("/api/items", {
      headers: { Authorization: `Bearer ${macToken.token}` },
    });
    expect(macDenied.status).toBe(401);

    const iphoneAllowed = await h.app.request("/api/items/latest", {
      headers: { Authorization: `Bearer ${iphoneToken.token}` },
    });
    expect(iphoneAllowed.status).toBe(200);
    expect((await iphoneAllowed.json()).text).toBe("hello from raycast");
  });

  it("handles text, link previews, multipart files, byte-range downloads, pinning, and search", async () => {
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://example.org/post") {
        return new Response(
          `<html><head>
            <meta property="og:title" content="OwnDrop Article" />
            <meta property="og:description" content="Personal cross-device clipboard" />
            <meta property="og:image" content="/preview.webp" />
            <meta property="og:site_name" content="ExampleOrg" />
            <meta http-equiv="refresh" content="0;url=https://example.org/destination" />
          </head><body>ok</body></html>`,
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const h = createHarness({}, { fetchImpl: mockFetch });
    const bearer = `Bearer ${h.config.apiToken}`;

    // 1. Add link -> triggers async link preview
    const linkRes = await h.app.request("/api/items/text", {
      method: "POST",
      headers: { Authorization: bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "https://example.org/post", device: "Mac" }),
    });
    expect(linkRes.status).toBe(201);
    const linkItem = (await linkRes.json()) as DropItem;
    await h.flushBackground();

    const refreshedLink = await h.repo.getItem(linkItem.id);
    expect(refreshedLink?.previewStatus).toBe("ready");
    expect(refreshedLink?.linkPreview).toMatchObject({
      title: "OwnDrop Article",
      description: "Personal cross-device clipboard",
      image: "https://example.org/preview.webp",
    });

    // 2. Upload file via multipart
    const payload = new TextEncoder().encode("0123456789abcdefghij");
    const form = new FormData();
    form.append("device", "Windows");
    form.append("file", new File([payload], "notes.txt", { type: "text/plain" }));

    const fileRes = await h.app.request("/api/items/file", {
      method: "POST",
      headers: { Authorization: bearer },
      body: form,
    });
    expect(fileRes.status).toBe(201);
    const fileItem = (await fileRes.json()) as DropItem;
    expect(fileItem.type).toBe("file");
    expect(fileItem.size).toBe(20);
    expect(fileItem.device).toBe("Windows");

    // 3. Full download & Range download (206)
    const dl = await h.app.request(`/api/files/${fileItem.id}`, { headers: { Authorization: bearer } });
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe("0123456789abcdefghij");

    const rangeDl = await h.app.request(`/api/files/${fileItem.id}`, {
      headers: { Authorization: bearer, Range: "bytes=5-9" },
    });
    expect(rangeDl.status).toBe(206);
    expect(rangeDl.headers.get("content-range")).toBe("bytes 5-9/20");
    expect(await rangeDl.text()).toBe("56789");

    // 4. Pin older item -> moves above newer item
    const pinRes = await h.app.request(`/api/items/${linkItem.id}/pin`, {
      method: "PUT",
      headers: { Authorization: bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true }),
    });
    expect(pinRes.status).toBe(204);

    const listRes = await h.app.request("/api/items", { headers: { Authorization: bearer } });
    const items = (await listRes.json()) as DropItem[];
    expect(items[0]?.id).toBe(linkItem.id);
    expect(items[0]?.pinned).toBe(true);

    // 5. Search filter
    const searchRes = await h.app.request("/api/items?q=notes.txt", { headers: { Authorization: bearer } });
    const found = (await searchRes.json()) as DropItem[];
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(fileItem.id);

    // 6. Delete removes both DB row and blob
    const delRes = await h.app.request(`/api/items/${fileItem.id}`, {
      method: "DELETE",
      headers: { Authorization: bearer },
    });
    expect(delRes.status).toBe(204);
    expect(await h.blobs.head(fileItem.id)).toBeNull();
  });

  it("supports presigned upload flow and storage cap eviction", async () => {
    const h = createHarness({ maxStorageBytes: 15 }, { enablePresign: true });
    const bearer = `Bearer ${h.config.apiToken}`;

    // Request presigned upload
    const presignRes = await h.app.request("/api/uploads/presign", {
      method: "POST",
      headers: { Authorization: bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "first.bin", mime: "application/octet-stream", size: 10, device: "Mac" }),
    });
    expect(presignRes.status).toBe(201);
    const { uploadId } = (await presignRes.json()) as { uploadId: string; url: string };

    // Simulate client PUT directly to object storage
    await h.blobs.put(uploadId, new Uint8Array(10).fill(65));

    const completeRes = await h.app.request("/api/uploads/complete", {
      method: "POST",
      headers: { Authorization: bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    });
    expect(completeRes.status).toBe(201);
    const first = (await completeRes.json()) as DropItem;
    expect(first.size).toBe(10);

    // Upload a second 10-byte file -> exceeds 15-byte cap -> first file evicted
    const form = new FormData();
    form.append("file", new File([new Uint8Array(10).fill(66)], "second.bin", { type: "application/octet-stream" }));
    const secondRes = await h.app.request("/api/items/file", {
      method: "POST",
      headers: { Authorization: bearer },
      body: form,
    });
    expect(secondRes.status).toBe(201);
    await h.flushBackground();

    expect(await h.repo.getItem(first.id)).toBeNull();
    expect(await h.blobs.head(first.id)).toBeNull();
  });

  it("completes full OIDC PKCE S256 login flow with JWKS verification and group enforcement", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-kid";
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";

    let capturedNonce = "";
    let groupToIssue = "homelab-admin";

    const mockOidcFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://id.example.test/.well-known/openid-configuration") {
        return Response.json({
          issuer: "https://id.example.test",
          authorization_endpoint: "https://id.example.test/authorize",
          token_endpoint: "https://id.example.test/token",
          jwks_uri: "https://id.example.test/jwks",
        });
      }
      if (url === "https://id.example.test/jwks") {
        return Response.json({ keys: [publicJwk] });
      }
      if (url === "https://id.example.test/token") {
        const body = new URLSearchParams(String(init?.body ?? ""));
        expect(body.get("code")).toBe("auth-code-123");
        expect(body.get("code_verifier")).toBeTruthy();
        const idToken = await new SignJWT({
          sub: "user-42",
          nonce: capturedNonce,
          groups: [groupToIssue],
        })
          .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
          .setIssuer("https://id.example.test")
          .setAudience("owndrop-client")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        return Response.json({ id_token: idToken });
      }
      return new Response("not found", { status: 404 });
    };

    const h = createHarness(
      {
        oidc: {
          issuer: "https://id.example.test",
          clientId: "owndrop-client",
          clientSecret: "client-secret",
          requiredGroup: "homelab-admin",
        },
      },
      { fetchImpl: mockOidcFetch },
    );

    // 1. Start OIDC login
    const startRes = await h.app.request("/auth/oidc");
    expect(startRes.status).toBe(302);
    const location = new URL(startRes.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    capturedNonce = location.searchParams.get("nonce")!;
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const txCookie = startRes.headers.get("set-cookie")!.split(";")[0]!;

    // 2. Callback with allowed group succeeds
    const cbRes = await h.app.request(`/auth/callback?code=auth-code-123&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: txCookie },
    });
    expect(cbRes.status).toBe(302);
    expect(cbRes.headers.get("location")).toBe("/");
    const cookies = cbRes.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith("owndrop_session="))!.split(";")[0]!;

    const meRes = await h.app.request("/api/me", { headers: { Cookie: sessionCookie } });
    expect(meRes.status).toBe(200);

    // 3. Denied group redirects with error=oidc
    groupToIssue = "other-group";
    const start2 = await h.app.request("/auth/oidc");
    const loc2 = new URL(start2.headers.get("location")!);
    capturedNonce = loc2.searchParams.get("nonce")!;
    const txCookie2 = start2.headers.get("set-cookie")!.split(";")[0]!;
    const cbDenied = await h.app.request(
      `/auth/callback?code=auth-code-123&state=${encodeURIComponent(loc2.searchParams.get("state")!)}`,
      { headers: { Cookie: txCookie2 } },
    );
    expect(cbDenied.status).toBe(302);
    expect(cbDenied.headers.get("location")).toBe("/?error=oidc");
  });

  it("validates configuration strictly", () => {
    expect(() => parseAppConfig({ OWNDROP_SESSION_SECRET: "short", OWNDROP_ORIGIN: "https://a.test", OWNDROP_PASSWORD: "pw" })).toThrow();
    expect(() =>
      parseAppConfig({
        OWNDROP_SESSION_SECRET: "a".repeat(32),
        OWNDROP_ORIGIN: "http://insecure.example.com",
        OWNDROP_PASSWORD: "pw",
      }),
    ).toThrow();
    expect(() =>
      parseAppConfig({
        OWNDROP_SESSION_SECRET: "a".repeat(32),
        OWNDROP_ORIGIN: "https://drop.example.com",
        OWNDROP_PASSWORD: "pw",
        OWNDROP_OIDC_ISSUER: "https://id.example.com",
      }),
    ).toThrow();
  });
});
