"""FastAPI app for the local live pipeline (PITCHPOINTS_MODE=local)."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect

from contracts import (
    KeyMoment,
    LedgerEntry,
    MatchControl,
    MatchState,
    NewProfile,
    OverlayCue,
    StartMatch,
    StatSnapshot,
    ViewerProfile,
)
from devserver.adapters.memory import MemoryEventBus, MemoryStore
from devserver.adapters.websocket import WebSocketPush
from devserver.ports import EventBus, Store
from devserver.runner import MatchRunner
from simulator import SCRIPTS_DIR, load_script, simulate

NOT_FOUND_CLOSE = 4404
"""WebSocket close code for an unknown match or profile."""


def create_app(
    store: Store | None = None, bus: EventBus | None = None, live: WebSocketPush | None = None
) -> FastAPI:
    """The HTTP and WebSocket API over the given adapters (in-memory by default)."""
    store = store or MemoryStore()
    bus = bus or MemoryEventBus()
    push = live or WebSocketPush()
    runners: dict[str, MatchRunner] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        for r in runners.values():
            await r.stop()

    app = FastAPI(title="PitchPoints devserver", lifespan=lifespan)

    def get_runner(match_id: str) -> MatchRunner:
        if match_id not in runners:
            raise HTTPException(404, f"no match {match_id!r}")
        return runners[match_id]

    @app.post("/matches", status_code=201)
    async def start_match(body: StartMatch) -> MatchState:
        """Simulate a match and play it live; starting the same seed again replaces it."""
        script = None
        if body.script:
            path = SCRIPTS_DIR / f"{body.script}.yaml"
            if not path.is_file():
                raise HTTPException(404, f"no director script {body.script!r}")
            script = load_script(path)
        match = await asyncio.to_thread(simulate, body.seed, script)
        match_id = match.metadata.match_id
        if old := runners.pop(match_id, None):
            await old.stop()
        r = runners[match_id] = MatchRunner(match, bus, store, push, body.speed, body.paused)
        await r.start()
        return r.state()

    @app.get("/matches/{match_id}")
    async def match_state(match_id: str) -> MatchState:
        return get_runner(match_id).state()

    @app.post("/matches/{match_id}/control")
    async def control(match_id: str, body: MatchControl) -> MatchState:
        """Pause, resume, change speed, or seek to a minute."""
        return await get_runner(match_id).control(body)

    @app.get("/matches/{match_id}/stats")
    async def stats(match_id: str) -> StatSnapshot:
        get_runner(match_id)
        found = await store.get(match_id, StatSnapshot)
        if not found:
            raise HTTPException(404, "no stats before kickoff")
        return found[0]

    @app.get("/matches/{match_id}/moments")
    async def moments(match_id: str) -> list[KeyMoment]:
        get_runner(match_id)
        return await store.get(match_id, KeyMoment)

    @app.get("/matches/{match_id}/overlay-cues")
    async def overlay_cues(match_id: str) -> list[OverlayCue]:
        """Every overlay cue so far, for export to a graphics system."""
        get_runner(match_id)
        return await store.get(match_id, OverlayCue)

    @app.get("/matches/{match_id}/ledger/{player_id}")
    async def ledger(match_id: str, player_id: str) -> list[LedgerEntry]:
        """The current version of every ledger entry for one player."""
        if player_id not in get_runner(match_id).pipeline.scoring.players:
            raise HTTPException(404, f"no player {player_id!r} in this match")
        return [x for x in await store.get(match_id, LedgerEntry) if x.player_id == player_id]

    @app.post("/profiles", status_code=201)
    async def create_profile(body: NewProfile) -> ViewerProfile:
        profile = ViewerProfile.model_validate({**body.model_dump(), "id": uuid4().hex[:12]})
        await store.put_profile(profile)
        return profile

    @app.websocket("/live/{match_id}")
    async def live_feed(ws: WebSocket, match_id: str, profile: str | None = None) -> None:
        """A snapshot first, then every live message for the match and the viewer's squad total."""
        await ws.accept()
        r = runners.get(match_id)
        viewer = await store.get_profile(profile) if profile else None
        if r is None or (profile and viewer is None):
            await ws.close(code=NOT_FOUND_CLOSE, reason="unknown match or profile")
            return
        push.connect(match_id, ws, profile)
        try:
            for item in await r.snapshot(viewer):
                await ws.send_text(item.model_dump_json())
            while True:
                await ws.receive_text()  # viewers send nothing; this waits for the disconnect
        except WebSocketDisconnect:
            pass
        finally:
            push.disconnect(match_id, ws)

    return app
