"""Fictional clubs, deterministic squads, and match metadata.

Squads depend only on the club, never on the match seed, so a fan's favourite
club and players stay the same across matches.
"""

import random
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from functools import cache

from contracts import MatchMetadata, PlayerInfo, Position, TeamSheet, Weather


@dataclass(frozen=True)
class Club:
    id: str
    name: str
    short_name: str
    primary_colour: str
    secondary_colour: str
    venue: str
    city: str
    capacity: int
    strength: float  # 0..1


CLUBS: tuple[Club, ...] = (
    Club("RVR", "Riverside Rovers", "Riverside", "#1d4ed8", "#ffffff", "The Wharf", "Millbrook", 41000, 0.62),
    Club("HLA", "Highland Athletic", "Highland", "#15803d", "#facc15", "Heather Park", "Carrow Vale", 33000, 0.55),
    Club("PTH", "Porthaven FC", "Porthaven", "#0e7490", "#f8fafc", "Lighthouse Ground", "Porthaven", 28000, 0.48),
    Club("SLW", "Saltwick Wanderers", "Saltwick", "#b91c1c", "#fde68a", "Saltwick Lane", "Saltwick", 24000, 0.44),
    Club("FGU", "Forgeholm United", "Forgeholm", "#334155", "#f97316", "The Anvil", "Forgeholm", 52000, 0.66),
    Club("NCA", "Northcliff Albion", "Northcliff", "#7c3aed", "#ffffff", "Cliff Road", "Northcliff", 30000, 0.51),
    Club("ELM", "Elmstead City", "Elmstead", "#0ea5e9", "#0f172a", "Elm Park", "Elmstead", 46000, 0.58),
    Club("CRW", "Crowmere FC", "Crowmere", "#111827", "#e5e7eb", "Crowmere Stadium", "Crowmere", 21000, 0.42),
)  # fmt: skip

# (position, base_x, base_y) for a 4-3-3, attacking left to right
FORMATION_433: tuple[tuple[Position, float, float], ...] = (
    ("GK", 5, 34), ("DEF", 20, 10), ("DEF", 18, 26), ("DEF", 18, 42), ("DEF", 20, 58),
    ("MID", 42, 18), ("MID", 36, 34), ("MID", 42, 50),
    ("FWD", 70, 12), ("FWD", 74, 34), ("FWD", 70, 56),
)  # fmt: skip
BENCH_SLOTS: tuple[tuple[Position, float, float], ...] = (
    ("DEF", 20, 26), ("MID", 40, 34), ("MID", 42, 18), ("FWD", 72, 34), ("FWD", 70, 56),
)  # fmt: skip

FIRST = ("Leo", "Max", "Theo", "Kai", "Noah", "Eli", "Rafa", "Jonas", "Milo", "Ivo",
         "Tomas", "Ari", "Dani", "Luca", "Oskar", "Remy", "Sami", "Bruno", "Enzo", "Femi",
         "Kofi", "Yuto", "Mateo", "Nico", "Arlo", "Tariq", "Emil", "Joao", "Idris", "Soren")  # fmt: skip
LAST = ("Arden", "Brask", "Calloway", "Dravic", "Esterhaz", "Falkner", "Gorran", "Halden",
        "Ivarsen", "Joss", "Kestrel", "Lunmark", "Marlow", "Nyvold", "Orrin", "Pelt", "Quarry",
        "Rendell", "Sorano", "Tavish", "Ulmer", "Vantrell", "Whitlock", "Yarrow", "Zelvan",
        "Abernath", "Brennick", "Castellan", "Dunmore", "Elstrow")  # fmt: skip
REFEREES = ("Hal Brennock", "Ines Varto", "Corin Ashby", "Marta Lindqvale", "Owen Strade",
            "Priya Kellow", "Dario Fenwick", "Sian Mottram")  # fmt: skip
WEATHER: tuple[Weather, ...] = ("clear", "cloudy", "rain", "wind", "cold")
COMPETITION = "PitchPoints Synthetic League"
SEASON = "2026/27"
SEASON_START = datetime(2026, 8, 15, tzinfo=UTC)
KICKOFF_SLOTS = ((12, 30), (15, 0), (17, 30), (20, 0))


@dataclass
class Player:
    id: str
    name: str
    team_id: str
    position: Position
    shirt: int
    base_x: float
    base_y: float
    passing: float  # 0..1
    shooting: float  # 0..1
    defending: float  # 0..1
    discipline: float  # 0..1, higher = fewer cards
    pace: float  # 0..1
    on_pitch: bool = True

    @property
    def top_speed_kmh(self) -> float:
        """Sprint speed cap used by the position model."""
        return 28.0 + 7.0 * self.pace


