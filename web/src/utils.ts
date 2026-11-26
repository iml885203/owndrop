import { formatNumber, locale, t } from "./i18n";

const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const relativeTime = new Intl.RelativeTimeFormat(locale, { style: "short" });
const dateTime = new Intl.DateTimeFormat(locale, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  if (bytes < 1024 * 1024) return `${oneDecimal.format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${oneDecimal.format(bytes / (1024 * 1024))} MB`;
  return `${twoDecimals.format(bytes / (1024 * 1024 * 1024))} GB`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return t("now");
  if (diffSec < 3600) return relativeTime.format(-Math.max(1, Math.floor(diffSec / 60)), "minute");
  if (diffSec < 86400) return relativeTime.format(-Math.floor(diffSec / 3600), "hour");
  return dateTime.format(date);
}

export function extractWebUrl(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed || /\s/.test(trimmed)) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function linkHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return t("browser");
}
