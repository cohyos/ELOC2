/**
 * Core simulation engine — runs a scenario step-by-step, generating
 * synthetic observations, bearing measurements, faults, and operator actions.
 */

import type { Position3D } from '@eloc2/domain';
import { createSeededRandom } from '@eloc2/shared-utils';
import type {
  ScenarioDefinition,
  FaultDefinition,
} from '../types/scenario.js';
import {
  interpolatePosition,
  interpolateVelocity,
  isTargetActive,
} from '../targets/target-generator.js';
import { getActiveFaults, isSensorInOutage } from '../faults/fault-manager.js';
import { generateRadarObservation, generateClutterFalseAlarms } from '../sensors/radar/radar-model.js';
import { generateEoBearing } from '../sensors/eo/eo-model.js';
import { generateC4isrObservation } from '../sensors/c4isr-source/c4isr-model.js';

// ── Public interfaces ───────────────────────────────────────────────────────

export interface SimulationEvent {
  type: 'observation' | 'bearing' | 'fault_start' | 'fault_end' | 'operator_action';
  timeSec: number;
  data: unknown;
}

export interface SimulationState {
  currentTimeSec: number;
  events: SimulationEvent[];
  targetPositions: Map<string, Position3D>;
  activeFaults: FaultDefinition[];
  isComplete: boolean;
}

// ── ScenarioRunner ──────────────────────────────────────────────────────────

export class ScenarioRunner {
  private readonly scenario: ScenarioDefinition;
  private currentTimeSec: number;
  private stepCount: number;
  private readonly baseTimestamp: number;
  private readonly rng: (() => number) | undefined;

  // Track which faults/operator-actions have already been emitted
  private readonly emittedFaultStarts = new Set<string>();
  private readonly emittedFaultEnds = new Set<string>();
  private readonly emittedActions = new Set<number>();

  constructor(scenario: ScenarioDefinition) {
    this.scenario = scenario;
    this.currentTimeSec = 0;
    this.stepCount = 0;
    this.baseTimestamp = Date.now();
    // Create seeded PRNG for deterministic replay when seed is provided
    this.rng = scenario.seed !== undefined
      ? createSeededRandom(scenario.seed)
      : undefined;
  }

