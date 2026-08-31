/** Largest automatic correction we trust, metres. Larger gaps mean the sample or the log start is off. */
export const MAX_AUTO_OFFSET = 150;

/**
 * Vertical offset that puts the takeoff fix on the terrain. IGC GPS altitudes are
 * ellipsoidal or MSL depending on the logger; 3D terrain is ellipsoidal.
 */
export function altitudeOffset(takeoffAlt: number, groundHeight: number | undefined): number {
  if (groundHeight === undefined || !Number.isFinite(groundHeight)) return 0;
  const offset = groundHeight - takeoffAlt;
  return Math.abs(offset) <= MAX_AUTO_OFFSET ? offset : 0;
}
