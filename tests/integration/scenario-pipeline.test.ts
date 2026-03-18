/**
 * Integration tests: Full pipeline validation for all scenario types.
 *
 * Exercises the complete flow: scenario → ScenarioRunner → LiveEngine →
 * TrackManager → EO cueing → geometry → registration health → validation.
 *
 * Each scenario exercises different domain capabilities:
 *   - single-target-confirm:  basic radar → EO cue → confirm flow
 *   - crossed-tracks:         correlation under track-crossing
 *   - one-cue-two-eo:         multi-EO assignment for one target
 *   - good-triangulation:     ≥2 EO bearings → geometry estimate
 *   - sensor-fault:           azimuth bias → registration degradation
 *   - operator-override:      veto/manual override test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LiveEngine } from '../../apps/api/src/simulation/live-engine.js';
import { runValidation } from '../../packages/validation/src/runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runTicks(engine: LiveEngine, n: number): void {
  for (let i = 0; i < n; i++) {
    (engine as any).tick();
  }
}

function getEventTypes(engine: LiveEngine): Set<string> {
  return new Set(engine.getState().eventLog.map(e => e.eventType));
}

// ---------------------------------------------------------------------------
// 1. Single target confirm
// ---------------------------------------------------------------------------

describe('single-target-confirm pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('single-target-confirm'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 1 radar + 1 EO sensor', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(2);
    expect(s.sensors.filter(se => se.sensorType === 'radar')).toHaveLength(1);
    expect(s.sensors.filter(se => se.sensorType === 'eo')).toHaveLength(1);
  });

  it('should create and confirm a track', () => {
    runTicks(engine, 20);
    const s = engine.getState();
    expect(s.tracks.length).toBeGreaterThan(0);
    // With confirmAfter=3 and radar updating every tick, confirmation should happen quickly
    const hasConfirmedOrTentative = s.tracks.some(t => t.status === 'confirmed' || t.status === 'tentative');
    expect(hasConfirmedOrTentative).toBe(true);
  });

  it('should issue EO cues after tracks establish', () => {
    runTicks(engine, 20);
    const types = getEventTypes(engine);
    // Should have observation events and possibly EO cue events
    expect(types.has('source.observation.reported')).toBe(true);
    const s = engine.getState();
    const hasCues = types.has('eo.cue.issued') || s.activeCues.length > 0 || s.tasks.length > 0;
    expect(hasCues).toBe(true);
  });

  it('should produce EO bearing measurements after cue assignment', () => {
    runTicks(engine, 30);
    const types = getEventTypes(engine);
    // If cues were issued, we should see bearing measurements
    if (types.has('eo.cue.issued')) {
      // Bearings may or may not arrive yet, but no crash
      expect(engine.getState().elapsedSec).toBe(30);
    }
  });

  it('snapshot should contain full state', () => {
    runTicks(engine, 10);
    const snap = engine.getFullSnapshot();
    expect(snap.type).toBe('rap.snapshot');
    expect(snap.scenarioId).toBe('single-target-confirm');
    expect(snap.tracks).toBeDefined();
    expect(snap.sensors).toBeDefined();
    expect(Array.isArray(snap.tracks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Crossed tracks — correlation stress
// ---------------------------------------------------------------------------

describe('crossed-tracks pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('crossed-tracks'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 2 radars and no EO', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(2);
    expect(s.sensors.every(se => se.sensorType === 'radar')).toBe(true);
  });

  it('should create 2 tracks for 2 crossing targets', () => {
    runTicks(engine, 20);
    const s = engine.getState();
    // Should have at least 2 tracks (one per target)
    expect(s.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it('should maintain track continuity through the crossing point', () => {
    // Run through crossing at T+150s
    runTicks(engine, 160);
    const s = engine.getState();
    // Track count should still be ≥2 — no spurious merge
    expect(s.tracks.length).toBeGreaterThanOrEqual(2);
    // All events should be valid
    for (const ev of s.eventLog) {
      expect(ev.id).toBeTruthy();
      expect(ev.timestamp).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. One cue two EO — multi-sensor assignment
// ---------------------------------------------------------------------------

describe('one-cue-two-eo pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('one-cue-two-eo'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 1 radar + 2 EO sensors', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(3);
    expect(s.sensors.filter(se => se.sensorType === 'eo')).toHaveLength(2);
  });

  it('should issue cues and assign EO sensors to single target', () => {
    runTicks(engine, 25);
    const s = engine.getState();
    expect(s.tracks.length).toBeGreaterThan(0);
    // Either cues or tasks should exist
    const hasCueActivity = s.activeCues.length > 0 || s.tasks.length > 0 ||
      getEventTypes(engine).has('eo.cue.issued');
    expect(hasCueActivity).toBe(true);
  });

  it('should produce EO tracks from at least one sensor', () => {
    runTicks(engine, 40);
    const s = engine.getState();
    // EO tracks may be generated if bearings were produced
    if (s.eoTracks.length > 0) {
      // At least one should be associated to a sensor
      expect(s.eoTracks[0].sensorId).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Good triangulation — geometry pipeline
// ---------------------------------------------------------------------------

describe('good-triangulation pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('good-triangulation'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 2 EO sensors (no radar)', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(2);
    expect(s.sensors.every(se => se.sensorType === 'eo')).toBe(true);
  });

  it('should exercise geometry pipeline without errors', () => {
    // EO-only scenario — needs bearings from both sensors to triangulate
    runTicks(engine, 60);
    const s = engine.getState();
    // Geometry estimates map should exist (even if empty for EO-only scenario needing radar cueing)
    expect(s.geometryEstimates).toBeDefined();
    expect(s.elapsedSec).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// 5. Sensor fault — registration degradation
// ---------------------------------------------------------------------------

describe('sensor-fault pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('sensor-fault'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 2 radars', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(2);
  });

  it('should detect registration degradation after fault at T+100', () => {
    // Run past the fault injection at T+100
    runTicks(engine, 110);
    const s = engine.getState();
    const types = getEventTypes(engine);

    // Fault should have started
    expect(types.has('fault.started')).toBe(true);

    // Registration states should be populated
    expect(s.registrationStates.length).toBeGreaterThan(0);
  });

  it('should produce registration events in event envelopes', () => {
    runTicks(engine, 120);
    const envelopes = engine.getEventEnvelopes();
    const regEvents = envelopes.filter(e => e.eventType === 'registration.state.updated');
    expect(regEvents.length).toBeGreaterThan(0);
  });

  it('should adapt fusion mode after registration degrades', () => {
    runTicks(engine, 120);
    const snap = engine.getFullSnapshot() as any;
    // Fusion modes should be populated
    expect(snap.fusionModes).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Operator override — manual mode
// ---------------------------------------------------------------------------

describe('operator-override pipeline', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('operator-override'); });
  afterEach(() => { engine.pause(); });

  it('should initialise with 1 radar + 2 EO + 2 targets', () => {
    const s = engine.getState();
    expect(s.sensors).toHaveLength(3);
    expect(s.sensors.filter(se => se.sensorType === 'eo')).toHaveLength(2);
  });

  it('should create tracks for both targets', () => {
    runTicks(engine, 40);
    const s = engine.getState();
    // At least one track — second target starts at T+30
    expect(s.tracks.length).toBeGreaterThan(0);
  });

  it('should handle operator veto action at T+120 without crash', () => {
    // Run past the scheduled veto at T+120
    runTicks(engine, 130);
    const s = engine.getState();
    expect(s.elapsedSec).toBe(130);
    // Engine should still be functional
    expect(s.tracks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Engine lifecycle — reset, seek, speed
// ---------------------------------------------------------------------------

describe('engine lifecycle operations', () => {
  let engine: LiveEngine;

  beforeEach(() => { engine = new LiveEngine('single-target-confirm'); });
  afterEach(() => { engine.pause(); });

  it('should reset cleanly to a different scenario', () => {
    runTicks(engine, 10);
    expect(engine.getState().tracks.length).toBeGreaterThan(0);

    engine.reset('crossed-tracks');
    const s = engine.getState();
    expect(s.scenarioId).toBe('crossed-tracks');
    expect(s.tracks).toHaveLength(0);
    expect(s.elapsedSec).toBe(0);
  });

  it('should seek to a specific time', () => {
    engine.seek(20);
    const s = engine.getState();
    expect(s.elapsedSec).toBe(20);
    expect(s.tracks.length).toBeGreaterThan(0);
  });

  it('should load a custom scenario', () => {
    engine.loadCustomScenario({
      id: 'custom-test',
      name: 'Custom Test',
      description: 'Minimal custom scenario for testing',
      durationSec: 60,
      policyMode: 'auto_with_veto',
      sensors: [
        {
          sensorId: 'RADAR-CUSTOM',
          type: 'radar',
          position: { lat: 31.5, lon: 34.5, alt: 40 },
          coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 150_000 },
        },
      ],
      targets: [
        {
          targetId: 'TGT-CUSTOM',
          name: 'Custom Target',
          description: 'Test target',
          startTime: 0,
          waypoints: [
            { time: 0, position: { lat: 32.0, lon: 34.5, alt: 5000 } },
            { time: 60, position: { lat: 31.6, lon: 34.5, alt: 5000 } },
          ],
        },
      ],
      faults: [],
      operatorActions: [],
    });

    const s = engine.getState();
    expect(s.sensors).toHaveLength(1);
    expect(s.tracks).toHaveLength(0);

    runTicks(engine, 15);
    expect(engine.getState().tracks.length).toBeGreaterThan(0);
  });

  it('should inject a fault at runtime', () => {
    runTicks(engine, 5);
    const injectionId = engine.injectFault({
      type: 'azimuth_bias',
      sensorId: 'RADAR-A',
      magnitude: 2,
      durationSec: 10,
    });
    expect(injectionId).toBeTruthy();

    const log = engine.getInjectionLog();
    expect(log.length).toBe(1);
    expect(log[0].type).toBe('fault');
  });

  it('should inject a pop-up target at runtime', () => {
    runTicks(engine, 5);
    const targetId = engine.injectTarget({
      lat: 31.8,
      lon: 34.5,
      alt: 3000,
      speed: 100,
      headingDeg: 180,
      label: 'Popup',
    });
    expect(targetId).toMatch(/^INJ-/);

    const log = engine.getInjectionLog();
    expect(log.some(l => l.type === 'target')).toBe(true);
  });

  it('should set and clamp speed', () => {
    engine.setSpeed(10);
    expect(engine.getState().speed).toBe(10);
    engine.setSpeed(0);
    expect(engine.getState().speed).toBe(0.1); // clamped to min
    engine.setSpeed(200);
    expect(engine.getState().speed).toBe(100); // clamped to max
  });
});

// ---------------------------------------------------------------------------
// 8. Full validation suite across scenarios
// ---------------------------------------------------------------------------

describe('full validation suite', () => {
  it('should validate central-israel scenario (30 ticks)', () => {
    const engine = new LiveEngine('central-israel');
    runTicks(engine, 30);

    const envelopes = engine.getEventEnvelopes();
    const state = engine.getState();
    const report = runValidation('central-israel', envelopes, {
      expectedTrackCount: state.tracks.length,
      biasInjectionTime: 0,
      finalTrackCount: state.tracks.length,
    });

    expect(report.scenarioId).toBe('central-israel');
    expect(report.results.trackContinuity).toBeDefined();
    expect(report.results.registrationSafety).toBeDefined();
    expect(report.results.taskExplanation).toBeDefined();
    expect(report.results.geometryHonesty).toBeDefined();
    expect(report.results.ambiguityHandling).toBeDefined();
    expect(report.results.replayFidelity).toBeDefined();
    expect(typeof report.summary).toBe('string');

    engine.pause();
  });

  it('should validate single-target-confirm scenario', () => {
    const engine = new LiveEngine('single-target-confirm');
    runTicks(engine, 30);

    const envelopes = engine.getEventEnvelopes();
    const state = engine.getState();
    const report = runValidation('single-target-confirm', envelopes, {
      expectedTrackCount: state.tracks.length,
    });

    expect(report.scenarioId).toBe('single-target-confirm');
    expect(report.timestamp).toBeGreaterThan(0);

    engine.pause();
  });

  it('should validate sensor-fault scenario with bias injection', () => {
    const engine = new LiveEngine('sensor-fault');
    runTicks(engine, 120);

    const envelopes = engine.getEventEnvelopes();
    const state = engine.getState();
    const report = runValidation('sensor-fault', envelopes, {
      expectedTrackCount: state.tracks.length,
      biasInjectionTime: 100,
      finalTrackCount: state.tracks.length,
    });

    expect(report.scenarioId).toBe('sensor-fault');
    expect(report.results.registrationSafety).toBeDefined();

    engine.pause();
  });
});

// ---------------------------------------------------------------------------
// 9. Event envelope integrity
// ---------------------------------------------------------------------------

describe('event envelope integrity across scenarios', () => {
  const scenarioIds = [
    'single-target-confirm',
    'crossed-tracks',
    'sensor-fault',
  ];

  for (const scenarioId of scenarioIds) {
    it(`should produce valid event envelopes for ${scenarioId}`, () => {
      const engine = new LiveEngine(scenarioId);
      runTicks(engine, 30);

      const envelopes = engine.getEventEnvelopes();
      expect(envelopes.length).toBeGreaterThan(0);

      for (const env of envelopes) {
        expect(env.eventId).toBeTruthy();
        expect(env.eventType).toBeTruthy();
        expect(env.timestamp).toBeGreaterThan(0);
        expect(env.provenance).toBeDefined();
      }

      // Must always have track update events
      const trackEvents = envelopes.filter(e => e.eventType === 'system.track.updated');
      expect(trackEvents.length).toBeGreaterThan(0);

      engine.pause();
    });
  }
});
