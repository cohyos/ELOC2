/**
 * RadarSensorInstance — Concrete radar sensor that extends SensorInstance.
 *
 * Generates radar observations from ground truth targets, maintains local
 * tracks via its own TrackManager, and publishes SensorTrackReport messages
 * on the SensorBus.
 */

import type { SensorId, Timestamp } from '@eloc2/domain';
import type { GroundTruthTarget, LocalTrackReport } from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { haversineDistanceM, bearingDeg } from '@eloc2/shared-utils';
import { generateRadarObservation } from '@eloc2/simulator';
import type { SensorDefinition, FaultDefinition } from '@eloc2/simulator';

import { SensorInstance } from './base-sensor.js';
import type { SensorInstanceConfig, SensorTickResult } from './types.js';

// ---------------------------------------------------------------------------
// RadarSensorInstance
// ---------------------------------------------------------------------------

export class RadarSensorInstance extends SensorInstance {
  constructor(config: SensorInstanceConfig, bus: SensorBus) {
    super(config, bus, {
      confirmAfter: 3,
      dropAfterMisses: 8,
      enableExistence: true,
      existencePromotionThreshold: 0.5,
      existenceConfirmationThreshold: 0.8,
      existenceDeletionThreshold: 0.05,
      coastingMissThreshold: 3,
      maxCoastingTimeSec: 15,
      associationMode: 'nn',
      enableIMM: true,
    });
    this.localTrackManager.enableDualHypothesis = true;
  }

  // ── tick() ──────────────────────────────────────────────────────────────

  tick(simTimeSec: number, _dtSec: number): SensorTickResult {
    if (!this.shouldUpdate(simTimeSec)) {
      return {
        sensorId: this.sensorId,
        simTimeSec,
        observationsGenerated: 0,
        localTrackCount: this.localTrackManager
          .getAllTracks()
          .filter((t) => t.status !== 'dropped').length,
        mode: this.mode,
        online: this.online,
      };
    }

    // Build a SensorDefinition compatible with the simulator's radar model
    const sensorDef = this.buildSensorDefinition();
    const faults: FaultDefinition[] = [];
    const baseTimestamp = 0;
    let observationsGenerated = 0;

    for (const [targetId, target] of this.visibleTargets) {
      const result = generateRadarObservation(
        sensorDef,
        target.position,
        target.velocity,
        simTimeSec,
        baseTimestamp,
        faults,
        targetId,
        undefined, // rng — use Math.random
        {
          rcs: target.rcs,
          classification: target.classification,
        },
      );

      if (result) {
        const processResult = this.localTrackManager.processObservation(
          result.observation,
        );
        observationsGenerated++;

        // Record tick for stale detection
        if (processResult.track) {
          this.localTrackManager.setTrackUpdateTick(
            processResult.track.systemTrackId,
            simTimeSec,
          );

          // Record position history
          this.recordPositionHistory(
            processResult.track.systemTrackId as string,
            processResult.track.state,
            simTimeSec,
          );
        }
      }
    }

    // Mark stale tracks (grace period of 3 ticks)
    this.localTrackManager.markStaleTracksAsMissed(simTimeSec, 3);

    // Merge close tracks to prevent proliferation
    this.localTrackManager.mergeCloseTracks();

    // Update last tick time
    this.lastUpdateSimSec = simTimeSec;

    // Publish track report on the bus
    this.publishTrackReport(simTimeSec);

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

  // ── filterTargetByCoverage() ────────────────────────────────────────────

  filterTargetByCoverage(target: GroundTruthTarget): boolean {
    const sensorPos = this.config.position;
    const targetPos = target.position;

    // 1. Range check
    const rangeM = haversineDistanceM(
      sensorPos.lat,
      sensorPos.lon,
      targetPos.lat,
      targetPos.lon,
    );
    if (rangeM > this.config.coverage.maxRangeM) {
      return false;
    }

    // 2. Azimuth check (handle wrap-around)
    const azDeg = bearingDeg(
      sensorPos.lat,
      sensorPos.lon,
      targetPos.lat,
      targetPos.lon,
    );
    const { minAzDeg, maxAzDeg } = this.config.coverage;
    let azInRange: boolean;
    if (minAzDeg <= maxAzDeg) {
      azInRange = azDeg >= minAzDeg && azDeg <= maxAzDeg;
    } else {
      // Wraps around 360 (e.g., 350 to 10)
      azInRange = azDeg >= minAzDeg || azDeg <= maxAzDeg;
    }
    if (!azInRange) {
      return false;
    }

    // 3. RCS-based detection probability (optional)
    const rcs = target.rcs;
    if (rcs !== undefined && rcs <= 1.0) {
      // Smaller RCS => lower detection probability
      // Use range-dependent probability: closer targets more likely detected
      const rangeFraction = rangeM / this.config.coverage.maxRangeM;
      const basePd = Math.min(1.0, Math.sqrt(rcs)); // rcs=1 => Pd=1, rcs=0.01 => Pd=0.1
      const detectionProbability = basePd * (1 - 0.5 * rangeFraction); // degrade with range
      if (Math.random() >= detectionProbability) {
        return false;
      }
    }

    return true;
  }

  // ── buildLocalTrackReports() override ───────────────────────────────────

  protected override buildLocalTrackReports(): LocalTrackReport[] {
    const tracks = this.localTrackManager
      .getAllTracks()
      .filter((t) => t.status !== 'dropped');

    return tracks.map((track) => {
      const trackId = track.systemTrackId as string;
      const history = this.positionHistory.get(trackId) ?? [];

      // Get ABT/BM classification data
      const targetCategory =
        this.localTrackManager.getTrackCategory(track.systemTrackId) ??
        'unresolved';
      const classifierState = this.localTrackManager.getClassifierState(
        track.systemTrackId,
      );
      const classifierConfidence = classifierState?.confidence ?? 0;

      return {
        localTrackId: trackId,
        sensorId: this.sensorId as SensorId,
        position: { ...track.state },
        velocity: track.velocity ? { ...track.velocity } : undefined,
        covariance: track.covariance.map((row) => [...row]),
        confidence: track.confidence,
        status: this.mapTrackStatusForReport(track.status),
        updateCount: track.lineage?.length ?? 0,
        missCount: 0,
        existenceProbability:
          track.existenceProbability ?? track.confidence,
        targetCategory,
        classifierConfidence,
        lastObservationTime: (track.lastUpdated as number) / 1000,
        positionHistory: history.slice(-10),
      } satisfies LocalTrackReport;
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private mapTrackStatusForReport(
    status: string,
  ): 'new' | 'maintained' | 'coasting' | 'dropped' {
    switch (status) {
      case 'tentative':
        return 'new';
      case 'confirmed':
        return 'maintained';
      case 'coasting':
        return 'coasting';
      case 'dropped':
        return 'dropped';
      default:
        return 'new';
    }
  }

  /**
   * Convert SensorInstanceConfig to the simulator's SensorDefinition shape.
   */
  private buildSensorDefinition(): SensorDefinition {
    return {
      sensorId: this.config.sensorId,
      type: this.config.type,
      position: { ...this.config.position },
      coverage: { ...this.config.coverage },
      fov: this.config.fov ? { ...this.config.fov } : undefined,
      slewRateDegPerSec: this.config.slewRateDegPerSec,
      maxDetectionRangeM: this.config.maxDetectionRangeM,
    };
  }
}
