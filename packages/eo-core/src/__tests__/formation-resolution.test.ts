/**
 * Formation Resolution Performance Test
 *
 * Tests the EO core's ability to distinguish individual members of a tight
 * formation (~300m spacing) — the key advantage of staring EO over radar.
 *
 * Simulates 5 formation members (V-formation at 300-500m spacing) observed
 * by multiple staring EO sensors arranged in a pentagon (~20km baselines).
 * Runs multiple ticks and measures:
 *   - Number of distinct EO tracks created (target: 5 for 5 members)
 *   - Track-to-target assignment accuracy
 *   - Track oscillation (position jitter from target-swapping)
 *   - Time to resolve all formation members
 *   - Intersection angles per member
 *   - Confidence convergence per track
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SensorId, Timestamp, BearingMeasurement } from '@eloc2/domain';
import type { BearingReport, BearingMeasurementReport } from '@eloc2/sensor-bus';
import { SensorBus } from '@eloc2/sensor-bus';
import { haversineDistanceM, bearingDeg } from '@eloc2/shared-utils';

import { EoCoreEntity } from '../eo-core.js';
import type { EoCoreTrack, EoCoreConfig } from '../types.js';

// ── Formation geometry ────────────────────────────────────────────────────

const CENTER_LAT = 31.375;
const CENTER_LON = 34.80;

/** 5 formation members in V-formation, ~300m spacing, heading south at 50m/s */
const FORMATION_MEMBERS = [
  { id: 'TGT-F1', lat: 31.375, lon: 34.800, alt: 500, label: 'Lead' },
  { id: 'TGT-F2', lat: 31.3742, lon: 34.797, alt: 500, label: 'Left Wing' },    // ~300m left
  { id: 'TGT-F3', lat: 31.3742, lon: 34.803, alt: 500, label: 'Right Wing' },   // ~300m right
  { id: 'TGT-F4', lat: 31.3735, lon: 34.795, alt: 500, label: 'Left Trail' },   // ~500m behind-left
  { id: 'TGT-F5', lat: 31.3735, lon: 34.805, alt: 500, label: 'Right Trail' },  // ~500m behind-right
];

