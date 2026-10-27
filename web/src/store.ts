import { create } from "zustand";
import type {
  KeyMoment,
  LedgerEntry,
  LiveMessage,
  MatchEvent,
  MatchMetadata,
  MatchState,
  OverlayCue,
  PositionFrame,
  StatSnapshot,
  TacticalState,
  WinProbability,
} from "./contracts.gen.ts";
import { toScreenCoords } from "./coords.ts";
import type { Clip } from "./replay.ts";
import { rosterOf } from "./roster.ts";

export type Connection = "idle" | "connecting" | "open" | "lost" | "missing";

/** Events kept for replaying a stat's source; a whole match has about 1,600. */
export const MAX_EVENTS = 6000;
/** Recent events kept for drawing on the pitch. */
export const RECENT_EVENTS = 24;
const HALF_S = 45 * 60;

/** One point per match minute on the xG, momentum, and win-probability timelines. */
export interface TimelinePoint {
  minute: number;
  momentum?: number;
  control?: number;
  win?: WinProbability;
  xgHome?: number;
  xgAway?: number;
}

export interface RecentEvent {
  event: MatchEvent;
  /** `performance.now()` when it arrived. */
  at: number;
}

export type ReplayStatus = "loading" | "playing" | "ended" | "failed";

export interface ReplayState {
  label: string;
  status: ReplayStatus;
  clips: Clip[];
  /** `performance.now()` when playback began. */
  startedAt: number;
}

export interface LiveData {
  matchId: string | null;
  connection: Connection;
  metadata: MatchMetadata | null;
  state: MatchState | null;
  stats: StatSnapshot | null;
  tactical: TacticalState | null;
  timeline: TimelinePoint[];
  moments: KeyMoment[];
  cues: OverlayCue[];
  /** The current version of every ledger entry, by entry id. */
  ledger: Record<string, LedgerEntry>;
  events: MatchEvent[];
  recent: RecentEvent[];
  frame: PositionFrame | null;
  prevFrame: PositionFrame | null;
  frameAt: number;
  prevFrameAt: number;
  /** The clock of the latest event or frame, for timing overlay cues. */
  clock: { period: 1 | 2; clock_s: number } | null;
  squadTotal: number | null;
  replay: ReplayState | null;
}

export const EMPTY: LiveData = {
  matchId: null,
  connection: "idle",
  metadata: null,
  state: null,
  stats: null,
  tactical: null,
  timeline: [],
  moments: [],
  cues: [],
  ledger: {},
  events: [],
  recent: [],
  frame: null,
  prevFrame: null,
  frameAt: 0,
  prevFrameAt: 0,
  clock: null,
  squadTotal: null,
  replay: null,
};

/**
 * The match minute right now: from the latest event or position frame, since the match state is
 * only pushed at kickoffs, goals, and period ends.
 */
export function liveMinute(s: Pick<LiveData, "clock" | "state">): number {
  return s.clock ? Math.floor(s.clock.clock_s / 60) : (s.state?.minute ?? 0);
}

/** The timeline minute for a clock: first-half stoppage joins minute 45, second-half stoppage minute 90. */
export function timelineMinute(period: 1 | 2, clockS: number): number {
  return Math.floor(Math.min(clockS, HALF_S * period) / 60);
}

/** Insert or replace by id, keeping ids in order. */
export function upsert<T extends { id: number }>(
  list: readonly T[],
  item: T,
): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) return list.map((x, j) => (j === i ? item : x));
  return [...list, item].sort((a, b) => a.id - b.id);
}

function withPoint(
  timeline: readonly TimelinePoint[],
  minute: number,
  patch: Partial<TimelinePoint>,
): TimelinePoint[] {
  const i = timeline.findIndex((p) => p.minute === minute);
  if (i >= 0) return timeline.map((p, j) => (j === i ? { ...p, ...patch } : p));
  return [...timeline, { minute, ...patch }].sort(
    (a, b) => a.minute - b.minute,
  );
}

