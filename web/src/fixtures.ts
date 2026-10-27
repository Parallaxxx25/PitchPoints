/** Small hand-made match data for tests. */
import type {
  KeyMoment,
  LedgerEntry,
  MatchEvent,
  MatchMetadata,
  MatchState,
  OverlayCue,
  PlayerInfo,
  PositionFrame,
  StatSnapshot,
  TacticalState,
  TeamSheet,
  NewProfile,
} from "./contracts.gen.ts";
import { DEFAULT_PROFILE, type Screen, useProfile } from "./profile.ts";
import { EMPTY, type LiveData, useLive } from "./store.ts";

const POSITIONS: PlayerInfo["position"][] = [
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
  "MID",
  "DEF",
  "FWD",
];

function team(
  id: string,
  prefix: string,
  name: string,
  short: string,
): TeamSheet {
  const players = POSITIONS.map((position, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `${name} Player ${i + 1}`,
    shirt: i + 1,
    position,
  }));
  return {
    id,
    name,
    short_name: short,
    primary_colour: prefix === "HOM" ? "#d62828" : "#1d4ed8",
    secondary_colour: "#ffffff",
    formation: "4-4-2",
    starters: players.slice(0, 11),
    bench: players.slice(11),
  };
}

export const HOME = team("t-home", "HOM", "Harbour Rovers", "HAR");
export const AWAY = team("t-away", "AWY", "Ridge United", "RID");

export const META: MatchMetadata = {
  kind: "metadata",
  match_id: "match-0001",
  competition: "Synthetic League",
  season: "2026/27",
  matchday: 1,
  venue: "Test Park",
  city: "Testville",
  kickoff_utc: "2026-08-15T14:00:00Z",
  weather: "clear",
  temperature_c: 18,
  referee: "R. Referee",
  attendance: 30000,
  home: HOME,
  away: AWAY,
};

export function event(
  partial: Partial<MatchEvent> & Pick<MatchEvent, "id" | "type">,
): MatchEvent {
  return {
    kind: "event",
    match_id: META.match_id,
    period: 1,
    clock_s: partial.id * 10,
    minute: Math.floor((partial.id * 10) / 60),
    team_id: HOME.id,
    player_id: null,
    possession_id: 1,
    x: null,
    y: null,
    end_x: null,
    end_y: null,
    outcome: null,
    recipient_id: null,
    opponent_id: null,
    cross: null,
    under_pressure: null,
    ball_speed_kmh: null,
    xg: null,
    shot_speed_kmh: null,
    penalty: null,
    assist_player_id: null,
    card: null,
    player_in_id: null,
    score: null,
    ...partial,
  };
}

/** A frame with every starter on a line, home at x = 30 + shift and away at x = 75 + shift. */
export function frame(
  clock_s: number,
  shift = 0,
  period: 1 | 2 = 1,
): PositionFrame {
  const line = (players: PlayerInfo[], x: number) =>
    players.map((p, i) => ({
      player_id: p.id,
      x: x + shift,
      y: 6 + i * 5.6,
      speed_kmh: 8,
    }));
  return {
    kind: "positions",
    match_id: META.match_id,
    period,
    clock_s,
    ball_x: 52.5 + shift,
    ball_y: 34,
    players: [...line(HOME.starters, 30), ...line(AWAY.starters, 75)],
  };
}

export function moment(
  partial: Partial<KeyMoment> & Pick<KeyMoment, "id" | "type">,
): KeyMoment {
  return {
    kind: "moment",
    match_id: META.match_id,
    period: 1,
    clock_s: 600,
    minute: 10,
    importance: 0.2,
    team_id: HOME.id,
    player_ids: [],
    facts: {},
    source_event_ids: [partial.id],
    ...partial,
  };
}

