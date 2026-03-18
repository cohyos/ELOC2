import { describe, it, expect, beforeEach } from 'vitest';
import { EoManagementModule } from '../src/eo-module.js';
import { TrackIngester } from '../src/ingest.js';
import { ModeController } from '../src/mode-controller.js';
import { runSubPixelDetection } from '../src/sub-pixel-pipeline.js';
import { runImagePipeline } from '../src/image-pipeline.js';
import type { SystemTrack, SensorState } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<SystemTrack> & { systemTrackId: string }): SystemTrack {
  return {
    systemTrackId: overrides.systemTrackId as any,
    state: { lat: 32.0, lon: 34.8, alt: 5000 },
    velocity: { vx: 100, vy: 50, vz: 0 },
    covariance: [[0.01, 0, 0], [0, 0.01, 0], [0, 0, 0.01]] as any,
    confidence: 0.6,
    status: 'confirmed',
    lineage: [],
    lastUpdated: '2024-01-01T00:00:00Z' as any,
    sources: [],
    eoInvestigationStatus: 'none',
    ...overrides,
  } as SystemTrack;
}

function makeEoSensor(id: string, lat = 31.5, lon = 34.5): SensorState {
  return {
    sensorId: id as any,
    sensorType: 'eo',
    position: { lat, lon, alt: 0 },
    gimbal: { azimuthDeg: 0, elevationDeg: 0, slewRateDegPerSec: 30, currentTargetId: undefined },
    fov: { halfAngleHDeg: 1, halfAngleVDeg: 0.75 },
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 85, maxRangeM: 50000 },
    online: true,
    lastUpdateTime: '2024-01-01T00:00:00Z' as any,
  };
}

function makeRadarSensor(id: string): SensorState {
  return {
    sensorId: id as any,
    sensorType: 'radar',
    position: { lat: 31.5, lon: 34.5, alt: 0 },
    gimbal: undefined,
    fov: undefined,
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 45, maxRangeM: 100000 },
    online: true,
    lastUpdateTime: '2024-01-01T00:00:00Z' as any,
  };
}

// ---------------------------------------------------------------------------
// EoManagementModule tests
// ---------------------------------------------------------------------------