/** What changes in the data when `msg` arrives at `now` (a `performance.now()` time). */
export function reduceMessage(
  s: LiveData,
  msg: LiveMessage,
  now: number,
): Partial<LiveData> {
  switch (msg.kind) {
    case "metadata":
      return { metadata: msg };
    case "match_state": {
      const seeked = s.state !== null && s.state.revision !== msg.revision;
      if (!seeked) return { state: msg };
      return {
        state: msg,
        events: [],
        recent: [],
        frame: null,
        prevFrame: null,
        moments: [],
        cues: [],
        ledger: {},
        replay: null,
        timeline: s.timeline.filter((p) => p.minute <= msg.minute),
      };
    }
    case "event": {
      const events =
        s.events.length >= MAX_EVENTS ? s.events.slice(1) : s.events;
      return {
        events: [...events, msg],
        recent: [...s.recent, { event: msg, at: now }].slice(-RECENT_EVENTS),
        clock: { period: msg.period, clock_s: msg.clock_s },
      };
    }
    case "positions":
      return {
        prevFrame: s.frame,
        prevFrameAt: s.frameAt,
        frame: msg,
        frameAt: now,
        clock: { period: msg.period, clock_s: msg.clock_s },
      };
    case "stats":
      return {
        stats: msg,
        timeline: withPoint(
          s.timeline,
          timelineMinute(msg.period, msg.clock_s),
          {
            xgHome: msg.home.xg,
            xgAway: msg.away.xg,
          },
        ),
      };
    case "tactical_state":
      return {
        tactical: msg,
        timeline: withPoint(
          s.timeline,
          timelineMinute(msg.period, msg.clock_s),
          {
            momentum: msg.momentum,
            control: msg.control_chaos_index,
            win: msg.win_probability,
          },
        ),
      };
    case "moment":
      return { moments: upsert(s.moments, msg) };
    case "overlay_cue":
      return { cues: upsert(s.cues, msg) };
    case "ledger_entry":
      return { ledger: { ...s.ledger, [msg.id]: msg } };
    case "squad_total":
      return { squadTotal: msg.total };
  }
}

/** Heatmap grid size: 5 m cells along the length, about 5 m across. */
export const HEAT_COLS = 21;
export const HEAT_ROWS = 14;

/** Frames each player has spent in each cell, with every player attacking left to right. */
const heat = new Map<string, Uint16Array>();

export function heatOf(playerId: string): Uint16Array | undefined {
  return heat.get(playerId);
}

function addHeat(frame: PositionFrame, meta: MatchMetadata | null): void {
  if (!meta) return;
  const roster = rosterOf(meta);
  for (const p of frame.players) {
    const side = roster.get(p.player_id)?.side;
    if (!side) continue;
    const { x, y } = toScreenCoords(p.x, p.y, "home", side === "home" ? 1 : 2);
    const col = Math.min(
      HEAT_COLS - 1,
      Math.max(0, Math.floor((x / 105) * HEAT_COLS)),
    );
    const row = Math.min(
      HEAT_ROWS - 1,
      Math.max(0, Math.floor((y / 68) * HEAT_ROWS)),
    );
    let grid = heat.get(p.player_id);
    if (!grid)
      heat.set(p.player_id, (grid = new Uint16Array(HEAT_COLS * HEAT_ROWS)));
    grid[row * HEAT_COLS + col] += 1;
  }
}

interface Actions {
  apply: (msg: LiveMessage) => void;
  /** Replace what a REST fetch returned (moments, cues, ledger) and the pitch's current frame. */
  hydrate: (
    data: Partial<Pick<LiveData, "moments" | "cues" | "ledger" | "frame">>,
  ) => void;
  setConnection: (connection: Connection) => void;
  setMatch: (matchId: string | null) => void;
  setReplay: (replay: ReplayState | null) => void;
}

export const useLive = create<LiveData & Actions>()((set, get) => ({
  ...EMPTY,
  apply: (msg) => {
    const seekedFrom = get().state?.revision;
    set(reduceMessage(get(), msg, performance.now()));
    if (msg.kind === "positions") addHeat(msg, get().metadata);
    if (
      msg.kind === "match_state" &&
      seekedFrom !== undefined &&
      seekedFrom !== msg.revision
    ) {
      heat.clear();
    }
  },
  hydrate: (data) => set(data),
  setConnection: (connection) => set({ connection }),
  setMatch: (matchId) => {
    heat.clear();
    set({ ...EMPTY, matchId });
  },
  setReplay: (replay) => set({ replay }),
}));
