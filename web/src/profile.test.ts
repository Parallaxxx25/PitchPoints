import { expect, test, vi } from "vitest";

// The persist middleware reads `window.localStorage`, which Node does not have, so give it one.
const storage = vi.hoisted(() => {
  const items = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as Storage;
  Object.assign(globalThis, { window: { localStorage } });
  return items;
});

import { AWAY, HOME } from "./fixtures.ts";
import {
  autoSquad,
  DEFAULT_PROFILE,
  SQUAD_SIZE,
  squadIsValid,
  useProfile,
} from "./profile.ts";

const ids = HOME.starters.map((p) => p.id);

test("a squad needs 11 distinct players with a captain and a different vice-captain from among them", () => {
  expect(squadIsValid(ids, ids[9]!, ids[8]!)).toBe(true);
  expect(squadIsValid(ids.slice(0, 10), ids[9]!, ids[8]!)).toBe(false);
  expect(squadIsValid([...ids.slice(0, 10), ids[0]!], ids[9]!, ids[8]!)).toBe(
    false,
  );
  expect(squadIsValid(ids, ids[9]!, ids[9]!)).toBe(false);
  expect(squadIsValid(ids, null, ids[8]!)).toBe(false);
  expect(squadIsValid(ids, "HOM-99", ids[8]!)).toBe(false);
  expect(squadIsValid(ids, ids[9]!, "AWY-1")).toBe(false);
});

test("auto-pick gives a valid squad from one team's starters", () => {
  for (const team of [HOME, AWAY]) {
    const squad = autoSquad(team);
    expect(squad.players).toHaveLength(SQUAD_SIZE);
    expect(squadIsValid(squad.players, squad.captain, squad.vice)).toBe(true);
    const position = (id: string) =>
      team.starters.find((p) => p.id === id)!.position;
    expect(position(squad.captain)).toBe("FWD");
    expect(position(squad.vice)).toBe("MID");
  }
});

test("stored choices fill in around the defaults, and unknown modes or languages fall back", () => {
  const merge = useProfile.persist.getOptions().merge!;
  const current = useProfile.getState();
  const stored = {
    profile: { display_name: "Sam", mode: "analyst", language: "th" },
  };
  expect(merge(stored, current)).toMatchObject({
    profile: {
      ...DEFAULT_PROFILE,
      display_name: "Sam",
      mode: "analyst",
      language: "th",
    },
  });
  const bad = { profile: { mode: "dancing", language: "xx" } };
  expect(merge(bad, current)).toMatchObject({
    profile: { mode: DEFAULT_PROFILE.mode, language: DEFAULT_PROFILE.language },
  });
  expect(merge(undefined, current)).toMatchObject({ profile: DEFAULT_PROFILE });
});

test("only the choices are stored, not the session's server id or dialog", () => {
  const persisted = useProfile.persist.getOptions().partialize!(
    useProfile.getState(),
  );
  expect(Object.keys(persisted)).toEqual(["profile"]);
});

test("a change is saved to localStorage and restored by the next visit", async () => {
  useProfile.getState().update({ language: "pt", display_name: "Ana" });
  useProfile.getState().setProfileId("server-id");
  const saved = JSON.parse(storage.get("pitchpoints.profile")!);
  expect(Object.keys(saved.state)).toEqual(["profile"]);
  expect(saved.state.profile).toMatchObject({
    language: "pt",
    display_name: "Ana",
  });

  // Resetting the store writes the defaults over it, so put the saved visit back as a new page load finds it.
  useProfile.setState({ profile: DEFAULT_PROFILE, profileId: null });
  storage.set("pitchpoints.profile", JSON.stringify(saved));
  await useProfile.persist.rehydrate();
  expect(useProfile.getState().profile).toMatchObject({
    language: "pt",
    display_name: "Ana",
  });
  expect(useProfile.getState().profileId).toBeNull();
});
