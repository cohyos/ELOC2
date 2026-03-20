/**
 * REQ-12: Scenario Report Generator.
 *
 * Collects data from LiveEngine and generates comprehensive scenario reports
 * in Markdown format. Accumulates time-series data during simulation and
 * produces a structured report with scenario definition, performance metrics,
 * EO investigation summary, quality assessment, and conclusions.
 */

import type { LiveEngine, LiveState } from '../simulation/live-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportOptions {
  type: 'operator' | 'instructor';
  timeRange?: { from: number; to: number }; // simulation elapsed seconds
  sections?: string[];
  /** @deprecated kept for backward compatibility — ignored, always produces PDF */
  format?: string;
}

export interface MapSnapshot {
  imageData: string;   // base64
  label: string;
  timestamp: number;
}

export interface GeneratedReport {
  id: string;
  type: 'operator' | 'instructor';
  content: string;
  generatedAt: number;
  /** @deprecated kept for backward compatibility */
  format: 'md';
}

/** A single sample captured during simulation for time-series data. */
interface TimelineSample {
  simTimeSec: number;
  wallTime: number;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
  droppedCount: number;
  sensorOnlineCount: number;
  activeTasks: number;
  geometryEstimateCount: number;
}

// ---------------------------------------------------------------------------
// Report Store (in-memory)
// ---------------------------------------------------------------------------

const reportStore = new Map<string, GeneratedReport>();
const snapshotStore: MapSnapshot[] = [];
const timelineSamples: TimelineSample[] = [];

let sampleCounter = 0;

// ---------------------------------------------------------------------------
// Accumulator — call periodically during simulation
// ---------------------------------------------------------------------------

/**
 * Capture a time-series sample from the engine's current state.
 * Call this every few ticks (e.g., every 5 simulation seconds) to build
 * a performance timeline without excessive memory use.
 */
export function accumulateSample(engine: LiveEngine): void {
  sampleCounter++;
  // Sample every 5th call to avoid excessive memory
  if (sampleCounter % 5 !== 0) return;

  const state = engine.getState();
  const tracks = state.tracks;

  timelineSamples.push({
    simTimeSec: state.elapsedSec,
    wallTime: Date.now(),
    trackCount: tracks.length,
    confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
    tentativeCount: tracks.filter(t => t.status === 'tentative').length,
    droppedCount: tracks.filter(t => t.status === 'dropped').length,
    sensorOnlineCount: state.sensors.filter(s => s.online).length,
    activeTasks: state.tasks.filter(t => t.status === 'executing' || t.status === 'proposed').length,
    geometryEstimateCount: state.geometryEstimates.size,
  });
}

/**
 * Store a map screenshot captured from the frontend.
 */
export function addSnapshot(snapshot: MapSnapshot): void {
  snapshotStore.push(snapshot);
}

/**
 * Reset accumulated data (called on scenario reset).
 */
