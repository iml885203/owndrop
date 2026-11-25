import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { pkceChallengeS256, randomBase64Url, sha256Hex } from "./crypto.js";
import type { AuthService } from "./auth.js";
import { parseCookies } from "./auth.js";
import type { DropRepository } from "./db.js";
import type { OidcConfig } from "./types.js";

const OIDC_BINDING_COOKIE = "owndrop_oidc_tx";
const TX_TTL_SECONDS = 600;

interface DiscoveryDoc {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

export class OidcService {
  private cachedDiscovery?: { doc: DiscoveryDoc; fetchedAt: number };
  private cachedJwks?: { jwks: JSONWebKeySet; fetchedAt: number };

  constructor(
    private readonly oidc: OidcConfig,
    private readonly origin: string,
    private readonly repo: DropRepository,
    private readonly auth: AuthService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get callbackUrl(): string {
    return `${this.origin}/auth/callback`;
  }

  private async getDiscovery(): Promise<DiscoveryDoc> {
    if (this.cachedDiscovery && Date.now() - this.cachedDiscovery.fetchedAt < 10 * 60 * 1000) {
      return this.cachedDiscovery.doc;
    }
    const base = this.oidc.issuer.replace(/\/+$/, "");
    const fetchFn = this.fetchImpl;
    const res = await fetchFn(`${base}/.well-known/openid-configuration`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
    const doc = (await res.json()) as DiscoveryDoc;
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      throw new Error("Invalid OIDC discovery document");
    }
    this.cachedDiscovery = { doc, fetchedAt: Date.now() };
    return doc;
  }

  private async getJwks(jwksUri: string): Promise<JSONWebKeySet> {
    if (this.cachedJwks && Date.now() - this.cachedJwks.fetchedAt < 10 * 60 * 1000) {
      return this.cachedJwks.jwks;
    }
    const fetchFn = this.fetchImpl;
    const res = await fetchFn(jwksUri, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`OIDC JWKS fetch failed (${res.status})`);
    const jwks = (await res.json()) as JSONWebKeySet;
    this.cachedJwks = { jwks, fetchedAt: Date.now() };
    return jwks;
  }

  async startLogin(): Promise<{ redirectUrl: string; setCookie: string }> {
    const doc = await this.getDiscovery();
    const state = randomBase64Url(24);
    const nonce = randomBase64Url(24);
    const codeVerifier = randomBase64Url(48);
    const codeChallenge = await pkceChallengeS256(codeVerifier);
    const browserBinding = randomBase64Url(24);
    const browserBindingHash = await sha256Hex(browserBinding);

    await this.repo.createOidcTransaction({
      state,
      nonce,
      codeVerifier,
      browserBindingHash,
      ttlSeconds: TX_TTL_SECONDS,
    });

    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.oidc.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("scope", this.oidc.requiredGroup ? "openid profile email groups" : "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    const setCookie = this.auth.formatCookie(OIDC_BINDING_COOKIE, browserBinding, TX_TTL_SECONDS, "Lax");
    return { redirectUrl: url.toString(), setCookie };
  }

  async handleCallback(
    code: string,
    state: string,
    cookieHeader: string | undefined,
  ): Promise<{ sessionCookie: string; clearBindingCookie: string }> {
    const clearBindingCookie = this.auth.formatCookie(OIDC_BINDING_COOKIE, "", 0, "Lax");
    const tx = await this.repo.consumeOidcTransaction(state);
    if (!tx) throw new Error("OIDC transaction missing or expired");

    const binding = parseCookies(cookieHeader)[OIDC_BINDING_COOKIE];
    if (!binding) throw new Error("OIDC browser binding cookie missing");
    const bindingHash = await sha256Hex(binding);
    if (bindingHash !== tx.browser_binding_hash) {
      throw new Error("OIDC browser binding mismatch");
    }

    const doc = await this.getDiscovery();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.callbackUrl,
      client_id: this.oidc.clientId,
      client_secret: this.oidc.clientSecret,
      code_verifier: tx.code_verifier,
    });

    const fetchFn = this.fetchImpl;
    const tokenRes = await fetchFn(doc.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(`OIDC token exchange failed (${tokenRes.status})`);
    }
    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) throw new Error("OIDC provider did not return id_token");

    const jwks = await this.getJwks(doc.jwks_uri);
    const keySet = createLocalJWKSet(jwks);
    const { payload } = await jwtVerify(tokenJson.id_token, keySet, {
      issuer: doc.issuer,
      audience: this.oidc.clientId,
    });

    if (payload.nonce !== tx.nonce) {
      throw new Error("OIDC nonce mismatch");
    }

    if (this.oidc.requiredGroup) {
      const groupsClaim = payload.groups;
      const allowed = Array.isArray(groupsClaim)
        ? groupsClaim.includes(this.oidc.requiredGroup)
        : groupsClaim === this.oidc.requiredGroup;
      if (!allowed) {
        throw new Error("User is not in the required OIDC group");
      }
    }

    const subject = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : "oidc-user";
    const sessionCookie = await this.auth.issueSessionCookie(subject);
    return { sessionCookie, clearBindingCookie };
  }
}
