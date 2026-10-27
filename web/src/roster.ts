import type { MatchMetadata, PlayerInfo, TeamSheet } from "./contracts.gen.ts";

export type Side = "home" | "away";

export interface RosterEntry {
  info: PlayerInfo;
  team: TeamSheet;
  side: Side;
}

const cache = new WeakMap<MatchMetadata, Map<string, RosterEntry>>();

/** Every player of the match (starters and bench) by id. */
export function rosterOf(meta: MatchMetadata): Map<string, RosterEntry> {
  let roster = cache.get(meta);
  if (!roster) {
    roster = new Map();
    for (const side of ["home", "away"] as const) {
      const team = meta[side];
      for (const info of [...team.starters, ...team.bench])
        roster.set(info.id, { info, team, side });
    }
    cache.set(meta, roster);
  }
  return roster;
}

export function sideOf(meta: MatchMetadata, teamId: string): Side {
  return teamId === meta.home.id ? "home" : "away";
}

export function teamOf(meta: MatchMetadata, teamId: string): TeamSheet {
  return meta[sideOf(meta, teamId)];
}

export function playerName(meta: MatchMetadata, playerId: string): string {
  return rosterOf(meta).get(playerId)?.info.name ?? playerId;
}