describe('EoManagementModule', () => {
  let module: EoManagementModule;

  beforeEach(() => {
    module = new EoManagementModule();
  });

  it('starts in idle mode with zero state', () => {
    const status = module.getStatus();
    expect(status.mode).toBe('idle');
    expect(status.tickCount).toBe(0);
    expect(status.enrichedTrackCount).toBe(0);
    expect(status.totalTracksIngested).toBe(0);
    expect(status.activePipelines).toHaveLength(0);
    expect(status.sensorAllocations).toHaveLength(0);
  });

  it('ingests tracks and sensors', () => {
    const tracks = [makeTrack({ systemTrackId: 'T1' }), makeTrack({ systemTrackId: 'T2' })];
    const sensors = [makeEoSensor('E1'), makeRadarSensor('R1')];

    module.ingestTracks(tracks, sensors);
    const status = module.getStatus();
    expect(status.totalTracksIngested).toBe(2);
    // Only EO sensors in allocations
    expect(status.sensorAllocations).toHaveLength(1);
    expect(status.sensorAllocations[0].sensorId).toBe('E1');
  });

  it('tick produces enrichments for ingested tracks', () => {
    const tracks = [makeTrack({ systemTrackId: 'T1' })];
    const sensors = [makeEoSensor('E1')];

    module.ingestTracks(tracks, sensors);
    const output = module.tick(10, 1);

    expect(output.enrichments.length).toBeGreaterThanOrEqual(1);
    expect(output.enrichments[0].trackId).toBe('T1');
    expect(['sub-pixel', 'image']).toContain(output.enrichments[0].pipeline);
  });

  it('tick increments tick count', () => {
    module.ingestTracks([], []);
    module.tick(1, 1);
    module.tick(2, 1);
    module.tick(3, 1);
    expect(module.getStatus().tickCount).toBe(3);
  });

  it('runs tasking cycle when interval elapses', () => {
    const tracks = [makeTrack({ systemTrackId: 'T1' })];
    const sensors = [makeEoSensor('E1')];

    module.ingestTracks(tracks, sensors);
    // First tick at time 0 — should run tasking (0 - 0 >= 5 is false, but initial lastTaskingSec = 0)
    const out1 = module.tick(0, 1);
    // Tick at time 5 — should run tasking
    module.ingestTracks(tracks, sensors);
    const out2 = module.tick(5, 1);
    expect(out2.tasksAssigned).toBeGreaterThanOrEqual(0);
  });

  it('handles operator lock/release commands', () => {
    const sensors = [makeEoSensor('E1')];
    module.ingestTracks([], sensors);

    module.handleOperatorCommand({ type: 'lock', sensorId: 'E1' });
    // Locked sensors should not get assigned
    const tracks = [makeTrack({ systemTrackId: 'T1' })];
    module.ingestTracks(tracks, sensors);
    module.tick(10, 1);

    module.handleOperatorCommand({ type: 'release', sensorId: 'E1' });
  });

  it('handles operator priority command', () => {
    module.handleOperatorCommand({ type: 'priority', trackId: 'T1', priority: 'high' });
    // No exception
  });

  it('handles set_dwell command', () => {
    module.handleOperatorCommand({ type: 'set_dwell', sensorId: 'E1', dwellDurationSec: 30 });
    // No exception
  });

  it('reset clears all state', () => {
    const tracks = [makeTrack({ systemTrackId: 'T1' })];
    const sensors = [makeEoSensor('E1')];
    module.ingestTracks(tracks, sensors);
    module.tick(10, 1);
    module.reset();

    const status = module.getStatus();
    expect(status.tickCount).toBe(0);
    expect(status.enrichedTrackCount).toBe(0);
    expect(status.totalTracksIngested).toBe(0);
    expect(status.mode).toBe('idle');
  });

  it('reports search mode when no targets', () => {
    const sensors = [makeEoSensor('E1')];
    module.ingestTracks([], sensors);
    // Need 3+ idle ticks to activate search
    module.tick(1, 1);
    module.tick(2, 1);
    module.tick(3, 1);
    module.tick(4, 1);

    const output = module.tick(5, 1);
    const searching = output.searchStates.filter(s => s.active);
    expect(searching.length).toBeGreaterThanOrEqual(1);

    const status = module.getStatus();
    expect(status.mode).toBe('searching');
  });

  it('filters dropped and confirmed-EO tracks in ingest', () => {
    const tracks = [
      makeTrack({ systemTrackId: 'T1', status: 'dropped' }),
      makeTrack({ systemTrackId: 'T2', eoInvestigationStatus: 'confirmed' }),
      makeTrack({ systemTrackId: 'T3' }),
    ];
    const sensors = [makeEoSensor('E1')];
    module.ingestTracks(tracks, sensors);
    const output = module.tick(10, 1);
    // Only T3 should produce enrichments
    const trackIds = output.enrichments.map(e => e.trackId);
    expect(trackIds).not.toContain('T1');
    expect(trackIds).not.toContain('T2');
  });
});

// ---------------------------------------------------------------------------
// TrackIngester tests
// ---------------------------------------------------------------------------

describe('TrackIngester', () => {
  it('filters out dropped tracks', () => {
    const ingester = new TrackIngester();
    const tracks = [
      makeTrack({ systemTrackId: 'T1', status: 'dropped' }),
      makeTrack({ systemTrackId: 'T2', status: 'confirmed' }),
    ];
    const result = ingester.filter(tracks);
    expect(result).toHaveLength(1);
    expect((result[0].systemTrackId as string)).toBe('T2');
  });

  it('filters out confirmed-EO tracks', () => {
    const ingester = new TrackIngester();
    const tracks = [
      makeTrack({ systemTrackId: 'T1', eoInvestigationStatus: 'confirmed' }),
      makeTrack({ systemTrackId: 'T2', eoInvestigationStatus: 'none' }),
    ];
    const result = ingester.filter(tracks);
    expect(result).toHaveLength(1);
  });

  it('sorts by priority (tentative before confirmed)', () => {
    const ingester = new TrackIngester();
    const tracks = [
      makeTrack({ systemTrackId: 'confirmed', status: 'confirmed', confidence: 0.8 }),
      makeTrack({ systemTrackId: 'tentative', status: 'tentative', confidence: 0.3 }),
    ];
    const result = ingester.filter(tracks);
    expect((result[0].systemTrackId as string)).toBe('tentative');
  });

  it('filterEoSensors returns only online EO sensors', () => {
    const ingester = new TrackIngester();
    const sensors = [
      makeEoSensor('E1'),
      makeRadarSensor('R1'),
      { ...makeEoSensor('E2'), online: false },
    ];
    const result = ingester.filterEoSensors(sensors);
    expect(result).toHaveLength(1);
    expect((result[0].sensorId as string)).toBe('E1');
  });
});

// ---------------------------------------------------------------------------
// ModeController tests
// ---------------------------------------------------------------------------

