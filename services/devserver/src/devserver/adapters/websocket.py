"""LivePush over FastAPI WebSockets for PITCHPOINTS_MODE=local."""

from collections import defaultdict

from fastapi import WebSocket

from contracts import LiveMessage


class WebSocketPush:
    """Connected viewers per match; a viewer whose send fails is dropped."""

    def __init__(self) -> None:
        self._viewers: defaultdict[str, dict[WebSocket, str | None]] = defaultdict(dict)

    def connect(self, match_id: str, ws: WebSocket, profile_id: str | None) -> None:
        self._viewers[match_id][ws] = profile_id

    def disconnect(self, match_id: str, ws: WebSocket) -> None:
        self._viewers[match_id].pop(ws, None)

    async def send(
        self, match_id: str, message: LiveMessage, profile_id: str | None = None
    ) -> None:
        # ponytail: sends one viewer at a time, so a slow viewer delays the rest; queue per viewer if that bites
        text = message.model_dump_json()
        for ws, viewer in list(self._viewers[match_id].items()):
            if profile_id not in (None, viewer):
                continue
            try:
                await ws.send_text(text)
            except Exception:  # any failed send means the viewer has gone
                self.disconnect(match_id, ws)
