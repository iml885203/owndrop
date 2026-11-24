import type { AppConfig, OidcConfig } from "./types.js";

export const APP_VERSION = "1.0.0";

function parseIntEnv(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function parseAppConfig(env: Record<string, string | undefined>, fallbackOrigin?: string): AppConfig {
  const sessionSecret = (env.OWNDROP_SESSION_SECRET ?? "").trim();
  if (sessionSecret.length < 32) {
    throw new Error("OWNDROP_SESSION_SECRET must be set and at least 32 characters long");
  }

  const rawOrigin = (env.OWNDROP_ORIGIN ?? fallbackOrigin ?? "").trim().replace(/\/+$/, "");
  if (!rawOrigin) {
    throw new Error("OWNDROP_ORIGIN must be set");
  }
  const validOrigin =
    rawOrigin.startsWith("https://") ||
    rawOrigin.startsWith("http://localhost:") ||
    rawOrigin.startsWith("http://127.0.0.1:") ||
    rawOrigin === "http://localhost" ||
    rawOrigin === "http://127.0.0.1";
  if (!validOrigin) {
    throw new Error("OWNDROP_ORIGIN must use https:// (http:// is allowed only on localhost/127.0.0.1)");
  }

  const oidcIssuer = (env.OWNDROP_OIDC_ISSUER ?? "").trim();
  const oidcClientId = (env.OWNDROP_OIDC_CLIENT_ID ?? "").trim();
  const oidcClientSecret = (env.OWNDROP_OIDC_CLIENT_SECRET ?? "").trim();
  const oidcRequiredGroup = (env.OWNDROP_OIDC_REQUIRED_GROUP ?? "").trim() || undefined;

  let oidc: OidcConfig | undefined;
  const oidcFields = [oidcIssuer, oidcClientId, oidcClientSecret].filter(Boolean).length;
  if (oidcFields > 0 && oidcFields < 3) {
    throw new Error("Partial OIDC configuration: set OWNDROP_OIDC_ISSUER, OWNDROP_OIDC_CLIENT_ID, and OWNDROP_OIDC_CLIENT_SECRET");
  }
  if (oidcFields === 3) {
    oidc = {
      issuer: oidcIssuer,
      clientId: oidcClientId,
      clientSecret: oidcClientSecret,
      ...(oidcRequiredGroup ? { requiredGroup: oidcRequiredGroup } : {}),
    };
  }

  const password = (env.OWNDROP_PASSWORD ?? "").trim();
  if (!password && !oidc) {
    throw new Error("Set OWNDROP_PASSWORD or configure OIDC (OWNDROP_OIDC_*)");
  }

  const apiToken = (env.OWNDROP_API_TOKEN ?? "").trim() || undefined;
  if (apiToken && (apiToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(apiToken))) {
    throw new Error("OWNDROP_API_TOKEN must contain at least 32 URL-safe characters");
  }

  const sessionDays = parseIntEnv(env.OWNDROP_SESSION_DAYS, 180, 1, 3650, "OWNDROP_SESSION_DAYS");
  const retentionDays = parseIntEnv(env.OWNDROP_RETENTION_DAYS, 90, 1, 3650, "OWNDROP_RETENTION_DAYS");
  const maxFileMb = parseIntEnv(env.OWNDROP_MAX_FILE_MB, 90, 1, 1024, "OWNDROP_MAX_FILE_MB");
  const maxPresignedFileMb = parseIntEnv(
    env.OWNDROP_MAX_PRESIGNED_FILE_MB,
    512,
    1,
    5120,
    "OWNDROP_MAX_PRESIGNED_FILE_MB",
  );
  const maxStorageMb = parseIntEnv(env.OWNDROP_MAX_STORAGE_MB, 8192, 10, 1024 * 1024, "OWNDROP_MAX_STORAGE_MB");

  return {
    origin: rawOrigin,
    password,
    sessionSecret,
    ...(apiToken ? { apiToken } : {}),
    ...(oidc ? { oidc } : {}),
    sessionDays,
    retentionDays,
    maxFileBytes: maxFileMb * 1024 * 1024,
    maxPresignedFileBytes: maxPresignedFileMb * 1024 * 1024,
    maxStorageBytes: maxStorageMb * 1024 * 1024,
    version: APP_VERSION,
  };
}
