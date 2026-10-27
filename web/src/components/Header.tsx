import { Goal, Pause, Play, User } from "lucide-react";
import { control } from "../connection.ts";
import { LANGUAGE_NAMES } from "../i18n/index.ts";
import { LANGUAGES, MODES, useProfile } from "../profile.ts";
import type { Side } from "../roster.ts";
import { liveMinute, useLive } from "../store.ts";
import { MODE_LABELS } from "../text.ts";
import { useT } from "../useT.ts";

const SPEEDS = [1, 6, 18, 60] as const;

/** The product mark: a volt tile and the name. */
export function Brand() {
  const { t } = useT();
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-xl bg-volt-deep text-lowest"
      >
        <Goal size={20} strokeWidth={2.4} />
      </span>
      <span className="text-lg font-extrabold uppercase tracking-tight text-ink">
        {t("appName")}
      </span>
    </span>
  );
}

/** A team's marker: its colour in a shape (circle home, square away), so colour is never the only cue. */
export function TeamMark({ side, colour }: { side: Side; colour: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 ${side === "home" ? "rounded-full" : "rounded-[2px]"}`}
      style={{ backgroundColor: colour, boxShadow: `0 0 8px ${colour}` }}
    />
  );
}

function StatusPill() {
  const status = useLive((s) => s.state?.status);
  const { t } = useT();
  if (!status) return null;
  if (status === "running") {
    return (
      <span className="pill label-caps text-volt">
        <span
          aria-hidden="true"
          className="live-dot size-1.5 rounded-full bg-volt"
        />
        {t("statusRunning")}
      </span>
    );
  }
  const tone = status === "paused" ? "text-amber" : "text-ink-2";
  return (
    <span className={`pill label-caps ${tone}`}>
      {t(status === "paused" ? "statusPaused" : "statusFinished")}
    </span>
  );
}

function ScoreChip() {
  const meta = useLive((s) => s.metadata)!;
  const state = useLive((s) => s.state);
  const minute = useLive(liveMinute);
  const { t } = useT();
  const home = state?.score_home ?? 0;
  const away = state?.score_away ?? 0;
  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl bg-card px-2 py-1.5 sm:gap-3 sm:px-3">
      <div
        role="group"
        aria-label={t("scoreLabel", {
          home: meta.home.name,
          homeGoals: home,
          away: meta.away.name,
          awayGoals: away,
        })}
        className="flex items-center gap-2"
      >
        <span
          className="flex items-center gap-1.5 font-semibold"
          aria-hidden="true"
        >
          <TeamMark side="home" colour={meta.home.primary_colour} />
          <span className="hidden md:inline">{meta.home.name}</span>
          <span className="md:hidden">{meta.home.short_name}</span>
        </span>
        <span
          aria-hidden="true"
          className="rounded-lg bg-low px-2 py-0.5 font-mono text-lg font-semibold"
        >
          <span className="text-volt">{home}</span>
          <span className="px-1 text-ink-2">–</span>
          <span className="text-violet">{away}</span>
        </span>
        <span
          className="flex items-center gap-1.5 font-semibold"
          aria-hidden="true"
        >
          <span className="hidden md:inline">{meta.away.name}</span>
          <span className="md:hidden">{meta.away.short_name}</span>
          <TeamMark side="away" colour={meta.away.primary_colour} />
        </span>
      </div>
      <span
        aria-hidden="true"
        className="hidden h-4 w-px bg-highest sm:block"
      />
      <span className="font-mono font-semibold">
        <span className="visually-hidden">{t("minuteLabel", { minute })}</span>
        <span aria-hidden="true">{minute}&prime;</span>
      </span>
      <StatusPill />
    </div>
  );
}

function Playback() {
  const state = useLive((s) => s.state);
  const { t } = useT();
  const paused = state?.status === "paused";
  const finished = state?.status === "finished";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={t("speedLabel")}
        className="flex items-center gap-1 rounded-xl bg-low p-1"
      >
        <button
          type="button"
          disabled={finished}
          onClick={() => void control({ paused: !paused })}
          aria-label={paused ? t("resume") : t("pause")}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-2 hover:bg-high hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            aria-pressed={state?.speed === speed}
            onClick={() => void control({ speed })}
            className={`cursor-pointer rounded-lg px-2 py-1 font-mono text-sm ${
              state?.speed === speed
                ? "glow-volt bg-volt-deep font-bold text-on-volt"
                : "text-ink-2 hover:bg-high hover:text-ink"
            }`}
          >
            {t("speedOption", { speed })}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const minute = new FormData(e.currentTarget).get("minute");
          if (minute !== null && minute !== "")
            void control({ seek_minute: Number(minute) });
        }}
      >
        <label htmlFor="seek-minute" className="text-sm text-ink-2">
          {t("seekLabel")}
        </label>
        <input
          id="seek-minute"
          name="minute"
          type="number"
          min={0}
          max={120}
          inputMode="numeric"
          className="field w-16 px-2 py-1 font-mono text-sm"
        />
        <button type="submit" className="btn-ghost px-2.5 py-1 text-sm">
          {t("seekGo")}
        </button>
      </form>
    </div>
  );
}

function Preferences() {
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const setScreen = useProfile((s) => s.setScreen);
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5">
        <span className="visually-hidden">{t("modeLabel")}</span>
        <select
          name="mode"
          value={profile.mode}
          onChange={(e) =>
            update({ mode: e.target.value as typeof profile.mode })
          }
          className="field py-1 text-sm"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(MODE_LABELS[m])}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="visually-hidden">{t("languageLabel")}</span>
        <select
          name="language"
          value={profile.language}
          onChange={(e) =>
            update({ language: e.target.value as typeof profile.language })
          }
          className="field py-1 text-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setScreen("setup")}
        aria-label={t("profileButton")}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-volt-deep text-on-volt hover:bg-volt"
      >
        <User size={18} />
      </button>
    </div>
  );
}

/** The sticky top bar: brand and pages, the live score, playback, and the viewer's mode and language. */
export function Header() {
  const meta = useLive((s) => s.metadata);
  const connection = useLive((s) => s.connection);
  const screen = useProfile((s) => s.screen);
  const setScreen = useProfile((s) => s.setScreen);
  const { t } = useT();
  const tab = (target: "live" | "squad", label: string) => (
    <button
      type="button"
      aria-current={screen === target ? "page" : undefined}
      onClick={() => setScreen(target)}
      className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${
        screen === target ? "bg-high text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-stroke bg-lowest/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-4">
          <h1 className="m-0">
            <Brand />
          </h1>
          <nav aria-label={t("navLabel")} className="flex items-center gap-1">
            {tab("live", t("navLive"))}
            {tab("squad", t("navSquad"))}
          </nav>
        </div>
        {meta && <ScoreChip />}
        <div className="flex flex-wrap items-center gap-3">
          <Playback />
          <Preferences />
        </div>
      </div>
      {connection !== "open" && (
        <p
          role="status"
          className="bg-amber/15 px-4 py-1 text-center text-sm text-amber"
        >
          {connection === "lost" ? t("connectionLost") : t("connecting")}
        </p>
      )}
    </header>
  );
}
