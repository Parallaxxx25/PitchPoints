"""In-process EventBus and Store for PITCHPOINTS_MODE=local; nothing survives a restart."""

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator

from pydantic import BaseModel

from contracts import LiveMessage, SimulatorMessage, ViewerProfile


class MemoryEventBus:
    """One asyncio queue per topic; a topic's queue is dropped when its subscriber stops."""

    def __init__(self) -> None:
        self._queues: defaultdict[str, asyncio.Queue[SimulatorMessage]] = defaultdict(asyncio.Queue)

    async def publish(self, topic: str, message: SimulatorMessage) -> None:
        await self._queues[topic].put(message)

    async def subscribe(self, topic: str) -> AsyncIterator[SimulatorMessage]:
        queue = self._queues[topic]
        try:
            while True:
                yield await queue.get()
        finally:
            self._queues.pop(topic, None)


class MemoryStore:
    """Dictionaries keyed by match, kind, and item id."""

    def __init__(self) -> None:
        self._items: defaultdict[str, defaultdict[str, dict[str, LiveMessage]]] = defaultdict(
            lambda: defaultdict(dict)
        )
        self._profiles: dict[str, ViewerProfile] = {}

    async def put(self, match_id: str, item: LiveMessage) -> None:
        self._items[match_id][item.kind][str(getattr(item, "id", item.kind))] = item

    async def get[T: BaseModel](self, match_id: str, kind: type[T]) -> list[T]:
        stored = self._items[match_id][kind.model_fields["kind"].default].values()
        return [x for x in stored if isinstance(x, kind)]

    async def clear(self, match_id: str) -> None:
        self._items.pop(match_id, None)

    async def put_profile(self, profile: ViewerProfile) -> None:
        self._profiles[profile.id] = profile

    async def get_profile(self, profile_id: str) -> ViewerProfile | None:
        return self._profiles.get(profile_id)

    async def profiles(self) -> list[ViewerProfile]:
        return list(self._profiles.values())
