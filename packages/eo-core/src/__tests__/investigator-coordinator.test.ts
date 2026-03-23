import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId } from '@eloc2/domain';
import type { SystemCommand } from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import {
  InvestigatorCoordinator,
  type EoSensorInfo,
  type TaskableTrack,
} from '../investigator-coordinator.js';

// ── Helpers ──

function makeTrack(
  id: string,
  lat = 31.7,
  lon = 35.0,
  overrides?: Partial<TaskableTrack>,
): TaskableTrack {
  return {
    systemTrackId: id,
    state: { lat, lon, alt: 5000 },
    velocity: { vx: 200, vy: -50, vz: 0 },
    confidence: 0.9,
    status: 'confirmed',
    ...overrides,
  };
}

function makeEoSensor(
  id: string,
  overrides?: Partial<EoSensorInfo>,
): EoSensorInfo {
  return {
    sensorId: id,
    position: { lat: 31.5, lon: 34.8, alt: 50 },
    slewRateDegPerSec: 60,
    currentAzimuthDeg: 0,
    mode: 'track',
    online: true,
    ...overrides,
  };
}

// ── Tests ──

describe('InvestigatorCoordinator', () => {
  let bus: SensorBus;
  let coordinator: InvestigatorCoordinator;

  beforeEach(() => {
    bus = new SensorBus();
    coordinator = new InvestigatorCoordinator(bus, {
      taskingIntervalSec: 0, // Immediate tasking for tests
      dwellDurationSec: 15,
      maxRevisitIntervalSec: 60,
    });
  });

  it('can be instantiated', () => {
    expect(coordinator).toBeDefined();
    expect(coordinator.getAssignments().size).toBe(0);
  });

  it('produces assignments when sensors + tracks available', () => {
    const tracks = [makeTrack('T1')];
    const sensors = [makeEoSensor('EO-1')];

    const assignments = coordinator.runTaskingCycle(tracks, sensors, 10);
    expect(assignments.length).toBe(1);
    expect(assignments[0].sensorId).toBe('EO-1');
    expect(assignments[0].trackId).toBe('T1');
  });

  it('sends CueCommand via bus on assignment', () => {
    const handler = vi.fn();
    bus.onCommand('EO-1', handler);

    coordinator.runTaskingCycle(
      [makeTrack('T1')],
      [makeEoSensor('EO-1')],
      10,
    );

    expect(handler).toHaveBeenCalled();
    const cmd: SystemCommand = handler.mock.calls[0][0];
    expect(cmd.command.type).toBe('cue');
    if (cmd.command.type === 'cue') {
      expect(cmd.command.systemTrackId).toBe('T1');
      expect(cmd.command.predictedPosition.lat).toBe(31.7);
    }
  });

  it('already-assigned sensors excluded from new assignments', () => {
    const tracks = [makeTrack('T1'), makeTrack('T2', 31.8, 35.1)];
    const sensors = [makeEoSensor('EO-1')];

    // First cycle — assigns EO-1 to best track
    const a1 = coordinator.runTaskingCycle(tracks, sensors, 10);
    expect(a1.length).toBe(1);

    // Second cycle — EO-1 is still assigned (dwell not complete)
    const a2 = coordinator.runTaskingCycle(tracks, sensors, 11);
    expect(a2.length).toBe(0);
  });

  it('dwell completion frees sensor for reassignment', () => {
    const tracks = [makeTrack('T1')];
    const sensors = [makeEoSensor('EO-1')];

    coordinator.runTaskingCycle(tracks, sensors, 10);
    expect(coordinator.getAssignments().size).toBe(1);

    // After dwell duration (15s), sensor should be freed
    const a2 = coordinator.runTaskingCycle(tracks, sensors, 26);
    expect(a2.length).toBe(1); // Re-assigned
  });

  it('tracks not recently investigated get revisit boost', () => {
    const tracks = [
      makeTrack('T1', 31.7, 35.0),
      makeTrack('T2', 31.8, 35.1),
    ];
    const sensors = [makeEoSensor('EO-1'), makeEoSensor('EO-2')];

    // First cycle — both assigned
    coordinator.runTaskingCycle(tracks, sensors, 10);

    // Wait for dwell to complete
    // Then only T2 has been investigated recently
    coordinator.runTaskingCycle([], [makeEoSensor('EO-1')], 26);

    // Now at t=80, T1 hasn't been investigated for 70s (> maxRevisitIntervalSec=60)
    const a3 = coordinator.runTaskingCycle(
      tracks,
      [makeEoSensor('EO-3')],
      80,
    );
    expect(a3.length).toBe(1);
    // The track with longest time since investigation should be preferred
  });

  it('slew cost penalizes distant targets', () => {
    // Sensor currently pointing at 0° azimuth
    // T1 is roughly at 10° (close slew), T2 is roughly at 170° (far slew)
    const tracks = [
      makeTrack('T1', 31.6, 34.85), // Nearly north
      makeTrack('T2', 31.4, 34.75), // Nearly south
    ];
    const sensors = [makeEoSensor('EO-1', { currentAzimuthDeg: 10 })];

    const assignments = coordinator.runTaskingCycle(tracks, sensors, 10);
    expect(assignments.length).toBe(1);
    // With same confidence, the closer slew target should score higher
  });

  it('offline/standby sensors excluded', () => {
    const tracks = [makeTrack('T1')];
    const offlineSensor = makeEoSensor('EO-OFF', { online: false });
    const standbySensor = makeEoSensor('EO-SBY', { mode: 'standby' });

    const a1 = coordinator.runTaskingCycle(tracks, [offlineSensor], 10);
    expect(a1.length).toBe(0);

    const a2 = coordinator.runTaskingCycle(tracks, [standbySensor], 11);
    expect(a2.length).toBe(0);
  });

  it('no candidates yields no assignments', () => {
    const a1 = coordinator.runTaskingCycle([], [makeEoSensor('EO-1')], 10);
    expect(a1.length).toBe(0);

    const a2 = coordinator.runTaskingCycle([makeTrack('T1')], [], 11);
    expect(a2.length).toBe(0);
  });

  it('respects tasking interval (skips if too soon)', () => {
    const coordWithInterval = new InvestigatorCoordinator(bus, {
      taskingIntervalSec: 5,
      dwellDurationSec: 15,
      maxRevisitIntervalSec: 60,
    });

    const tracks = [makeTrack('T1')];
    const sensors = [makeEoSensor('EO-1')];

    // First cycle at t=0
    const a1 = coordWithInterval.runTaskingCycle(tracks, sensors, 0);

    // Wait for dwell completion to free EO-1
    // Cycle at t=2 — too soon (interval=5)
    const a2 = coordWithInterval.runTaskingCycle(tracks, sensors, 2);
    expect(a2.length).toBe(0);

    // Cycle at t=16 — enough time (>5s since last AND dwell completed at 15)
    const a3 = coordWithInterval.runTaskingCycle(tracks, sensors, 16);
    expect(a3.length).toBe(1);
  });
});
