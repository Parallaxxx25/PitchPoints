import { beforeEach, expect, test } from "vitest";
import {
  AWAY,
  event,
  frame,
  HOME,
  ledgerEntry,
  META,
  moment,
  STATE,
  STATS,
  TACTICAL,
} from "./fixtures.ts";
import {
  EMPTY,
  HEAT_COLS,
  heatOf,
  type LiveData,
  liveMinute,
  MAX_EVENTS,
  reduceMessage,
  RECENT_EVENTS,
  timelineMinute,
  upsert,
  useLive,
} from "./store.ts";

test("the live minute follows the latest event or frame, not the last pushed state", () => {
  expect(liveMinute(EMPTY)).toBe(0);
  const s = run([STATE, frame(754)]);
  expect(s.state?.minute).toBe(10);
  expect(liveMinute(s)).toBe(12);
});

test("a seek keeps the squad total, which the server sends just before the new state", () => {
  const before = run([
    STATE,
    { kind: "squad_total", match_id: META.match_id, profile_id: "p", total: 9 },
  ]);
  const after = {
    ...before,
    ...reduceMessage(before, { ...STATE, revision: 1 }, 0),
  };
  expect(after.squadTotal).toBe(9);
});

function run(messages: Parameters<typeof reduceMessage>[1][]): LiveData {
  return messages.reduce<LiveData>(
    (s, m, i) => ({ ...s, ...reduceMessage(s, m, i * 10) }),
    EMPTY,
  );
}

test("each position frame keeps the one before it, for interpolation", () => {
  const s = run([frame(2), frame(4)]);
  expect(s.prevFrame?.clock_s).toBe(2);
  expect(s.frame?.clock_s).toBe(4);
  expect(s.frameAt - s.prevFrameAt).toBe(10);
  expect(s.clock).toEqual({ period: 1, clock_s: 4 });
});

test("recent events are bounded and every event is kept for replaying stat sources", () => {
  const events = Array.from({ length: RECENT_EVENTS + 5 }, (_, i) =>
    event({ id: i + 1, type: "pass" }),
  );
  const s = run(events);
  expect(s.recent).toHaveLength(RECENT_EVENTS);
  expect(s.recent.at(-1)?.event.id).toBe(events.length);
  expect(s.events).toHaveLength(events.length);
});

test("the event log never grows past its cap", () => {
  let s: LiveData = EMPTY;
  for (let i = 1; i <= MAX_EVENTS + 3; i++) {
    s = { ...s, ...reduceMessage(s, event({ id: i, type: "pass" }), 0) };
  }
  expect(s.events).toHaveLength(MAX_EVENTS);
  expect(s.events[0]?.id).toBe(4);
});

test("a moment or cue with a known id replaces the old one and ids stay in order", () => {
  const list = upsert(
    [{ id: 3 }, { id: 1 }].sort((a, b) => a.id - b.id),
    { id: 2 },
  );
  expect(list.map((x) => x.id)).toEqual([1, 2, 3]);
  const replaced = upsert([{ id: 1, v: "old" }], { id: 1, v: "new" });
  expect(replaced).toEqual([{ id: 1, v: "new" }]);
  const s = run([
    moment({ id: 2, type: "goal" }),
    moment({ id: 1, type: "card" }),
    moment({ id: 2, type: "save" }),
  ]);
  expect(s.moments.map((m) => [m.id, m.type])).toEqual([
    [1, "card"],
    [2, "save"],
  ]);
});

test("a later ledger entry with the same id supersedes the earlier one", () => {
  const s = run([
    ledgerEntry({ id: "p:bonus", delta: 3, provisional: true }),
    ledgerEntry({ id: "p:goal:5", delta: 4 }),
    ledgerEntry({ id: "p:bonus", delta: 1, provisional: false }),
  ]);
  expect(Object.keys(s.ledger).sort()).toEqual(["p:bonus", "p:goal:5"]);
  expect(s.ledger["p:bonus"]).toMatchObject({ delta: 1, provisional: false });
});

test("stats and tactical state for the same minute share one timeline point", () => {
  const s = run([STATS, TACTICAL]);
  expect(s.timeline).toHaveLength(1);
  expect(s.timeline[0]).toMatchObject({
    minute: 10,
    xgHome: STATS.home.xg,
    momentum: TACTICAL.momentum,
    win: TACTICAL.win_probability,
  });
  const later = run([STATS, { ...STATS, minute: 11, clock_s: 660 }]);
  expect(later.timeline.map((p) => p.minute)).toEqual([10, 11]);
});

test("stoppage time joins the last minute of its half on the timeline", () => {
  expect(timelineMinute(1, 600)).toBe(10);
  expect(timelineMinute(1, 45 * 60 + 130)).toBe(45);
  expect(timelineMinute(2, 45 * 60)).toBe(45);
  expect(timelineMinute(2, 90 * 60 + 200)).toBe(90);
});

test("a seek (a new revision) clears what came from the old timeline and keeps the earlier history", () => {
  const before = run([
    STATE,
    STATS,
    TACTICAL,
    { ...STATS, minute: 40, clock_s: 2400 },
    event({ id: 1, type: "goal" }),
    moment({ id: 1, type: "goal" }),
    ledgerEntry({ id: "x" }),
    frame(10),
  ]);
  expect(before.timeline.map((p) => p.minute)).toEqual([10, 40]);
  const after = {
    ...before,
    ...reduceMessage(before, { ...STATE, revision: 1, minute: 20 }, 0),
  };
  expect(after.timeline.map((p) => p.minute)).toEqual([10]);
  expect(after).toMatchObject({
    events: [],
    recent: [],
    moments: [],
    cues: [],
    ledger: {},
    frame: null,
  });
  expect(after.state?.revision).toBe(1);
});

test("a state with the same revision keeps everything", () => {
  const before = run([
    STATE,
    event({ id: 1, type: "goal" }),
    moment({ id: 1, type: "goal" }),
  ]);
  const after = {
    ...before,
    ...reduceMessage(before, { ...STATE, minute: 11 }, 0),
  };
  expect(after.events).toHaveLength(1);
  expect(after.moments).toHaveLength(1);
});

test("the heatmap is team-relative: both teams count in their own attacking direction", () => {
  const live = useLive.getState();
  live.setMatch(META.match_id);
  live.apply(META);
  live.apply(frame(10));
  live.apply(frame(2710, 0, 2));
  const home = heatOf("HOM-1");
  const away = heatOf("AWY-1");
  expect(home?.[1 * HEAT_COLS + 6]).toBe(2);
  expect(away?.[12 * HEAT_COLS + 6]).toBe(2);
  expect(HOME.id).not.toBe(AWAY.id);
});

beforeEach(() => {
  useLive.getState().setMatch(null);
});
