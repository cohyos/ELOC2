/**
 * Pipeline Latency Diagnostic Test
 *
 * Instruments the ELOC2 processing pipeline to identify timing-sensitive
 * handoff points that cause quality degradation. Tests measure:
 *
 * 1. Observation → Track creation latency
 * 2. Track confirmation → EO cue issuance latency
 * 3. EO cue → Bearing detection latency
 * 4. Bearing → EO track creation latency
 * 5. EO track → Geometry estimate latency
 * 6. Dwell completion → Target cycling latency
 * 7. End-to-end: observation → quality metric impact
 * 8. Time-domain mixing (Date.now vs sim time) bugs
 *
 * Each test captures per-tick snapshots to pinpoint WHERE in the pipeline
 * data stalls or gets lost.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';

// ---------------------------------------------------------------------------
// Helper — advance engine synchronously via seek()
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

/** Snapshot pipeline state at a given time. */
interface PipelineSnapshot {
  timeSec: number;
  trackCount: number;
  confirmedTracks: number;
  eoTrackCount: number;
  geometryEstimateCount: number;
  activeCueCount: number;
  taskCount: number;
  executingTasks: number;
  dwellingSensors: number;
  eoSensorCount: number;
  radarSensorCount: number;
  groundTruthCount: number;
  trackToTruthAssociation: number;
  positionErrorAvg: number;
  // EO allocation quality
  coverageEfficiency: number;
  geometryOptimality: number;
  dwellEfficiency: number;
  triangulationSuccess: number;
  sensorUtilization: number;
  // Chain quality
  chainQualityAvg: number;
  geometryQualityAvg: number;
  fusionDiversityAvg: number;
}

function takeSnapshot(engine: LiveEngine, timeSec: number): PipelineSnapshot {
  const state = engine.getState();
  const gt = engine.getGroundTruth();
  const quality = engine.getQualityMetrics();
  const allocation = engine.getEoAllocationQuality();
  const chains = engine.getDecisionChains();

  const confirmedTracks = state.tracks.filter(t => t.status === 'confirmed').length;
  const executingTasks = state.tasks.filter(t => t.status === 'executing').length;
  const eoSensors = state.sensors.filter(s => s.sensorType === 'eo');
  const radarSensors = state.sensors.filter(s => s.sensorType === 'radar');

  // Count sensors that are currently dwelling (have gimbal.currentTargetId set)
  const dwellingSensors = eoSensors.filter(s => s.gimbal?.currentTargetId).length;

  // Chain quality averages
  let chainQualitySum = 0;
  let geoQualitySum = 0;
  let fusionDivSum = 0;
  for (const chain of chains) {
    chainQualitySum += chain.chainQuality;
    geoQualitySum += chain.qualityBreakdown?.geometryQuality ?? 0;
    fusionDivSum += chain.qualityBreakdown?.fusionEfficiency ?? 0;
  }
  const chainCount = chains.length || 1;

  return {
    timeSec,
    trackCount: state.tracks.length,
    confirmedTracks,
    eoTrackCount: state.eoTracks.length,
    geometryEstimateCount: state.geometryEstimates.size,
    activeCueCount: state.activeCues.length,
    taskCount: state.tasks.length,
    executingTasks,
    dwellingSensors,
    eoSensorCount: eoSensors.length,
    radarSensorCount: radarSensors.length,
    groundTruthCount: gt.length,
    trackToTruthAssociation: quality?.trackToTruthAssociation ?? 0,
    positionErrorAvg: quality?.positionErrorAvg ?? 0,
    coverageEfficiency: allocation?.coverageEfficiency ?? 0,
    geometryOptimality: allocation?.geometryOptimality ?? 0,
    dwellEfficiency: allocation?.dwellEfficiency ?? 0,
    triangulationSuccess: allocation?.triangulationSuccessRate ?? 0,
    sensorUtilization: allocation?.sensorUtilization ?? 0,
    chainQualityAvg: chainQualitySum / chainCount,
    geometryQualityAvg: geoQualitySum / chainCount,
    fusionDiversityAvg: fusionDivSum / chainCount,
  };
}

// ---------------------------------------------------------------------------
// Pipeline Latency Diagnostic Tests
// ---------------------------------------------------------------------------

