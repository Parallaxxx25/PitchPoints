import type { OverlayCue } from "../contracts.gen.ts";

/** The least time, in real milliseconds, a cue stays up. At 1x speed the match clock alone decides; faster, this keeps cues readable. */
export const MIN_SHOW_MS = 4000;

type Clock = { period: 1 | 2; clock_s: number } | null;

/** At most one cue per template: the highest priority, or the most recent when priorities tie; highest priority first. */
function topPerTemplate(cues: readonly OverlayCue[]): OverlayCue[] {
  const best = new Map<OverlayCue["template"], OverlayCue>();
  for (const cue of cues) {
    const current = best.get(cue.template);
    const better =
      !current ||
      cue.priority > current.priority ||
      (cue.priority === current.priority &&
        cue.start_clock_s >= current.start_clock_s);
    if (better) best.set(cue.template, cue);
  }
  return [...best.values()].sort((a, b) => b.priority - a.priority);
}

/** Whether the match clock is inside the cue: it shows from `start_clock_s` for `duration_s`. */
function inWindow(cue: OverlayCue, clock: NonNullable<Clock>): boolean {
  return (
    cue.period === clock.period &&
    cue.start_clock_s <= clock.clock_s &&
    clock.clock_s < cue.start_clock_s + cue.duration_s
  );
}

/** The cues showing at a match clock, at most one per template. */
export function activeCues(
  cues: readonly OverlayCue[],
  clock: Clock,
): OverlayCue[] {
  if (!clock) return [];
  return topPerTemplate(cues.filter((c) => inWindow(c, clock)));
}

/**
 * The cues to draw: those active at the match clock, plus any that were first drawn less than
 * `MIN_SHOW_MS` ago (`firstSeen` maps a cue id to the `performance.now()` it first showed).
 */
export function visibleCues(
  cues: readonly OverlayCue[],
  clock: Clock,
  firstSeen: ReadonlyMap<number, number>,
  now: number,
): OverlayCue[] {
  if (!clock) return [];
  const showing = cues.filter(
    (c) =>
      inWindow(c, clock) ||
      now - (firstSeen.get(c.id) ?? -Infinity) < MIN_SHOW_MS,
  );
  return topPerTemplate(showing);
}
