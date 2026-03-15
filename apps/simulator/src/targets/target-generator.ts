/**
 * Target position/velocity interpolation from waypoint definitions.
 */

import type { Position3D, Velocity3D } from '@eloc2/domain';
import type { WaypointDef, TargetDefinition } from '../types/scenario.js';

/**
 * Linearly interpolate the target position at the given time from its waypoints.
 * Returns undefined if the time is outside the waypoint window.
 */
export function interpolatePosition(
  waypoints: WaypointDef[],
  timeSec: number,
): Position3D | undefined {
  if (waypoints.length === 0) return undefined;

  // Before first waypoint
  if (timeSec < waypoints[0].time) return undefined;

  // After last waypoint
  if (timeSec > waypoints[waypoints.length - 1].time) return undefined;

  // Exactly at or after last waypoint
  if (timeSec === waypoints[waypoints.length - 1].time) {
    return { ...waypoints[waypoints.length - 1].position };
  }

  // Find the bracketing waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp0 = waypoints[i];
    const wp1 = waypoints[i + 1];

    if (timeSec >= wp0.time && timeSec <= wp1.time) {
      const dt = wp1.time - wp0.time;
      if (dt === 0) return { ...wp0.position };

      const t = (timeSec - wp0.time) / dt;

      return {
        lat: wp0.position.lat + t * (wp1.position.lat - wp0.position.lat),
        lon: wp0.position.lon + t * (wp1.position.lon - wp0.position.lon),
        alt: wp0.position.alt + t * (wp1.position.alt - wp0.position.alt),
      };
    }
  }

  return undefined;
}

/**
 * Interpolate velocity at the given time from waypoints.
 * If waypoints define explicit velocities, interpolate between them.
 * Otherwise compute velocity from position differences between bracketing waypoints.
 * Returns undefined if time is outside the waypoint window.
 */
export function interpolateVelocity(
  waypoints: WaypointDef[],
  timeSec: number,
): Velocity3D | undefined {
  if (waypoints.length === 0) return undefined;
  if (timeSec < waypoints[0].time) return undefined;
  if (timeSec > waypoints[waypoints.length - 1].time) return undefined;

  // Single waypoint — use its velocity if present
  if (waypoints.length === 1) {
    return waypoints[0].velocity ? { ...waypoints[0].velocity } : undefined;
  }

  // Find bracketing waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp0 = waypoints[i];
    const wp1 = waypoints[i + 1];

    if (timeSec >= wp0.time && timeSec <= wp1.time) {
      // If both waypoints have explicit velocities, interpolate
      if (wp0.velocity && wp1.velocity) {
        const dt = wp1.time - wp0.time;
        if (dt === 0) return { ...wp0.velocity };
        const t = (timeSec - wp0.time) / dt;
        return {
          vx: wp0.velocity.vx + t * (wp1.velocity.vx - wp0.velocity.vx),
          vy: wp0.velocity.vy + t * (wp1.velocity.vy - wp0.velocity.vy),
          vz: wp0.velocity.vz + t * (wp1.velocity.vz - wp0.velocity.vz),
        };
      }

      // Otherwise compute from position differences
      // Approximate: convert degree diffs to meters (~111km per degree lat)
      const dt = wp1.time - wp0.time;
      if (dt === 0) return { vx: 0, vy: 0, vz: 0 };

      const dLat = wp1.position.lat - wp0.position.lat;
      const dLon = wp1.position.lon - wp0.position.lon;
      const dAlt = wp1.position.alt - wp0.position.alt;

      // Approximate meters per degree at midpoint latitude
      const midLatRad = ((wp0.position.lat + wp1.position.lat) / 2) * (Math.PI / 180);
      const metersPerDegLat = 111_320;
      const metersPerDegLon = 111_320 * Math.cos(midLatRad);

      return {
        vx: (dLon * metersPerDegLon) / dt, // east (approx)
        vy: (dLat * metersPerDegLat) / dt, // north (approx)
        vz: dAlt / dt,
      };
    }
  }

  return undefined;
}

/**
 * Check whether a target is active (within its waypoint time window) at the given time.
 */
export function isTargetActive(
  target: TargetDefinition,
  timeSec: number,
): boolean {
  if (timeSec < target.startTime) return false;
  if (target.waypoints.length === 0) return false;

  const firstWp = target.waypoints[0].time;
  const lastWp = target.waypoints[target.waypoints.length - 1].time;

  return timeSec >= firstWp && timeSec <= lastWp;
}