describe('Pipeline Latency Diagnostics', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 1: Observation → Track Creation Pipeline
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-1: measures observation-to-track creation latency', () => {
    const snapshots: PipelineSnapshot[] = [];

    // Sample every second for 30 seconds
    for (let t = 1; t <= 30; t++) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    // Find when first track appears
    const firstTrackTime = snapshots.find(s => s.trackCount > 0)?.timeSec ?? -1;
    // Find when first ground truth target is active
    const firstGtTime = snapshots.find(s => s.groundTruthCount > 0)?.timeSec ?? -1;

    const trackCreationLatency = firstTrackTime - firstGtTime;

    console.log('\n=== DIAG-1: Observation → Track Creation ===');
    console.log(`  First GT target active at: T+${firstGtTime}s`);
    console.log(`  First track created at: T+${firstTrackTime}s`);
    console.log(`  Track creation latency: ${trackCreationLatency}s`);
    console.log(`  Track count at T+10s: ${snapshots.find(s => s.timeSec === 10)?.trackCount ?? 0}`);
    console.log(`  Track count at T+30s: ${snapshots.find(s => s.timeSec === 30)?.trackCount ?? 0}`);

    expect(firstTrackTime).toBeGreaterThan(0);
    expect(trackCreationLatency).toBeLessThanOrEqual(5); // Should detect within 5s
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 2: Track Confirmation → EO Cue Issuance Pipeline
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-2: measures track-confirmation-to-EO-cue latency', () => {
    const snapshots: PipelineSnapshot[] = [];

    for (let t = 1; t <= 60; t++) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    // Find when first track is confirmed
    const firstConfirmedTime = snapshots.find(s => s.confirmedTracks > 0)?.timeSec ?? -1;
    // Find when first EO cue is issued (activeCues or tasks with EO sensor)
    const firstCueTime = snapshots.find(s => s.activeCueCount > 0)?.timeSec ?? -1;
    // Find when first task is executing
    const firstTaskTime = snapshots.find(s => s.executingTasks > 0)?.timeSec ?? -1;

    const cueLatency = firstCueTime > 0 && firstConfirmedTime > 0
      ? firstCueTime - firstConfirmedTime
      : -1;
    const taskLatency = firstTaskTime > 0 && firstConfirmedTime > 0
      ? firstTaskTime - firstConfirmedTime
      : -1;

    console.log('\n=== DIAG-2: Track Confirmation → EO Cue Issuance ===');
    console.log(`  First confirmed track at: T+${firstConfirmedTime}s`);
    console.log(`  First EO cue issued at: T+${firstCueTime}s`);
    console.log(`  First task executing at: T+${firstTaskTime}s`);
    console.log(`  Cue issuance latency: ${cueLatency}s (expected ≤3s, tasking interval)`);
    console.log(`  Task assignment latency: ${taskLatency}s`);

    // EO tasking runs every 3s, so cue should appear within 3s of confirmation
    if (firstConfirmedTime > 0 && firstCueTime > 0) {
      expect(cueLatency).toBeLessThanOrEqual(6); // At most 2 tasking cycles
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 3: EO Cue → Bearing Detection Pipeline
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-3: measures EO-cue-to-bearing-detection latency', () => {
    const snapshots: PipelineSnapshot[] = [];

    for (let t = 1; t <= 120; t++) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    // Find when first cue appears
    const firstCueTime = snapshots.find(s => s.activeCueCount > 0)?.timeSec ?? -1;
    // Find when first EO track appears (created from bearing detection)
    const firstEoTrackTime = snapshots.find(s => s.eoTrackCount > 0)?.timeSec ?? -1;

    const bearingLatency = firstEoTrackTime > 0 && firstCueTime > 0
      ? firstEoTrackTime - firstCueTime
      : -1;

    console.log('\n=== DIAG-3: EO Cue → Bearing Detection ===');
    console.log(`  First EO cue at: T+${firstCueTime}s`);
    console.log(`  First EO track (from bearing) at: T+${firstEoTrackTime}s`);
    console.log(`  Bearing detection latency: ${bearingLatency}s`);
    console.log(`  EO tracks at T+60s: ${snapshots.find(s => s.timeSec === 60)?.eoTrackCount ?? 0}`);
    console.log(`  EO tracks at T+120s: ${snapshots.find(s => s.timeSec === 120)?.eoTrackCount ?? 0}`);

    // Log the gap analysis
    if (firstEoTrackTime < 0) {
      console.log('  ⚠ PIPELINE GAP: No EO tracks created in 120s!');
      console.log('     Possible causes:');
      console.log('     - EO sensor bearing events not generated by simulator');
      console.log('     - Cues expire before sensor can detect (30s window)');
      console.log('     - matchBearingToCue() failing to match');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 4: EO Track → Geometry Estimation Pipeline
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-4: measures EO-track-to-geometry-estimate latency', () => {
    const snapshots: PipelineSnapshot[] = [];

    for (let t = 1; t <= 180; t++) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    const firstEoTrackTime = snapshots.find(s => s.eoTrackCount > 0)?.timeSec ?? -1;
    const firstGeometryTime = snapshots.find(s => s.geometryEstimateCount > 0)?.timeSec ?? -1;

    const geometryLatency = firstGeometryTime > 0 && firstEoTrackTime > 0
      ? firstGeometryTime - firstEoTrackTime
      : -1;

    console.log('\n=== DIAG-4: EO Track → Geometry Estimation ===');
    console.log(`  First EO track at: T+${firstEoTrackTime}s`);
    console.log(`  First geometry estimate at: T+${firstGeometryTime}s`);
    console.log(`  Geometry latency: ${geometryLatency}s`);
    console.log(`  Geometry estimates at T+120s: ${snapshots.find(s => s.timeSec === 120)?.geometryEstimateCount ?? 0}`);
    console.log(`  Geometry estimates at T+180s: ${snapshots.find(s => s.timeSec === 180)?.geometryEstimateCount ?? 0}`);

    if (firstGeometryTime < 0) {
      console.log('  ⚠ PIPELINE GAP: No geometry estimates in 180s!');
      console.log('     Requires ≥2 EO sensors with bearings on same track');
      console.log('     Check: are multiple EO sensors assigned to same track?');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 5: Dwell Completion & Target Cycling
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-5: measures dwell completion and cycling behavior', () => {
    const snapshots: PipelineSnapshot[] = [];

    for (let t = 1; t <= 60; t++) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    // Track how sensor dwelling changes over time
    const dwellTransitions: Array<{ time: number; dwelling: number; executing: number }> = [];
    let prevDwelling = 0;
    for (const snap of snapshots) {
      if (snap.dwellingSensors !== prevDwelling || snap.executingTasks !== prevDwelling) {
        dwellTransitions.push({
          time: snap.timeSec,
          dwelling: snap.dwellingSensors,
          executing: snap.executingTasks,
        });
        prevDwelling = snap.dwellingSensors;
      }
    }

    console.log('\n=== DIAG-5: Dwell Completion & Cycling ===');
    console.log(`  EO sensors available: ${snapshots[0]?.eoSensorCount ?? 0}`);
    console.log(`  Dwell transitions (first 10):`);
    for (const t of dwellTransitions.slice(0, 10)) {
      console.log(`    T+${t.time}s: ${t.dwelling} dwelling, ${t.executing} executing`);
    }

    // Calculate sensor idle time (periods where no dwell is active)
    let idleTicks = 0;
    for (const snap of snapshots) {
      if (snap.eoSensorCount > 0 && snap.dwellingSensors === 0) {
        idleTicks++;
      }
    }
    const idlePercent = snapshots.length > 0 ? (idleTicks / snapshots.length) * 100 : 0;
    console.log(`  EO sensor idle time: ${idlePercent.toFixed(1)}% (${idleTicks}/${snapshots.length} ticks)`);

    if (idlePercent > 50) {
      console.log('  ⚠ PIPELINE GAP: EO sensors idle >50% of the time!');
      console.log('     - Tasking cycle may be too slow (3s interval)');
      console.log('     - Dwell may be too long (15s default)');
      console.log('     - No candidates being generated');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 6: End-to-End Quality Evolution
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-6: tracks end-to-end quality metrics evolution over time', () => {
    const snapshots: PipelineSnapshot[] = [];

    // Sample at key intervals
    const sampleTimes = [10, 20, 30, 60, 90, 120, 150, 180, 240, 300];
    for (const t of sampleTimes) {
      advanceTo(engine, t);
      snapshots.push(takeSnapshot(engine, t));
    }

    console.log('\n=== DIAG-6: End-to-End Quality Evolution ===');
    console.log('  Time | Trks | Conf | EO   | Geo  | Cues | Tasks | Dwell | ChainQ | GeoQ  | FusDv | CovEff | DwellE | TriSuc | SensU');
    console.log('  -----+------+------+------+------+------+-------+-------+--------+-------+-------+--------+--------+--------+------');

    for (const s of snapshots) {
      console.log(
        `  ${String(s.timeSec).padStart(4)}s` +
        ` | ${String(s.trackCount).padStart(4)}` +
        ` | ${String(s.confirmedTracks).padStart(4)}` +
        ` | ${String(s.eoTrackCount).padStart(4)}` +
        ` | ${String(s.geometryEstimateCount).padStart(4)}` +
        ` | ${String(s.activeCueCount).padStart(4)}` +
        ` | ${String(s.executingTasks).padStart(5)}` +
        ` | ${String(s.dwellingSensors).padStart(5)}` +
        ` | ${(s.chainQualityAvg * 100).toFixed(0).padStart(5)}%` +
        ` | ${(s.geometryQualityAvg * 100).toFixed(0).padStart(4)}%` +
        ` | ${(s.fusionDiversityAvg * 100).toFixed(0).padStart(4)}%` +
        ` | ${s.coverageEfficiency.toFixed(0).padStart(5)}%` +
        ` | ${s.dwellEfficiency.toFixed(0).padStart(5)}%` +
        ` | ${s.triangulationSuccess.toFixed(0).padStart(5)}%` +
        ` | ${s.sensorUtilization.toFixed(0).padStart(4)}%`,
      );
    }

    // Identify gaps: quality metrics that stay at 0 despite having the prerequisites
    const lastSnapshot = snapshots[snapshots.length - 1];
    const gaps: string[] = [];

    if (lastSnapshot.confirmedTracks > 0 && lastSnapshot.eoTrackCount === 0) {
      gaps.push('GAP: Confirmed tracks exist but no EO tracks — EO pipeline not activating');
    }
    if (lastSnapshot.eoTrackCount > 0 && lastSnapshot.geometryEstimateCount === 0) {
      gaps.push('GAP: EO tracks exist but no geometry estimates — need ≥2 sensors on same track');
    }
    if (lastSnapshot.eoSensorCount > 0 && lastSnapshot.dwellEfficiency === 0) {
      gaps.push('GAP: EO sensors exist but dwell efficiency is 0% — no dwells recorded');
    }
    if (lastSnapshot.confirmedTracks > 0 && lastSnapshot.coverageEfficiency === 0) {
      gaps.push('GAP: Confirmed tracks exist but coverage efficiency is 0% — no EO investigation');
    }
    if (lastSnapshot.executingTasks > 0 && lastSnapshot.sensorUtilization === 0) {
      gaps.push('GAP: Tasks executing but sensor utilization is 0% — tasked ticks not counted');
    }
    if (lastSnapshot.fusionDiversityAvg < 0.5) {
      gaps.push(`GAP: Fusion diversity ${(lastSnapshot.fusionDiversityAvg * 100).toFixed(0)}% — tracks not gaining multi-sensor sources`);
    }

    console.log('\n  Pipeline Gaps Identified:');
    if (gaps.length === 0) {
      console.log('    None — pipeline is flowing correctly');
    } else {
      for (const gap of gaps) {
        console.log(`    ⚠ ${gap}`);
      }
    }

    // The test passes to generate the diagnostic output
    // but flags the gap count for the developer
    expect(lastSnapshot.trackCount).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 7: Time Domain Mixing Detection
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-7: detects time-domain mixing bugs (Date.now vs sim time)', () => {
    // The critical issue: isCueValid() uses Date.now() (wall clock ms)
    // while cue validity is set from Date.now() at issuance.
    // But expireStaleEoCues also uses Date.now().
    // Meanwhile, dwell state uses simulation time (seconds).
    //
    // At seek() speed (instant), Date.now() barely advances while
    // simulation time advances by many seconds. This can cause:
    // - Cues to expire prematurely or never expire
    // - Dwells to complete but cues still "valid" (or vice versa)

    advanceTo(engine, 30); // Get tracks created
    const state30 = engine.getState();
    const cuesBefore = state30.activeCues.length;
    const tasksBefore = state30.tasks.filter(t => t.status === 'executing').length;

    // Advance rapidly — sim time jumps 60s but wall time barely moves
    advanceTo(engine, 90);
    const state90 = engine.getState();

    console.log('\n=== DIAG-7: Time Domain Mixing Detection ===');
    console.log(`  At T+30s: ${cuesBefore} cues, ${tasksBefore} executing tasks`);
    console.log(`  At T+90s: ${state90.activeCues.length} cues, ${state90.tasks.filter(t => t.status === 'executing').length} executing tasks`);

    // Check for cues that should have expired but didn't
    // Cues use Date.now() with 30s window. In seek mode, Date.now()
    // only advances a few ms, so cues from T+30s are still "valid" at T+90s
    // even though 60 simulation seconds have passed.
    const now = Date.now();
    let staleCount = 0;
    for (const cue of state90.activeCues) {
      const ageMs = now - (cue.validFrom as number);
      const ageSec = ageMs / 1000;
      if (ageSec < 5) {
        // Cue was created recently in wall time but should be stale in sim time
        staleCount++;
      }
    }

    // Check for dwells that completed in sim time but cue is still active
    const dwellCompletedButCueActive = state90.tasks.filter(t => {
      if (t.status !== 'executing') return false;
      const cue = state90.activeCues.find(c => c.cueId === t.cueId);
      return cue !== undefined;
    }).length;

    console.log(`  Wall clock age of cues: most are < 5s old (seek is instant)`);
    console.log(`  Potentially stale cues (wall-clock fresh but sim-time old): ${staleCount}`);
    console.log(`  Tasks with active cues: ${dwellCompletedButCueActive}`);

    // This is informational — the bug exists inherently in the seek() path
    // The real fix is to use sim time for cue validity
    if (staleCount > 0) {
      console.log('  ⚠ TIME DOMAIN MISMATCH: Cues use Date.now() for validity');
      console.log('     but sim time advances independently. At >1x speed or');
      console.log('     seek, cues may expire too slow or too fast.');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 8: EO Coverage Efficiency vs EO Track Association
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-8: analyzes EO coverage gap - why confirmed tracks lack EO investigation', () => {
    advanceTo(engine, 120);
    const state = engine.getState();
    const allocation = engine.getEoAllocationQuality();

    const confirmedTracks = state.tracks.filter(t => t.status === 'confirmed');
    const eoSensors = state.sensors.filter(s => s.sensorType === 'eo');

    // For each confirmed track, check if it has EO tracks
    const trackCoverage: Array<{
      trackId: string;
      hasEoTrack: boolean;
      hasCue: boolean;
      hasTask: boolean;
      investigationStatus: string;
    }> = [];

    for (const track of confirmedTracks) {
      const trackId = track.systemTrackId as string;
      const hasEoTrack = state.eoTracks.some(
        et => (et.associatedSystemTrackId as string) === trackId,
      );
      const hasCue = state.activeCues.some(
        c => (c.systemTrackId as string) === trackId,
      );
      const hasTask = state.tasks.some(
        t => (t.systemTrackId as string) === trackId && t.status === 'executing',
      );

      trackCoverage.push({
        trackId: trackId.slice(0, 8),
        hasEoTrack,
        hasCue,
        hasTask,
        investigationStatus: track.eoInvestigationStatus ?? 'none',
      });
    }

    console.log('\n=== DIAG-8: EO Coverage Gap Analysis ===');
    console.log(`  Confirmed tracks: ${confirmedTracks.length}`);
    console.log(`  EO sensors: ${eoSensors.length}`);
    console.log(`  EO tracks: ${state.eoTracks.length}`);
    console.log(`  Coverage efficiency: ${allocation?.coverageEfficiency?.toFixed(1) ?? 0}%`);
    console.log(`\n  Per-track breakdown:`);
    for (const tc of trackCoverage) {
      const status = [];
      if (tc.hasTask) status.push('TASK');
      if (tc.hasCue) status.push('CUE');
      if (tc.hasEoTrack) status.push('EO_TRACK');
      if (status.length === 0) status.push('NONE');
      console.log(`    Track ${tc.trackId}: ${status.join(', ')} | investigation: ${tc.investigationStatus}`);
    }

    // Diagnose the gap
    const withoutEo = trackCoverage.filter(tc => !tc.hasEoTrack);
    const withCueButNoEo = trackCoverage.filter(tc => tc.hasCue && !tc.hasEoTrack);
    const withTaskButNoEo = trackCoverage.filter(tc => tc.hasTask && !tc.hasEoTrack);

    if (withoutEo.length > 0) {
      console.log(`\n  ⚠ ${withoutEo.length}/${trackCoverage.length} confirmed tracks lack EO tracks`);
    }
    if (withCueButNoEo.length > 0) {
      console.log(`  ⚠ ${withCueButNoEo.length} tracks have cues but no EO tracks — bearings not arriving`);
    }
    if (withTaskButNoEo.length > 0) {
      console.log(`  ⚠ ${withTaskButNoEo.length} tracks have tasks but no EO tracks — sensor not detecting`);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 9: Sensor Utilization Deep Dive
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-9: analyzes per-sensor utilization and idle periods', () => {
    const sensorTimeline: Map<string, Array<{ time: number; targeting: string | null }>> = new Map();

    for (let t = 1; t <= 60; t++) {
      advanceTo(engine, t);
      const state = engine.getState();
      const eoSensors = state.sensors.filter(s => s.sensorType === 'eo');

      for (const sensor of eoSensors) {
        const sensorId = sensor.sensorId as string;
        if (!sensorTimeline.has(sensorId)) {
          sensorTimeline.set(sensorId, []);
        }
        sensorTimeline.get(sensorId)!.push({
          time: t,
          targeting: (sensor.gimbal?.currentTargetId as string) ?? null,
        });
      }
    }

    console.log('\n=== DIAG-9: Per-Sensor Utilization ===');
    for (const [sensorId, timeline] of sensorTimeline) {
      const totalTicks = timeline.length;
      const activeTicks = timeline.filter(t => t.targeting !== null).length;
      const utilization = totalTicks > 0 ? (activeTicks / totalTicks) * 100 : 0;

      // Find first active tick
      const firstActive = timeline.find(t => t.targeting !== null)?.time ?? -1;

      // Count target switches (cycling)
      let switches = 0;
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i].targeting !== timeline[i - 1].targeting && timeline[i].targeting !== null) {
          switches++;
        }
      }

      console.log(`  ${sensorId}: ${utilization.toFixed(0)}% utilized, first active at T+${firstActive}s, ${switches} target switches`);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 10: Pipeline Bottleneck Summary
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-10: comprehensive pipeline bottleneck analysis', () => {
    // Run full 300s scenario
    advanceTo(engine, 300);
    const state = engine.getState();
    const quality = engine.getQualityMetrics();
    const allocation = engine.getEoAllocationQuality();
    const chains = engine.getDecisionChains();

    const confirmed = state.tracks.filter(t => t.status === 'confirmed').length;
    const eoSensors = state.sensors.filter(s => s.sensorType === 'eo').length;

    console.log('\n=== DIAG-10: Pipeline Bottleneck Summary (T+300s) ===');
    console.log('\n  PIPELINE STAGE HEALTH:');

    const stages = [
      {
        name: '1. Detection',
        ok: state.tracks.length > 0,
        detail: `${state.tracks.length} tracks (${confirmed} confirmed)`,
      },
      {
        name: '2. Association',
        ok: (quality?.trackToTruthAssociation ?? 0) > 0.5,
        detail: `${((quality?.trackToTruthAssociation ?? 0) * 100).toFixed(0)}% track-to-truth`,
      },
      {
        name: '3. Position',
        ok: (quality?.positionErrorAvg ?? Infinity) < 2000,
        detail: `${(quality?.positionErrorAvg ?? 0).toFixed(0)}m avg error`,
      },
      {
        name: '4. EO Tasking',
        ok: state.tasks.some(t => t.status === 'executing'),
        detail: `${state.tasks.filter(t => t.status === 'executing').length} executing`,
      },
      {
        name: '5. EO Cues',
        ok: state.activeCues.length > 0 || state.eoTracks.length > 0,
        detail: `${state.activeCues.length} active cues`,
      },
      {
        name: '6. EO Bearing',
        ok: state.eoTracks.length > 0,
        detail: `${state.eoTracks.length} EO tracks`,
      },
      {
        name: '7. Geometry',
        ok: state.geometryEstimates.size > 0,
        detail: `${state.geometryEstimates.size} estimates`,
      },
      {
        name: '8. Dwell Mgmt',
        ok: (allocation?.dwellEfficiency ?? 0) > 10,
        detail: `${(allocation?.dwellEfficiency ?? 0).toFixed(0)}% dwell efficiency`,
      },
      {
        name: '9. Coverage',
        ok: (allocation?.coverageEfficiency ?? 0) > 10,
        detail: `${(allocation?.coverageEfficiency ?? 0).toFixed(0)}% coverage efficiency`,
      },
      {
        name: '10. Fusion Div',
        ok: chains.some(c => (c.qualityBreakdown?.fusionEfficiency ?? 0) > 0.5),
        detail: `${chains.length > 0 ? (chains.reduce((s, c) => s + (c.qualityBreakdown?.fusionEfficiency ?? 0), 0) / chains.length * 100).toFixed(0) : 0}% avg`,
      },
    ];

    let firstFailure = -1;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const icon = s.ok ? '✓' : '✗';
      console.log(`    ${icon} ${s.name}: ${s.detail}`);
      if (!s.ok && firstFailure === -1) firstFailure = i;
    }

    if (firstFailure >= 0) {
      console.log(`\n  BOTTLENECK: Pipeline breaks at stage ${firstFailure + 1} (${stages[firstFailure].name})`);
      console.log('  All downstream stages are degraded because of this upstream failure.');
    } else {
      console.log('\n  Pipeline is healthy — all stages operational.');
    }

    // Print overall quality
    const avgChainQ = chains.length > 0
      ? chains.reduce((s, c) => s + c.chainQuality, 0) / chains.length
      : 0;
    console.log(`\n  Overall chain quality: ${(avgChainQ * 100).toFixed(0)}%`);
    console.log(`  Picture accuracy: ${quality?.pictureAccuracy?.toFixed(0) ?? 0}%`);

    expect(state.tracks.length).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 11: Radar Pipeline - Track Proliferation / Ghost Tracks
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-11: detects radar track proliferation (ghost tracks from single target)', () => {
    const snapshots: Array<{
      timeSec: number;
      trackCount: number;
      confirmedCount: number;
      tentativeCount: number;
      droppedFilteredCount: number;
      gtCount: number;
      trackToTruthRatio: number;
      falseTrackRate: number;
      posErrorAvg: number;
      trackIds: string[];
      trackSources: Array<{ id: string; sources: string[]; status: string; confidence: number }>;
    }> = [];

    for (let t = 1; t <= 120; t++) {
      advanceTo(engine, t);
      const state = engine.getState();
      const gt = engine.getGroundTruth();
      const quality = engine.getQualityMetrics();

      const tracks = state.tracks;
      const confirmed = tracks.filter(t => t.status === 'confirmed');
      const tentative = tracks.filter(t => t.status === 'tentative');

      snapshots.push({
        timeSec: t,
        trackCount: tracks.length,
        confirmedCount: confirmed.length,
        tentativeCount: tentative.length,
        droppedFilteredCount: 0, // dropped are already filtered out
        gtCount: gt.length,
        trackToTruthRatio: gt.length > 0 ? tracks.length / gt.length : 0,
        falseTrackRate: quality?.falseTrackRate ?? 0,
        posErrorAvg: quality?.positionErrorAvg ?? 0,
        trackIds: tracks.map(t => (t.systemTrackId as string).slice(0, 8)),
        trackSources: tracks.map(t => ({
          id: (t.systemTrackId as string).slice(0, 8),
          sources: [...(t.sources || [])],
          status: t.status,
          confidence: t.confidence,
        })),
      });
    }

    console.log('\n=== DIAG-11: Radar Track Proliferation ===');
    console.log('  Time | Trks | Conf | Tent | GT  | Ratio | FalseR | PosErr');
    console.log('  -----+------+------+------+-----+-------+--------+-------');

    // Print every 10 seconds
    for (const s of snapshots.filter(s => s.timeSec % 10 === 0 || s.timeSec <= 5)) {
      console.log(
        `  ${String(s.timeSec).padStart(4)}s` +
        ` | ${String(s.trackCount).padStart(4)}` +
        ` | ${String(s.confirmedCount).padStart(4)}` +
        ` | ${String(s.tentativeCount).padStart(4)}` +
        ` | ${String(s.gtCount).padStart(3)}` +
        ` | ${s.trackToTruthRatio.toFixed(1).padStart(5)}` +
        ` | ${(s.falseTrackRate * 100).toFixed(0).padStart(5)}%` +
        ` | ${s.posErrorAvg.toFixed(0).padStart(5)}m`,
      );
    }

    // Identify proliferation: track count should be close to GT count
    const lastSnap = snapshots[snapshots.length - 1];
    const peakTrackCount = Math.max(...snapshots.map(s => s.trackCount));
    const avgTrackCount = snapshots.filter(s => s.timeSec > 10)
      .reduce((sum, s) => sum + s.trackCount, 0) / snapshots.filter(s => s.timeSec > 10).length;

    console.log(`\n  Peak track count: ${peakTrackCount} (vs ${lastSnap.gtCount} GT targets)`);
    console.log(`  Avg track count (after T+10s): ${avgTrackCount.toFixed(1)}`);
    console.log(`  Final track-to-truth ratio: ${lastSnap.trackToTruthRatio.toFixed(1)}:1`);
    console.log(`  Final false track rate: ${(lastSnap.falseTrackRate * 100).toFixed(0)}%`);

    if (lastSnap.trackToTruthRatio > 2) {
      console.log(`\n  ⚠ TRACK PROLIFERATION DETECTED: ${lastSnap.trackToTruthRatio.toFixed(1)}x tracks per target`);
      console.log('     Track-to-Truth ratio should be ~1.0');
      console.log('     Causes:');
      console.log('     - Correlation gate too small → radar obs creates new track instead of updating');
      console.log('     - Merge distance too small → ghost tracks persist');
      console.log('     - Observation timestamp mismatch → prediction dt too large → gate miss');
      console.log('     - Covariance growth too fast between observations');

      // Print track details for last snapshot
      console.log('\n  Active tracks at T+120s:');
      for (const t of lastSnap.trackSources) {
        console.log(`    ${t.id}: status=${t.status}, conf=${t.confidence.toFixed(2)}, sources=[${t.sources.join(',')}]`);
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 12: Radar Observation Processing Timing
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-12: measures radar observation processing and correlation timing', () => {
    const correlationStats: Array<{
      timeSec: number;
      newTracks: number;
      updatedTracks: number;
      totalObs: number;
    }> = [];

    let prevTrackIds = new Set<string>();

    for (let t = 1; t <= 60; t++) {
      advanceTo(engine, t);
      const state = engine.getState();
      const currentTrackIds = new Set(state.tracks.map(t => t.systemTrackId as string));

      // Count new tracks this tick
      const newTracks = [...currentTrackIds].filter(id => !prevTrackIds.has(id)).length;
      // Count tracks that existed before (updated)
      const updatedTracks = [...currentTrackIds].filter(id => prevTrackIds.has(id)).length;

      // Count total observations from radar sensors (approximate from events)
      const radarSensors = state.sensors.filter(s => s.sensorType === 'radar');

      correlationStats.push({
        timeSec: t,
        newTracks,
        updatedTracks,
        totalObs: radarSensors.length, // 1 obs per radar per second (approximate)
      });

      prevTrackIds = currentTrackIds;
    }

    console.log('\n=== DIAG-12: Radar Correlation Timing ===');

    // Sum new vs updated
    const totalNew = correlationStats.reduce((s, c) => s + c.newTracks, 0);
    const totalUpdated = correlationStats.reduce((s, c) => s + c.updatedTracks, 0);

    console.log(`  Total new tracks created: ${totalNew}`);
    console.log(`  Total track updates: ${totalUpdated}`);
    console.log(`  New:Update ratio: ${totalNew > 0 ? (totalNew / Math.max(1, totalUpdated)).toFixed(2) : 'N/A'}`);

    // Identify bursts of new track creation
    const bursts = correlationStats.filter(c => c.newTracks > 1);
    if (bursts.length > 0) {
      console.log(`\n  ⚠ Track creation bursts (>1 new track in single tick):`);
      for (const b of bursts.slice(0, 10)) {
        console.log(`    T+${b.timeSec}s: ${b.newTracks} new tracks`);
      }
      console.log('     This indicates correlation gate failures — observations');
      console.log('     from the same target creating separate tracks.');
    }

    // Check for steady-state: after initial detection, new tracks should be rare
    const steadyState = correlationStats.filter(c => c.timeSec > 15);
    const steadyNewTrackRate = steadyState.reduce((s, c) => s + c.newTracks, 0) / steadyState.length;
    console.log(`\n  Steady-state new track rate (after T+15s): ${steadyNewTrackRate.toFixed(2)}/tick`);

    if (steadyNewTrackRate > 0.5) {
      console.log('  ⚠ HIGH NEW TRACK RATE: System keeps creating new tracks for existing targets');
      console.log('     Correlation is failing to associate observations to existing tracks');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 13: Radar-Only Quality Degradation Root Cause
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-13: radar-only quality analysis (no EO dependency)', () => {
    advanceTo(engine, 300);
    const state = engine.getState();
    const quality = engine.getQualityMetrics();
    const gt = engine.getGroundTruth();
    const chains = engine.getDecisionChains();

    console.log('\n=== DIAG-13: Radar-Only Quality Analysis ===');

    // Focus on metrics that should work with radar-only pipeline
    console.log('\n  RADAR PIPELINE METRICS:');
    console.log(`    Ground truth targets: ${gt.length}`);
    console.log(`    System tracks: ${state.tracks.length}`);
    console.log(`    Confirmed: ${state.tracks.filter(t => t.status === 'confirmed').length}`);
    console.log(`    Tentative: ${state.tracks.filter(t => t.status === 'tentative').length}`);
    console.log(`    Track-to-Truth Association: ${((quality?.trackToTruthAssociation ?? 0) * 100).toFixed(1)}%`);
    console.log(`    Position Error Avg: ${(quality?.positionErrorAvg ?? 0).toFixed(0)}m`);
    console.log(`    Position Error Max: ${(quality?.positionErrorMax ?? 0).toFixed(0)}m`);
    console.log(`    Classification Accuracy: ${((quality?.classificationAccuracy ?? 0) * 100).toFixed(0)}%`);
    console.log(`    Coverage: ${((quality?.coveragePercent ?? 0) * 100).toFixed(0)}%`);
    console.log(`    False Track Rate: ${((quality?.falseTrackRate ?? 0) * 100).toFixed(0)}%`);

    // Sensor utilization
    if (quality?.sensorUtilization) {
      console.log('\n  SENSOR UTILIZATION:');
      for (const [sensorId, util] of Object.entries(quality.sensorUtilization)) {
        const sensor = state.sensors.find(s => (s.sensorId as string) === sensorId);
        const type = sensor?.sensorType ?? 'unknown';
        console.log(`    ${sensorId} (${type}): ${(util * 100).toFixed(0)}%`);
      }
    }

    // Decision chain breakdown
    if (chains.length > 0) {
      console.log('\n  DECISION CHAIN QUALITY BREAKDOWN (avg):');
      const totals = {
        detection: 0, position: 0, correlation: 0,
        promotion: 0, classification: 0, geometry: 0, fusion: 0,
      };
      for (const chain of chains) {
        const b = chain.qualityBreakdown;
        totals.detection += b?.detectionLatency ?? 0;
        totals.position += b?.positionAccuracy ?? 0;
        totals.correlation += b?.correlationCorrectness ?? 0;
        totals.promotion += b?.promotionSpeed ?? 0;
        totals.classification += b?.classificationAccuracy ?? 0;
        totals.geometry += b?.geometryQuality ?? 0;
        totals.fusion += b?.fusionEfficiency ?? 0;
      }
      const n = chains.length;
      console.log(`    Detection Speed:   ${(totals.detection / n * 100).toFixed(0)}% (weight 15%)`);
      console.log(`    Position Accuracy: ${(totals.position / n * 100).toFixed(0)}% (weight 20%)`);
      console.log(`    Correlation:       ${(totals.correlation / n * 100).toFixed(0)}% (weight 15%)`);
      console.log(`    Track Promotion:   ${(totals.promotion / n * 100).toFixed(0)}% (weight 15%)`);
      console.log(`    Classification:    ${(totals.classification / n * 100).toFixed(0)}% (weight 10%)`);
      console.log(`    Geometry:          ${(totals.geometry / n * 100).toFixed(0)}% (weight 15%) ← requires EO`);
      console.log(`    Fusion Diversity:  ${(totals.fusion / n * 100).toFixed(0)}% (weight 10%) ← requires multi-sensor`);

      // The chain quality formula is inherently penalizing radar-only scenarios:
      // geometry (15% weight) = 0 without EO
      // fusion diversity (10% weight) = 33% with single radar
      // This means max achievable quality with 1 radar is ~79.3%
      const maxRadarOnly = 1.0 * 0.15 + 1.0 * 0.20 + 1.0 * 0.15 + 1.0 * 0.15 + 1.0 * 0.10 + 0.0 * 0.15 + 0.333 * 0.10;
      console.log(`\n  THEORETICAL MAX (1 radar, no EO): ${(maxRadarOnly * 100).toFixed(1)}%`);
      console.log('    → Geometry (15% weight) is always 0% without EO');
      console.log('    → Fusion diversity (10% weight) maxes at 33% with 1 sensor');
      console.log('    → This is a FORMULA ISSUE, not a pipeline delay');
    }

    // Track sources analysis
    console.log('\n  TRACK SOURCE ANALYSIS:');
    for (const track of state.tracks) {
      const trackId = (track.systemTrackId as string).slice(0, 8);
      console.log(`    Track ${trackId}: ${track.status}, conf=${track.confidence.toFixed(2)}, sources=[${(track.sources || []).join(',')}]`);
    }

    // FALSE TRACK ANALYSIS
    if ((quality?.falseTrackRate ?? 0) > 0.3) {
      console.log('\n  ⚠ HIGH FALSE TRACK RATE DETECTED');
      console.log('     Possible causes:');
      console.log('     1. Correlation gate failing → same target creates multiple tracks');
      console.log('     2. Track merge distance too small → ghost tracks persist');
      console.log('     3. Track drop (5 misses) too slow → stale tracks linger');
      console.log('     4. Observation timestamps cause prediction overshoot');
    }

    expect(state.tracks.length).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 14: Observation Timestamp Consistency
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-14: checks observation timestamp consistency for correlation', () => {
    // The correlator uses track.lastUpdated for prediction dt.
    // If timestamps are inconsistent (mixing Date.now with sim timestamps),
    // prediction dt explodes → gate miss → ghost tracks.

    advanceTo(engine, 30);
    const state = engine.getState();

    console.log('\n=== DIAG-14: Observation Timestamp Consistency ===');

    let dateNowTimestamps = 0;
    let simTimestamps = 0;
    let ambiguous = 0;

    for (const track of state.tracks) {
      const ts = track.lastUpdated as number;
      // Date.now() timestamps are ~1.7e12 (year 2024+)
      // Simulation timestamps are 0-600 (seconds since start)
      if (ts > 1e10) {
        dateNowTimestamps++;
        console.log(`    Track ${(track.systemTrackId as string).slice(0, 8)}: lastUpdated=${ts} (Date.now — wall clock)`);
      } else if (ts >= 0 && ts < 100000) {
        simTimestamps++;
        console.log(`    Track ${(track.systemTrackId as string).slice(0, 8)}: lastUpdated=${ts} (sim time seconds)`);
      } else {
        ambiguous++;
        console.log(`    Track ${(track.systemTrackId as string).slice(0, 8)}: lastUpdated=${ts} (AMBIGUOUS)`);
      }
    }

    console.log(`\n  Date.now timestamps: ${dateNowTimestamps}`);
    console.log(`  Sim-time timestamps: ${simTimestamps}`);
    console.log(`  Ambiguous: ${ambiguous}`);

    if (dateNowTimestamps > 0 && simTimestamps > 0) {
      console.log('\n  ⚠ MIXED TIME DOMAINS: Some tracks use Date.now, others use sim time');
      console.log('     This causes correlation prediction dt to be wildly wrong');
      console.log('     Fix: ensure ALL tracks use observation.timestamp (sim time)');
    }

    if (dateNowTimestamps > 0 && simTimestamps === 0) {
      console.log('\n  ⚠ ALL TRACKS USE Date.now TIMESTAMPS');
      console.log('     At >1x speed, Date.now diverges from sim time');
      console.log('     Correlation dt will be wrong, causing gate failures');
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // TEST 15: Complete Pipeline Timing Summary
  // ────────────────────────────────────────────────────────────────────────

  it('DIAG-15: complete pipeline timing summary with recommendations', { timeout: 30000 }, () => {
    const timings: Record<string, { firstSeen: number; label: string }> = {};

    for (let t = 1; t <= 300; t++) {
      advanceTo(engine, t);
      const state = engine.getState();
      const gt = engine.getGroundTruth();

      if (!timings['gt'] && gt.length > 0)
        timings['gt'] = { firstSeen: t, label: 'Ground truth target active' };
      if (!timings['track'] && state.tracks.length > 0)
        timings['track'] = { firstSeen: t, label: 'First system track created' };
      if (!timings['confirmed'] && state.tracks.some(t => t.status === 'confirmed'))
        timings['confirmed'] = { firstSeen: t, label: 'First track confirmed' };
      if (!timings['cue'] && state.activeCues.length > 0)
        timings['cue'] = { firstSeen: t, label: 'First EO cue issued' };
      if (!timings['task'] && state.tasks.some(t => t.status === 'executing'))
        timings['task'] = { firstSeen: t, label: 'First EO task executing' };
      if (!timings['eoTrack'] && state.eoTracks.length > 0)
        timings['eoTrack'] = { firstSeen: t, label: 'First EO track (bearing detected)' };
      if (!timings['geometry'] && state.geometryEstimates.size > 0)
        timings['geometry'] = { firstSeen: t, label: 'First geometry estimate' };

      // Early exit if all milestones reached
      if (Object.keys(timings).length >= 7) break;
    }

    console.log('\n=== DIAG-15: Pipeline Timing Summary ===');
    console.log('\n  PIPELINE MILESTONES:');

    const ordered = Object.entries(timings).sort((a, b) => a[1].firstSeen - b[1].firstSeen);
    let prevTime = 0;
    for (const [key, { firstSeen, label }] of ordered) {
      const delta = firstSeen - prevTime;
      console.log(`    T+${String(firstSeen).padStart(3)}s (+${String(delta).padStart(3)}s): ${label}`);
      prevTime = firstSeen;
    }

    // Missing milestones
    const expected = ['gt', 'track', 'confirmed', 'cue', 'task', 'eoTrack', 'geometry'];
    const missing = expected.filter(k => !timings[k]);
    if (missing.length > 0) {
      console.log('\n  ⚠ MISSING MILESTONES (never reached in 300s):');
      const labels: Record<string, string> = {
        gt: 'Ground truth', track: 'Track creation', confirmed: 'Track confirmation',
        cue: 'EO cue', task: 'EO task', eoTrack: 'EO bearing', geometry: 'Geometry estimate',
      };
      for (const m of missing) {
        console.log(`    ✗ ${labels[m]}`);
      }
    }

    // Pipeline gaps
    console.log('\n  PIPELINE GAP ANALYSIS:');
    if (timings['track'] && timings['gt']) {
      const gap = timings['track'].firstSeen - timings['gt'].firstSeen;
      const status = gap <= 2 ? 'OK' : gap <= 5 ? 'ACCEPTABLE' : 'SLOW';
      console.log(`    Detection gap (GT→Track): ${gap}s [${status}]`);
    }
    if (timings['confirmed'] && timings['track']) {
      const gap = timings['confirmed'].firstSeen - timings['track'].firstSeen;
      const status = gap <= 3 ? 'OK' : gap <= 10 ? 'ACCEPTABLE' : 'SLOW';
      console.log(`    Confirmation gap (Track→Confirmed): ${gap}s [${status}]`);
    }
    if (timings['cue'] && timings['confirmed']) {
      const gap = timings['cue'].firstSeen - timings['confirmed'].firstSeen;
      const status = gap <= 3 ? 'OK' : gap <= 6 ? 'ACCEPTABLE' : 'SLOW';
      console.log(`    EO tasking gap (Confirmed→Cue): ${gap}s [${status}]`);
    }
    if (timings['eoTrack'] && timings['cue']) {
      const gap = timings['eoTrack'].firstSeen - timings['cue'].firstSeen;
      const status = gap <= 5 ? 'OK' : gap <= 15 ? 'ACCEPTABLE' : 'SLOW';
      console.log(`    Bearing gap (Cue→EO Track): ${gap}s [${status}]`);
    }
    if (timings['geometry'] && timings['eoTrack']) {
      const gap = timings['geometry'].firstSeen - timings['eoTrack'].firstSeen;
      const status = gap <= 5 ? 'OK' : gap <= 30 ? 'ACCEPTABLE' : 'SLOW';
      console.log(`    Geometry gap (EO Track→Geometry): ${gap}s [${status}]`);
    }

    console.log('\n  RECOMMENDATIONS:');
    console.log('    See test output for specific bottleneck identification.');

    expect(timings['track']).toBeDefined();
  });
});
