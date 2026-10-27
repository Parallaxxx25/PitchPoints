import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NewProfile, TeamSheet } from "./contracts.gen.ts";

export type Mode = NewProfile["mode"];
export type Language = NewProfile["language"];

export const MODES: readonly Mode[] = [
  "analyst",
  "casual",
  "fantasy",
  "player_focus",
  "club",
];
export const LANGUAGES: readonly Language[] = ["en", "es", "pt", "th"];
export const SQUAD_SIZE = 11;

/** Stats a viewer can follow in Player focus mode: a key of the player's stat line. */
export const FOCUS_METRICS = [
  "distance_km",
  "top_speed_kmh",
  "passes",
  "pass_accuracy",
  "xg",
  "defensive_actions",
  "pressures",
] as const;
export type FocusMetric = (typeof FOCUS_METRICS)[number];

export const DEFAULT_PROFILE: NewProfile = {
  display_name: "Fan",
  mode: "casual",
  language: "en",
  favourite_club_id: null,
  favourite_player_ids: [],
  focus_metric: null,
  fantasy_squad: null,
};

interface ProfileStore {
  profile: NewProfile;
  /** The server's id for this profile; set when the viewer connects and never stored locally. */
  profileId: string | null;
  /** The player whose card is open (Player focus mode always shows one); per session, not stored. */
  selectedPlayerId: string | null;
  /** Which page of the fan app is showing. */
  screen: Screen;
  update: (patch: Partial<NewProfile>) => void;
  setProfileId: (id: string | null) => void;
  selectPlayer: (id: string | null) => void;
  setScreen: (screen: Screen) => void;
}

/** The fan app's pages: the live match, squad selection, and the set-up page (also the profile). */
export type Screen = "live" | "squad" | "setup";

/** The viewer's choices, kept in this browser's localStorage. */
export const useProfile = create<ProfileStore>()(
  persist(
    (set) => ({
      profile: DEFAULT_PROFILE,
      profileId: null,
      selectedPlayerId: null,
      screen: "live",
      update: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setProfileId: (profileId) => set({ profileId }),
      selectPlayer: (selectedPlayerId) => set({ selectedPlayerId }),
      setScreen: (screen) => set({ screen }),
    }),
    {
      name: "pitchpoints.profile",
      partialize: (s) => ({ profile: s.profile }),
      merge: (stored, current) => {
        const saved = (stored as Partial<ProfileStore> | undefined)?.profile;
        const profile = { ...DEFAULT_PROFILE, ...saved };
        if (!MODES.includes(profile.mode)) profile.mode = DEFAULT_PROFILE.mode;
        if (!LANGUAGES.includes(profile.language))
          profile.language = DEFAULT_PROFILE.language;
        return { ...current, profile };
      },
    },
  ),
);

/** A ready squad from one team's starters: the first forward captains, the first midfielder is vice. */
export function autoSquad(team: TeamSheet): {
  players: string[];
  captain: string;
  vice: string;
} {
  const starters = team.starters.slice(0, SQUAD_SIZE);
  const first = (position: string) =>
    starters.find((p) => p.position === position) ?? starters[0]!;
  return {
    players: starters.map((p) => p.id),
    captain: first("FWD").id,
    vice: first("MID").id,
  };
}

/** Whether a squad has the 11 distinct players, and a captain and vice-captain from among them. */
export function squadIsValid(
  players: readonly string[],
  captain: string | null,
  vice: string | null,
): boolean {
  return (
    players.length === SQUAD_SIZE &&
    new Set(players).size === SQUAD_SIZE &&
    captain !== null &&
    vice !== null &&
    captain !== vice &&
    players.includes(captain) &&
    players.includes(vice)
  );
}
