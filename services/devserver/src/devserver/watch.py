"""A simple live client: starts a match on the devserver and prints what arrives.

    uv run devserver                                          # first terminal
    uv run python -m devserver.watch --seed 7 --script demo   # second terminal

Prints key events, key moments, overlay cues, ledger updates, and stats every
15 match minutes, then how many messages of each kind arrived.
"""

import argparse
import json
import urllib.request
from collections import Counter

from pydantic import TypeAdapter
from websockets.sync.client import connect

from contracts import (
    KeyMoment,
    LedgerEntry,
    LiveMessage,
    MatchEvent,
    MatchMetadata,
    MatchState,
    OverlayCue,
    SquadTotal,
    StatSnapshot,
)

SHOWN_EVENTS = frozenset({"goal", "own_goal", "card", "substitution", "period_end", "match_end"})
STATS_EVERY_MIN = 15


def start_match(server: str, seed: int, script: str | None, speed: int) -> MatchState:
    """POST /matches and return the new match's state."""
    body = json.dumps({"seed": seed, "script": script, "speed": speed}).encode()
    request = urllib.request.Request(
        f"{server}/matches", body, {"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request) as response:
        return MatchState.model_validate_json(response.read())


def main(argv: list[str] | None = None) -> None:
    """Entry point for `python -m devserver.watch`."""
    ap = argparse.ArgumentParser(
        prog="devserver.watch",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--server", default="http://127.0.0.1:8000")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--script", help="director script name, such as demo")
    ap.add_argument("--speed", type=int, choices=[1, 6, 18, 60], default=18)
    args = ap.parse_args(argv)

    match_id = start_match(args.server, args.seed, args.script, args.speed).match_id
    adapter = TypeAdapter[LiveMessage](LiveMessage)
    counts: Counter[str] = Counter()
    names: dict[str, str] = {}
    teams = ("home", "away")
    next_stats = 0
    with connect(args.server.replace("http", "ws", 1) + f"/live/{match_id}", max_size=None) as ws:
        for raw in ws:
            msg = adapter.validate_json(raw)
            counts[msg.kind] += 1
            line = None
            match msg:
                case MatchMetadata():
                    sheets = (msg.home, msg.away)
                    names = {p.id: p.name for s in sheets for p in (*s.starters, *s.bench)}
                    teams = (msg.home.short_name, msg.away.short_name)
                    line = f"{msg.home.name} v {msg.away.name} at {msg.venue}"
                case MatchState():
                    score = f"{teams[0]} {msg.score_home}-{msg.score_away} {teams[1]}"
                    line = f"{msg.minute:>3}' [{msg.status} {msg.speed}x] {score}"
                case MatchEvent() if msg.type in SHOWN_EVENTS:
                    who = names.get(msg.player_id or "", "")
                    line = f"{msg.minute:>3}' {msg.type} {who} {msg.card or ''}".rstrip()
                case KeyMoment():
                    what = " ".join(str(x) for x in (msg.type, msg.facts.get("milestone")) if x)
                    line = f"{msg.minute:>3}' moment {what} ({msg.importance:.2f})"
                case OverlayCue():
                    line = f"{int(msg.start_clock_s // 60):>3}' cue {msg.template}"
                case LedgerEntry():
                    note = " (provisional)" if msg.provisional else ""
                    line = (
                        f"{msg.minute:>3}' points {names.get(msg.player_id, msg.player_id)} "
                        f"{msg.delta:+d} {msg.rule_id} = {msg.running_total}{note}"
                    )
                case StatSnapshot() if msg.minute >= next_stats:
                    next_stats = msg.minute + STATS_EVERY_MIN
                    h, a = msg.home, msg.away
                    line = (
                        f"{msg.minute:>3}' stats possession {h.possession:.0%}-{a.possession:.0%}"
                        f" shots {h.shots}-{a.shots} xG {h.xg:.2f}-{a.xg:.2f}"
                    )
                case SquadTotal():
                    line = f"     squad total {msg.total}"
            if line:
                print(line, flush=True)
            if isinstance(msg, MatchState) and msg.status == "finished":
                break
    print("Received: " + ", ".join(f"{k} {n}" for k, n in sorted(counts.items())))


if __name__ == "__main__":
    main()
