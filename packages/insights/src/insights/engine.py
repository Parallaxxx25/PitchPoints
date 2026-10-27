"""Insights engine: turns events and position frames into stats, tactical state, key
moments, and overlay cues.

Pure and deterministic. Formulas live in `insights.metrics`, thresholds in
`insights.constants`. Every key moment and cue names its source events; a
milestone reached between events (from frames or the clock) cites the latest
event before it.
"""

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Self

from contracts import (
    HALF_S,
    PITCH_LENGTH,
    CueTemplate,
    Facts,
    KeyMoment,
    MatchEvent,
    MatchMetadata,
    MomentKind,
    OverlayCue,
    Period,
    PlayerStats,
    PositionFrame,
    StatSnapshot,
    TacticalState,
    TeamPair,
    TeamStats,
    WinProbability,
    nominal_seconds,
)
from insights import constants as c
from insights.metrics import (
    control_chaos,
    goal_rate,
    in_final_third,
    momentum,
    pass_difficulty,
    pass_length,
    swing,
    win_probability,
)

At = tuple[Period, float]  # (period, clock_s)


@dataclass
class Insights:
    """Key moments and overlay cues produced by one input."""

    moments: list[KeyMoment] = field(default_factory=list)
    cues: list[OverlayCue] = field(default_factory=list)

    def __iadd__(self, other: "Insights") -> Self:
        self.moments += other.moments
        self.cues += other.cues
        return self


@dataclass
class _Team:
    id: str
    goals: int = 0
    passes: int = 0
    completed: int = 0
    shots: int = 0
    on_target: int = 0
    xg: float = 0.0
    final_third: int = 0
    pressures: int = 0
    corners: int = 0
    fouls: int = 0
    yellows: int = 0
    reds: int = 0
    possession_s: float = 0.0
    own_zone_passes: int = 0  # passes from its own 60%: the opponent's PPDA numerator
    high_actions: int = 0  # PPDA actions at x >= PPDA_ZONE_X: its PPDA denominator
    in_spell: bool = False


@dataclass
class _Player:
    id: str
    team_id: str
    entered_s: float | None = None  # nominal clock when the current spell on the pitch began
    played_s: float = 0.0
    appeared: bool = False
    passes: int = 0
    completed: int = 0
    difficulty: float = 0.0
    shots: int = 0
    on_target: int = 0
    goals: list[int] = field(default_factory=list)
    assists: int = 0
    xg: float = 0.0
    defensive: int = 0
    pressures: int = 0
    distance_m: float = 0.0
    top_speed: float = 0.0
    tags: set[str] = field(default_factory=set)  # physical milestones already reached

    def seconds(self, now: float) -> float:
        return self.played_s + (now - self.entered_s if self.entered_s is not None else 0.0)


def _share(a: float, b: float) -> float:
    return round(a / (a + b), 3) if a + b else 0.5


