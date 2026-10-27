import { describe, expect, test } from "vitest";
import { ALL_CUES, ALL_MOMENTS, META } from "./fixtures.ts";
import { LANGUAGES } from "./profile.ts";
import {
  describeCue,
  describeMoment,
  eventName,
  formatStat,
  PLAYER_STAT_ROWS,
  ruleLabel,
  TEAM_STAT_ROWS,
} from "./text.ts";

const goal = ALL_MOMENTS[0]!;
const unfilled = /\{\w+\}/;

test("a goal moment names the scorer, the score, the assist, and where the numbers come from", () => {
  const text = describeMoment(goal, { language: "en", meta: META });
  expect(text.text).toBe(
    "Harbour Rovers Player 10 scores for Harbour Rovers. HAR 1–0 RID.",
  );
  expect(text.details).toEqual([
    "Assist: Harbour Rovers Player 11.",
    "The first goal of the match.",
  ]);
  expect(text.why).toEqual([
    "Win probability moved 35 points.",
    "Importance 0.35 out of 1.",
    "xG 0.10 · shot 92 km/h",
  ]);
});

test("an own goal and a penalty are told differently", () => {
  const own = describeMoment(
    {
      ...goal,
      facts: { ...goal.facts, own_goal: true },
      player_ids: ["AWY-4"],
    },
    { language: "en", meta: META },
  );
  expect(own.text).toContain("Own goal by Ridge United Player 4");
  expect(own.details).not.toContain("Assist: Harbour Rovers Player 11.");
  const penalty = describeMoment(
    { ...goal, facts: { ...goal.facts, penalty: true } },
    { language: "en", meta: META },
  );
  expect(penalty.text).toContain("scores a penalty");
});

describe.each(LANGUAGES)("%s", (language) => {
  test("every moment type and milestone reads as a sentence with no placeholder left", () => {
    for (const m of ALL_MOMENTS) {
      const text = describeMoment(m, { language, meta: META });
      expect(
        text.text.length,
        `${m.type} ${m.facts.milestone ?? ""}`,
      ).toBeGreaterThan(10);
      for (const part of [
        text.badge,
        text.text,
        ...text.details,
        ...text.why,
      ]) {
        expect(part).not.toMatch(unfilled);
      }
    }
  });

  test("every overlay template has words, and no placeholder is left", () => {
    for (const cue of ALL_CUES) {
      const text = describeCue(cue, { language, meta: META }, ALL_MOMENTS);
      const words = [
        text.title,
        ...text.lines,
        ...text.rows.flatMap((r) => [r.label, r.home, r.away]),
      ];
      expect(words.filter(Boolean).length, cue.template).toBeGreaterThan(0);
      for (const w of words) expect(w).not.toMatch(unfilled);
    }
  });

  test("every event type, fantasy rule, and stat has a name", () => {
    expect(eventName({ type: "goal" }, language).length).toBeGreaterThan(0);
    expect(ruleLabel(language, "clean_sheet")).not.toBe("clean_sheet");
    for (const row of [...TEAM_STAT_ROWS, ...PLAYER_STAT_ROWS]) {
      expect(formatStat(language, row.kind, 0.5)).not.toBe("–");
    }
  });
});

test("stat cues are templated from the cue's own numbers", () => {
  const compare = ALL_CUES.find((c) => c.template === "stat_compare")!;
  const text = describeCue(
    compare,
    { language: "en", meta: META },
    ALL_MOMENTS,
  );
  expect(text.title).toBe("First half");
  expect(text.rows.find((r) => r.label === "Possession")).toEqual({
    label: "Possession",
    home: "50.0%",
    away: "40.0%",
  });
  const recap = describeCue(
    ALL_CUES.at(-1)!,
    { language: "en", meta: META },
    ALL_MOMENTS,
  );
  expect(recap.title).toBe("Full time: HAR 2–1 RID");
  expect(recap.lines).toHaveLength(2);
});

test("a key-moment cue reuses the moment's text, and written text for the language wins", () => {
  const cue = ALL_CUES.find((c) => c.template === "key_moment")!;
  const reused = describeCue(cue, { language: "en", meta: META }, ALL_MOMENTS);
  expect(reused.lines[0]).toBe(
    describeMoment(goal, { language: "en", meta: META }).text,
  );
  const written = describeCue(
    { ...cue, text: { en: "Written line." } },
    { language: "en", meta: META },
    ALL_MOMENTS,
  );
  expect(written.lines).toEqual(["Written line."]);
});

test("the momentum cue carries the bar value and names the team on top", () => {
  const cue = ALL_CUES.find((c) => c.template === "momentum_bar")!;
  const text = describeCue(cue, { language: "en", meta: META }, ALL_MOMENTS);
  expect(text.bar).toBe(70);
  expect(text.title).toBe("Momentum: Harbour Rovers");
});

test("formatting stats", () => {
  expect(formatStat("en", "percent", null)).toBe("–");
  expect(formatStat("en", "percent", 0.5)).toBe("50.0%");
  expect(formatStat("en", "decimal2", 1.236)).toBe("1.24");
  expect(ruleLabel("en", "no_such_rule")).toBe("no_such_rule");
});
