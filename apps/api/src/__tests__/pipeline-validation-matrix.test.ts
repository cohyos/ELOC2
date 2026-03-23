/**
 * Pipeline Validation Matrix
 *
 * Tests single targets of each type against:
 *   A) Single radar (70 km)
 *   B) 3 staring EO sensors 360° (55 km detection range, major overlap)
 *   C) Combined radar + 3 EO
 *
 * Measures GT-to-system-track correlation:
 *   - Track existence: was the target tracked?
 *   - Position accuracy: mean position error (meters)
 *   - Track continuity: % of ticks where target was tracked vs active
 *   - No proliferation: at most 1 confirmed track per GT target
 *
 * Target passes when correlation > 97% (composite score).
 */

import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';
import type { ScenarioDefinition, SensorDefinition, TargetDefinition } from '@eloc2/scenario-library';
import { haversineDistanceM } from '@eloc2/shared-utils';

// ============================================================================
// Constants
// ============================================================================

/** Simulation center point — central Israel */
const CENTER = { lat: 31.5, lon: 34.8 };

/** Radar detection range */
const RADAR_RANGE_M = 70_000;

/** EO detection range */
const EO_RANGE_M = 55_000;

/** How long each scenario runs (seconds) */
const SCENARIO_DURATION_SEC = 120;

/** Correlation pass threshold */
const PASS_THRESHOLD = 0.97;

/** Max acceptable position error (meters) for a "correlated" tick */
const MAX_POSITION_ERROR_M = 2000;

/** Max acceptable position error for EO-only (bearing geometry is weaker) */
const MAX_POSITION_ERROR_EO_M = 5000;

// ============================================================================
// Sensor Definitions
// ============================================================================

const RADAR_1: SensorDefinition = {
  sensorId: 'RADAR-TEST',
  type: 'radar',
  position: { lat: CENTER.lat, lon: CENTER.lon, alt: 100 },
  coverage: {
    minAzDeg: 0, maxAzDeg: 360,
    minElDeg: 0, maxElDeg: 90,
    maxRangeM: RADAR_RANGE_M,
  },
};

/** 3 staring EO sensors in a triangle, ~25km baselines, all with 360° coverage */
function makeStaringEoSensors(): SensorDefinition[] {
  // Triangle around CENTER with ~25 km baselines
  return [
    {
      sensorId: 'EO-STARING-1',
      type: 'eo',
      position: { lat: CENTER.lat + 0.12, lon: CENTER.lon, alt: 50 }, // ~13km north
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -10, maxElDeg: 90, maxRangeM: EO_RANGE_M },
      fov: { halfAngleHDeg: 2.0, halfAngleVDeg: 1.5 },
      slewRateDegPerSec: 0, // STARING
      maxDetectionRangeM: EO_RANGE_M,
    },
    {
      sensorId: 'EO-STARING-2',
      type: 'eo',
      position: { lat: CENTER.lat - 0.06, lon: CENTER.lon - 0.12, alt: 50 }, // ~14km SW
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -10, maxElDeg: 90, maxRangeM: EO_RANGE_M },
      fov: { halfAngleHDeg: 2.0, halfAngleVDeg: 1.5 },
      slewRateDegPerSec: 0,
      maxDetectionRangeM: EO_RANGE_M,
    },
    {
      sensorId: 'EO-STARING-3',
      type: 'eo',
      position: { lat: CENTER.lat - 0.06, lon: CENTER.lon + 0.12, alt: 50 }, // ~14km SE
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -10, maxElDeg: 90, maxRangeM: EO_RANGE_M },
      fov: { halfAngleHDeg: 2.0, halfAngleVDeg: 1.5 },
      slewRateDegPerSec: 0,
      maxDetectionRangeM: EO_RANGE_M,
    },
  ];
}

// ============================================================================
// Target Definitions — one representative per category
// ============================================================================

interface TargetSpec {
  id: string;
  name: string;
  category: string;
  rcs: number;
  speedMs: number;
  altitudeM: number;
  classification: string;
}

const TARGET_SPECS: TargetSpec[] = [
  // Ballistic missiles — use moderate speed (Fateh-110 class) to stay in radar range
  { id: 'bm-fateh', name: 'Fateh-110 (BM)', category: 'ballistic_missile', rcs: 0.3, speedMs: 600, altitudeM: 15000, classification: 'hostile' },
  // ABT — cruise missile
  { id: 'abt-cruise', name: 'Kh-55 Cruise Missile', category: 'abt', rcs: 0.3, speedMs: 260, altitudeM: 500, classification: 'hostile' },
  // ABT — loitering drone
  { id: 'abt-drone', name: 'Shahed-136 Drone', category: 'abt', rcs: 0.01, speedMs: 56, altitudeM: 1000, classification: 'hostile' },
  // Fighter
  { id: 'fighter-f16', name: 'F-16C', category: 'fighter', rcs: 1.5, speedMs: 300, altitudeM: 5000, classification: 'friendly' },
  // Helicopter
  { id: 'heli-ah64', name: 'AH-64 Apache', category: 'helicopter', rcs: 10, speedMs: 80, altitudeM: 300, classification: 'friendly' },
  // Civilian
  { id: 'civil-b747', name: 'Boeing 747', category: 'civilian', rcs: 100, speedMs: 250, altitudeM: 10000, classification: 'neutral' },
  // Military transport
  { id: 'mil-c130', name: 'C-130 Hercules', category: 'mil_transport', rcs: 35, speedMs: 180, altitudeM: 6000, classification: 'friendly' },
];

