/**
 * 6DOF Consistency Evaluator
 *
 * Evaluates track certainty based on consistency of successive measurements
 * against predicted state. Applies to all track types: radar, EO 3D, and
 * fused system tracks.
 *
 * The evaluator maintains a per-track state history and computes an
 * innovation (prediction error) on each update. Consistent updates boost
 * the track's certainty; inconsistent updates reduce it.
 *
 * State model: position (3) + velocity (3) + acceleration (3)
 * - Position: lat, lon, alt (geodetic)
 * - Velocity: vx, vy, vz (ENU m/s)
 * - Acceleration: ax, ay, az (ENU m/s²) — estimated from velocity deltas
 *
 * Prediction uses constant-acceleration model:
 *   pos(t+dt) = pos(t) + vel(t)*dt + 0.5*acc(t)*dt²
 *   vel(t+dt) = vel(t) + acc(t)*dt
 */

import type { Position3D, Velocity3D } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Acceleration in ENU frame (m/s²). */
export interface Acceleration3D {
  ax: number;
  ay: number;
  az: number;
}

/** Stored state from the previous cycle for a single track. */
export interface TrackStateSnapshot {
  position: Position3D;
  velocity: Velocity3D | undefined;
  acceleration: Acceleration3D | undefined;
  /** Doppler-derived radial velocity (m/s). For radar consistency checks. */
  radialVelocity: number | undefined;
  timestamp: number; // ms
  /** Running consistency score [0, 1]. 0 = inconsistent, 1 = perfectly consistent. */
  consistencyScore: number;
  /** Number of consistent consecutive updates. */
  consistentCount: number;
}

/** Result of a consistency evaluation for a single update. */
export interface ConsistencyResult {
  /** Innovation magnitude in meters (predicted vs actual position error). */
  positionInnovationM: number;
  /** Innovation magnitude in m/s (predicted vs actual velocity error). -1 if no velocity data. */
  velocityInnovationMps: number;
  /** Innovation magnitude in m/s² (estimated vs expected acceleration). -1 if no data. */
  accelerationInnovationMps2: number;
  /** Doppler radial velocity innovation (m/s). -1 if no Doppler data. */
  dopplerInnovationMps: number;
  /** Was this update consistent with the prediction? */
  isConsistent: boolean;
  /** Updated consistency score [0, 1]. */
  consistencyScore: number;
  /** Certainty delta to apply to track confidence. Positive = boost, negative = decay. */
  certaintyDelta: number;
  /** Consecutive consistent update count. */
  consistentCount: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ConsistencyConfig {
  /** Position innovation gate (meters). Within this = consistent. */
  positionGateM: number;
  /** Velocity innovation gate (m/s). Within this = consistent. */
  velocityGateMps: number;
  /** Acceleration innovation gate (m/s²). Within this = consistent. */
  accelerationGateMps2: number;
  /** Doppler radial velocity innovation gate (m/s). For radar consistency. */
  dopplerGateMps: number;
  /** Certainty boost per consistent update. */
  consistentBoost: number;
  /** Certainty decay per inconsistent update. */
  inconsistentDecay: number;
  /** Maximum certainty delta per update (caps both boost and decay). */
  maxDeltaPerUpdate: number;
  /** Bonus multiplier after N consecutive consistent updates. */
  streakBonusAfter: number;
  /** The streak bonus multiplier applied to the boost. */
  streakBonusMultiplier: number;
}

const DEFAULT_CONFIG: ConsistencyConfig = {
  positionGateM: 500,           // 500m gate for position consistency
  velocityGateMps: 50,          // 50 m/s gate for velocity consistency
  accelerationGateMps2: 15,     // 15 m/s² gate for acceleration consistency (~1.5g)
  dopplerGateMps: 30,           // 30 m/s gate for Doppler radial velocity consistency
  consistentBoost: 0.05,        // +5% per consistent update
  inconsistentDecay: -0.08,     // -8% per inconsistent update
  maxDeltaPerUpdate: 0.15,      // max ±15% per update
  streakBonusAfter: 3,          // bonus after 3 consecutive consistent updates
  streakBonusMultiplier: 1.5,   // 1.5x boost on streak
};

// ---------------------------------------------------------------------------
// Meters-per-degree approximations
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 110540;
const DEG_TO_RAD = Math.PI / 180;

function mPerDegLon(lat: number): number {
  return 111320 * Math.cos(lat * DEG_TO_RAD);
}

// ---------------------------------------------------------------------------
// Consistency Evaluator
// ---------------------------------------------------------------------------

export class ConsistencyEvaluator {
  /** Per-track state snapshots from previous cycle. Key = trackId. */
  private snapshots = new Map<string, TrackStateSnapshot>();
  private config: ConsistencyConfig;

