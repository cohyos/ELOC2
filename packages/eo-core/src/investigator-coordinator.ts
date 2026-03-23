/**
 * InvestigatorCoordinator — decides which EO sensors investigate which
 * system tracks, and issues CueCommands via the SensorBus.
 */

import type { SensorId, Position3D, Velocity3D } from '@eloc2/domain';
import type { SensorBus } from '@eloc2/sensor-bus';
import { generateId, bearingDeg } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EoSensorInfo {
  sensorId: string;
  position: Position3D;
  slewRateDegPerSec: number;
  currentAzimuthDeg: number;
  mode: 'track' | 'search' | 'standby';
  online: boolean;
  currentTargetId?: string;
}

/** Minimal system track interface for tasking (avoids importing full SystemTrack) */
export interface TaskableTrack {
  systemTrackId: string;
  state: Position3D;
  velocity?: Velocity3D;
  confidence: number;
  status: string; // 'confirmed' | 'tentative' | 'coasting' | 'dropped'
}

export interface TaskAssignment {
  sensorId: string;
  trackId: string;
  score: number;
}

export interface InvestigatorConfig {
  taskingIntervalSec: number;
  dwellDurationSec: number;
  maxRevisitIntervalSec: number;
}

const DEFAULT_CONFIG: InvestigatorConfig = {
  taskingIntervalSec: 3,
  dwellDurationSec: 15,
  maxRevisitIntervalSec: 60,
};

// ---------------------------------------------------------------------------
// InvestigatorCoordinator
// ---------------------------------------------------------------------------

export class InvestigatorCoordinator {
  private bus: SensorBus;
  private config: InvestigatorConfig;

  // Current assignments: sensorId -> assignment
  private assignments: Map<string, TaskAssignment> = new Map();

  // Dwell tracking: sensorId -> sim time when dwell started
  private dwellStartTime: Map<string, number> = new Map();

  // Last investigation time per track: trackId -> sim time
  private lastInvestigationTime: Map<string, number> = new Map();

  // Last tasking cycle time
  private lastTaskingTimeSec = 0;

  constructor(bus: SensorBus, config?: Partial<InvestigatorConfig>) {
    this.bus = bus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a tasking cycle — evaluate which EO sensors should investigate which tracks.
   * Called periodically (every taskingIntervalSec).
   */
  runTaskingCycle(
    systemTracks: TaskableTrack[],
    eoSensors: EoSensorInfo[],
    simTimeSec: number,
  ): TaskAssignment[] {
    if (
      simTimeSec - this.lastTaskingTimeSec < this.config.taskingIntervalSec
    ) {
      return []; // Not time yet
    }
    this.lastTaskingTimeSec = simTimeSec;

    // 1. Check dwell completions — free sensors that have finished dwelling
    this.checkDwellCompletions(simTimeSec);

    // 2. Get available sensors (online, in track mode, not currently assigned)
    const availableSensors = eoSensors.filter(
      (s) =>
        s.online && s.mode === 'track' && !this.assignments.has(s.sensorId),
    );
    if (availableSensors.length === 0) return [];

    // 3. Get candidate tracks (confirmed or tentative)
    const candidateTracks = systemTracks.filter(
      (t) => t.status === 'confirmed' || t.status === 'tentative',
    );
    if (candidateTracks.length === 0) return [];

    // 4. Score each sensor-track pair
    const scoredPairs: Array<{
      sensor: EoSensorInfo;
      track: TaskableTrack;
      score: number;
    }> = [];

    for (const sensor of availableSensors) {
      for (const track of candidateTracks) {
        const score = this.scoreCandidate(sensor, track, simTimeSec);
        if (score > 0) {
          scoredPairs.push({ sensor, track, score });
        }
      }
    }

    // 5. Greedy assignment — best score first, one sensor per track
    scoredPairs.sort((a, b) => b.score - a.score);
    const assignedSensors = new Set<string>();
    const assignedTracks = new Set<string>();
    const newAssignments: TaskAssignment[] = [];

    for (const pair of scoredPairs) {
      if (assignedSensors.has(pair.sensor.sensorId)) continue;
      if (assignedTracks.has(pair.track.systemTrackId)) continue;

      // Send cue command to sensor via bus
      this.bus.sendCommand({
        messageType: 'system.command',
        commandId: generateId(),
        targetSensorId: pair.sensor.sensorId as SensorId,
        simTimeSec,
        command: {
          type: 'cue',
          systemTrackId: pair.track.systemTrackId,
          predictedPosition: { ...pair.track.state },
          predictedVelocity: pair.track.velocity
            ? { ...pair.track.velocity }
            : undefined,
          uncertaintyGateDeg: 5,
          priority: Math.round(1 + pair.track.confidence * 9),
        },
      });

      const assignment: TaskAssignment = {
        sensorId: pair.sensor.sensorId,
        trackId: pair.track.systemTrackId,
        score: pair.score,
      };

      // Record assignment
      this.assignments.set(pair.sensor.sensorId, assignment);
      this.dwellStartTime.set(pair.sensor.sensorId, simTimeSec);
      this.lastInvestigationTime.set(pair.track.systemTrackId, simTimeSec);

      assignedSensors.add(pair.sensor.sensorId);
      assignedTracks.add(pair.track.systemTrackId);
      newAssignments.push(assignment);
    }

    return newAssignments;
  }

  /** Score a sensor-track candidate pair */
  private scoreCandidate(
    sensor: EoSensorInfo,
    track: TaskableTrack,
    simTimeSec: number,
  ): number {
    let score = 0;

    // Threat score — based on track confidence
    score += track.confidence * 10;

    // Slew cost — penalize distant targets (angular distance from gimbal)
    const targetAz = bearingDeg(
      sensor.position.lat,
      sensor.position.lon,
      track.state.lat,
      track.state.lon,
    );
    let slewAngle = Math.abs(targetAz - sensor.currentAzimuthDeg);
    if (slewAngle > 180) slewAngle = 360 - slewAngle;
    score -= slewAngle / 30; // Penalty: 1 point per 30 degrees

    // Revisit bonus — tracks not recently investigated get a boost
    const lastInv = this.lastInvestigationTime.get(track.systemTrackId);
    if (lastInv !== undefined) {
      const elapsed = simTimeSec - lastInv;
      if (elapsed > this.config.maxRevisitIntervalSec) {
        score += 5; // Overdue boost
      }
    } else {
      score += 5; // Never investigated — treat as overdue
    }

    return score;
  }

  /** Check which sensors have completed their dwell and free them */
  private checkDwellCompletions(simTimeSec: number): void {
    const toRemove: string[] = [];
    for (const [sensorId, startTime] of this.dwellStartTime) {
      if (simTimeSec - startTime >= this.config.dwellDurationSec) {
        toRemove.push(sensorId);
      }
    }
    for (const sensorId of toRemove) {
      this.assignments.delete(sensorId);
      this.dwellStartTime.delete(sensorId);
    }
  }

  /** Get current assignments */
  getAssignments(): Map<string, TaskAssignment> {
    return new Map(this.assignments);
  }

  /** Get last investigation time for a track */
  getLastInvestigationTime(trackId: string): number | undefined {
    return this.lastInvestigationTime.get(trackId);
  }

  /** Reset all state */
  reset(): void {
    this.assignments.clear();
    this.dwellStartTime.clear();
    this.lastInvestigationTime.clear();
    this.lastTaskingTimeSec = 0;
  }
}
