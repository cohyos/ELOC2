/**
 * EoSensorInstance — Concrete EO sensor that extends SensorInstance.
 *
 * Generates bearing observations from ground truth targets, manages gimbal
 * state, and publishes BearingReport messages on the SensorBus.
 * EO sensors do NOT maintain local position tracks — they produce
 * bearing-only measurements that feed into the EO CORE for triangulation.
 */

import type { SensorId, Timestamp, BearingMeasurement } from '@eloc2/domain';
import { DRI_PROFILES } from '@eloc2/domain';
import type { DriTargetCategory } from '@eloc2/domain';
import type {
  GroundTruthTarget,
  BearingMeasurementReport,
  BearingReport,
  CueCommand,
  SearchPatternCommand,
  SystemCommand,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { haversineDistanceM, bearingDeg } from '@eloc2/shared-utils';
import { generateEoBearing } from '@eloc2/simulator';
import type { SensorDefinition, FaultDefinition } from '@eloc2/simulator';

import { SensorInstance } from './base-sensor.js';
import type { SensorInstanceConfig, SensorTickResult } from './types.js';

// ---------------------------------------------------------------------------
// EoSensorInstance
// ---------------------------------------------------------------------------

export class EoSensorInstance extends SensorInstance {
  // Gimbal state
  private gimbalAzimuthDeg = 0;
  private gimbalElevationDeg = 0;
  private currentTargetId: string | null = null;
  private eoMode: 'staring' | 'investigating' = 'staring';

  // Search pattern state
  private searchPattern: {
    pattern: 'sector' | 'raster';
    azStart: number;
    azEnd: number;
    scanSpeed: number;
  } | null = null;
  private searchAzimuth = 0;

  // Cue state
  private activeCue: CueCommand | null = null;

  constructor(config: SensorInstanceConfig, bus: SensorBus) {
    // EO sensors don't maintain local position tracks — minimal TrackManager config
    super(config, bus, {
      confirmAfter: 3,
      dropAfterMisses: 8,
      enableExistence: false,
      coastingMissThreshold: 3,
      maxCoastingTimeSec: 10,
      associationMode: 'nn',
      enableIMM: false,
    });
  }

  // ── tick() ──────────────────────────────────────────────────────────────

  tick(simTimeSec: number, dtSec: number): SensorTickResult {
    if (!this.shouldUpdate(simTimeSec)) {
      return {
        sensorId: this.sensorId,
        simTimeSec,
        observationsGenerated: 0,
        localTrackCount: 0,
        mode: this.mode,
        online: this.online,
      };
    }

    // Update gimbal position
    const elapsed = simTimeSec - this.lastUpdateSimSec;
    this.updateGimbal(elapsed > 0 ? elapsed : dtSec);

    // Build a SensorDefinition compatible with the simulator's EO model
    const sensorDef = this.buildSensorDefinition();
    const faults: FaultDefinition[] = [];
    const baseTimestamp = 0;
    const bearings: BearingMeasurementReport[] = [];

    for (const [targetId, target] of this.visibleTargets) {
      const result = generateEoBearing(
        sensorDef,
        target.position,
        simTimeSec,
        baseTimestamp,
        faults,
        targetId,
        undefined, // rng — use Math.random
        { targetClassification: target.classification },
      );

      if (result) {
        bearings.push({
          bearing: result.bearing,
          targetId,
          imageQuality: result.imageQuality,
          sensorPosition: { ...this.config.position },
          driTier: result.driTier,
        });
      }
    }

    // Update last tick time
    this.lastUpdateSimSec = simTimeSec;

    // Publish bearing report on the bus (not SensorTrackReport)
    if (bearings.length > 0 || this.activeCue) {
      this.publishBearings(simTimeSec, bearings);
    }

    return {
      sensorId: this.sensorId,
      simTimeSec,
      observationsGenerated: bearings.length,
      localTrackCount: 0, // EO doesn't maintain local tracks
      mode: this.mode,
      online: this.online,
    };
  }

  // ── filterTargetByCoverage() ────────────────────────────────────────────

  filterTargetByCoverage(target: GroundTruthTarget): boolean {
    const sensorPos = this.config.position;
    const targetPos = target.position;

    const rangeM = haversineDistanceM(
      sensorPos.lat,
      sensorPos.lon,
      targetPos.lat,
      targetPos.lon,
    );

    // Use max possible DRI detection range as ceiling (ballistic has highest multiplier)
    // so that hot targets like missiles aren't pre-filtered before DRI evaluation
    const baseRange = this.config.maxDetectionRangeM ?? this.config.coverage.maxRangeM;
    const maxDriMultiplier = Math.max(
      ...Object.values(DRI_PROFILES).map((p) => p.detection),
    );
    const maxPossibleRange = baseRange * maxDriMultiplier;
    return rangeM <= maxPossibleRange;
  }

  // ── Command Handling (override) ────────────────────────────────────────

  protected override handleCommand(cmd: SystemCommand): void {
    const command = cmd.command;
    switch (command.type) {
      case 'cue':
        this.activeCue = command;
        this.eoMode = 'investigating';
        this.currentTargetId = command.systemTrackId;
        break;
      case 'search_pattern':
        this.activeCue = null;
        this.currentTargetId = null;
        this.eoMode = 'staring';
        this.searchPattern = {
          pattern: command.pattern,
          azStart: command.azimuthStartDeg,
          azEnd: command.azimuthEndDeg,
          scanSpeed: command.scanSpeedDegPerSec,
        };
        this.searchAzimuth = command.azimuthStartDeg;
        break;
      case 'mode':
        if (command.mode === 'standby') {
          this.activeCue = null;
          this.searchPattern = null;
          this.currentTargetId = null;
          this.eoMode = 'staring';
        } else if (command.mode === 'search') {
          // Default search pattern — full 360° scan
          this.activeCue = null;
          this.currentTargetId = null;
          this.eoMode = 'staring';
          this.searchPattern = {
            pattern: 'sector',
            azStart: 0,
            azEnd: 360,
            scanSpeed: 10,
          };
          this.searchAzimuth = 0;
        }
        // Delegate mode state change to base class
        super.handleCommand(cmd);
        break;
      default:
        super.handleCommand(cmd);
        break;
    }
  }

  // ── Gimbal Management ─────────────────────────────────────────────────

  private updateGimbal(dtSec: number): void {
    const slewRate = this.config.slewRateDegPerSec ?? 30;

    if (this.activeCue) {
      // Slew toward cue target position
      const targetAz = bearingDeg(
        this.config.position.lat,
        this.config.position.lon,
        this.activeCue.predictedPosition.lat,
        this.activeCue.predictedPosition.lon,
      );

      let diff = targetAz - this.gimbalAzimuthDeg;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      const maxSlew = slewRate * dtSec;
      if (Math.abs(diff) <= maxSlew) {
        this.gimbalAzimuthDeg = targetAz;
      } else {
        this.gimbalAzimuthDeg += Math.sign(diff) * maxSlew;
      }
    } else if (this.searchPattern) {
      // Sector/raster scan
      this.searchAzimuth += this.searchPattern.scanSpeed * dtSec;
      if (this.searchAzimuth > this.searchPattern.azEnd) {
        this.searchAzimuth = this.searchPattern.azStart;
      }
      this.gimbalAzimuthDeg = this.searchAzimuth;
    }

    // Normalize to [0, 360)
    this.gimbalAzimuthDeg = ((this.gimbalAzimuthDeg % 360) + 360) % 360;
  }

  // ── Bearing Publishing ────────────────────────────────────────────────

  private publishBearings(
    simTimeSec: number,
    bearings: BearingMeasurementReport[],
  ): void {
    const report: BearingReport = {
      messageType: 'sensor.bearing.report',
      sensorId: this.sensorId as SensorId,
      timestamp: Date.now() as Timestamp,
      simTimeSec,
      bearings,
      gimbalState: {
        azimuthDeg: this.gimbalAzimuthDeg,
        elevationDeg: this.gimbalElevationDeg,
        slewRateDegPerSec: this.config.slewRateDegPerSec ?? 30,
        currentTargetId: this.currentTargetId ?? undefined,
      },
    };
    this.bus.publishBearingReport(report);
  }

  // ── Private helpers ───────────────────────────────────────────────────

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

  // ── Accessors (for testing) ───────────────────────────────────────────

  getGimbalAzimuthDeg(): number {
    return this.gimbalAzimuthDeg;
  }

  getEoMode(): 'staring' | 'investigating' {
    return this.eoMode;
  }

  getActiveCue(): CueCommand | null {
    return this.activeCue;
  }
}
