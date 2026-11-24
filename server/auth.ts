import {
  constantTimeEqualString,
  hmacSha256Base64Url,
  randomBase64Url,
  sha256Hex,
} from "./crypto.js";
import type { DropRepository } from "./db.js";
import type { AppConfig, AuthContext, WaitUntilFn } from "./types.js";

export const SESSION_COOKIE_NAME = "owndrop_session";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith("https://");
}

export class AuthService {
  private readonly loginAttempts = new Map<string, number[]>();

  constructor(
    private readonly config: AppConfig,
    private readonly repo: DropRepository,
    private readonly waitUntil?: WaitUntilFn,
  ) {}

  private get sessionSeconds(): number {
    return this.config.sessionDays * 24 * 60 * 60;
  }

  async issueSessionCookie(subject = "owner"): Promise<string> {
    const sessionId = randomBase64Url(32);
    await this.repo.createSession(sessionId, subject, this.sessionSeconds);
    const sig = await hmacSha256Base64Url(this.config.sessionSecret, sessionId);
    const value = `${sessionId}.${sig}`;
    return this.formatCookie(SESSION_COOKIE_NAME, value, this.sessionSeconds, "Lax");
  }

  clearSessionCookie(): string {
    return this.formatCookie(SESSION_COOKIE_NAME, "", 0, "Lax");
  }

  formatCookie(name: string, value: string, maxAgeSeconds: number, sameSite: "Lax" | "Strict"): string {
    const parts = [
      `${name}=${value}`,
      "Path=/",
      "HttpOnly",
      `SameSite=${sameSite}`,
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (isSecureOrigin(this.config.origin)) {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  async verifyPasswordLogin(password: string, clientKey: string): Promise<{ ok: true; cookie: string } | { ok: false; status: 401 | 429; error: string }> {
    const now = Date.now();
    const recent = (this.loginAttempts.get(clientKey) ?? []).filter((ts) => now - ts < LOGIN_WINDOW_MS);
    if (recent.length >= MAX_LOGIN_ATTEMPTS) {
      this.loginAttempts.set(clientKey, recent);
      return { ok: false, status: 429, error: "Too many login attempts. Please wait a few minutes." };
    }

    const expectedHash = await sha256Hex(this.config.password);
    const providedHash = await sha256Hex(password);
    if (!constantTimeEqualString(expectedHash, providedHash)) {
      recent.push(now);
      this.loginAttempts.set(clientKey, recent);
      return { ok: false, status: 401, error: "Invalid password" };
    }

    this.loginAttempts.delete(clientKey);
    const cookie = await this.issueSessionCookie("owner");
    return { ok: true, cookie };
  }

  async logoutFromCookie(cookieHeader: string | undefined): Promise<string> {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
    if (token) {
      const dot = token.indexOf(".");
      if (dot > 0) {
        const sessionId = token.slice(0, dot);
        await this.repo.deleteSession(sessionId);
      }
    }
    return this.clearSessionCookie();
  }

  async authenticateRequest(headers: Headers): Promise<AuthContext | null> {
    const authHeader = headers.get("authorization");
    if (authHeader !== null) {
      // Explicit Authorization header never falls back to cookie auth.
      if (!authHeader.startsWith("Bearer ")) return null;
      const rawToken = authHeader.slice("Bearer ".length).trim();
      if (rawToken.length < 16) return null;

      // 1. Check optional static env fallback token
      if (this.config.apiToken && this.config.apiToken.length >= 32) {
        const expected = await sha256Hex(this.config.apiToken);
        const provided = await sha256Hex(rawToken);
        if (constantTimeEqualString(expected, provided)) {
          return { kind: "env-token", deviceName: "CLI" };
        }
      }

      // 2. Check multi-device DB tokens
      const found = await this.repo.findActiveTokenByRaw(rawToken);
      if (!found) return null;
      const touchPromise = this.repo.touchToken(found.id).catch(() => {});
      if (this.waitUntil) this.waitUntil(touchPromise);
      else void touchPromise;
      return {
        kind: "device-token",
        tokenId: found.id,
        deviceName: found.name,
      };
    }

    // Cookie authentication
    const cookieValue = parseCookies(headers.get("cookie") ?? undefined)[SESSION_COOKIE_NAME];
    if (!cookieValue) return null;
    const dot = cookieValue.indexOf(".");
    if (dot <= 0) return null;
    const sessionId = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    const expectedSig = await hmacSha256Base64Url(this.config.sessionSecret, sessionId);
    if (!constantTimeEqualString(sig, expectedSig)) return null;

    const session = await this.repo.verifySession(sessionId);
    if (!session) return null;
    return { kind: "session", subject: session.subject };
  }

  isOriginValid(headers: Headers): boolean {
    const origin = headers.get("origin");
    if (origin) return origin === this.config.origin;
    const referer = headers.get("referer");
    if (referer) {
      try {
        return new URL(referer).origin === this.config.origin;
      } catch {
        return false;
      }
    }
    return false;
  }

  generateDeviceToken(): string {
    return `owd_${randomBase64Url(32)}`;
  }

  clientKey(headers: Headers): string {
    return (
      headers.get("cf-connecting-ip") ??
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "local"
    );
  }
}
