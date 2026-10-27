import {
  Check,
  Crown,
  Medal,
  Plus,
  Search,
  UserMinus,
  WandSparkles,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { control, reconnect } from "../connection.ts";
import type {
  FantasySquad,
  MatchMetadata,
  PlayerInfo,
  TeamSheet,
} from "../contracts.gen.ts";
import { formatNumber } from "../i18n/index.ts";
import { pointsByPlayer } from "../points.ts";
import { autoSquad, SQUAD_SIZE, squadIsValid, useProfile } from "../profile.ts";
import { rosterOf, type Side } from "../roster.ts";
import { useLive } from "../store.ts";
import { useT } from "../useT.ts";
import { PageBar } from "./Onboarding.tsx";
import { Footer } from "./Shell.tsx";

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
type Position = (typeof POSITIONS)[number];

function shortName(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1
    ? `${parts[0]![0]}. ${parts.slice(1).join(" ")}`
    : name;
}

function Shirt({
  player,
  team,
  size = "size-10",
}: {
  player: PlayerInfo;
  team: TeamSheet;
  size?: string;
}) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full font-mono text-base font-bold text-lowest`}
      style={{
        backgroundColor: team.primary_colour,
        color: "#ffffff",
        boxShadow: "inset 0 0 0 2px rgb(255 255 255 / 0.25)",
      }}
    >
      {player.shirt}
    </span>
  );
}

function RoleBadge({ role }: { role: "C" | "V" | null }) {
  const { t } = useT();
  if (!role) return null;
  return (
    <span
      className="label-caps rounded-full bg-violet px-1.5 py-0.5 text-[#23005c]"
      aria-label={role === "C" ? t("profileCaptain") : t("profileVice")}
    >
      {role}
    </span>
  );
}

/** A starter on the formation pitch; pressing it offers captain, vice-captain, or removal. */
function PitchToken({
  player,
  team,
  role,
  points,
  open,
  onToggle,
  onCaptain,
  onVice,
  onRemove,
}: {
  player: PlayerInfo;
  team: TeamSheet;
  role: "C" | "V" | null;
  points: number | null;
  open: boolean;
  onToggle: () => void;
  onCaptain: () => void;
  onVice: () => void;
  onRemove: () => void;
}) {
  const { language, t } = useT();
  const close = (e: KeyboardEvent) => {
    if (e.key === "Escape") onToggle();
  };
  return (
    <div className="relative flex flex-col items-center gap-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl p-1 hover:bg-white/5"
      >
        <span className="relative">
          <Shirt player={player} team={team} />
          {role && (
            <span className="absolute -right-2 -top-2">
              <RoleBadge role={role} />
            </span>
          )}
        </span>
        <span className="rounded-md bg-lowest/80 px-1.5 text-xs font-semibold">
          {shortName(player.name)}
        </span>
        {points !== null && (
          <span className="font-mono text-xs text-cyan">
            {t("fantasyPlayerTotal", {
              points: formatNumber(language, points),
            })}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={close}
          className="absolute top-full z-20 mt-1 w-56 rounded-xl border border-white/15 bg-highest/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          <p className="px-2 pb-1 text-sm font-semibold">
            {player.name}{" "}
            <span className="text-ink-2">({player.position})</span>
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={onCaptain}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-volt hover:bg-white/10"
          >
            <Crown size={16} aria-hidden="true" />
            {t("sqMakeCaptain")}
            {role === "C" && (
              <Check size={16} className="ml-auto" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onVice}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10"
          >
            <Medal size={16} aria-hidden="true" />
            {t("sqMakeVice")}
            {role === "V" && (
              <Check size={16} className="ml-auto" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onRemove}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-coral hover:bg-white/10"
          >
            <UserMinus size={16} aria-hidden="true" />
            {t("sqRemove")}
          </button>
        </div>
      )}
    </div>
  );
}

function SquadBuilder({ meta }: { meta: MatchMetadata }) {
  const profile = useProfile((s) => s.profile);
  const update = useProfile((s) => s.update);
  const setScreen = useProfile((s) => s.setScreen);
  const state = useLive((s) => s.state);
  const ledger = useLive((s) => s.ledger);
  const { t } = useT();
  const roster = rosterOf(meta);
  const points = useMemo(() => pointsByPlayer(ledger), [ledger]);
  const [picked, setPicked] = useState<string[]>(
    profile.fantasy_squad?.players.slice() ?? [],
  );
  const [captain, setCaptain] = useState(
    profile.fantasy_squad?.captain_id ?? "",
  );
  const [vice, setVice] = useState(
    profile.fantasy_squad?.vice_captain_id ?? "",
  );
  const [position, setPosition] = useState<Position | "all">("all");
  const [club, setClub] = useState<Side | "both">("both");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);

  const everyone = [...roster.values()];
  const full = picked.length >= SQUAD_SIZE;
  const valid = squadIsValid(picked, captain || null, vice || null);
  const kickoff =
    state?.status === "paused" &&
    state.minute === 0 &&
    state.last_event_id === 0;
  const needle = query.trim().toLowerCase();
  const shown = everyone.filter(
    ({ info, side }) =>
      (position === "all" || info.position === position) &&
      (club === "both" || side === club) &&
      (!needle ||
        info.name.toLowerCase().includes(needle) ||
        info.position.toLowerCase() === needle ||
        String(info.shirt) === needle),
  );
  const role = (id: string) =>
    id === captain ? "C" : id === vice ? "V" : null;
  const toggle = (id: string) => {
    if (picked.includes(id)) {
      setPicked(picked.filter((x) => x !== id));
      if (captain === id) setCaptain("");
      if (vice === id) setVice("");
    } else if (!full) {
      setPicked([...picked, id]);
    }
  };
  const makeCaptain = (id: string) => {
    if (vice === id) setVice(captain);
    setCaptain(id);
    setMenu(null);
  };
  const makeVice = (id: string) => {
    if (captain === id) setCaptain(vice);
    setVice(id);
    setMenu(null);
  };

  const save = async () => {
    const squad: FantasySquad | null = picked.length
      ? {
          players: picked as FantasySquad["players"],
          captain_id: captain,
          vice_captain_id: vice,
        }
      : null;
    const changed =
      JSON.stringify(squad) !== JSON.stringify(profile.fantasy_squad);
    update({ fantasy_squad: squad });
    if (changed) reconnect();
    if (kickoff) await control({ paused: false });
    setScreen("live");
  };

  const count = (p: Position) =>
    everyone.filter((x) => x.info.position === p).length;
  const chip = (active: boolean) =>
    `cursor-pointer rounded-full px-3 py-1 text-sm ${
      active
        ? "bg-volt-deep font-semibold text-on-volt"
        : "bg-high text-ink-2 hover:text-ink"
    }`;

  return (
    <main
      id="main"
      className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 lg:px-6"
    >
      <div className="flex flex-col gap-2">
        <span className="pill label-caps self-start text-volt">
          {t("sqStepTag")}
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">
          {t("sqTitle")}
        </h1>
        <p className="max-w-3xl text-ink-2">
          {t("sqIntro", { home: meta.home.name, away: meta.away.name })}
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[7fr_5fr]">
        <section className="flex flex-col gap-4" aria-label={t("sqPlayers")}>
          <div className="card flex flex-col gap-3 p-4">
            <div
              role="group"
              aria-label={t("sqPositionFilter")}
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                aria-pressed={position === "all"}
                onClick={() => setPosition("all")}
                className={chip(position === "all")}
              >
                {t("sqAll", { count: everyone.length })}
              </button>
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={position === p}
                  onClick={() => setPosition(p)}
                  className={chip(position === p)}
                >
                  {p} ({count(p)})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label={t("sqClubFilter")}
                className="flex gap-1 rounded-xl bg-low p-1"
              >
                {(["both", "home", "away"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={club === c}
                    onClick={() => setClub(c)}
                    className={`cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold ${
                      club === c
                        ? "bg-high text-ink"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {c === "both" ? t("sqBothClubs") : meta[c].short_name}
                  </button>
                ))}
              </div>
              <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-lowest px-3 py-2">
                <Search size={16} className="text-ink-2" aria-hidden="true" />
                <span className="visually-hidden">{t("sqSearch")}</span>
                <input
                  name="search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("sqSearch")}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2"
                />
              </label>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map(({ info, team }) => {
              const inSquad = picked.includes(info.id);
              return (
                <li
                  key={info.id}
                  className={`card flex items-center gap-3 p-3 ${inSquad ? "border-volt-deep/50" : ""}`}
                >
                  <Shirt player={info} team={team} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">
                        {info.name}
                      </span>
                      <RoleBadge role={role(info.id)} />
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-2">
                      <span className="label-caps rounded bg-highest px-1.5 py-0.5">
                        {info.position}
                      </span>
                      {team.name}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-pressed={inSquad}
                    disabled={!inSquad && full}
                    onClick={() => toggle(info.id)}
                    title={!inSquad && full ? t("sqFull") : undefined}
                    className={
                      inSquad
                        ? "pill label-caps shrink-0 cursor-pointer py-1 text-volt"
                        : "btn-ghost shrink-0 px-2.5 py-1 text-sm"
                    }
                  >
                    {inSquad ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Plus size={14} aria-hidden="true" />
                    )}
                    {inSquad ? t("sqInSquad") : t("sqAdd")}
                    <span className="visually-hidden">: {info.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section
          className="flex flex-col gap-4 xl:sticky xl:top-6"
          aria-label={t("sqYourXI")}
        >
          <div className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span
                className="flex items-center gap-2 text-lg font-bold"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${full ? "bg-volt" : "bg-amber"}`}
                />
                {t("sqSelected", { count: picked.length })}
              </span>
              {valid && (
                <span className="pill label-caps text-volt">
                  {t("sqComplete")}
                </span>
              )}
            </div>
            <p className="font-mono text-sm text-cyan">
              {POSITIONS.map(
                (p) =>
                  `${picked.filter((id) => roster.get(id)?.info.position === p).length} ${p}`,
              ).join(" · ")}
            </p>
            <p className="text-sm text-ink-2">{t("sqCaptainNote")}</p>
          </div>
          <div
            className="card relative flex flex-col justify-between gap-6 overflow-visible p-4"
            style={{
              background:
                "repeating-linear-gradient(180deg, #14532d 0 56px, #166534 56px 112px)",
              minHeight: "30rem",
            }}
          >
            {(["FWD", "MID", "DEF", "GK"] as const).map((p) => {
              const line = picked.filter(
                (id) => roster.get(id)?.info.position === p,
              );
              return (
                <div
                  key={p}
                  className="flex flex-wrap items-start justify-around gap-2"
                >
                  {line.length === 0 ? (
                    <span className="label-caps text-white/40">{p}</span>
                  ) : (
                    line.map((id) => {
                      const { info, team } = roster.get(id)!;
                      return (
                        <PitchToken
                          key={id}
                          player={info}
                          team={team}
                          role={role(id)}
                          points={
                            state && state.last_event_id > 0
                              ? (points.get(id)?.total ?? 0)
                              : null
                          }
                          open={menu === id}
                          onToggle={() => setMenu(menu === id ? null : id)}
                          onCaptain={() => makeCaptain(id)}
                          onVice={() => makeVice(id)}
                          onRemove={() => {
                            toggle(id);
                            setMenu(null);
                          }}
                        />
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
          <div className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-ghost px-4 py-3"
                onClick={() => {
                  const club =
                    profile.favourite_club_id === meta.away.id
                      ? meta.away
                      : meta.home;
                  const auto = autoSquad(club);
                  setPicked(auto.players);
                  setCaptain(auto.captain);
                  setVice(auto.vice);
                }}
              >
                <WandSparkles
                  size={18}
                  className="text-cyan"
                  aria-hidden="true"
                />
                {t("profileAutoPick")}
              </button>
              <button
                type="button"
                disabled={!valid && picked.length > 0}
                onClick={() => void save()}
                className="btn-primary flex-1 px-4 py-3 text-lg"
              >
                {kickoff ? t("sqKickOff") : t("sqSave")}
              </button>
            </div>
            {!valid && picked.length > 0 && (
              <p role="alert" className="text-sm text-amber">
                {t("profileSquadInvalid")}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setPicked([]);
                setCaptain("");
                setVice("");
              }}
              className="self-start text-sm text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              {t("profileClearSquad")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Squad selection (step 2 of 2): pick 11 from both line-ups, then a captain and a vice-captain. */
export function SquadPage() {
  const meta = useLive((s) => s.metadata);
  const setScreen = useProfile((s) => s.setScreen);
  const { t } = useT();
  return (
    <>
      <PageBar
        step={2}
        title={t("sqStepTitle")}
        actions={
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setScreen("live")}
          >
            {t("obBackToMatch")}
          </button>
        }
      />
      {meta ? (
        <SquadBuilder meta={meta} />
      ) : (
        <p role="status" className="p-8">
          {t("startJoining")}
        </p>
      )}
      <Footer />
    </>
  );
}
