/**
 * EO Pipeline Per-Stage Grading Test
 *
 * Tests each stage of the EO-only pipeline independently against ground truth:
 *
 *   Stage 1: Bearing Generation — sensor→GT fidelity (az/el error, detection rate)
 *   Stage 2: Detection Correlation — cross-sensor matching (purity, completeness)
 *   Stage 3: Triangulation — 3D position quality (error vs GT, angle, miss dist)
 *   Stage 4: Track Management — lifecycle (continuity, latency, proliferation)
 *   Stage 5: Quality Assessment — overall picture (coverage, accuracy vs GT)
 *
 * Each stage is graded A-F (0-100) with per-stage issue tracking.
 * Bearing tracking measures whether the detector correctly associates
 * consecutive bearings from the same GT object (bearing-to-detection continuity).
 */

import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BearingStageMetrics {
  /** How many GT targets were in sensor coverage */
  gtInCoverage: number;
  /** How many GT targets produced at least 1 bearing */
  gtDetected: number;
  /** Detection rate = gtDetected / gtInCoverage */
  detectionRate: number;
  /** Average azimuth error vs GT (degrees) */
  avgAzErrorDeg: number;
  /** Average elevation error vs GT (degrees) */
  avgElErrorDeg: number;
  /** Total bearings generated */
  totalBearings: number;
  /** Bearings per sensor (utilization) */
  bearingsPerSensor: Record<string, number>;
  /** Per-GT-target: how many sensors detected it */
  sensorsPerTarget: Record<string, number>;
}

interface CorrelationStageMetrics {
  /** Total bearing groups after correlation */
  totalGroups: number;
  /** Groups with ≥2 sensors (triangulable) */
  multiSensorGroups: number;
  /** Groups with only 1 sensor (fallback) */
  singleSensorGroups: number;
  /** Purity: % of groups where all bearings point at same GT target */
  groupPurity: number;
  /** Completeness: % of GT targets that have a multi-sensor group */
  gtCompleteness: number;
  /** Bearing-to-detection continuity: % of consecutive bearings from
   *  same GT that matched to the same detection ID (not creating new) */
  bearingContinuity: number;
  /** Detections per sensor after correlation */
  detectionsPerSensor: Record<string, number>;
}

interface TriangulationStageMetrics {
  /** Total triangulation attempts */
  totalAttempts: number;
  /** Successful triangulations (passed quality gates) */
  successCount: number;
  /** Success rate */
  successRate: number;
  /** Average position error vs GT (meters) */
  avgPositionErrorM: number;
  /** Max position error vs GT */
  maxPositionErrorM: number;
  /** Average intersection angle (degrees) */
  avgIntersectionAngleDeg: number;
  /** Average miss distance (meters) */
  avgMissDistanceM: number;
  /** Ambiguity count (routed to consistency resolver) */
  ambiguityCount: number;
  /** Classification distribution: candidate_3d vs confirmed_3d */
  classificationDist: Record<string, number>;
}

interface TrackStageMetrics {
  /** System tracks created from EO triangulation */
  eoTracksCreated: number;
  /** Tracks still alive at checkpoint */
  aliveTrackCount: number;
  /** Track-to-GT ratio (ideal = 1.0) */
  trackToGtRatio: number;
  /** % of GT targets with a matching system track (within 8km) */
  gtCoverage: number;
  /** Average track age (seconds since creation) */
  avgTrackAgeSec: number;
  /** % of ticks where a GT-matched track maintained its association */
  trackContinuity: number;
  /** Average confidence of alive tracks */
  avgConfidence: number;
  /** Proliferation: extra tracks beyond GT count */
  proliferationCount: number;
  /** Fused tracks (merged with radar — should be 0 in EO-only) */
  fusedWithRadarCount: number;
}

interface QualityStageMetrics {
  pictureAccuracy: number;
  coveragePercent: number;
  falseTrackRate: number;
  positionErrorAvg: number;
  classificationAccuracy: number;
}

interface StageGrade {
  stage: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
}

