/**
 * Covariance prediction for adaptive revisit scheduling.
 *
 * Predicts how the track covariance will grow over a time horizon,
 * which determines when the track needs its next update.
 */

import type { Covariance3x3 } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CovariancePrediction {
  predictedCovariance: Covariance3x3;
  traceGrowthRate: number; // trace per second
  exceedsThreshold: boolean;
}

// ---------------------------------------------------------------------------
// Predictor
// ---------------------------------------------------------------------------

/**
 * Predict covariance growth using a constant-velocity process noise model.
 *
 * @param currentCov Current covariance (3x3).
 * @param processNoiseRate Process noise rate (m²/s). Default 100.
 * @param horizonSec Prediction horizon in seconds.
 * @returns Predicted covariance and growth metrics.
 */
export function predictCovarianceGrowth(
  currentCov: Covariance3x3,
  horizonSec: number,
  processNoiseRate: number = 100,
): CovariancePrediction {
  // Simple model: P_predicted = P_current + Q * dt
  // where Q = processNoiseRate * I
  const qDiag = processNoiseRate * horizonSec;

  const predictedCovariance: Covariance3x3 = currentCov.map((row, i) =>
    row.map((val, j) => val + (i === j ? qDiag : 0)),
  );

  const currentTrace = currentCov[0][0] + currentCov[1][1] + currentCov[2][2];
  const predictedTrace =
    predictedCovariance[0][0] +
    predictedCovariance[1][1] +
    predictedCovariance[2][2];

  const traceGrowthRate = horizonSec > 0
    ? (predictedTrace - currentTrace) / horizonSec
    : 0;

  return {
    predictedCovariance,
    traceGrowthRate,
    exceedsThreshold: false, // set by caller
  };
}

/**
 * Check if predicted covariance exceeds a threshold.
 *
 * @param predictedCov Predicted covariance.
 * @param traceThreshold Maximum acceptable trace value.
 * @returns True if the trace exceeds the threshold.
 */
export function covarianceExceedsThreshold(
  predictedCov: Covariance3x3,
  traceThreshold: number,
): boolean {
  const trace = predictedCov[0][0] + predictedCov[1][1] + predictedCov[2][2];
  return trace > traceThreshold;
}
