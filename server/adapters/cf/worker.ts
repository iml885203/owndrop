import { createOwnDropApp } from "../../app.js";
import { parseAppConfig } from "../../config.js";
import { D1DbAdapter } from "./d1.js";
import { R2BlobStore, type R2PresignConfig } from "./r2.js";

export interface WorkerEnv {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  OWNDROP_ORIGIN?: string;
  OWNDROP_PASSWORD?: string;
  OWNDROP_SESSION_SECRET?: string;
  OWNDROP_API_TOKEN?: string;
  OWNDROP_OIDC_ISSUER?: string;
  OWNDROP_OIDC_CLIENT_ID?: string;
  OWNDROP_OIDC_CLIENT_SECRET?: string;
  OWNDROP_OIDC_REQUIRED_GROUP?: string;
  OWNDROP_SESSION_DAYS?: string;
  OWNDROP_RETENTION_DAYS?: string;
  OWNDROP_MAX_FILE_MB?: string;
  OWNDROP_MAX_PRESIGNED_FILE_MB?: string;
  OWNDROP_MAX_STORAGE_MB?: string;
  OWNDROP_R2_ACCOUNT_ID?: string;
  OWNDROP_R2_BUCKET_NAME?: string;
  OWNDROP_R2_ACCESS_KEY_ID?: string;
  OWNDROP_R2_SECRET_ACCESS_KEY?: string;
}

function getPresignConfig(env: WorkerEnv): R2PresignConfig | undefined {
  const accountId = env.OWNDROP_R2_ACCOUNT_ID?.trim();
  const bucketName = env.OWNDROP_R2_BUCKET_NAME?.trim();
  const accessKeyId = env.OWNDROP_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.OWNDROP_R2_SECRET_ACCESS_KEY?.trim();
  if (accountId && bucketName && accessKeyId && secretAccessKey) {
    return { accountId, bucketName, accessKeyId, secretAccessKey };
  }
  return undefined;
}

function toStringEnv(env: WorkerEnv): Record<string, string | undefined> {
  return {
    OWNDROP_ORIGIN: env.OWNDROP_ORIGIN,
    OWNDROP_PASSWORD: env.OWNDROP_PASSWORD,
    OWNDROP_SESSION_SECRET: env.OWNDROP_SESSION_SECRET,
    OWNDROP_API_TOKEN: env.OWNDROP_API_TOKEN,
    OWNDROP_OIDC_ISSUER: env.OWNDROP_OIDC_ISSUER,
    OWNDROP_OIDC_CLIENT_ID: env.OWNDROP_OIDC_CLIENT_ID,
    OWNDROP_OIDC_CLIENT_SECRET: env.OWNDROP_OIDC_CLIENT_SECRET,
    OWNDROP_OIDC_REQUIRED_GROUP: env.OWNDROP_OIDC_REQUIRED_GROUP,
    OWNDROP_SESSION_DAYS: env.OWNDROP_SESSION_DAYS,
    OWNDROP_RETENTION_DAYS: env.OWNDROP_RETENTION_DAYS,
    OWNDROP_MAX_FILE_MB: env.OWNDROP_MAX_FILE_MB,
    OWNDROP_MAX_PRESIGNED_FILE_MB: env.OWNDROP_MAX_PRESIGNED_FILE_MB,
    OWNDROP_MAX_STORAGE_MB: env.OWNDROP_MAX_STORAGE_MB,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve static frontend via Workers Assets for non-API/auth routes
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/")) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Frontend assets not bound", { status: 404 });
    }

    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", version: "1.0.0" }, { headers: { "Cache-Control": "no-store" } });
    }

    let config;
    try {
      config = parseAppConfig(toStringEnv(env), url.origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Configuration incomplete";
      if (url.pathname === "/api/session") {
        return Response.json(
          {
            authenticated: false,
            oidcEnabled: false,
            passwordEnabled: false,
            setupRequired: true,
            setupMessage: message,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        { error: `OwnDrop setup incomplete: ${message}` },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const db = new D1DbAdapter(env.DB);
    const blobs = new R2BlobStore(env.BUCKET, getPresignConfig(env));
    const { app } = createOwnDropApp({
      db,
      blobs,
      config,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });

    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    let config;
    try {
      config = parseAppConfig(toStringEnv(env), env.OWNDROP_ORIGIN ?? "https://owndrop.invalid");
    } catch {
      return;
    }
    const db = new D1DbAdapter(env.DB);
    const blobs = new R2BlobStore(env.BUCKET, getPresignConfig(env));
    const { repo } = createOwnDropApp({
      db,
      blobs,
      config,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });

    const job = (async () => {
      const { removedStorageKeys } = await repo.cleanup();
      await Promise.allSettled(removedStorageKeys.map((key) => blobs.delete(key)));
    })();
    ctx.waitUntil(job);
    await job;
  },
};
