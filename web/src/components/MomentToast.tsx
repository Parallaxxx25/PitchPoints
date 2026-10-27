import { Goal } from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyMoment } from "../contracts.gen.ts";
import { useLive } from "../store.ts";
import { describeMoment } from "../text.ts";
import { useT } from "../useT.ts";

/** How long a celebration stays up, in real milliseconds. */
const TOAST_MS = 6000;
/** A goal older than this, in match seconds, is not news. */
const FRESH_S = 30;

/**
 * A goal pops up in the corner as it happens (Stitch's celebration card). It is decoration: the
 * pitch caption announces goals to screen readers and the story feed keeps them.
 */
export function MomentToast() {
  const meta = useLive((s) => s.metadata);
  const { language } = useT();
  const [shown, setShown] = useState<KeyMoment | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useLive.subscribe((s, prev) => {
      const latest = s.moments.at(-1);
      const before = prev.moments.at(-1)?.id ?? 0;
      if (!latest || latest.id <= before || latest.type !== "goal") return;
      // Moments fetched on joining or after a seek are history, not news: only a goal that has just happened pops up.
      const fresh =
        s.clock !== null &&
        s.clock.period === latest.period &&
        s.clock.clock_s - latest.clock_s <= FRESH_S;
      if (!fresh) return;
      setShown(latest);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(null), TOAST_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (!shown || !meta) return null;
  const text = describeMoment(shown, { language, meta });
  return (
    <div
      aria-hidden="true"
      className="cue-in glow-volt fixed bottom-4 left-4 z-30 flex max-w-sm items-start gap-3 rounded-2xl border border-volt-deep/40 bg-high/95 p-4 backdrop-blur-xl"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt-deep text-lowest">
        <Goal size={22} />
      </span>
      <span>
        <span className="flex items-center gap-2 font-mono text-sm font-bold text-volt">
          {text.badge} <span className="text-ink-2">{shown.minute}&prime;</span>
        </span>
        <span className="block font-semibold">{text.text}</span>
      </span>
    </div>
  );
}