interface PipelineReport {
  runId: number;
  timestamp: string;
  simTimeSec: number;
  phase: string;
  bearing: BearingStageMetrics;
  correlation: CorrelationStageMetrics;
  triangulation: TriangulationStageMetrics;
  track: TrackStageMetrics;
  quality: QualityStageMetrics;
  grades: StageGrade[];
  compositeScore: number;
  compositeGrade: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPORTS_DIR = path.resolve(import.meta.dirname ?? __dirname, '../../../../eo-pipeline-reports');

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
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

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Per-Stage Analysis
// ---------------------------------------------------------------------------

function analyzePipeline(engine: LiveEngine, simTimeSec: number, phaseName: string): Omit<PipelineReport, 'runId' | 'timestamp'> {
  const state = engine.getState();
  const gt = engine.getGroundTruth();
  const qm = engine.getQualityMetrics();
  const coreDetector = (engine as any).coreEoDetector;
  const trackManager = (engine as any).trackManager;
  const sensors = state.sensors;
  const staringSensors = sensors.filter((s: any) => s.gimbal?.slewRateDegPerSec === 0);

  // ── Stage 1: Bearing Generation ──────────────────────────────────────
  const allDetections = coreDetector ? coreDetector.getAllDetections() : [];
  const bearingsPerSensor: Record<string, number> = {};
  const sensorsPerTarget: Record<string, Set<string>> = {};

  for (const det of allDetections) {
    bearingsPerSensor[det.sensorId] = (bearingsPerSensor[det.sensorId] ?? 0) + 1;
    if (det.targetId) {
      if (!sensorsPerTarget[det.targetId]) sensorsPerTarget[det.targetId] = new Set();
      sensorsPerTarget[det.targetId].add(det.sensorId);
    }
  }

  // Compute bearing errors vs GT
  let totalAzErr = 0, totalElErr = 0, bearingCount = 0;
  for (const det of allDetections) {
    const gtTarget = gt.find(g => g.targetId === det.targetId);
    if (!gtTarget) continue;
    const trueAz = bearingDeg(det.sensorPosition.lat, det.sensorPosition.lon,
      gtTarget.position.lat, gtTarget.position.lon);
    let azErr = Math.abs(det.bearing.azimuthDeg - trueAz);
    if (azErr > 180) azErr = 360 - azErr;
    totalAzErr += azErr;
    bearingCount++;
  }

  const gtInCoverage = gt.length; // simplified: all active GT are "in coverage"
  const gtDetected = Object.keys(sensorsPerTarget).length;
  const sensorsPerTargetCounts: Record<string, number> = {};
  for (const [tid, sset] of Object.entries(sensorsPerTarget)) {
    sensorsPerTargetCounts[tid] = sset.size;
  }

  const bearing: BearingStageMetrics = {
    gtInCoverage,
    gtDetected,
    detectionRate: gtInCoverage > 0 ? gtDetected / gtInCoverage : 1,
    avgAzErrorDeg: bearingCount > 0 ? totalAzErr / bearingCount : 0,
    avgElErrorDeg: 0, // would need GT elevation calc
    totalBearings: allDetections.length,
    bearingsPerSensor,
    sensorsPerTarget: sensorsPerTargetCounts,
  };

  // ── Stage 2: Correlation ─────────────────────────────────────────────
  // Analyze detection grouping by checking if detections from same GT target
  // end up in the same correlation group
  const eoTargets = coreDetector ? coreDetector.getEoTargets() : [];
  const ambigCandidates = coreDetector ? coreDetector.getAmbiguityCandidates() : [];

  // Check group purity: for each 3D target, do all contributing detections
  // share the same GT targetId?
  let pureGroups = 0;
  let totalGroups = eoTargets.length + ambigCandidates.length;
  for (const target of eoTargets) {
    const dets = allDetections.filter((d: any) =>
      target.sensorIds.includes(d.sensorId));
    const gtIds = new Set(dets.map((d: any) => d.targetId));
    if (gtIds.size === 1) pureGroups++;
  }

  // GT completeness: how many GT targets have a multi-sensor detection group?
  const gtWithGroup = new Set<string>();
  for (const target of eoTargets) {
    const dets = allDetections.filter((d: any) =>
      target.sensorIds.includes(d.sensorId));
    for (const d of dets) {
      if (d.targetId) gtWithGroup.add(d.targetId);
    }
  }

  // Bearing continuity: how many detections have updateCount > 1
  // (meaning consecutive bearings were matched to previous detection)
  const detsWithContinuity = allDetections.filter((d: any) => d.updateCount > 1).length;
  const bearingContinuity = allDetections.length > 0 ? detsWithContinuity / allDetections.length : 0;

  const detectionsPerSensor: Record<string, number> = {};
  for (const det of allDetections) {
    detectionsPerSensor[det.sensorId] = (detectionsPerSensor[det.sensorId] ?? 0) + 1;
  }

  const correlation: CorrelationStageMetrics = {
    totalGroups,
    multiSensorGroups: eoTargets.length,
    singleSensorGroups: totalGroups - eoTargets.length,
    groupPurity: totalGroups > 0 ? pureGroups / eoTargets.length : 1,
    gtCompleteness: gt.length > 0 ? gtWithGroup.size / gt.length : 1,
    bearingContinuity,
    detectionsPerSensor,
  };

  // ── Stage 3: Triangulation ───────────────────────────────────────────
  let totalPosErr = 0, maxPosErr = 0, totalAngle = 0, totalMiss = 0;
  let triCount = 0;
  const classDist: Record<string, number> = {};

  for (const target of eoTargets) {
    // Find closest GT target to triangulated position
    let bestDist = Infinity;
    for (const g of gt) {
      const d = haversineM(target.position.lat, target.position.lon,
        g.position.lat, g.position.lon);
      if (d < bestDist) bestDist = d;
    }
    totalPosErr += bestDist;
    maxPosErr = Math.max(maxPosErr, bestDist);
    totalAngle += target.intersectionAngleDeg;
    totalMiss += target.missDistanceM;
    triCount++;
    classDist[target.classification] = (classDist[target.classification] ?? 0) + 1;
  }

  const triangulation: TriangulationStageMetrics = {
    totalAttempts: triCount + ambigCandidates.length,
    successCount: triCount,
    successRate: (triCount + ambigCandidates.length) > 0
      ? triCount / (triCount + ambigCandidates.length) : 0,
    avgPositionErrorM: triCount > 0 ? totalPosErr / triCount : 0,
    maxPositionErrorM: maxPosErr,
    avgIntersectionAngleDeg: triCount > 0 ? totalAngle / triCount : 0,
    avgMissDistanceM: triCount > 0 ? totalMiss / triCount : 0,
    ambiguityCount: ambigCandidates.length,
    classificationDist: classDist,
  };

  // ── Stage 4: Track Management ────────────────────────────────────────
  const tracks = state.tracks;
  const eoTracks = tracks.filter((t: any) => t.fusionMode === 'eo_triangulation');
  const allTmTracks = trackManager ? trackManager.getAllTracks() : [];
  const eoCreated = allTmTracks.filter((t: any) => t.fusionMode === 'eo_triangulation').length;

  // Match tracks to GT
  let tracksMatchingGt = 0;
  const matchedGt = new Set<string>();
  for (const t of tracks) {
    let bestDist = Infinity;
    let bestGt: string | null = null;
    for (const g of gt) {
      const d = haversineM(t.state.lat, t.state.lon, g.position.lat, g.position.lon);
      if (d < 8000 && d < bestDist) { bestDist = d; bestGt = g.targetId; }
    }
    if (bestGt && !matchedGt.has(bestGt)) {
      tracksMatchingGt++;
      matchedGt.add(bestGt);
    }
  }

  // Track continuity: check how many confirmed tracks exist
  const confirmedTracks = tracks.filter((t: any) => t.status === 'confirmed').length;
  const tentativeTracks = tracks.filter((t: any) => t.status === 'tentative').length;
  const continuity = tracks.length > 0
    ? confirmedTracks / tracks.length
    : 0;

  const avgConfidence = tracks.length > 0
    ? tracks.reduce((s: number, t: any) => s + t.confidence, 0) / tracks.length
    : 0;

  const track: TrackStageMetrics = {
    eoTracksCreated: eoCreated,
    aliveTrackCount: tracks.length,
    trackToGtRatio: gt.length > 0 ? tracks.length / gt.length : (tracks.length > 0 ? Infinity : 1),
    gtCoverage: gt.length > 0 ? matchedGt.size / gt.length : 1,
    avgTrackAgeSec: 0, // would need track creation time
    trackContinuity: continuity,
    avgConfidence,
    proliferationCount: Math.max(0, tracks.length - gt.length),
    fusedWithRadarCount: tracks.filter((t: any) => t.fusionMode !== 'eo_triangulation' && t.fusionMode).length,
  };

  // ── Stage 5: Quality Assessment ──────────────────────────────────────
  const quality: QualityStageMetrics = {
    pictureAccuracy: qm?.pictureAccuracy ?? 0,
    coveragePercent: qm?.coveragePercent ?? 0,
    falseTrackRate: qm?.falseTrackRate ?? 0,
    positionErrorAvg: qm?.positionErrorAvg ?? 0,
    classificationAccuracy: qm?.classificationAccuracy ?? 1,
  };

  // ── Grade each stage ─────────────────────────────────────────────────
  const grades: StageGrade[] = [];

  // Stage 1 grading
  const s1Issues: string[] = [];
  let s1Score = 100;
  if (bearing.detectionRate < 0.5) { s1Score -= 40; s1Issues.push(`Low detection rate: ${(bearing.detectionRate * 100).toFixed(0)}%`); }
  else if (bearing.detectionRate < 0.8) { s1Score -= 20; s1Issues.push(`Detection rate: ${(bearing.detectionRate * 100).toFixed(0)}%`); }
  if (bearing.avgAzErrorDeg > 1.0) { s1Score -= 30; s1Issues.push(`High az error: ${bearing.avgAzErrorDeg.toFixed(2)}°`); }
  else if (bearing.avgAzErrorDeg > 0.5) { s1Score -= 10; s1Issues.push(`Moderate az error: ${bearing.avgAzErrorDeg.toFixed(2)}°`); }
  if (bearing.totalBearings === 0 && gt.length > 0) { s1Score = 0; s1Issues.push('No bearings generated'); }
  // Sensor utilization: penalize if <50% of staring sensors contribute
  const activeSensors = Object.keys(bearing.bearingsPerSensor).length;
  if (staringSensors.length > 0 && activeSensors < staringSensors.length * 0.5) {
    s1Score -= 15; s1Issues.push(`Only ${activeSensors}/${staringSensors.length} sensors active`);
  }
  grades.push({ stage: 'S1: Bearing Generation', score: Math.max(0, s1Score), grade: gradeFromScore(Math.max(0, s1Score)), issues: s1Issues });

  // Stage 2 grading
  const s2Issues: string[] = [];
  let s2Score = 100;
  if (correlation.groupPurity < 0.8) { s2Score -= 30; s2Issues.push(`Low group purity: ${(correlation.groupPurity * 100).toFixed(0)}%`); }
  if (correlation.gtCompleteness < 0.5) { s2Score -= 30; s2Issues.push(`Low GT completeness: ${(correlation.gtCompleteness * 100).toFixed(0)}%`); }
  else if (correlation.gtCompleteness < 0.8) { s2Score -= 15; s2Issues.push(`GT completeness: ${(correlation.gtCompleteness * 100).toFixed(0)}%`); }
  if (correlation.bearingContinuity < 0.5) { s2Score -= 20; s2Issues.push(`Low bearing continuity: ${(correlation.bearingContinuity * 100).toFixed(0)}%`); }
  if (correlation.multiSensorGroups === 0 && gt.length > 0) { s2Score -= 40; s2Issues.push('No multi-sensor groups'); }
  grades.push({ stage: 'S2: Correlation', score: Math.max(0, s2Score), grade: gradeFromScore(Math.max(0, s2Score)), issues: s2Issues });

  // Stage 3 grading
  const s3Issues: string[] = [];
  let s3Score = 100;
  if (triangulation.successRate < 0.5) { s3Score -= 30; s3Issues.push(`Low success rate: ${(triangulation.successRate * 100).toFixed(0)}%`); }
  if (triangulation.avgPositionErrorM > 5000) { s3Score -= 30; s3Issues.push(`High pos error: ${triangulation.avgPositionErrorM.toFixed(0)}m`); }
  else if (triangulation.avgPositionErrorM > 2000) { s3Score -= 15; s3Issues.push(`Pos error: ${triangulation.avgPositionErrorM.toFixed(0)}m`); }
  if (triangulation.avgIntersectionAngleDeg < 15) { s3Score -= 20; s3Issues.push(`Weak geometry: ${triangulation.avgIntersectionAngleDeg.toFixed(1)}°`); }
  if (triangulation.successCount === 0 && gt.length > 0) { s3Score = 0; s3Issues.push('No successful triangulations'); }
  if (triangulation.avgMissDistanceM > 2000) { s3Score -= 15; s3Issues.push(`High miss distance: ${triangulation.avgMissDistanceM.toFixed(0)}m`); }
  grades.push({ stage: 'S3: Triangulation', score: Math.max(0, s3Score), grade: gradeFromScore(Math.max(0, s3Score)), issues: s3Issues });

  // Stage 4 grading
  const s4Issues: string[] = [];
  let s4Score = 100;
  if (track.gtCoverage < 0.5) { s4Score -= 30; s4Issues.push(`Low GT coverage: ${(track.gtCoverage * 100).toFixed(0)}%`); }
  else if (track.gtCoverage < 0.8) { s4Score -= 15; s4Issues.push(`GT coverage: ${(track.gtCoverage * 100).toFixed(0)}%`); }
  if (track.trackToGtRatio > 3) { s4Score -= 30; s4Issues.push(`Proliferation: ratio ${track.trackToGtRatio.toFixed(1)}`); }
  else if (track.trackToGtRatio > 2) { s4Score -= 15; s4Issues.push(`Elevated ratio: ${track.trackToGtRatio.toFixed(1)}`); }
  if (track.trackToGtRatio < 0.3 && gt.length > 1) { s4Score -= 25; s4Issues.push(`Too few tracks: ratio ${track.trackToGtRatio.toFixed(1)}`); }
  if (track.avgConfidence < 0.3) { s4Score -= 15; s4Issues.push(`Low confidence: ${track.avgConfidence.toFixed(2)}`); }
  if (track.aliveTrackCount === 0 && gt.length > 0) { s4Score = 0; s4Issues.push('No alive tracks'); }
  grades.push({ stage: 'S4: Track Management', score: Math.max(0, s4Score), grade: gradeFromScore(Math.max(0, s4Score)), issues: s4Issues });

  // Stage 5 grading
  const s5Issues: string[] = [];
  let s5Score = quality.pictureAccuracy;
  if (quality.falseTrackRate > 0.3) { s5Score -= 15; s5Issues.push(`False track rate: ${(quality.falseTrackRate * 100).toFixed(0)}%`); }
  if (quality.positionErrorAvg > 5000) { s5Issues.push(`Avg pos error: ${quality.positionErrorAvg.toFixed(0)}m`); }
  if (quality.coveragePercent < 0.3) { s5Issues.push(`Low coverage: ${(quality.coveragePercent * 100).toFixed(0)}%`); }
  grades.push({ stage: 'S5: Quality Assessment', score: Math.max(0, Math.round(s5Score)), grade: gradeFromScore(Math.max(0, s5Score)), issues: s5Issues });

  const compositeScore = Math.round(grades.reduce((s, g) => s + g.score, 0) / grades.length);

  return {
    simTimeSec,
    phase: phaseName,
    bearing, correlation, triangulation, track, quality,
    grades,
    compositeScore,
    compositeGrade: gradeFromScore(compositeScore),
  };
}

// ---------------------------------------------------------------------------
// Main Test
// ---------------------------------------------------------------------------

describe('EO Pipeline Per-Stage Grading', { timeout: 900_000 }, () => {
  it('grades each pipeline stage for all phases', () => {
    try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch {}

    const phases: Array<{ name: string; time: number }> = [
      { name: 'Phase 1: Fighter (t=200)', time: 200 },
      { name: 'Phase 2: Formation (t=450)', time: 450 },
      { name: 'Phase 3: Ballistic (t=660)', time: 660 },
      { name: 'Phase 4a: Dense Early (t=1050)', time: 1050 },
      { name: 'Phase 4b: Dense Mid (t=1300)', time: 1300 },
    ];

    const reports: PipelineReport[] = [];
    let runId = 1;

    console.log(`\n${'='.repeat(80)}`);
    console.log('EO PIPELINE PER-STAGE GRADING');
    console.log(`${'='.repeat(80)}\n`);

    for (const phase of phases) {
      const eng = new LiveEngine('eo-staring-defense');
      const sm = eng.getSimulationState();
      if (sm.state === 'idle') { eng.start(); eng.pause(); }
      eng.seek(phase.time);

      const result = analyzePipeline(eng, phase.time, phase.name);
      const report: PipelineReport = {
        runId,
        timestamp: new Date().toISOString(),
        ...result,
      };
      reports.push(report);

      // Print per-phase summary
      console.log(`${'─'.repeat(80)}`);
      console.log(`${phase.name}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`  GT targets: ${result.bearing.gtInCoverage} | Detected: ${result.bearing.gtDetected} | Bearings: ${result.bearing.totalBearings}`);
      console.log(`  3D targets: ${result.triangulation.successCount} | System tracks: ${result.track.aliveTrackCount} | GT coverage: ${(result.track.gtCoverage * 100).toFixed(0)}%`);
      console.log('');
      console.log('  Stage Grades:');
      for (const g of result.grades) {
        const bar = '█'.repeat(Math.round(g.score / 5));
        const issues = g.issues.length > 0 ? ` — ${g.issues.join('; ')}` : '';
        console.log(`    ${g.stage.padEnd(25)} ${g.grade} ${String(g.score).padStart(3)}/100 ${bar}${issues}`);
      }
      console.log(`  COMPOSITE: ${result.compositeGrade} (${result.compositeScore}/100)`);
      console.log('');

      // Detailed bearing stats
      const spt = result.bearing.sensorsPerTarget;
      if (Object.keys(spt).length > 0) {
        console.log('  Sensors per target:');
        for (const [tid, count] of Object.entries(spt)) {
          console.log(`    ${tid}: ${count} sensors`);
        }
      }

      // Triangulation detail
      if (result.triangulation.successCount > 0) {
        console.log(`  Triangulation: avg error=${result.triangulation.avgPositionErrorM.toFixed(0)}m, ` +
          `angle=${result.triangulation.avgIntersectionAngleDeg.toFixed(1)}°, ` +
          `miss=${result.triangulation.avgMissDistanceM.toFixed(0)}m`);
      }
      console.log('');
    }

    // ── Summary table ──────────────────────────────────────────────────
    console.log(`${'='.repeat(80)}`);
    console.log('STAGE SUMMARY ACROSS ALL PHASES');
    console.log(`${'='.repeat(80)}`);
    console.log('Phase                         | S1:Brg | S2:Cor | S3:Tri | S4:Trk | S5:Qlt | Comp');
    console.log('──────────────────────────────|────────|────────|────────|────────|────────|──────');
    for (const r of reports) {
      const g = r.grades;
      console.log(`${r.phase.padEnd(30)}| ${(g[0].grade + ' ' + g[0].score).padStart(6)} | ${(g[1].grade + ' ' + g[1].score).padStart(6)} | ${(g[2].grade + ' ' + g[2].score).padStart(6)} | ${(g[3].grade + ' ' + g[3].score).padStart(6)} | ${(g[4].grade + ' ' + g[4].score).padStart(6)} | ${(r.compositeGrade + ' ' + r.compositeScore).padStart(4)}`);
    }
    console.log('');

    // Average scores per stage
    const avgScores = [0, 1, 2, 3, 4].map(i =>
      Math.round(reports.reduce((s, r) => s + r.grades[i].score, 0) / reports.length)
    );
    console.log(`${'AVG'.padEnd(30)}| ${avgScores.map(s => (gradeFromScore(s) + ' ' + s).padStart(6)).join(' | ')} | ${gradeFromScore(Math.round(avgScores.reduce((a, b) => a + b, 0) / 5)) + ' ' + Math.round(avgScores.reduce((a, b) => a + b, 0) / 5)}`);

    // Identify weakest stage
    const weakestIdx = avgScores.indexOf(Math.min(...avgScores));
    const stageNames = ['Bearing Generation', 'Correlation', 'Triangulation', 'Track Management', 'Quality Assessment'];
    console.log(`\nWeakest stage: ${stageNames[weakestIdx]} (avg ${avgScores[weakestIdx]}/100)`);

    // All issues across all phases per stage
    console.log('\nAll issues by stage:');
    for (let s = 0; s < 5; s++) {
      const allIssues = reports.flatMap(r => r.grades[s].issues);
      if (allIssues.length > 0) {
        console.log(`  ${stageNames[s]}:`);
        const uniqueIssues = [...new Set(allIssues)];
        for (const issue of uniqueIssues.slice(0, 5)) {
          console.log(`    - ${issue}`);
        }
      }
    }
    console.log(`\n${'='.repeat(80)}\n`);

    // Save reports
    const reportPath = path.join(REPORTS_DIR, `pipeline-run-${String(runId).padStart(3, '0')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    console.log(`Reports saved: ${reportPath}`);

    // Assertions
    expect(reports.length).toBe(phases.length);
    for (const r of reports) {
      expect(r.grades.length).toBe(5);
    }
  });
});
