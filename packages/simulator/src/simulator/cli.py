"""Command line for the simulator.

    python -m simulator --seed 7 --out match.jsonl                  # JSONL file
    python -m simulator --seed 7 --script director/demo.yaml --stream --speed 18
    python -m simulator --validate 300                               # realism report

Output is one JSON `SimulatorMessage` per line: metadata, then events and
position frames in match-clock order.
"""

import argparse
import sys
import time
from collections.abc import Callable, Iterable
from pathlib import Path

from contracts import MatchEvent, MatchMetadata, PositionFrame
from simulator import load_script, simulate
from simulator.validate import out_of_range, realism, report


def stream(
    messages: Iterable[MatchMetadata | MatchEvent | PositionFrame],
    speed: float,
    sink: Callable[[str], None],
) -> None:
    """Replay messages in accelerated real time; `sink` receives each JSON line."""
    prev: float | None = None
    for msg in messages:
        clock = None if isinstance(msg, MatchMetadata) else msg.clock_s
        if clock is not None and prev is not None:
            time.sleep(min(max(0.0, clock - prev) / speed, 5.0))
        prev = clock if clock is not None else prev
        sink(msg.model_dump_json())


def main(argv: list[str] | None = None) -> None:
    """Entry point for `python -m simulator`."""
    ap = argparse.ArgumentParser(
        prog="simulator", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--script", type=Path, help="director-mode YAML script")
    ap.add_argument("--out", type=Path, help="write JSONL messages to this file")
    ap.add_argument("--stream", action="store_true", help="replay messages live to stdout")
    ap.add_argument("--speed", type=float, default=18.0, help="replay speed multiplier")
    ap.add_argument("--no-frames", action="store_true", help="skip position frames")
    ap.add_argument("--validate", type=int, metavar="N", help="realism report over N seeds")
    args = ap.parse_args(argv)

    if args.validate:
        averages = realism(args.validate)
        print(report(averages, args.validate))
        sys.exit(1 if out_of_range(averages) else 0)

    match = simulate(
        args.seed, load_script(args.script) if args.script else None, not args.no_frames
    )
    score = match.events[-1].score
    if args.out:
        with args.out.open("w", encoding="utf-8", newline="\n") as f:
            f.writelines(msg.model_dump_json() + "\n" for msg in match.messages())
        print(f"Wrote {args.out}. Final score: {score}", file=sys.stderr)
    if args.stream:
        stream(match.messages(), args.speed, lambda line: print(line, flush=True))
    if not args.out and not args.stream:
        print(f"Simulated {len(match.events)} events. Final score: {score}", file=sys.stderr)
