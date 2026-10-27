import {
  ArrowRight,
  Binoculars,
  ChartColumn,
  Hand,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { startMatch } from "../connection.ts";
import type { MatchMetadata } from "../contracts.gen.ts";
import { LANGUAGE_NAMES } from "../i18n/index.ts";
import {
  FOCUS_METRICS,
  LANGUAGES,
  type Mode,
  MODES,
  useProfile,
} from "../profile.ts";
import { useLive } from "../store.ts";
import { MODE_DESCRIPTIONS, MODE_LABELS, playerStatLabel } from "../text.ts";
import { useT } from "../useT.ts";
import { Brand } from "./Header.tsx";

const SPEEDS = [1, 6, 18, 60] as const;
const DEFAULT_SEED = 7;
const RECOMMENDED: Mode = "casual";

const MODE_ICONS: Record<Mode, typeof Star> = {
  analyst: ChartColumn,
  casual: Sparkles,
  fantasy: Star,
  player_focus: Binoculars,
  club: Users,
};

/** The top bar of the set-up and squad pages: the brand and where the viewer is in the two steps. */
export function PageBar({
  step,
  title,
  actions,
}: {
  step: 1 | 2;
  title: string;
  actions?: ReactNode;
}) {
  const { t } = useT();
  return (
    <header className="border-b border-stroke bg-lowest/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-6">
        <Brand />
        <div className="flex min-w-[14rem] flex-col items-center gap-2">
          <span className="text-sm">
            <span className="label-caps text-ink-2">
              {t("obStep", { step })}
            </span>{" "}
            <span className="text-volt">· {title}</span>
          </span>
          <span
            className="h-1.5 w-full overflow-hidden rounded-full bg-highest"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-volt-deep"
              style={{ width: `${step * 50}%` }}
            />
          </span>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

/** A decorative mini pitch for the hero: what a live match looks like, without any numbers. */
function PreviewPitch() {
  const { t } = useT();
  return (
    <div aria-hidden="true" className="card flex flex-col gap-4 p-5">
      <span className="flex items-center gap-2 label-caps text-volt">
        <span className="live-dot size-2 rounded-full bg-volt" />
        {t("obPreviewTag")}
      </span>
      <svg viewBox="0 0 105 68" className="h-auto w-full rounded-xl bg-pitch">
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x={i * 10.5}
            y={0}
            width={10.5}
            height={68}
            fill={i % 2 ? "#166534" : "#14532d"}
          />
        ))}
        <g fill="none" stroke="#fff" strokeWidth={0.3} opacity={0.55}>
          <rect x={2} y={2} width={101} height={64} rx={1} />
          <line x1={52.5} y1={2} x2={52.5} y2={66} />
          <circle cx={52.5} cy={34} r={9} />
          <rect x={2} y={18} width={15} height={32} />
          <rect x={88} y={18} width={15} height={32} />
        </g>
        <circle cx={34} cy={26} r={3.6} fill="#4cd7f6" />
        <rect x={67} y={36} width={7.2} height={7.2} rx={1.4} fill="#ceb9ff" />
        <circle cx={46} cy={30} r={1.4} fill="#fff" />
        <g fontWeight={700} fontSize={3}>
          <rect x={24} y={11} width={22} height={6} rx={3} fill="#4ade80" />
          <text x={35} y={15.2} textAnchor="middle" fill="#070e1d">
            {t("evt_goal").toUpperCase()}
          </text>
          <rect x={62} y={49} width={24} height={6} rx={3} fill="#4cd7f6" />
          <text x={74} y={53.2} textAnchor="middle" fill="#070e1d">
            {t("evt_pass").toUpperCase()}
          </text>
        </g>
      </svg>
      <span className="flex items-center gap-2 rounded-xl bg-low px-3 py-2 text-sm text-ink-2">
        <Sparkles size={16} className="text-volt" />
        {t("obPreviewNote")}
      </span>
    </div>
  );
}

