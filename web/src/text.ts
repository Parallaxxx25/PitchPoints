import type {
  KeyMoment,
  MatchEvent,
  MatchMetadata,
  OverlayCue,
  PlayerStats,
  TeamStats,
} from "./contracts.gen.ts";
import {
  formatNumber,
  formatPercent,
  type Language,
  type StringKey,
  translate,
  type Vars,
} from "./i18n/index.ts";
import type { Mode } from "./profile.ts";
import { playerName, teamOf } from "./roster.ts";

/** The name of each viewing mode. */
export const MODE_LABELS: Record<Mode, StringKey> = {
  analyst: "modeAnalyst",
  casual: "modeCasual",
  fantasy: "modeFantasy",
  player_focus: "modePlayerFocus",
  club: "modeClub",
};

/** What each viewing mode shows, for choosing one. */
export const MODE_DESCRIPTIONS: Record<Mode, StringKey> = {
  analyst: "modeAnalystDesc",
  casual: "modeCasualDesc",
  fantasy: "modeFantasyDesc",
  player_focus: "modePlayerFocusDesc",
  club: "modeClubDesc",
};

const SUMMARY_FIELDS: Record<string, (keyof PlayerStats & string)[]> = {
  GK: ["passes", "pass_accuracy"],
  DEF: ["defensive_actions", "pressures"],
  MID: ["passes", "pass_accuracy"],
  FWD: ["shots", "xg"],
};

/** One line about a player's match for the team rails: goals and assists first, then their position's main stats. */
export function playerSummary(
  line: PlayerStats | undefined,
  position: string,
  language: Language,
): string {
  if (!line) return translate(language, "playerNotYetOn");
  const scored = (["goals", "assists"] as const).filter((f) => line[f] > 0);
  const fields = scored.length
    ? scored
    : (SUMMARY_FIELDS[position] ?? ["passes"]);
  return fields
    .map((field) => {
      const row = PLAYER_STAT_ROWS.find((r) => r.field === field)!;
      return `${translate(language, row.label)} ${formatStat(language, row.kind, line[field] as number)}`;
    })
    .join(" · ");
}

export interface TextCtx {
  language: Language;
  meta: MatchMetadata;
}

export type StatKind = "percent" | "count" | "decimal1" | "decimal2";

export interface StatRow<K extends string> {
  field: K;
  label: StringKey;
  kind: StatKind;
}

/** Team stats in display order, with how each is formatted. */
export const TEAM_STAT_ROWS: StatRow<keyof TeamStats & string>[] = [
  { field: "possession", label: "statPossession", kind: "percent" },
  { field: "shots", label: "statShots", kind: "count" },
  { field: "shots_on_target", label: "statShotsOnTarget", kind: "count" },
  { field: "xg", label: "statXg", kind: "decimal2" },
  { field: "passes", label: "statPasses", kind: "count" },
  { field: "pass_accuracy", label: "statPassAccuracy", kind: "percent" },
  { field: "field_tilt", label: "statFieldTilt", kind: "percent" },
  { field: "pressures", label: "statPressures", kind: "count" },
  { field: "ppda", label: "statPpda", kind: "decimal1" },
  { field: "corners", label: "statCorners", kind: "count" },
  { field: "fouls", label: "statFouls", kind: "count" },
  { field: "yellow_cards", label: "statYellowCards", kind: "count" },
  { field: "red_cards", label: "statRedCards", kind: "count" },
];

/** Player stats in display order. */
export const PLAYER_STAT_ROWS: StatRow<keyof PlayerStats & string>[] = [
  { field: "minutes", label: "playerMinutes", kind: "count" },
  { field: "goals", label: "playerGoals", kind: "count" },
  { field: "assists", label: "playerAssists", kind: "count" },
  { field: "shots", label: "statShots", kind: "count" },
  { field: "xg", label: "statXg", kind: "decimal2" },
  { field: "passes", label: "statPasses", kind: "count" },
  { field: "pass_accuracy", label: "statPassAccuracy", kind: "percent" },
  {
    field: "avg_pass_difficulty",
    label: "playerAvgDifficulty",
    kind: "decimal1",
  },
  { field: "distance_km", label: "playerDistance", kind: "decimal2" },
  { field: "top_speed_kmh", label: "playerTopSpeed", kind: "decimal1" },
  { field: "defensive_actions", label: "playerDefensive", kind: "count" },
  { field: "pressures", label: "statPressures", kind: "count" },
];

