import { describe, it, expect } from 'vitest';
import { ScenarioRunner } from '../src/engine/scenario-runner.js';
import type { ScenarioDefinition } from '../src/types/scenario.js';

function makeScenario(overrides?: Partial<ScenarioDefinition>): ScenarioDefinition {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    description: 'A minimal scenario for testing',
    durationSec: 60,
    policyMode: 'autonomous',
    sensors: [
      {
        sensorId: 'radar-1',
        type: 'radar',
        position: { lat: 34.0, lon: -118.0, alt: 0 },
        coverage: {
          minAzDeg: 0,
          maxAzDeg: 360,
          minElDeg: -5,
          maxElDeg: 90,
          maxRangeM: 200_000,
        },
      },
      {
        sensorId: 'eo-1',
        type: 'eo',
        position: { lat: 34.0, lon: -118.0, alt: 0 },
        coverage: {
          minAzDeg: 0,
          maxAzDeg: 360,
          minElDeg: -5,
          maxElDeg: 90,
          maxRangeM: 100_000,
        },
      },
    ],
    targets: [
      {
        targetId: 'tgt-1',
        name: 'Target One',
        description: 'Moving target',
        startTime: 0,
        waypoints: [
          { time: 0, position: { lat: 34.05, lon: -117.95, alt: 5000 } },
          { time: 30, position: { lat: 34.1, lon: -117.9, alt: 6000 } },
          { time: 60, position: { lat: 34.15, lon: -117.85, alt: 7000 } },
        ],
      },
    ],
    faults: [],
    operatorActions: [],
    ...overrides,
  };
}

describe('ScenarioRunner', () => {
  it('starts at time 0', () => {
    const runner = new ScenarioRunner(makeScenario());
    expect(runner.getCurrentTime()).toBe(0);
    expect(runner.isComplete()).toBe(false);
  });

  it('advances time on step', () => {
    const runner = new ScenarioRunner(makeScenario());
    const state = runner.step(1);
    expect(state.currentTimeSec).toBe(1);
    expect(runner.getCurrentTime()).toBe(1);
  });

  it('reports target positions', () => {
    const runner = new ScenarioRunner(makeScenario());
    const state = runner.step(10);
    expect(state.targetPositions.size).toBe(1);
    const pos = state.targetPositions.get('tgt-1');
    expect(pos).toBeDefined();
    // Position should be interpolated between first and second waypoint
    expect(pos!.lat).toBeGreaterThan(34.05);
    expect(pos!.lat).toBeLessThan(34.1);
  });

  it('generates sensor events over multiple steps', () => {
    const runner = new ScenarioRunner(makeScenario());
    const allEvents: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      const state = runner.step(1);
      allEvents.push(...state.events);
    }
    // Should have generated some observations and/or bearings
    expect(allEvents.length).toBeGreaterThan(0);
  });

  it('marks scenario as complete when past duration', () => {
    const runner = new ScenarioRunner(makeScenario({ durationSec: 10 }));
    runner.step(5);
    expect(runner.isComplete()).toBe(false);
    runner.step(6);
    expect(runner.isComplete()).toBe(true);
  });

  it('resets correctly', () => {
    const runner = new ScenarioRunner(makeScenario());
    runner.step(10);
    expect(runner.getCurrentTime()).toBe(10);
    runner.reset();
    expect(runner.getCurrentTime()).toBe(0);
    expect(runner.isComplete()).toBe(false);
  });

  it('emits fault_start events', () => {
    const scenario = makeScenario({
      faults: [
        {
          type: 'azimuth_bias',
          sensorId: 'radar-1',
          startTime: 5,
          magnitude: 3,
        },
      ],
    });
    const runner = new ScenarioRunner(scenario);

    // Step past fault start
    let faultEvents: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      const state = runner.step(1);
      faultEvents.push(
        ...state.events.filter((e) => e.type === 'fault_start'),
      );
    }
    expect(faultEvents.length).toBe(1);
  });

  it('emits fault_end events', () => {
    const scenario = makeScenario({
      faults: [
        {
          type: 'sensor_outage',
          sensorId: 'radar-1',
          startTime: 2,
          endTime: 5,
        },
      ],
    });
    const runner = new ScenarioRunner(scenario);

    let faultEndEvents: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      const state = runner.step(1);
      faultEndEvents.push(
        ...state.events.filter((e) => e.type === 'fault_end'),
      );
    }
    expect(faultEndEvents.length).toBe(1);
  });

  it('emits operator actions at scheduled time', () => {
    const scenario = makeScenario({
      operatorActions: [
        {
          type: 'reserve_sensor',
          time: 3,
          sensorId: 'radar-1',
        },
      ],
    });
    const runner = new ScenarioRunner(scenario);

    let actionEvents: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      const state = runner.step(1);
      actionEvents.push(
        ...state.events.filter((e) => e.type === 'operator_action'),
      );
    }
    expect(actionEvents.length).toBe(1);
  });

  it('does not duplicate fault or action events after reset', () => {
    const scenario = makeScenario({
      faults: [
        { type: 'azimuth_bias', sensorId: 'radar-1', startTime: 2, magnitude: 1 },
      ],
      operatorActions: [
        { type: 'reserve_sensor', time: 3, sensorId: 'radar-1' },
      ],
    });
    const runner = new ScenarioRunner(scenario);

    // First run
    for (let i = 0; i < 10; i++) runner.step(1);

    // Reset and run again
    runner.reset();
    let faultStarts = 0;
    let actions = 0;
    for (let i = 0; i < 10; i++) {
      const state = runner.step(1);
      faultStarts += state.events.filter((e) => e.type === 'fault_start').length;
      actions += state.events.filter((e) => e.type === 'operator_action').length;
    }
    expect(faultStarts).toBe(1);
    expect(actions).toBe(1);
  });

  it('reports activeFaults in state', () => {
    const scenario = makeScenario({
      faults: [
        { type: 'sensor_outage', sensorId: 'radar-1', startTime: 3, endTime: 7 },
      ],
    });
    const runner = new ScenarioRunner(scenario);

    runner.step(2);
    let state = runner.step(2); // time=4, fault active
    expect(state.activeFaults.length).toBe(1);

    runner.step(4); // time=8, fault ended
    state = runner.step(1); // time=9
    expect(state.activeFaults.length).toBe(0);
  });

  it('returns isComplete in state', () => {
    const runner = new ScenarioRunner(makeScenario({ durationSec: 5 }));
    const s1 = runner.step(3);
    expect(s1.isComplete).toBe(false);
    const s2 = runner.step(3);
    expect(s2.isComplete).toBe(true);
  });
});
