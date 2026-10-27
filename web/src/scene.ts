import type {
  MatchEvent,
  MatchMetadata,
  PositionFrame,
} from "./contracts.gen.ts";
import { type Point, toScreenCoords } from "./coords.ts";
import {
  type Cursor,
  framesAround,
  MARK_TTL_S,
  SOURCE_TTL_S,
} from "./replay.ts";
import { rosterOf, type Side, sideOf } from "./roster.ts";

/** How long a pass or shot line stays on the pitch, in real milliseconds. */
export const LINE_TTL_MS = 1600;
/** The same for goals, cards, and other event markers. */
export const ICON_TTL_MS = 3600;
/** Faster than this, passes are not drawn: they would cover the pitch. */
export const MAX_PASS_LINE_SPEED = 18;

export interface Dot {
  id: string;
  side: Side;
  shirt: number;
  x: number;
  y: number;
}

/** An event drawn on the pitch, in screen coordinates. */
export interface Mark {
  key: number;
  type: MatchEvent["type"];
  card: MatchEvent["card"];
  from: Point;
  to: Point | null;
  opacity: number;
  /** Whether this is one of the events being replayed. */
  source: boolean;
}

export interface Scene {
  ball: Point | null;
  dots: Dot[];
  marks: Mark[];
}

export const EMPTY_SCENE: Scene = { ball: null, dots: [], marks: [] };

const LINES = new Set<MatchEvent["type"]>([
  "pass",
  "carry",
  "shot",
  "goal",
  "own_goal",
]);
const ICONS = new Set<MatchEvent["type"]>([
  "goal",
  "own_goal",
  "card",
  "save",
  "corner",
  "foul",
  "penalty_won",
]);
const DRAWN = new Set<MatchEvent["type"]>([...LINES, ...ICONS, "block"]);

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Players and ball between two frames: `alpha` 0 is `prev`, 1 is `next`. The ball eases, players glide. */
export function frameScene(
  meta: MatchMetadata,
  prev: PositionFrame | null,
  next: PositionFrame,
  alpha: number,
): Pick<Scene, "ball" | "dots"> {
  const from = prev && prev.period === next.period ? prev : next;
  const before = new Map(from.players.map((p) => [p.player_id, p]));
  const roster = rosterOf(meta);
  const dots: Dot[] = [];
  for (const p of next.players) {
    const entry = roster.get(p.player_id);
    if (!entry) continue;
    const q = before.get(p.player_id) ?? p;
    const { x, y } = toScreenCoords(
      lerp(q.x, p.x, alpha),
      lerp(q.y, p.y, alpha),
      "home",
      next.period,
    );
    dots.push({
      id: p.player_id,
      side: entry.side,
      shirt: entry.info.shirt,
      x,
      y,
    });
  }
  const eased = smooth(alpha);
  const ball = toScreenCoords(
    lerp(from.ball_x, next.ball_x, eased),
    lerp(from.ball_y, next.ball_y, eased),
    "home",
    next.period,
  );
  return { ball, dots };
}

/** The mark for an event, or null when it has no place on the pitch. */
export function eventMark(
  meta: MatchMetadata,
  e: MatchEvent,
  opacity: number,
  source: boolean,
): Mark | null {
  if (e.x === null || e.y === null || !DRAWN.has(e.type)) return null;
  const side = sideOf(meta, e.team_id);
  const from = toScreenCoords(e.x, e.y, side, e.period);
  const hasEnd = LINES.has(e.type) && e.end_x !== null && e.end_y !== null;
  const to = hasEnd ? toScreenCoords(e.end_x!, e.end_y!, side, e.period) : null;
  return { key: e.id, type: e.type, card: e.card, from, to, opacity, source };
}

/** Marks for the events that just arrived live; they fade out in real time. */
export function liveMarks(
  meta: MatchMetadata,
  recent: readonly { event: MatchEvent; at: number }[],
  now: number,
  speed: number,
): Mark[] {
  const marks: Mark[] = [];
  for (const { event, at } of recent) {
    if (event.type === "pass" && speed > MAX_PASS_LINE_SPEED) continue;
    const ttl = ICONS.has(event.type) ? ICON_TTL_MS : LINE_TTL_MS;
    const age = now - at;
    if (age >= ttl) continue;
    const mark = eventMark(meta, event, 1 - age / ttl, false);
    if (mark) marks.push(mark);
  }
  return marks;
}

/** The pitch during a replay: frames around the cursor's clock, and the events that just happened. */
export function replayScene(
  meta: MatchMetadata,
  { clip, clock }: Cursor,
): Scene {
  const { prev, next, alpha } = framesAround(clip.frames, clock);
  const marks: Mark[] = [];
  for (const event of clip.events) {
    const age = clock - event.clock_s;
    const source = clip.sources.has(event.id);
    const ttl = source ? SOURCE_TTL_S : MARK_TTL_S;
    if (age < 0 || age >= ttl) continue;
    const mark = eventMark(meta, event, 1 - age / ttl, source);
    if (mark) marks.push(mark);
  }
  return { ...frameScene(meta, prev, next, alpha), marks };
}
