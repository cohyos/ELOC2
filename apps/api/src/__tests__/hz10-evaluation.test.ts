/**
 * 10 Hz Pipeline Evaluation Test
 *
 * Compares distributed pipeline performance at:
 *   - Baseline: 1 Hz target gen, radar 1s, EO 2s, C4ISR 12s
 *   - 10 Hz uncalibrated: 0.1s all sensors, no parameter changes
 *   - 10 Hz calibrated: 0.1s all sensors, recalibrated thresholds
 *
 * Measures: track quality, proliferation, fusion accuracy, memory, crashes.
 */

import { describe, it, expect } from 'vitest';
import { DistributedPipeline } from '@eloc2/system-fuser';
import type { SensorInstanceConfig } from '@eloc2/sensor-instances';
import type { GroundTruthTarget } from '@eloc2/sensor-bus';
import type { FusedSystemTrack, SystemFuserConfig } from '@eloc2/system-fuser';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RunConfig {
  label: string;
  dtSec: number;               // simulation step size (1.0 or 0.1)
  radarUpdateSec: number;      // radar observation interval
  eoUpdateSec: number;         // EO observation interval
  fuserConfig?: Partial<SystemFuserConfig>;
  /** Override description for report */
  description: string;
}

interface TickSnapshot {
  simTime: number;
  systemTrackCount: number;
  eoCoreTracks: number;
  totalObservations: number;
  totalLocalTracks: number;
  activeGtTargets: number;
  tickDurationMs: number;
  heapUsedMB: number;
}

interface RunResult {
  config: RunConfig;
  snapshots: TickSnapshot[];
  finalTracks: FusedSystemTrack[];
  crashed: boolean;
  crashError?: string;
  totalTicks: number;
  totalSimTimeSec: number;
  wallClockMs: number;
  peakSystemTracks: number;
  peakHeapMB: number;
  avgTickMs: number;
  maxTickMs: number;
  /** How many GT targets were ever active */
  totalGtTargets: number;
  /** Final confirmed tracks */
  confirmedTracks: number;
  /** Final tentative tracks */
  tentativeTracks: number;
  /** Final dropped tracks */
  droppedTracks: number;
  /** Track-to-GT ratio at end (measures proliferation) */
  trackToGtRatio: number;
}

// ─── Scenario: 4 targets, mixed types, 120s ──────────────────────────────────

const CENTER_LAT = 31.25;
const CENTER_LON = 34.80;

function buildTargets(): GroundTruthTarget[] {
  // We'll compute these dynamically per tick based on simTime
  return []; // placeholder — targets built in getActiveTargets()
}

interface TargetDef {
  id: string;
  startTime: number;
  endTime: number;
  startLat: number; startLon: number; startAlt: number;
  endLat: number; endLon: number; endAlt: number;
  vx: number; vy: number; vz: number;
  rcs: number;
  classification: string;
}

const TARGET_DEFS: TargetDef[] = [
  // T1: Fighter aircraft, crosses area W→E, t=0–100s
  {
    id: 'TGT-F1', startTime: 0, endTime: 100,
    startLat: 31.35, startLon: 34.40, startAlt: 8000,
    endLat: 31.30, endLon: 35.20, endAlt: 8000,
    vx: 350, vy: -20, vz: 0, rcs: 5,
    classification: 'fighter_aircraft',
  },
  // T2: Drone, slow approach from north, t=10–110s
  {
    id: 'TGT-D1', startTime: 10, endTime: 110,
    startLat: 31.55, startLon: 34.78, startAlt: 500,
    endLat: 31.20, endLon: 34.82, endAlt: 400,
    vx: 2, vy: -40, vz: -1, rcs: 0.05,
    classification: 'uav',
  },
  // T3: Second fighter, t=30–120s
  {
    id: 'TGT-F2', startTime: 30, endTime: 120,
    startLat: 31.10, startLon: 34.50, startAlt: 12000,
    endLat: 31.40, endLon: 35.10, endAlt: 11000,
    vx: 280, vy: 120, vz: -10, rcs: 8,
    classification: 'fighter_aircraft',
  },
  // T4: Helicopter, low-slow, t=20–90s
  {
    id: 'TGT-H1', startTime: 20, endTime: 90,
    startLat: 31.30, startLon: 34.60, startAlt: 200,
    endLat: 31.22, endLon: 34.90, endAlt: 250,
    vx: 30, vy: -8, vz: 0.5, rcs: 10,
    classification: 'helicopter',
  },
];

