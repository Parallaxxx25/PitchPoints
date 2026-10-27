import { describe, expect, test } from "vitest";
import { en } from "./en.ts";
import {
  formatNumber,
  formatPercent,
  LANGUAGE_NAMES,
  TABLES,
  translate,
} from "./index.ts";

const KEYS = Object.keys(en);
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(["es", "pt", "th"] as const)("%s", (language) => {
  test("defines exactly the English keys", () => {
    expect(Object.keys(TABLES[language]).sort()).toEqual([...KEYS].sort());
  });

  test("keeps the same placeholders as English in every string", () => {
    for (const key of KEYS as (keyof typeof en)[]) {
      expect(placeholders(TABLES[language][key]), key).toEqual(
        placeholders(en[key]),
      );
    }
  });

  test("has no empty strings and is not a copy of English wholesale", () => {
    const values = Object.values(TABLES[language]);
    expect(values.every((v) => v.trim().length > 0)).toBe(true);
    const same = KEYS.filter(
      (k) =>
        TABLES[language][k as keyof typeof en] === en[k as keyof typeof en],
    );
    expect(same.length / KEYS.length).toBeLessThan(0.15);
  });
});

test("every supported language has a name in its own language", () => {
  expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual(["en", "es", "pt", "th"]);
});

test("translate fills placeholders and leaves unknown ones visible", () => {
  expect(translate("en", "goalAssist", { player: "A. Player" })).toBe(
    "Assist: A. Player.",
  );
  expect(translate("en", "goalAssist")).toBe("Assist: {player}.");
  expect(translate("es", "minuteLabel", { minute: 12 })).toBe("Minuto 12");
});

test("numbers follow the language and the requested decimals", () => {
  expect(formatNumber("en", 1234.5, 1)).toBe("1,234.5");
  expect(formatNumber("es", 0.5, 2)).toBe("0,50");
  expect(formatPercent("en", 0.4856, 1)).toBe("48.6%");
  expect(formatPercent("pt", 0.5)).toBe("50%");
});
