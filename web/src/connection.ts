import { api, ApiError, liveUrl } from "./api.ts";
import type { LiveMessage, MatchControl, StartMatch } from "./contracts.gen.ts";
import { useProfile } from "./profile.ts";
import { buildClips } from "./replay.ts";
import { useLive } from "./store.ts";

/** WebSocket close code the devserver uses for an unknown match. */
const NOT_FOUND_CLOSE = 4404;
const RETRY_MS = 1500;
/** The devserver caps one replay at this many source events. */
export const MAX_REPLAY_EVENTS = 50;

interface Session {
  matchId: string;
  stop: () => void;
}

let session: Session | null = null;

/** The server-side profile that carries the viewer's fantasy squad; none without a squad. */
async function ensureProfileId(): Promise<string | null> {
  const { profile, setProfileId } = useProfile.getState();
  if (!profile.fantasy_squad) {
    setProfileId(null);
    return null;
  }
  const created = await api.createProfile(profile);
  setProfileId(created.id);
  return created.id;
}

/** Load what the socket does not replay: moments, cues, ledger, and where the players are now. */
async function hydrate(matchId: string): Promise<void> {
  try {
    const [state, moments, cues, ledger] = await Promise.all([
      api.state(matchId),
      api.moments(matchId),
      api.cues(matchId),
      api.ledger(matchId),
    ]);
    let frame = null;
    if (state.last_event_id > 0) {
      const around = await api.replay(matchId, [state.last_event_id]);
      const at =
        around.events.find((e) => e.id === state.last_event_id)?.clock_s ??
        Infinity;
      frame =
        around.frames.filter((f) => f.clock_s <= at).at(-1) ??
        around.frames[0] ??
        null;
    }
    if (useLive.getState().matchId !== matchId) return;
    useLive.getState().hydrate({
      moments,
      cues,
      ledger: Object.fromEntries(ledger.map((x) => [x.id, x])),
      ...(frame && !useLive.getState().frame ? { frame } : {}),
    });
  } catch {
    // The socket keeps the live data flowing; a later reconnect tries again.
  }
}

function open(matchId: string, fresh: boolean): Session {
  let closed = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const live = useLive.getState();
  if (fresh) live.setMatch(matchId);
  live.setConnection("connecting");

  const unsubscribe = useLive.subscribe((s, prev) => {
    if (s.state && prev.state && s.state.revision !== prev.state.revision)
      void hydrate(matchId);
  });

  const retry = () => {
    timer = setTimeout(() => void run(), RETRY_MS);
  };

  async function run(): Promise<void> {
    if (closed) return;
    let profileId: string | null;
    try {
      profileId = await ensureProfileId();
    } catch {
      useLive.getState().setConnection("lost");
      retry();
      return;
    }
    if (closed) return;
    const ws = (socket = new WebSocket(liveUrl(matchId, profileId)));
    ws.onopen = () => {
      useLive.getState().setConnection("open");
      void hydrate(matchId);
    };
    ws.onmessage = (event) => {
      useLive.getState().apply(JSON.parse(String(event.data)) as LiveMessage);
    };
    ws.onclose = (event) => {
      if (closed) return;
      if (event.code === NOT_FOUND_CLOSE) {
        useLive.getState().setConnection("missing");
        return;
      }
      useLive.getState().setConnection("lost");
      retry();
    };
  }

  void run();
  return {
    matchId,
    stop: () => {
      closed = true;
      clearTimeout(timer);
      unsubscribe();
      socket?.close();
    },
  };
}

/** Put the match in the address, so a reload joins the same match. */
function rememberMatch(matchId: string | null): void {
  const url = new URL(location.href);
  if (matchId) url.searchParams.set("match", matchId);
  else url.searchParams.delete("match");
  history.replaceState(null, "", url);
}

/** Watch a match: fetch its history and follow it live. */
export function connect(matchId: string): void {
  disconnect();
  session = open(matchId, true);
  rememberMatch(matchId);
}

export function disconnect(): void {
  session?.stop();
  session = null;
}

/** Stop watching and go back to the start screen. */
export function leaveMatch(): void {
  disconnect();
  useLive.getState().setMatch(null);
  rememberMatch(null);
}

/** Reconnect to the current match, for example after the viewer's fantasy squad changed. */
export function reconnect(): void {
  if (!session) return;
  const { matchId } = session;
  disconnect();
  session = open(matchId, false);
}

/** Start a new match on the server and watch it. */
export async function startMatch(body: StartMatch): Promise<void> {
  const state = await api.startMatch(body);
  connect(state.match_id);
}

/** Pause, resume, change speed, or seek the current match. */
export async function control(change: Partial<MatchControl>): Promise<void> {
  const { matchId, apply } = useLive.getState();
  if (!matchId) return;
  apply(await api.control(matchId, change));
}

let replayToken = 0;

/** Fetch the events behind something and replay them on the pitch. */
export async function startReplay(
  label: string,
  eventIds: readonly number[],
): Promise<void> {
  const { matchId, setReplay } = useLive.getState();
  if (!matchId || eventIds.length === 0) return;
  const token = ++replayToken;
  setReplay({
    label,
    status: "loading",
    clips: [],
    startedAt: performance.now(),
  });
  let next;
  try {
    const clips = buildClips(
      await api.replay(matchId, eventIds.slice(0, MAX_REPLAY_EVENTS)),
    );
    next = clips.length
      ? {
          label,
          status: "playing" as const,
          clips,
          startedAt: performance.now(),
        }
      : {
          label,
          status: "failed" as const,
          clips,
          startedAt: performance.now(),
        };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      useLive.getState().setConnection("missing");
    next = {
      label,
      status: "failed" as const,
      clips: [],
      startedAt: performance.now(),
    };
  }
  if (token === replayToken) setReplay(next);
}

export function stopReplay(): void {
  replayToken += 1;
  useLive.getState().setReplay(null);
}
