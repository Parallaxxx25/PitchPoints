"""Event-level match engine: plays one match possession by possession.

Every event is emitted from the acting team's perspective, attacking left to
right on a 105 x 68 pitch. All randomness comes from one seeded `random.Random`.
"""

import math
import random
from typing import Any, Literal

from contracts import PITCH_LENGTH, PITCH_WIDTH, EventType, MatchEvent, Period
from simulator.director import DirectorScript, Moment
from simulator.teams import Player, Team
from simulator.xg import expected_goals

ShotOutcome = Literal["goal", "saved", "blocked", "off_target"]
Possession = tuple[Team, Player, float, float]  # team on the ball, carrier, x, y
HALF_S = 45 * 60.0
_DECIMALS = {"end_x": 1, "end_y": 1, "ball_speed_kmh": 1, "shot_speed_kmh": 1}


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def flip(x: float, y: float) -> tuple[float, float]:
    """Convert coordinates to the other team's perspective."""
    return PITCH_LENGTH - x, PITCH_WIDTH - y


class MatchEngine:
    """Simulates one match; `run()` returns every event in order."""

    def __init__(
        self,
        home: Team,
        away: Team,
        seed: int,
        match_id: str,
        script: DirectorScript | None = None,
    ) -> None:
        self.home, self.away, self.match_id = home, away, match_id
        self.rng = random.Random(seed)
        self.events: list[MatchEvent] = []
        self.clock = 0.0  # seconds; the second half starts at 45:00
        self.period: Period = 1
        self.score = {home.id: 0, away.id: 0}
        self._possession_id = 0
        self._possession_team: Team | None = None
        self._last_passer: Player | None = None
        self._yellows: set[str] = set()
        self._subs_done = {home.id: 0, away.id: 0}
        self._sub_minutes = {t.id: sorted(self.rng.sample(range(58, 86), 3)) for t in (home, away)}
        self._moments = sorted(script.moments, key=lambda m: m.minute) if script else []

    # ---------- helpers ----------
    def other(self, team: Team) -> Team:
        return self.away if team is self.home else self.home

    def side(self, side: Literal["home", "away"]) -> Team:
        return self.home if side == "home" else self.away

    def emit(
        self,
        etype: EventType,
        team: Team,
        player: Player | None,
        x: float | None = None,
        y: float | None = None,
        **extra: Any,
    ) -> None:
        fields: dict[str, Any] = {
            k: round(v, _DECIMALS.get(k, 3)) if isinstance(v, float) else v
            for k, v in extra.items()
        }
        self.events.append(
            MatchEvent(
                id=len(self.events) + 1,
                match_id=self.match_id,
                period=self.period,
                clock_s=round(self.clock, 1),
                minute=int(self.clock // 60),
                type=etype,
                team_id=team.id,
                player_id=player.id if player else None,
                possession_id=self._possession_id,
                x=None if x is None else round(x, 1),
                y=None if y is None else round(y, 1),
                **fields,
            )
        )

    def tick(self, lo: float = 2.0, hi: float = 7.0) -> None:
        self.clock += self.rng.uniform(lo, hi)

    def nearest(
        self,
        team: Team,
        x: float,
        y: float,
        exclude: Player | None = None,
        allow_gk: bool = False,
        shift: float = 0.0,
    ) -> Player:
        """Nearest active player to (x, y) in that team's own perspective."""
        cands = [p for p in team.active() if p is not exclude and (allow_gk or p.position != "GK")]

        def dist(p: Player) -> float:
            px = p.base_x + shift if p.position != "GK" else p.base_x
            return math.hypot(px - x, p.base_y - y) + self.rng.uniform(0, 6)

        return min(cands, key=dist)

    def outfield(self, team: Team) -> list[Player]:
        return [p for p in team.active() if p.position != "GK"]

    def new_possession(self, team: Team, player: Player, x: float, y: float) -> None:
        """Start a possession; emits `possession_change` when the team on the ball changes."""
        self._possession_id += 1
        self._last_passer = None
        if team is not self._possession_team:
            self._possession_team = team
            self.emit("possession_change", team, player, x, y)

    def book(
        self, team: Team, player: Player, x: float, y: float, card: Literal["yellow", "red"]
    ) -> None:
        """Show a card. A second yellow is shown as `second_yellow`; it and a red send the player off."""
        if card == "yellow" and player.id in self._yellows:
            self.emit("card", team, player, x, y, card="second_yellow")
            player.on_pitch = False
        elif card == "yellow":
            self._yellows.add(player.id)
            self.emit("card", team, player, x, y, card="yellow")
        else:
            self.emit("card", team, player, x, y, card="red")
            player.on_pitch = False

    # ---------- match flow ----------
    def run(self) -> list[MatchEvent]:
        self.emit("match_start", self.home, None)
        periods: tuple[tuple[Period, float], ...] = ((1, 0.0), (2, HALF_S))
        for period, start in periods:
            self.period, self.clock = period, start
            end = start + HALF_S + self.rng.uniform(60, 300)  # stoppage time
            self.play_period(self.home if period == 1 else self.away, end)
            self.emit("period_end", self.home, None)
        self.emit("match_end", self.home, None, score=dict(self.score))
        return self.events

    def play_period(self, team: Team, end: float) -> None:
        state = self.kickoff(team)
        while self.clock < end or self.due_moment():
            self.maybe_substitute()
            team, carrier, x, y = state
            if not carrier.on_pitch:  # carrier was just subbed off
                state = team, self.nearest(team, x, y), x, y
            moment = self.due_moment()
            state = self.force(moment, state) if moment else self.step(*state)

    def kickoff(self, team: Team) -> Possession:
        carrier = max(self.outfield(team), key=lambda p: p.base_x)
        self.new_possession(team, carrier, 52.5, 34.0)
        self.emit("kickoff", team, carrier, 52.5, 34.0)
        return team, carrier, 52.5, 34.0

    def step(self, team: Team, carrier: Player, x: float, y: float) -> Possession:
        opp = self.other(team)
        diff = team.strength - opp.strength
        wide = y < 14 or y > 54

        if (
            self.rng.random() < 0.014
        ):  # fouled while in possession (set piece, same team keeps ball)
            fouler = self.nearest(opp, *flip(x, y))
            return self.foul(opp, fouler, team, carrier, x, y)
        if x > 88:
            shot_p = 0.10
        elif x > 76:
            shot_p = 0.024 + 0.02 * carrier.shooting
        else:
            shot_p = 0.002
        if self.rng.random() < shot_p:
            return self.shot(team, carrier, x, y)
        pressed = self.rng.random() < 0.13 + 0.08 * opp.strength
        if pressed:
            self.emit(
                "pressure", opp, self.nearest(opp, *flip(x, y)), *flip(x, y), opponent_id=carrier.id
            )
        if x > 74 and wide and self.rng.random() < 0.3:
            return self.pass_(team, carrier, x, y, pressed, cross=True)
        if self.rng.random() < 0.15:
            return self.carry(team, carrier, x, y, diff, pressed)
        return self.pass_(team, carrier, x, y, pressed)

    def carry(
        self, team: Team, carrier: Player, x: float, y: float, diff: float, pressed: bool
    ) -> Possession:
        nx = clamp(x + self.rng.gauss(6, 4), 2, 103)
        ny = clamp(y + self.rng.gauss(0, 5), 2, 66)
        tackle_p = 0.08 + 0.10 * (x / PITCH_LENGTH) - 0.05 * diff + (0.08 if pressed else 0.0)
        self.tick(2, 5)
        if self.rng.random() < tackle_p:
            return self.turnover(team, carrier, nx, ny, kind="tackle")
        self.emit("carry", team, carrier, x, y, end_x=nx, end_y=ny)
        return team, carrier, nx, ny

    def pass_(
        self, team: Team, passer: Player, x: float, y: float, pressed: bool, cross: bool = False
    ) -> Possession:
        opp = self.other(team)
        if cross:
            tx, ty = self.rng.uniform(92, 101), self.rng.uniform(26, 42)
        else:
            tx = clamp(x + self.rng.gauss(7, 11), 3, 100)
            ty = clamp(y + self.rng.gauss(0, 14), 3, 65)
        shift = (x - 52.5) * 0.5
        receiver = self.nearest(team, tx, ty, exclude=passer, allow_gk=x < 35, shift=shift)
        dist = math.hypot(tx - x, ty - y)
        success_p = (
            0.93
            + 0.08 * (passer.passing - 0.5)
            - 0.0035 * max(0, dist - 10)
            - 0.07 * (tx / PITCH_LENGTH)
            + 0.06 * (team.strength - opp.strength)
        )
        if cross:
            success_p = 0.28 + 0.15 * passer.passing
        if pressed:
            success_p -= 0.10
        speed = clamp(self.rng.gauss(28 + 1.5 * dist + (12 if cross else 0), 6), 15, 110)
        self.tick()
        complete = self.rng.random() < success_p
        self.emit(
            "pass",
            team,
            passer,
            x,
            y,
            end_x=tx,
            end_y=ty,
            outcome="complete" if complete else "incomplete",
            recipient_id=receiver.id,
            cross=cross,
            under_pressure=pressed,
            ball_speed_kmh=speed,
        )
        if complete:
            self._last_passer = passer
            return team, receiver, tx, ty
        return self.turnover(team, passer, tx, ty, kind="cross" if cross else "pass")

    def turnover(self, team: Team, loser: Player, x: float, y: float, kind: str) -> Possession:
        """Possession changes. Coordinates are flipped into the winning team's perspective."""
        opp = self.other(team)
        ox, oy = flip(x, y)
        defender = self.nearest(opp, ox, oy, shift=(ox - 52.5) * 0.4)
        self.new_possession(opp, defender, ox, oy)
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

    def foul(
        self,
        fouler_team: Team,
        fouler: Player,
        fouled_team: Team,
        fouled: Player,
        x: float,
        y: float,
    ) -> Possession:
        """Foul by `fouler`; (x, y) is in the fouled team's perspective."""
        fx, fy = flip(x, y)
        self.emit("foul", fouler_team, fouler, fx, fy, opponent_id=fouled.id)
        card_roll = self.rng.random()
        booked = fouler.id in self._yellows  # booked players tread carefully
        if card_roll < 0.002 + 0.005 * (1 - fouler.discipline):
            self.book(fouler_team, fouler, fx, fy, "red")
        elif card_roll < (0.10 + 0.18 * (1 - fouler.discipline)) * (0.3 if booked else 1.0):
            self.book(fouler_team, fouler, fx, fy, "yellow")
        self.tick(15, 35)
        self.new_possession(fouled_team, fouled, x, y)
        in_box = x > 88.5 and 13.8 < y < 54.2
        if in_box and self.rng.random() < 0.12:  # most contact in the box is not given
            self.emit("penalty_won", fouled_team, fouled, x, y)
            taker = max(fouled_team.active(), key=lambda p: p.shooting)
            return self.shot(fouled_team, taker, 94.0, 34.0, penalty=True)
        return fouled_team, fouled, x, y

    def shot(
        self,
        team: Team,
        shooter: Player,
        x: float,
        y: float,
        penalty: bool = False,
        forced: ShotOutcome | None = None,
    ) -> Possession:
        opp = self.other(team)
        xg = 0.76 if penalty else expected_goals(x, y)
        keeper = opp.keeper()
        self.tick(2, 4)
        roll = self.rng.random()
        goal_p = xg * (0.8 + 0.4 * shooter.shooting) * (1.15 - 0.3 * keeper.defending)
        outcome: ShotOutcome
        if forced:
            outcome = forced
        elif penalty:
            outcome = "goal" if roll < goal_p else "saved" if roll < 0.92 else "off_target"
        elif roll < goal_p:
            outcome = "goal"
        elif roll < goal_p + 0.22:
            outcome = "blocked"
        elif roll < goal_p + 0.22 + 0.40:
            outcome = "off_target"
        else:
            outcome = "saved"
        speed = self.rng.gauss(95, 8) if penalty else self.rng.gauss(62 + 38 * shooter.shooting, 10)

        assister = (
            self._last_passer
            if (self._last_passer and not penalty and self._last_passer is not shooter)
            else None
        )
        self.emit(
            "shot",
            team,
            shooter,
            x,
            y,
            xg=xg,
            outcome=outcome,
            penalty=penalty,
            shot_speed_kmh=clamp(speed, 35, 135),
            assist_player_id=assister.id if (assister and outcome == "goal") else None,
        )

        if outcome == "goal":
            self.score[team.id] += 1
            self.emit(
                "goal",
                team,
                shooter,
                x,
                y,
                assist_player_id=assister.id if assister else None,
                score=dict(self.score),
            )
            self.tick(40, 70)
            return self.kickoff(opp)
        if outcome == "blocked":
            blocker = self.nearest(opp, *flip(x, y))
            if self.rng.random() < 0.02:  # deflected into their own net
                self.score[team.id] += 1
                self.emit("own_goal", opp, blocker, *flip(x, y), score=dict(self.score))
                self.tick(40, 70)
                return self.kickoff(opp)
            self.emit("block", opp, blocker, *flip(x, y), opponent_id=shooter.id)
            if self.rng.random() < 0.5:  # deflected out for a corner
                return self.corner(team)
        if outcome == "saved":
            self.emit("save", opp, keeper, 3.0, 34.0, opponent_id=shooter.id, penalty=penalty)
            if self.rng.random() < 0.35:
                return self.corner(team)
        self.tick(8, 20)
        self.new_possession(opp, keeper, 6.0, 34.0)
        return opp, keeper, 6.0, 34.0

    def corner(self, team: Team) -> Possession:
        taker = max(self.outfield(team), key=lambda p: p.passing)
        side = self.rng.choice([1.0, 67.0])
        self.tick(20, 40)
        self.new_possession(team, taker, 105.0, side)
        self.emit("corner", team, taker, 105.0, side)
        return self.pass_(team, taker, 104.0, side, pressed=False, cross=True)

    def maybe_substitute(self) -> None:
        minute = self.clock / 60
        for t in (self.home, self.away):
            done = self._subs_done[t.id]
            if done >= 3 or minute < self._sub_minutes[t.id][done]:
                continue
            sub_in = t.bench[done] if done < len(t.bench) else None
            protected = {m.shirt for m in self._moments if self.side(m.team) is t}
            candidates = [
                p
                for p in t.active()
                if sub_in and p.position == sub_in.position and p.shirt not in protected
            ]
            if sub_in and candidates:
                off = self.rng.choice(candidates)
                off.on_pitch = False
                sub_in.on_pitch = True
                sub_in.base_x, sub_in.base_y = off.base_x, off.base_y
                t.starters.append(sub_in)
                self.emit("substitution", t, off, player_in_id=sub_in.id)
            self._subs_done[t.id] += 1

    # ---------- director mode ----------
    def due_moment(self) -> Moment | None:
        """Next scripted moment whose minute has been reached in the current half."""
        if not self._moments:
            return None
        m = self._moments[0]
        due = (1 if m.minute <= 45 else 2) == self.period and self.clock >= m.minute * 60
        return m if due else None

    def scripted_player(self, team: Team, moment: Moment) -> Player | None:
        return next((p for p in team.active() if p.shirt == moment.shirt), None)

    def force(self, moment: Moment, state: Possession) -> Possession:
        """Play a scripted moment from the current state."""
        self._moments.pop(0)
        team = self.side(moment.team)
        if moment.type in ("yellow_card", "red_card"):
            return self.force_card(team, moment, state)
        player = self.scripted_player(team, moment) or max(
            self.outfield(team), key=lambda p: p.shooting
        )
        x, y = self.build_up(team, player, state)
        if moment.type == "goal":
            return self.shot(team, player, x, y, forced="goal")
        opp = self.other(team)
        self.emit("foul", opp, self.nearest(opp, *flip(x, y)), *flip(x, y), opponent_id=player.id)
        self.tick(15, 35)
        self.emit("penalty_won", team, player, x, y)
        return self.shot(team, player, 94.0, 34.0, penalty=True, forced=moment.outcome)

    def build_up(self, team: Team, target: Player, state: Possession) -> tuple[float, float]:
        """Get the ball to `target` inside the box, emitting plausible events on the way."""
        holder, carrier, x, y = state
        if holder is not team:  # win the ball back in midfield
            x, y = 55.0, 34.0
            carrier = self.nearest(team, x, y)
            self.new_possession(team, carrier, x, y)
            self.emit("interception", team, carrier, x, y)
        if x < 45 and carrier is not target:  # play it into midfield first
            mid = self.nearest(team, 55.0, 34.0, exclude=carrier)
            x, y, carrier = self.complete_pass(team, carrier, mid, x, y, 55.0, 34.0)
        tx, ty = self.rng.uniform(89, 95), self.rng.uniform(27, 41)
        if carrier is target:
            self.tick(2, 5)
            self.emit("carry", team, carrier, x, y, end_x=tx, end_y=ty)
            return tx, ty
        x, y, _ = self.complete_pass(team, carrier, target, x, y, tx, ty)
        return x, y

    def complete_pass(
        self, team: Team, passer: Player, receiver: Player, x: float, y: float, tx: float, ty: float
    ) -> tuple[float, float, Player]:
        self.tick()
        self.emit(
            "pass",
            team,
            passer,
            x,
            y,
            end_x=tx,
            end_y=ty,
            outcome="complete",
            recipient_id=receiver.id,
            cross=False,
            under_pressure=False,
            ball_speed_kmh=clamp(28 + 1.5 * math.hypot(tx - x, ty - y), 15, 110),
        )
        self._last_passer = passer
        return tx, ty, receiver

    def force_card(self, team: Team, moment: Moment, state: Possession) -> Possession:
        """`team` commits a foul at the ball and is shown the scripted card."""
        holder, carrier, x, y = state
        victim_team = self.other(team)
        bx, by = (x, y) if holder is team else flip(x, y)
        fouler = self.scripted_player(team, moment) or self.nearest(team, bx, by)
        victim = carrier if holder is victim_team else self.nearest(victim_team, *flip(bx, by))
        card: Literal["yellow", "red"] = "red" if moment.type == "red_card" else "yellow"
        if fouler.position == "GK" and (card == "red" or fouler.id in self._yellows):
            raise ValueError("a director script cannot send off a goalkeeper")
        self.emit("foul", team, fouler, bx, by, opponent_id=victim.id)
        self.book(team, fouler, bx, by, card)
        self.tick(15, 35)
        vx, vy = flip(bx, by)
        self.new_possession(victim_team, victim, vx, vy)
        return victim_team, victim, vx, vy