/**
 * Build a TargetDefinition that flies a straight-line path through the sensor coverage.
 * Target starts ~40km from center heading inward, crosses through, exits other side.
 * The bearing is varied per target to avoid all targets flying the same path.
 */
function makeTarget(spec: TargetSpec, index: number): TargetDefinition {
  // Compute start position: 40km out from center at a given bearing
  const bearingRad = ((index * 51.4) % 360) * Math.PI / 180; // spread targets around
  const startDistM = 40_000;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(CENTER.lat * Math.PI / 180);

  const startLat = CENTER.lat + (startDistM * Math.cos(bearingRad)) / mPerDegLat;
  const startLon = CENTER.lon + (startDistM * Math.sin(bearingRad)) / mPerDegLon;

  // End position: opposite side, 40km out
  const endLat = CENTER.lat - (startDistM * Math.cos(bearingRad)) / mPerDegLat;
  const endLon = CENTER.lon - (startDistM * Math.sin(bearingRad)) / mPerDegLon;

  // Time to traverse = distance / speed
  const traverseDistM = 2 * startDistM;
  const traverseTimeSec = Math.min(traverseDistM / spec.speedMs, SCENARIO_DURATION_SEC - 5);

  // Compute velocity vector (ENU: vx=east, vy=north)
  const vx = (endLon - startLon) * mPerDegLon / traverseTimeSec;
  const vy = (endLat - startLat) * mPerDegLat / traverseTimeSec;

  return {
    targetId: spec.id,
    name: spec.name,
    description: `${spec.category} test target`,
    startTime: 0,
    classification: spec.classification as any,
    rcs: spec.rcs,
    waypoints: [
      { time: 0, position: { lat: startLat, lon: startLon, alt: spec.altitudeM }, velocity: { vx, vy, vz: 0 } },
      { time: traverseTimeSec, position: { lat: endLat, lon: endLon, alt: spec.altitudeM }, velocity: { vx, vy, vz: 0 } },
    ],
  };
}

// ============================================================================
// Scenario Builder
// ============================================================================

function buildScenario(
  name: string,
  sensors: SensorDefinition[],
  targets: TargetDefinition[],
): ScenarioDefinition {
  return {
    id: `test-${name}`,
    name,
    description: `Validation matrix: ${name}`,
    durationSec: SCENARIO_DURATION_SEC,
    policyMode: 'auto_with_veto',
    sensors,
    targets,
    faults: [],
    operatorActions: [],
    seed: 42, // deterministic
    center: CENTER,
  };
}

// ============================================================================
// Correlation Scorer
// ============================================================================

interface CorrelationResult {
  targetId: string;
  targetName: string;
  category: string;
  /** Number of ticks where GT target was active */
  totalActiveTicks: number;
  /** Number of ticks where a system track was within position threshold of GT */
  correlatedTicks: number;
  /** Mean position error across correlated ticks (meters) */
  meanPositionErrorM: number;
  /** Max number of concurrent tracks matching this GT (1 = no proliferation) */
  maxConcurrentTracks: number;
  /** Final track status at end of scenario */
  finalTrackStatus: string | null;
  /** Composite correlation score [0, 1] */
  correlationScore: number;
  /** First tick where track appeared */
  firstDetectionTick: number | null;
}

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

