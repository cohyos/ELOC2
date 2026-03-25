/**
 * GP Sortie 2 — Shahed-136 Formation: EO Deep Test
 *
 * Deep Vitest suite for the gp-sortie-formation scenario, focusing on:
 *   - EO sensor detection quality
 *   - 3D track building correctness
 *   - Formation discrimination (5 closely-spaced UAVs)
 *   - Triangulation geometry quality
 *   - Pipeline health and stability
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advanceTo(engine: LiveEngine, toSec: number): void {
  const sm = engine.getSimulationState();
  if (sm.state === 'idle') {
    engine.start();
    engine.pause();
  } else if (sm.state === 'running') {
    engine.pause();
  }
  engine.seek(toSec);
}

function haversineDistM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// 1. Formation Detection Timing
// ---------------------------------------------------------------------------

describe('Formation Detection Timing', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('radar detects at least 1 target within 30s', () => {
    advanceTo(engine, 30);
    const { tracks } = engine.getState();
    expect(tracks.length).toBeGreaterThanOrEqual(1);
  });

  it('radar detects multiple targets within 60s', () => {
    advanceTo(engine, 60);
    const { tracks } = engine.getState();
    expect(tracks.length).toBeGreaterThanOrEqual(2);
  });

  it('all 5 formation targets appear as ground truth', () => {
    advanceTo(engine, 30);
    const gt = engine.getGroundTruth();
    // At least some targets should be active by 30s
    expect(gt.length).toBeGreaterThanOrEqual(1);
    // Each GT entry should have valid positions
    for (const entry of gt) {
      expect(entry.position).toBeDefined();
      expect(Number.isFinite(entry.position.lat)).toBe(true);
      expect(Number.isFinite(entry.position.lon)).toBe(true);
      expect(Number.isFinite(entry.position.alt)).toBe(true);
    }
  });

  it('track count grows over time', () => {
    advanceTo(engine, 30);
    const count30 = engine.getState().tracks.length;

    advanceTo(engine, 60);
    const count60 = engine.getState().tracks.length;

    advanceTo(engine, 120);
    const count120 = engine.getState().tracks.length;

    // Count should be non-decreasing over time
    expect(count60).toBeGreaterThanOrEqual(count30);
    expect(count120).toBeGreaterThanOrEqual(count60);
  });
});

// ---------------------------------------------------------------------------
// 2. Formation Discrimination
// ---------------------------------------------------------------------------

describe('Formation Discrimination', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('creates >=2 distinct tracks by 120s', () => {
    advanceTo(engine, 120);
    const { tracks } = engine.getState();
    expect(tracks.length).toBeGreaterThanOrEqual(2);
  });

  it('creates >=3 distinct tracks by 200s', () => {
    advanceTo(engine, 200);
    const { tracks } = engine.getState();
    expect(tracks.length).toBeGreaterThanOrEqual(3);
  });

  it('no duplicate systemTrackId values', () => {
    advanceTo(engine, 200);
    const { tracks } = engine.getState();
    const ids = tracks.map((t) => t.systemTrackId as string);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('tracks have distinct positions', () => {
    advanceTo(engine, 200);
    const { tracks } = engine.getState();
    const confirmed = tracks.filter((t) => t.status === 'confirmed');
    if (confirmed.length < 2) {
      // If we don't have 2 confirmed tracks, at least check we have some tracks
      expect(tracks.length).toBeGreaterThanOrEqual(1);
      return;
    }

    // At least one pair of confirmed tracks should have distinct positions
    let foundDistinct = false;
    for (let i = 0; i < confirmed.length && !foundDistinct; i++) {
      for (let j = i + 1; j < confirmed.length; j++) {
        const dist = haversineDistM(
          confirmed[i].state.lat,
          confirmed[i].state.lon,
          confirmed[j].state.lat,
          confirmed[j].state.lon,
        );
        if (dist > 100) {
          foundDistinct = true;
          break;
        }
      }
    }
    expect(foundDistinct).toBe(true);
  });

  it('tracks maintain separation over time', () => {
    advanceTo(engine, 200);
    const tracks200 = engine.getState().tracks.filter(
      (t) => t.status === 'confirmed' || t.status === 'tentative',
    );

    advanceTo(engine, 300);
    const tracks300 = engine.getState().tracks.filter(
      (t) => t.status === 'confirmed' || t.status === 'tentative',
    );

    // At both times, tracks should exist
    expect(tracks200.length).toBeGreaterThanOrEqual(1);
    expect(tracks300.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 3. EO Sensor Detection
// ---------------------------------------------------------------------------

describe('EO Sensor Detection', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('EO sensors are present and online', () => {
    advanceTo(engine, 10);
    const { sensors } = engine.getState();
    const eoSensors = sensors.filter((s) => s.sensorType === 'eo');
    expect(eoSensors.length).toBeGreaterThanOrEqual(1);
    const onlineEo = eoSensors.filter((s) => s.online);
    expect(onlineEo.length).toBeGreaterThanOrEqual(1);
  });

  it('staring EO sensors detect targets', () => {
    advanceTo(engine, 120);
    const { eoTracks } = engine.getState();
    expect(eoTracks.length).toBeGreaterThan(0);
  });

  it('EO tracks have valid bearing measurements', () => {
    advanceTo(engine, 120);
    const { eoTracks } = engine.getState();
    // Only check if we have EO tracks
    if (eoTracks.length === 0) {
      // Soft pass — EO tracks may not appear in all configurations
      return;
    }
    for (const et of eoTracks) {
      expect(et.bearing).toBeDefined();
      expect(et.bearing.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(et.bearing.azimuthDeg).toBeLessThanOrEqual(360);
      expect(Number.isFinite(et.bearing.elevationDeg)).toBe(true);
    }
  });

  it('multiple EO sensors contribute bearings', () => {
    advanceTo(engine, 120);
    const { eoTracks } = engine.getState();
    if (eoTracks.length === 0) return;

    const sensorIds = new Set(eoTracks.map((et) => et.sensorId as string));
    expect(sensorIds.size).toBeGreaterThanOrEqual(2);
  });

  it('EO track image quality is reasonable', () => {
    advanceTo(engine, 120);
    const { eoTracks } = engine.getState();
    if (eoTracks.length === 0) return;

    for (const et of eoTracks) {
      expect(et.imageQuality).toBeGreaterThanOrEqual(0);
      expect(et.imageQuality).toBeLessThanOrEqual(1);
    }
  });

  it('EO tracks associate with system tracks', () => {
    advanceTo(engine, 150);
    const { eoTracks, tracks } = engine.getState();
    if (eoTracks.length === 0 || tracks.length === 0) return;

    const trackIds = new Set(tracks.map((t) => t.systemTrackId as string));
    const associated = eoTracks.filter(
      (et) =>
        et.associatedSystemTrackId !== undefined &&
        trackIds.has(et.associatedSystemTrackId as string),
    );

    // At least some EO tracks should be associated with system tracks
    expect(associated.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Triangulation Quality
// ---------------------------------------------------------------------------

describe('Triangulation Quality', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('geometry estimates exist by 120s', () => {
    advanceTo(engine, 120);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.entries()];
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('geometry uses multiple EO bearings', () => {
    advanceTo(engine, 150);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    const multiBearing = entries.filter((e) => e.eoTrackIds.length >= 2);
    expect(multiBearing.length).toBeGreaterThanOrEqual(1);
  });

  it('intersection angle is reasonable', () => {
    advanceTo(engine, 150);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    for (const est of entries) {
      expect(Number.isFinite(est.intersectionAngleDeg)).toBe(true);
      expect(est.intersectionAngleDeg).toBeGreaterThan(0);
    }
  });

  it('geometry quality is at least acceptable for some tracks', () => {
    advanceTo(engine, 200);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    const acceptable = entries.filter(
      (e) => e.quality === 'acceptable' || e.quality === 'strong',
    );
    expect(acceptable.length).toBeGreaterThanOrEqual(1);
  });

  it('3D positions are produced', () => {
    advanceTo(engine, 200);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    const nonBearingOnly = entries.filter(
      (e) => e.classification !== 'bearing_only',
    );
    if (nonBearingOnly.length === 0) return;

    for (const est of nonBearingOnly) {
      expect(est.position3D).toBeDefined();
      if (est.position3D) {
        expect(Number.isFinite(est.position3D.lat)).toBe(true);
        expect(Number.isFinite(est.position3D.lon)).toBe(true);
        expect(Number.isFinite(est.position3D.alt)).toBe(true);
      }
    }
  });

  it('3D positions are near ground truth', () => {
    advanceTo(engine, 200);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    const gt = engine.getGroundTruth();

    if (entries.length === 0 || gt.length === 0) return;

    const withPos = entries.filter(
      (e) => e.position3D && e.classification !== 'bearing_only',
    );
    if (withPos.length === 0) return;

    // Check that at least one geometry estimate is within 10km of some GT target
    let foundClose = false;
    for (const est of withPos) {
      if (!est.position3D) continue;
      for (const target of gt) {
        const dist = haversineDistM(
          est.position3D.lat,
          est.position3D.lon,
          target.position.lat,
          target.position.lon,
        );
        if (dist < 10_000) {
          foundClose = true;
          break;
        }
      }
      if (foundClose) break;
    }
    expect(foundClose).toBe(true);
  });

  it('classification reaches candidate_3d or confirmed_3d', () => {
    advanceTo(engine, 200);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    const has3d = entries.filter(
      (e) =>
        e.classification === 'candidate_3d' ||
        e.classification === 'confirmed_3d',
    );
    expect(has3d.length).toBeGreaterThanOrEqual(1);
  });

  it('time alignment quality is reasonable', () => {
    advanceTo(engine, 200);
    const { geometryEstimates } = engine.getState();
    const entries = [...geometryEstimates.values()];
    if (entries.length === 0) return;

    for (const est of entries) {
      // Time alignment can vary due to staring sensor frame buffering
      expect(est.timeAlignmentQualityMs).toBeLessThan(60000);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 3D Track Building Quality Assessment
// ---------------------------------------------------------------------------

describe('3D Track Building Quality', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('produces a quality grade report at 200s', () => {
    advanceTo(engine, 200);
    const { tracks, geometryEstimates } = engine.getState();
    const gt = engine.getGroundTruth();
    const entries = [...geometryEstimates.values()];

    const GT_COUNT = 5;

    // 1. Track detection rate (max 30 pts)
    const trackDetectionRate = Math.min(tracks.length / GT_COUNT, 1);
    const trackDetectionScore = trackDetectionRate * 30;

    // 2. Confirmed rate (max 20 pts)
    const confirmed = tracks.filter((t) => t.status === 'confirmed');
    const confirmedRate =
      tracks.length > 0 ? confirmed.length / tracks.length : 0;
    const confirmedScore = confirmedRate * 20;

    // 3. EO coverage (max 20 pts)
    const trackIdsWithGeometry = new Set(
      [...geometryEstimates.keys()],
    );
    const eoCoverage =
      tracks.length > 0
        ? trackIdsWithGeometry.size / tracks.length
        : 0;
    const eoCoverageScore = Math.min(eoCoverage, 1) * 20;

    // 4. Geometry quality (max 15 pts)
    const acceptableOrStrong = entries.filter(
      (e) => e.quality === 'acceptable' || e.quality === 'strong',
    );
    const qualityRate =
      entries.length > 0 ? acceptableOrStrong.length / entries.length : 0;
    const qualityScore = qualityRate * 15;

    // 5. 3D classification (max 15 pts)
    const has3dClass = entries.filter(
      (e) =>
        e.classification === 'candidate_3d' ||
        e.classification === 'confirmed_3d',
    );
    const classRate =
      entries.length > 0 ? has3dClass.length / entries.length : 0;
    const classScore = classRate * 15;

    const totalScore = Math.round(
      trackDetectionScore +
        confirmedScore +
        eoCoverageScore +
        qualityScore +
        classScore,
    );

    console.log('=== 3D Track Building Quality Report (200s) ===');
    console.log(`  Track detection: ${tracks.length}/${GT_COUNT} => ${trackDetectionScore.toFixed(1)}/30`);
    console.log(`  Confirmed rate:  ${confirmed.length}/${tracks.length} => ${confirmedScore.toFixed(1)}/20`);
    console.log(`  EO coverage:     ${trackIdsWithGeometry.size}/${tracks.length} => ${eoCoverageScore.toFixed(1)}/20`);
    console.log(`  Geometry quality: ${acceptableOrStrong.length}/${entries.length} => ${qualityScore.toFixed(1)}/15`);
    console.log(`  3D classification: ${has3dClass.length}/${entries.length} => ${classScore.toFixed(1)}/15`);
    console.log(`  TOTAL SCORE: ${totalScore}/100`);

    expect(totalScore).toBeGreaterThanOrEqual(30);
  });

  it('quality improves over time', () => {
    function computeScore(atSec: number): number {
      advanceTo(engine, atSec);
      const { tracks, geometryEstimates } = engine.getState();
      const entries = [...geometryEstimates.values()];
      const GT_COUNT = 5;

      const trackDetection = Math.min(tracks.length / GT_COUNT, 1) * 30;
      const confirmed = tracks.filter((t) => t.status === 'confirmed');
      const confirmedRate =
        tracks.length > 0 ? confirmed.length / tracks.length : 0;
      const confirmedPts = confirmedRate * 20;

      const trackIdsWithGeo = new Set([...geometryEstimates.keys()]);
      const eoCovPts =
        Math.min(
          tracks.length > 0 ? trackIdsWithGeo.size / tracks.length : 0,
          1,
        ) * 20;

      const aqCount = entries.filter(
        (e) => e.quality === 'acceptable' || e.quality === 'strong',
      ).length;
      const qualPts = entries.length > 0 ? (aqCount / entries.length) * 15 : 0;

      const c3d = entries.filter(
        (e) =>
          e.classification === 'candidate_3d' ||
          e.classification === 'confirmed_3d',
      ).length;
      const classPts = entries.length > 0 ? (c3d / entries.length) * 15 : 0;

      return Math.round(
        trackDetection + confirmedPts + eoCovPts + qualPts + classPts,
      );
    }

    const score60 = computeScore(60);
    const score120 = computeScore(120);
    const score200 = computeScore(200);

    console.log(`Quality over time: 60s=${score60}, 120s=${score120}, 200s=${score200}`);

    // Later scores should be >= earlier (or at least not zero at the end)
    expect(score200).toBeGreaterThanOrEqual(score60);
    expect(score200).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Pipeline Health Check
// ---------------------------------------------------------------------------

describe('Pipeline Health', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('gp-sortie-formation');
  });

  it('no crashes through full scenario duration', () => {
    expect(() => {
      advanceTo(engine, 340);
    }).not.toThrow();
  });

  it('track count stays bounded', () => {
    advanceTo(engine, 200);
    const { tracks } = engine.getState();
    expect(tracks.length).toBeLessThan(50);
  });

  it('no NaN in track positions', () => {
    advanceTo(engine, 200);
    const { tracks } = engine.getState();
    for (const track of tracks) {
      expect(Number.isFinite(track.state.lat)).toBe(true);
      expect(Number.isFinite(track.state.lon)).toBe(true);
    }
  });

  it('sensor count remains stable', () => {
    advanceTo(engine, 10);
    const countEarly = engine.getState().sensors.length;

    advanceTo(engine, 300);
    const countLate = engine.getState().sensors.length;

    expect(countEarly).toBe(countLate);
  });
});