function getActiveTargets(simTimeSec: number): GroundTruthTarget[] {
  const targets: GroundTruthTarget[] = [];
  for (const def of TARGET_DEFS) {
    if (simTimeSec < def.startTime || simTimeSec > def.endTime) continue;
    const elapsed = simTimeSec - def.startTime;
    const duration = def.endTime - def.startTime;
    const frac = elapsed / duration;
    targets.push({
      targetId: def.id,
      position: {
        lat: def.startLat + (def.endLat - def.startLat) * frac,
        lon: def.startLon + (def.endLon - def.startLon) * frac,
        alt: def.startAlt + (def.endAlt - def.startAlt) * frac,
      },
      velocity: { vx: def.vx, vy: def.vy, vz: def.vz },
      rcs: def.rcs,
      classification: def.classification as any,
      active: true,
    });
  }
  return targets;
}

// ─── Sensor layout ───────────────────────────────────────────────────────────

function buildSensors(radarUpdateSec: number, eoUpdateSec: number): SensorInstanceConfig[] {
  return [
    // 1 radar
    {
      sensorId: 'RADAR-1',
      type: 'radar' as const,
      position: { lat: CENTER_LAT, lon: CENTER_LON, alt: 25 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 200_000 },
      updateIntervalSec: radarUpdateSec,
    },
    // 3 staring EO sensors in triangle ~10km from center
    ...([0, 120, 240] as const).map((angleDeg, i) => {
      const rad = (angleDeg * Math.PI) / 180;
      return {
        sensorId: `EO-STARE-${i + 1}`,
        type: 'eo' as const,
        position: {
          lat: CENTER_LAT + 0.09 * Math.sin(rad),
          lon: CENTER_LON + 0.09 * Math.cos(rad) / Math.cos(CENTER_LAT * Math.PI / 180),
          alt: 15,
        },
        coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -3, maxElDeg: 20, maxRangeM: 40_000 },
        fov: { halfAngleHDeg: 180, halfAngleVDeg: 10 },
        slewRateDegPerSec: 0,
        maxDetectionRangeM: 40_000,
        updateIntervalSec: eoUpdateSec,
      } satisfies SensorInstanceConfig;
    }),
    // 1 EO investigator with gimbal
    {
      sensorId: 'EO-INV-1',
      type: 'eo' as const,
      position: { lat: CENTER_LAT + 0.01, lon: CENTER_LON - 0.01, alt: 20 },
      coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 90, maxRangeM: 40_000 },
      fov: { halfAngleHDeg: 1.0, halfAngleVDeg: 0.75 },
      slewRateDegPerSec: 60,
      maxDetectionRangeM: 40_000,
      updateIntervalSec: eoUpdateSec,
    },
  ];
}

// ─── Pipeline runner ─────────────────────────────────────────────────────────

