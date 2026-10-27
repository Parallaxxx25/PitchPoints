import { expect, test } from "vitest";
import { event, frame, META } from "./fixtures.ts";
import { buildClips, MARK_TTL_S, SOURCE_TTL_S } from "./replay.ts";
import {
  eventMark,
  frameScene,
  ICON_TTL_MS,
  LINE_TTL_MS,
  liveMarks,
  MAX_PASS_LINE_SPEED,
  replayScene,
} from "./scene.ts";

const dot = (scene: ReturnType<typeof frameScene>, id: string) =>
  scene.dots.find((d) => d.id === id)!;

test("players glide and the ball eases between two frames", () => {
  const scene = frameScene(META, frame(100), frame(102, 2), 0.5);
  expect(scene.dots).toHaveLength(22);
  expect(dot(scene, "HOM-1").x).toBeCloseTo(31);
  expect(dot(scene, "HOM-1").y).toBeCloseTo(6);
  expect(scene.ball?.x).toBeCloseTo(53.5);
  const early = frameScene(META, frame(100), frame(102, 2), 0.1);
  expect(early.ball!.x - 52.5).toBeLessThan(0.1 * 2);
});

test("second-half frames are flipped so the teams change ends", () => {
  const first = frameScene(META, null, frame(10, 0, 1), 1);
  const second = frameScene(META, null, frame(2710, 0, 2), 1);
  expect(dot(first, "HOM-1").x).toBe(30);
  expect(dot(second, "HOM-1").x).toBe(75);
  expect(dot(second, "HOM-1").y).toBe(62);
  expect(dot(first, "HOM-1").side).toBe("home");
  expect(dot(first, "AWY-1").side).toBe("away");
});

test("frames from different halves are not interpolated", () => {
  const scene = frameScene(META, frame(2698, 0, 1), frame(2700, 2, 2), 0.5);
  expect(dot(scene, "HOM-1").x).toBe(105 - 32);
});

test("an event becomes a mark in screen coordinates, flipped for the away team", () => {
  const pass = event({
    id: 1,
    type: "pass",
    team_id: META.away.id,
    x: 20,
    y: 10,
    end_x: 40,
    end_y: 20,
  });
  expect(eventMark(META, pass, 1, false)).toMatchObject({
    from: { x: 85, y: 58 },
    to: { x: 65, y: 48 },
  });
  const homePass = { ...pass, team_id: META.home.id };
  expect(eventMark(META, homePass, 1, false)).toMatchObject({
    from: { x: 20, y: 10 },
  });
});

test("events with nothing to draw give no mark; cards have no line", () => {
  expect(
    eventMark(META, event({ id: 2, type: "pressure", x: 5, y: 5 }), 1, false),
  ).toBeNull();
  expect(eventMark(META, event({ id: 3, type: "pass" }), 1, false)).toBeNull();
  const card = eventMark(
    META,
    event({ id: 4, type: "card", x: 50, y: 30, card: "red" }),
    1,
    true,
  );
  expect(card).toMatchObject({ to: null, card: "red", source: true });
});

test("live marks fade with real time and leave after their time to live", () => {
  const shot = event({
    id: 5,
    type: "shot",
    x: 90,
    y: 30,
    end_x: 105,
    end_y: 34,
  });
  const goal = event({ id: 6, type: "goal", x: 95, y: 34 });
  const recent = [
    { event: shot, at: 0 },
    { event: goal, at: 0 },
  ];
  const half = liveMarks(META, recent, LINE_TTL_MS / 2, 18);
  expect(half.map((m) => m.key)).toEqual([5, 6]);
  expect(half[0]!.opacity).toBeCloseTo(0.5);
  const later = liveMarks(META, recent, LINE_TTL_MS + 1, 18);
  expect(later.map((m) => m.key)).toEqual([6]);
  expect(liveMarks(META, recent, ICON_TTL_MS + 1, 18)).toEqual([]);
});

test("passes are not drawn above the pass-line speed limit", () => {
  const pass = event({
    id: 7,
    type: "pass",
    x: 40,
    y: 30,
    end_x: 50,
    end_y: 30,
  });
  const recent = [{ event: pass, at: 0 }];
  expect(liveMarks(META, recent, 100, MAX_PASS_LINE_SPEED)).toHaveLength(1);
  expect(liveMarks(META, recent, 100, 60)).toHaveLength(0);
});

test("a replay shows each event from when it happens, and the replayed ones longer", () => {
  const clips = buildClips({
    match_id: META.match_id,
    source_event_ids: [7],
    events: [
      event({
        id: 7,
        type: "shot",
        clock_s: 106,
        x: 90,
        y: 30,
        end_x: 105,
        end_y: 34,
      }),
      event({
        id: 8,
        type: "pass",
        clock_s: 104,
        x: 60,
        y: 30,
        end_x: 80,
        end_y: 30,
      }),
    ],
    frames: [100, 102, 104, 106, 108, 110].map((c) => frame(c)),
  });
  const clip = clips[0]!;
  const at = (clock: number) => replayScene(META, { clip, clock });
  expect(at(103).marks).toEqual([]);
  expect(at(105).marks.map((m) => m.key)).toEqual([8]);
  const during = at(107).marks;
  expect(during.map((m) => [m.key, m.source])).toEqual([[7, true]]);
  expect(during[0]!.opacity).toBeCloseTo(1 - 1 / SOURCE_TTL_S);
  expect(at(104 + MARK_TTL_S + 0.1).marks.map((m) => m.key)).toEqual([7]);
  expect(at(107).dots).toHaveLength(22);
});
