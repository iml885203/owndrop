import en, { type Messages } from "./locales/en";
import ja from "./locales/ja";
import ko from "./locales/ko";
import zhHans from "./locales/zh-Hans";
import zhHant from "./locales/zh-Hant";

const catalogs = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant } satisfies Record<string, Messages>;
type Locale = keyof typeof catalogs;

export function resolveLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    try {
      const { language, script, region } = new Intl.Locale(preference);
      if (language === "en" || language === "ja" || language === "ko") return language;
      if (language === "zh") {
        if (script === "Hant" || script === "Hans") return script === "Hant" ? "zh-Hant" : "zh-Hans";
        return region === "TW" || region === "HK" || region === "MO" ? "zh-Hant" : "zh-Hans";
      }
    } catch {
      // Skip malformed preferences and try the next language.
    }
  }
  return "en";
}

const browser = globalThis.navigator;
export const locale = resolveLocale(browser?.languages?.length ? browser.languages : [browser?.language ?? "en"]);
const numberFormat = new Intl.NumberFormat(locale);

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

type Values = Record<string, string | number>;

export function t(key: keyof Messages, values: Values = {}): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (typeof value === "number") return formatNumber(value);
    return value ?? placeholder;
  });
}
