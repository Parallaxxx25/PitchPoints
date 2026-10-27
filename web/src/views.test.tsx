import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Feed } from "./components/Feed.tsx";
import { Header } from "./components/Header.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { PitchView } from "./components/Pitch.tsx";
import { PitchHeader } from "./components/PitchHeader.tsx";
import { PlayerDrawer } from "./components/PlayerDrawer.tsx";
import { SquadPage } from "./components/SquadPage.tsx";
import { SquadStrip } from "./components/SquadStrip.tsx";
import { TeamPanel } from "./components/TeamPanel.tsx";
import { startReplay, stopReplay } from "./connection.ts";
import type { FantasySquad, Replay } from "./contracts.gen.ts";
import {
  ALL_CUES,
  ALL_MOMENTS,
  AWAY,
  event,
  frame,
  HOME,
  ledgerEntry,
  META,
  seedStore,
  STATE,
} from "./fixtures.ts";
import { AnalystView } from "./modes/AnalystView.tsx";
import { CasualView } from "./modes/CasualView.tsx";
import { ClubView } from "./modes/ClubView.tsx";
import { FantasyView } from "./modes/FantasyView.tsx";
import { PlayerFocusView } from "./modes/PlayerFocusView.tsx";
import { CueGraphic } from "./overlay/CueGraphic.tsx";
import { OverlayPage } from "./overlay/OverlayPage.tsx";
import { autoSquad, LANGUAGES, useProfile } from "./profile.ts";
import { eventMark, frameScene } from "./scene.ts";
import { useLive } from "./store.ts";
import { describeCue } from "./text.ts";

/** Server-render with the stores as they are now (zustand reads its initial state when rendering on the server). */
const html = (element: React.ReactElement) => {
  Object.assign(useLive.getInitialState(), useLive.getState());
  Object.assign(useProfile.getInitialState(), useProfile.getState());
  return renderToString(element).replaceAll("<!-- -->", "");
};