export function resetAccumulator(): void {
  timelineSamples.length = 0;
  snapshotStore.length = 0;
  sampleCounter = 0;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

const ALL_SECTIONS = [
  'scenario',
  'ground-truth',
  'performance-timeline',
  'eo-investigation',
  'quality-metrics',
  'situational-awareness',
  'conclusions',
] as const;

type SectionName = (typeof ALL_SECTIONS)[number];

/** Sections included in an operator report (no GT comparison). */
const OPERATOR_SECTIONS: SectionName[] = [
  'scenario',
  'performance-timeline',
  'eo-investigation',
  'conclusions',
];

/** Sections included in an instructor report (all sections). */
const INSTRUCTOR_SECTIONS: SectionName[] = [
  'scenario',
  'ground-truth',
  'performance-timeline',
  'eo-investigation',
  'quality-metrics',
  'situational-awareness',
  'conclusions',
];

/**
 * Generate a scenario report from the current engine state and accumulated data.
 */
export function generateReport(engine: LiveEngine, options: ReportOptions): GeneratedReport {
  const reportType = options.type ?? 'operator';
  const defaultSections = reportType === 'instructor' ? INSTRUCTOR_SECTIONS : OPERATOR_SECTIONS;
  const sections = (options.sections ?? defaultSections) as SectionName[];
  const isInstructor = reportType === 'instructor';

  const state = engine.getState();
  const scenarioInfo = engine.getScenarioInfo();
  const qualityMetrics = engine.getQualityMetrics();
  const beforeAfter = engine.getBeforeAfterComparison();
  const allocationQuality = engine.getEoAllocationQuality();

  // Apply time-range filter to timeline samples if specified
  let filteredSamples = timelineSamples;
  if (options.timeRange) {
    const { from, to } = options.timeRange;
    filteredSamples = timelineSamples.filter(
      s => s.simTimeSec >= from && s.simTimeSec <= to,
    );
  }

  const parts: string[] = [];

  const typeLabel = reportType === 'instructor' ? 'Instructor Report' : 'Operator Report';
  parts.push(`# ELOC2 Scenario Report`);
  parts.push('');
  parts.push(`**Report Type:** ${typeLabel}`);
  parts.push(`**Generated:** ${new Date().toISOString()}`);
  parts.push(`**Scenario:** ${scenarioInfo.name} (\`${scenarioInfo.id}\`)`);
  parts.push(`**Elapsed:** ${formatTime(state.elapsedSec)} / ${formatTime(scenarioInfo.durationSec)}`);
  if (options.timeRange) {
    parts.push(`**Time Range:** ${formatTime(options.timeRange.from)} – ${formatTime(options.timeRange.to)}`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  if (sections.includes('scenario')) {
    parts.push(buildScenarioSection(scenarioInfo, state));
  }
  if (sections.includes('ground-truth')) {
    parts.push(buildGroundTruthSection(engine));
  }
  if (sections.includes('performance-timeline')) {
    parts.push(buildPerformanceTimelineSection(state, filteredSamples));
  }
  if (sections.includes('eo-investigation')) {
    parts.push(buildEoInvestigationSection(state, beforeAfter, isInstructor));
  }
  if (sections.includes('quality-metrics')) {
    parts.push(buildQualitySection(qualityMetrics, allocationQuality));
  }
  if (sections.includes('situational-awareness')) {
    parts.push(buildSituationalAwarenessSection(engine, qualityMetrics, beforeAfter, allocationQuality));
  }
  if (sections.includes('conclusions')) {
    parts.push(buildConclusionsSection(state, qualityMetrics, beforeAfter, isInstructor));
  }

  const content = parts.join('\n');
  const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const report: GeneratedReport = {
    id,
    type: reportType,
    format: 'md',
    content,
    generatedAt: Date.now(),
  };

  reportStore.set(id, report);
  return report;
}

/**
 * Retrieve a previously generated report by ID.
 */
export function getReport(id: string): GeneratedReport | undefined {
  return reportStore.get(id);
}

// ---------------------------------------------------------------------------
// Section Builders
// ---------------------------------------------------------------------------

interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  targetCount: number;
  sensorCount: number;
  radarCount: number;
  eoCount: number;
  policyMode: string;
  targetNames: string[];
  sensorNames: string[];
  hasCoverZones: boolean;
}

function buildScenarioSection(info: ScenarioInfo, state: LiveState): string {
  const lines: string[] = [];
  lines.push('## 1. Scenario Definition');
  lines.push('');
  lines.push(`**Description:** ${info.description}`);
  lines.push('');
  lines.push('| Parameter | Value |');
  lines.push('|-----------|-------|');
  lines.push(`| Duration | ${formatTime(info.durationSec)} |`);
  lines.push(`| Policy Mode | ${info.policyMode} |`);
  lines.push(`| Targets | ${info.targetCount} |`);
  lines.push(`| Sensors | ${info.sensorCount} (${info.radarCount} radar, ${info.eoCount} EO) |`);
  lines.push(`| Cover Zones | ${info.hasCoverZones ? 'Yes' : 'No'} |`);
  lines.push('');

  if (info.targetNames.length > 0) {
    lines.push('**Targets:**');
    for (const name of info.targetNames) {
      lines.push(`- ${name}`);
    }
    lines.push('');
  }

  if (info.sensorNames.length > 0) {
    lines.push('**Sensors:**');
    for (const name of info.sensorNames) {
      lines.push(`- ${name}`);
    }
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

function buildGroundTruthSection(engine: LiveEngine): string {
  const lines: string[] = [];
  lines.push('## 2. Ground Truth Summary');
  lines.push('');

  const gt = engine.getGroundTruth();
  if (gt.length === 0) {
    lines.push('No active ground truth targets at current time.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Target | Position (lat, lon) | Alt (m) | Classification |');
  lines.push('|--------|--------------------:|--------:|----------------|');
  for (const t of gt) {
    const cls = t.classification ?? 'unknown';
    lines.push(`| ${t.name} | ${t.position.lat.toFixed(4)}, ${t.position.lon.toFixed(4)} | ${Math.round(t.position.alt)} | ${cls} |`);
  }
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

function buildPerformanceTimelineSection(state: LiveState, samples?: TimelineSample[]): string {
  const effectiveSamples = samples ?? timelineSamples;
  const lines: string[] = [];
  lines.push('## 3. System Performance Timeline');
  lines.push('');

  // Current snapshot
  const tracks = state.tracks;
  const confirmed = tracks.filter(t => t.status === 'confirmed').length;
  const tentative = tracks.filter(t => t.status === 'tentative').length;
  const dropped = tracks.filter(t => t.status === 'dropped').length;

  lines.push('### Current State');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|------:|');
  lines.push(`| Total Tracks | ${tracks.length} |`);
  lines.push(`| Confirmed | ${confirmed} |`);
  lines.push(`| Tentative | ${tentative} |`);
  lines.push(`| Dropped | ${dropped} |`);
  lines.push(`| Sensors Online | ${state.sensors.filter(s => s.online).length}/${state.sensors.length} |`);
  lines.push(`| Active Tasks | ${state.tasks.filter(t => t.status === 'executing').length} |`);
  lines.push(`| Geometry Estimates | ${state.geometryEstimates.size} |`);
  lines.push('');

  // Timeline samples
  if (effectiveSamples.length > 0) {
    lines.push('### Track Count Over Time');
    lines.push('');
    lines.push('| Time | Total | Confirmed | Tentative | Dropped | Tasks |');
    lines.push('|-----:|------:|----------:|----------:|--------:|------:|');

    // Show at most 20 evenly-spaced samples
    const step = Math.max(1, Math.floor(effectiveSamples.length / 20));
    for (let i = 0; i < effectiveSamples.length; i += step) {
      const s = effectiveSamples[i];
      lines.push(`| ${formatTime(s.simTimeSec)} | ${s.trackCount} | ${s.confirmedCount} | ${s.tentativeCount} | ${s.droppedCount} | ${s.activeTasks} |`);
    }
    // Always include last sample
    const last = effectiveSamples[effectiveSamples.length - 1];
    if (effectiveSamples.length > 1) {
      lines.push(`| ${formatTime(last.simTimeSec)} | ${last.trackCount} | ${last.confirmedCount} | ${last.tentativeCount} | ${last.droppedCount} | ${last.activeTasks} |`);
    }
    lines.push('');
  }

  // Registration health
  const regStates = state.registrationStates;
  if (regStates.length > 0) {
    lines.push('### Registration Health');
    lines.push('');
    lines.push('| Sensor | Spatial | Timing | Fusion Safe |');
    lines.push('|--------|---------|--------|-------------|');
    for (const r of regStates) {
      lines.push(`| ${r.sensorId} | ${r.spatialQuality} | ${r.timingQuality} | ${r.fusionSafe ? 'Yes' : 'No'} |`);
    }
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

function buildEoInvestigationSection(
  state: LiveState,
  beforeAfter: ReturnType<LiveEngine['getBeforeAfterComparison']>,
  includeGtComparison = true,
): string {
  const lines: string[] = [];
  lines.push('## 4. EO Investigation Summary');
  lines.push('');

  // Tasks summary
  const allTasks = state.tasks;
  const executing = allTasks.filter(t => t.status === 'executing').length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const proposed = allTasks.filter(t => t.status === 'proposed').length;

  lines.push('### Tasking');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Executing | ${executing} |`);
  lines.push(`| Completed | ${completed} |`);
  lines.push(`| Proposed | ${proposed} |`);
  lines.push(`| Total | ${allTasks.length} |`);
  lines.push('');

  // EO Tracks
  const eoTracks = state.eoTracks;
  if (eoTracks.length > 0) {
    const associated = eoTracks.filter(t => t.associatedSystemTrackId).length;
    lines.push('### EO Bearing Observations');
    lines.push('');
    lines.push(`- Total EO tracks: ${eoTracks.length}`);
    lines.push(`- Associated with system tracks: ${associated}`);
    lines.push(`- Unassociated: ${eoTracks.length - associated}`);
    lines.push('');
  }

  // Geometry estimates
  const geoEstimates = [...state.geometryEstimates.entries()];
  if (geoEstimates.length > 0) {
    lines.push('### Triangulation Results');
    lines.push('');
    lines.push('| Track | Quality | Classification | Intersection Angle |');
    lines.push('|-------|---------|---------------|-------------------:|');
    for (const [trackId, est] of geoEstimates) {
      const shortId = trackId.length > 8 ? trackId.slice(0, 8) : trackId;
      lines.push(`| ${shortId} | ${est.quality} | ${est.classification} | ${est.intersectionAngleDeg?.toFixed(1) ?? 'N/A'}deg |`);
    }
    lines.push('');
  }

  // Before/after comparison (only in instructor reports)
  if (includeGtComparison && beforeAfter.perTrack.length > 0) {
    lines.push('### Before/After EO Comparison');
    lines.push('');
    const agg = beforeAfter.aggregate;
    lines.push(`- Tracks investigated: ${agg.totalTracksInvestigated}`);
    lines.push(`- Avg position improvement: ${agg.avgPositionImprovement.toFixed(2)}`);
    lines.push(`- Tracks gaining classification: ${agg.tracksWithClassification}`);
    lines.push(`- Tracks with geometry upgrade: ${agg.tracksWithGeometryUpgrade}`);
    lines.push('');
  }

  // Unresolved groups
  const groups = state.unresolvedGroups;
  if (groups.length > 0) {
    lines.push('### Unresolved Groups');
    lines.push('');
    lines.push(`- Active groups: ${groups.filter(g => g.status === 'unresolved').length}`);
    lines.push(`- Total: ${groups.length}`);
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

function buildQualitySection(
  qualityMetrics: ReturnType<LiveEngine['getQualityMetrics']>,
  allocationQuality: ReturnType<LiveEngine['getEoAllocationQuality']>,
): string {
  const lines: string[] = [];
  lines.push('## 5. Quality Metrics');
  lines.push('');

  if (qualityMetrics) {
    lines.push('### Track Quality (REQ-8)');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|------:|');
    lines.push(`| Track-to-Truth Association | ${(qualityMetrics.trackToTruthAssociation * 100).toFixed(1)}% |`);
    lines.push(`| Avg Position Error | ${qualityMetrics.positionErrorAvg.toFixed(2)} |`);
    lines.push(`| Max Position Error | ${qualityMetrics.positionErrorMax.toFixed(2)} |`);
    lines.push(`| Classification Accuracy | ${(qualityMetrics.classificationAccuracy * 100).toFixed(1)}% |`);
    lines.push(`| Coverage | ${(qualityMetrics.coveragePercent * 100).toFixed(1)}% |`);
    lines.push(`| False Track Rate | ${(qualityMetrics.falseTrackRate * 100).toFixed(1)}% |`);
    lines.push('');

    // Time-to-detection
    const detTimes = Object.entries(qualityMetrics.timeToFirstDetection);
    if (detTimes.length > 0) {
      lines.push('### Time to First Detection');
      lines.push('');
      lines.push('| Target | Time (s) |');
      lines.push('|--------|--------:|');
      for (const [targetId, time] of detTimes) {
        const shortId = targetId.length > 8 ? targetId.slice(0, 8) : targetId;
        lines.push(`| ${shortId} | ${(time as number).toFixed(1)} |`);
      }
      lines.push('');
    }

    // Time-to-3D
    const geoTimes = Object.entries(qualityMetrics.timeToConfirmed3D);
    if (geoTimes.length > 0) {
      lines.push('### Time to Confirmed 3D');
      lines.push('');
      lines.push('| Target | Time (s) |');
      lines.push('|--------|--------:|');
      for (const [targetId, time] of geoTimes) {
        const shortId = targetId.length > 8 ? targetId.slice(0, 8) : targetId;
        lines.push(`| ${shortId} | ${(time as number).toFixed(1)} |`);
      }
      lines.push('');
    }

    // Sensor utilization
    const sensorUtil = Object.entries(qualityMetrics.sensorUtilization);
    if (sensorUtil.length > 0) {
      lines.push('### Sensor Utilization');
      lines.push('');
      lines.push('| Sensor | Utilization |');
      lines.push('|--------|----------:|');
      for (const [sensorId, util] of sensorUtil) {
        const shortId = sensorId.length > 8 ? sensorId.slice(0, 8) : sensorId;
        lines.push(`| ${shortId} | ${((util as number) * 100).toFixed(1)}% |`);
      }
      lines.push('');
    }
  } else {
    lines.push('*No quality metrics available (scenario may not have run long enough).*');
    lines.push('');
  }

  if (allocationQuality) {
    lines.push('### EO Allocation Quality (REQ-10)');
    lines.push('');
    lines.push('| Criterion | Score |');
    lines.push('|-----------|------:|');
    lines.push(`| Coverage Efficiency | ${(allocationQuality.coverageEfficiency * 100).toFixed(1)}% |`);
    lines.push(`| Geometry Optimality | ${(allocationQuality.geometryOptimality * 100).toFixed(1)}% |`);
    lines.push(`| Dwell Efficiency | ${(allocationQuality.dwellEfficiency * 100).toFixed(1)}% |`);
    lines.push(`| Revisit Timeliness | ${(allocationQuality.revisitTimeliness * 100).toFixed(1)}% |`);
    lines.push(`| Triangulation Success | ${(allocationQuality.triangulationSuccessRate * 100).toFixed(1)}% |`);
    lines.push(`| Sensor Utilization | ${(allocationQuality.sensorUtilization * 100).toFixed(1)}% |`);
    lines.push(`| Priority Alignment | ${(allocationQuality.priorityAlignment * 100).toFixed(1)}% |`);
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

function buildConclusionsSection(
  state: LiveState,
  qualityMetrics: ReturnType<LiveEngine['getQualityMetrics']>,
  beforeAfter: ReturnType<LiveEngine['getBeforeAfterComparison']>,
  includeGtComparison = true,
): string {
  const lines: string[] = [];
  lines.push('## Conclusions & Key Statistics');
  lines.push('');

  const tracks = state.tracks;
  const confirmed = tracks.filter(t => t.status === 'confirmed').length;
  const geoCount = state.geometryEstimates.size;

  lines.push('### Key Statistics');
  lines.push('');
  lines.push(`- **Simulation elapsed:** ${formatTime(state.elapsedSec)}`);
  lines.push(`- **Tracks managed:** ${tracks.length} total, ${confirmed} confirmed`);
  lines.push(`- **Geometry solutions:** ${geoCount}`);
  lines.push(`- **EO tasks issued:** ${state.tasks.length}`);
  lines.push(`- **EO bearing observations:** ${state.eoTracks.length}`);
  lines.push(`- **Targets investigated (before/after):** ${beforeAfter.aggregate.totalTracksInvestigated}`);

  if (includeGtComparison && qualityMetrics) {
    lines.push(`- **Track-to-truth association:** ${(qualityMetrics.trackToTruthAssociation * 100).toFixed(1)}%`);
    lines.push(`- **Classification accuracy:** ${(qualityMetrics.classificationAccuracy * 100).toFixed(1)}%`);
    lines.push(`- **Avg position error:** ${qualityMetrics.positionErrorAvg.toFixed(2)}`);
  }

  const agg = beforeAfter.aggregate;
  if (includeGtComparison && agg.totalTracksInvestigated > 0) {
    lines.push(`- **Avg position improvement from EO:** ${agg.avgPositionImprovement.toFixed(2)}`);
    lines.push(`- **Geometry upgrades from EO:** ${agg.tracksWithGeometryUpgrade}`);
  }

  lines.push('');

  // Assessments
  lines.push('### Assessment');
  lines.push('');

  if (confirmed > 0 && geoCount > 0) {
    lines.push('The system successfully detected and confirmed multiple targets, producing');
    lines.push(`${geoCount} geometry solution(s) through EO triangulation. `);
  } else if (confirmed > 0) {
    lines.push('The system detected and confirmed targets via radar/EO fusion. ');
    lines.push('No triangulation geometry was computed during this run. ');
  } else {
    lines.push('The scenario did not produce confirmed tracks. This may indicate ');
    lines.push('the scenario duration was too short or target paths did not enter sensor coverage. ');
  }

  const degradedSensors = state.registrationStates.filter(r => !r.fusionSafe).length;
  if (degradedSensors > 0) {
    lines.push(`Note: ${degradedSensors} sensor(s) had registration issues (fusion-unsafe).`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by ELOC2 Report Generator (REQ-12)*');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