  /**
   * Advance the simulation by dtSec seconds and return the resulting state.
   */
  step(dtSec: number): SimulationState {
    this.currentTimeSec += dtSec;
    this.stepCount += 1;

    const events: SimulationEvent[] = [];

    // 1. Compute target positions
    // Waypoint times are relative to the target's startTime, so subtract it
    const targetPositions = new Map<string, Position3D>();
    for (const target of this.scenario.targets) {
      if (!isTargetActive(target, this.currentTimeSec)) continue;
      const relativeTime = this.currentTimeSec - target.startTime;
      const pos = interpolatePosition(target.waypoints, relativeTime);
      if (pos) {
        targetPositions.set(target.targetId, pos);
      }
    }

    // 2. Get active faults
    const activeFaults = getActiveFaults(this.scenario.faults, this.currentTimeSec);

    // 3. Emit fault_start / fault_end events
    for (const fault of this.scenario.faults) {
      const faultKey = `${fault.type}:${fault.sensorId}:${fault.startTime}`;

      // Fault start
      if (
        this.currentTimeSec >= fault.startTime &&
        !this.emittedFaultStarts.has(faultKey)
      ) {
        this.emittedFaultStarts.add(faultKey);
        events.push({
          type: 'fault_start',
          timeSec: this.currentTimeSec,
          data: fault,
        });
      }

      // Fault end
      if (
        fault.endTime !== undefined &&
        this.currentTimeSec >= fault.endTime &&
        !this.emittedFaultEnds.has(faultKey)
      ) {
        this.emittedFaultEnds.add(faultKey);
        events.push({
          type: 'fault_end',
          timeSec: this.currentTimeSec,
          data: fault,
        });
      }
    }

    // 4. Generate sensor observations
    for (const sensor of this.scenario.sensors) {
      // Determine if this sensor should report this step (staggered update rates)
      const shouldUpdate = this.shouldSensorUpdate(sensor.type, this.stepCount);
      if (!shouldUpdate) continue;

      const sensorFaults = activeFaults.filter(
        (f) => f.sensorId === sensor.sensorId,
      );

      for (const [tgtId, tgtPos] of targetPositions) {
        const tgtVel = this.getTargetVelocity(tgtId);
        const tgtDef = this.scenario.targets.find((t) => t.targetId === tgtId);

        switch (sensor.type) {
          case 'radar': {
            const obs = generateRadarObservation(
              sensor,
              tgtPos,
              tgtVel,
              this.currentTimeSec,
              this.baseTimestamp,
              sensorFaults,
              tgtId,
              this.rng,
              { rcs: tgtDef?.rcs, classification: tgtDef?.classification, weather: this.scenario.weather },
            );
            if (obs) {
              events.push({
                type: 'observation',
                timeSec: this.currentTimeSec,
                data: obs,
              });
            }
            break;
          }

          case 'eo': {
            const bearing = generateEoBearing(
              sensor,
              tgtPos,
              this.currentTimeSec,
              this.baseTimestamp,
              sensorFaults,
              tgtId,
              this.rng,
              { weather: this.scenario.weather },
            );
            if (bearing) {
              events.push({
                type: 'bearing',
                timeSec: this.currentTimeSec,
                data: bearing,
              });
            }
            break;
          }

          case 'c4isr': {
            const obs = generateC4isrObservation(
              sensor,
              tgtPos,
              tgtVel,
              this.currentTimeSec,
              this.baseTimestamp,
              sensorFaults,
              this.rng,
            );
            if (obs) {
              events.push({
                type: 'observation',
                timeSec: this.currentTimeSec,
                data: obs,
              });
            }
            break;
          }
        }
      }
    }

    // 4b. Generate clutter false alarms for radar sensors
    if (this.scenario.clutterZones && this.scenario.clutterZones.length > 0) {
      for (const sensor of this.scenario.sensors) {
        if (sensor.type !== 'radar') continue;
        const shouldUpdate = this.shouldSensorUpdate('radar', this.stepCount);
        if (!shouldUpdate) continue;
        if (isSensorInOutage(sensor.sensorId, activeFaults)) continue;

        const falseAlarms = generateClutterFalseAlarms(
          sensor,
          this.scenario.clutterZones,
          this.currentTimeSec,
          this.baseTimestamp,
          this.rng,
        );
        for (const fa of falseAlarms) {
          events.push({
            type: 'observation',
            timeSec: this.currentTimeSec,
            data: fa,
          });
        }
      }
    }

    // 5. Emit operator actions at scheduled times
    for (let i = 0; i < this.scenario.operatorActions.length; i++) {
      const action = this.scenario.operatorActions[i];
      if (
        this.currentTimeSec >= action.time &&
        !this.emittedActions.has(i)
      ) {
        this.emittedActions.add(i);
        events.push({
          type: 'operator_action',
          timeSec: this.currentTimeSec,
          data: action,
        });
      }
    }

    return {
      currentTimeSec: this.currentTimeSec,
      events,
      targetPositions,
      activeFaults,
      isComplete: this.isComplete(),
    };
  }

  /**
   * Reset the runner to the beginning.
   */
  reset(): void {
    this.currentTimeSec = 0;
    this.stepCount = 0;
    this.emittedFaultStarts.clear();
    this.emittedFaultEnds.clear();
    this.emittedActions.clear();
  }

  /**
   * Whether the scenario has run past its duration.
   */
  isComplete(): boolean {
    return this.currentTimeSec >= this.scenario.durationSec;
  }

  /**
   * Current simulation time in seconds.
   */
  getCurrentTime(): number {
    return this.currentTimeSec;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Determine whether a sensor should produce an update on this step.
   * Uses modular arithmetic on step count to stagger updates:
   *   - radar: every step (1s)
   *   - eo: every 2-3s → every 2 steps
   *   - c4isr: every 10-15s → every 12 steps
   */
  private shouldSensorUpdate(
    sensorType: string,
    stepCount: number,
  ): boolean {
    switch (sensorType) {
      case 'radar':
        return true;
      case 'eo':
        return stepCount % 2 === 0;
      case 'c4isr':
        return stepCount % 12 === 0;
      default:
        return true;
    }
  }

  /**
   * Look up interpolated velocity for a target at the current time.
   */
  private getTargetVelocity(targetId: string) {
    const target = this.scenario.targets.find((t) => t.targetId === targetId);
    if (!target) return undefined;
    const relativeTime = this.currentTimeSec - target.startTime;
    return interpolateVelocity(target.waypoints, relativeTime);
  }
}
