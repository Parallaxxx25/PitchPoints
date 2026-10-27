import { expect, test } from "vitest";
import { PITCH_LENGTH, PITCH_WIDTH, toScreenCoords } from "./coords.ts";

test("home-perspective coordinates are as they are in the first half and flipped in the second", () => {
  expect(toScreenCoords(80, 10, "home", 1)).toEqual({ x: 80, y: 10 });
  expect(toScreenCoords(80, 10, "home", 2)).toEqual({ x: 25, y: 58 });
});

test("away-perspective coordinates are flipped in the first half and as they are in the second", () => {
  expect(toScreenCoords(80, 10, "away", 1)).toEqual({ x: 25, y: 58 });
  expect(toScreenCoords(80, 10, "away", 2)).toEqual({ x: 80, y: 10 });
});

test("each team attacks toward the opposite end of the pitch at all times", () => {
  for (const period of [1, 2] as const) {
    const home = toScreenCoords(PITCH_LENGTH, 34, "home", period).x;
    const away = toScreenCoords(PITCH_LENGTH, 34, "away", period).x;
    expect([home, away].sort((a, b) => a - b)).toEqual([0, PITCH_LENGTH]);
  }
  expect(toScreenCoords(PITCH_LENGTH, 34, "home", 1).x).toBe(PITCH_LENGTH);
  expect(toScreenCoords(PITCH_LENGTH, 34, "home", 2).x).toBe(0);
});

test("a team-relative view uses the period in which the team attacks left to right", () => {
  const home = toScreenCoords(30, 6, "home", 1);
  const away = toScreenCoords(30, 6, "away", 2);
  expect(home).toEqual(away);
  expect(toScreenCoords(PITCH_LENGTH - 30, PITCH_WIDTH - 6, "away", 1)).toEqual(
    home,
  );
});