/** Pentagon EO sensor stations (~20km from center, ~24km baselines) */
const CLUSTER_RADIUS_DEG = 0.18;
const PENTAGON_ANGLES = [90, 162, 234, 306, 378];
const SENSOR_STATIONS = PENTAGON_ANGLES.map((angleDeg, i) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    id: `STARE-${['N', 'NW', 'SW', 'SE', 'NE'][i]}`,
    lat: CENTER_LAT + CLUSTER_RADIUS_DEG * Math.sin(rad),
    lon: CENTER_LON + (CLUSTER_RADIUS_DEG * Math.cos(rad)) / Math.cos(CENTER_LAT * Math.PI / 180),
    alt: 20,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Compute true bearing from sensor to target + add noise */
function computeBearing(
  sensorLat: number, sensorLon: number, sensorAlt: number,
  targetLat: number, targetLon: number, targetAlt: number,
  noiseDeg = 0.1,
): BearingMeasurement {
  const azDeg = bearingDeg(sensorLat, sensorLon, targetLat, targetLon);
  const rangeM = haversineDistanceM(sensorLat, sensorLon, targetLat, targetLon);
  const dAlt = targetAlt - sensorAlt;
  const elDeg = Math.atan2(dAlt, rangeM) * (180 / Math.PI);

  return {
    azimuthDeg: azDeg + (Math.random() - 0.5) * noiseDeg,
    elevationDeg: elDeg + (Math.random() - 0.5) * noiseDeg * 0.5,
    timestamp: Date.now() as Timestamp,
    sensorId: '' as SensorId, // filled by caller
  };
}

/** Emit bearing reports for all sensors seeing all formation members */
function emitFormationBearings(
  bus: SensorBus,
  simTimeSec: number,
  formationPositions: Array<{ id: string; lat: number; lon: number; alt: number }>,
  sensors: Array<{ id: string; lat: number; lon: number; alt: number }>,
  noiseDeg = 0.1,
): void {
  for (const sensor of sensors) {
    const bearings: BearingMeasurementReport[] = [];

    for (const target of formationPositions) {
      const rangeM = haversineDistanceM(sensor.lat, sensor.lon, target.lat, target.lon);
      if (rangeM > 55_000) continue; // max detection range

      const bearing = computeBearing(
        sensor.lat, sensor.lon, sensor.alt,
        target.lat, target.lon, target.alt,
        noiseDeg,
      );
      bearing.sensorId = sensor.id as SensorId;

      bearings.push({
        bearing,
        targetId: target.id,
        imageQuality: 0.9,
        sensorPosition: { lat: sensor.lat, lon: sensor.lon, alt: sensor.alt },
      });
    }

    if (bearings.length > 0) {
      const report: BearingReport = {
        messageType: 'sensor.bearing.report',
        sensorId: sensor.id as SensorId,
        timestamp: Date.now() as Timestamp,
        simTimeSec,
        bearings,
        gimbalState: {
          azimuthDeg: 0,
          elevationDeg: 0,
          slewRateDegPerSec: 0,
        },
      };
      bus.publishBearingReport(report);
    }
  }
}

/** Move formation south by velocity * dt */
function advanceFormation(
  members: Array<{ id: string; lat: number; lon: number; alt: number }>,
  dtSec: number,
  velocityMps = 50,
): Array<{ id: string; lat: number; lon: number; alt: number }> {
  const dLat = -(velocityMps * dtSec) / 111_320; // south
  return members.map((m) => ({
    ...m,
    lat: m.lat + dLat,
  }));
}

/** Find which formation member is closest to an EO track */
function closestMember(
  track: EoCoreTrack,
  members: Array<{ id: string; lat: number; lon: number; alt: number }>,
): { id: string; distM: number } {
  let bestId = '';
  let bestDist = Infinity;
  for (const m of members) {
    const d = haversineDistanceM(track.position.lat, track.position.lon, m.lat, m.lon);
    if (d < bestDist) {
      bestDist = d;
      bestId = m.id;
    }
  }
  return { id: bestId, distM: bestDist };
}

/** Simulate radar position-based merge: cluster targets within mergeGateM */
function simulateRadarMerge(
  members: Array<{ id: string; lat: number; lon: number; alt: number }>,
  mergeGateM: number,
): number {
  // Simple greedy clustering: merge any pair within gate distance
  const clusters: Array<Array<typeof members[0]>> = [];
  const assigned = new Set<string>();

  for (const m of members) {
    if (assigned.has(m.id)) continue;
    const cluster = [m];
    assigned.add(m.id);

    for (const other of members) {
      if (assigned.has(other.id)) continue;
      // Check if close to any cluster member
      const closeToCluster = cluster.some(
        (c) => haversineDistanceM(c.lat, c.lon, other.lat, other.lon) < mergeGateM,
      );
      if (closeToCluster) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(cluster);
  }
  return clusters.length;
}

// ── Test result types ─────────────────────────────────────────────────────

interface FormationTestResult {
  iteration: string;
  config: Partial<EoCoreConfig>;
  ticks: number;
  distinctTracks: number;
  targetResolution: number; // 0-1: fraction of formation members with unique track
  avgPositionErrorM: number;
  maxPositionErrorM: number;
  trackOscillationCount: number; // times a track's closest member changed
  timeToFullResolutionSec: number; // sim time when all 5 were first resolved
  intersectionAngles: number[];
  avgConfidence: number;
  grade: string;
  score: number;
}

// ── Grading ───────────────────────────────────────────────────────────────

function gradeFormationResult(r: FormationTestResult): { grade: string; score: number } {
  let score = 0;

  // Resolution: 5/5 = 50pts, 4/5 = 35pts, 3/5 = 20pts, etc.
  score += Math.min(50, r.distinctTracks * 10);

  // Position accuracy: < 200m = 20pts, < 500m = 15pts, < 1000m = 10pts
  if (r.avgPositionErrorM < 200) score += 20;
  else if (r.avgPositionErrorM < 500) score += 15;
  else if (r.avgPositionErrorM < 1000) score += 10;
  else if (r.avgPositionErrorM < 2000) score += 5;

  // No oscillation: 15pts, low = 10pts
  if (r.trackOscillationCount === 0) score += 15;
  else if (r.trackOscillationCount <= 2) score += 10;
  else if (r.trackOscillationCount <= 5) score += 5;

  // Resolution speed: < 10s = 15pts, < 30s = 10pts, < 60s = 5pts
  if (r.timeToFullResolutionSec < 10) score += 15;
  else if (r.timeToFullResolutionSec < 30) score += 10;
  else if (r.timeToFullResolutionSec < 60) score += 5;

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { grade, score };
}

// ── Main test suite ───────────────────────────────────────────────────────

describe('EO Core Formation Resolution', () => {
  const TOTAL_TICKS = 60;
  const DT_SEC = 1; // 1-second ticks

  function runFormationTest(
    config: Partial<EoCoreConfig>,
    label: string,
  ): FormationTestResult {
    const bus = new SensorBus();
    const core = new EoCoreEntity(bus, config);

    let currentFormation = [...FORMATION_MEMBERS];
    const trackHistory: Array<{
      tick: number;
      tracks: EoCoreTrack[];
      memberAssignment: Map<string, string>; // trackId -> closest memberId
    }> = [];

    let timeToFullResolution = TOTAL_TICKS;
    let oscillationCount = 0;
    const allIntersectionAngles: number[] = [];

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const simTime = tick * DT_SEC;

      // Emit bearings from all sensors
      emitFormationBearings(bus, simTime, currentFormation, SENSOR_STATIONS, 0.1);

      // Process
      core.tick(simTime);

      // Analyze tracks
      const tracks = core.getActiveTracks();
      const memberAssignment = new Map<string, string>();
      for (const t of tracks) {
        const closest = closestMember(t, currentFormation);
        memberAssignment.set(t.trackId, closest.id);
        allIntersectionAngles.push(t.intersectionAngleDeg);
      }

      // Check for distinct member coverage
      const uniqueMembers = new Set(memberAssignment.values());
      if (uniqueMembers.size >= 5 && timeToFullResolution === TOTAL_TICKS) {
        timeToFullResolution = simTime;
      }

      // Check for oscillation (track switching closest member)
      if (trackHistory.length > 0) {
        const prev = trackHistory[trackHistory.length - 1];
        for (const [trackId, memberId] of memberAssignment) {
          const prevMember = prev.memberAssignment.get(trackId);
          if (prevMember && prevMember !== memberId) {
            oscillationCount++;
          }
        }
      }

      trackHistory.push({ tick, tracks: [...tracks], memberAssignment });

      // Advance formation south
      currentFormation = advanceFormation(currentFormation, DT_SEC);
    }

    // Final analysis
    const finalTracks = core.getActiveTracks();
    const finalMembers = new Set<string>();
    const positionErrors: number[] = [];

    for (const t of finalTracks) {
      const closest = closestMember(t, currentFormation);
      finalMembers.add(closest.id);
      positionErrors.push(closest.distM);
    }

    const avgError = positionErrors.length > 0
      ? positionErrors.reduce((a, b) => a + b, 0) / positionErrors.length
      : Infinity;
    const maxError = positionErrors.length > 0 ? Math.max(...positionErrors) : Infinity;
    const avgConfidence = finalTracks.length > 0
      ? finalTracks.reduce((a, t) => a + t.confidence, 0) / finalTracks.length
      : 0;

    const result: FormationTestResult = {
      iteration: label,
      config,
      ticks: TOTAL_TICKS,
      distinctTracks: finalMembers.size,
      targetResolution: finalMembers.size / 5,
      avgPositionErrorM: avgError,
      maxPositionErrorM: maxError,
      trackOscillationCount: oscillationCount,
      timeToFullResolutionSec: timeToFullResolution,
      intersectionAngles: allIntersectionAngles.slice(-10),
      avgConfidence,
      grade: '',
      score: 0,
    };

    const { grade, score } = gradeFormationResult(result);
    result.grade = grade;
    result.score = score;

    return result;
  }

  it('baseline: measure current formation resolution with default config', () => {
    const result = runFormationTest({}, 'Baseline (500m gate)');

    console.log('\n=== FORMATION RESOLUTION TEST: BASELINE ===');
    console.log(`Distinct tracks: ${result.distinctTracks}/5`);
    console.log(`Target resolution: ${(result.targetResolution * 100).toFixed(0)}%`);
    console.log(`Avg position error: ${result.avgPositionErrorM.toFixed(0)}m`);
    console.log(`Max position error: ${result.maxPositionErrorM.toFixed(0)}m`);
    console.log(`Track oscillations: ${result.trackOscillationCount}`);
    console.log(`Time to full resolution: ${result.timeToFullResolutionSec}s`);
    console.log(`Avg confidence: ${result.avgConfidence.toFixed(2)}`);
    console.log(`Intersection angles (last 10): ${result.intersectionAngles.map(a => a.toFixed(1)).join(', ')}`);
    console.log(`Grade: ${result.grade} (${result.score}/100)`);

    // Baseline: we expect this to FAIL — tracks merge due to 500m gate
    // This establishes the "before" measurement
    expect(result.distinctTracks).toBeGreaterThanOrEqual(1); // at least 1 track exists
  });

  it('optimized: 150m gate resolves formation members', () => {
    const result = runFormationTest(
      { trackAssociationDistanceM: 150 },
      'Optimized (150m gate)',
    );

    console.log('\n=== FORMATION RESOLUTION TEST: 150m GATE ===');
    console.log(`Distinct tracks: ${result.distinctTracks}/5`);
    console.log(`Target resolution: ${(result.targetResolution * 100).toFixed(0)}%`);
    console.log(`Avg position error: ${result.avgPositionErrorM.toFixed(0)}m`);
    console.log(`Max position error: ${result.maxPositionErrorM.toFixed(0)}m`);
    console.log(`Track oscillations: ${result.trackOscillationCount}`);
    console.log(`Time to full resolution: ${result.timeToFullResolutionSec}s`);
    console.log(`Avg confidence: ${result.avgConfidence.toFixed(2)}`);
    console.log(`Grade: ${result.grade} (${result.score}/100)`);

    expect(result.distinctTracks).toBeGreaterThanOrEqual(3);
  });

  it('sweep gate thresholds to find optimal value', () => {
    const gates = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
    const results: FormationTestResult[] = [];

    console.log('\n=== FORMATION RESOLUTION: GATE THRESHOLD SWEEP ===');
    console.log('Gate(m) | Tracks | Resolution | AvgErr(m) | Oscillations | Grade | Score');
    console.log('--------|--------|------------|-----------|--------------|-------|------');

    for (const gate of gates) {
      const result = runFormationTest(
        { trackAssociationDistanceM: gate },
        `Gate=${gate}m`,
      );
      results.push(result);

      console.log(
        `${String(gate).padStart(7)} | ${String(result.distinctTracks).padStart(6)} | ` +
        `${(result.targetResolution * 100).toFixed(0).padStart(9)}% | ` +
        `${result.avgPositionErrorM.toFixed(0).padStart(9)} | ` +
        `${String(result.trackOscillationCount).padStart(12)} | ` +
        `${result.grade.padStart(5)} | ${String(result.score).padStart(5)}`,
      );
    }

    // Find best gate value
    const best = results.reduce((a, b) => (a.score > b.score ? a : b));
    console.log(`\nBest gate: ${best.config.trackAssociationDistanceM}m → ${best.grade} (${best.score}/100)`);

    // The optimal gate should resolve at least 4/5 members
    expect(best.distinctTracks).toBeGreaterThanOrEqual(4);
  });

  it('EO core resolves formation that radar would merge', () => {
    // EO Core: full formation resolution with all features
    const eoResult = runFormationTest(
      { trackAssociationDistanceM: 150, useTargetIdAffinity: true },
      'EO Core (optimized)',
    );

    // Simulate radar behavior: position-based merge with 2km gate.
    // Radar has no bearing-level angular resolution and no targetId affinity.
    // At 300m spacing, all 5 members fall within a single 2km radar resolution cell.
    // We simulate this by computing how many targets radar would merge.
    const radarMergeGateM = 2000;
    const radarTracks = simulateRadarMerge(FORMATION_MEMBERS, radarMergeGateM);

    console.log('\n=== EO vs RADAR FORMATION RESOLUTION ===');
    console.log(`EO Core (150m + affinity + coordinated): ${eoResult.distinctTracks}/5 members resolved, ` +
      `${eoResult.trackOscillationCount} oscillations, ${eoResult.grade} (${eoResult.score})`);
    console.log(`Radar (2km merge cell): ${radarTracks}/5 members resolved (position-only merge)`);
    console.log(`EO advantage: +${eoResult.distinctTracks - radarTracks} tracks resolved`);

    // EO MUST resolve MORE formation members than radar
    expect(eoResult.distinctTracks).toBeGreaterThan(radarTracks);
    // EO must resolve all 5
    expect(eoResult.distinctTracks).toBe(5);
    expect(eoResult.trackOscillationCount).toBe(0);
  });
});

// ── Extended stress tests: push to asymptote ───────────────────────────────

describe('EO Core Formation Resolution — Stress Tests', () => {
  const DT_SEC = 1;

  function runStressTest(
    members: Array<{ id: string; lat: number; lon: number; alt: number; label: string }>,
    ticks: number,
    config: Partial<EoCoreConfig>,
    label: string,
    options?: {
      velocityMps?: number;
      maneuverAtTick?: number; // tick when formation breaks
      noiseDeg?: number;
    },
  ): {
    distinctTracks: number;
    totalMembers: number;
    oscillations: number;
    avgErrorM: number;
    maxErrorM: number;
    avgConfidence: number;
    tickToFullRes: number;
    label: string;
  } {
    const bus = new SensorBus();
    const core = new EoCoreEntity(bus, config);
    let currentFormation = [...members];
    let oscillations = 0;
    let prevAssignment = new Map<string, string>();
    let tickToFullRes = ticks;
    const noiseDeg = options?.noiseDeg ?? 0.1;

    for (let tick = 0; tick < ticks; tick++) {
      const simTime = tick * DT_SEC;

      // Optional maneuver: spread formation at specified tick
      if (options?.maneuverAtTick && tick === options.maneuverAtTick) {
        // Each member veers in a different direction
        currentFormation = currentFormation.map((m, i) => ({
          ...m,
          lon: m.lon + (i - Math.floor(members.length / 2)) * 0.001,
        }));
      }

      emitFormationBearings(bus, simTime, currentFormation, SENSOR_STATIONS, noiseDeg);
      core.tick(simTime);

      const tracks = core.getActiveTracks();
      const assignment = new Map<string, string>();
      for (const t of tracks) {
        const closest = closestMember(t, currentFormation);
        assignment.set(t.trackId, closest.id);
      }

      const uniqueMembers = new Set(assignment.values());
      if (uniqueMembers.size >= members.length && tickToFullRes === ticks) {
        tickToFullRes = simTime;
      }

      for (const [tid, mid] of assignment) {
        if (prevAssignment.has(tid) && prevAssignment.get(tid) !== mid) oscillations++;
      }
      prevAssignment = assignment;

      currentFormation = advanceFormation(currentFormation, DT_SEC, options?.velocityMps ?? 50);
    }

    const finalTracks = core.getActiveTracks();
    const finalMembers = new Set<string>();
    const errors: number[] = [];
    for (const t of finalTracks) {
      const c = closestMember(t, currentFormation);
      finalMembers.add(c.id);
      errors.push(c.distM);
    }

    return {
      distinctTracks: finalMembers.size,
      totalMembers: members.length,
      oscillations,
      avgErrorM: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : Infinity,
      maxErrorM: errors.length ? Math.max(...errors) : Infinity,
      avgConfidence: finalTracks.length
        ? finalTracks.reduce((a, t) => a + t.confidence, 0) / finalTracks.length
        : 0,
      tickToFullRes,
      label,
    };
  }

  it('spacing sweep: find minimum resolvable formation spacing', () => {
    const spacings = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
    const config: Partial<EoCoreConfig> = { trackAssociationDistanceM: 150, useTargetIdAffinity: true };

    console.log('\n=== MINIMUM RESOLVABLE SPACING (5 members, 60 ticks) ===');
    console.log('Spacing(m) | Tracks | Oscillations | AvgErr(m) | Time to Res');
    console.log('-----------|--------|--------------|-----------|------------');

    for (const spacing of spacings) {
      const dLat = spacing / 111_320;
      const dLon = spacing / (111_320 * Math.cos(CENTER_LAT * Math.PI / 180));
      const members = [
        { id: 'F1', lat: CENTER_LAT, lon: CENTER_LON, alt: 500, label: 'Lead' },
        { id: 'F2', lat: CENTER_LAT - dLat * 0.5, lon: CENTER_LON - dLon, alt: 500, label: 'LW' },
        { id: 'F3', lat: CENTER_LAT - dLat * 0.5, lon: CENTER_LON + dLon, alt: 500, label: 'RW' },
        { id: 'F4', lat: CENTER_LAT - dLat, lon: CENTER_LON - dLon * 1.5, alt: 500, label: 'LT' },
        { id: 'F5', lat: CENTER_LAT - dLat, lon: CENTER_LON + dLon * 1.5, alt: 500, label: 'RT' },
      ];

      const r = runStressTest(members, 60, config, `Spacing=${spacing}m`);
      console.log(
        `${String(spacing).padStart(10)} | ${String(r.distinctTracks).padStart(6)} | ` +
        `${String(r.oscillations).padStart(12)} | ` +
        `${r.avgErrorM.toFixed(0).padStart(9)} | ` +
        `${r.tickToFullRes === 60 ? 'never' : r.tickToFullRes + 's'}`,
      );
    }

    // At 300m spacing (design target), should resolve all 5
    const dLat300 = 300 / 111_320;
    const dLon300 = 300 / (111_320 * Math.cos(CENTER_LAT * Math.PI / 180));
    const members300 = [
      { id: 'F1', lat: CENTER_LAT, lon: CENTER_LON, alt: 500, label: 'Lead' },
      { id: 'F2', lat: CENTER_LAT - dLat300 * 0.5, lon: CENTER_LON - dLon300, alt: 500, label: 'LW' },
      { id: 'F3', lat: CENTER_LAT - dLat300 * 0.5, lon: CENTER_LON + dLon300, alt: 500, label: 'RW' },
      { id: 'F4', lat: CENTER_LAT - dLat300, lon: CENTER_LON - dLon300 * 1.5, alt: 500, label: 'LT' },
      { id: 'F5', lat: CENTER_LAT - dLat300, lon: CENTER_LON + dLon300 * 1.5, alt: 500, label: 'RT' },
    ];
    const r300 = runStressTest(members300, 60, config, '300m check');
    expect(r300.distinctTracks).toBe(5);
  });

  it('formation size sweep: 3, 5, 7, 10 members', () => {
    const config: Partial<EoCoreConfig> = { trackAssociationDistanceM: 150, useTargetIdAffinity: true };
    const sizes = [3, 5, 7, 10];
    const spacing = 300; // meters

    console.log('\n=== FORMATION SIZE SWEEP (300m spacing, 60 ticks) ===');
    console.log('Members | Resolved | Oscillations | AvgErr(m) | Confidence');
    console.log('--------|----------|--------------|-----------|----------');

    for (const size of sizes) {
      const dLat = spacing / 111_320;
      const dLon = spacing / (111_320 * Math.cos(CENTER_LAT * Math.PI / 180));
      const members: Array<{ id: string; lat: number; lon: number; alt: number; label: string }> = [];
      // Arrange in a line formation for simplicity
      for (let i = 0; i < size; i++) {
        members.push({
          id: `F${i + 1}`,
          lat: CENTER_LAT,
          lon: CENTER_LON + (i - Math.floor(size / 2)) * dLon,
          alt: 500,
          label: `M${i + 1}`,
        });
      }

      const r = runStressTest(members, 60, config, `Size=${size}`);
      console.log(
        `${String(size).padStart(7)} | ${String(r.distinctTracks).padStart(4)}/${String(size).padStart(2)} | ` +
        `${String(r.oscillations).padStart(12)} | ` +
        `${r.avgErrorM.toFixed(0).padStart(9)} | ` +
        `${r.avgConfidence.toFixed(2).padStart(9)}`,
      );
    }

    // 5-member formation must fully resolve
    const dLat5 = spacing / 111_320;
    const dLon5 = spacing / (111_320 * Math.cos(CENTER_LAT * Math.PI / 180));
    const members5 = Array.from({ length: 5 }, (_, i) => ({
      id: `F${i + 1}`,
      lat: CENTER_LAT,
      lon: CENTER_LON + (i - 2) * dLon5,
      alt: 500,
      label: `M${i + 1}`,
    }));
    const r5 = runStressTest(members5, 60, config, '5-member check');
    expect(r5.distinctTracks).toBe(5);
  });

  it('high-speed formation: 300 m/s fighter formation', () => {
    const config: Partial<EoCoreConfig> = { trackAssociationDistanceM: 150, useTargetIdAffinity: true };

    const r = runStressTest(
      FORMATION_MEMBERS.map(m => ({ ...m, label: m.label })),
      60,
      config,
      'Fighter formation (300 m/s)',
      { velocityMps: 300 },
    );

    console.log('\n=== HIGH-SPEED FORMATION (300 m/s) ===');
    console.log(`Resolved: ${r.distinctTracks}/${r.totalMembers}`);
    console.log(`Oscillations: ${r.oscillations}`);
    console.log(`Avg error: ${r.avgErrorM.toFixed(0)}m`);
    console.log(`Confidence: ${r.avgConfidence.toFixed(2)}`);

    // At 300 m/s with 1s ticks, each member moves 300m per tick —
    // equal to the entire formation spacing. Position blend lag
    // makes this extremely challenging. ≥3 is a realistic target.
    expect(r.distinctTracks).toBeGreaterThanOrEqual(3);
  });

  it('maneuvering formation: break and reform', () => {
    const config: Partial<EoCoreConfig> = { trackAssociationDistanceM: 150, useTargetIdAffinity: true };

    const r = runStressTest(
      FORMATION_MEMBERS.map(m => ({ ...m, label: m.label })),
      60,
      config,
      'Maneuvering formation',
      { velocityMps: 50, maneuverAtTick: 30 },
    );

    console.log('\n=== MANEUVERING FORMATION (break at t=30s) ===');
    console.log(`Resolved: ${r.distinctTracks}/${r.totalMembers}`);
    console.log(`Oscillations: ${r.oscillations}`);
    console.log(`Avg error: ${r.avgErrorM.toFixed(0)}m`);
    console.log(`Confidence: ${r.avgConfidence.toFixed(2)}`);

    // Should maintain tracks through maneuver
    expect(r.distinctTracks).toBeGreaterThanOrEqual(4);
  });

  it('bearing noise sweep: find degradation threshold', () => {
    const config: Partial<EoCoreConfig> = { trackAssociationDistanceM: 150, useTargetIdAffinity: true };
    const noises = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0];

    console.log('\n=== BEARING NOISE SWEEP (5 members, 300m spacing) ===');
    console.log('Noise(°) | Resolved | Oscillations | AvgErr(m) | MaxErr(m)');
    console.log('---------|----------|--------------|-----------|----------');

    for (const noise of noises) {
      const r = runStressTest(
        FORMATION_MEMBERS.map(m => ({ ...m, label: m.label })),
        60,
        config,
        `Noise=${noise}°`,
        { noiseDeg: noise },
      );

      console.log(
        `${noise.toFixed(2).padStart(8)} | ${String(r.distinctTracks).padStart(4)}/5 | ` +
        `${String(r.oscillations).padStart(12)} | ` +
        `${r.avgErrorM.toFixed(0).padStart(9)} | ` +
        `${r.maxErrorM.toFixed(0).padStart(9)}`,
      );
    }

    // At 0.1° (design spec), must resolve all 5
    const r01 = runStressTest(
      FORMATION_MEMBERS.map(m => ({ ...m, label: m.label })),
      60, config, '0.1° check', { noiseDeg: 0.1 },
    );
    expect(r01.distinctTracks).toBe(5);
  });
});
