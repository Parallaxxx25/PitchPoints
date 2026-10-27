"""Fantasy scoring engine: turns match events into ledger entries.

Minutes use the nominal match clock (`contracts.nominal_seconds`), so stoppage
time never counts. Time-based points (60 minutes, clean sheet) are awarded at
the first event at or after the threshold, which becomes their source event.
A player sent off stays answerable for goals their team concedes, as in the
official game; a player substituted off does not.
"""

from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field

from contracts import (
    FantasySquad,
    LedgerEntry,
    MatchEvent,
    MatchMetadata,
    Position,
    nominal_seconds,
)
from scoring.rules import Rules, load_rules


@dataclass
class _Player:
    id: str
    team_id: str
    position: Position
    name: str
    entered_s: float | None = None  # nominal clock when the current spell on the pitch began
    played_s: float = 0.0  # nominal seconds in finished spells
    appeared: bool = False
    sent_off: bool = False
    done: set[str] = field(default_factory=set)  # once-per-match rules already awarded
    saves: list[int] = field(default_factory=list)
    defensive: list[int] = field(default_factory=list)
    conceded: list[int] = field(default_factory=list)
    deltas: dict[str, int] = field(default_factory=dict)  # current delta per ledger entry id

    def seconds(self, now: float) -> float:
        return self.played_s + (now - self.entered_s if self.entered_s is not None else 0.0)

    def leave(self, now: float) -> None:
        self.played_s, self.entered_s = self.seconds(now), None


def bonus_points(scores: Mapping[str, int], points: list[int]) -> dict[str, int]:
    """Bonus per player from bonus scores. Only positive scores rank; a player's rank is
    1 + the number of players with a strictly higher score, so tied players share the higher rank."""
    positive = [s for s in scores.values() if s > 0]
    out: dict[str, int] = {}
    for pid, score in scores.items():
        rank = 1 + sum(other > score for other in positive)
        if score > 0 and rank <= len(points):
            out[pid] = points[rank - 1]
    return out