export function formatStat(
  language: Language,
  kind: StatKind,
  value: number | null,
): string {
  if (value === null) return "–";
  switch (kind) {
    case "percent":
      return formatPercent(language, value, 1);
    case "count":
      return formatNumber(language, value);
    case "decimal1":
      return formatNumber(language, value, 1);
    case "decimal2":
      return formatNumber(language, value, 2);
  }
}

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v) || 0;

export function eventName(
  e: Pick<MatchEvent, "type">,
  language: Language,
): string {
  return translate(language, `evt_${e.type}`);
}

const LEDGER_RULES: Record<string, StringKey> = {
  appearance: "ruleAppearance",
  sixty_minutes: "ruleSixtyMinutes",
  goal: "ruleGoal",
  assist: "ruleAssist",
  clean_sheet: "ruleCleanSheet",
  saves: "ruleSaves",
  penalty_save: "rulePenaltySave",
  penalty_miss: "rulePenaltyMiss",
  goals_conceded: "ruleGoalsConceded",
  yellow_card: "ruleYellowCard",
  red_card: "ruleRedCard",
  own_goal: "ruleOwnGoal",
  defensive_contribution: "ruleDefensiveContribution",
  bonus: "ruleBonus",
};

export function ruleLabel(language: Language, ruleId: string): string {
  const key = LEDGER_RULES[ruleId];
  return key ? translate(language, key) : ruleId;
}

/** The moments Casual mode tells; the rest are for analysts. */
export const CASUAL_MOMENTS: ReadonlySet<KeyMoment["type"]> = new Set([
  "goal",
  "big_chance",
  "save",
  "card",
]);

/** The label of a player stat, for choosing a focus metric. */
export function playerStatLabel(field: string): StringKey {
  return PLAYER_STAT_ROWS.find((r) => r.field === field)?.label ?? "statPasses";
}

const BADGES: Record<KeyMoment["type"], StringKey> = {
  goal: "momentGoal",
  big_chance: "momentBigChance",
  save: "momentSave",
  card: "momentCard",
  momentum_swing: "momentMomentum",
  pressure_spell: "momentPressure",
  milestone: "momentMilestone",
};

export interface MomentText {
  badge: string;
  text: string;
  /** Extra facts, such as the assist. */
  details: string[];
  /** The numbers that explain why the moment matters, all taken from the moment's facts. */
  why: string[];
}