export function cue(
  partial: Partial<OverlayCue> & Pick<OverlayCue, "id" | "template">,
): OverlayCue {
  return {
    kind: "overlay_cue",
    match_id: META.match_id,
    period: 1,
    start_clock_s: 600,
    duration_s: 8,
    priority: 50,
    anchor_player_id: null,
    data: {},
    text: {},
    source_moment_ids: [],
    source_event_ids: [1],
    ...partial,
  };
}

export function ledgerEntry(
  partial: Partial<LedgerEntry> & Pick<LedgerEntry, "id">,
): LedgerEntry {
  return {
    kind: "ledger_entry",
    match_id: META.match_id,
    player_id: "HOM-10",
    minute: 10,
    delta: 4,
    running_total: 4,
    rule_id: "goal",
    reason: "Goal",
    source_event_ids: [1],
    provisional: false,
    ...partial,
  };
}

export const STATE: MatchState = {
  kind: "match_state",
  match_id: META.match_id,
  status: "running",
  speed: 18,
  revision: 0,
  period: 1,
  clock_s: 600,
  minute: 10,
  score_home: 1,
  score_away: 0,
  last_event_id: 1,
};

function teamStats(team_id: string, goals: number): StatSnapshot["home"] {
  return {
    team_id,
    goals,
    possession: 0.55,
    passes: 120,
    pass_accuracy: 0.84,
    shots: 6,
    shots_on_target: 3,
    xg: 1.24,
    field_tilt: 0.6,
    pressures: 20,
    ppda: 9.5,
    corners: 2,
    fouls: 4,
    yellow_cards: 1,
    red_cards: 0,
  };
}

export const STATS: StatSnapshot = {
  kind: "stats",
  match_id: META.match_id,
  period: 1,
  clock_s: 600,
  minute: 10,
  last_event_id: 1,
  home: teamStats(HOME.id, 1),
  away: teamStats(AWAY.id, 0),
  players: [HOME.starters[9]!, AWAY.starters[0]!].map((p) => ({
    player_id: p.id,
    team_id: p.id.startsWith("HOM") ? HOME.id : AWAY.id,
    minutes: 10,
    passes: 12,
    pass_accuracy: 0.8,
    avg_pass_difficulty: 41.2,
    distance_km: 1.1,
    top_speed_kmh: 29.4,
    shots: 2,
    shots_on_target: 1,
    goals: p.id === "HOM-10" ? 1 : 0,
    assists: 0,
    xg: 0.4,
    defensive_actions: 1,
    pressures: 3,
  })),
};

export const TACTICAL: TacticalState = {
  kind: "tactical_state",
  match_id: META.match_id,
  period: 1,
  clock_s: 600,
  minute: 10,
  last_event_id: 1,
  momentum: 35,
  control_chaos_index: 12,
  pressing_intensity: { home: 1.5, away: 1.1 },
  tempo: 9.4,
  win_probability: { home: 0.52, draw: 0.28, away: 0.2 },
};

