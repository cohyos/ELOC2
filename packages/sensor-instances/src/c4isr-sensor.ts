/**
 * C4ISR Sensor Instance — external C2 system feed.
 *
 * C4ISR is the simplest sensor type: it represents an external C2 system
 * feeding pre-processed tracks. Key differences from radar/EO:
 * - No coverage filter: C4ISR always reports all active targets
 * - Lower update rate: 12 seconds (0.08 Hz)
 * - Higher noise: ±200m position, ±5 m/s velocity
 * - No Doppler, no BM/ABT dual hypothesis
 */

import type { SensorId, Timestamp, SourceObservation } from '@eloc2/domain';
import type { GroundTruthTarget } from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { generateC4isrObservation } from '@eloc2/simulator';
import type { SensorDefinition } from '@eloc2/simulator';

import { SensorInstance } from './base-sensor.js';
import type { SensorInstanceConfig, SensorTickResult } from './types.js';

export class C4isrSensorInstance extends SensorInstance {
  private tickCounter: number = 0;

  constructor(config: SensorInstanceConfig, bus: SensorBus) {
    super(config, bus, {
      confirmAfter: 2, // C4ISR tracks confirm faster (already pre-processed)
      dropAfterMisses: 3, // Drop faster too
      enableExistence: true,
      existencePromotionThreshold: 0.4,
      existenceConfirmationThreshold: 0.7,
      existenceDeletionThreshold: 0.1,
      coastingMissThreshold: 2,
      maxCoastingTimeSec: 30, // Longer coasting for C4ISR (low update rate)
      associationMode: 'nn',
      enableIMM: false, // No maneuver detection for C4ISR
    });
  }

  // ── Coverage ────────────────────────────────────────────────────────────

  /**
   * C4ISR is a system-level feed that sees everything.
   * Always returns true — the only filter applied by the base class is `target.active`.
   */
  filterTargetByCoverage(_target: GroundTruthTarget): boolean {
    return true;
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  tick(simTimeSec: number, _dtSec: number): SensorTickResult {
    this.tickCounter++;
    let observationsGenerated = 0;

    if (this.shouldUpdate(simTimeSec)) {
      this.lastUpdateSimSec = simTimeSec;

      // Convert config to SensorDefinition for the simulator function
      const sensorDef: SensorDefinition = {
        sensorId: this.config.sensorId,
        type: this.config.type,
        position: this.config.position,
        coverage: {
          minAzDeg: this.config.coverage.minAzDeg,
          maxAzDeg: this.config.coverage.maxAzDeg,
          minElDeg: this.config.coverage.minElDeg,
          maxElDeg: this.config.coverage.maxElDeg,
          maxRangeM: this.config.coverage.maxRangeM,
        },
      };

      const baseTimestamp = Date.now();

      // Process each visible target (all active targets — no coverage filter)
      for (const [_targetId, target] of this.visibleTargets) {
        const obs: SourceObservation | undefined = generateC4isrObservation(
          sensorDef,
          target.position,
          target.velocity,
          simTimeSec,
          baseTimestamp,
          [], // no faults
        );

        if (obs) {
          this.localTrackManager.processObservation(obs);
          observationsGenerated++;

          // Record position history for the track report
          // Use the observation position for history tracking
          const tracks = this.localTrackManager.getAllTracks();
          if (tracks.length > 0) {
            // Find the most recently updated track (likely the one just processed)
            const latestTrack = tracks.reduce((best, t) =>
              (t.lastUpdated as number) > (best.lastUpdated as number) ? t : best,
            );
            this.recordPositionHistory(
              latestTrack.systemTrackId as string,
              obs.position,
              simTimeSec,
            );
          }
        }
      }

      // Mark stale tracks and merge close ones
      this.localTrackManager.markStaleTracksAsMissed(this.tickCounter);
      this.localTrackManager.mergeCloseTracks();

      // Publish track report
      this.publishTrackReport(simTimeSec);
    }

    return {
      sensorId: this.sensorId,
      simTimeSec,
      observationsGenerated,
      localTrackCount: this.localTrackManager
        .getAllTracks()
        .filter((t) => t.status !== 'dropped').length,
      mode: this.mode,
      online: this.online,
    };
  }
}