  constructor(config?: Partial<ConsistencyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate the consistency of a new measurement against the predicted state.
   *
   * Uses constant-acceleration prediction:
   *   pos_predicted = pos_prev + vel_prev*dt + 0.5*acc_prev*dt²
   *   vel_predicted = vel_prev + acc_prev*dt
   *
   * Acceleration is estimated from consecutive velocity measurements.
   * For radar tracks, Doppler (radial velocity) is an additional
   * consistency check.
   *
   * @param trackId   Unique track identifier.
   * @param position  Current measured/fused position.
   * @param velocity  Current measured/fused velocity (undefined if unknown).
   * @param timestamp Current time in ms.
   * @param radialVelocity Doppler-derived radial velocity (m/s), for radar consistency.
   * @returns ConsistencyResult with certainty delta, or null if first observation.
   */
  evaluate(
    trackId: string,
    position: Position3D,
    velocity: Velocity3D | undefined,
    timestamp: number,
    radialVelocity?: number,
  ): ConsistencyResult | null {
    const prev = this.snapshots.get(trackId);

    if (!prev) {
      // First observation — store snapshot, no consistency yet
      this.snapshots.set(trackId, {
        position: { ...position },
        velocity: velocity ? { ...velocity } : undefined,
        acceleration: undefined,
        radialVelocity: radialVelocity,
        timestamp,
        consistencyScore: 0.5, // neutral start
        consistentCount: 0,
      });
      return null;
    }

    const dtSec = (timestamp - prev.timestamp) / 1000;
    if (dtSec <= 0) {
      return null;
    }

    // ── Estimate current acceleration from velocity delta ──
    let currentAcceleration: Acceleration3D | undefined;
    if (velocity && prev.velocity && dtSec > 0) {
      currentAcceleration = {
        ax: (velocity.vx - prev.velocity.vx) / dtSec,
        ay: (velocity.vy - prev.velocity.vy) / dtSec,
        az: (velocity.vz - prev.velocity.vz) / dtSec,
      };
    }

    // ── Predict state from previous snapshot (constant-acceleration model) ──
    const predicted = this.predictState(prev, dtSec);

    // ── Compute position innovation (meters) ──
    const dLat = (position.lat - predicted.position.lat) * M_PER_DEG_LAT;
    const dLon = (position.lon - predicted.position.lon) * mPerDegLon(position.lat);
    const dAlt = position.alt - predicted.position.alt;
    const posInnovation = Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);

    // ── Compute velocity innovation (m/s) ──
    let velInnovation = -1;
    if (velocity && predicted.velocity) {
      const dvx = velocity.vx - predicted.velocity.vx;
      const dvy = velocity.vy - predicted.velocity.vy;
      const dvz = velocity.vz - predicted.velocity.vz;
      velInnovation = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    }

    // ── Compute acceleration innovation (m/s²) ──
    let accInnovation = -1;
    if (currentAcceleration && prev.acceleration) {
      const dax = currentAcceleration.ax - prev.acceleration.ax;
      const day = currentAcceleration.ay - prev.acceleration.ay;
      const daz = currentAcceleration.az - prev.acceleration.az;
      accInnovation = Math.sqrt(dax * dax + day * day + daz * daz);
    }

    // ── Compute Doppler radial velocity innovation (m/s) ──
    let dopplerInnovation = -1;
    if (radialVelocity !== undefined && prev.radialVelocity !== undefined) {
      dopplerInnovation = Math.abs(radialVelocity - prev.radialVelocity);
    }

    // ── Determine consistency ──
    // Scale gates by dt: longer intervals allow more drift
    const dtFactor = Math.max(1, dtSec);
    const posGate = this.config.positionGateM * dtFactor;
    const velGate = this.config.velocityGateMps * dtFactor;
    const accGate = this.config.accelerationGateMps2 * dtFactor;
    const dopplerGate = this.config.dopplerGateMps * dtFactor;

    const posConsistent = posInnovation <= posGate;
    const velConsistent = velInnovation < 0 || velInnovation <= velGate;
    const accConsistent = accInnovation < 0 || accInnovation <= accGate;
    const dopplerConsistent = dopplerInnovation < 0 || dopplerInnovation <= dopplerGate;
    const isConsistent = posConsistent && velConsistent && accConsistent && dopplerConsistent;

    // ── Compute certainty delta ──
    let delta: number;
    let newConsistentCount = prev.consistentCount;

    if (isConsistent) {
      newConsistentCount++;
      delta = this.config.consistentBoost;

      // Streak bonus: accelerate certainty gain after N consecutive consistent updates
      if (newConsistentCount >= this.config.streakBonusAfter) {
        delta *= this.config.streakBonusMultiplier;
      }

      // Scale boost inversely by innovation magnitude (tighter = stronger boost)
      if (posGate > 0) {
        const tightness = 1 - (posInnovation / posGate);
        delta *= (0.5 + 0.5 * tightness); // at least 50% of boost
      }
    } else {
      newConsistentCount = 0;
      delta = this.config.inconsistentDecay;

      // Scale decay by how far outside the gate (worst of pos/vel/acc/doppler)
      let maxOverrun = 1;
      if (posGate > 0 && posInnovation > posGate) {
        maxOverrun = Math.max(maxOverrun, posInnovation / posGate);
      }
      if (velGate > 0 && velInnovation > velGate) {
        maxOverrun = Math.max(maxOverrun, velInnovation / velGate);
      }
      if (accGate > 0 && accInnovation > accGate) {
        maxOverrun = Math.max(maxOverrun, accInnovation / accGate);
      }
      if (dopplerGate > 0 && dopplerInnovation > dopplerGate) {
        maxOverrun = Math.max(maxOverrun, dopplerInnovation / dopplerGate);
      }
      delta *= Math.min(2, maxOverrun); // up to 2x decay for large innovation
    }

    // Clamp delta
    delta = Math.max(-this.config.maxDeltaPerUpdate, Math.min(this.config.maxDeltaPerUpdate, delta));

    // Update running consistency score
    const alpha = 0.3; // EMA smoothing factor
    const rawConsistency = isConsistent ? 1.0 : 0.0;
    const newConsistencyScore = (1 - alpha) * prev.consistencyScore + alpha * rawConsistency;

    // ── Update snapshot ──
    this.snapshots.set(trackId, {
      position: { ...position },
      velocity: velocity ? { ...velocity } : undefined,
      acceleration: currentAcceleration ?? prev.acceleration,
      radialVelocity: radialVelocity ?? prev.radialVelocity,
      timestamp,
      consistencyScore: newConsistencyScore,
      consistentCount: newConsistentCount,
    });

    return {
      positionInnovationM: posInnovation,
      velocityInnovationMps: velInnovation,
      accelerationInnovationMps2: accInnovation,
      dopplerInnovationMps: dopplerInnovation,
      isConsistent,
      consistencyScore: newConsistencyScore,
      certaintyDelta: delta,
      consistentCount: newConsistentCount,
    };
  }