/** A key moment in words: every number comes from the moment's own facts. */
export function describeMoment(m: KeyMoment, ctx: TextCtx): MomentText {
  const { language, meta } = ctx;
  const tt = (key: StringKey, vars: Vars = {}) =>
    translate(language, key, vars);
  const dec = (value: unknown, digits: number) =>
    formatNumber(language, num(value), digits);
  const f = m.facts;
  const team = teamOf(meta, m.team_id).name;
  const name = (i: number) =>
    m.player_ids[i] ? playerName(meta, m.player_ids[i]) : "";
  const details: string[] = [];
  const why: string[] = [];
  let text = "";
  switch (m.type) {
    case "goal": {
      const score = {
        home: meta.home.short_name,
        away: meta.away.short_name,
        homeGoals: num(f.score_home),
        awayGoals: num(f.score_away),
      };
      const key = f.own_goal
        ? "goalOwn"
        : f.penalty
          ? "goalPenalty"
          : "goalText";
      text = tt(key, { player: name(0), team, ...score });
      if (!f.own_goal && m.player_ids[1])
        details.push(tt("goalAssist", { player: name(1) }));
      if (f.first_goal) details.push(tt("goalFirst"));
      break;
    }
    case "big_chance": {
      const outcome = tt(
        f.outcome === "blocked" ? "outcomeBlocked" : "outcomeOffTarget",
      );
      text = tt("bigChanceText", {
        player: name(0),
        team,
        xg: dec(f.xg, 2),
        outcome,
      });
      break;
    }
    case "save":
      text = m.player_ids[1]
        ? tt("saveText", {
            player: name(0),
            team,
            shooter: name(1),
            xg: dec(f.xg, 2),
          })
        : tt("saveTextPlain", { player: name(0), team, xg: dec(f.xg, 2) });
      break;
    case "card": {
      const card =
        f.card === "red"
          ? "cardRed"
          : f.card === "yellow"
            ? "cardYellow"
            : "cardSecondYellow";
      text = tt("cardText", { player: name(0), team, card: tt(card) });
      break;
    }
    case "momentum_swing":
      text = tt("momentumText", {
        team,
        ours: num(f.final_third_actions),
        theirs: num(f.opponent_final_third_actions),
      });
      break;
    case "pressure_spell":
      text = tt("pressureText", {
        team,
        pressures: num(f.pressures),
        minutes: dec(f.window_minutes, 0),
      });
      break;
    case "milestone":
      text = milestoneText(m, ctx, name(0), team);
      break;
  }
  const swing = num(f.win_prob_swing);
  if (swing > 0) why.push(tt("whySwing", { points: dec(swing * 100, 0) }));
  why.push(tt("whyImportance", { importance: dec(m.importance, 2) }));
  if (num(f.shot_speed_kmh) > 0) {
    why.push(
      tt("whyNumbers", { xg: dec(f.xg, 2), speed: dec(f.shot_speed_kmh, 0) }),
    );
  }
  return { badge: tt(BADGES[m.type]), text, details, why };
}

function milestoneText(
  m: KeyMoment,
  ctx: TextCtx,
  player: string,
  team: string,
): string {
  const { language } = ctx;
  const tt = (key: StringKey, vars: Vars) => translate(language, key, vars);
  const f = m.facts;
  switch (f.milestone) {
    case "passes":
      return tt("milestonePasses", { player, passes: num(f.passes) });
    case "distance":
      return tt("milestoneDistance", {
        player,
        distance: formatNumber(language, num(f.distance_km), 1),
      });
    case "top_speed":
      return tt("milestoneTopSpeed", {
        player,
        speed: formatNumber(language, num(f.speed_kmh), 1),
      });
    case "match_top_speed":
      return tt("milestoneMatchTopSpeed", {
        player,
        speed: formatNumber(language, num(f.speed_kmh), 1),
      });
    case "clean_sheet":
      return tt("milestoneCleanSheet", { team, minute: num(f.minute) });
    case "team_shots":
      return tt("milestoneTeamShots", { team, shots: num(f.shots) });
    case "brace":
      return tt("milestoneBrace", { player });
    case "hat_trick":
      return tt("milestoneHatTrick", { player });
    default:
      return String(f.milestone ?? "");
  }
}

export interface CueRow {
  label: string;
  home: string;
  away: string;
}

export interface CueText {
  title: string;
  lines: string[];
  /** A bar from -100 (away) to +100 (home), for the momentum template. */
  bar: number | null;
  rows: CueRow[];
}

const STAT_LABELS: Record<string, StringKey> = {
  goals: "playerGoals",
  possession: "statPossession",
  shots: "statShots",
  shots_on_target: "statShotsOnTarget",
  xg: "statXg",
  passes: "statPasses",
  pass_accuracy: "statPassAccuracy",
  field_tilt: "statFieldTilt",
};

const STAT_KINDS: Record<string, StatKind> = {
  possession: "percent",
  pass_accuracy: "percent",
  field_tilt: "percent",
  xg: "decimal2",
};

/**
 * An overlay cue in words. Stat cues are templated from the cue's own data; key-moment cues
 * reuse the moment's text. A `text` entry for the language (filled by agents) wins.
 */