const auto = autoSquad(HOME);
const SQUAD: FantasySquad = {
  players: auto.players as FantasySquad["players"],
  captain_id: auto.captain,
  vice_captain_id: auto.vice,
};
const LEDGER = {
  a: ledgerEntry({
    id: "a",
    player_id: "HOM-10",
    rule_id: "goal",
    delta: 4,
    minute: 12,
  }),
  b: ledgerEntry({
    id: "b",
    player_id: "HOM-10",
    rule_id: "bonus",
    delta: 3,
    provisional: true,
    reason: "Top bonus score",
    minute: 30,
  }),
  c: ledgerEntry({
    id: "c",
    player_id: "AWY-1",
    rule_id: "saves",
    delta: 1,
    minute: 20,
  }),
  z: ledgerEntry({
    id: "z",
    player_id: "HOM-2",
    rule_id: "bonus",
    delta: 0,
    provisional: true,
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pitch", () => {
  test("draws every player, the ball, replayed events, the captain, and the open player", () => {
    const mark = eventMark(
      META,
      event({ id: 1, type: "shot", x: 90, y: 30, end_x: 105, end_y: 34 }),
      1,
      true,
    )!;
    const scene = { ...frameScene(META, null, frame(10), 1), marks: [mark] };
    const out = html(
      <PitchView
        scene={scene}
        meta={META}
        label="A pitch"
        focusId="HOM-9"
        captainId="HOM-10"
      />,
    );
    expect(out).toContain('aria-label="A pitch"');
    expect(out.match(/data-player=/g)).toHaveLength(22);
    expect(out).toContain("data-ball");
    expect(out).toContain('data-mark="shot"');
    expect(out.match(/data-captain/g)).toHaveLength(1);
    expect(
      out.match(/stroke-dasharray="1.2 0.8"/g)!.length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("live screen panels", () => {
  test("a team rail shows each player's fantasy points, provisional points, and the viewer's squad", () => {
    seedStore({ ledger: LEDGER }, { fantasy_squad: SQUAD });
    const out = html(<TeamPanel side="home" shows="points" />);
    expect(out).toContain("Harbour Rovers Player 10");
    expect(out).toContain("7 pts");
    expect(out).toContain("Provisional");
    expect(out).toContain('aria-label="In your squad"');
    expect(out).toContain('aria-label="Captain"');
    expect(out).toContain("Starting XI (11)");
    expect(out).toContain("Substitutes (3)");
    expect(out).toContain("Team pts");
  });

  test("a team rail in minutes mode shows minutes, possession, and replayable stats", () => {
    seedStore();
    const out = html(<TeamPanel side="away" shows="minutes" stats="full" />);
    expect(out).toContain("10′");
    expect(out).toContain("Possession");
    expect(out).toContain("Replay the events behind Shots");
    expect(out).not.toContain("Team pts");
  });

  test("the player card lists the ledger, newest first, with replays and the captain flag", () => {
    seedStore({ ledger: LEDGER }, { fantasy_squad: SQUAD });
    const out = html(<PlayerDrawer playerId="HOM-10" />);
    expect(out).toContain("Captain ×2");
    expect(out.indexOf("PitchPoints bonus (simplified)")).toBeLessThan(
      out.indexOf(">Goal<"),
    );
    expect(out).toContain("Final at full time");
    expect(out).toContain("Replay 30′");
    expect(out).toContain("Replay the events behind this entry");
    expect(out).not.toContain("Top bonus score");
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain("simplified PitchPoints bonus");
    const pinned = html(<PlayerDrawer playerId="HOM-10" pinned />);
    expect(pinned).not.toContain('aria-label="Close"');
    expect(pinned).toContain("Choose a player to follow");
  });

  test("the event stream filters moments and fantasy points, and every row replays", () => {
    seedStore({ ledger: LEDGER });
    const all = html(<Feed />);
    expect(all).toContain("reaches 80 passes");
    expect(all.match(/Replay this moment/g)).toHaveLength(ALL_MOMENTS.length);
    expect(all).toMatch(/aria-pressed="true"[^>]*>All moments</);
    const big = html(<Feed initial="big" />);
    expect(big).not.toContain("reaches 80 passes");
    expect(big).toContain("scores for Harbour Rovers");
    expect(big).toContain("±35% win");
    const points = html(
      <Feed initial="points" players={new Set(["HOM-10"])} />,
    );
    expect(points).toContain("PitchPoints bonus (simplified)");
    expect(points).toContain("+4 pts");
    expect(points).not.toContain("Ridge United Player 1");
  });

  test("the squad strip shows the total, whether it can change, and the captain", () => {
    seedStore(
      { ledger: LEDGER, squadTotal: 14 },
      { fantasy_squad: SQUAD, display_name: "Ana" },
    );
    const out = html(<SquadStrip />);
    expect(out).toMatch(/data-squad-total[^>]*>14</);
    expect(out).toContain("Provisional");
    expect(out).toContain("Ana&#x27;s XI");
    expect(out).toContain("Match captain (2×)");
    seedStore();
    expect(html(<SquadStrip />)).toContain("Pick my squad");
  });
});

describe("modes", () => {
  test("Analyst opens on the tactics and timelines, with both teams a tab away", () => {
    seedStore({}, { mode: "analyst" });
    const out = html(<AnalystView />);
    expect(out).toMatch(/aria-selected="true"[^>]*>Tactics</);
    for (const tab of ["Story", HOME.short_name, AWAY.short_name])
      expect(out).toContain(`>${tab}<`);
    expect(out).toContain("Control vs chaos");
    expect(out).toContain("xG timeline");
  });

  test("an open player takes the right rail's tab", () => {
    seedStore({}, { mode: "analyst" }, { selectedPlayerId: "HOM-9" });
    const out = html(<AnalystView />);
    expect(out).toContain('id="tab-player"');
    expect(out).not.toContain('id="tab-away"');
  });

  test("Casual opens on the big moments, without the analyst's numbers", () => {
    seedStore({}, { mode: "casual" });
    const out = html(<CasualView />);
    expect(out).toMatch(/aria-selected="true"[^>]*>Story</);
    expect(out).toContain("scores for Harbour Rovers");
    expect(out).not.toContain("reaches 80 passes");
    expect(out).not.toContain("Control vs chaos");
    expect(out).not.toContain("Starting XI");
  });

  test("Fantasy opens on the points as they are scored", () => {
    seedStore({ ledger: LEDGER }, { mode: "fantasy", fantasy_squad: SQUAD });
    const out = html(<FantasyView />);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Fantasy points</);
    expect(out).toContain("+3 pts");
  });

  test("Player focus keeps a player's card open, with a picker", () => {
    seedStore({}, { mode: "player_focus", focus_metric: "top_speed_kmh" });
    const out = html(<PlayerFocusView />);
    expect(out).toContain("Harbour Rovers Player 10");
    expect(out).toContain("Choose a player to follow");
    expect(out).toContain("Top speed (km/h)");
    expect(out).toContain("29.4");
  });

  test("Club asks for a club first, then tells the match from that club's side", () => {
    seedStore({}, { mode: "club" });
    expect(html(<ClubView />)).toContain("Choose your club in your profile");
    seedStore({}, { mode: "club", favourite_club_id: AWAY.id });
    const out = html(<ClubView />);
    expect(out).toMatch(/aria-selected="true"[^>]*>Your club&#x27;s story</);
    expect(out).toContain(AWAY.name);
  });
});

describe("top bar and pages", () => {
  test("the score reads as one phrase, with status, speed, playback, and pages", () => {
    seedStore({ state: { ...STATE, status: "paused", speed: 6 } });
    const out = html(<Header />);
    expect(out).toContain("Harbour Rovers 1, Ridge United 0");
    expect(out).toContain("Paused");
    expect(out).toMatch(/aria-pressed="true"[^>]*>6×</);
    expect(out).toContain('aria-label="Resume"');
    expect(out).toMatch(/aria-current="page"[^>]*>Live match</);
    expect(out).toContain("My squad");
  });

  test("the whole interface switches language", () => {
    const live = {
      en: "Live match",
      es: "Partido en vivo",
      pt: "Partida ao vivo",
      th: "แมตช์สด",
    };
    for (const language of LANGUAGES) {
      seedStore({}, { language });
      expect(html(<Header />), language).toContain(live[language]);
    }
  });

  test("a lost connection is announced", () => {
    seedStore({ connection: "lost" });
    expect(html(<Header />)).toContain("Connection lost");
  });

  test("set-up offers the modes and a match, and says when a match has gone", () => {
    seedStore(
      { matchId: null, metadata: null, connection: "idle" },
      { mode: "analyst" },
    );
    const out = html(<Onboarding />);
    expect(out).toContain("Every moment,");
    expect(out).toContain("Choose how you watch");
    expect(out.match(/type="radio"/g)).toHaveLength(5);
    expect(out).toMatch(/checked="" value="analyst"/);
    expect(out).toContain("Recommended");
    expect(out).toContain("Pick my squad");
    expect(out).toContain("Watch the match");
    expect(out).not.toContain("Back to the match");
    seedStore({ metadata: null, connection: "missing" });
    expect(html(<Onboarding />)).toContain("That match no longer exists");
  });

  test("set-up during a match offers the way back, more preferences, and a new match", () => {
    seedStore();
    const out = html(<Onboarding />);
    expect(out).toContain("Back to the match");
    expect(out).toContain("More preferences");
    expect(out).toContain("New match");
  });

  test("squad selection shows the XI on a pitch, with captain and vice-captain", () => {
    seedStore(
      { state: { ...STATE, status: "paused", minute: 0, last_event_id: 0 } },
      { fantasy_squad: SQUAD },
    );
    const out = html(<SquadPage />);
    expect(out).toContain("Build your starting XI");
    expect(out).toContain("11/11 selected");
    expect(out).toContain("Squad complete");
    expect(out).toContain("1 GK · 4 DEF · 4 MID · 2 FWD");
    expect(out).toContain("Kick off the match!");
    expect(out.match(/aria-haspopup="menu"/g)).toHaveLength(11);
    expect(out).toContain(
      `All (${HOME.starters.length + HOME.bench.length + AWAY.starters.length + AWAY.bench.length})`,
    );
    seedStore({}, { fantasy_squad: SQUAD });
    expect(html(<SquadPage />)).toContain("Save squad");
  });
});

describe("overlay", () => {
  test("every cue template renders as a graphic in every language", () => {
    const shown = new Set<string>();
    for (const language of LANGUAGES) {
      for (const cue of ALL_CUES) {
        const text = describeCue(cue, { language, meta: META }, ALL_MOMENTS);
        const out = html(<CueGraphic cue={cue} text={text} meta={META} />);
        expect(out.length, cue.template).toBeGreaterThan(100);
        expect(out).not.toMatch(/\{\w+\}/);
        shown.add(cue.template);
        if (cue.template === "stat_compare")
          expect(out).toContain(META.home.short_name);
        if (cue.template === "momentum_bar")
          expect(out).toContain('role="meter"');
      }
    }
    expect(shown.size).toBe(7);
  });

  test("the overlay page explains how to point it at a match", () => {
    seedStore({ matchId: null, metadata: null });
    expect(html(<OverlayPage />)).toContain("Add ?match=");
  });
});

describe("replay", () => {
  const fetched: Replay = {
    match_id: META.match_id,
    source_event_ids: [1],
    events: [event({ id: 1, type: "goal", clock_s: 106, x: 90, y: 30 })],
    frames: [100, 102, 104, 106, 108].map((c) => frame(c)),
  };

  test("pressing a moment fetches its source events and plays them above the pitch", async () => {
    seedStore();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => fetched,
    }));
    vi.stubGlobal("fetch", fetchMock);
    await startReplay("Goal 12'", [1, 2]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/matches/${META.match_id}/replay?event_ids=1&event_ids=2`,
      expect.anything(),
    );
    const replay = useLive.getState().replay!;
    expect(replay).toMatchObject({ label: "Goal 12'", status: "playing" });
    expect(replay.clips).toHaveLength(1);
    const bar = html(<PitchHeader />);
    expect(bar).toContain("Replaying");
    expect(bar).toContain("Goal 12&#x27;");
    expect(bar).toContain("Back to live (10′)");
    stopReplay();
    expect(useLive.getState().replay).toBeNull();
    expect(html(<PitchHeader />)).toContain("Live pitch");
  });

  test("a failed fetch, or a replay with nothing in it, says so", async () => {
    seedStore();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    await startReplay("Card", [3]);
    expect(useLive.getState().replay?.status).toBe("failed");
    expect(html(<PitchHeader />)).toContain("Could not load the replay");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...fetched, frames: [] }),
      })),
    );
    await startReplay("Card", [3]);
    expect(useLive.getState().replay?.status).toBe("failed");
  });

  test("a newer replay is not overwritten by an older one that finishes later", async () => {
    seedStore();
    let release: (r: unknown) => void = () => {};
    const slow = new Promise((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => slow),
    );
    const first = startReplay("old", [1]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => fetched })),
    );
    await startReplay("new", [2]);
    release({ ok: true, json: async () => fetched });
    await first;
    expect(useLive.getState().replay?.label).toBe("new");
  });

  test("nothing happens without events to replay", async () => {
    seedStore();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await startReplay("empty", []);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useLive.getState().replay).toBeNull();
  });
});