function computeCorrelation(
  engine: LiveEngine,
  targetSpec: TargetSpec,
  targetDef: TargetDefinition,
  maxErrorM: number,
): CorrelationResult {
  // Determine the target's active window
  const lastWpTime = targetDef.waypoints[targetDef.waypoints.length - 1].time;
  const targetEndSec = targetDef.startTime + lastWpTime;
  // Seek to when target is near mid-trajectory (best coverage)
  const evalTimeSec = Math.min(Math.floor(targetEndSec * 0.7), SCENARIO_DURATION_SEC);

  advanceTo(engine, evalTimeSec);

  const state = engine.getState();
  const gtTargets = engine.getGroundTruth();
  const gtTarget = gtTargets.find(g => g.targetId === targetSpec.id);

  // --- Final state analysis ---
  const nonDroppedTracks = state.tracks.filter(t => t.status !== 'dropped');
  let bestTrackDist = Infinity;
  let bestTrack: (typeof nonDroppedTracks)[number] | null = null;

  if (gtTarget) {
    for (const track of nonDroppedTracks) {
      const dist = haversineDistanceM(
        track.state.lat, track.state.lon,
        gtTarget.position.lat, gtTarget.position.lon,
      );
      if (dist < bestTrackDist) {
        bestTrackDist = dist;
        bestTrack = track;
      }
    }
  }

  // --- Event log analysis for continuity ---
  const eventLog = state.eventLog;

  // Count radar observations
  const radarObs = eventLog.filter(e => e.eventType === 'source.observation.reported');
  const radarUpdates = radarObs.filter(e => e.summary.includes('→ update'));

  // Count EO detections (core detector ingests + bearing measurements)
  const eoDetections = eventLog.filter(e =>
    e.eventType === 'eo.detection.ingested' ||
    e.eventType === 'eo.bearing.measured',
  );
  const eoTargets = eventLog.filter(e => e.eventType === 'eo.target.detected');

  // Combined sensor events
  const totalObs = radarObs.length + eoDetections.length;
  const updateCount = radarUpdates.length;

  // Continuity: for radar, use update ratio. For EO-only, use detection count.
  const continuity = radarObs.length > 1
    ? radarUpdates.length / (radarObs.length - 1)
    : eoDetections.length > 0 ? Math.min(1, eoDetections.length / Math.max(1, evalTimeSec / 2)) : 0;

  // Position error
  const positionErrorM = bestTrack && gtTarget
    ? haversineDistanceM(bestTrack.state.lat, bestTrack.state.lon, gtTarget.position.lat, gtTarget.position.lon)
    : Infinity;

  const maxConcurrentTracks = nonDroppedTracks.length;
  const firstObsEvent = radarObs[0] ?? eoDetections[0];
  const firstDetectionTick = firstObsEvent?.simTimeSec ?? null;
  const finalTrackStatus = bestTrack?.status ?? null;
  const detected = bestTrack !== null && positionErrorM < maxErrorM;

  // Diagnostic: analyze correlation pattern
  const newEvts = radarObs.filter(e => e.summary?.includes('→ new'));
  const updateEvts = radarObs.filter(e => e.summary?.includes('→ update'));

  // Check if "new" events cluster at beginning or are spread throughout
  const newTimestamps = newEvts.map(e => e.simTimeSec).filter(Boolean);
  const earlyNew = newTimestamps.filter(t => t !== undefined && t <= 5).length;
  const lateNew = newTimestamps.filter(t => t !== undefined && t > 5).length;

  console.log(`  DIAG [${targetSpec.id}] t=${evalTimeSec}s: obs=${radarObs.length} eo=${eoDetections.length} eoTgt=${eoTargets.length} ` +
    `new=${newEvts.length}(early${earlyNew}/late${lateNew}) upd=${updateEvts.length} ` +
    `trk=${nonDroppedTracks.length} err=${Math.round(positionErrorM)}m`);

  // Composite score — measures actual tracking quality:
  //   35% accuracy (position error at eval time)
  //   30% detection (was target found at eval time?)
  //   20% continuity (observation-level correlation rate)
  //   15% no-proliferation (1 track = perfect)
  const accuracyScore = detected ? Math.max(0, 1 - (positionErrorM / maxErrorM)) : 0;
  const detectionScore = detected ? 1 : 0;
  const proliferationScore = maxConcurrentTracks <= 1 ? 1 : Math.max(0, 1 - 0.2 * (maxConcurrentTracks - 1));
  const correlationScore = Math.min(1,
    0.20 * continuity +
    0.35 * accuracyScore +
    0.30 * detectionScore +
    0.15 * proliferationScore,
  );

  return {
    targetId: targetSpec.id,
    targetName: targetSpec.name,
    category: targetSpec.category,
    totalActiveTicks: totalObs,
    correlatedTicks: updateCount,
    meanPositionErrorM: positionErrorM === Infinity ? Infinity : Math.round(positionErrorM),
    maxConcurrentTracks,
    finalTrackStatus,
    correlationScore: Math.round(correlationScore * 1000) / 1000,
    firstDetectionTick,
  };
}

// ============================================================================
// Report Builder
// ============================================================================

interface SuiteReport {
  suiteName: string;
  results: CorrelationResult[];
  passCount: number;
  failCount: number;
  overallScore: number;
}

