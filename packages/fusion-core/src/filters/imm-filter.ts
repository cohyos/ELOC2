/**
 * Interacting Multiple Model (IMM) filter.
 *
 * Runs multiple Kalman filters in parallel (one per motion model) and
 * blends their outputs based on model probabilities. Supports CV, CT,
 * and ballistic models.
 */

import type { MotionModelStatus } from '@eloc2/domain';
import {
  matNxNAdd,
  matNxNScale,
  matNxNSub,
  outerProduct,
  zerosNxN,
} from '@eloc2/shared-utils';
import type { KalmanState } from './kalman-filter.js';
import { kalmanPredict, kalmanUpdate } from './kalman-filter.js';
import type { MotionModel } from './motion-models.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IMMState {
  /** Per-model Kalman states. */
  models: KalmanState[];
  /** Model probabilities (sum to 1). */
  modelProbabilities: number[];
  /** Markov transition matrix [from][to]. */
  transitionMatrix: number[][];
  /** Model labels for human display. */
  modelLabels: MotionModelStatus[];
}

export interface IMMCombinedOutput {
  combinedState: number[];
  combinedCovariance: number[][];
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Create an initial IMM state with N models starting from the same
 * Kalman state.
 *
 * @param initialState  Starting Kalman state (shared across all models).
 * @param modelLabels   Label for each model.
 * @param transitionMatrix  Markov transition matrix [from][to].
 * @param initialProbabilities  Optional initial model probabilities (default: uniform).
 */
export function createIMMState(
  initialState: KalmanState,
  modelLabels: MotionModelStatus[],
  transitionMatrix: number[][],
  initialProbabilities?: number[],
): IMMState {
  const n = modelLabels.length;
  const models = modelLabels.map(() => ({
    x: [...initialState.x],
    P: initialState.P.map(row => [...row]),
  }));

  const probs = initialProbabilities ?? modelLabels.map(() => 1 / n);

  return {
    models,
    modelProbabilities: probs,
    transitionMatrix,
    modelLabels,
  };
}

/**
 * Default 2-model IMM transition matrix (CV + CT).
 *
 * High self-transition probability (0.95) means the filter is reluctant
 * to switch models, reducing jitter.
 */
export function defaultTransitionMatrix2(): number[][] {
  return [
    [0.95, 0.05],
    [0.05, 0.95],
  ];
}

/**
 * Default 3-model IMM transition matrix (CV + CT + Ballistic).
 */
export function defaultTransitionMatrix3(): number[][] {
  return [
    [0.90, 0.07, 0.03],
    [0.07, 0.90, 0.03],
    [0.05, 0.05, 0.90],
  ];
}

// ---------------------------------------------------------------------------
// IMM Predict
// ---------------------------------------------------------------------------

/**
 * IMM prediction step:
 * 1. Compute mixing probabilities
 * 2. Mix states across models
 * 3. Run per-model Kalman prediction
 *
 * @param imm    Current IMM state.
 * @param motionModels  Per-model {F, Q} for the current time step.
 * @returns Updated IMM state after prediction.
 */
export function immPredict(
  imm: IMMState,
  motionModels: MotionModel[],
): IMMState {
  const N = imm.models.length;
  const n = imm.models[0].x.length;

  // 1. Compute predicted model probabilities: cBar[j] = sum_i(Pi[i][j] * mu[i])
  const cBar: number[] = new Array(N).fill(0);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      cBar[j] += imm.transitionMatrix[i][j] * imm.modelProbabilities[i];
    }
  }

  // 2. Compute mixing probabilities: mixProb[i][j] = Pi[i][j] * mu[i] / cBar[j]
  const mixProb: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      row.push(
        cBar[j] > 1e-30
          ? (imm.transitionMatrix[i][j] * imm.modelProbabilities[i]) / cBar[j]
          : 0,
      );
    }
    mixProb.push(row);
  }

  // 3. Mix states for each target model
  const mixedModels: KalmanState[] = [];
  for (let j = 0; j < N; j++) {
    // Mixed state mean: xMixed[j] = sum_i(mixProb[i][j] * x[i])
    const xMixed = new Array(n).fill(0);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < n; k++) {
        xMixed[k] += mixProb[i][j] * imm.models[i].x[k];
      }
    }

    // Mixed covariance: PMixed[j] = sum_i(mixProb[i][j] * (P[i] + (x[i]-xMixed) * (x[i]-xMixed)^T))
    let PMixed = zerosNxN(n);
    for (let i = 0; i < N; i++) {
      const dx = imm.models[i].x.map((v, k) => v - xMixed[k]);
      const spreadTerm = outerProduct(dx, dx);
      const term = matNxNAdd(imm.models[i].P, spreadTerm);
      PMixed = matNxNAdd(PMixed, matNxNScale(term, mixProb[i][j]));
    }

    mixedModels.push({ x: xMixed, P: PMixed });
  }

  // 4. Per-model Kalman prediction
  const predictedModels = mixedModels.map((state, j) =>
    kalmanPredict(state, motionModels[j].F, motionModels[j].Q),
  );

  return {
    models: predictedModels,
    modelProbabilities: cBar,
    transitionMatrix: imm.transitionMatrix,
    modelLabels: imm.modelLabels,
  };
}

