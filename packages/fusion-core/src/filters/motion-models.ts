/**
 * Motion model definitions for the IMM filter.
 *
 * Each model provides a state transition matrix F and process noise Q
 * for the 6-state vector [e, n, u, ve, vn, vu].
 */

import { identityNxN, zerosNxN } from '@eloc2/shared-utils';

export interface MotionModel {
  F: number[][];
  Q: number[][];
}

// ---------------------------------------------------------------------------
// Constant Velocity (CV) Model
// ---------------------------------------------------------------------------

/**
 * Constant velocity model. Assumes the target moves in a straight line.
 *
 * @param dtSec   Time step in seconds.
 * @param qSigma  Process noise standard deviation (m/s²). Default 5.
 * @returns {F, Q} for the CV model.
 */
export function constantVelocityModel(dtSec: number, qSigma: number = 5): MotionModel {
  const dt = dtSec;
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;

  // State transition: x' = F * x
  // [e]    [1  0  0  dt  0  0 ] [e ]
  // [n]    [0  1  0  0   dt 0 ] [n ]
  // [u]  = [0  0  1  0   0  dt] [u ]
  // [ve]   [0  0  0  1   0  0 ] [ve]
  // [vn]   [0  0  0  0   1  0 ] [vn]
  // [vu]   [0  0  0  0   0  1 ] [vu]
  const F = identityNxN(6);
  F[0][3] = dt;
  F[1][4] = dt;
  F[2][5] = dt;

  // Process noise (continuous white noise acceleration, discretized)
  const q = qSigma * qSigma;
  const Q = zerosNxN(6);
  // Position-position blocks
  Q[0][0] = q * dt4 / 4;
  Q[1][1] = q * dt4 / 4;
  Q[2][2] = q * dt4 / 4;
  // Position-velocity cross-terms
  Q[0][3] = q * dt3 / 2;
  Q[3][0] = q * dt3 / 2;
  Q[1][4] = q * dt3 / 2;
  Q[4][1] = q * dt3 / 2;
  Q[2][5] = q * dt3 / 2;
  Q[5][2] = q * dt3 / 2;
  // Velocity-velocity blocks
  Q[3][3] = q * dt2;
  Q[4][4] = q * dt2;
  Q[5][5] = q * dt2;

  return { F, Q };
}

// ---------------------------------------------------------------------------
// Coordinated Turn (CT) Model
// ---------------------------------------------------------------------------

/**
 * Coordinated turn model (constant turn rate in the horizontal plane).
 * Vertical axis uses constant velocity.
 *
 * @param dtSec    Time step in seconds.
 * @param turnRate Turn rate in rad/s. Positive = counterclockwise.
 * @param qSigma  Process noise standard deviation. Default 10.
 * @returns {F, Q} for the CT model.
 */
export function coordinatedTurnModel(
  dtSec: number,
  turnRate: number,
  qSigma: number = 10,
): MotionModel {
  const dt = dtSec;
  const w = turnRate;

  const F = identityNxN(6);

  if (Math.abs(w) < 1e-6) {
    // Near-zero turn rate: degenerate to CV
    return constantVelocityModel(dtSec, qSigma);
  }

  const sinWt = Math.sin(w * dt);
  const cosWt = Math.cos(w * dt);

  // Horizontal block (e, n, ve, vn)
  // e  = e  + (sin(wt)/w)*ve + ((1-cos(wt))/w)*vn
  // n  = n  - ((1-cos(wt))/w)*ve + (sin(wt)/w)*vn
  // ve = cos(wt)*ve + sin(wt)*vn
  // vn = -sin(wt)*ve + cos(wt)*vn
  F[0][0] = 1;
  F[0][3] = sinWt / w;
  F[0][4] = (1 - cosWt) / w;
  F[1][1] = 1;
  F[1][3] = -(1 - cosWt) / w;
  F[1][4] = sinWt / w;
  F[3][3] = cosWt;
  F[3][4] = sinWt;
  F[4][3] = -sinWt;
  F[4][4] = cosWt;

  // Vertical: constant velocity
  F[2][5] = dt;

  // Process noise: higher than CV to account for turn rate uncertainty
  const q = qSigma * qSigma;
  const dt2 = dt * dt;
  const Q = zerosNxN(6);
  Q[0][0] = q * dt2 / 2;
  Q[1][1] = q * dt2 / 2;
  Q[2][2] = q * dt2 / 2;
  Q[3][3] = q * dt;
  Q[4][4] = q * dt;
  Q[5][5] = q * dt;

  return { F, Q };
}

// ---------------------------------------------------------------------------
// Ballistic Model
// ---------------------------------------------------------------------------

/**
 * Ballistic model (gravity-affected trajectory).
 * Same as CV but with gravity acceleration (-9.81 m/s²) on the vertical axis.
 *
 * @param dtSec   Time step in seconds.
 * @param qSigma  Process noise standard deviation. Default 2.
 * @returns {F, Q} for the ballistic model.
 */
export function ballisticModel(dtSec: number, qSigma: number = 2): MotionModel {
  const { F, Q } = constantVelocityModel(dtSec, qSigma);

  // The ballistic model is identical to CV in its F matrix.
  // The gravity effect is handled by a control input term:
  //   u = [0, 0, -0.5*g*dt², 0, 0, -g*dt]
  // which is applied externally during prediction.
  // We increase vertical process noise slightly to account for drag uncertainty.
  const dt2 = dtSec * dtSec;
  Q[2][2] *= 2; // double vertical position noise
  Q[5][5] *= 2; // double vertical velocity noise

  return { F, Q };
}

/** Gravity control input vector for ballistic model. */
export function ballisticGravityInput(dtSec: number): number[] {
  const g = 9.81;
  return [0, 0, -0.5 * g * dtSec * dtSec, 0, 0, -g * dtSec];
}
