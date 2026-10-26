"""
Synthetic football match simulator (event level).

Generates football-realistic match events with x/y coordinates for a 2D pitch
view and enough detail for fantasy scoring (minutes, goals, assists, saves,
defensive actions, cards, substitutions). All clubs and players are fictional.

Coordinate convention: every event is stored from the acting team's
perspective, attacking left to right on a 105 x 68 pitch. The frontend flips
coordinates for the away team (and at half-time) when drawing.

Usage:
    python match_simulator.py --seed 7 --out match.jsonl        # batch file
    python match_simulator.py --seed 7 --stream --speed 18      # live, 90 min in ~5 min
    python match_simulator.py --validate 300                    # realism check
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from dataclasses import dataclass, field

PITCH_L, PITCH_W = 105.0, 68.0
GOAL_X, GOAL_Y = 105.0, 34.0

# (position, base_x, base_y) for a 4-3-3, attacking left to right
FORMATION_433 = [
    ("GK", 5, 34), ("DEF", 20, 10), ("DEF", 18, 26), ("DEF", 18, 42), ("DEF", 20, 58),
    ("MID", 42, 18), ("MID", 36, 34), ("MID", 42, 50),
    ("FWD", 70, 12), ("FWD", 74, 34), ("FWD", 70, 56),
]

FIRST = ["Leo", "Max", "Theo", "Kai", "Noah", "Eli", "Rafa", "Jonas", "Milo", "Ivo",
         "Tomas", "Ari", "Dani", "Luca", "Oskar", "Remy", "Sami", "Bruno", "Enzo", "Femi"]
LAST = ["Arden", "Brask", "Calloway", "Dravic", "Ekwueme", "Falk", "Gorran", "Halden",
        "Ibarra", "Joss", "Kovac", "Lundqvist", "Marlow", "Nyberg", "Okafor", "Pelt",
        "Quarry", "Rendell", "Sorano", "Tavish", "Ulmer", "Varga", "Whitlock", "Yarrow"]


@dataclass
class Player:
    id: str
    name: str
    team_id: str
    position: str
    shirt: int
    base_x: float
    base_y: float
    passing: float      # 0..1
    shooting: float     # 0..1
    defending: float    # 0..1
    discipline: float   # 0..1, higher = fewer cards
    on_pitch: bool = True


@dataclass
class Team:
    id: str
    name: str
    strength: float     # 0..1
    starters: list[Player]
    bench: list[Player]

    def active(self) -> list[Player]:
        return [p for p in self.starters if p.on_pitch]

    def keeper(self) -> Player:
        return next(p for p in self.active() if p.position == "GK")


def make_team(team_id: str, name: str, strength: float, rng: random.Random) -> Team:
    used: set[str] = set()

    def new_name() -> str:
        while True:
            n = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if n not in used:
                used.add(n)
                return n

    def rating(bias: float) -> float:
        return max(0.05, min(0.95, rng.gauss(0.5 + bias + (strength - 0.5) * 0.4, 0.12)))

    def make(pos: str, shirt: int, bx: float, by: float) -> Player:
        return Player(
            id=f"{team_id}-{shirt}", name=new_name(), team_id=team_id, position=pos, shirt=shirt,
            base_x=bx, base_y=by,
            passing=rating(0.1 if pos == "MID" else 0.0),
            shooting=rating(0.2 if pos == "FWD" else -0.1 if pos in ("DEF", "GK") else 0.0),
            defending=rating(0.2 if pos == "DEF" else 0.15 if pos == "GK" else -0.1 if pos == "FWD" else 0.0),
            discipline=rating(0.1),
        )

    starters = [make(pos, i + 1, bx, by) for i, (pos, bx, by) in enumerate(FORMATION_433)]
    bench_slots = [("DEF", 20, 26), ("MID", 40, 34), ("MID", 42, 18), ("FWD", 72, 34), ("FWD", 70, 56)]
    bench = [make(pos, 12 + i, bx, by) for i, (pos, bx, by) in enumerate(bench_slots)]
    for p in bench:
        p.on_pitch = False
    return Team(team_id, name, strength, starters, bench)


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def expected_goals(x: float, y: float) -> float:
    """Simple distance + angle xG model (from the attacker's perspective)."""
    dist = math.hypot(GOAL_X - x, GOAL_Y - y)
    angle_factor = 1.0 - min(abs(y - GOAL_Y) / 40.0, 0.85)
    return clamp(0.62 * math.exp(-0.14 * dist) * angle_factor, 0.01, 0.8)


@dataclass
class MatchSim:
    home: Team
    away: Team
    seed: int
    match_id: str = "match-001"
    rng: random.Random = field(init=False)
    events: list[dict] = field(default_factory=list)
    clock: float = 0.0          # seconds within the match
    period: int = 1
    score: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.rng = random.Random(self.seed)
        self.score = {self.home.id: 0, self.away.id: 0}
        self._eid = 0
        self._possession_id = 0
        self._last_passer: Player | None = None
        self._subs_done = {self.home.id: 0, self.away.id: 0}
        self._sub_minutes = {
            t.id: sorted(self.rng.sample(range(58, 86), 3)) for t in (self.home, self.away)
        }

    # ---------- helpers ----------
    def other(self, team: Team) -> Team:
        return self.away if team is self.home else self.home

    def emit(self, etype: str, team: Team, player: Player | None, x: float | None = None,
             y: float | None = None, **extra) -> dict:
        self._eid += 1
        ev = {
            "id": self._eid,
            "match_id": self.match_id,
            "period": self.period,
            "clock_s": round(self.clock, 1),
            "minute": int(self.clock // 60),
            "type": etype,
            "team_id": team.id,
            "player_id": player.id if player else None,
            "possession_id": self._possession_id,
            "x": None if x is None else round(x, 1),
            "y": None if y is None else round(y, 1),
            **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in extra.items()},
        }
        self.events.append(ev)
        return ev

    def tick(self, lo: float = 2.0, hi: float = 7.0) -> None:
        self.clock += self.rng.uniform(lo, hi)

    def nearest(self, team: Team, x: float, y: float, exclude: Player | None = None,
                allow_gk: bool = False, shift: float = 0.0) -> Player:
        """Nearest active player to (x, y) in that team's own perspective."""
        cands = [p for p in team.active() if p is not exclude and (allow_gk or p.position != "GK")]

        def dist(p: Player) -> float:
            px = p.base_x + shift if p.position != "GK" else p.base_x
            return math.hypot(px - x, p.base_y - y) + self.rng.uniform(0, 6)

        return min(cands, key=dist)

    def new_possession(self) -> None:
        self._possession_id += 1
        self._last_passer = None

    # ---------- match flow ----------
    def run(self) -> list[dict]:
        self.emit("match_start", self.home, None, home=self.home.id, away=self.away.id)
        for period, start in ((1, 0.0), (2, 45 * 60.0)):
            self.period, self.clock = period, start
            end = start + 45 * 60 + self.rng.uniform(60, 300)  # stoppage time
            team = self.home if period == 1 else self.away
            self.play_period(team, end)
            self.emit("period_end", self.home, None)
        self.emit("match_end", self.home, None, score=dict(self.score))
        return self.events

    def play_period(self, team: Team, end: float) -> None:
        carrier, x, y = self.kickoff(team)
        while self.clock < end:
            self.maybe_substitute()
            if not carrier.on_pitch:  # carrier was just subbed off
                carrier = self.nearest(team, x, y)
            team, carrier, x, y = self.step(team, carrier, x, y)

    def kickoff(self, team: Team) -> tuple[Player, float, float]:
        self.new_possession()
        carrier = next(p for p in team.active() if p.position == "FWD")
        self.emit("kickoff", team, carrier, 52.5, 34.0)
        return carrier, 52.5, 34.0

    def step(self, team: Team, carrier: Player, x: float, y: float):
        opp = self.other(team)
        diff = team.strength - opp.strength
        wide = y < 14 or y > 54

        if self.rng.random() < 0.014:  # fouled while in possession (set piece, same team keeps ball)
            fouler = self.nearest(opp, PITCH_L - x, PITCH_W - y)
            return self.foul(opp, fouler, team, carrier, x, y)
        if x > 88:
            shot_p = 0.10
        elif x > 76:
            shot_p = 0.024 + 0.02 * carrier.shooting
        else:
            shot_p = 0.002
        if self.rng.random() < shot_p:
            return self.shot(team, carrier, x, y)
        if x > 74 and wide and self.rng.random() < 0.3:
            return self.pass_(team, carrier, x, y, cross=True)
        if self.rng.random() < 0.15:
            return self.carry(team, carrier, x, y, diff)
        return self.pass_(team, carrier, x, y)

    def carry(self, team: Team, carrier: Player, x: float, y: float, diff: float):
        nx = clamp(x + self.rng.gauss(6, 4), 2, 103)
        ny = clamp(y + self.rng.gauss(0, 5), 2, 66)
        pressure = 0.08 + 0.10 * (x / PITCH_L) - 0.05 * diff
        self.tick(2, 5)
        if self.rng.random() < pressure:  # tackled during the carry
            return self.turnover(team, carrier, nx, ny, kind="tackle")
        self.emit("carry", team, carrier, x, y, end_x=nx, end_y=ny)
        return team, carrier, nx, ny

    def pass_(self, team: Team, passer: Player, x: float, y: float, cross: bool = False):
        opp = self.other(team)
        if cross:
            tx, ty = self.rng.uniform(92, 101), self.rng.uniform(26, 42)
        else:
            tx = clamp(x + self.rng.gauss(7, 11), 3, 100)
            ty = clamp(y + self.rng.gauss(0, 14), 3, 65)
        shift = (x - 52.5) * 0.5
        receiver = self.nearest(team, tx, ty, exclude=passer, allow_gk=x < 35, shift=shift)
        dist = math.hypot(tx - x, ty - y)
        success_p = (0.93 + 0.08 * (passer.passing - 0.5) - 0.0035 * max(0, dist - 10)
                     - 0.07 * (tx / PITCH_L) + 0.06 * (team.strength - opp.strength))
        if cross:
            success_p = 0.28 + 0.15 * passer.passing
        self.tick()
        if self.rng.random() < success_p:
            self.emit("pass", team, passer, x, y, end_x=tx, end_y=ty, outcome="complete",
                      recipient_id=receiver.id, cross=cross)
            self._last_passer = passer
            return team, receiver, tx, ty
        self.emit("pass", team, passer, x, y, end_x=tx, end_y=ty, outcome="incomplete",
                  recipient_id=receiver.id, cross=cross)
        return self.turnover(team, passer, tx, ty, kind="cross" if cross else "pass")

    def turnover(self, team: Team, loser: Player, x: float, y: float, kind: str):
        """Possession changes. Coordinates are flipped into the winning team's perspective."""
        opp = self.other(team)
        ox, oy = PITCH_L - x, PITCH_W - y
        defender = self.nearest(opp, ox, oy, shift=(ox - 52.5) * 0.4)
        self.new_possession()
        if kind == "tackle":
            self.emit("tackle", opp, defender, ox, oy, outcome="won", opponent_id=loser.id)
            if self.rng.random() < 0.18:
                return self.foul(opp, defender, team, loser, x, y)
        elif kind == "cross" or (ox < 25 and self.rng.random() < 0.5):
            self.emit("clearance", opp, defender, ox, oy)
            if kind == "cross" and self.rng.random() < 0.2:
                return self.corner(team)
            ox = clamp(ox + self.rng.uniform(20, 40), 5, 100)
            receiver = self.nearest(opp, ox, oy)
            self.emit("ball_recovery", opp, receiver, ox, oy)
            return opp, receiver, ox, oy
        elif (r := self.rng.random()) < 0.22:
            self.emit("tackle", opp, defender, ox, oy, outcome="won", opponent_id=loser.id)
            if self.rng.random() < 0.18:
                return self.foul(opp, defender, team, loser, x, y)
        elif r < 0.55:
            self.emit("interception", opp, defender, ox, oy)
        else:
            self.emit("ball_recovery", opp, defender, ox, oy)
        return opp, defender, ox, oy

    def foul(self, fouler_team: Team, fouler: Player, fouled_team: Team, fouled: Player,
             x: float, y: float):
        """Foul by `fouler`; (x, y) is in the fouled team's perspective."""
        fx, fy = PITCH_L - x, PITCH_W - y
        self.emit("foul", fouler_team, fouler, fx, fy, victim_id=fouled.id)
        card_roll = self.rng.random()
        if card_roll < 0.002 + 0.005 * (1 - fouler.discipline):
            self.emit("card", fouler_team, fouler, fx, fy, card="red")
            fouler.on_pitch = False
        elif card_roll < 0.10 + 0.18 * (1 - fouler.discipline):
            self.emit("card", fouler_team, fouler, fx, fy, card="yellow")
        self.tick(15, 35)
        self.new_possession()
        in_box = x > 88.5 and 13.8 < y < 54.2
        if in_box and self.rng.random() < 0.6:
            taker = max(fouled_team.active(), key=lambda p: p.shooting)
            return self.shot(fouled_team, taker, 94.0, 34.0, penalty=True)
        return fouled_team, fouled, x, y

    def shot(self, team: Team, shooter: Player, x: float, y: float, penalty: bool = False):
        opp = self.other(team)
        xg = 0.76 if penalty else expected_goals(x, y)
        keeper = opp.keeper()
        self.tick(2, 4)
        roll = self.rng.random()
        goal_p = xg * (0.8 + 0.4 * shooter.shooting) * (1.15 - 0.3 * keeper.defending)
        if penalty:
            outcome = "goal" if roll < goal_p else "saved" if roll < 0.92 else "off_target"
        elif roll < goal_p:
            outcome = "goal"
        elif roll < goal_p + 0.22:
            outcome = "blocked"
        elif roll < goal_p + 0.22 + 0.40:
            outcome = "off_target"
        else:
            outcome = "saved"

        assister = self._last_passer if (self._last_passer and not penalty
                                         and self._last_passer is not shooter) else None
        self.emit("shot", team, shooter, x, y, xg=xg, outcome=outcome, penalty=penalty,
                  assist_player_id=assister.id if (assister and outcome == "goal") else None)

        if outcome == "goal":
            self.score[team.id] += 1
            self.emit("goal", team, shooter, x, y, assist_player_id=assister.id if assister else None,
                      score=dict(self.score))
            self.tick(40, 70)
            carrier, nx, ny = self.kickoff(opp)
            return opp, carrier, nx, ny
        if outcome == "blocked":
            blocker = self.nearest(opp, PITCH_L - x, PITCH_W - y)
            self.emit("block", opp, blocker, PITCH_L - x, PITCH_W - y, shooter_id=shooter.id)
            if self.rng.random() < 0.5:  # deflected out for a corner
                return self.corner(team)
        if outcome == "saved":
            self.emit("save", opp, keeper, 3.0, 34.0, shooter_id=shooter.id, penalty=penalty)
            if self.rng.random() < 0.35:
                return self.corner(team)
        self.tick(8, 20)
        self.new_possession()
        return opp, keeper, 6.0, 34.0

    def corner(self, team: Team):
        taker = max(team.active(), key=lambda p: p.passing)
        side = self.rng.choice([1.0, 67.0])
        self.tick(20, 40)
        self.new_possession()
        self.emit("corner", team, taker, 105.0, side)
        return self.pass_(team, taker, 104.0, side, cross=True)

    def maybe_substitute(self) -> None:
        minute = self.clock / 60
        for t in (self.home, self.away):
            done = self._subs_done[t.id]
            if done >= 3 or minute < self._sub_minutes[t.id][done]:
                continue
            sub_in = t.bench[done] if done < len(t.bench) else None
            candidates = [p for p in t.active() if p.position == (sub_in.position if sub_in else "")]
            if sub_in and candidates:
                off = self.rng.choice(candidates)
                off.on_pitch = False
                sub_in.on_pitch = True
                sub_in.base_x, sub_in.base_y = off.base_x, off.base_y
                t.starters.append(sub_in)
                self.emit("substitution", t, off, player_in_id=sub_in.id)
            self._subs_done[t.id] += 1


# ---------- output ----------
def lineup_payload(team: Team) -> dict:
    def pdict(p: Player) -> dict:
        return {"id": p.id, "name": p.name, "shirt": p.shirt, "position": p.position}
    return {"id": team.id, "name": team.name,
            "starters": [pdict(p) for p in team.starters[:11]],
            "bench": [pdict(p) for p in team.bench]}


def build_match(seed: int) -> MatchSim:
    rng = random.Random(seed)
    home = make_team("RVR", "Riverside Rovers", rng.uniform(0.4, 0.7), rng)
    away = make_team("HLA", "Highland Athletic", rng.uniform(0.4, 0.7), rng)
    return MatchSim(home=home, away=away, seed=seed, match_id=f"match-{seed:04d}")


def stream(events: list[dict], speed: float, sink) -> None:
    """Replay events in (accelerated) real time. `sink` is any callable(event)."""
    prev = events[0]["clock_s"]
    for ev in events:
        gap = max(0.0, ev["clock_s"] - prev) / speed
        time.sleep(min(gap, 5.0))
        prev = ev["clock_s"]
        sink(ev)


def validate(n: int) -> None:
    """Aggregate per-match averages so you can tune probabilities toward realism."""
    keys = ["goals", "shots", "on_target", "passes", "pass_acc", "yellows", "reds",
            "saves", "tackles", "interceptions", "clearances", "corners", "xg"]
    totals = {k: 0.0 for k in keys}
    for seed in range(n):
        ev = build_match(seed).run()
        shots = [e for e in ev if e["type"] == "shot"]
        passes = [e for e in ev if e["type"] == "pass"]
        totals["goals"] += sum(e["type"] == "goal" for e in ev)
        totals["shots"] += len(shots)
        totals["on_target"] += sum(e["outcome"] in ("goal", "saved") for e in shots)
        totals["passes"] += len(passes)
        totals["pass_acc"] += sum(e["outcome"] == "complete" for e in passes) / max(1, len(passes))
        totals["yellows"] += sum(e.get("card") == "yellow" for e in ev)
        totals["reds"] += sum(e.get("card") == "red" for e in ev)
        totals["saves"] += sum(e["type"] == "save" for e in ev)
        totals["tackles"] += sum(e["type"] == "tackle" for e in ev)
        totals["interceptions"] += sum(e["type"] == "interception" for e in ev)
        totals["clearances"] += sum(e["type"] == "clearance" for e in ev)
        totals["corners"] += sum(e["type"] == "corner" for e in ev)
        totals["xg"] += sum(e["xg"] for e in shots)
    print(f"Averages per match over {n} simulated matches (both teams combined):")
    for k in keys:
        v = totals[k] / n
        print(f"  {k:<14} {v:6.1%}" if k == "pass_acc" else f"  {k:<14} {v:6.2f}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", help="write JSONL events to this file")
    ap.add_argument("--stream", action="store_true", help="replay events live to stdout")
    ap.add_argument("--speed", type=float, default=18.0, help="replay speed multiplier")
    ap.add_argument("--validate", type=int, metavar="N", help="print realism stats over N matches")
    args = ap.parse_args()

    if args.validate:
        validate(args.validate)
        return

    sim = build_match(args.seed)
    events = sim.run()
    header = {"type": "lineups", "match_id": sim.match_id,
              "home": lineup_payload(sim.home), "away": lineup_payload(sim.away)}

    if args.out:
        with open(args.out, "w") as f:
            f.write(json.dumps(header) + "\n")
            for ev in events:
                f.write(json.dumps(ev) + "\n")
        print(f"Wrote {len(events)} events to {args.out}. Final score: {sim.score}")
    if args.stream:
        print(json.dumps(header), flush=True)
        stream(events, args.speed, lambda e: print(json.dumps(e), flush=True))
    if not args.out and not args.stream:
        print(f"Simulated {len(events)} events. Final score: {sim.score}", file=sys.stderr)


if __name__ == "__main__":
    main()
