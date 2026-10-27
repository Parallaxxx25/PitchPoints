import { useEffect, useRef, useState } from "react";
import { connect, disconnect } from "../connection.ts";
import type { OverlayCue } from "../contracts.gen.ts";
import { LANGUAGES, useProfile } from "../profile.ts";
import { useLive } from "../store.ts";
import { describeCue } from "../text.ts";
import { useT } from "../useT.ts";
import { visibleCues } from "./active.ts";
import { CueGraphic } from "./CueGraphic.tsx";

const HOLD_CHECK_MS = 250;

/** The cues to draw now, re-checked on a timer so held cues leave when their time is up. */
function useVisibleCues(): OverlayCue[] {
  const cues = useLive((s) => s.cues);
  const clock = useLive((s) => s.clock);
  const firstSeen = useRef(new Map<number, number>());
  const [visible, setVisible] = useState<OverlayCue[]>([]);

  useEffect(() => {
    const update = () => {
      const now = performance.now();
      const next = visibleCues(cues, clock, firstSeen.current, now);
      for (const cue of next) {
        if (!firstSeen.current.has(cue.id)) firstSeen.current.set(cue.id, now);
      }
      setVisible((prev) =>
        prev.length === next.length && prev.every((c, i) => c === next[i])
          ? prev
          : next,
      );
    };
    update();
    const id = setInterval(update, HOLD_CHECK_MS);
    return () => clearInterval(id);
  }, [cues, clock]);
  return visible;
}

/**
 * The broadcast overlay: a transparent 16:9 page that shows the match's overlay cues, timed to
 * the match clock, where a graphics system would draw them over the live feed.
 *
 * Address: `/overlay?match=<id>`, optionally `&lang=es` and `&bg=dark` to preview on a backdrop.
 */
export function OverlayPage() {
  const moments = useLive((s) => s.moments);
  const meta = useLive((s) => s.metadata);
  const update = useProfile((s) => s.update);
  const { language, t } = useT();
  const params = new URLSearchParams(
    typeof location === "undefined" ? "" : location.search,
  );
  const matchId = params.get("match");
  const wanted = LANGUAGES.find((l) => l === params.get("lang"));
  const backdrop = params.get("bg") === "dark";

  useEffect(() => {
    document.body.classList.add("overlay-page");
    if (wanted) update({ language: wanted });
    if (matchId) connect(matchId);
    return () => {
      disconnect();
      document.body.classList.remove("overlay-page");
    };
  }, [matchId, wanted, update]);

  const showing = useVisibleCues();
  const graphic = (template: (typeof showing)[number]["template"]) => {
    const cue = showing.find((c) => c.template === template);
    return cue && meta ? (
      <CueGraphic
        key={cue.id}
        cue={cue}
        text={describeCue(cue, { language, meta }, moments)}
        meta={meta}
      />
    ) : null;
  };

  return (
    <main
      aria-label={t("appName")}
      className={`flex min-h-screen items-center justify-center ${backdrop ? "bg-highest" : ""}`}
    >
      <div
        data-overlay
        className="relative overflow-hidden"
        style={{
          aspectRatio: "16 / 9",
          width: "min(100vw, calc(100vh * 16 / 9))",
          containerType: "inline-size",
        }}
      >
        {!matchId && (
          <p className="p-[2cqw] text-[2cqw] text-white">
            {t("overlayNoMatch")}
          </p>
        )}
        {matchId && !meta && backdrop && (
          <p className="p-[2cqw] text-[2cqw] text-white">
            {t("overlayWaiting")}
          </p>
        )}
        <div className="absolute left-1/2 top-[3cqw] -translate-x-1/2">
          {graphic("momentum_bar")}
        </div>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[2cqw]">
          {graphic("stat_compare")}
          {graphic("recap_card")}
        </div>
        <div className="absolute bottom-[3cqw] left-[3cqw] flex flex-col items-start gap-[1cqw]">
          {graphic("player_tag")}
          {graphic("pass_quality")}
          {graphic("shot_speed")}
          {graphic("key_moment")}
        </div>
      </div>
    </main>
  );
}
