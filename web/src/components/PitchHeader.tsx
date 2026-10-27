import { useEffect, useState } from "react";
import { stopReplay } from "../connection.ts";
import { formatNumber, formatPercent } from "../i18n/index.ts";
import { replayMs } from "../replay.ts";
import { liveMinute, useLive } from "../store.ts";
import { describeMoment } from "../text.ts";
import { useT } from "../useT.ts";

const TICK_MS = 200;

const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function ReplayControls() {
  const replay = useLive((s) => s.replay)!;
  const minute = useLive(liveMinute);
  const { t } = useT();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const total = replayMs(replay.clips);
  const elapsed =
    replay.status === "ended" ? total : Math.min(total, now - replay.startedAt);
  const note =
    replay.status === "loading"
      ? t("replayLoading")
      : replay.status === "failed"
        ? t("replayFailed")
        : replay.status === "ended"
          ? t("replayEnded")
          : null;
  return (
    <div role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="pill label-caps shrink-0 text-volt">
            <span
              aria-hidden="true"
              className="live-dot size-1.5 rounded-full bg-volt"
            />
            {t("replayingBadge")}
          </span>
          <span className="truncate font-semibold">
            {t("replayBanner", { label: replay.label })}
            {note && (
              <span className="ml-2 font-normal text-ink-2">· {note}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <span className="font-mono text-sm text-ink-2" aria-hidden="true">
              {clockText(elapsed)} / {clockText(total)}
            </span>
          )}
          <button
            type="button"
            onClick={stopReplay}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            {t("replayBackAt", { minute })}
          </button>
        </div>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-low"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-volt-deep"
          style={{ width: `${total > 0 ? (elapsed / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function LiveInfo() {
  const meta = useLive((s) => s.metadata)!;
  const stats = useLive((s) => s.stats);
  const { language, t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="pill label-caps shrink-0 text-cyan">
          {t("pitchLiveTag")}
        </span>
        <span className="truncate text-sm text-ink-2">
          {meta.venue} ·{" "}
          {t("attendance", { count: formatNumber(language, meta.attendance) })}
        </span>
      </div>
      {stats && (
        <span className="text-sm text-ink-2">
          {t("statPossession")}{" "}
          <span className="font-mono font-semibold text-cyan">
            {formatPercent(language, stats.home.possession)}
          </span>{" "}
          {meta.home.short_name} ·{" "}
          <span className="font-mono font-semibold text-violet">
            {formatPercent(language, stats.away.possession)}
          </span>{" "}
          {meta.away.short_name}
        </span>
      )}
    </div>
  );
}

/** Above the pitch: where the match is and who has the ball, or the replay that is playing. */
export function PitchHeader() {
  const replaying = useLive((s) => s.replay !== null);
  return replaying ? <ReplayControls /> : <LiveInfo />;
}

/** The latest key moment, captioned along the bottom of the live pitch. */
export function MomentCaption() {
  const moment = useLive((s) => s.moments.at(-1));
  const meta = useLive((s) => s.metadata);
  const replaying = useLive((s) => s.replay !== null);
  const { language } = useT();
  if (!moment || !meta || replaying) return null;
  const text = describeMoment(moment, { language, meta }).text;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-3 left-3 right-3 hidden sm:block"
    >
      <span className="inline-flex max-w-full items-center gap-2 rounded-xl bg-lowest/85 px-3 py-1.5 text-sm backdrop-blur">
        <span className="font-mono font-bold text-volt">
          {moment.minute}&prime;
        </span>
        <span className="size-1 shrink-0 rounded-full bg-volt" />
        <span className="truncate">{text}</span>
      </span>
    </div>
  );
}