export function describeCue(
  cue: OverlayCue,
  ctx: TextCtx,
  moments: readonly KeyMoment[],
): CueText {
  const { language, meta } = ctx;
  const tt = (key: StringKey, vars: Vars = {}) =>
    translate(language, key, vars);
  const dec = (value: unknown, digits: number) =>
    formatNumber(language, num(value), digits);
  const d = cue.data;
  const moment = moments.find((m) => cue.source_moment_ids.includes(m.id));
  const player = cue.anchor_player_id
    ? playerName(meta, cue.anchor_player_id)
    : "";
  const out: CueText = { title: "", lines: [], bar: null, rows: [] };
  switch (cue.template) {
    case "player_tag":
      out.title = player;
      out.lines = [playerTagLine(cue, ctx, moment)];
      break;
    case "pass_quality":
      out.title = player;
      out.lines = [
        tt("overlayPass", { difficulty: dec(d.difficulty, 0) }),
        tt("overlayPassDetail", {
          length: dec(d.length_m, 1),
          speed: dec(d.ball_speed_kmh, 0),
        }),
      ];
      if (d.cross) out.lines.push(tt("overlayPassCross"));
      if (d.under_pressure) out.lines.push(tt("overlayPassPressure"));
      break;
    case "shot_speed":
      out.title = player;
      out.lines = [
        tt("overlayShot", { speed: dec(d.shot_speed_kmh, 0) }),
        tt("overlayShotDetail", { xg: dec(d.xg, 2) }),
      ];
      if (d.outcome === "goal") out.lines.push(tt("evt_goal"));
      break;
    case "momentum_bar": {
      const team = moment ? teamOf(meta, moment.team_id) : meta.home;
      out.title = tt("overlayMomentum", { team: team.name });
      out.bar = num(d.momentum);
      break;
    }
    case "key_moment": {
      const text = moment ? describeMoment(moment, ctx) : null;
      out.title = text?.badge ?? "";
      out.lines = text ? [text.text, ...text.details] : [];
      break;
    }
    case "stat_compare": {
      out.title = tt(d.period === 1 ? "overlayFirstHalf" : "overlaySecondHalf");
      for (const field of Object.keys(STAT_LABELS)) {
        const kind = STAT_KINDS[field] ?? "count";
        out.rows.push({
          label: tt(STAT_LABELS[field]!),
          home: formatStat(language, kind, num(d[`${field}_home`])),
          away: formatStat(language, kind, num(d[`${field}_away`])),
        });
      }
      break;
    }
    case "recap_card": {
      out.title = tt("overlayRecap", {
        label: tt(d.period === 1 ? "overlayHalfTime" : "overlayFullTime"),
        home: meta.home.short_name,
        away: meta.away.short_name,
        homeGoals: num(d.score_home),
        awayGoals: num(d.score_away),
      });
      out.lines = cue.source_moment_ids
        .map((id) => moments.find((m) => m.id === id))
        .filter((m): m is KeyMoment => m !== undefined)
        .map((m) => describeMoment(m, ctx).text);
      break;
    }
  }
  const written = cue.text[language];
  if (written) out.lines = [written];
  return out;
}

function playerTagLine(
  cue: OverlayCue,
  ctx: TextCtx,
  moment: KeyMoment | undefined,
): string {
  const { language } = ctx;
  const tt = (key: StringKey, vars: Vars) => translate(language, key, vars);
  const d = cue.data;
  switch (d.milestone) {
    case "passes":
      return tt("overlayPlayerPasses", { passes: num(d.passes) });
    case "distance":
      return tt("overlayPlayerDistance", {
        distance: formatNumber(language, num(d.distance_km), 1),
      });
    case "top_speed":
      return tt("overlayPlayerTopSpeed", {
        speed: formatNumber(language, num(d.speed_kmh), 1),
      });
    default:
      return moment ? describeMoment(moment, ctx).text : "";
  }
}
