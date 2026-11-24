import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createOwnDropApp } from "../app.js";
import { FsBlobStore } from "../adapters/node/fs-store.js";
import { NodeSqliteAdapter } from "../adapters/node/sqlite.js";
import { extractStandaloneUrl, isPublicUrl } from "../preview.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

describe("OwnDrop Security Guards", () => {
  it("blocks private, loopback, link-local, and internal URLs from link previews (SSRF protection)", () => {
    const blocked = [
      "http://localhost/admin",
      "http://127.0.0.1:4180/api/items",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://172.16.0.5/",
      "http://100.64.0.1/",
      "http://[::1]/secret",
      "http://[fe80::1]/secret",
      "http://printer.local/",
      "http://metadata.internal/",
      "https://user:pass@example.com/",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ];
    for (const candidate of blocked) {
      expect(extractStandaloneUrl(candidate), `Expected blocked: ${candidate}`).toBeNull();
    }

    expect(isPublicUrl(new URL("https://github.com/honojs/hono"))).toBe(true);
    expect(extractStandaloneUrl("https://raycast.com/store")?.hostname).toBe("raycast.com");
  });

  it("rejects path traversal keys in FsBlobStore", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owndrop-sec-"));
    try {
      const store = new FsBlobStore(dir);
      await expect(store.put("../escape", new Uint8Array([1]))).rejects.toThrow();
      await expect(store.get("../../etc/passwd")).rejects.toThrow();
      await expect(store.delete("foo/bar")).rejects.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never falls back from an invalid Bearer token to a valid browser cookie", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owndrop-auth-sec-"));
    try {
      const db = new NodeSqliteAdapter(path.join(dir, "test.sqlite"));
      db.applyMigrations(MIGRATIONS_DIR);
      const blobs = new FsBlobStore(path.join(dir, "uploads"));
      const { app } = createOwnDropApp({
        db,
        blobs,
        config: {
          origin: "https://drop.test",
          password: "secret-password",
          sessionSecret: "0123456789abcdef0123456789abcdef",
          apiToken: "valid-token-at-least-32-characters-long",
          sessionDays: 30,
          retentionDays: 30,
          maxFileBytes: 1024 * 1024,
          maxPresignedFileBytes: 1024 * 1024,
          maxStorageBytes: 1024 * 1024,
          version: "1.0.0",
        },
      });

      const login = await app.request("/api/login", {
        method: "POST",
        headers: { Origin: "https://drop.test", "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret-password" }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;

      const denied = await app.request("/api/items", {
        headers: {
          Cookie: cookie,
          Authorization: "Bearer invalid-token-should-never-fallback",
        },
      });
      expect(denied.status).toBe(401);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