// ---------------------------------------------------------------------------
// IMM Update
// ---------------------------------------------------------------------------

/**
 * IMM update step:
 * 1. Run per-model Kalman update
 * 2. Update model probabilities based on innovation likelihoods
 *
 * @param imm  Predicted IMM state (from immPredict).
 * @param z    Measurement vector.
 * @param H    Observation matrix.
 * @param R    Measurement noise covariance.
 * @returns Updated IMM state.
 */
export function immUpdate(
  imm: IMMState,
  z: number[],
  H: number[][],
  R: number[][],
): IMMState {
  const N = imm.models.length;

  // Per-model Kalman update
  const updateResults = imm.models.map((model) =>
    kalmanUpdate(model, z, H, R),
  );

  const updatedModels = updateResults.map((r) => r.state);
  const logLikelihoods = updateResults.map((r) => r.logLikelihood);

  // Update model probabilities
  // For numerical stability, subtract the max log-likelihood
  const maxLL = Math.max(...logLikelihoods.filter(ll => ll > -Infinity));
  const likelihoods = logLikelihoods.map((ll) =>
    ll > -Infinity ? Math.exp(ll - maxLL) : 0,
  );

  // mu'[j] = cBar[j] * L[j] / sum(cBar[i] * L[i])
  const unnormalized = imm.modelProbabilities.map(
    (mu, j) => mu * likelihoods[j],
  );
  const total = unnormalized.reduce((s, v) => s + v, 0);

  const newProbs =
    total > 1e-30
      ? unnormalized.map((v) => v / total)
      : imm.modelProbabilities.map(() => 1 / N);

  return {
    models: updatedModels,
    modelProbabilities: newProbs,
    transitionMatrix: imm.transitionMatrix,
    modelLabels: imm.modelLabels,
  };
}

// ---------------------------------------------------------------------------
// IMM Combine
// ---------------------------------------------------------------------------

/**
 * Combine the per-model states into a single output estimate.
 *
 * @param imm  Updated IMM state.
 * @returns Combined state vector and covariance.
 */
export function immCombine(imm: IMMState): IMMCombinedOutput {
  const N = imm.models.length;
  const n = imm.models[0].x.length;

  // Combined state: xCombined = sum_j(mu[j] * x[j])
  const combinedState = new Array(n).fill(0);
  for (let j = 0; j < N; j++) {
    for (let k = 0; k < n; k++) {
      combinedState[k] += imm.modelProbabilities[j] * imm.models[j].x[k];
    }
  }

  // Combined covariance = sum_j(mu[j] * (P[j] + (x[j]-xComb) * (x[j]-xComb)^T))
  let combinedCov = zerosNxN(n);
  for (let j = 0; j < N; j++) {
    const dx = imm.models[j].x.map((v, k) => v - combinedState[k]);
    const spreadTerm = outerProduct(dx, dx);
    const term = matNxNAdd(imm.models[j].P, spreadTerm);
    combinedCov = matNxNAdd(combinedCov, matNxNScale(term, imm.modelProbabilities[j]));
  }

  return { combinedState, combinedCovariance: combinedCov };
}

// ---------------------------------------------------------------------------
// Active model
// ---------------------------------------------------------------------------

/**
 * Get the motion model status label for the most probable model.
 */
export function getActiveModel(imm: IMMState): MotionModelStatus {
  let maxIdx = 0;
  let maxProb = imm.modelProbabilities[0];
  for (let i = 1; i < imm.modelProbabilities.length; i++) {
    if (imm.modelProbabilities[i] > maxProb) {
      maxProb = imm.modelProbabilities[i];
      maxIdx = i;
    }
  }
  return imm.modelLabels[maxIdx];
}
