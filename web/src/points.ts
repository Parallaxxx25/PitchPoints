/** Fantasy points from the scoring engine's ledger. Sums only: every value comes from an entry. */
import type { LedgerEntry } from "./contracts.gen.ts";

export type Ledger = Record<string, LedgerEntry>;

export interface PlayerPoints {
  total: number;
  /** The part of the total that can still change before full time. */
  provisional: number;
}

/** Each player's points: the sum of the current version of their ledger entries. */
export function pointsByPlayer(ledger: Ledger): Map<string, PlayerPoints> {
  const out = new Map<string, PlayerPoints>();
  for (const e of Object.values(ledger)) {
    const p = out.get(e.player_id) ?? { total: 0, provisional: 0 };
    p.total += e.delta;
    if (e.provisional) p.provisional += e.delta;
    out.set(e.player_id, p);
  }
  return out;
}

/** A player's entries, newest first, leaving out provisional entries that are currently worth nothing. */
export function playerEntries(ledger: Ledger, playerId: string): LedgerEntry[] {
  return Object.values(ledger)
    .filter(
      (e) => e.player_id === playerId && !(e.provisional && e.delta === 0),
    )
    .sort(
      (a, b) =>
        b.minute - a.minute || Number(a.provisional) - Number(b.provisional),
    );
}

/** Entries for a set of players (or everyone), newest first, without zero-value provisional ones. */
export function recentEntries(
  ledger: Ledger,
  players?: ReadonlySet<string>,
): LedgerEntry[] {
  return Object.values(ledger)
    .filter(
      (e) =>
        (!players || players.has(e.player_id)) &&
        !(e.provisional && e.delta === 0),
    )
    .sort((a, b) => b.minute - a.minute);
}
