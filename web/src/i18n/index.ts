import type { ViewerProfile } from "../contracts.gen.ts";
import { en, type StringKey, type Strings } from "./en.ts";
import { es } from "./es.ts";
import { pt } from "./pt.ts";
import { th } from "./th.ts";

export type Language = ViewerProfile["language"];
export type { StringKey };

export const TABLES: Record<Language, Strings> = { en, es, pt, th };

/** Language names in their own language, so a viewer can always find theirs. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  th: "ไทย",
};

export type Vars = Record<string, string | number>;

/** The text for `key` in `language`, with each `{name}` replaced by its value in `vars`. */
export function translate(
  language: Language,
  key: StringKey,
  vars: Vars = {},
): string {
  return TABLES[language][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** Building a formatter is slow and the live screen formats hundreds of numbers a second, so each is made once. */
const formatters = new Map<string, Intl.NumberFormat>();

/** Numbers formatted for the language, with a fixed number of decimals. */
export function formatNumber(
  language: Language,
  value: number,
  decimals = 0,
): string {
  const key = `${language}:${decimals}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatPercent(
  language: Language,
  share: number,
  decimals = 0,
): string {
  return `${formatNumber(language, share * 100, decimals)}%`;
}
