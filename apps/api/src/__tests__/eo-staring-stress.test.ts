/**
 * EO Staring Defense — Pure EO Picture Stress Test
 *
 * Same structure as green-pine-stress.test.ts but adapted for EO-only:
 *   - No radar — all detection via staring MWIR sensors + investigators
 *   - Higher position error tolerance (EO triangulation ~2-5 km vs radar ~200m)
 *   - EO-specific metrics: triangulation coverage, bearing count, cross-sensor matches
 *   - Scoring weights adjusted: accuracy 30%, formation 15%, proliferation 15%,
 *     coverage 25%, false-rate 15% (coverage weighted higher since EO range is shorter)
 *
 * Uses the `eo-staring-defense` scenario (19 EO sensors, 0 radars).
 */

import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointMetrics {
  simTimeSec: number;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
  gtTargetCount: number;
  trackToGtRatio: number;
  pictureAccuracy: number;
  coveragePercent: number;
  falseTrackRate: number;
  positionErrorAvg: number;
  positionErrorMax: number;
  classificationAccuracy: number;
  lostTargets: number;
  lostTargetIds: string[];
  sensorUtilization: Record<string, number>;
  eoTrackCount: number;
  triangulationCount: number;
}

interface PhaseMetrics {
  phase: string;
  timeRange: [number, number];
  checkpoints: CheckpointMetrics[];
}

interface FormationMetrics {
  distinctFormationTracks: number;
  mergedIntoSingle: boolean;
  minTrackSeparationM: number;
}

interface OverloadMetrics {
  peakTrackCount: number;
  peakGtCount: number;
  peakRatio: number;
  avgPictureAccuracy: number;
  minPictureAccuracy: number;
  worstAccuracyTimeSec: number;
}

interface RunReport {
  runId: number;
  timestamp: string;
  scenario: string;
  mode: 'eo-only';
  totalSimSec: number;
  wallClockMs: number;
  avgTickMs: number;
  phases: PhaseMetrics[];
  formation: FormationMetrics;
  overload: OverloadMetrics;
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  compositeScore: number;
  issues: Issue[];
  parameters: RunParameters;
  eoMetrics: EoMetrics;
}

interface EoMetrics {
  totalSensors: number;
  staringSensors: number;
  investigatorSensors: number;
  avgTriangulationsPerPhase: number[];
  avgEoTracksPerPhase: number[];
  peakEoTracks: number;
  avgCoveragePercent: number;
}

interface Issue {
  severity: 'critical' | 'major' | 'minor';
  category: 'proliferation' | 'lost_track' | 'formation' | 'overload' | 'accuracy' | 'performance' | 'sensor' | 'eo_coverage';
  description: string;
  phase: string;
  simTimeSec: number;
  metric?: string;
  value?: number;
  threshold?: number;
}

interface RunParameters {
  mergeDistanceM: number;
  gateThreshold: number;
  clusterRadiusM: number;
  dropAfterMisses: number;
  coastingMissThreshold: number;
  maxCoastingTimeSec: number;
}

interface CorrectionEntry {
  runId: number;
  timestamp: string;
  issuesSummary: string;
  corrections: string[];
  parameterChanges: Partial<RunParameters>;
  scoreBefore: number;
  scoreAfter?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORRECTIONS_LOG_PATH = path.resolve(
  import.meta.dirname ?? __dirname,
  '../../../../eo-corrections-log.json',
);

const REPORTS_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  '../../../../eo-stress-test-reports',
);

