/** Pitch geometry and the one place where match coordinates become screen coordinates. */

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export interface Point {
  x: number;
  y: number;
}

/** Which team's attacking perspective a coordinate is in: events use the acting team's, frames use home's. */
export type Perspective = "home" | "away";

/**
 * Screen coordinates on the 105 x 68 pitch, where the home team attacks left to right in the
 * first half and right to left in the second.
 *
 * A coordinate in the home team's perspective is flipped in the second half; one in the away
 * team's perspective is flipped in the first half. The only flip in the web app lives here.
 * To get a team-relative view (a heatmap, say) pass the period in which that team attacks
 * left to right: 1 for home, 2 for away.
 */
export function toScreenCoords(
  x: number,
  y: number,
  from: Perspective,
  period: 1 | 2,
): Point {
  const flip = from === "home" ? period === 2 : period === 1;
  return flip ? { x: PITCH_LENGTH - x, y: PITCH_WIDTH - y } : { x, y };
}
