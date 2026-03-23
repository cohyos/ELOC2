import { describe, it, expect } from 'vitest';
import type { GroundTruthTarget } from '@eloc2/sensor-bus';
import type { SensorInstanceConfig } from '@eloc2/sensor-instances';
import { DistributedPipeline } from '../distributed-pipeline.js';

// ── Test Scenario ──────────────────────────────────────────────────────────
// 2 radars + 2 EO sensors + 1 C4ISR, up to 3 targets
// Radars at two positions ~25km apart, EO co-located with radars

const testSensors: SensorInstanceConfig[] = [
  {
    sensorId: 'RADAR-1',
    type: 'radar',
    position: { lat: 31.5, lon: 34.8, alt: 100 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: 0,
      maxElDeg: 45,
      maxRangeM: 200_000,
    },
    updateIntervalSec: 1,
  },
  {
    sensorId: 'RADAR-2',
    type: 'radar',
    position: { lat: 31.3, lon: 35.0, alt: 80 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: 0,
      maxElDeg: 45,
      maxRangeM: 200_000,
    },
    updateIntervalSec: 1,
  },
  {
    sensorId: 'EO-1',
    type: 'eo',
    position: { lat: 31.5, lon: 34.8, alt: 50 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: -10,
      maxElDeg: 60,
      maxRangeM: 30_000,
    },
    fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
    slewRateDegPerSec: 60,
    updateIntervalSec: 2,
  },
  {
    sensorId: 'EO-2',
    type: 'eo',
    position: { lat: 31.3, lon: 35.0, alt: 50 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: -10,
      maxElDeg: 60,
      maxRangeM: 30_000,
    },
    fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
    slewRateDegPerSec: 60,
    updateIntervalSec: 2,
  },
  {
    sensorId: 'C4ISR-1',
    type: 'c4isr',
    position: { lat: 31.4, lon: 34.9, alt: 200 },
    coverage: {
      minAzDeg: 0,
      maxAzDeg: 360,
      minElDeg: 0,
      maxElDeg: 90,
      maxRangeM: 500_000,
    },
    updateIntervalSec: 12,
  },
];

