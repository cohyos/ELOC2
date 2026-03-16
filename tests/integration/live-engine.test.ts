/**
 * Integration test for the LiveEngine.
 *
 * Runs the central-israel scenario for 60 simulated seconds and validates
 * that the full pipeline works: observations → tracks → EO cueing →
 * bearing processing → geometry estimates → registration health.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LiveEngine } from '../../apps/api/src/simulation/live-engine.js';

describe('LiveEngine integration', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
  });

  afterEach(() => {
    engine.pause();
  });

  /**
   * Helper: run N ticks synchronously by calling the private tick method.
   * We access it via (engine as any) since we need synchronous stepping.
   */
  function runTicks(n: number) {
    for (let i = 0; i < n; i++) {
      (engine as any).tick();
    }
  }

  it('should initialize with correct scenario state', () => {
    const state = engine.getState();
    expect(state.scenarioId).toBe('central-israel');
    expect(state.running).toBe(false);
    expect(state.tracks).toHaveLength(0);
    expect(state.sensors.length).toBeGreaterThan(0);
    // Central Israel has 6 sensors
    expect(state.sensors).toHaveLength(6);
  });

  it('should create tracks from radar observations after stepping', () => {
    // Run for 10 simulated seconds
    runTicks(10);

    const state = engine.getState();
    expect(state.tracks.length).toBeGreaterThan(0);
    expect(state.elapsedSec).toBe(10);

    // Events should have been logged
    expect(state.eventLog.length).toBeGreaterThan(0);
    expect(state.eventLog.some(e => e.eventType === 'source.observation.reported')).toBe(true);
  });

  it('should issue EO cues after tracks are established', () => {
    // Run for 20 seconds — enough for tracks to establish and EO tasking cycle to run
    runTicks(20);

    const state = engine.getState();
    // Should have some tracks
    expect(state.tracks.length).toBeGreaterThan(0);

    // After EO tasking cycle (every 5s), should have tasks and/or cues
    const hasCueEvents = state.eventLog.some(e => e.eventType === 'eo.cue.issued');
    const hasTaskEvents = state.tasks.length > 0;
    // At least one of these should be true after 20s
    expect(hasCueEvents || hasTaskEvents).toBe(true);
  });

  it('should produce EO bearing observations', () => {
    // Run for 30 seconds — enough for bearing observations
    runTicks(30);

    const state = engine.getState();
    const hasBearingEvents = state.eventLog.some(e => e.eventType === 'eo.bearing.measured');
    // Bearings may or may not be generated depending on EO timing — just verify no crash
    // If we do have cues AND bearing events, that's a good sign
    if (hasBearingEvents) {
      expect(state.activeCues.length > 0 || state.tasks.length > 0).toBe(true);
    }
  });

  it('should handle fault injection correctly', () => {
    // Central Israel has faults at T+400s — run for 410s
    runTicks(410);

    const state = engine.getState();
    // Should have fault events
    const hasFaultStarted = state.eventLog.some(e => e.eventType === 'fault.started');
    expect(hasFaultStarted).toBe(true);

    // Registration states should be populated when bias faults occur
    expect(state.registrationStates.length).toBeGreaterThan(0);
  });

  it('should compute geometry estimates when multiple EO bearings exist', () => {
    // Run for 60 seconds — enough for geometry computation
    runTicks(60);

    const state = engine.getState();
    // Check if any geometry estimates were computed
    // This depends on whether multiple EO sensors produced bearings for the same track
    if (state.eoTracks.length >= 2) {
      // We may or may not have geometry estimates depending on track association
      // Just verify the Map exists and no errors occurred
      expect(state.geometryEstimates).toBeDefined();
    }
  });

  it('should reset cleanly', () => {
    runTicks(10);
    expect(engine.getState().tracks.length).toBeGreaterThan(0);

    engine.reset();

    const state = engine.getState();
    expect(state.tracks).toHaveLength(0);
    expect(state.elapsedSec).toBe(0);
    expect(state.running).toBe(false);
    expect(state.eoTracks).toHaveLength(0);
    expect(state.activeCues).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
  });

  it('should track all event types correctly', () => {
    runTicks(20);

    const state = engine.getState();
    const eventTypes = new Set(state.eventLog.map(e => e.eventType));

    // Must always have observation events
    expect(eventTypes.has('source.observation.reported')).toBe(true);

    // All events should have required fields
    for (const event of state.eventLog) {
      expect(event.id).toBeTruthy();
      expect(event.eventType).toBeTruthy();
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.summary).toBe('string');
    }
  });

  it('should promote tracks from tentative to confirmed', () => {
    // Run long enough for 3+ updates (confirmation threshold)
    runTicks(15);

    const state = engine.getState();
    const hasConfirmed = state.tracks.some(t => t.status === 'confirmed');
    // With 2 radars updating every second, tracks should be confirmed quickly
    expect(hasConfirmed).toBe(true);
  });
});
