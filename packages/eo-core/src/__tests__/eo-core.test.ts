import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SensorId, Timestamp, BearingMeasurement } from '@eloc2/domain';
import type {
  BearingReport,
  BearingMeasurementReport,
  SensorTrackReport,
} from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';

import { EoCoreEntity } from '../eo-core.js';
import { BearingAggregator } from '../bearing-aggregator.js';

// ── Helpers ──

function makeBearingReport(
  sensorId: string,
  targets: Array<{
    targetId: string;
    azDeg: number;
    elDeg: number;
    sensorLat: number;
    sensorLon: number;
  }>,
  simTimeSec = 10,
): BearingReport {
  const bearings: BearingMeasurementReport[] = targets.map((t) => ({
    bearing: {
      azimuthDeg: t.azDeg,
      elevationDeg: t.elDeg,
      timestamp: (simTimeSec * 1000) as Timestamp,
      sensorId: sensorId as SensorId,
    } satisfies BearingMeasurement,
    targetId: t.targetId,
    imageQuality: 0.9,
    sensorPosition: { lat: t.sensorLat, lon: t.sensorLon, alt: 50 },
  }));

  return {
    messageType: 'sensor.bearing.report',
    sensorId: sensorId as SensorId,
    timestamp: Date.now() as Timestamp,
    simTimeSec,
    bearings,
    gimbalState: {
      azimuthDeg: 0,
      elevationDeg: 0,
      slewRateDegPerSec: 30,
    },
  };
}

// ── Tests ──

describe('EoCoreEntity', () => {
  let bus: SensorBus;
  let core: EoCoreEntity;

  beforeEach(() => {
    bus = new SensorBus();
    core = new EoCoreEntity(bus);
  });

  it('can be instantiated with bus', () => {
    expect(core).toBeDefined();
    expect(core.getAllTracks()).toEqual([]);
  });

  it('receives bearing reports from sensors via bus subscription', () => {
    const report = makeBearingReport('EO-1', [
      { targetId: 'T1', azDeg: 45, elDeg: 10, sensorLat: 31.5, sensorLon: 34.8 },
    ]);
    bus.publishBearingReport(report);

    // The aggregator should have received the report
    const agg = core.getAggregator();
    expect(agg.getSensorCount()).toBe(1);
  });

  it('single-sensor bearings produce no triangulation (need ≥2)', () => {
    const trackHandler = vi.fn();
    bus.onTrackReport(trackHandler);

    // Only one sensor reports
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 10, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );

    core.tick(10);

    expect(core.getAllTracks()).toEqual([]);
    expect(trackHandler).not.toHaveBeenCalled();
  });

  it('two sensors reporting same target → triangulation produces position', () => {
    // EO-1 at (31.5, 34.8) sees target at azimuth ~45°
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );

    // EO-2 at (31.5, 35.0) sees same target at azimuth ~315° (opposite-ish direction)
    bus.publishBearingReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    core.tick(10);

    const tracks = core.getAllTracks();
    expect(tracks.length).toBeGreaterThanOrEqual(1);
    expect(tracks[0].status).toBe('active');
    expect(tracks[0].position.lat).toBeTypeOf('number');
    expect(tracks[0].position.lon).toBeTypeOf('number');
  });

  it('triangulated position is published as SensorTrackReport', () => {
    const trackHandler = vi.fn();
    bus.onTrackReport(trackHandler);

    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );
    bus.publishBearingReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    core.tick(10);

    expect(trackHandler).toHaveBeenCalled();
    const report: SensorTrackReport = trackHandler.mock.calls[0][0];
    expect(report.messageType).toBe('sensor.track.report');
    expect(report.sensorId).toBe('EO-CORE');
    expect(report.sensorType).toBe('eo');
    expect(report.localTracks.length).toBeGreaterThanOrEqual(1);
  });

  it('CORE track has quality, intersection angle, sensor IDs', () => {
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );
    bus.publishBearingReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    core.tick(10);

    const tracks = core.getAllTracks();
    expect(tracks.length).toBeGreaterThanOrEqual(1);
    const t = tracks[0];
    expect(t.quality).toBeTypeOf('string');
    expect(t.intersectionAngleDeg).toBeTypeOf('number');
    expect(t.sensorIds).toContain('EO-1');
    expect(t.sensorIds).toContain('EO-2');
  });

  it('stale tracks marked after timeout without update', () => {
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );
    bus.publishBearingReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    core.tick(10);
    expect(core.getAllTracks()[0].status).toBe('active');

    // No new bearings — tick far into the future
    core.tick(50);
    const tracks = core.getAllTracks();
    const staleOrDropped = tracks.filter(
      (t) => t.status === 'stale' || t.status === 'dropped',
    );
    expect(staleOrDropped.length).toBeGreaterThanOrEqual(1);
  });

  it('clear() resets bearing buffer between ticks', () => {
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );

    core.tick(10); // This clears the buffer

    // After tick, aggregator should be empty
    expect(core.getAggregator().getSensorCount()).toBe(0);
  });

  it('multiple targets triangulated independently', () => {
    // Two sensors see two different targets
    bus.publishBearingReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
        { targetId: 'T2', azDeg: 90, elDeg: 10, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );
    bus.publishBearingReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
        { targetId: 'T2', azDeg: 270, elDeg: 10, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    core.tick(10);

    const tracks = core.getAllTracks();
    expect(tracks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('BearingAggregator', () => {
  it('groups bearings by targetId for cross-sensor matches', () => {
    const agg = new BearingAggregator();

    agg.ingestReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );
    agg.ingestReport(
      makeBearingReport('EO-2', [
        { targetId: 'T1', azDeg: 315, elDeg: 5, sensorLat: 31.5, sensorLon: 35.0 },
      ]),
    );

    const matches = agg.findCrossSensorMatches();
    expect(matches.length).toBe(1);
    expect(matches[0].targetId).toBe('T1');
    expect(matches[0].bearings.length).toBe(2);
  });

  it('does not return single-sensor groups', () => {
    const agg = new BearingAggregator();

    agg.ingestReport(
      makeBearingReport('EO-1', [
        { targetId: 'T1', azDeg: 45, elDeg: 5, sensorLat: 31.5, sensorLon: 34.8 },
      ]),
    );

    const matches = agg.findCrossSensorMatches();
    expect(matches.length).toBe(0);
  });
});