@dataclass
class Team:
    club: Club
    strength: float  # 0..1, club strength plus match-day form
    starters: list[Player]  # substitutes are appended when they come on
    bench: list[Player]

    @property
    def id(self) -> str:
        return self.club.id

    def active(self) -> list[Player]:
        return [p for p in self.starters if p.on_pitch]

    def keeper(self) -> Player:
        return next(p for p in self.active() if p.position == "GK")


@cache
def _roster() -> dict[str, tuple[Player, ...]]:
    """Every club's 16 players (11 starters, then bench), with globally unique names."""
    rng = random.Random("pitchpoints-squads")
    used: set[str] = set()

    def new_name() -> str:
        while (name := f"{rng.choice(FIRST)} {rng.choice(LAST)}") in used:
            pass
        used.add(name)
        return name

    def make(club: Club, pos: Position, shirt: int, bx: float, by: float, starter: bool) -> Player:
        def rating(bias: float) -> float:
            return max(0.05, min(0.95, rng.gauss(0.5 + bias + (club.strength - 0.5) * 0.4, 0.12)))

        return Player(
            id=f"{club.id}-{shirt}",
            name=new_name(),
            team_id=club.id,
            position=pos,
            shirt=shirt,
            base_x=bx,
            base_y=by,
            passing=rating(0.1 if pos == "MID" else 0.0),
            shooting=rating(0.2 if pos == "FWD" else -0.1 if pos in ("DEF", "GK") else 0.0),
            defending=rating(
                0.2 if pos == "DEF" else 0.15 if pos == "GK" else -0.1 if pos == "FWD" else 0.0
            ),
            discipline=rating(0.1),
            pace=rating(-0.2 if pos == "GK" else 0.1 if pos == "FWD" else 0.0),
            on_pitch=starter,
        )

    return {
        club.id: (
            *(
                make(club, pos, i + 1, bx, by, True)
                for i, (pos, bx, by) in enumerate(FORMATION_433)
            ),
            *(
                make(club, pos, 12 + i, bx, by, False)
                for i, (pos, bx, by) in enumerate(BENCH_SLOTS)
            ),
        )
        for club in CLUBS
    }


def make_team(club: Club, strength: float) -> Team:
    """Fresh, mutable copy of a club's squad for one match."""
    players = [replace(p) for p in _roster()[club.id]]
    return Team(club, strength, players[:11], players[11:])


def fixture(seed: int) -> tuple[Team, Team]:
    """Pick the home and away clubs and their match-day strength for a seed."""
    rng = random.Random(f"fixture:{seed}")
    home, away = rng.sample(CLUBS, 2)

    def with_form(club: Club) -> Team:
        return make_team(club, max(0.35, min(0.75, club.strength + rng.gauss(0, 0.04))))

    return with_form(home), with_form(away)


def team_sheet(team: Team) -> TeamSheet:
    """Starting line-up and bench as they were before kickoff."""

    def info(p: Player) -> PlayerInfo:
        return PlayerInfo(id=p.id, name=p.name, shirt=p.shirt, position=p.position)

    c = team.club
    return TeamSheet(
        id=c.id,
        name=c.name,
        short_name=c.short_name,
        primary_colour=c.primary_colour,
        secondary_colour=c.secondary_colour,
        formation="4-3-3",
        starters=[info(p) for p in team.starters[:11]],
        bench=[info(p) for p in team.bench],
    )


def make_metadata(seed: int, match_id: str, home: Team, away: Team) -> MatchMetadata:
    """Fictional fixture details for a seed."""
    rng = random.Random(f"metadata:{seed}")
    matchday = rng.randint(1, 38)
    hour, minute = rng.choice(KICKOFF_SLOTS)
    kickoff = SEASON_START + timedelta(weeks=matchday - 1, hours=hour, minutes=minute)
    return MatchMetadata(
        match_id=match_id,
        competition=COMPETITION,
        season=SEASON,
        matchday=matchday,
        venue=home.club.venue,
        city=home.club.city,
        kickoff_utc=kickoff,
        weather=rng.choice(WEATHER),
        temperature_c=rng.randint(4, 24),
        referee=rng.choice(REFEREES),
        attendance=int(home.club.capacity * rng.uniform(0.82, 1.0)),
        home=team_sheet(home),
        away=team_sheet(away),
    )