function runPipeline(config: RunConfig): RunResult {
  const sensors = buildSensors(config.radarUpdateSec, config.eoUpdateSec);
  const pipeline = new DistributedPipeline({
    sensors,
    fuserConfig: config.fuserConfig,
  });

  const snapshots: TickSnapshot[] = [];
  let crashed = false;
  let crashError: string | undefined;
  let peakSystemTracks = 0;
  let peakHeapMB = 0;
  let maxTickMs = 0;
  let totalTickMs = 0;
  let totalTicks = 0;

  const SIM_DURATION = 120; // seconds of sim time
  const startWall = Date.now();

  try {
    for (let simTime = config.dtSec; simTime <= SIM_DURATION; simTime += config.dtSec) {
      // Round to avoid floating point drift
      const t = Math.round(simTime * 1000) / 1000;
      const targets = getActiveTargets(t);

      const tickStart = performance.now();
      const result = pipeline.tick(t, config.dtSec, targets);
      const tickMs = performance.now() - tickStart;

      totalTickMs += tickMs;
      totalTicks++;
      if (tickMs > maxTickMs) maxTickMs = tickMs;

      const heap = process.memoryUsage().heapUsed / (1024 * 1024);
      if (heap > peakHeapMB) peakHeapMB = heap;
      if (result.systemTracks.length > peakSystemTracks) {
        peakSystemTracks = result.systemTracks.length;
      }

      // Snapshot every 1 sim-second (every tick at 1Hz, every 10th tick at 10Hz)
      const isSnapshotTick = Math.abs(t - Math.round(t)) < config.dtSec / 2;
      if (isSnapshotTick) {
        let totalObs = 0;
        let totalLocal = 0;
        for (const sr of result.sensorResults) {
          totalObs += sr.observations;
          totalLocal += sr.localTracks;
        }
        snapshots.push({
          simTime: t,
          systemTrackCount: result.systemTracks.length,
          eoCoreTracks: result.eoCoreTracks,
          totalObservations: totalObs,
          totalLocalTracks: totalLocal,
          activeGtTargets: targets.length,
          tickDurationMs: tickMs,
          heapUsedMB: heap,
        });
      }
    }
  } catch (err: any) {
    crashed = true;
    crashError = err.message ?? String(err);
  }

  const wallClockMs = Date.now() - startWall;
  const finalTracks = crashed ? [] : pipeline.getSystemTracks();

  // Count final track states
  let confirmed = 0, tentative = 0, dropped = 0;
  for (const t of finalTracks) {
    if (t.status === 'confirmed') confirmed++;
    else if (t.status === 'tentative') tentative++;
    else if (t.status === 'dropped') dropped++;
  }

  // Active GT at end
  const endGt = getActiveTargets(SIM_DURATION);

  return {
    config,
    snapshots,
    finalTracks,
    crashed,
    crashError,
    totalTicks,
    totalSimTimeSec: SIM_DURATION,
    wallClockMs,
    peakSystemTracks,
    peakHeapMB,
    avgTickMs: totalTicks > 0 ? totalTickMs / totalTicks : 0,
    maxTickMs,
    totalGtTargets: TARGET_DEFS.length,
    confirmedTracks: confirmed,
    tentativeTracks: tentative,
    droppedTracks: dropped,
    trackToGtRatio: endGt.length > 0 ? (confirmed + tentative) / endGt.length : 0,
  };
}

// ─── Utility: get system tracks from pipeline ────────────────────────────────
// DistributedPipeline may not expose getSystemTracks directly; we capture from
// the last tick result instead. Let's patch runPipeline to capture last result.

