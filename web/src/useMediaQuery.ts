import { useSyncExternalStore } from "react";

/** Whether the media query matches, updating when it changes; false where there is no `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== "function") return () => {};
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    () => false,
  );
}