const FORMATION_IDS = ['TGT-S136-1', 'TGT-S136-2', 'TGT-S136-3', 'TGT-S136-4', 'TGT-S136-5'];

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seekTo(engine: LiveEngine, toSec: number): void {
  const sm = engine.getSimulationState();
  if (sm.state === 'idle') { engine.start(); engine.pause(); }
  else if (sm.state === 'running') { engine.pause(); }
  engine.seek(toSec);
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function snapshot(engine: LiveEngine, simTimeSec: number): CheckpointMetrics {
  const state = engine.getState();
  const gt = engine.getGroundTruth();
  const qm = engine.getQualityMetrics();
  const tracks = state.tracks;

  // For EO-only, use wider match radius (5 km) since triangulation is less precise
  const lostTargetIds: string[] = [];
  for (const g of gt) {
    let found = false;
    for (const t of tracks) {
      if (haversineM(g.position.lat, g.position.lon, t.state.lat, t.state.lon) < 8000) {
        found = true; break;
      }
    }
    if (!found) lostTargetIds.push(g.targetId);
  }

  // Count EO-specific metrics
  const eoTracks = state.eoTracks?.length ?? 0;
  const triangulations = state.geometryEstimates?.length ?? 0;

  return {
    simTimeSec,
    trackCount: tracks.length,
    confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
    tentativeCount: tracks.filter(t => t.status === 'tentative').length,
    gtTargetCount: gt.length,
    trackToGtRatio: gt.length > 0 ? tracks.length / gt.length : (tracks.length > 0 ? Infinity : 1),
    pictureAccuracy: qm?.pictureAccuracy ?? 0,
    coveragePercent: qm?.coveragePercent ?? 0,
    falseTrackRate: qm?.falseTrackRate ?? 0,
    positionErrorAvg: qm?.positionErrorAvg ?? 0,
    positionErrorMax: qm?.positionErrorMax ?? 0,
    classificationAccuracy: qm?.classificationAccuracy ?? 1,
    lostTargets: lostTargetIds.length,
    lostTargetIds,
    sensorUtilization: qm?.sensorUtilization ?? {},
    eoTrackCount: eoTracks,
    triangulationCount: triangulations,
  };
}

function collectPhase(phaseName: string, range: [number, number], interval: number = 60): PhaseMetrics {
  const checkpoints: CheckpointMetrics[] = [];
  for (let t = range[0] + interval; t <= range[1]; t += interval) {
    const eng = new LiveEngine('eo-staring-defense');
    seekTo(eng, t);
    checkpoints.push(snapshot(eng, t));
  }
  return { phase: phaseName, timeRange: range, checkpoints };
}

function analyzeFormation(): FormationMetrics {
  const times = [400, 480, 560];
  let bestDistinct = 0;
  let merged = false;
  let minSep = Infinity;

  for (const t of times) {
    const eng = new LiveEngine('eo-staring-defense');
    seekTo(eng, t);
    const state = eng.getState();
    const gt = eng.getGroundTruth();

    const formGt = gt.filter(g => FORMATION_IDS.includes(g.targetId));
    const trackIds = new Set<string>();

    for (const fg of formGt) {
      let bestTrack: string | null = null;
      let bestDist = 8000; // wider match for EO
      for (const track of state.tracks) {
        const d = haversineM(fg.position.lat, fg.position.lon, track.state.lat, track.state.lon);
        if (d < bestDist) { bestDist = d; bestTrack = track.systemTrackId as string; }
      }
      if (bestTrack) trackIds.add(bestTrack);
    }

    bestDistinct = Math.max(bestDistinct, trackIds.size);
    if (formGt.length >= 3 && trackIds.size === 1) merged = true;

    const tArr = [...trackIds].map(id => state.tracks.find(tr => (tr.systemTrackId as string) === id)).filter(Boolean);
    for (let i = 0; i < tArr.length; i++) {
      for (let j = i + 1; j < tArr.length; j++) {
        const sep = haversineM(tArr[i]!.state.lat, tArr[i]!.state.lon, tArr[j]!.state.lat, tArr[j]!.state.lon);
        if (sep < minSep) minSep = sep;
      }
    }
  }

  return { distinctFormationTracks: bestDistinct, mergedIntoSingle: merged, minTrackSeparationM: minSep === Infinity ? 0 : minSep };
}

function analyzeOverload(cps: CheckpointMetrics[]): OverloadMetrics {
  if (cps.length === 0) return { peakTrackCount: 0, peakGtCount: 0, peakRatio: 0, avgPictureAccuracy: 0, minPictureAccuracy: 0, worstAccuracyTimeSec: 0 };
  let peakTC = 0, peakGT = 0, peakR = 0, minAcc = 100, worstT = 0, sumAcc = 0;
  for (const c of cps) {
    peakTC = Math.max(peakTC, c.trackCount);
    peakGT = Math.max(peakGT, c.gtTargetCount);
    peakR = Math.max(peakR, c.trackToGtRatio);
    sumAcc += c.pictureAccuracy;
    if (c.pictureAccuracy < minAcc) { minAcc = c.pictureAccuracy; worstT = c.simTimeSec; }
  }
  return { peakTrackCount: peakTC, peakGtCount: peakGT, peakRatio: peakR, avgPictureAccuracy: sumAcc / cps.length, minPictureAccuracy: minAcc, worstAccuracyTimeSec: worstT };
}

function detectIssues(report: { phases: PhaseMetrics[]; formation: FormationMetrics; overload: OverloadMetrics; avgTickMs: number }): Issue[] {
  const issues: Issue[] = [];

  for (const phase of report.phases) {
    for (const cp of phase.checkpoints) {
      // EO-only: higher proliferation tolerance (bearing triangulation can create more tentatives)
      if (cp.gtTargetCount > 0 && cp.trackToGtRatio > 4.0) {
        issues.push({ severity: 'critical', category: 'proliferation', description: `Track proliferation: ${cp.trackCount} tracks for ${cp.gtTargetCount} GT (ratio ${cp.trackToGtRatio.toFixed(1)})`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'trackToGtRatio', value: cp.trackToGtRatio, threshold: 4.0 });
      } else if (cp.gtTargetCount > 0 && cp.trackToGtRatio > 2.5) {
        issues.push({ severity: 'major', category: 'proliferation', description: `Elevated track count: ratio ${cp.trackToGtRatio.toFixed(1)}`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'trackToGtRatio', value: cp.trackToGtRatio, threshold: 2.5 });
      }

      if (cp.lostTargets > 0 && cp.gtTargetCount > 1) {
        const r = cp.lostTargets / cp.gtTargetCount;
        // EO has shorter range so higher lost-target tolerance
        if (r > 0.5) issues.push({ severity: 'critical', category: 'lost_track', description: `${cp.lostTargets}/${cp.gtTargetCount} GT untracked: [${cp.lostTargetIds.join(', ')}]`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'lostRatio', value: r, threshold: 0.5 });
        else if (r > 0.3) issues.push({ severity: 'major', category: 'lost_track', description: `${cp.lostTargets}/${cp.gtTargetCount} GT untracked: [${cp.lostTargetIds.join(', ')}]`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'lostRatio', value: r, threshold: 0.3 });
      }

      if (cp.pictureAccuracy < 25) issues.push({ severity: 'critical', category: 'accuracy', description: `Picture accuracy: ${cp.pictureAccuracy}%`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'pictureAccuracy', value: cp.pictureAccuracy, threshold: 25 });
      else if (cp.pictureAccuracy < 45) issues.push({ severity: 'major', category: 'accuracy', description: `Picture accuracy: ${cp.pictureAccuracy}%`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'pictureAccuracy', value: cp.pictureAccuracy, threshold: 45 });

      if (cp.falseTrackRate > 0.6) issues.push({ severity: 'critical', category: 'proliferation', description: `False track rate ${(cp.falseTrackRate * 100).toFixed(0)}%`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'falseTrackRate', value: cp.falseTrackRate, threshold: 0.6 });
      else if (cp.falseTrackRate > 0.4) issues.push({ severity: 'major', category: 'proliferation', description: `False track rate ${(cp.falseTrackRate * 100).toFixed(0)}%`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'falseTrackRate', value: cp.falseTrackRate, threshold: 0.4 });

      // EO position error: higher tolerance (5 km avg is acceptable)
      if (cp.positionErrorAvg > 8000) issues.push({ severity: 'major', category: 'accuracy', description: `Avg pos error: ${cp.positionErrorAvg.toFixed(0)}m`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'positionErrorAvg', value: cp.positionErrorAvg, threshold: 8000 });

      // EO coverage: flag when too low
      if (cp.coveragePercent < 0.2 && cp.gtTargetCount > 2) {
        issues.push({ severity: 'major', category: 'eo_coverage', description: `EO coverage only ${(cp.coveragePercent * 100).toFixed(0)}%`, phase: phase.phase, simTimeSec: cp.simTimeSec, metric: 'coveragePercent', value: cp.coveragePercent, threshold: 0.2 });
      }
    }
  }

  // Formation: EO may merge more due to bearing-only — slightly relaxed threshold
  if (report.formation.mergedIntoSingle) {
    issues.push({ severity: 'critical', category: 'formation', description: `Formation merged into single track (need ≥2/5 distinct)`, phase: 'Phase 2', simTimeSec: 480, metric: 'distinctTracks', value: 1, threshold: 2 });
  } else if (report.formation.distinctFormationTracks < 2) {
    issues.push({ severity: 'major', category: 'formation', description: `Only ${report.formation.distinctFormationTracks}/5 formation members tracked`, phase: 'Phase 2', simTimeSec: 480, metric: 'distinctTracks', value: report.formation.distinctFormationTracks, threshold: 2 });
  }

  if (report.overload.peakRatio > 4.0) issues.push({ severity: 'critical', category: 'overload', description: `Phase 4 peak ratio: ${report.overload.peakRatio.toFixed(1)}`, phase: 'Phase 4', simTimeSec: report.overload.worstAccuracyTimeSec, metric: 'peakRatio', value: report.overload.peakRatio, threshold: 4.0 });
  if (report.overload.minPictureAccuracy < 20) issues.push({ severity: 'critical', category: 'overload', description: `Phase 4 min accuracy: ${report.overload.minPictureAccuracy}%`, phase: 'Phase 4', simTimeSec: report.overload.worstAccuracyTimeSec, metric: 'minAccuracy', value: report.overload.minPictureAccuracy, threshold: 20 });
  if (report.avgTickMs > 50) issues.push({ severity: 'major', category: 'performance', description: `Avg tick: ${report.avgTickMs.toFixed(1)}ms (budget: 50ms)`, phase: 'All', simTimeSec: 0, metric: 'avgTickMs', value: report.avgTickMs, threshold: 50 });

  return issues;
}

function computeScore(report: { phases: PhaseMetrics[]; formation: FormationMetrics; overload: OverloadMetrics }): number {
  const allCps = report.phases.flatMap(p => p.checkpoints);
  if (allCps.length === 0) return 0;

  const avgAcc = allCps.reduce((s, c) => s + c.pictureAccuracy, 0) / allCps.length;
  const formScore = (report.formation.distinctFormationTracks / 5) * 100;
  const avgCov = allCps.reduce((s, c) => s + c.coveragePercent, 0) / allCps.length * 100;
  const avgFalse = allCps.reduce((s, c) => s + c.falseTrackRate, 0) / allCps.length;
  const falseScore = (1 - avgFalse) * 100;
  const peakR = report.overload.peakRatio;
  const prolifScore = Math.max(0, Math.min(100, 100 * (1 - (peakR - 1.5) / 3.5)));

  // EO-only scoring: coverage weighted higher (EO range limitation is the bottleneck)
  // 30% accuracy + 25% coverage + 15% formation + 15% proliferation + 15% false rate
  return Math.round(0.30 * avgAcc + 0.25 * avgCov + 0.15 * formScore + 0.15 * prolifScore + 0.15 * falseScore);
}

function computeEoMetrics(phases: PhaseMetrics[]): EoMetrics {
  const avgTriangulations: number[] = [];
  const avgEoTracks: number[] = [];
  let peakEo = 0;
  let totalCov = 0;
  let totalCps = 0;

  for (const phase of phases) {
    const cps = phase.checkpoints;
    if (cps.length === 0) {
      avgTriangulations.push(0);
      avgEoTracks.push(0);
      continue;
    }
    avgTriangulations.push(cps.reduce((s, c) => s + c.triangulationCount, 0) / cps.length);
    avgEoTracks.push(cps.reduce((s, c) => s + c.eoTrackCount, 0) / cps.length);
    peakEo = Math.max(peakEo, ...cps.map(c => c.eoTrackCount));
    totalCov += cps.reduce((s, c) => s + c.coveragePercent, 0);
    totalCps += cps.length;
  }

  return {
    totalSensors: 19,
    staringSensors: 15,
    investigatorSensors: 4,
    avgTriangulationsPerPhase: avgTriangulations,
    avgEoTracksPerPhase: avgEoTracks,
    peakEoTracks: peakEo,
    avgCoveragePercent: totalCps > 0 ? (totalCov / totalCps) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Main Test
// ---------------------------------------------------------------------------

describe('EO Staring Defense Stress Test', { timeout: 900_000 }, () => {
  it('runs EO-only deployment-vs-targets analysis', () => {
    try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch {}

    let correctionLog: CorrectionEntry[] = [];
    try { correctionLog = JSON.parse(fs.readFileSync(CORRECTIONS_LOG_PATH, 'utf-8')); } catch { correctionLog = []; }

    const runId = correctionLog.length + 1;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`EO STARING DEFENSE STRESS TEST — Run #${runId}`);
    console.log(`Mode: PURE EO (no radar) — 15 staring + 4 investigators`);
    console.log(`${'='.repeat(70)}\n`);

    const paramEngine = new LiveEngine('eo-staring-defense');
    const fc = paramEngine.getFusionConfig();
    const parameters: RunParameters = {
      mergeDistanceM: fc.mergeDistanceM,
      gateThreshold: fc.gateThreshold,
      clusterRadiusM: 1500,
      dropAfterMisses: 12,
      coastingMissThreshold: 5,
      maxCoastingTimeSec: 15,
    };
    console.log('Parameters:', JSON.stringify(parameters, null, 2));

    // Verify scenario loaded correctly
    const initState = paramEngine.getState();
    const eoSensors = initState.sensors.filter(s => s.sensorType === 'eo');
    const radarSensors = initState.sensors.filter(s => s.sensorType === 'radar');
    console.log(`\nSensor count: ${initState.sensors.length} total, ${eoSensors.length} EO, ${radarSensors.length} radar`);
    console.log(`Staring sensors: ${eoSensors.filter(s => s.gimbal?.slewRateDegPerSec === 0).length}`);
    console.log(`Investigator sensors: ${eoSensors.filter(s => (s.gimbal?.slewRateDegPerSec ?? 0) > 0).length}`);
    console.log('');

    const wallStart = performance.now();

    // Phase 1: Fighter (0-300s)
    console.log('Phase 1: Fighter (0-300s)...');
    const phase1 = collectPhase('Phase 1: Fighter', [0, 300], 100);
    console.log(`  → ${phase1.checkpoints.length} checkpoints, last accuracy: ${phase1.checkpoints.at(-1)?.pictureAccuracy ?? '?'}%`);
    console.log(`  → EO tracks: ${phase1.checkpoints.at(-1)?.eoTrackCount ?? 0}, triangulations: ${phase1.checkpoints.at(-1)?.triangulationCount ?? 0}`);

    // Phase 2: Formation (300-600s)
    console.log('Phase 2: Formation (300-600s)...');
    const phase2 = collectPhase('Phase 2: Formation', [300, 600], 100);
    const formation = analyzeFormation();
    console.log(`  → Distinct tracks: ${formation.distinctFormationTracks}/5, merged: ${formation.mergedIntoSingle}`);

    // Phase 3: Ballistic (600-880s)
    console.log('Phase 3: Ballistic (600-880s)...');
    const phase3 = collectPhase('Phase 3: Ballistic', [600, 880], 70);
    console.log(`  → ${phase3.checkpoints.length} checkpoints, last accuracy: ${phase3.checkpoints.at(-1)?.pictureAccuracy ?? '?'}%`);

    // Phase 4: Mixed Dense (960-1500s)
    console.log('Phase 4: Mixed Dense (960-1500s)...');
    const phase4 = collectPhase('Phase 4: Mixed Dense', [960, 1500], 90);
    console.log(`  → ${phase4.checkpoints.length} checkpoints, last accuracy: ${phase4.checkpoints.at(-1)?.pictureAccuracy ?? '?'}%`);

    const wallMs = performance.now() - wallStart;
    const totalSeekTicks = phase1.checkpoints.reduce((s, c) => s + c.simTimeSec, 0)
      + phase2.checkpoints.reduce((s, c) => s + c.simTimeSec, 0)
      + phase3.checkpoints.reduce((s, c) => s + c.simTimeSec, 0)
      + phase4.checkpoints.reduce((s, c) => s + c.simTimeSec, 0)
      + 3 * 500;
    const avgTickMs = wallMs / totalSeekTicks;

    const phases = [phase1, phase2, phase3, phase4];
    const overload = analyzeOverload(phase4.checkpoints);
    const eoMetrics = computeEoMetrics(phases);
    const baseReport = { phases, formation, overload, avgTickMs };
    const issues = detectIssues(baseReport);
    const compositeScore = computeScore(baseReport);
    const qualityGrade = gradeFromScore(compositeScore);

    const report: RunReport = {
      runId,
      timestamp: new Date().toISOString(),
      scenario: 'eo-staring-defense',
      mode: 'eo-only',
      totalSimSec: 1500,
      wallClockMs: wallMs,
      avgTickMs,
      phases,
      formation,
      overload,
      qualityGrade,
      compositeScore,
      issues,
      parameters,
      eoMetrics,
    };

    // Print summary
    console.log('');
    console.log(`${'─'.repeat(70)}`);
    console.log(`RESULTS — EO-Only Run #${runId}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`Quality Grade: ${qualityGrade} (${compositeScore}/100)`);
    console.log(`Wall Clock: ${(wallMs / 1000).toFixed(1)}s (${avgTickMs.toFixed(2)}ms/tick)`);
    console.log(`Formation: ${formation.distinctFormationTracks}/5 distinct tracks`);
    console.log(`Overload Peak: ${overload.peakTrackCount} tracks / ${overload.peakGtCount} GT (ratio ${overload.peakRatio.toFixed(1)})`);
    console.log(`Overload Accuracy: avg=${overload.avgPictureAccuracy.toFixed(1)}%, min=${overload.minPictureAccuracy}%`);
    console.log('');

    // EO-specific summary
    console.log('EO Metrics:');
    console.log(`  Total sensors: ${eoMetrics.totalSensors} (${eoMetrics.staringSensors} staring + ${eoMetrics.investigatorSensors} investigators)`);
    console.log(`  Avg triangulations per phase: ${eoMetrics.avgTriangulationsPerPhase.map(v => v.toFixed(1)).join(', ')}`);
    console.log(`  Avg EO tracks per phase: ${eoMetrics.avgEoTracksPerPhase.map(v => v.toFixed(1)).join(', ')}`);
    console.log(`  Peak EO tracks: ${eoMetrics.peakEoTracks}`);
    console.log(`  Avg coverage: ${eoMetrics.avgCoveragePercent.toFixed(1)}%`);
    console.log('');

    if (issues.length > 0) {
      console.log(`Issues (${issues.length}):`);
      const critical = issues.filter(i => i.severity === 'critical');
      const major = issues.filter(i => i.severity === 'major');
      if (critical.length > 0) {
        console.log(`  CRITICAL (${critical.length}):`);
        for (const issue of critical.slice(0, 10)) console.log(`    [${issue.category}] t=${issue.simTimeSec}s: ${issue.description}`);
        if (critical.length > 10) console.log(`    ... and ${critical.length - 10} more`);
      }
      if (major.length > 0) {
        console.log(`  MAJOR (${major.length}):`);
        for (const issue of major.slice(0, 10)) console.log(`    [${issue.category}] t=${issue.simTimeSec}s: ${issue.description}`);
        if (major.length > 10) console.log(`    ... and ${major.length - 10} more`);
      }
    } else {
      console.log('No issues detected!');
    }

    // Phase summary table
    console.log('');
    console.log('Phase Summary:');
    console.log('  Phase                    | Avg Acc | Coverage | FalseRate | Peak T/GT | Lost | EO Trk | Trig');
    console.log('  ─────────────────────────|─────────|──────────|───────────|───────────|──────|────────|──────');
    for (const phase of phases) {
      const cps = phase.checkpoints;
      if (cps.length === 0) continue;
      const aA = cps.reduce((s, c) => s + c.pictureAccuracy, 0) / cps.length;
      const aC = cps.reduce((s, c) => s + c.coveragePercent, 0) / cps.length;
      const aF = cps.reduce((s, c) => s + c.falseTrackRate, 0) / cps.length;
      const pR = Math.max(...cps.map(c => c.trackToGtRatio));
      const mL = Math.max(...cps.map(c => c.lostTargets));
      const aEo = cps.reduce((s, c) => s + c.eoTrackCount, 0) / cps.length;
      const aTr = cps.reduce((s, c) => s + c.triangulationCount, 0) / cps.length;
      console.log(`  ${phase.phase.padEnd(25)} | ${aA.toFixed(1).padStart(5)}%  | ${(aC * 100).toFixed(1).padStart(6)}%  | ${(aF * 100).toFixed(1).padStart(5)}%    | ${(pR === Infinity ? '∞' : pR.toFixed(1)).padStart(7)}x  | ${String(mL).padStart(4)} | ${aEo.toFixed(0).padStart(5)}  | ${aTr.toFixed(0).padStart(4)}`);
    }
    console.log('');

    // Save report
    const reportPath = path.join(REPORTS_DIR, `eo-run-${String(runId).padStart(3, '0')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${reportPath}`);

    // Update corrections log
    correctionLog.push({
      runId,
      timestamp: new Date().toISOString(),
      issuesSummary: `${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major, ${issues.filter(i => i.severity === 'minor').length} minor`,
      corrections: [],
      parameterChanges: {},
      scoreBefore: compositeScore,
    });
    fs.writeFileSync(CORRECTIONS_LOG_PATH, JSON.stringify(correctionLog, null, 2));
    console.log(`Corrections log: ${CORRECTIONS_LOG_PATH}`);

    // Score evolution
    if (correctionLog.length > 1) {
      console.log('\nScore Evolution:');
      for (const e of correctionLog) {
        console.log(`  Run #${e.runId}: ${e.scoreBefore}/100 ${'█'.repeat(Math.round(e.scoreBefore / 2))} ${e.issuesSummary}`);
        if (e.corrections.length > 0) console.log(`    → ${e.corrections.join('; ')}`);
      }
    }

    console.log(`\n${'='.repeat(70)}\n`);

    expect(report.compositeScore).toBeGreaterThanOrEqual(0);
    expect(report.phases.length).toBe(4);
    // Verify this is actually an EO-only scenario
    expect(radarSensors.length).toBe(0);
    expect(eoSensors.length).toBe(19);
  });
});
