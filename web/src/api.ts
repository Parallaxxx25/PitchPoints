import type {
  KeyMoment,
  LedgerEntry,
  MatchControl,
  MatchState,
  NewProfile,
  OverlayCue,
  Replay,
  StartMatch,
  ViewerProfile,
} from "./contracts.gen.ts";

/** Where the match server lives; empty means the same origin (the Vite dev proxy forwards it). */
const BASE: string = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`${path} failed with ${status}`);
    this.status = status;
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, path);
  return (await response.json()) as T;
}

export const api = {
  startMatch: (body: StartMatch) => request<MatchState>("/matches", body),
  state: (matchId: string) => request<MatchState>(`/matches/${matchId}`),
  control: (matchId: string, body: Partial<MatchControl>) =>
    request<MatchState>(`/matches/${matchId}/control`, body),
  moments: (matchId: string) =>
    request<KeyMoment[]>(`/matches/${matchId}/moments`),
  cues: (matchId: string) =>
    request<OverlayCue[]>(`/matches/${matchId}/overlay-cues`),
  ledger: (matchId: string) =>
    request<LedgerEntry[]>(`/matches/${matchId}/ledger`),
  replay: (matchId: string, eventIds: readonly number[]) =>
    request<Replay>(
      `/matches/${matchId}/replay?${eventIds.map((id) => `event_ids=${id}`).join("&")}`,
    ),
  createProfile: (body: NewProfile) =>
    request<ViewerProfile>("/profiles", body),
};

/** The live WebSocket address for a match, optionally as a known viewer. */
export function liveUrl(matchId: string, profileId: string | null): string {
  const base =
    BASE ||
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const query = profileId ? `?profile=${profileId}` : "";
  return `${base.replace(/^http/, "ws")}/live/${matchId}${query}`;
}
