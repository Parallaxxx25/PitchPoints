import { Shield, Star } from "lucide-react";
import { useMemo } from "react";
import { startReplay } from "../connection.ts";
import type { PlayerInfo, PlayerStats } from "../contracts.gen.ts";
import { formatNumber, formatPercent } from "../i18n/index.ts";
import { type PlayerPoints, pointsByPlayer } from "../points.ts";
import { useProfile } from "../profile.ts";
import { STAT_SOURCES, statSourceIds } from "../replay.ts";
import type { Side } from "../roster.ts";
import { useLive } from "../store.ts";
import { formatStat, playerSummary, TEAM_STAT_ROWS } from "../text.ts";
import { useT } from "../useT.ts";

/** What the right-hand column of each player row shows: fantasy points or minutes played. */
export type RailShows = "points" | "minutes";

const HEADLINE_FIELDS = new Set([
  "possession",
  "shots",
  "shots_on_target",
  "xg",
]);

function StatRows({ side, full }: { side: Side; full: boolean }) {
  const stats = useLive((s) => s.stats);
  const meta = useLive((s) => s.metadata)!;
  const { language, t } = useT();
  const team = meta[side];
  const rows = TEAM_STAT_ROWS.filter(
    (r) => full || HEADLINE_FIELDS.has(r.field),
  );
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl bg-low p-3 text-sm">
      {rows.map((row) => {
        const raw = stats?.[side][row.field];
        const value = formatStat(
          language,
          row.kind,
          typeof raw === "number" ? raw : null,
        );
        const label = t(row.label);
        return (
          <div key={row.field} className="contents">
            <dt className="text-ink-2">{label}</dt>
            <dd className="text-right font-mono font-semibold">
              {row.field in STAT_SOURCES ? (
                <button
                  type="button"
                  className="cursor-pointer rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-high"
                  aria-label={`${t("statSource", { stat: label })}: ${value}`}
                  onClick={() => {
                    const events = useLive.getState().events;
                    void startReplay(
                      label,
                      statSourceIds(events, row.field, team.id),
                    );
                  }}
                >
                  {value}
                </button>
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PlayerRow({
  player,
  colour,
  line,
  points,
  shows,
  muted,
}: {
  player: PlayerInfo;
  colour: string;
  line: PlayerStats | undefined;
  points: PlayerPoints | undefined;
  shows: RailShows;
  muted?: boolean;
}) {
  const squad = useProfile((s) => s.profile.fantasy_squad);
  const selected = useProfile((s) => s.selectedPlayerId === player.id);
  const selectPlayer = useProfile((s) => s.selectPlayer);
  const { language, t } = useT();
  const owned = squad?.players.includes(player.id) ?? false;
  const role =
    squad?.captain_id === player.id
      ? "C"
      : squad?.vice_captain_id === player.id
        ? "V"
        : null;
  const total = points?.total ?? 0;
  const provisional = points?.provisional ?? 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => selectPlayer(selected ? null : player.id)}
        aria-pressed={selected}
        className={`block w-full cursor-pointer rounded-xl p-2 text-left transition-colors ${
          owned
            ? "bg-high"
            : muted
              ? "bg-lowest hover:bg-high"
              : "bg-low hover:bg-high"
        } ${selected ? "ring-2 ring-cyan" : ""}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
              style={{
                boxShadow: `inset 0 0 0 2px ${colour}`,
                color: "var(--color-ink)",
              }}
            >
              {player.shirt}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span
                  className={`truncate ${owned ? "font-bold" : "font-semibold"}`}
                >
                  {player.name}
                </span>
                {owned && (
                  <Star
                    size={13}
                    className="shrink-0 fill-volt text-volt"
                    aria-label={t("inYourSquad")}
                  />
                )}
                {role && (
                  <span
                    className="label-caps shrink-0 rounded bg-violet px-1 text-[#23005c]"
                    aria-label={
                      role === "C" ? t("profileCaptain") : t("profileVice")
                    }
                  >
                    {role}
                  </span>
                )}
                <span className="label-caps shrink-0 rounded bg-highest px-1.5 py-0.5 text-ink-2">
                  {player.position}
                </span>
              </span>
              <span className="block truncate text-xs text-ink-2">
                {playerSummary(line, player.position, language)}
              </span>
            </span>
          </span>
          <span
            className={`shrink-0 font-mono text-sm font-bold ${total > 0 ? "text-volt" : "text-ink"}`}
          >
            {shows === "points"
              ? t("fantasyPlayerTotal", {
                  points: formatNumber(language, total),
                })
              : line
                ? `${line.minutes}′`
                : "–"}
          </span>
        </span>
        {shows === "points" && provisional !== 0 && (
          <span className="mt-1.5 flex items-center justify-between rounded-lg bg-lowest px-2 py-0.5">
            <span className="label-caps text-volt/80">
              {t("fantasyProvisional")}
            </span>
            <span className="font-mono text-xs font-semibold text-volt">
              {provisional > 0 ? "+" : ""}
              {formatNumber(language, provisional)}
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * A team rail (Stitch's left and right columns): the team, its stats when asked, and a row per
 * player with fantasy points or minutes. Pressing a player opens their card.
 */
export function TeamPanel({
  side,
  shows,
  stats = "none",
}: {
  side: Side;
  shows: RailShows;
  /** Team stats above the players: none, a few headline ones, or all of them. */
  stats?: "none" | "headline" | "full";
}) {
  const meta = useLive((s) => s.metadata);
  const ledger = useLive((s) => s.ledger);
  const live = useLive((s) => s.stats);
  const { language, t } = useT();
  const points = useMemo(() => pointsByPlayer(ledger), [ledger]);
  if (!meta) return null;
  const team = meta[side];
  const lines = new Map(live?.players.map((p) => [p.player_id, p]));
  const teamPoints = [...team.starters, ...team.bench].reduce(
    (sum, p) => sum + (points.get(p.id)?.total ?? 0),
    0,
  );
  const row = (p: PlayerInfo, muted?: boolean) => (
    <PlayerRow
      key={p.id}
      player={p}
      colour={team.primary_colour}
      line={lines.get(p.id)}
      points={points.get(p.id)}
      shows={shows}
      muted={muted}
    />
  );
  return (
    <section aria-label={team.name} className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `${team.primary_colour}26`,
              color: team.primary_colour,
            }}
          >
            <Shield size={18} />
          </span>
          <span className="min-w-0">
            <h2 className="truncate text-base font-semibold">{team.name}</h2>
            <span className="text-xs text-ink-2">
              {t(side === "home" ? "railHome" : "railAway", {
                formation: team.formation,
              })}
            </span>
          </span>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-lg font-bold text-cyan">
            {shows === "points"
              ? formatNumber(language, teamPoints)
              : live
                ? formatPercent(language, live[side].possession)
                : "–"}
          </span>
          <span className="label-caps text-ink-2">
            {shows === "points" ? t("railTeamPoints") : t("statPossession")}
          </span>
        </span>
      </div>
      {stats !== "none" && <StatRows side={side} full={stats === "full"} />}
      <div className="flex items-center justify-between px-1 label-caps text-ink-2">
        <span>{t("railStarting", { count: team.starters.length })}</span>
        <span>{shows === "points" ? t("railPoints") : t("playerMinutes")}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {team.starters.map((p) => row(p))}
      </ul>
      {team.bench.length > 0 && (
        <>
          <div className="px-1 label-caps text-ink-2">
            {t("railBench", { count: team.bench.length })}
          </div>
          <ul className="flex flex-col gap-1.5">
            {team.bench.map((p) => row(p, !lines.has(p.id)))}
          </ul>
        </>
      )}
    </section>
  );
}
