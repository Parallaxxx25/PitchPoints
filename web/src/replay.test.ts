import { expect, test } from "vitest";
import type { Replay } from "./contracts.gen.ts";
import { event, frame, HOME, META } from "./fixtures.ts";
import {
  buildClips,
  CLIP_GAP_MS,
  cursorAt,
  framesAround,
  REPLAY_SPEED,
  replayMs,
  STAT_REPLAY_EVENTS,
  statSourceIds,
} from "./replay.ts";

const shot = event({ id: 7, type: "shot", clock_s: 106 });
const replay: Replay = {
  match_id: META.match_id,
  source_event_ids: [7],
  events: [
    shot,
    event({ id: 8, type: "pass", clock_s: 303 }),
    event({ id: 9, type: "pass", clock_s: 900 }),
  ],
  frames: [
    ...[100, 102, 104, 106, 108, 110].map((c) => frame(c)),
    ...[300, 302, 304, 306].map((c) => frame(c)),
    frame(500),
  ],
};

test("nearby frames form a clip, far-apart ones start another, and a lone frame is dropped", () => {
  const clips = buildClips(replay);
  expect(clips.map((c) => c.frames.length)).toEqual([6, 4]);
});

test("events join the clip they happened in; events outside every clip are dropped", () => {
  const clips = buildClips(replay);
  expect(clips[0]!.events.map((e) => e.id)).toEqual([7]);
  expect(clips[1]!.events.map((e) => e.id)).toEqual([8]);
  expect(clips[0]!.sources.has(7)).toBe(true);
  expect(clips[1]!.sources.has(8)).toBe(false);
});

test("a replay with a clip in each half does not join them", () => {
  const two: Replay = {
    ...replay,
    frames: [
      frame(2698, 0, 1),
      frame(2700, 0, 1),
      frame(2700, 0, 2),
      frame(2702, 0, 2),
    ],
    events: [],
  };
  expect(buildClips(two).map((c) => c.period)).toEqual([1, 2]);
});

test("the cursor plays each clip at replay speed, holds between clips, then ends", () => {
  const clips = buildClips(replay);
  const first = ((110 - 100) / REPLAY_SPEED) * 1000;
  const second = ((306 - 300) / REPLAY_SPEED) * 1000;
  expect(replayMs(clips)).toBe(first + second + 2 * CLIP_GAP_MS);

  expect(cursorAt(clips, 0)).toMatchObject({ clock: 100 });
  expect(cursorAt(clips, first / 2)?.clock).toBe(105);
  expect(cursorAt(clips, first + 10)).toMatchObject({ clock: 110 });
  expect(cursorAt(clips, first + CLIP_GAP_MS)?.clip).toBe(clips[1]);
  expect(cursorAt(clips, first + CLIP_GAP_MS)?.clock).toBe(300);
  expect(cursorAt(clips, replayMs(clips) - 1)?.clock).toBe(306);
  expect(cursorAt(clips, replayMs(clips))).toBeNull();
});

test("the frames around a clock and how far between them it is", () => {
  const frames = [100, 102, 104, 106].map((c) => frame(c));
  expect(framesAround(frames, 105)).toMatchObject({ alpha: 0.5 });
  expect(framesAround(frames, 105).prev.clock_s).toBe(104);
  expect(framesAround(frames, 100).alpha).toBe(0);
  expect(framesAround(frames, 999).alpha).toBe(1);
});

test("a stat's source events are the team's latest events of that kind", () => {
  const events = [
    ...Array.from({ length: 8 }, (_, i) =>
      event({ id: i + 1, type: "shot", team_id: HOME.id }),
    ),
    event({ id: 20, type: "shot", team_id: META.away.id }),
    event({ id: 21, type: "shot", team_id: HOME.id, outcome: "saved" }),
    event({ id: 22, type: "card", team_id: HOME.id, card: "red" }),
  ];
  const shots = statSourceIds(events, "shots", HOME.id);
  expect(shots).toHaveLength(STAT_REPLAY_EVENTS);
  expect(shots).toEqual([5, 6, 7, 8, 21]);
  expect(statSourceIds(events, "shots_on_target", HOME.id)).toEqual([21]);
  expect(statSourceIds(events, "red_cards", HOME.id)).toEqual([22]);
  expect(statSourceIds(events, "yellow_cards", HOME.id)).toEqual([]);
  expect(statSourceIds(events, "passes", HOME.id)).toEqual([]);
});
