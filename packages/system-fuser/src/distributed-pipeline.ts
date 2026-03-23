/**
 * DistributedPipeline — orchestrates the full distributed sensor architecture.
 *
 * Wires together: SensorBus → SensorInstances → EoCoreEntity → SystemFuser
 * plus InvestigatorCoordinator for EO tasking.
 *
 * This is a standalone orchestrator that does NOT modify the existing LiveEngine.
 * It proves the new architecture works end-to-end.
 */

import { SensorBus } from '@eloc2/sensor-bus';
import type { GroundTruthBroadcast, GroundTruthTarget } from '@eloc2/sensor-bus';
import type { SensorInstanceConfig, ObservationGenerators } from '@eloc2/sensor-instances';
import {
  createSensorInstances,
  SensorInstance,
  EoSensorInstance,
} from '@eloc2/sensor-instances';
import { EoCoreEntity } from '@eloc2/eo-core';
import type { EoSensorInfo, TaskableTrack } from '@eloc2/eo-core';
import { InvestigatorCoordinator } from '@eloc2/eo-core';
import { SystemFuser } from './system-fuser.js';
import type { FusedSystemTrack, SystemFuserConfig } from './types.js';

// ---------------------------------------------------------------------------
// Config & Result types
// ---------------------------------------------------------------------------

export interface DistributedPipelineConfig {
  sensors: SensorInstanceConfig[];
  fuserConfig?: Partial<SystemFuserConfig>;
  /** Optional observation generators for decoupling from simulator. */
  generators?: ObservationGenerators;
}

export interface PipelineTickResult {
  simTimeSec: number;
  systemTracks: FusedSystemTrack[];
  eoCoreTracks: number;
  sensorResults: Array<{
    sensorId: string;
    observations: number;
    localTracks: number;
  }>;
  taskAssignments: number;
}

// ---------------------------------------------------------------------------
// DistributedPipeline
// ---------------------------------------------------------------------------

export class DistributedPipeline {
  private bus: SensorBus;
  private sensors: SensorInstance[] = [];
  private eoCore: EoCoreEntity;
  private investigator: InvestigatorCoordinator;
  private fuser: SystemFuser;

  constructor(config: DistributedPipelineConfig) {
    this.bus = new SensorBus();

    // Create sensor instances via factory (supports DI generators)
    this.sensors = createSensorInstances(config.sensors, this.bus, config.generators);

    // Create EO CORE — aggregates bearings from all EO sensors, triangulates
    this.eoCore = new EoCoreEntity(this.bus);

    // Create investigator coordinator — assigns EO sensors to tracks
    this.investigator = new InvestigatorCoordinator(this.bus, {
      taskingIntervalSec: 3,
      dwellDurationSec: 15,
      maxRevisitIntervalSec: 60,
    });

    // Create system fuser — merges all sensor track reports into system tracks
    this.fuser = new SystemFuser(this.bus, config.fuserConfig);
  }

  /**
   * Run one tick of the full distributed pipeline:
   * 1. Broadcast ground truth to all sensors via the bus
   * 2. Each sensor ticks independently (generates observations, publishes reports)
   * 3. EO CORE processes bearings → triangulates → publishes track reports
   * 4. System fuser processes all track reports → produces system tracks
   * 5. Investigator coordinator runs tasking cycle (assigns EO sensors to tracks)
   */
  tick(
    simTimeSec: number,
    dtSec: number,
    targets: GroundTruthTarget[],
  ): PipelineTickResult {
    // 1. Broadcast ground truth
    const gt: GroundTruthBroadcast = {
      messageType: 'gt.broadcast',
      simTimeSec,
      targets,
    };
    this.bus.broadcastGroundTruth(gt);

    // 2. Tick all sensors
    const sensorResults = this.sensors.map((sensor) => {
      const result = sensor.tick(simTimeSec, dtSec);
      return {
        sensorId: result.sensorId,
        observations: result.observationsGenerated,
        localTracks: result.localTrackCount,
      };
    });

    // 3. EO CORE tick (processes bearings, triangulates)
    this.eoCore.tick(simTimeSec);

    // 4. System fuser tick (processes all track reports)
    this.fuser.tick(simTimeSec);

    // 5. Investigator tasking cycle
    const systemTracks = this.fuser.getActiveTracks();
    const eoSensors = this.getEoSensorInfo();
    const taskableTracks: TaskableTrack[] = systemTracks.map((t) => ({
      systemTrackId: t.systemTrackId as string,
      state: t.state,
      velocity: t.velocity,
      confidence: t.confidence,
      status: t.status,
    }));
    const assignments = this.investigator.runTaskingCycle(
      taskableTracks,
      eoSensors,
      simTimeSec,
    );

    return {
      simTimeSec,
      systemTracks: this.fuser.getActiveTracks(),
      eoCoreTracks: this.eoCore.getActiveTracks().length,
      sensorResults,
      taskAssignments: assignments.length,
    };
  }

  private getEoSensorInfo(): EoSensorInfo[] {
    return this.sensors
      .filter((s) => s.sensorType === 'eo')
      .map((s) => {
        const eo = s as EoSensorInstance;
        return {
          sensorId: eo.sensorId,
          position: eo.config.position,
          slewRateDegPerSec: eo.config.slewRateDegPerSec ?? 30,
          currentAzimuthDeg: eo.getGimbalAzimuthDeg(),
          mode: eo.getMode() as 'track' | 'search' | 'standby',
          online: eo.isOnline(),
        };
      });
  }

  // ── Public accessors ───────────────────────────────────────────────────

  getSystemTracks(): FusedSystemTrack[] {
    return this.fuser.getActiveTracks();
  }

  getBus(): SensorBus {
    return this.bus;
  }

  getSensors(): SensorInstance[] {
    return [...this.sensors];
  }

  reset(): void {
    this.fuser.reset();
    this.eoCore.reset();
    this.investigator.reset();
  }

  destroy(): void {
    this.sensors.forEach((s) => s.destroy());
    this.bus.destroy();
  }
}
