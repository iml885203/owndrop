import { describe, expect, it } from "vitest";
import { resolveLocale } from "../src/i18n";
import en from "../src/locales/en";
import ja from "../src/locales/ja";
import ko from "../src/locales/ko";
import zhHans from "../src/locales/zh-Hans";
import zhHant from "../src/locales/zh-Hant";

describe("browser language selection", () => {
  it.each([
    [["en-GB"], "en"],
    [["zh-CN"], "zh-Hans"],
    [["zh-TW"], "zh-Hant"],
    [["zh-HK"], "zh-Hant"],
    [["zh-MO"], "zh-Hant"],
    [["zh-Hans-TW"], "zh-Hans"],
    [["zh-Hant-CN"], "zh-Hant"],
    [["fr-FR", "ja-JP", "en"], "ja"],
    [["ko-KR", "ja"], "ko"],
    [["invalid_locale", "zh-SG"], "zh-Hans"],
    [["fr", "de"], "en"],
    [[], "en"],
  ] as const)("uses %j → %s", (preferences, expected) => {
    expect(resolveLocale(preferences)).toBe(expected);
  });
});

describe("translated messages", () => {
  it.each([ja, ko, zhHans, zhHant].map((messages, index) => [
    ["ja", "ko", "zh-Hans", "zh-Hant"][index],
    messages,
  ] as const))("preserves the parameters in %s", (_, messages) => {
    const parameters = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(parameters(messages[key]), key).toEqual(parameters(en[key]));
    }
  });
});