function ModeCards() {
  const mode = useProfile((s) => s.profile.mode);
  const update = useProfile((s) => s.update);
  const { t } = useT();
  return (
    <fieldset>
      <legend className="mb-1 text-2xl font-bold">{t("obModeTitle")}</legend>
      <p className="mb-4 text-ink-2">{t("obModeHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {MODES.map((m) => {
          const Icon = MODE_ICONS[m];
          return (
            <label key={m} className="relative block cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => update({ mode: m })}
                className="peer visually-hidden"
              />
              <span className="card flex h-full flex-col gap-3 p-5 transition-colors peer-checked:border-volt-deep peer-checked:bg-high peer-focus-visible:outline-2 peer-focus-visible:outline-cyan">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={`flex size-11 items-center justify-center rounded-xl ${
                      mode === m
                        ? "bg-volt-deep text-lowest"
                        : "bg-high text-volt"
                    }`}
                  >
                    <Icon size={22} />
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {m === RECOMMENDED && (
                      <span className="pill label-caps text-cyan">
                        {t("obRecommended")}
                      </span>
                    )}
                    {mode === m && (
                      <span className="pill label-caps text-volt">
                        {t("obSelected")}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-lg font-semibold">
                  {t(MODE_LABELS[m])}
                </span>
                <span className="text-sm text-ink-2">
                  {t(MODE_DESCRIPTIONS[m])}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Favourite club and players and a focus metric: these need a match's line-ups, so they show once one is on. */
function MorePreferences({ meta }: { meta: MatchMetadata }) {
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const { t } = useT();
  const toggle = (id: string) =>
    update({
      favourite_player_ids: profile.favourite_player_ids.includes(id)
        ? profile.favourite_player_ids.filter((x) => x !== id)
        : [...profile.favourite_player_ids, id],
    });
  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-lg font-semibold">
        {t("obMoreTitle")}
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          {t("profileClub")}
          <select
            name="club"
            value={profile.favourite_club_id ?? ""}
            onChange={(e) =>
              update({ favourite_club_id: e.target.value || null })
            }
            className="field text-ink"
          >
            <option value="">{t("profileClubNone")}</option>
            {[meta.home, meta.away].map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          {t("focusMetric")}
          <select
            name="metric"
            value={profile.focus_metric ?? ""}
            onChange={(e) => update({ focus_metric: e.target.value || null })}
            className="field text-ink"
          >
            <option value="">{t("profileClubNone")}</option>
            {FOCUS_METRICS.map((m) => (
              <option key={m} value={m}>
                {t(playerStatLabel(m))}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm text-ink-2">
            {t("profilePlayers")}
          </legend>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl bg-low p-3 sm:grid-cols-2">
            {[meta.home, meta.away].flatMap((team) =>
              [...team.starters, ...team.bench].map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={profile.favourite_player_ids.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-[#4ade80]"
                  />
                  <span className="font-mono text-ink-2">{p.shirt}</span>{" "}
                  {p.name}
                  <span className="label-caps text-ink-2">
                    {team.short_name}
                  </span>
                </label>
              )),
            )}
          </div>
        </fieldset>
      </div>
    </details>
  );
}

/**
 * Set-up (step 1 of 2, and the profile page later): the viewer's name, how they watch, their
 * language, and the match to play. Choices apply at once and stay in this browser.
 */
export function Onboarding() {
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const setScreen = useProfile((s) => s.setScreen);
  const connection = useLive((s) => s.connection);
  const matchId = useLive((s) => s.matchId);
  const meta = useLive((s) => s.metadata);
  const { t } = useT();
  const [seed, setSeed] = useState(String(DEFAULT_SEED));
  const [script, setScript] = useState("demo");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(18);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const watching = matchId !== null && meta !== null;
  const joining =
    matchId !== null && meta === null && connection === "connecting";

  const begin = async (pickSquad: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await startMatch({
        seed: Number(seed),
        script: script || null,
        speed,
        paused: pickSquad,
      });
      setScreen(pickSquad ? "squad" : "live");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void begin(true);
  };

  return (
    <>
      <PageBar
        step={1}
        title={t("obSetupTitle")}
        actions={
          watching && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setScreen("live")}
            >
              {t("obBackToMatch")}
            </button>
          )
        }
      />
      <main
        id="main"
        className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-8 lg:px-6"
      >
        <section className="grid items-center gap-8 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-5">
            <span className="flex flex-wrap gap-2">
              <span className="pill label-caps text-volt">
                {t("obStepTag")}
              </span>
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              {t("obHeroLead")}{" "}
              <span className="text-volt underline decoration-wavy decoration-2 underline-offset-8">
                {t("obHeroAccent")}
              </span>
            </h1>
            <p className="max-w-2xl text-lg text-ink-2">{t("obHeroSub")}</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
              <li className="flex items-center gap-2">
                <ShieldCheck
                  size={18}
                  className="text-volt"
                  aria-hidden="true"
                />
                {t("obPerkNumbers")}
              </li>
              <li className="flex items-center gap-2">
                <Hand size={18} className="text-cyan" aria-hidden="true" />
                {t("obPerkLanguages")}
              </li>
            </ul>
          </div>
          <PreviewPitch />
        </section>

        {connection === "missing" && (
          <p
            role="alert"
            className="rounded-xl bg-amber/15 px-4 py-3 text-amber"
          >
            {t("startMissing")}
          </p>
        )}

        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("obNameTitle")}</h2>
            <p className="text-sm text-ink-2">{t("obNameHelp")}</p>
          </div>
          <label className="flex w-full max-w-sm items-center gap-3 rounded-xl bg-lowest p-2 pl-3 sm:w-auto">
            <span className="visually-hidden">{t("obNameTitle")}</span>
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-volt-deep font-bold text-lowest"
            >
              {profile.display_name.slice(0, 1).toUpperCase()}
            </span>
            <input
              name="display-name"
              value={profile.display_name}
              maxLength={40}
              onChange={(e) => update({ display_name: e.target.value })}
              onBlur={() =>
                update({ display_name: profile.display_name.trim() || "Fan" })
              }
              className="min-w-0 flex-1 bg-transparent text-lg outline-none"
            />
          </label>
        </section>

        <ModeCards />

        {watching && <MorePreferences meta={meta} />}

        <form onSubmit={submit} className="card flex flex-col gap-5 p-5">
          <h2 className="text-lg font-semibold">
            {t(watching ? "newMatch" : "obMatchTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              {t("startSeed")}
              <input
                name="seed"
                type="number"
                min={0}
                required
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="field font-mono text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              {t("startScript")}
              <select
                name="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="field text-ink"
              >
                <option value="demo">{t("startScriptDemo")}</option>
                <option value="">{t("startScriptNone")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              {t("startSpeed")}
              <select
                name="speed"
                value={speed}
                onChange={(e) =>
                  setSpeed(Number(e.target.value) as typeof speed)
                }
                className="field font-mono text-ink"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {t("speedOption", { speed: s })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              {t("languageLabel")}
              <select
                name="language"
                value={profile.language}
                onChange={(e) =>
                  update({
                    language: e.target.value as typeof profile.language,
                  })
                }
                className="field text-ink"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LANGUAGE_NAMES[l]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {failed && (
            <p
              role="alert"
              className="rounded-xl bg-coral/15 px-4 py-3 text-coral"
            >
              {t("startError")}
            </p>
          )}
          {joining && <p role="status">{t("startJoining")}</p>}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stroke pt-5">
            <span className="flex items-center gap-3 text-sm text-ink-2">
              <ShieldCheck size={20} className="text-volt" aria-hidden="true" />
              {t("syntheticNote")}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void begin(false)}
                className="btn-ghost px-4 py-2.5 text-base"
              >
                <Play size={18} className="text-cyan" aria-hidden="true" />
                {t("obWatch")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary px-6 py-3 text-lg"
              >
                {t("obPickSquad")}
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </span>
          </div>
        </form>
      </main>
    </>
  );
}
