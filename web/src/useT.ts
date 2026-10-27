import { useCallback } from "react";
import { type StringKey, translate, type Vars } from "./i18n/index.ts";
import { useProfile } from "./profile.ts";

export type T = (key: StringKey, vars?: Vars) => string;

/** The viewer's language and a translate function bound to it. */
export function useT(): { language: ReturnType<typeof useLanguage>; t: T } {
  const language = useLanguage();
  const t = useCallback<T>(
    (key, vars) => translate(language, key, vars),
    [language],
  );
  return { language, t };
}

export function useLanguage() {
  return useProfile((s) => s.profile.language);
}
