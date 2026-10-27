// Generated from packages/contracts by `make contracts`. Do not edit.

export type PitchPointsContract =
  SimulatorMessage | StatSnapshot | TacticalState | KeyMoment | OverlayCue | LedgerEntry | FantasySquad;
export type SimulatorMessage = MatchMetadata | MatchEvent | PositionFrame;

/**
 * Fixture details, sent once before the first event. All names are fictional.
 */
export interface MatchMetadata {
  kind: "metadata";
  match_id: string;
  competition: string;
  season: string;
  matchday: number;
  venue: string;
  city: string;
  kickoff_utc: string;
  weather: "clear" | "cloudy" | "rain" | "wind" | "cold";
  temperature_c: number;
  referee: string;
  attendance: number;
  home: TeamSheet;
  away: TeamSheet;
}
export interface TeamSheet {
  id: string;
  name: string;
  short_name: string;
  primary_colour: string;
  secondary_colour: string;
  formation: string;
  starters: PlayerInfo[];
  bench: PlayerInfo[];
}
export interface PlayerInfo {
  id: string;
  name: string;
  shirt: number;
  position: "GK" | "DEF" | "MID" | "FWD";
}
/**
 * One match event. Type-specific fields are null unless the type uses them.
 *
 * `opponent_id` is the other-team player involved: the player pressed, tackled,
 * or fouled, or the shooter for `block` and `save`. `possession_change` is
 * emitted just before the event that wins the ball. A penalty miss is a `shot`
 * with `penalty` true and an outcome other than `goal`.
 */
export interface MatchEvent {
  kind: "event";
  id: number;
  match_id: string;
  period: 1 | 2;
  clock_s: number;
  minute: number;
  type:
    | "match_start"
    | "kickoff"
    | "pass"
    | "carry"
    | "pressure"
    | "possession_change"
    | "shot"
    | "goal"
    | "own_goal"
    | "save"
    | "block"
    | "tackle"
    | "interception"
    | "clearance"
    | "ball_recovery"
    | "foul"
    | "card"
    | "penalty_won"
    | "corner"
    | "substitution"
    | "period_end"
    | "match_end";
  team_id: string;
  player_id: string | null;
  possession_id: number;
  x: number | null;
  y: number | null;
  end_x: number | null;
  end_y: number | null;
  outcome: ("complete" | "incomplete" | "goal" | "saved" | "blocked" | "off_target" | "won") | null;
  recipient_id: string | null;
  opponent_id: string | null;
  cross: boolean | null;
  under_pressure: boolean | null;
  ball_speed_kmh: number | null;
  xg: number | null;
  shot_speed_kmh: number | null;
  penalty: boolean | null;
  assist_player_id: string | null;
  card: ("yellow" | "second_yellow" | "red") | null;
  player_in_id: string | null;
  score: {
    [k: string]: number;
  } | null;
}
/**
 * Approximate positions of the ball and every on-pitch player, about every 2 seconds.
 */
export interface PositionFrame {
  kind: "positions";
  match_id: string;
  period: 1 | 2;
  clock_s: number;
  ball_x: number;
  ball_y: number;
  players: PlayerPosition[];
}
export interface PlayerPosition {
  player_id: string;
  x: number;
  y: number;
  speed_kmh: number;
}
/**
 * Match stats up to and including `last_event_id`; players who have not appeared are omitted.
 */
export interface StatSnapshot {
  match_id: string;
  period: 1 | 2;
  clock_s: number;
  minute: number;
  last_event_id: number;
  home: TeamStats;
  away: TeamStats;
  players: PlayerStats[];
}
/**
 * One team's match totals. Shares (possession, pass accuracy, field tilt) are 0 to 1.
 */
export interface TeamStats {
  team_id: string;
  goals: number;
  possession: number;
  passes: number;
  pass_accuracy: number;
  shots: number;
  shots_on_target: number;
  xg: number;
  field_tilt: number;
  pressures: number;
  ppda: number | null;
  corners: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
}
/**
 * One player's match totals; distance and top speed come from position frames.
 */
export interface PlayerStats {
  player_id: string;
  team_id: string;
  minutes: number;
  passes: number;
  pass_accuracy: number;
  avg_pass_difficulty: number;
  distance_km: number;
  top_speed_kmh: number;
  shots: number;
  shots_on_target: number;
  goals: number;
  assists: number;
  xg: number;
  defensive_actions: number;
  pressures: number;
}
/**
 * Rolling-window tactical indices; windows and formulas live in `insights.constants`.
 */
export interface TacticalState {
  match_id: string;
  period: 1 | 2;
  clock_s: number;
  minute: number;
  last_event_id: number;
  momentum: number;
  control_chaos_index: number;
  pressing_intensity: TeamPair;
  tempo: number;
  win_probability: WinProbability;
}
export interface TeamPair {
  home: number;
  away: number;
}
export interface WinProbability {
  home: number;
  draw: number;
  away: number;
}
/**
 * A moment worth explaining. `importance` (0 to 1) is the win-probability swing it caused,
 * or the kind's base importance when that is larger. `facts` holds every number an agent
 * may quote about it.
 */
export interface KeyMoment {
  id: number;
  match_id: string;
  period: 1 | 2;
  clock_s: number;
  minute: number;
  kind: "goal" | "big_chance" | "save" | "card" | "momentum_swing" | "pressure_spell" | "milestone";
  importance: number;
  team_id: string;
  player_ids: string[];
  facts: {
    [k: string]: string | number | boolean;
  };
  /**
   * @minItems 1
   */
  source_event_ids: [number, ...number[]];
}
/**
 * A timed broadcast graphic. Timing and `data` come from the insights engine; `text`
 * (language code to text) is filled later by templates or fact-checked agents.
 */
export interface OverlayCue {
  id: number;
  match_id: string;
  period: 1 | 2;
  start_clock_s: number;
  duration_s: number;
  template:
    "player_tag" | "pass_quality" | "shot_speed" | "momentum_bar" | "key_moment" | "stat_compare" | "recap_card";
  priority: number;
  anchor_player_id: string | null;
  data: {
    [k: string]: string | number | boolean;
  };
  text: {
    [k: string]: string;
  };
  source_moment_ids: number[];
  /**
   * @minItems 1
   */
  source_event_ids: [number, ...number[]];
}
/**
 * One change to a player's fantasy points.
 *
 * Entries that can still change (clean sheet, goals conceded, bonus) are
 * `provisional` and keep a stable `id`: a later entry with the same id replaces
 * the earlier one, and its `running_total` already reflects the replacement.
 * At full time every provisional entry is issued again with `provisional` false.
 */
export interface LedgerEntry {
  id: string;
  match_id: string;
  player_id: string;
  minute: number;
  delta: number;
  running_total: number;
  rule_id: string;
  reason: string;
  /**
   * @minItems 1
   */
  source_event_ids: [number, ...number[]];
  provisional: boolean;
}
/**
 * Eleven players from the match; the captain's points count twice.
 */
export interface FantasySquad {
  /**
   * @minItems 11
   * @maxItems 11
   */
  players: [string, string, string, string, string, string, string, string, string, string, string];
  captain_id: string;
  vice_captain_id: string;
}
