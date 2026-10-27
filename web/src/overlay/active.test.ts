import { expect, test } from "vitest";
import { cue } from "../fixtures.ts";
import { activeCues, MIN_SHOW_MS, visibleCues } from "./active.ts";

const at = (clock_s: number, period: 1 | 2 = 1) => ({ period, clock_s });

test("a cue shows from its start for its duration, in its own half", () => {
  const cues = [
    cue({ id: 1, template: "key_moment", start_clock_s: 100, duration_s: 8 }),
  ];
  expect(activeCues(cues, at(99))).toEqual([]);
  expect(activeCues(cues, at(100)).map((c) => c.id)).toEqual([1]);
  expect(activeCues(cues, at(107.9)).map((c) => c.id)).toEqual([1]);
  expect(activeCues(cues, at(108))).toEqual([]);
  expect(activeCues(cues, at(104, 2))).toEqual([]);
  expect(activeCues(cues, null)).toEqual([]);
});

test("only one cue per template shows: the higher priority, then the later one", () => {
  const cues = [
    cue({ id: 1, template: "player_tag", priority: 40, start_clock_s: 100 }),
    cue({ id: 2, template: "player_tag", priority: 40, start_clock_s: 102 }),
    cue({ id: 3, template: "player_tag", priority: 45, start_clock_s: 101 }),
    cue({ id: 4, template: "key_moment", priority: 90, start_clock_s: 101 }),
  ];
  expect(activeCues(cues, at(103)).map((c) => c.id)).toEqual([4, 3]);
  const tie = cues.filter((c) => c.id !== 3);
  expect(activeCues(tie, at(103)).map((c) => c.id)).toEqual([4, 2]);
});

test("a cue whose time has passed stays up until it has been shown for the minimum time", () => {
  const cues = [
    cue({ id: 1, template: "key_moment", start_clock_s: 100, duration_s: 8 }),
  ];
  const firstSeen = new Map([[1, 1000]]);
  const later = at(200);
  expect(
    visibleCues(cues, later, firstSeen, 1000 + MIN_SHOW_MS - 1).map(
      (c) => c.id,
    ),
  ).toEqual([1]);
  expect(visibleCues(cues, later, firstSeen, 1000 + MIN_SHOW_MS)).toEqual([]);
  expect(visibleCues(cues, later, new Map(), 5000)).toEqual([]);
});

test("a cue still in its window shows even after the minimum time, and nothing shows without a clock", () => {
  const cues = [
    cue({ id: 1, template: "key_moment", start_clock_s: 100, duration_s: 20 }),
  ];
  const firstSeen = new Map([[1, 0]]);
  expect(
    visibleCues(cues, at(110), firstSeen, 10 * MIN_SHOW_MS).map((c) => c.id),
  ).toEqual([1]);
  expect(visibleCues(cues, null, firstSeen, 0)).toEqual([]);
});
