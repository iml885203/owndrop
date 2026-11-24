import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createOwnDropApp } from "../../app.js";
import { parseAppConfig } from "../../config.js";
import { FsBlobStore } from "./fs-store.js";
import { NodeSqliteAdapter } from "./sqlite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
};

function runHealthcheck(port: number): void {
  const socket = net.connect({ host: "127.0.0.1", port }, () => {
    socket.end();
    process.exit(0);
  });
  socket.setTimeout(2500);
  socket.on("error", () => process.exit(1));
  socket.on("timeout", () => {
    socket.destroy();
    process.exit(1);
  });
}

const port = Number.parseInt(process.env.PORT ?? "4180", 10);
if (process.argv.includes("--healthcheck")) {
  runHealthcheck(port);
} else {
  const config = parseAppConfig(process.env, `http://localhost:${port}`);
  const dataDir = path.resolve(process.env.OWNDROP_DATA_DIR ?? path.join(projectRoot, ".data"));
  const staticDir = path.resolve(process.env.OWNDROP_STATIC_DIR ?? path.join(projectRoot, "web/dist"));
  const migrationsDir = path.resolve(process.env.OWNDROP_MIGRATIONS_DIR ?? path.join(projectRoot, "migrations"));

  const db = new NodeSqliteAdapter(path.join(dataDir, "owndrop.sqlite"));
  db.applyMigrations(migrationsDir);
  const blobs = new FsBlobStore(path.join(dataDir, "uploads"));

  const { app, repo } = createOwnDropApp({ db, blobs, config });

  // Serve built SPA static assets for all non-API/auth routes
  app.get("*", async (c) => {
    const reqPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const safeRel = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, "");
    let filePath = path.join(staticDir, safeRel);
    if (!filePath.startsWith(staticDir)) {
      return c.text("Forbidden", 403);
    }

    let isSpaFallback = false;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(staticDir, "index.html");
      isSpaFallback = true;
    }
    if (!fs.existsSync(filePath)) {
      return c.text("OwnDrop frontend not built. Run npm run build:web.", 404);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";
    const body = await fsp.readFile(filePath);
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control":
        !isSpaFallback && reqPath.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache, must-revalidate",
    };
    if (ext === ".html") {
      headers["Content-Security-Policy"] =
        "default-src 'self'; connect-src 'self' https:; img-src 'self' https: blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    }
    return new Response(body, { status: 200, headers });
  });

  const runCleanup = async () => {
    try {
      const { removedStorageKeys } = await repo.cleanup();
      await Promise.allSettled(removedStorageKeys.map((key) => blobs.delete(key)));
    } catch (err) {
      console.error("[owndrop] cleanup failed:", err);
    }
  };
  void runCleanup();
  const cleanupTimer = setInterval(runCleanup, 60 * 60 * 1000);
  cleanupTimer.unref();

  const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    console.log(`[owndrop] listening on http://0.0.0.0:${info.port} (origin: ${config.origin})`);
  });

  const shutdown = () => {
    clearInterval(cleanupTimer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