  /** Get the current snapshot for a track (if any). */
  getSnapshot(trackId: string): TrackStateSnapshot | undefined {
    return this.snapshots.get(trackId);
  }

  /** Remove a track from consistency tracking (on drop). */
  removeTrack(trackId: string): void {
    this.snapshots.delete(trackId);
  }

  /** Reset all state. */
  reset(): void {
    this.snapshots.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Predict position and velocity from previous snapshot using
   * constant-acceleration model:
   *   pos(t+dt) = pos(t) + vel(t)*dt + 0.5*acc(t)*dt²
   *   vel(t+dt) = vel(t) + acc(t)*dt
   *
   * Falls back to constant-velocity if no acceleration available,
   * and to zero-velocity (stationary) if no velocity available.
   */
  private predictState(prev: TrackStateSnapshot, dtSec: number): {
    position: Position3D;
    velocity: Velocity3D | undefined;
  } {
    if (!prev.velocity) {
      return { position: { ...prev.position }, velocity: undefined };
    }

    const vel = prev.velocity;
    const acc = prev.acceleration;

    // Velocity components (ENU m/s)
    let vx = vel.vx;
    let vy = vel.vy;
    let vz = vel.vz;

    // Position shift from velocity + acceleration
    let shiftE = vx * dtSec;
    let shiftN = vy * dtSec;
    let shiftU = vz * dtSec;

    if (acc) {
      // Add acceleration contribution: 0.5 * a * dt²
      const halfDt2 = 0.5 * dtSec * dtSec;
      shiftE += acc.ax * halfDt2;
      shiftN += acc.ay * halfDt2;
      shiftU += acc.az * halfDt2;

      // Predicted velocity: v + a*dt
      vx += acc.ax * dtSec;
      vy += acc.ay * dtSec;
      vz += acc.az * dtSec;
    }

    const latShift = shiftN / M_PER_DEG_LAT;
    const lonShift = shiftE / mPerDegLon(prev.position.lat);

    return {
      position: {
        lat: prev.position.lat + latShift,
        lon: prev.position.lon + lonShift,
        alt: prev.position.alt + shiftU,
      },
      velocity: { vx, vy, vz },
    };
  }
}
