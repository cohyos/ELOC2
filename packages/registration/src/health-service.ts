import type {
  QualityLevel,
  RegistrationState,
  SensorId,
  SpatialBias,
  Timestamp,
} from '@eloc2/domain';
import type { RegistrationStateUpdated } from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';

import type { ClockHealthAssessment } from './clock-health.js';

// ---------------------------------------------------------------------------
// RegistrationHealthService
// ---------------------------------------------------------------------------

/**
 * Maintains the registration (alignment) health of every sensor in the
 * system.  Spatial bias and clock-health updates flow in; the service
 * recalculates quality levels, determines whether fusion is safe, and
 * emits {@link RegistrationStateUpdated} events on every state change.
 */
export class RegistrationHealthService {
  readonly states: Map<string, RegistrationState> = new Map();

  // ── Spatial bias update ──────────────────────────────────────────────────

  /**
   * Update the spatial bias estimate for a sensor and recalculate its
   * spatial quality level.
   */
  updateBias(sensorId: SensorId, bias: SpatialBias): void {
    const existing = this.states.get(sensorId);
    const spatialQuality = this.determineSpatialQuality(bias);
    const now = Date.now() as Timestamp;

    if (existing) {
      existing.spatialBias = { ...bias };
      existing.spatialQuality = spatialQuality;
      existing.fusionSafe = this.computeFusionSafe(spatialQuality, existing.timingQuality);
      existing.biasEstimateAge = 0;
      existing.lastUpdated = now;
    } else {
      const state: RegistrationState = {
        sensorId,
        spatialBias: { ...bias },
        clockBias: { offsetMs: 0, driftRateMs: 0 },
        spatialQuality,
        timingQuality: 'good',
        biasEstimateAge: 0,
        fusionSafe: this.computeFusionSafe(spatialQuality, 'good'),
        lastUpdated: now,
      };
      this.states.set(sensorId, state);
    }
  }

  // ── Clock health update ──────────────────────────────────────────────────

  /**
   * Update the clock-health assessment for a sensor and recalculate its
   * timing quality level.
   */
  updateClockHealth(sensorId: SensorId, assessment: ClockHealthAssessment): void {
    const existing = this.states.get(sensorId);
    const now = Date.now() as Timestamp;

    if (existing) {
      existing.clockBias = {
        offsetMs: assessment.offsetMs,
        driftRateMs: assessment.driftRateMs,
      };
      existing.timingQuality = assessment.quality;
      existing.fusionSafe = this.computeFusionSafe(existing.spatialQuality, assessment.quality);
      existing.lastUpdated = now;
    } else {
      const state: RegistrationState = {
        sensorId,
        spatialBias: { azimuthBiasDeg: 0, elevationBiasDeg: 0, rangeBiasM: 0 },
        clockBias: {
          offsetMs: assessment.offsetMs,
          driftRateMs: assessment.driftRateMs,
        },
        spatialQuality: 'good',
        timingQuality: assessment.quality,
        biasEstimateAge: 0,
        fusionSafe: this.computeFusionSafe('good', assessment.quality),
        lastUpdated: now,
      };
      this.states.set(sensorId, state);
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /** Retrieve the current registration state for a sensor, if known. */
  getHealth(sensorId: SensorId): RegistrationState | undefined {
    return this.states.get(sensorId);
  }

  /**
   * Returns `true` only when both spatial and timing quality are NOT
   * `'unsafe'`.  If no health data is available the sensor is assumed safe.
   */
  isFusionSafe(sensorId: SensorId): boolean {
    const state = this.states.get(sensorId);
    if (!state) return true;
    return state.fusionSafe;
  }

  /** Return all known registration states. */
  getAllHealth(): RegistrationState[] {
    return [...this.states.values()];
  }

  // ── Quality classification ───────────────────────────────────────────────

  /**
   * Classify a spatial bias into a quality level.
   *
   * - Any angular bias component > 2.0 deg **or** range bias > 500 m → `'unsafe'`
   * - Any angular bias component > 0.5 deg **or** range bias > 100 m → `'degraded'`
   * - Otherwise → `'good'`
   */
  determineSpatialQuality(bias: SpatialBias): QualityLevel {
    const absAz = Math.abs(bias.azimuthBiasDeg);
    const absEl = Math.abs(bias.elevationBiasDeg);
    const absRange = Math.abs(bias.rangeBiasM);

    if (absAz > 2.0 || absEl > 2.0 || absRange > 500) {
      return 'unsafe';
    }
    if (absAz > 0.5 || absEl > 0.5 || absRange > 100) {
      return 'degraded';
    }
    return 'good';
  }

  // ── Event emission ───────────────────────────────────────────────────────

  /**
   * Emit a {@link RegistrationStateUpdated} event for a sensor.
   * Returns the event (the caller is responsible for publishing it).
   */
  emitHealthEvent(
    sensorId: SensorId,
    previousState?: RegistrationState,
  ): RegistrationStateUpdated {
    const newState = this.states.get(sensorId);
    if (!newState) {
      throw new Error(`No registration state for sensor ${sensorId}`);
    }

    const envelope = createEventEnvelope(
      'registration.state.updated',
      'registration',
      'health-service',
    );

    return {
      ...envelope,
      eventType: 'registration.state.updated' as const,
      data: {
        sensorId,
        previousState: previousState ?? undefined,
        newState: { ...newState },
        estimationMethod: 'co-visible-track-pairs',
        confidence: newState.fusionSafe ? 0.9 : 0.4,
      },
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private computeFusionSafe(
    spatialQuality: QualityLevel,
    timingQuality: QualityLevel,
  ): boolean {
    return spatialQuality !== 'unsafe' && timingQuality !== 'unsafe';
  }
}
