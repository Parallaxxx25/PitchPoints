"""`uv run devserver`: the local live pipeline (PITCHPOINTS_MODE=local) on http://127.0.0.1:8000."""

import argparse
import os
import sys

import uvicorn

from devserver.app import create_app


def main(argv: list[str] | None = None) -> None:
    """Entry point for `uv run devserver`."""
    ap = argparse.ArgumentParser(prog="devserver", description=__doc__)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args(argv)
    mode = os.environ.get("PITCHPOINTS_MODE", "local")
    if mode != "local":
        sys.exit(
            f"PITCHPOINTS_MODE={mode} is not available yet; only local runs (Azure is Phase 6)."
        )
    uvicorn.run(create_app(), host=args.host, port=args.port)
