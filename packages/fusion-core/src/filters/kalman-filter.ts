/**
 * Standard Kalman filter for 6-state tracking (position + velocity in ENU).
 *
 * State vector: [e, n, u, ve, vn, vu]
 */

import {
  matNxNMultiply,
  matNxNAdd,
  matNxNSub,
  matNxNTranspose,
  matNxNInverse,
  matVecMultiply,
  identityNxN,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KalmanState {
  /** State vector (length 6: [e, n, u, ve, vn, vu]). */
  x: number[];
  /** Covariance matrix (6x6). */
  P: number[][];
}

// ---------------------------------------------------------------------------
// Predict
// ---------------------------------------------------------------------------

/**
 * Kalman predict step.
 *
 * @param state  Current state estimate.
 * @param F      State transition matrix (6x6).
 * @param Q      Process noise covariance (6x6).
 * @returns Predicted state.
 */
export function kalmanPredict(
  state: KalmanState,
  F: number[][],
  Q: number[][],
): KalmanState {
  // x' = F * x
  const xPred = matVecMultiply(F, state.x);

  // P' = F * P * F^T + Q
  const FP = matNxNMultiply(F, state.P);
  const FPFt = matNxNMultiply(FP, matNxNTranspose(F));
  const PPred = matNxNAdd(FPFt, Q);

  return { x: xPred, P: PPred };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Kalman update step.
 *
 * @param state  Predicted state.
 * @param z      Measurement vector.
 * @param H      Observation matrix (maps state to measurement space).
 * @param R      Measurement noise covariance.
 * @returns Updated state and the innovation likelihood.
 */
export function kalmanUpdate(
  state: KalmanState,
  z: number[],
  H: number[][],
  R: number[][],
): { state: KalmanState; logLikelihood: number } {
  const n = state.x.length;
  const m = z.length;

  // Innovation: y = z - H * x
  const Hx = matVecMultiply(H, state.x);
  const y = z.map((zi, i) => zi - Hx[i]);

  // Innovation covariance: S = H * P * H^T + R
  const HP = matNxNMultiply(H, state.P);
  const HPHt = matNxNMultiply(HP, matNxNTranspose(H));
  const S = matNxNAdd(HPHt, R);

  const Sinv = matNxNInverse(S);
  if (Sinv === null) {
    // Cannot update, return prediction unchanged
    return { state, logLikelihood: -Infinity };
  }

  // Kalman gain: K = P * H^T * S^-1
  const PHt = matNxNMultiply(state.P, matNxNTranspose(H));
  const K = matNxNMultiply(PHt, Sinv);

  // Updated state: x' = x + K * y
  const Ky = matVecMultiply(K, y);
  const xUpd = state.x.map((xi, i) => xi + Ky[i]);

  // Updated covariance: P' = (I - K * H) * P
  const I = identityNxN(n);
  const KH = matNxNMultiply(K, H);
  const IminusKH = matNxNSub(I, KH);
  const PUpd = matNxNMultiply(IminusKH, state.P);

  // Log-likelihood for model probability update (Gaussian innovation)
  let logLikelihood = 0;
  const Sy = matVecMultiply(Sinv, y);
  for (let i = 0; i < m; i++) {
    logLikelihood -= 0.5 * y[i] * Sy[i];
  }
  // Determinant term — proper determinant computation for the innovation covariance.
  // The previous sum-of-log-diagonal was only correct for diagonal matrices.
  let logDetS: number;
  if (m === 3) {
    // Standard 3×3 determinant via cofactor expansion
    const det =
      S[0][0] * (S[1][1] * S[2][2] - S[1][2] * S[2][1]) -
      S[0][1] * (S[1][0] * S[2][2] - S[1][2] * S[2][0]) +
      S[0][2] * (S[1][0] * S[2][1] - S[1][1] * S[2][0]);
    logDetS = Math.log(Math.abs(det) + 1e-30);
  } else if (m === 2) {
    const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
    logDetS = Math.log(Math.abs(det) + 1e-30);
  } else if (m === 1) {
    logDetS = Math.log(Math.abs(S[0][0]) + 1e-30);
  } else {
    // General fallback: sum of log diagonals (approximate for larger matrices)
    logDetS = 0;
    for (let i = 0; i < m; i++) {
      logDetS += Math.log(Math.abs(S[i][i]) + 1e-30);
    }
  }
  logLikelihood -= 0.5 * logDetS;
  logLikelihood -= (m / 2) * Math.log(2 * Math.PI);

  return {
    state: { x: xUpd, P: PUpd },
    logLikelihood,
  };
}

/**
 * Default 3D position observation matrix H (3x6): observes [e, n, u].
 */
export function defaultObservationMatrix3D(): number[][] {
  return [
    [1, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
  ];
}