class InsightsEngine:
    """Feed one match's events and frames in order; read `stats()` and `tactical_state()` any time."""

    def __init__(self, metadata: MatchMetadata) -> None:
        self.match_id = metadata.match_id
        self.home, self.away = _Team(metadata.home.id), _Team(metadata.away.id)
        self.teams = {t.id: t for t in (self.home, self.away)}
        sheets = (metadata.home, metadata.away)
        self.players = {p.id: _Player(p.id, s.id) for s in sheets for p in (*s.starters, *s.bench)}
        self._starters = [p.id for s in sheets for p in s.starters]
        self._moments: list[KeyMoment] = []
        self._cue_count = 0
        self._recent: deque[tuple[float, MatchEvent]] = deque()  # (played time, event)
        self._last: MatchEvent | None = None
        self._t = 0.0  # played time of the last event
        self._offset = 0.0  # added to the second half's clock to get played time
        self._possession: str | None = None
        self._on_top: str | None = None
        self._last_shot: MatchEvent | None = None
        self._last_foul: MatchEvent | None = None
        self._pass_cue_t = -c.PASS_QUALITY_CUE_GAP_S
        self._frame_at: At | None = None
        self._clean_sheet_checked = False
        self._end: MatchEvent | None = None

    # ---------- inputs ----------
    def apply(self, e: MatchEvent) -> Insights:
        """Moments and cues caused by one event."""
        t = e.clock_s + (self._offset if e.period == 2 else 0.0)
        if self._last and self._last.period == e.period and self._possession:
            self.teams[self._possession].possession_s += min(t - self._t, c.MAX_IN_PLAY_GAP_S)
        self._last, self._t = e, t
        self._recent.append((t, e))
        while self._recent[0][0] < t - c.XG_WINDOW_S:
            self._recent.popleft()

        now = nominal_seconds(e.period, e.clock_s)
        team, p = self.teams.get(e.team_id), self.players.get(e.player_id or "")
        out = Insights()
        if team and e.type in c.MOMENTUM_ACTIONS and in_final_third(e.x or 0.0):
            team.final_third += 1
        if team and e.type in c.PPDA_ACTIONS and (e.x or 0.0) >= c.PPDA_ZONE_X:
            team.high_actions += 1
        if p and e.type in c.DEFENSIVE_ACTIONS:
            p.defensive += 1
        match e.type:
            case "match_start":
                for pid in self._starters:
                    self._enter(pid, now)
            case "substitution" if p and e.player_in_id:
                self._leave(p, now)
                self._enter(e.player_in_id, now)
            case "possession_change":
                self._possession = e.team_id
            case "pass" if team and p:
                out += self._pass(team, p, e, t)
            case "pressure" if team and p:
                team.pressures += 1
                p.pressures += 1
                out += self._pressure_spell(team, e)
            case "shot" if team and p:
                out += self._shot(team, p, e)
            case "goal" | "own_goal":
                out += self._goal(e)
            case "save":
                out += self._save(e)
            case "foul" if team:
                team.fouls += 1
                self._last_foul = e
            case "card" if team and p:
                out += self._card(team, p, e, now)
            case "corner" if team:
                team.corners += 1
            case "period_end":
                out += self._period_end(e)
            case "match_end":
                self._end = e
        out += self._clean_sheet(e, now)
        out += self._momentum_swing(e)
        return out

    def apply_frame(self, frame: PositionFrame) -> Insights:
        """Distance and top speed from one position frame; may reach physical milestones."""
        last_frame = self._frame_at
        same_half = last_frame is not None and last_frame[0] == frame.period
        dt = frame.clock_s - last_frame[1] if same_half and last_frame else 0.0
        self._frame_at = (frame.period, frame.clock_s)
        out = Insights()
        if self._last is None:
            return out
        at: At = (frame.period, frame.clock_s)
        for pos in frame.players:
            p = self.players.get(pos.player_id)
            if p is None:
                continue
            p.distance_m += pos.speed_kmh / 3.6 * dt
            p.top_speed = max(p.top_speed, pos.speed_kmh)
            if p.top_speed >= c.TOP_SPEED_TAG_KMH and "top_speed" not in p.tags:
                p.tags.add("top_speed")
                facts: Facts = {"speed_kmh": round(p.top_speed, 1)}
                out += self._milestone("top_speed", at, p.team_id, p, facts, [self._last.id])
            if p.distance_m >= c.DISTANCE_MILESTONE_KM * 1000 and "distance" not in p.tags:
                p.tags.add("distance")
                facts = {"distance_km": round(p.distance_m / 1000, 2)}
                out += self._milestone("distance", at, p.team_id, p, facts, [self._last.id])
        return out

    def finalize(self) -> Insights:
        """End-of-match moments (the match's top speed). Call once, after `match_end`."""
        end = self._end
        if end is None:
            raise RuntimeError("finalize() needs the match_end event first")
        fastest = max(self.players.values(), key=lambda p: p.top_speed)
        if fastest.top_speed <= 0:
            return Insights()
        facts: Facts = {"speed_kmh": round(fastest.top_speed, 1)}
        at: At = (end.period, end.clock_s)
        return self._milestone("match_top_speed", at, fastest.team_id, fastest, facts, [end.id])

    # ---------- outputs ----------
    def moments(self) -> list[KeyMoment]:
        """Every key moment so far, in order."""
        return list(self._moments)

    def stats(self) -> StatSnapshot:
        """Team and player stats after the last applied event."""
        e = self._require_event()
        now = nominal_seconds(e.period, e.clock_s)
        return StatSnapshot(
            match_id=self.match_id,
            period=e.period,
            clock_s=e.clock_s,
            minute=e.minute,
            last_event_id=e.id,
            home=self._team_stats(self.home, self.away),
            away=self._team_stats(self.away, self.home),
            players=[self._player_stats(p, now) for p in self.players.values() if p.appeared],
        )

    def tactical_state(self) -> TacticalState:
        """Rolling-window tactical indices and win probability after the last applied event."""
        e = self._require_event()
        window = list(self._window(c.WINDOW_S))
        minutes = max(min(c.WINDOW_S, self._t), c.MIN_WINDOW_S) / 60
        passes = [x for x in window if x.type == "pass"]
        accuracy = sum(x.outcome == "complete" for x in passes) / len(passes) if passes else None
        changes = [x for x in window if x.type == "possession_change"]
        fouls = sum(x.type == "foul" for x in window)

        def pressing(team: _Team) -> float:
            pressures = sum(x.type == "pressure" and x.team_id == team.id for x in window)
            opponent_spells = sum(x.team_id != team.id for x in changes)
            return round(pressures / max(1, opponent_spells), 2)

        home, away = self._final_third_counts(window)
        chaos = control_chaos(accuracy, len(changes) / minutes, fouls / minutes)
        return TacticalState(
            match_id=self.match_id,
            period=e.period,
            clock_s=e.clock_s,
            minute=e.minute,
            last_event_id=e.id,
            momentum=round(momentum(home, away), 1),
            control_chaos_index=round(chaos, 1),
            pressing_intensity=TeamPair(home=pressing(self.home), away=pressing(self.away)),
            tempo=round(len(passes) / minutes, 2),
            win_probability=self._win_probability(),
        )

    # ---------- events ----------
    def _pass(self, team: _Team, p: _Player, e: MatchEvent, t: float) -> Insights:
        difficulty = pass_difficulty(e)
        team.passes += 1
        p.passes += 1
        p.difficulty += difficulty
        if (e.x or 0.0) < PITCH_LENGTH - c.PPDA_ZONE_X:
            team.own_zone_passes += 1
        at: At = (e.period, e.clock_s)
        out = Insights()
        if e.outcome == "complete":
            team.completed += 1
            p.completed += 1
            spaced = t - self._pass_cue_t >= c.PASS_QUALITY_CUE_GAP_S
            if difficulty >= c.PASS_QUALITY_CUE_MIN and spaced:
                self._pass_cue_t = t
                data: Facts = {
                    "difficulty": difficulty,
                    "length_m": round(pass_length(e), 1),
                    "ball_speed_kmh": e.ball_speed_kmh or 0.0,
                    "under_pressure": bool(e.under_pressure),
                    "cross": bool(e.cross),
                }
                out.cues.append(self._cue("pass_quality", at, data, [e.id], p.id))
        if p.passes == c.PASS_MILESTONE:
            out += self._milestone("passes", at, team.id, p, {"passes": p.passes}, [e.id])
        return out

    def _shot(self, team: _Team, p: _Player, e: MatchEvent) -> Insights:
        xg = e.xg or 0.0
        self._last_shot = e
        team.shots += 1
        team.xg += xg
        p.shots += 1
        p.xg += xg
        at: At = (e.period, e.clock_s)
        out = Insights()
        if e.outcome in ("goal", "saved"):
            team.on_target += 1
            p.on_target += 1
            data: Facts = {
                "shot_speed_kmh": e.shot_speed_kmh or 0.0,
                "xg": round(xg, 2),
                "outcome": e.outcome or "",
                "penalty": bool(e.penalty),
            }
            out.cues.append(self._cue("shot_speed", at, data, [e.id], p.id))
        if xg >= c.BIG_CHANCE_XG and e.outcome in ("off_target", "blocked"):
            facts: Facts = {
                "xg": round(xg, 2),
                "outcome": e.outcome or "",
                "penalty": bool(e.penalty),
            }
            out += self._announce(self._moment("big_chance", at, team.id, [p.id], facts, [e.id]))
        if team.shots == c.TEAM_SHOTS_MILESTONE:
            out += self._milestone("team_shots", at, team.id, None, {"shots": team.shots}, [e.id])
        return out

    def _goal(self, e: MatchEvent) -> Insights:
        before = self._win_probability()
        for team_id, score in (e.score or {}).items():
            self.teams[team_id].goals = score
        after = self._win_probability()
        own_goal = e.type == "own_goal"
        scorer = self.players.get(e.player_id or "")
        scoring_team = self._other(e.team_id) if own_goal else e.team_id
        shot = self._last_shot if self._last_shot and self._last_shot.id == e.id - 1 else None
        players = [x for x in (e.player_id, e.assist_player_id) if x]
        if scorer and not own_goal:
            scorer.goals.append(e.id)
        if assister := self.players.get(e.assist_player_id or ""):
            assister.assists += 1
        facts: Facts = {
            "score_home": self.home.goals,
            "score_away": self.away.goals,
            "own_goal": own_goal,
            "first_goal": self.home.goals + self.away.goals == 1,
            "xg": round(shot.xg or 0.0, 2) if shot else 0.0,
            "shot_speed_kmh": (shot.shot_speed_kmh or 0.0) if shot else 0.0,
            "penalty": bool(shot and shot.penalty),
            **self._win_facts(before, after),
        }
        sources = [shot.id, e.id] if shot else [e.id]
        at: At = (e.period, e.clock_s)
        win_swing = swing(before, after)
        out = self._announce(
            self._moment("goal", at, scoring_team, players, facts, sources, win_swing)
        )
        if scorer and not own_goal and len(scorer.goals) in (2, 3):
            name = "brace" if len(scorer.goals) == 2 else "hat_trick"
            tally: Facts = {"goals": len(scorer.goals)}
            out += self._milestone(name, at, scorer.team_id, scorer, tally, list(scorer.goals))
        return out

    def _save(self, e: MatchEvent) -> Insights:
        shot = self._last_shot if self._last_shot and self._last_shot.id == e.id - 1 else None
        if shot is None or (shot.xg or 0.0) < c.BIG_SAVE_XG or not e.player_id:
            return Insights()
        facts: Facts = {
            "xg": round(shot.xg or 0.0, 2),
            "shot_speed_kmh": shot.shot_speed_kmh or 0.0,
            "penalty": bool(e.penalty),
        }
        players = [e.player_id, *([shot.player_id] if shot.player_id else [])]
        at: At = (e.period, e.clock_s)
        return self._announce(self._moment("save", at, e.team_id, players, facts, [shot.id, e.id]))

    def _card(self, team: _Team, p: _Player, e: MatchEvent, now: float) -> Insights:
        before = self._win_probability()
        if e.card in ("yellow", "second_yellow"):
            team.yellows += 1
        if e.card != "yellow":
            team.reds += 1
            self._leave(p, now)
        after = self._win_probability()
        foul = self._last_foul if self._last_foul and self._last_foul.player_id == p.id else None
        fouled = [foul.opponent_id] if foul and foul.opponent_id else []
        facts: Facts = {"card": e.card or "", **self._win_facts(before, after)}
        sources = [foul.id, e.id] if foul else [e.id]
        at: At = (e.period, e.clock_s)
        win_swing = swing(before, after)
        return self._announce(
            self._moment("card", at, team.id, [p.id, *fouled], facts, sources, win_swing)
        )

    def _period_end(self, e: MatchEvent) -> Insights:
        if e.period == 1:
            self._offset = e.clock_s - HALF_S
        snap = self.stats()
        data: Facts = {"period": e.period}
        for name in c.STAT_COMPARE_FIELDS:
            data[f"{name}_home"] = getattr(snap.home, name)
            data[f"{name}_away"] = getattr(snap.away, name)
        top = sorted(self._moments, key=lambda m: (-m.importance, m.id))[: c.RECAP_TOP_MOMENTS]
        recap: Facts = {
            "period": e.period,
            "score_home": self.home.goals,
            "score_away": self.away.goals,
        }
        at: At = (e.period, e.clock_s)
        return Insights(
            cues=[
                self._cue("stat_compare", at, data, [e.id]),
                self._cue("recap_card", at, recap, [e.id], moments=sorted(m.id for m in top)),
            ]
        )

    # ---------- windows and thresholds ----------
    def _pressure_spell(self, team: _Team, e: MatchEvent) -> Insights:
        pressures = [
            x.id
            for x in self._window(c.PRESSURE_SPELL_WINDOW_S)
            if x.type == "pressure" and x.team_id == team.id
        ]
        was_in_spell, team.in_spell = team.in_spell, len(pressures) >= c.PRESSURE_SPELL_COUNT
        if was_in_spell or not team.in_spell:
            return Insights()
        facts: Facts = {
            "pressures": len(pressures),
            "window_minutes": c.PRESSURE_SPELL_WINDOW_S / 60,
        }
        at: At = (e.period, e.clock_s)
        return self._announce(self._moment("pressure_spell", at, team.id, [], facts, pressures))

    def _momentum_swing(self, e: MatchEvent) -> Insights:
        window = list(self._window(c.WINDOW_S))
        home, away = self._final_third_counts(window)
        if home + away < c.MOMENTUM_MIN_ACTIONS:
            return Insights()
        value = momentum(home, away)
        on_top = None
        if value >= c.MOMENTUM_SWING:
            on_top = self.home.id
        elif value <= -c.MOMENTUM_SWING:
            on_top = self.away.id
        if on_top is None or on_top == self._on_top:
            return Insights()
        self._on_top = on_top
        sources = [x.id for x in window if x.team_id == on_top and self._final_third_action(x)]
        ours, theirs = (home, away) if on_top == self.home.id else (away, home)
        facts: Facts = {
            "momentum": round(value, 1),
            "final_third_actions": ours,
            "opponent_final_third_actions": theirs,
        }
        moment = self._moment("momentum_swing", (e.period, e.clock_s), on_top, [], facts, sources)
        return self._announce(moment, "momentum_bar")

    def _clean_sheet(self, e: MatchEvent, now: float) -> Insights:
        if self._clean_sheet_checked or now < c.CLEAN_SHEET_MINUTE * 60:
            return Insights()
        self._clean_sheet_checked = True
        out = Insights()
        at: At = (e.period, e.clock_s)
        for team in (self.home, self.away):
            if self.teams[self._other(team.id)].goals == 0:
                facts: Facts = {"minute": c.CLEAN_SHEET_MINUTE}
                out += self._milestone("clean_sheet", at, team.id, None, facts, [e.id])
        return out

    # ---------- helpers ----------
    def _window(self, seconds: float) -> Iterable[MatchEvent]:
        return (x for t, x in self._recent if t >= self._t - seconds)

    @staticmethod
    def _final_third_action(x: MatchEvent) -> bool:
        return x.type in c.MOMENTUM_ACTIONS and in_final_third(x.x or 0.0)

    def _final_third_counts(self, window: list[MatchEvent]) -> tuple[int, int]:
        actions = [x.team_id for x in window if self._final_third_action(x)]
        return actions.count(self.home.id), actions.count(self.away.id)

    def _win_probability(self) -> WinProbability:
        e = self._require_event()
        xg = {self.home.id: 0.0, self.away.id: 0.0}
        for x in self._window(c.XG_WINDOW_S):
            if x.type == "shot":
                xg[x.team_id] += x.xg or 0.0
        minutes_left = (2 * HALF_S - nominal_seconds(e.period, e.clock_s)) / 60
        return win_probability(
            self.home.goals,
            self.away.goals,
            goal_rate(xg[self.home.id], self.home.reds, self.away.reds),
            goal_rate(xg[self.away.id], self.away.reds, self.home.reds),
            minutes_left,
        )

    @staticmethod
    def _win_facts(before: WinProbability, after: WinProbability) -> Facts:
        return {
            "win_prob_home": after.home,
            "win_prob_draw": after.draw,
            "win_prob_away": after.away,
            "win_prob_swing": round(swing(before, after), 3),
        }

    def _other(self, team_id: str) -> str:
        return self.away.id if team_id == self.home.id else self.home.id

    def _require_event(self) -> MatchEvent:
        if self._last is None:
            raise RuntimeError("no event applied yet")
        return self._last

    def _enter(self, player_id: str, now: float) -> None:
        if p := self.players.get(player_id):
            p.entered_s, p.appeared = now, True

    @staticmethod
    def _leave(p: _Player, now: float) -> None:
        p.played_s, p.entered_s = p.seconds(now), None

    def _team_stats(self, t: _Team, opp: _Team) -> TeamStats:
        return TeamStats(
            team_id=t.id,
            goals=t.goals,
            possession=_share(t.possession_s, opp.possession_s),
            passes=t.passes,
            pass_accuracy=round(t.completed / t.passes, 3) if t.passes else 0.0,
            shots=t.shots,
            shots_on_target=t.on_target,
            xg=round(t.xg, 2),
            field_tilt=_share(t.final_third, opp.final_third),
            pressures=t.pressures,
            ppda=round(opp.own_zone_passes / t.high_actions, 2) if t.high_actions else None,
            corners=t.corners,
            fouls=t.fouls,
            yellow_cards=t.yellows,
            red_cards=t.reds,
        )

    @staticmethod
    def _player_stats(p: _Player, now: float) -> PlayerStats:
        return PlayerStats(
            player_id=p.id,
            team_id=p.team_id,
            minutes=int(p.seconds(now) // 60),
            passes=p.passes,
            pass_accuracy=round(p.completed / p.passes, 3) if p.passes else 0.0,
            avg_pass_difficulty=round(p.difficulty / p.passes, 1) if p.passes else 0.0,
            distance_km=round(p.distance_m / 1000, 2),
            top_speed_kmh=round(p.top_speed, 1),
            shots=p.shots,
            shots_on_target=p.on_target,
            goals=len(p.goals),
            assists=p.assists,
            xg=round(p.xg, 2),
            defensive_actions=p.defensive,
            pressures=p.pressures,
        )

    # ---------- moments and cues ----------
    def _moment(
        self,
        kind: MomentKind,
        at: At,
        team_id: str,
        player_ids: list[str],
        facts: Facts,
        sources: list[int],
        win_swing: float = 0.0,
    ) -> KeyMoment:
        moment = KeyMoment(
            id=len(self._moments) + 1,
            match_id=self.match_id,
            period=at[0],
            clock_s=at[1],
            minute=int(at[1] // 60),
            kind=kind,
            importance=round(max(win_swing, c.BASE_IMPORTANCE[kind]), 3),
            team_id=team_id,
            player_ids=player_ids,
            facts=facts,
            source_event_ids=sorted(set(sources)),
        )
        self._moments.append(moment)
        return moment

    def _milestone(
        self,
        name: str,
        at: At,
        team_id: str,
        player: _Player | None,
        facts: Facts,
        sources: list[int],
    ) -> Insights:
        players = [player.id] if player else []
        all_facts: Facts = {"milestone": name, **facts}
        moment = self._moment("milestone", at, team_id, players, all_facts, sources)
        return self._announce(moment, "player_tag" if player else "key_moment")

    def _announce(self, moment: KeyMoment, template: CueTemplate = "key_moment") -> Insights:
        """The moment plus the overlay cue that shows it."""
        data: Facts = {"moment_kind": moment.kind, **moment.facts}
        anchor = moment.player_ids[0] if moment.player_ids else None
        at: At = (moment.period, moment.clock_s)
        cue = self._cue(template, at, data, moment.source_event_ids, anchor, [moment.id])
        return Insights([moment], [cue])

    def _cue(
        self,
        template: CueTemplate,
        at: At,
        data: Facts,
        sources: list[int],
        anchor: str | None = None,
        moments: list[int] | None = None,
    ) -> OverlayCue:
        self._cue_count += 1
        duration, priority = c.CUE_TIMING[template]
        return OverlayCue(
            id=self._cue_count,
            match_id=self.match_id,
            period=at[0],
            start_clock_s=at[1],
            duration_s=duration,
            template=template,
            priority=priority,
            anchor_player_id=anchor,
            data=data,
            source_moment_ids=moments or [],
            source_event_ids=sources,
        )