/** One moment of every type (and every milestone), with the facts the insights engine gives it. */
export const ALL_MOMENTS: KeyMoment[] = [
  moment({
    id: 1,
    type: "goal",
    importance: 0.35,
    player_ids: ["HOM-10", "HOM-11"],
    facts: {
      score_home: 1,
      score_away: 0,
      own_goal: false,
      first_goal: true,
      xg: 0.1,
      shot_speed_kmh: 92,
      penalty: false,
      win_prob_swing: 0.35,
    },
  }),
  moment({
    id: 2,
    type: "big_chance",
    importance: 0.08,
    player_ids: ["HOM-11"],
    facts: { xg: 0.31, outcome: "blocked", penalty: false },
  }),
  moment({
    id: 3,
    type: "save",
    importance: 0.08,
    team_id: AWAY.id,
    player_ids: ["AWY-1", "HOM-9"],
    facts: { xg: 0.2, shot_speed_kmh: 80, penalty: false },
  }),
  moment({
    id: 4,
    type: "card",
    importance: 0.08,
    player_ids: ["HOM-3"],
    facts: { card: "red", win_prob_swing: 0.08 },
  }),
  moment({
    id: 5,
    type: "momentum_swing",
    importance: 0.06,
    facts: {
      momentum: 70,
      final_third_actions: 12,
      opponent_final_third_actions: 3,
    },
  }),
  moment({
    id: 6,
    type: "pressure_spell",
    importance: 0.05,
    facts: { pressures: 8, window_minutes: 3 },
  }),
  ...(
    [
      ["passes", { passes: 80 }],
      ["distance", { distance_km: 11.02 }],
      ["top_speed", { speed_kmh: 33.4 }],
      ["match_top_speed", { speed_kmh: 34.1 }],
      ["clean_sheet", { minute: 80 }],
      ["team_shots", { shots: 10 }],
      ["brace", { goals: 2 }],
      ["hat_trick", { goals: 3 }],
    ] as const
  ).map(([name, facts], i) =>
    moment({
      id: 7 + i,
      type: "milestone",
      importance: 0.03,
      player_ids: ["HOM-9"],
      facts: { milestone: name, ...facts },
    }),
  ),
];

const STAT_COMPARE_DATA = Object.fromEntries(
  [
    "goals",
    "possession",
    "shots",
    "shots_on_target",
    "xg",
    "passes",
    "pass_accuracy",
    "field_tilt",
  ].flatMap((f) => [
    [`${f}_home`, 0.5],
    [`${f}_away`, 0.4],
  ]),
);

/** One overlay cue of every template. */
export const ALL_CUES: OverlayCue[] = [
  cue({
    id: 1,
    template: "player_tag",
    anchor_player_id: "HOM-9",
    data: { moment_type: "milestone", milestone: "top_speed", speed_kmh: 33.4 },
    source_moment_ids: [9],
  }),
  cue({
    id: 2,
    template: "pass_quality",
    anchor_player_id: "HOM-6",
    data: {
      difficulty: 77,
      length_m: 34.2,
      ball_speed_kmh: 60,
      under_pressure: true,
      cross: true,
    },
  }),
  cue({
    id: 3,
    template: "shot_speed",
    anchor_player_id: "HOM-10",
    data: { shot_speed_kmh: 92, xg: 0.1, outcome: "goal", penalty: false },
  }),
  cue({
    id: 4,
    template: "momentum_bar",
    data: { momentum: 70 },
    source_moment_ids: [5],
  }),
  cue({
    id: 5,
    template: "key_moment",
    data: { moment_type: "goal" },
    source_moment_ids: [1],
  }),
  cue({
    id: 6,
    template: "stat_compare",
    data: { period: 1, ...STAT_COMPARE_DATA },
  }),
  cue({
    id: 7,
    template: "recap_card",
    data: { period: 2, score_home: 2, score_away: 1 },
    source_moment_ids: [1, 4],
  }),
];

/**
 * Put the stores in a known state. Server rendering reads zustand's initial state, not its
 * current one, so the values are written into both.
 */
export function seedStore(
  extra: Partial<LiveData> = {},
  profile: Partial<NewProfile> = {},
  viewerState: { selectedPlayerId?: string | null; screen?: Screen } = {},
): void {
  const live: Partial<LiveData> = {
    ...EMPTY,
    matchId: META.match_id,
    connection: "open",
    metadata: META,
    state: STATE,
    stats: STATS,
    tactical: TACTICAL,
    moments: ALL_MOMENTS,
    cues: ALL_CUES,
    ...extra,
  };
  const viewer = {
    profile: { ...DEFAULT_PROFILE, ...profile },
    selectedPlayerId: null,
    screen: "live" as const,
    ...viewerState,
  };
  Object.assign(useLive.getInitialState(), live);
  useLive.setState(live);
  Object.assign(useProfile.getInitialState(), viewer);
  useProfile.setState(viewer);
}
