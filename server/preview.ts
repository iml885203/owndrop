import type { LinkPreview } from "./types.js";

const MAX_HTML_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;

export function extractStandaloneUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!isPublicUrl(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPublicUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    return false;
  }

  // IPv4 private / loopback / link-local / CGNAT / unspecified
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number(n));
    if (octets.some((n) => n < 0 || n > 255)) return false;
    const [a, b] = octets as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
    return true;
  }

  // IPv6 literals: block loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10), v4-mapped
  if (host.includes(":")) {
    if (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("::ffff:")
    ) {
      return false;
    }
  }

  return host.includes(".");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (match?.[1]) {
      const value = decodeHtmlEntities(match[1]);
      if (value) return value;
    }
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!match?.[1]) return undefined;
  const value = decodeHtmlEntities(match[1]);
  return value || undefined;
}

function extractFavicon(html: string, base: URL): string | undefined {
  const match =
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i.exec(html) ??
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i.exec(html);
  const raw = match?.[1] ? decodeHtmlEntities(match[1]) : "/favicon.ico";
  return resolvePublicAssetUrl(raw, base);
}

function resolvePublicAssetUrl(raw: string | undefined, base: URL): string | undefined {
  if (!raw) return undefined;
  try {
    const resolved = new URL(raw, base);
    return isPublicUrl(resolved) ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchLinkPreview(url: URL, fetchImpl: typeof fetch = fetch): Promise<LinkPreview | null> {
  if (!isPublicUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    let response: Response | null = null;
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await fetchImpl(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "OwnDropLinkPreview/1.0",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        const nextUrl = new URL(location, currentUrl);
        if (!isPublicUrl(nextUrl)) return null;
        currentUrl = nextUrl;
        continue;
      }
      break;
    }

    if (!response || !response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    reader.cancel().catch(() => {});

    const combined = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
    let offset = 0;
    for (const chunk of chunks) {
      const slice = chunk.subarray(0, combined.length - offset);
      combined.set(slice, offset);
      offset += slice.length;
      if (offset >= combined.length) break;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(combined);

    const title = (extractMeta(html, "og:title") ?? extractMeta(html, "twitter:title") ?? extractTitle(html))?.slice(
      0,
      200,
    );
    if (!title) return null;

    const description = (
      extractMeta(html, "og:description") ??
      extractMeta(html, "twitter:description") ??
      extractMeta(html, "description") ??
      ""
    ).slice(0, 320);

    const image = resolvePublicAssetUrl(extractMeta(html, "og:image") ?? extractMeta(html, "twitter:image"), currentUrl);
    const siteName = extractMeta(html, "og:site_name")?.slice(0, 80);
    const favicon = extractFavicon(html, currentUrl);

    return {
      title,
      description,
      ...(image ? { image } : {}),
      ...(siteName ? { siteName } : {}),
      ...(favicon ? { favicon } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