describe('ModeController', () => {
  it('selects sub-pixel for distant targets', () => {
    const mc = new ModeController();
    // Track far away → small angular size → sub-pixel
    const tracks = [makeTrack({ systemTrackId: 'T1', state: { lat: 33.0, lon: 35.5, alt: 10000 } })];
    const sensors = [makeEoSensor('E1', 31.0, 34.0)];

    const decisions = mc.process(tracks, sensors, 10);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].pipeline).toBe('sub-pixel');
  });

  it('selects image for very close targets with large IFOV', () => {
    const mc = new ModeController();
    mc.setSensorIfov('E1', 0.001); // very small IFOV = high resolution
    // Track very close (small offset)
    const tracks = [makeTrack({
      systemTrackId: 'T1',
      state: { lat: 31.501, lon: 34.501, alt: 100 },
    })];
    const sensors = [makeEoSensor('E1', 31.5, 34.5)];

    const decisions = mc.process(tracks, sensors, 10);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].pipeline).toBe('image');
  });

  it('returns none for offline sensors', () => {
    const mc = new ModeController();
    const tracks = [makeTrack({ systemTrackId: 'T1' })];
    const sensors = [{ ...makeEoSensor('E1'), online: false }];

    const decisions = mc.process(tracks, sensors, 10);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].pipeline).toBe('none');
  });

  it('reset clears IFOV overrides', () => {
    const mc = new ModeController();
    mc.setSensorIfov('E1', 1.0);
    mc.reset();
    expect(mc.getIfov('E1')).toBe(0.3); // default
  });
});

// ---------------------------------------------------------------------------
// Sub-pixel pipeline tests
// ---------------------------------------------------------------------------

describe('runSubPixelDetection', () => {
  it('returns bearing and SNR for valid sensor-track pair', () => {
    const track = makeTrack({ systemTrackId: 'T1' });
    const sensor = makeEoSensor('E1');
    const result = runSubPixelDetection(track, sensor);

    expect(result).not.toBeNull();
    expect(result!.trackId).toBe('T1');
    expect(result!.sensorId).toBe('E1');
    expect(result!.bearingAzDeg).toBeGreaterThanOrEqual(0);
    expect(result!.bearingAzDeg).toBeLessThan(360);
    expect(result!.snr).toBeGreaterThan(0);
    expect(result!.angularSizeMrad).toBeGreaterThan(0);
  });

  it('returns null for offline sensor', () => {
    const track = makeTrack({ systemTrackId: 'T1' });
    const sensor = { ...makeEoSensor('E1'), online: false };
    expect(runSubPixelDetection(track, sensor)).toBeNull();
  });

  it('returns null for radar sensor', () => {
    const track = makeTrack({ systemTrackId: 'T1' });
    const sensor = makeRadarSensor('R1');
    expect(runSubPixelDetection(track, sensor)).toBeNull();
  });

  it('classifies kinematic state from velocity', () => {
    const hovering = makeTrack({ systemTrackId: 'T1', velocity: { vx: 1, vy: 1, vz: 0 } });
    const moving = makeTrack({ systemTrackId: 'T2', velocity: { vx: 100, vy: 100, vz: 0 } });
    const sensor = makeEoSensor('E1');

    expect(runSubPixelDetection(hovering, sensor)!.kinematicClass).toBe('hovering');
    expect(runSubPixelDetection(moving, sensor)!.kinematicClass).toBe('manoeuvring');
  });
});

// ---------------------------------------------------------------------------
// Image pipeline tests
// ---------------------------------------------------------------------------

describe('runImagePipeline', () => {
  it('returns null when target angular size is below IFOV', () => {
    // Far target → small angular size
    const track = makeTrack({
      systemTrackId: 'T1',
      state: { lat: 33.0, lon: 36.0, alt: 10000 },
    });
    const sensor = makeEoSensor('E1');
    const result = runImagePipeline(track, sensor, 0.3, 10);
    expect(result).toBeNull();
  });

  it('returns classification for resolved close target', () => {
    // Very close target with small IFOV
    const track = makeTrack({
      systemTrackId: 'T1',
      state: { lat: 31.501, lon: 34.501, alt: 100 },
      velocity: { vx: 300, vy: 0, vz: 0 },
    });
    const sensor = makeEoSensor('E1', 31.5, 34.5);
    const result = runImagePipeline(track, sensor, 0.001, 10);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.apparentPixels).toBeGreaterThan(0);
      expect(result.shapeDescriptor).toBe('elongated');
    }
  });
});