class ScoringEngine:
    """Applies one match's events in order; every ledger entry names its source events."""

    def __init__(self, metadata: MatchMetadata, rules: Rules | None = None) -> None:
        self.rules = rules or load_rules()
        self.match_id = metadata.match_id
        sheets = (metadata.home, metadata.away)
        self.players = {
            p.id: _Player(p.id, s.id, p.position, p.name)
            for s in sheets
            for p in (*s.starters, *s.bench)
        }
        self._teams = (metadata.home.id, metadata.away.id)
        self._starters = [p.id for s in sheets for p in s.starters]
        self._entries: dict[str, LedgerEntry] = {}
        self._last_shot: MatchEvent | None = None
        self._last_pass: dict[str, int] = {}
        self._bonus_score: Counter[str] = Counter()
        self._bonus_sources: dict[str, list[int]] = {}
        self._end: MatchEvent | None = None

    def apply(self, e: MatchEvent) -> list[LedgerEntry]:
        """Ledger entries caused by one event, time-based points first."""
        now = nominal_seconds(e.period, e.clock_s)
        pts = self.rules.points
        out = self._time_based(e, now)
        p = self.players.get(e.player_id or "")
        match e.type:
            case "match_start":
                for pid in self._starters:
                    out += self._enter(self.players[pid], now, e)
            case "substitution" if p and e.player_in_id:
                p.leave(now)
                out += self._enter(self.players[e.player_in_id], now, e)
            case "pass" if p and e.outcome == "complete":
                self._last_pass[p.id] = e.id
            case "shot" if p:
                self._last_shot = e
                if e.penalty and e.outcome != "goal":
                    delta = pts.penalty_miss[p.position]
                    out += self._award(p, "penalty_miss", delta, "Penalty missed", [e.id], e)
            case "goal" if p:
                out += self._goal(p, e)
            case "own_goal" if p:
                out += self._award(p, "own_goal", pts.own_goal[p.position], "Own goal", [e.id], e)
                out += self._concede(e.team_id, e)
            case "save" if p:
                out += self._save(p, e)
            case "card" if p:
                out += self._card(p, e, now)
            case "match_end":
                self._end = e
        if p and e.type in self.rules.defensive_contribution.actions[p.position]:
            out += self._defend(p, e)
        return out + self._bonus(e)

    def finalize(self) -> list[LedgerEntry]:
        """Issue every provisional entry again as final. Call once, after `match_end`."""
        end = self._end
        if end is None:
            raise RuntimeError("finalize() needs the match_end event first")
        provisional = [x for x in self._entries.values() if x.provisional]
        return [
            self._record(
                self.players[x.player_id],
                x.id,
                x.rule_id,
                x.delta,
                x.reason,
                [*x.source_event_ids, end.id],
                end,
                provisional=False,
            )
            for x in provisional
        ]

    def ledger(self, player_id: str | None = None) -> list[LedgerEntry]:
        """Current version of every entry in the order first issued, optionally for one player."""
        return [x for x in self._entries.values() if player_id in (None, x.player_id)]

    def totals(self) -> dict[str, int]:
        """Points so far for every player who has appeared."""
        return {p.id: sum(p.deltas.values()) for p in self.players.values() if p.appeared}

    def squad_total(self, squad: FantasySquad) -> int:
        """Squad points with the captain's doubled, or the vice-captain's while the captain has not played."""
        totals = self.totals()
        doubled = squad.captain_id if squad.captain_id in totals else squad.vice_captain_id
        return sum(totals.get(pid, 0) for pid in squad.players) + totals.get(doubled, 0)

    # ---------- rules ----------
    def _time_based(self, e: MatchEvent, now: float) -> list[LedgerEntry]:
        pts, out = self.rules.points, []
        for p in self.players.values():
            if p.entered_s is None:
                continue
            played = p.seconds(now)
            if played >= self.rules.sixty_minutes * 60 and "sixty_minutes" not in p.done:
                p.done.add("sixty_minutes")
                delta = pts.sixty_minutes[p.position]
                out += self._award(p, "sixty_minutes", delta, "Played 60 minutes", [e.id], e)
            if (
                played >= self.rules.clean_sheet_minutes * 60
                and "clean_sheet" not in p.done
                and not p.conceded
            ):
                p.done.add("clean_sheet")
                delta = pts.clean_sheet[p.position]
                out += self._provisional(p, "clean_sheet", delta, "Clean sheet", [e.id], e)
        return out

    def _enter(self, p: _Player, now: float, e: MatchEvent) -> list[LedgerEntry]:
        p.entered_s, p.appeared = now, True
        delta = self.rules.points.appearance[p.position]
        return self._award(p, "appearance", delta, "Appearance", [e.id], e)

    def _goal(self, p: _Player, e: MatchEvent) -> list[LedgerEntry]:
        pts = self.rules.points
        shot = [self._last_shot.id] if self._last_shot and self._last_shot.player_id == p.id else []
        out = self._award(p, "goal", pts.goal[p.position], "Goal", [*shot, e.id], e)
        if a := self.players.get(e.assist_player_id or ""):
            passed = [self._last_pass[a.id]] if a.id in self._last_pass else []
            reason = f"Assist for {p.name}'s goal"
            out += self._award(a, "assist", pts.assist[a.position], reason, [*passed, e.id], e)
        conceding = self._teams[1] if e.team_id == self._teams[0] else self._teams[0]
        return out + self._concede(conceding, e)

    def _concede(self, team_id: str, e: MatchEvent) -> list[LedgerEntry]:
        per_goal, out = self.rules.points.goals_conceded, []
        for p in self.players.values():
            if p.team_id != team_id or (p.entered_s is None and not p.sent_off):
                continue
            p.conceded.append(e.id)
            if "clean_sheet" in p.done:
                out += self._provisional(p, "clean_sheet", 0, "Clean sheet lost", [e.id], e)
            goals = len(p.conceded)
            delta = per_goal[p.position] * (goals // self.rules.goals_conceded_per_point)
            reason = f"{goals} goals conceded"
            out += self._provisional(p, "goals_conceded", delta, reason, p.conceded, e)
        return out

    def _save(self, p: _Player, e: MatchEvent) -> list[LedgerEntry]:
        pts, n = self.rules.points, self.rules.saves_per_point
        p.saves.append(e.id)
        out: list[LedgerEntry] = []
        if e.penalty:
            delta = pts.penalty_save[p.position]
            out += self._award(p, "penalty_save", delta, "Penalty saved", [e.id], e)
        if len(p.saves) % n == 0:
            delta = pts.saves[p.position]
            out += self._award(p, "saves", delta, f"{len(p.saves)} saves", p.saves[-n:], e)
        return out

    def _card(self, p: _Player, e: MatchEvent, now: float) -> list[LedgerEntry]:
        pts = self.rules.points
        if e.card == "yellow":
            return self._award(
                p, "yellow_card", pts.yellow_card[p.position], "Yellow card", [e.id], e
            )
        p.leave(now)
        p.sent_off = True
        if e.card == "second_yellow":  # the red card's points include the first yellow's
            delta = pts.red_card[p.position] - pts.yellow_card[p.position]
            return self._award(p, "red_card", delta, "Sent off for a second yellow card", [e.id], e)
        return self._award(p, "red_card", pts.red_card[p.position], "Red card", [e.id], e)

    def _defend(self, p: _Player, e: MatchEvent) -> list[LedgerEntry]:
        p.defensive.append(e.id)
        if len(p.defensive) != self.rules.defensive_contribution.threshold[p.position]:
            return []
        delta = self.rules.points.defensive_contribution[p.position]
        reason = f"{len(p.defensive)} defensive actions"
        return self._award(p, "defensive_contribution", delta, reason, p.defensive, e)

    def _bonus(self, e: MatchEvent) -> list[LedgerEntry]:
        gained = self._bonus_gains(e)
        if not gained:
            return []
        for pid, score in gained:
            self._bonus_score[pid] += score
            self._bonus_sources.setdefault(pid, []).append(e.id)
        bonus = bonus_points(self._bonus_score, self.rules.bonus.points)
        out: list[LedgerEntry] = []
        for p in self.players.values():
            sources = [*self._bonus_sources.get(p.id, []), e.id]
            reason = "PitchPoints bonus (simplified)"
            out += self._provisional(p, "bonus", bonus.get(p.id, 0), reason, sources, e)
        return out

    def _bonus_gains(self, e: MatchEvent) -> list[tuple[str, int]]:
        s, pid = self.rules.bonus.score, e.player_id
        if not pid or pid not in self.players:
            return []
        match e.type:
            case "goal":
                assist = [(e.assist_player_id, s.assist)] if e.assist_player_id else []
                return [(pid, s.goal[self.players[pid].position]), *assist]
            case "save":
                return [(pid, s.save + (s.penalty_save if e.penalty else 0))]
            case "own_goal":
                return [(pid, s.own_goal)]
            case "shot" if e.penalty and e.outcome != "goal":
                return [(pid, s.penalty_miss)]
            case "card":
                return [(pid, s.yellow_card if e.card == "yellow" else s.red_card)]
            case _ if e.type in self.rules.defensive_contribution.actions["DEF"]:
                return [(pid, s.defensive_action)]
        return []

    # ---------- ledger ----------
    def _award(
        self, p: _Player, rule_id: str, delta: int, reason: str, sources: list[int], e: MatchEvent
    ) -> list[LedgerEntry]:
        """A final entry, unique per player, rule, and event; nothing when the rule gives 0."""
        if not delta:
            return []
        entry_id = f"{p.id}:{rule_id}:{e.id}"
        return [self._record(p, entry_id, rule_id, delta, reason, sources, e, provisional=False)]

    def _provisional(
        self, p: _Player, rule_id: str, delta: int, reason: str, sources: list[int], e: MatchEvent
    ) -> list[LedgerEntry]:
        """A provisional entry with a stable id, issued only when its value changes."""
        entry_id = f"{p.id}:{rule_id}"
        if p.deltas.get(entry_id, 0) == delta:
            return []
        return [self._record(p, entry_id, rule_id, delta, reason, sources, e, provisional=True)]

    def _record(
        self,
        p: _Player,
        entry_id: str,
        rule_id: str,
        delta: int,
        reason: str,
        sources: list[int],
        e: MatchEvent,
        provisional: bool,
    ) -> LedgerEntry:
        p.deltas[entry_id] = delta
        entry = LedgerEntry(
            id=entry_id,
            match_id=self.match_id,
            player_id=p.id,
            minute=e.minute,
            delta=delta,
            running_total=sum(p.deltas.values()),
            rule_id=rule_id,
            reason=reason,
            source_event_ids=sorted(set(sources)),
            provisional=provisional,
        )
        self._entries[entry_id] = entry
        return entry