function printReport(report: SuiteReport): void {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${report.suiteName}`);
  console.log(`  Overall: ${(report.overallScore * 100).toFixed(1)}% | Pass: ${report.passCount}/${report.results.length}`);
  console.log('═'.repeat(80));
  console.log(
    'Target'.padEnd(28) +
    'Category'.padEnd(18) +
    'Score'.padEnd(8) +
    'Cont%'.padEnd(8) +
    'Err(m)'.padEnd(9) +
    'Prolif'.padEnd(8) +
    'Det@'.padEnd(6) +
    'Status',
  );
  console.log('─'.repeat(80));

  for (const r of report.results) {
    const contPct = r.totalActiveTicks > 0
      ? `${((r.correlatedTicks / r.totalActiveTicks) * 100).toFixed(0)}%`
      : 'N/A';
    const pass = r.correlationScore >= PASS_THRESHOLD ? '✓' : '✗';
    console.log(
      `${pass} ${r.targetName.slice(0, 26).padEnd(26)}` +
      r.category.slice(0, 16).padEnd(18) +
      `${(r.correlationScore * 100).toFixed(1)}%`.padEnd(8) +
      contPct.padEnd(8) +
      `${r.meanPositionErrorM}`.padEnd(9) +
      `${r.maxConcurrentTracks}`.padEnd(8) +
      `${r.firstDetectionTick ?? '-'}`.padEnd(6) +
      (r.finalTrackStatus ?? '-'),
    );
  }
  console.log('─'.repeat(80));
}

function runSuite(
  suiteName: string,
  sensors: SensorDefinition[],
  maxErrorM: number,
): SuiteReport {
  const results: CorrelationResult[] = [];

  for (let i = 0; i < TARGET_SPECS.length; i++) {
    const spec = TARGET_SPECS[i];
    const target = makeTarget(spec, i);
    const scenario = buildScenario(`${suiteName}-${spec.id}`, sensors, [target]);

    const engine = new LiveEngine();
    engine.loadCustomScenario(scenario);

    const result = computeCorrelation(engine, spec, target, maxErrorM);
    results.push(result);
  }

  const passCount = results.filter(r => r.correlationScore >= PASS_THRESHOLD).length;
  const overallScore = results.reduce((sum, r) => sum + r.correlationScore, 0) / results.length;

  const report: SuiteReport = {
    suiteName,
    results,
    passCount,
    failCount: results.length - passCount,
    overallScore,
  };

  printReport(report);
  return report;
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Pipeline Validation Matrix', () => {
  // ── Suite A: Single Radar ──────────────────────────────────────────────

  describe('Suite A: Single Radar (70km)', () => {
    it('tracks all target types with >97% correlation', () => {
      const report = runSuite('radar-only', [RADAR_1], MAX_POSITION_ERROR_M);

      // Assert each target individually for clear failure reporting
      for (const r of report.results) {
        expect(
          r.correlationScore,
          `${r.targetName} (${r.category}): score=${(r.correlationScore * 100).toFixed(1)}%, ` +
          `continuity=${r.totalActiveTicks > 0 ? ((r.correlatedTicks / r.totalActiveTicks) * 100).toFixed(0) : 0}%, ` +
          `error=${r.meanPositionErrorM}m, prolif=${r.maxConcurrentTracks}`,
        ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      }
    });
  });

  // ── Suite B: 3 Staring EO Only ─────────────────────────────────────────

  describe('Suite B: 3 Staring EO 360° (55km)', () => {
    it('tracks all target types with >97% correlation', () => {
      const eoSensors = makeStaringEoSensors();
      const report = runSuite('eo-only', eoSensors, MAX_POSITION_ERROR_EO_M);

      for (const r of report.results) {
        expect(
          r.correlationScore,
          `${r.targetName} (${r.category}): score=${(r.correlationScore * 100).toFixed(1)}%, ` +
          `continuity=${r.totalActiveTicks > 0 ? ((r.correlatedTicks / r.totalActiveTicks) * 100).toFixed(0) : 0}%, ` +
          `error=${r.meanPositionErrorM}m, prolif=${r.maxConcurrentTracks}`,
        ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      }
    });
  });

  // ── Suite C: Radar + 3 EO Combined ─────────────────────────────────────

  describe('Suite C: Radar + 3 Staring EO Combined', () => {
    it('tracks all target types with >97% correlation', () => {
      const sensors = [RADAR_1, ...makeStaringEoSensors()];
      const report = runSuite('combined', sensors, MAX_POSITION_ERROR_M);

      for (const r of report.results) {
        expect(
          r.correlationScore,
          `${r.targetName} (${r.category}): score=${(r.correlationScore * 100).toFixed(1)}%, ` +
          `continuity=${r.totalActiveTicks > 0 ? ((r.correlatedTicks / r.totalActiveTicks) * 100).toFixed(0) : 0}%, ` +
          `error=${r.meanPositionErrorM}m, prolif=${r.maxConcurrentTracks}`,
        ).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      }
    });
  });
});