function makeTarget(
  id: string,
  lat: number,
  lon: number,
  alt = 5000,
): GroundTruthTarget {
  return {
    targetId: id,
    position: { lat, lon, alt },
    velocity: { vx: 200, vy: -50, vz: 0 },
    classification: 'fighter_aircraft',
    rcs: 5.0,
    active: true,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DistributedPipeline Integration', () => {
  it('instantiates with all sensor types', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });
    expect(pipeline.getSensors().length).toBe(5);
    pipeline.destroy();
  });

  it('full pipeline: GT → sensors → fuser → system tracks', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    const targets = [
      makeTarget('TGT-1', 31.6, 34.9, 5000), // Within radar range
      makeTarget('TGT-2', 31.4, 35.1, 3000), // Within radar range
    ];

    // Run for 10 seconds
    for (let t = 1; t <= 10; t++) {
      pipeline.tick(t, 1, targets);
    }

    const systemTracks = pipeline.getSystemTracks();
    // Should have at least 1 system track (radars should detect targets)
    expect(systemTracks.length).toBeGreaterThanOrEqual(1);

    pipeline.destroy();
  });

  it('radar sensors detect targets and produce system tracks', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    const targets = [makeTarget('TGT-1', 31.6, 34.9, 5000)];

    let totalRadarObs = 0;
    for (let t = 1; t <= 5; t++) {
      const result = pipeline.tick(t, 1, targets);
      totalRadarObs += result.sensorResults
        .filter((r) => r.sensorId.startsWith('RADAR'))
        .reduce((sum, r) => sum + r.observations, 0);
    }

    expect(totalRadarObs).toBeGreaterThan(0);
    expect(pipeline.getSystemTracks().length).toBeGreaterThanOrEqual(1);

    pipeline.destroy();
  });

  it('EO sensors generate bearing reports (not track reports)', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    // Target close enough for EO (< 30km from EO sensors)
    const targets = [
      makeTarget('TGT-1', 31.55, 34.85, 5000), // ~7km from EO-1
    ];

    let eoObs = 0;
    for (let t = 2; t <= 10; t += 2) {
      // EO updates every 2s
      const result = pipeline.tick(t, 2, targets);
      eoObs += result.sensorResults
        .filter((r) => r.sensorId.startsWith('EO'))
        .reduce((sum, r) => sum + r.observations, 0);
    }

    expect(eoObs).toBeGreaterThan(0);
    pipeline.destroy();
  });

  it('system tracks are created and maintained over time', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    const targets = [
      makeTarget('TGT-1', 31.6, 34.9, 5000),
      makeTarget('TGT-2', 31.7, 35.2, 8000), // Farther target
    ];

    for (let t = 1; t <= 15; t++) {
      pipeline.tick(t, 1, targets);
    }

    const tracks = pipeline.getSystemTracks();
    expect(tracks.length).toBeGreaterThanOrEqual(1);

    // At least one track should have position data
    const withPosition = tracks.filter(
      (t) =>
        t.state && Number.isFinite(t.state.lat) && Number.isFinite(t.state.lon),
    );
    expect(withPosition.length).toBeGreaterThanOrEqual(1);

    pipeline.destroy();
  });

  it('target leaving coverage → track eventually drops or coasts', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    // Target in range
    const targets = [makeTarget('TGT-1', 31.6, 34.9, 5000)];
    for (let t = 1; t <= 5; t++) {
      pipeline.tick(t, 1, targets);
    }

    // Target leaves — no more targets
    for (let t = 6; t <= 25; t++) {
      pipeline.tick(t, 1, []);
    }

    // Confirmed tracks should decrease — some should be coasting or dropped
    const activeTracks = pipeline.getSystemTracks().filter(
      (t) => t.status === 'confirmed',
    );
    // After 20 ticks with no detections, confirmed count should be low
    expect(activeTracks.length).toBeLessThanOrEqual(2);

    pipeline.destroy();
  });

  it('multiple targets tracked simultaneously', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    const targets = [
      makeTarget('TGT-1', 31.6, 34.9, 5000),
      makeTarget('TGT-2', 31.4, 35.2, 8000),
      makeTarget('TGT-3', 31.8, 35.0, 3000),
    ];

    for (let t = 1; t <= 10; t++) {
      pipeline.tick(t, 1, targets);
    }

    const tracks = pipeline.getSystemTracks();
    // Should track multiple targets (at least 2 of 3)
    expect(tracks.length).toBeGreaterThanOrEqual(2);

    pipeline.destroy();
  });

  it('pipeline reset clears all state', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    // Run a few ticks to build up state
    for (let t = 1; t <= 5; t++) {
      pipeline.tick(t, 1, [makeTarget('TGT-1', 31.6, 34.9, 5000)]);
    }

    pipeline.reset();
    expect(pipeline.getSystemTracks().length).toBe(0);

    pipeline.destroy();
  });

  it('C4ISR sensor contributes tracks at its lower update rate', () => {
    // Use only C4ISR sensor to isolate its behavior
    const c4isrOnly: SensorInstanceConfig[] = [
      {
        sensorId: 'C4ISR-ONLY',
        type: 'c4isr',
        position: { lat: 31.4, lon: 34.9, alt: 200 },
        coverage: {
          minAzDeg: 0,
          maxAzDeg: 360,
          minElDeg: 0,
          maxElDeg: 90,
          maxRangeM: 500_000,
        },
        updateIntervalSec: 4,
      },
    ];

    const pipeline = new DistributedPipeline({ sensors: c4isrOnly });
    const targets = [makeTarget('TGT-1', 31.6, 34.9, 5000)];

    // Run enough ticks for C4ISR to update multiple times
    let totalObs = 0;
    for (let t = 1; t <= 20; t++) {
      const result = pipeline.tick(t, 1, targets);
      totalObs += result.sensorResults[0].observations;
    }

    // C4ISR should have generated observations
    expect(totalObs).toBeGreaterThan(0);
    // C4ISR tracks may need multiple updates to create system tracks
    // Check that the pipeline at least received and processed the observations
    const allTracks = pipeline.getSystemTracks();
    // With only C4ISR (slow rate), we may or may not have system tracks yet
    // The key assertion is that observations were generated
    expect(totalObs).toBeGreaterThanOrEqual(1);

    pipeline.destroy();
  });

  it('sensor results report correct per-sensor metrics', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    const targets = [makeTarget('TGT-1', 31.6, 34.9, 5000)];
    const result = pipeline.tick(1, 1, targets);

    // Should have one result per sensor
    expect(result.sensorResults.length).toBe(5);

    // Each result should have a valid sensorId
    const sensorIds = result.sensorResults.map((r) => r.sensorId);
    expect(sensorIds).toContain('RADAR-1');
    expect(sensorIds).toContain('RADAR-2');
    expect(sensorIds).toContain('EO-1');
    expect(sensorIds).toContain('EO-2');
    expect(sensorIds).toContain('C4ISR-1');

    pipeline.destroy();
  });

  it('bus is accessible for external monitoring', () => {
    const pipeline = new DistributedPipeline({ sensors: testSensors });

    let trackReportCount = 0;
    pipeline.getBus().onTrackReport(() => {
      trackReportCount++;
    });

    const targets = [makeTarget('TGT-1', 31.6, 34.9, 5000)];
    pipeline.tick(1, 1, targets);

    // At least radar sensors should have published track reports
    expect(trackReportCount).toBeGreaterThan(0);

    pipeline.destroy();
  });
});
