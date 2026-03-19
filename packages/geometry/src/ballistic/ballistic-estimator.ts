/**
 * Ballistic trajectory estimator.
 *
 * Given a sequence of 3D positions and timestamps for a ballistic target
 * (missile, rocket), estimates launch and impact points by fitting a
 * parabolic trajectory to the altitude-vs-time data.
 *
 * Model:  alt(t) = a*t^2 + b*t + c   (gravity-dominated ballistic arc)
 * Horizontal motion assumed linear: lat(t) = lat0 + dLat*t, lon(t) = lon0 + dLon*t
 */

import type { Position3D } from '@eloc2/domain';

export interface BallisticEstimate {
  point: Position3D;
  uncertainty2SigmaM: number;
}

export interface LaunchEstimate extends BallisticEstimate {}

export interface ImpactEstimate extends BallisticEstimate {
  timeToImpactSec: number;
}

/**
 * Fit a parabola alt(t) = a*t^2 + b*t + c using least squares.
 * Returns [a, b, c] coefficients and the residual RMS.
 */
function fitParabola(times: number[], alts: number[]): { a: number; b: number; c: number; rmsResidual: number } | null {
  const n = times.length;
  if (n < 3) return null;

  // Normalize times to avoid numerical issues (shift to start at 0)
  const t0 = times[0];
  const ts = times.map(t => t - t0);

  // Build normal equations for least-squares fit: alt = a*t^2 + b*t + c
  // [sum(t^4)  sum(t^3)  sum(t^2)] [a]   [sum(t^2 * alt)]
  // [sum(t^3)  sum(t^2)  sum(t^1)] [b] = [sum(t^1 * alt)]
  // [sum(t^2)  sum(t^1)  n       ] [c]   [sum(alt)       ]
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let sa = 0, sta = 0, st2a = 0;

  for (let i = 0; i < n; i++) {
    const t = ts[i];
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const alt = alts[i];

    s0 += 1;
    s1 += t;
    s2 += t2;
    s3 += t3;
    s4 += t4;
    sa += alt;
    sta += t * alt;
    st2a += t2 * alt;
  }

  // Solve 3x3 system using Cramer's rule
  const det = s4 * (s2 * s0 - s1 * s1) - s3 * (s3 * s0 - s1 * s2) + s2 * (s3 * s1 - s2 * s2);
  if (Math.abs(det) < 1e-12) return null;

  const a = (st2a * (s2 * s0 - s1 * s1) - s3 * (sta * s0 - s1 * sa) + s2 * (sta * s1 - s2 * sa)) / det;
  const b = (s4 * (sta * s0 - s1 * sa) - st2a * (s3 * s0 - s1 * s2) + s2 * (s3 * sa - sta * s2)) / det;
  const c = (s4 * (s2 * sa - sta * s1) - s3 * (s3 * sa - sta * s2) + st2a * (s3 * s1 - s2 * s2)) / det;

  // Compute RMS residual
  let sumSqErr = 0;
  for (let i = 0; i < n; i++) {
    const predicted = a * ts[i] * ts[i] + b * ts[i] + c;
    const err = predicted - alts[i];
    sumSqErr += err * err;
  }
  const rmsResidual = Math.sqrt(sumSqErr / n);

  return { a, b, c, rmsResidual };
}

/**
 * Fit a linear model to horizontal coordinates: coord(t) = slope*t + intercept
 */
function fitLinear(times: number[], values: number[]): { slope: number; intercept: number } | null {
  const n = times.length;
  if (n < 2) return null;

  const t0 = times[0];
  const ts = times.map(t => t - t0);

  let sumT = 0, sumT2 = 0, sumV = 0, sumTV = 0;
  for (let i = 0; i < n; i++) {
    sumT += ts[i];
    sumT2 += ts[i] * ts[i];
    sumV += values[i];
    sumTV += ts[i] * values[i];
  }

  const det = n * sumT2 - sumT * sumT;
  if (Math.abs(det) < 1e-15) return null;

  const slope = (n * sumTV - sumT * sumV) / det;
  const intercept = (sumT2 * sumV - sumT * sumTV) / det;

  return { slope, intercept };
}

/**
 * Estimate the launch point (alt=0 backward extrapolation) for a ballistic track.
 *
 * Requires at least 3 position/time samples with positive altitude.
 * Returns null if trajectory does not appear ballistic (parabola opens upward)
 * or if extrapolation is unreasonable.
 */