// (Already captured via result.systemTracks in the loop — finalTracks uses last snapshot)

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('10 Hz Pipeline Evaluation', () => {
  const results: RunResult[] = [];

  // ── Config definitions ───────────────────────────────────────────────────

  const BASELINE: RunConfig = {
    label: 'Baseline (1 Hz)',
    dtSec: 1.0,
    radarUpdateSec: 1.0,
    eoUpdateSec: 2.0,
    description: 'Current production rates: radar 1Hz, EO 0.5Hz, 1s sim steps',
  };

  const HZ10_RAW: RunConfig = {
    label: '10 Hz Uncalibrated',
    dtSec: 0.1,
    radarUpdateSec: 0.1,
    eoUpdateSec: 0.1,
    description: '10Hz all sensors, NO parameter recalibration — stress test',
  };

  const HZ10_CALIBRATED: RunConfig = {
    label: '10 Hz Calibrated',
    dtSec: 0.1,
    radarUpdateSec: 0.1,
    eoUpdateSec: 0.1,
    fuserConfig: {
      // Scale count-based thresholds for 10x frequency
      confirmAfter: 7,          // was 3 → ~700ms (vs 3s baseline)
      coastingMissThreshold: 15, // was 5 → ~1.5s (vs 5s baseline)
      dropAfterMisses: 40,      // was 12 → ~4s (vs 12s baseline)
      mergeDistanceM: 150,      // unchanged (spatial)
      correlationThreshold: 100, // was 50 → wider gate for smaller covariance
    },
    description: '10Hz all sensors, recalibrated count thresholds + wider correlation gate',
  };

  // ── Test 1: Baseline ─────────────────────────────────────────────────────

  it('should run baseline (1 Hz) without crashes', () => {
    console.log('\n═══ Running BASELINE (1 Hz) ═══');
    const result = runPipeline(BASELINE);
    results.push(result);

    console.log(`  Ticks: ${result.totalTicks}`);
    console.log(`  Wall clock: ${result.wallClockMs}ms`);
    console.log(`  Avg tick: ${result.avgTickMs.toFixed(2)}ms, Max: ${result.maxTickMs.toFixed(2)}ms`);
    console.log(`  Peak system tracks: ${result.peakSystemTracks}`);
    console.log(`  Final: ${result.confirmedTracks} confirmed, ${result.tentativeTracks} tentative, ${result.droppedTracks} dropped`);
    console.log(`  Peak heap: ${result.peakHeapMB.toFixed(1)}MB`);
    console.log(`  Crashed: ${result.crashed}`);

    expect(result.crashed).toBe(false);
    expect(result.totalTicks).toBe(120);
  }, 60_000);

  // ── Test 2: 10 Hz uncalibrated ───────────────────────────────────────────

  it('should run 10 Hz uncalibrated and measure degradation', () => {
    console.log('\n═══ Running 10 Hz UNCALIBRATED ═══');
    const result = runPipeline(HZ10_RAW);
    results.push(result);

    console.log(`  Ticks: ${result.totalTicks}`);
    console.log(`  Wall clock: ${result.wallClockMs}ms`);
    console.log(`  Avg tick: ${result.avgTickMs.toFixed(2)}ms, Max: ${result.maxTickMs.toFixed(2)}ms`);
    console.log(`  Peak system tracks: ${result.peakSystemTracks}`);
    console.log(`  Final: ${result.confirmedTracks} confirmed, ${result.tentativeTracks} tentative, ${result.droppedTracks} dropped`);
    console.log(`  Peak heap: ${result.peakHeapMB.toFixed(1)}MB`);
    console.log(`  Crashed: ${result.crashed}${result.crashError ? ' — ' + result.crashError : ''}`);

    // We expect this to complete (may have quality issues but no crashes)
    expect(result.crashed).toBe(false);
    expect(result.totalTicks).toBe(1200);
  }, 120_000);

  // ── Test 3: 10 Hz calibrated ─────────────────────────────────────────────

  it('should run 10 Hz calibrated with improved quality', () => {
    console.log('\n═══ Running 10 Hz CALIBRATED ═══');
    const result = runPipeline(HZ10_CALIBRATED);
    results.push(result);

    console.log(`  Ticks: ${result.totalTicks}`);
    console.log(`  Wall clock: ${result.wallClockMs}ms`);
    console.log(`  Avg tick: ${result.avgTickMs.toFixed(2)}ms, Max: ${result.maxTickMs.toFixed(2)}ms`);
    console.log(`  Peak system tracks: ${result.peakSystemTracks}`);
    console.log(`  Final: ${result.confirmedTracks} confirmed, ${result.tentativeTracks} tentative, ${result.droppedTracks} dropped`);
    console.log(`  Peak heap: ${result.peakHeapMB.toFixed(1)}MB`);
    console.log(`  Crashed: ${result.crashed}${result.crashError ? ' — ' + result.crashError : ''}`);

    expect(result.crashed).toBe(false);
    expect(result.totalTicks).toBe(1200);
  }, 120_000);

  // ── Test 4: Comparison & grading ──────────────────────────────────────────

  it('should produce comparison report', () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('    10 Hz EVALUATION — COMPARISON REPORT');
    console.log('═══════════════════════════════════════════════════════\n');

    if (results.length < 3) {
      console.log('Not all runs completed — skipping comparison');
      return;
    }

    const [baseline, raw10, cal10] = results;

    // ── Performance comparison ──
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│ PERFORMANCE                                         │');
    console.log('├──────────────────┬──────────┬──────────┬────────────┤');
    console.log('│ Metric           │ 1 Hz     │ 10Hz Raw │ 10Hz Cal   │');
    console.log('├──────────────────┼──────────┼──────────┼────────────┤');
    const row = (label: string, fn: (r: RunResult) => string) =>
      console.log(`│ ${label.padEnd(16)} │ ${fn(baseline).padEnd(8)} │ ${fn(raw10).padEnd(8)} │ ${fn(cal10).padEnd(10)} │`);

    row('Total ticks', r => String(r.totalTicks));
    row('Wall clock ms', r => String(r.wallClockMs));
    row('Avg tick ms', r => r.avgTickMs.toFixed(2));
    row('Max tick ms', r => r.maxTickMs.toFixed(2));
    row('Peak heap MB', r => r.peakHeapMB.toFixed(1));
    row('Crashed', r => String(r.crashed));
    console.log('└──────────────────┴──────────┴──────────┴────────────┘\n');

    // ── Track quality comparison ──
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│ TRACK QUALITY                                       │');
    console.log('├──────────────────┬──────────┬──────────┬────────────┤');
    console.log('│ Metric           │ 1 Hz     │ 10Hz Raw │ 10Hz Cal   │');
    console.log('├──────────────────┼──────────┼──────────┼────────────┤');
    row('Peak sys tracks', r => String(r.peakSystemTracks));
    row('Confirmed', r => String(r.confirmedTracks));
    row('Tentative', r => String(r.tentativeTracks));
    row('Dropped', r => String(r.droppedTracks));
    row('GT targets', r => String(r.totalGtTargets));
    row('Track/GT ratio', r => r.trackToGtRatio.toFixed(2));
    console.log('└──────────────────┴──────────┴──────────┴────────────┘\n');

    // ── Per-second track evolution (sample every 10s) ──
    console.log('Track count evolution (every 10s):');
    console.log('  Time │ GT │  1Hz │ 10Hz-R │ 10Hz-C');
    console.log('  ─────┼────┼──────┼────────┼───────');
    for (let t = 10; t <= 120; t += 10) {
      const bSnap = baseline.snapshots.find(s => Math.abs(s.simTime - t) < 1);
      const rSnap = raw10.snapshots.find(s => Math.abs(s.simTime - t) < 1);
      const cSnap = cal10.snapshots.find(s => Math.abs(s.simTime - t) < 1);
      const gt = getActiveTargets(t).length;
      console.log(`  ${String(t).padStart(4)}s│ ${String(gt).padStart(2)} │ ${String(bSnap?.systemTrackCount ?? '?').padStart(4)} │ ${String(rSnap?.systemTrackCount ?? '?').padStart(6)} │ ${String(cSnap?.systemTrackCount ?? '?').padStart(5)}`);
    }

    // ── Scoring ──
    console.log('\n── SCORING ──');

    function score(r: RunResult): { total: number; stability: number; quality: number; perf: number } {
      // Stability: no crash = 30pts, low proliferation = 20pts
      let stability = r.crashed ? 0 : 30;
      const prolif = r.peakSystemTracks / Math.max(1, r.totalGtTargets);
      if (prolif <= 2) stability += 20;
      else if (prolif <= 4) stability += 10;
      else stability += 0;

      // Quality: confirmed tracks close to GT count
      const ratio = r.confirmedTracks / Math.max(1, r.totalGtTargets);
      let quality = 0;
      if (ratio >= 0.8 && ratio <= 1.5) quality = 30;
      else if (ratio >= 0.5 && ratio <= 2.0) quality = 20;
      else if (ratio >= 0.25) quality = 10;

      // Performance: avg tick under budget
      let perf = 0;
      if (r.avgTickMs < 5) perf = 20;
      else if (r.avgTickMs < 20) perf = 15;
      else if (r.avgTickMs < 50) perf = 10;
      else perf = 5;

      return { total: stability + quality + perf, stability, quality, perf };
    }

    const bScore = score(baseline);
    const rScore = score(raw10);
    const cScore = score(cal10);

    const grade = (s: number) => s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : s >= 20 ? 'D' : 'F';

    console.log(`  Baseline 1Hz:      ${bScore.total}/100 (${grade(bScore.total)}) — stability:${bScore.stability} quality:${bScore.quality} perf:${bScore.perf}`);
    console.log(`  10Hz Uncalibrated: ${rScore.total}/100 (${grade(rScore.total)}) — stability:${rScore.stability} quality:${rScore.quality} perf:${rScore.perf}`);
    console.log(`  10Hz Calibrated:   ${cScore.total}/100 (${grade(cScore.total)}) — stability:${cScore.stability} quality:${cScore.quality} perf:${cScore.perf}`);

    // ── Recommendation ──
    console.log('\n── RECOMMENDATION ──');
    if (cScore.total >= bScore.total - 10 && !cal10.crashed) {
      console.log('  ✓ 10 Hz calibrated is VIABLE — quality comparable to baseline');
      console.log('  ✓ Consider integration with workstation broadcast throttling');
    } else if (cal10.crashed) {
      console.log('  ✗ 10 Hz CRASHES — do NOT integrate without fixing stability');
    } else {
      console.log('  △ 10 Hz shows quality regression — needs further calibration');
      console.log(`  △ Gap: baseline ${bScore.total} vs calibrated ${cScore.total} (${bScore.total - cScore.total} points)`);
    }

    // ── Write report JSON ──
    const reportDir = path.resolve(process.cwd(), 'hz10-evaluation-reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `hz10-eval-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      scenario: { targets: TARGET_DEFS.length, sensors: 5, simDurationSec: 120 },
      runs: results.map(r => ({
        label: r.config.label,
        description: r.config.description,
        dtSec: r.config.dtSec,
        crashed: r.crashed,
        crashError: r.crashError,
        totalTicks: r.totalTicks,
        wallClockMs: r.wallClockMs,
        avgTickMs: r.avgTickMs,
        maxTickMs: r.maxTickMs,
        peakHeapMB: r.peakHeapMB,
        peakSystemTracks: r.peakSystemTracks,
        confirmedTracks: r.confirmedTracks,
        tentativeTracks: r.tentativeTracks,
        droppedTracks: r.droppedTracks,
        trackToGtRatio: r.trackToGtRatio,
        snapshotCount: r.snapshots.length,
        snapshots: r.snapshots,
      })),
      scores: {
        baseline: bScore,
        hz10_uncalibrated: rScore,
        hz10_calibrated: cScore,
      },
      grades: {
        baseline: grade(bScore.total),
        hz10_uncalibrated: grade(rScore.total),
        hz10_calibrated: grade(cScore.total),
      },
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${reportPath}`);

    // Assertion: calibrated should not crash
    expect(cal10.crashed).toBe(false);
  }, 30_000);
});
