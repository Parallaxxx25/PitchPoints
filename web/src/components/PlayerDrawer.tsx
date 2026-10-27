import { History, Play, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { startReplay } from "../connection.ts";
import { PITCH_LENGTH, PITCH_WIDTH } from "../coords.ts";
import { formatNumber } from "../i18n/index.ts";
import { playerEntries, pointsByPlayer } from "../points.ts";
import { useProfile } from "../profile.ts";
import { rosterOf } from "../roster.ts";
import { HEAT_COLS, HEAT_ROWS, heatOf, useLive } from "../store.ts";
import {
  describeMoment,
  formatStat,
  PLAYER_STAT_ROWS,
  playerStatLabel,
  ruleLabel,
} from "../text.ts";
import { useT } from "../useT.ts";

const HEAT_REFRESH_MS = 1000;
const KEY_STATS = ["minutes", "goals", "assists", "distance_km"] as const;

function Heatmap({ playerId, label }: { playerId: string; label: string }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const id = setInterval(() => refresh((n) => n + 1), HEAT_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const grid = heatOf(playerId);
  const max = grid ? Math.max(1, ...grid) : 1;
  const w = PITCH_LENGTH / HEAT_COLS;
  const h = PITCH_WIDTH / HEAT_ROWS;
  return (
    <svg
      viewBox={`0 0 ${PITCH_LENGTH} ${PITCH_WIDTH}`}
      role="img"
      aria-label={label}
      className="h-auto w-full rounded-xl bg-pitch"
    >
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth={0.3}
        opacity={0.5}
        aria-hidden="true"
      >
        <rect x={0} y={0} width={PITCH_LENGTH} height={PITCH_WIDTH} />
        <line
          x1={PITCH_LENGTH / 2}
          y1={0}
          x2={PITCH_LENGTH / 2}
          y2={PITCH_WIDTH}
        />
        <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r={9.15} />
      </g>
      <g aria-hidden="true">
        {grid &&
          Array.from(grid, (count, i) =>
            count > 0 ? (
              <rect
                key={i}
                x={(i % HEAT_COLS) * w}
                y={Math.floor(i / HEAT_COLS) * h}
                width={w}
                height={h}
                fill="#6bfb9a"
                opacity={0.12 + 0.75 * Math.sqrt(count / max)}
              />
            ) : null,
          )}
      </g>
    </svg>
  );
}

/** Choose the player Player focus mode follows. */
function PlayerPicker({ chosen }: { chosen: string }) {
  const meta = useLive((s) => s.metadata)!;
  const favourites = useProfile((s) => s.profile.favourite_player_ids);
  const selectPlayer = useProfile((s) => s.selectPlayer);
  const { t } = useT();
  const roster = rosterOf(meta);
  const listed = favourites.filter((id) => roster.has(id));
  const option = (id: string) => {
    const info = roster.get(id)!.info;
    return (
      <option key={id} value={id}>
        {info.shirt} {info.name}
      </option>
    );
  };
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
      {t("focusPick")}
      <select
        name="focus-player"
        value={chosen}
        onChange={(e) => selectPlayer(e.target.value)}
        className="field py-1.5 text-ink"
      >
        {listed.length > 0 && (
          <optgroup label={t("focusFavourites")}>{listed.map(option)}</optgroup>
        )}
        {[meta.home, meta.away].map((team) => (
          <optgroup key={team.id} label={team.name}>
            {[...team.starters, ...team.bench].map((p) => option(p.id))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/**
 * A player's card (Stitch's ledger drawer): match points with the captain flag, key stats, tags,
 * a heatmap, and every ledger entry, each of which replays the events behind it.
 */
export function PlayerDrawer({
  playerId,
  pinned = false,
}: {
  playerId: string;
  pinned?: boolean;
}) {
  const meta = useLive((s) => s.metadata);
  const stats = useLive((s) => s.stats);
  const ledger = useLive((s) => s.ledger);
  const moments = useLive((s) => s.moments);
  const replayLabel = useLive((s) => s.replay?.label);
  const squad = useProfile((s) => s.profile.fantasy_squad);
  const metric = useProfile((s) => s.profile.focus_metric);
  const selectPlayer = useProfile((s) => s.selectPlayer);
  const { language, t } = useT();
  const points = useMemo(() => pointsByPlayer(ledger), [ledger]);
  const entry = meta ? rosterOf(meta).get(playerId) : undefined;
  if (!meta || !entry) return null;
  const { info, team } = entry;
  const line = stats?.players.find((p) => p.player_id === playerId);
  const total = points.get(playerId)?.total ?? 0;
  const captain = squad?.captain_id === playerId;
  const owned = squad?.players.includes(playerId) ?? false;
  const entries = playerEntries(ledger, playerId);
  const tags = moments.filter(
    (m) => m.type === "milestone" && m.player_ids.includes(playerId),
  );
  const fields =
    metric && !KEY_STATS.includes(metric as never)
      ? [...KEY_STATS.slice(0, 3), metric]
      : KEY_STATS;
  const stat = (field: string) => {
    const row = PLAYER_STAT_ROWS.find((r) => r.field === field)!;
    const raw = line?.[row.field];
    return formatStat(language, row.kind, typeof raw === "number" ? raw : null);
  };
  return (
    <section
      aria-labelledby="drawer-title"
      className="card flex flex-col gap-4 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-base font-bold"
            style={{ boxShadow: `inset 0 0 0 2px ${team.primary_colour}` }}
          >
            {info.shirt}
          </span>
          <span className="min-w-0">
            <h2
              id="drawer-title"
              className="flex items-center gap-1.5 truncate text-lg font-bold"
            >
              {info.name}
              {owned && (
                <Star
                  size={15}
                  className="shrink-0 fill-volt text-volt"
                  aria-label={t("inYourSquad")}
                />
              )}
            </h2>
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <span className="label-caps rounded bg-highest px-1.5 py-0.5">
                {info.position}
              </span>
              {team.name}
            </span>
          </span>
        </div>
        {!pinned && (
          <button
            type="button"
            onClick={() => selectPlayer(null)}
            aria-label={t("profileClose")}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 hover:bg-high hover:text-ink"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {pinned && <PlayerPicker chosen={playerId} />}
      <div className="pod flex items-center justify-between gap-3 p-4">
        <span>
          <span className="font-mono text-3xl font-bold text-volt">
            {formatNumber(language, total)}
          </span>{" "}
          <span className="label-caps text-ink-2">{t("ptsUnit")}</span>
          {captain && (
            <span className="pill label-caps ml-2 text-violet">
              {t("captainDouble")}
            </span>
          )}
        </span>
        <span className="label-caps text-right text-ink-2">
          {t("drawerMatchPoints")}
        </span>
      </div>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {fields.map((field) => (
          <div key={field} className="rounded-xl bg-low px-1 py-2">
            <dt className="label-caps truncate text-ink-2">
              {t(playerStatLabel(field))}
            </dt>
            <dd className="font-mono font-bold">{stat(field)}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <div>
          <h3 className="mb-1 label-caps text-ink-2">{t("focusTags")}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {tags.map((m) => (
              <li key={m.id}>
                <span className="font-mono text-volt">{m.minute}&prime;</span>{" "}
                {describeMoment(m, { language, meta }).text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Heatmap
        playerId={playerId}
        label={t("focusHeatmap", { player: info.name })}
      />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 label-caps text-ink-2">
            <History size={14} aria-hidden="true" />
            {t("fantasyLedger")}
          </h3>
          <span className="label-caps text-cyan">{t("drawerNewest")}</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-2">{t("fantasyLedgerEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => {
              const rule = ruleLabel(language, e.rule_id);
              const label = `${info.name}: ${rule}`;
              const replaying = replayLabel === label;
              const tone = e.delta < 0 ? "text-coral" : "text-volt";
              return (
                <li
                  key={e.id}
                  className={`rounded-xl p-3 ${
                    replaying
                      ? "glow-volt border-2 border-volt-deep bg-high"
                      : e.provisional
                        ? "border border-dashed border-ink-2/40 bg-low"
                        : "bg-low"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm text-ink-2">
                        {e.minute}&prime;
                      </span>
                      {e.provisional && (
                        <span className="pill label-caps text-amber">
                          {t("fantasyProvisional")}
                        </span>
                      )}
                    </span>
                    <span
                      className={`pill font-mono text-sm font-bold ${tone}`}
                    >
                      {e.delta > 0 ? "+" : ""}
                      {formatNumber(language, e.delta)} {t("ptsUnit")}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold">{rule}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-2">
                      {e.provisional ? t("finalAtFullTime") : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void startReplay(label, e.source_event_ids)
                      }
                      className="btn-ghost shrink-0 px-2 py-1 text-xs"
                    >
                      <Play size={12} aria-hidden="true" />
                      {t("replayAt", { minute: e.minute })}
                      <span className="visually-hidden">
                        {" "}
                        — {t("replayLedger")}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-ink-2">{t("fantasyBonusNote")}</p>
    </section>
  );
}
