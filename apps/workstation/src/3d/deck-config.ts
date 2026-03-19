/**
 * Deck.gl 3D overlay configuration constants.
 */

/** Altitude scale factor: real meters to visual units for Deck.gl elevation */
export const ALTITUDE_SCALE = 1;

/** Track path width in pixels */
export const PATH_WIDTH_PX = 3;

/** Minimum number of trail points to render a path */
export const MIN_TRAIL_POINTS = 2;

/** Color mappings by track status (RGBA 0-255) */
export const STATUS_COLORS: Record<string, [number, number, number, number]> = {
  confirmed: [0, 204, 68, 220],    // #00cc44
  tentative: [255, 204, 0, 220],   // #ffcc00
  dropped:   [255, 51, 51, 180],   // #ff3333
};

/** Default color for unknown status */
export const DEFAULT_COLOR: [number, number, number, number] = [136, 136, 136, 180];

/** Get RGBA color for a track status */
export function getStatusColor(status: string): [number, number, number, number] {
  return STATUS_COLORS[status] ?? DEFAULT_COLOR;
}
