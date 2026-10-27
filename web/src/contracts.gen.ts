// Generated from packages/contracts by `make contracts`. Do not edit.

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
