"""Ports: what the live pipeline needs from infrastructure.

Business logic depends on these protocols only. Local adapters live in
`devserver.adapters`; Azure adapters (Phase 6) go in `*/adapters/azure_*.py`.
"""

from collections.abc import AsyncIterator
from typing import Protocol

from pydantic import BaseModel

from contracts import LiveMessage, SimulatorMessage, ViewerProfile


class EventBus(Protocol):
    """Carries simulator messages from the feed to the engines, in order, per topic."""

    async def publish(self, topic: str, message: SimulatorMessage) -> None: ...

    def subscribe(self, topic: str) -> AsyncIterator[SimulatorMessage]: ...


class Store(Protocol):
    """The latest engine output per match, and viewer profiles."""

    async def put(self, match_id: str, item: LiveMessage) -> None:
        """Insert or replace. Items with an `id` are keyed by it; others are one per kind."""
        ...

    async def get[T: BaseModel](self, match_id: str, kind: type[T]) -> list[T]:
        """Every stored item of one contract type, in first-stored order."""
        ...

    async def clear(self, match_id: str) -> None: ...

    async def put_profile(self, profile: ViewerProfile) -> None: ...

    async def get_profile(self, profile_id: str) -> ViewerProfile | None: ...

    async def profiles(self) -> list[ViewerProfile]: ...


class LivePush(Protocol):
    """Pushes live messages to everyone watching a match, or to one viewer."""

    async def send(
        self, match_id: str, message: LiveMessage, profile_id: str | None = None
    ) -> None: ...