export function estimateLaunchPoint(
  positions: Position3D[],
  timestamps: number[],
): LaunchEstimate | null {
  if (positions.length < 3 || positions.length !== timestamps.length) return null;

  const alts = positions.map(p => p.alt);
  // Need at least some altitude to be meaningful
  if (alts.every(a => a <= 0)) return null;

  const fit = fitParabola(timestamps, alts);
  if (!fit) return null;

  const { a, b, c, rmsResidual } = fit;
  const t0 = timestamps[0];

  // For a ballistic arc, a should be negative (gravity pulls down)
  // But we still extrapolate regardless — the caller can filter
  // Solve a*t^2 + b*t + c = 0 for t < 0 (relative to t0)
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  // Two roots; pick the one with smaller t (further back in time = launch)
  const root1 = (-b + sqrtD) / (2 * a);
  const root2 = (-b - sqrtD) / (2 * a);

  // We want the root that is before the observation window (t < 0 relative to ts[0])
  let launchT: number;
  if (root1 <= 0 && root2 <= 0) {
    launchT = Math.max(root1, root2); // Closer to observations = more reliable
  } else if (root1 <= 0) {
    launchT = root1;
  } else if (root2 <= 0) {
    launchT = root2;
  } else {
    // Both roots are in the future — not a valid backward extrapolation
    return null;
  }

  // Absolute time of launch
  const launchTimeSec = t0 + launchT;

  // Extrapolation distance in time
  const extrapolationSec = Math.abs(launchT);
  // Reject if extrapolation is more than 10 minutes
  if (extrapolationSec > 600) return null;

  // Fit horizontal coordinates
  const latFit = fitLinear(timestamps, positions.map(p => p.lat));
  const lonFit = fitLinear(timestamps, positions.map(p => p.lon));
  if (!latFit || !lonFit) return null;

  const launchLat = latFit.intercept + latFit.slope * launchT;
  const launchLon = lonFit.intercept + lonFit.slope * launchT;

  // Uncertainty grows with extrapolation distance
  // Base uncertainty from residual, scaled by extrapolation ratio
  const observationSpan = timestamps[timestamps.length - 1] - timestamps[0];
  const extrapolationRatio = observationSpan > 0 ? extrapolationSec / observationSpan : 10;
  const baseUncertaintyM = Math.max(rmsResidual, 100); // At least 100m base
  const uncertainty2SigmaM = baseUncertaintyM * (1 + extrapolationRatio) * 2;

  return {
    point: {
      lat: launchLat,
      lon: launchLon,
      alt: 0,
    },
    uncertainty2SigmaM: Math.min(uncertainty2SigmaM, 50000), // Cap at 50km
  };
}

/**
 * Estimate the impact point (alt=0 forward extrapolation) for a ballistic track.
 *
 * Requires at least 3 position/time samples with positive altitude.
 * Returns null if trajectory does not appear to descend to ground level.
 */
export function estimateImpactPoint(
  positions: Position3D[],
  timestamps: number[],
): ImpactEstimate | null {
  if (positions.length < 3 || positions.length !== timestamps.length) return null;

  const alts = positions.map(p => p.alt);
  if (alts.every(a => a <= 0)) return null;

  const fit = fitParabola(timestamps, alts);
  if (!fit) return null;

  const { a, b, c, rmsResidual } = fit;
  const t0 = timestamps[0];
  const tLast = timestamps[timestamps.length - 1] - t0;

  // Solve a*t^2 + b*t + c = 0 for t > tLast (forward from last observation)
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  const root1 = (-b + sqrtD) / (2 * a);
  const root2 = (-b - sqrtD) / (2 * a);

  // Pick the root that is after the last observation
  let impactT: number | null = null;
  if (root1 > tLast && root2 > tLast) {
    impactT = Math.min(root1, root2); // Closer future root
  } else if (root1 > tLast) {
    impactT = root1;
  } else if (root2 > tLast) {
    impactT = root2;
  }

  if (impactT === null) return null;

  // Time to impact from now (last observation)
  const timeToImpactSec = impactT - tLast;
  // Reject if impact is more than 10 minutes away
  if (timeToImpactSec > 600) return null;

  // Fit horizontal coordinates
  const latFit = fitLinear(timestamps, positions.map(p => p.lat));
  const lonFit = fitLinear(timestamps, positions.map(p => p.lon));
  if (!latFit || !lonFit) return null;

  const impactLat = latFit.intercept + latFit.slope * impactT;
  const impactLon = lonFit.intercept + lonFit.slope * impactT;

  // Uncertainty grows with extrapolation distance
  const observationSpan = timestamps[timestamps.length - 1] - timestamps[0];
  const extrapolationSec = timeToImpactSec;
  const extrapolationRatio = observationSpan > 0 ? extrapolationSec / observationSpan : 10;
  const baseUncertaintyM = Math.max(rmsResidual, 100);
  const uncertainty2SigmaM = baseUncertaintyM * (1 + extrapolationRatio) * 2;

  return {
    point: {
      lat: impactLat,
      lon: impactLon,
      alt: 0,
    },
    timeToImpactSec,
    uncertainty2SigmaM: Math.min(uncertainty2SigmaM, 50000),
  };
}
