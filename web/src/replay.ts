import type {
  MatchEvent,
  PositionFrame,
  Replay,
  TeamStats,
} from "./contracts.gen.ts";

/** Match seconds shown per real second while replaying. */
export const REPLAY_SPEED = 2;
/** Pause between two clips, in real milliseconds. */
export const CLIP_GAP_MS = 700;
/** Position frames are 2 s apart; frames further apart than this belong to different clips. */
export const FRAME_GAP_S = 3;
/** How long, in match seconds, a context event stays on the pitch after it happens. */
export const MARK_TTL_S = 2.5;
/** The same for the events being replayed. */
export const SOURCE_TTL_S = 5;

/** One continuous stretch of a replay: position frames plus the events inside it. */
export interface Clip {
  period: 1 | 2;
  frames: PositionFrame[];
  events: MatchEvent[];
  /** Ids of the events being replayed, as opposed to events shown for context. */
  sources: ReadonlySet<number>;
}

export interface Cursor {
  clip: Clip;
  /** The match clock the clip is showing. */
  clock: number;
}

/** How many of the latest matching events a stat's replay shows. */
export const STAT_REPLAY_EVENTS = 5;

/** Which events produce a team stat, for stats whose source events can be replayed. */
export const STAT_SOURCES: Partial<
  Record<keyof TeamStats, (e: MatchEvent) => boolean>
> = {
  shots: (e) => e.type === "shot",
  shots_on_target: (e) =>
    e.type === "shot" && (e.outcome === "goal" || e.outcome === "saved"),
  xg: (e) => e.type === "shot",
  corners: (e) => e.type === "corner",
  fouls: (e) => e.type === "foul",
  pressures: (e) => e.type === "pressure",
  yellow_cards: (e) => e.type === "card" && e.card !== "red",
  red_cards: (e) => e.type === "card" && e.card !== "yellow",
};

/** Ids of the latest events that `team_id` caused for a stat, oldest first. */
export function statSourceIds(
  events: readonly MatchEvent[],
  field: keyof TeamStats,
  teamId: string,
): number[] {
  const keep = STAT_SOURCES[field];
  if (!keep) return [];
  return events
    .filter((e) => e.team_id === teamId && keep(e))
    .slice(-STAT_REPLAY_EVENTS)
    .map((e) => e.id);
}

export function clipStart(clip: Clip): number {
  return clip.frames[0]!.clock_s;
}

export function clipEnd(clip: Clip): number {
  return clip.frames[clip.frames.length - 1]!.clock_s;
}

/** Split a replay into clips: one per run of nearby frames, so far-apart events play one after another. */
export function buildClips(replay: Replay): Clip[] {
  const sources = new Set(replay.source_event_ids);
  const clips: Clip[] = [];
  for (const frame of replay.frames) {
    const clip = clips[clips.length - 1];
    if (
      clip &&
      clip.period === frame.period &&
      frame.clock_s - clipEnd(clip) <= FRAME_GAP_S
    ) {
      clip.frames.push(frame);
    } else {
      clips.push({
        period: frame.period,
        frames: [frame],
        events: [],
        sources,
      });
    }
  }
  for (const event of replay.events) {
    clips
      .find(
        (c) =>
          c.period === event.period &&
          event.clock_s >= clipStart(c) - FRAME_GAP_S &&
          event.clock_s <= clipEnd(c) + FRAME_GAP_S,
      )
      ?.events.push(event);
  }
  return clips.filter((c) => c.frames.length > 1);
}

function clipMs(clip: Clip): number {
  return ((clipEnd(clip) - clipStart(clip)) / REPLAY_SPEED) * 1000;
}

/** How long the whole replay plays, in real milliseconds. */
export function replayMs(clips: readonly Clip[]): number {
  return clips.reduce((total, c) => total + clipMs(c) + CLIP_GAP_MS, 0);
}

/** Where the replay is `elapsedMs` after it started, or null once it has finished. */
export function cursorAt(
  clips: readonly Clip[],
  elapsedMs: number,
): Cursor | null {
  let left = elapsedMs;
  for (const clip of clips) {
    const length = clipMs(clip);
    if (left < length)
      return { clip, clock: clipStart(clip) + (left / 1000) * REPLAY_SPEED };
    left -= length;
    if (left < CLIP_GAP_MS) return { clip, clock: clipEnd(clip) };
    left -= CLIP_GAP_MS;
  }
  return null;
}

/** The two frames around `clock` and how far between them it is (0 to 1). */
export function framesAround(
  frames: readonly PositionFrame[],
  clock: number,
): { prev: PositionFrame; next: PositionFrame; alpha: number } {
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1]!.clock_s <= clock) i += 1;
  const prev = frames[i]!;
  const next = frames[Math.min(i + 1, frames.length - 1)]!;
  const span = next.clock_s - prev.clock_s;
  const alpha =
    span > 0 ? Math.min(1, Math.max(0, (clock - prev.clock_s) / span)) : 1;
  return { prev, next, alpha };
}
