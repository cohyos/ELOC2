/**
 * Live simulation engine.
 *
 * Wires the ScenarioRunner (synthetic sensor data) through the full
 * processing pipeline: registration, fusion, track management,
 * geometry, EO investigation, and EO tasking. Maintains the authoritative
 * system state that all API endpoints read from, and pushes events to
 * WebSocket clients.
 */

import type {
  SystemTrack,
  SensorState,
  SensorId,
  Task,
  TaskId,
  CueId,
  EoTrackId,
  SystemTrackId,
  Timestamp,
  SourceObservation,
  GeometryEstimate,
  RegistrationState,
  EoCue,
  EoTrack,
  UnresolvedGroup,
  BearingMeasurement,
  TargetClassification,
  ClassificationSource,
  CoverZone,
} from '@eloc2/domain';
import { createLineageEntry } from '@eloc2/domain';
import type { EventEnvelope } from '@eloc2/events';
import { createEventEnvelope } from '@eloc2/events';
import { ScenarioRunner, interpolatePosition, interpolateVelocity, isTargetActive } from '@eloc2/simulator';
import type { SimulationEvent } from '@eloc2/simulator';
import type { EoBearingObservation } from '@eloc2/simulator';
import { centralIsrael, getScenarioById } from '@eloc2/scenario-library';
import type { ScenarioDefinition } from '@eloc2/scenario-library';
import { TrackManager } from '@eloc2/fusion-core';
import { RegistrationHealthService } from '@eloc2/registration';
import { generateId, bearingDeg } from '@eloc2/shared-utils';
import {
  issueCue,
  isCueValid,
  assessAmbiguity,
  splitGroup,
  mergeIntoGroup,
  handleEoReport,
  createEoReport,
  assessIdentification,
} from '@eloc2/eo-investigation';
import {
  generateCandidates,
  scoreCandidate,
  applyPolicy,
  assignTasks,
} from '@eloc2/eo-tasking';
import type { ScoringWeights } from '@eloc2/eo-tasking';
import {
  triangulateMultiple,
  buildGeometryEstimate,
  scoreQuality,
  estimateLaunchPoint,
  estimateImpactPoint,
} from '@eloc2/geometry';
import {
  selectFusionMode,
  type FusionMode,
} from '@eloc2/fusion-core';
import { EoManagementModule } from '@eloc2/eo-management';
import type { EoModuleStatus } from '@eloc2/eo-management';
import { CoreEoTargetDetector } from './core-eo-detector.js';
import type { EoDetection, EoTarget3D, CoreDetectorResult } from './core-eo-detector.js';
import { SimulationStateMachine } from './state-machine.js';
import type { SimulationState, SimulationAction } from './state-machine.js';
import { accumulateSample, resetAccumulator } from '../reports/report-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveState {
  tracks: SystemTrack[];
  sensors: SensorState[];
  tasks: Task[];
  geometryEstimates: Map<string, GeometryEstimate>;
  registrationStates: RegistrationState[];
  eventLog: LiveEvent[];
  scenarioId: string;
  running: boolean;
  speed: number;
  elapsedSec: number;
  durationSec: number;
  // Phase 5: EO orchestration state
  eoTracks: EoTrack[];
  unresolvedGroups: UnresolvedGroup[];
  activeCues: EoCue[];
}

export interface LiveEvent {
  id: string;
  eventType: string;
  timestamp: number;
  simTimeSec: number;
  summary: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Decision Chain — traces GT target through the full pipeline
// ---------------------------------------------------------------------------

export interface DecisionChainStep {
  stage: 'ground_truth' | 'detection' | 'cover_zone' | 'correlation' | 'fusion' | 'promotion' | 'eo_tasking' | 'eo_investigation' | 'geometry' | 'classification';
  timestamp: number;
  simTimeSec: number;
  detail: string;
  decision?: string;      // what was decided
  alternatives?: string;  // what else was considered
  score?: number;         // scoring metric for this step (0-1)
  data?: Record<string, unknown>;
}

export interface DecisionChainEntry {
  id: string;
  targetId: string;       // GT target ID
  targetName: string;
  trackId: string;        // associated SystemTrack ID
  simTimeSec: number;
  steps: DecisionChainStep[];
  chainQuality: number;   // overall quality score 0-1
  qualityBreakdown: {
    detectionLatency: number;     // seconds from target active to first detection
    positionAccuracy: number;     // 0-1, based on error vs threshold
    correlationCorrectness: number; // 1 if track matches GT, 0 if false
    promotionSpeed: number;       // 0-1, how fast tentative→confirmed
    classificationAccuracy: number; // 0-1
    geometryQuality: number;      // 0-1, based on triangulation quality
    fusionEfficiency: number;     // 0-1, based on source diversity
  };
}

type WsClient = { send: (data: string) => void };

export interface ConnectedUsers {
  total: number;
  instructors: number;
  operators: number;
}

export interface WsClientInfo {
  client: WsClient;
  role: 'instructor' | 'operator' | 'anonymous';
  connectedAt: number;
}

export interface InvestigationParameters {
  weights: {
    threat: number;
    uncertaintyReduction: number;
    geometryGain: number;
    operatorIntent: number;
    slewCost: number;
    occupancyCost: number;
  };
  thresholds: {
    splitAngleDeg: number;
    confidenceGate: number;
    cueValidityWindowSec: number;
    convergenceThreshold: number;
  };
  policyMode: 'recommended_only' | 'auto_with_veto' | 'manual';
}

export interface InvestigationSummaryWS {
  trackId: string;
  trackStatus: string;
  investigationStatus: string;
  assignedSensors: string[];
  cuePriority: number;
  bearingCount: number;
  geometryStatus: string;
  hypotheses: Array<{ label: string; probability: number }>;
  scoreBreakdown: {
    threat: number;
    uncertainty: number;
    geometry: number;
    intent: number;
  };
}

export interface InvestigationEvent {
  timestamp: number;
  simTimeSec: number;
  type: 'observation' | 'classification' | 'state_change' | 'eo_dwell' | 'bearing_report' | 'cue_issued' | 'task_assigned' | 'geometry_update';
  sensorId: string;
  trackId: string;
  details: Record<string, unknown>;
}

const DEFAULT_INVESTIGATION_PARAMETERS: InvestigationParameters = {
  weights: {
    threat: 1.0,
    uncertaintyReduction: 1.0,
    geometryGain: 0.5,
    operatorIntent: 2.0,
    slewCost: 0.3,
    occupancyCost: 0.5,
  },
  thresholds: {
    splitAngleDeg: 0.5,
    confidenceGate: 0.7,
    cueValidityWindowSec: 30,
    convergenceThreshold: 0.85,
  },
  policyMode: 'auto_with_veto',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Run EO tasking every N simulation seconds. */
const EO_TASKING_INTERVAL_SEC = 3;

// ---------------------------------------------------------------------------
// Cover-zone helpers
// ---------------------------------------------------------------------------

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (lat, lon) is inside the given polygon vertices.
 */
function pointInPolygon(lat: number, lon: number, polygon: Array<{ lat: number; lon: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lon;
    const yj = polygon[j].lat, xj = polygon[j].lon;
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Returns the detection-probability modifier for a point given cover zones.
 * If the point lies inside a zone, returns that zone's modifier; otherwise 1.0.
 */
function getDetectionModifier(lat: number, lon: number, coverZones: CoverZone[]): number {
  for (const zone of coverZones) {
    if (pointInPolygon(lat, lon, zone.polygon)) {
      return zone.detectionProbabilityModifier;
    }
  }
  return 1.0;
}


// ---------------------------------------------------------------------------
// FOV overlap helpers
// ---------------------------------------------------------------------------

export interface FovOverlap {
  sensorIds: [string, string];
  overlapRegion: Array<{ lat: number; lon: number }>;
  tracksInOverlap: string[];
}

const DEG_TO_RAD_ENGINE = Math.PI / 180;

/**
 * Project a point at rangeKm from (lat, lon) along azimuth azDeg.
 */
function geoProject(lat: number, lon: number, azDeg: number, rangeKm: number): { lat: number; lon: number } {
  const rangeM = rangeKm * 1000;
  const azRad = azDeg * DEG_TO_RAD_ENGINE;
  const mPerDegLon = 111320 * Math.cos(lat * DEG_TO_RAD_ENGINE);
  const mPerDegLat = 110540;
  return {
    lon: lon + (rangeM / mPerDegLon) * Math.sin(azRad),
    lat: lat + (rangeM / mPerDegLat) * Math.cos(azRad),
  };
}

/**
 * Compute the FOV polygon for an EO sensor as a triangle:
 * [sensorPos, leftFarPoint, rightFarPoint]
 */
function computeFovPolygon(sensor: SensorState, rangeKm: number): Array<{ lat: number; lon: number }> {
  if (!sensor.gimbal || !sensor.fov) return [];
  const azDeg = sensor.gimbal.azimuthDeg;
  const halfAngle = sensor.fov.halfAngleHDeg;
  const { lat, lon } = sensor.position;

  const leftAz = azDeg - halfAngle;
  const rightAz = azDeg + halfAngle;

  return [
    { lat, lon },
    geoProject(lat, lon, leftAz, rangeKm),
    geoProject(lat, lon, rightAz, rangeKm),
  ];
}

/**
 * Ray-casting point-in-polygon test for {lat, lon} points.
 */
function pointInFovPolygon(point: { lat: number; lon: number }, polygon: Array<{ lat: number; lon: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lon;
    const yj = polygon[j].lat, xj = polygon[j].lon;
    if (((yi > point.lat) !== (yj > point.lat)) && (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if two FOV triangles overlap by testing vertex containment.
 */
function fovPolygonsOverlap(fov1: Array<{ lat: number; lon: number }>, fov2: Array<{ lat: number; lon: number }>): boolean {
  for (const v of fov1) {
    if (pointInFovPolygon(v, fov2)) return true;
  }
  for (const v of fov2) {
    if (pointInFovPolygon(v, fov1)) return true;
  }
  return false;
}

/**
 * Approximate overlap region of two FOV triangles.
 * Returns vertices from both polygons that lie inside the other.
 */
function computeOverlapRegion(
  fov1: Array<{ lat: number; lon: number }>,
  fov2: Array<{ lat: number; lon: number }>,
): Array<{ lat: number; lon: number }> {
  const region: Array<{ lat: number; lon: number }> = [];
  for (const v of fov1) {
    if (pointInFovPolygon(v, fov2)) region.push(v);
  }
  for (const v of fov2) {
    if (pointInFovPolygon(v, fov1)) region.push(v);
  }
  if (region.length < 3) {
    const allPts = [...fov1, ...fov2];
    const cx = allPts.reduce((s, p) => s + p.lat, 0) / allPts.length;
    const cy = allPts.reduce((s, p) => s + p.lon, 0) / allPts.length;
    return [{ lat: cx, lon: cy }];
  }
  return region;
}
// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class LiveEngine {
  private runner: ScenarioRunner;
  private scenario: ScenarioDefinition;
  private trackManager: TrackManager;
  private registrationService: RegistrationHealthService;
  private state: LiveState;
  private stateMachine = new SimulationStateMachine();
  /** Throttle broadcastRap: minimum ms between broadcasts */
  private lastBroadcastTime = 0;
  private static readonly MIN_BROADCAST_INTERVAL_MS = 250;
  private timer: ReturnType<typeof setInterval> | null = null;
  private wsClients = new Set<WsClient>();
  private wsClientInfos = new Map<WsClient, WsClientInfo>();
  private autoLoopEnabled = false;
  private autoLoopTimer: ReturnType<typeof setTimeout> | null = null;
  private autoInjectTimer: ReturnType<typeof setTimeout> | null = null;
  private autoInjectEnabled = false;

  // Phase 5: EO orchestration internal state
  private eoTracksById = new Map<string, EoTrack>();
  private unresolvedGroupsById = new Map<string, UnresolvedGroup>();
  private activeCuesById = new Map<string, EoCue>();
  /** Maps cueId → systemTrackId for cue-to-track lookup. */
  private cueToTrack = new Map<string, string>();

  /** Per-track investigation event log for pyrite/audit mode */
  private investigationLog = new Map<string, InvestigationEvent[]>();

  // ── Ballistic estimation (Task 6.5) ────────────────────────────────
  private trackPositionHistory = new Map<string, Array<{ lat: number; lon: number; alt: number; timeSec: number }>>();
  private cachedBallisticEstimates: Array<{
    trackId: string;
    launchPoint: { lat: number; lon: number; alt: number; uncertainty2SigmaM: number } | null;
    impactPoint: { lat: number; lon: number; alt: number; uncertainty2SigmaM: number; timeToImpactSec: number } | null;
  }> = [];
  private static readonly MAX_POSITION_HISTORY = 20;
  private operatorPriorityTracks = new Set<string>();
  /** Sensors locked by operator — excluded from auto-assignment */
  private operatorLockedSensors = new Map<string, {
    sensorId: string;
    targetTrackId?: string;
    position?: { lat: number; lon: number; alt: number };
    lockedAt: number; // sim time
  }>();
  /** Track priority overrides (high/normal/low) */
  private operatorTrackPriority = new Map<string, 'high' | 'normal' | 'low'>();
  /** Accumulates bearings per cueId within a tick for batch processing. */
  private pendingBearings = new Map<string, EoBearingObservation[]>();
  private lastEoTaskingSec = 0;
  /** Tracks the active fusion mode per sensor for UI display. */
  private fusionModePerSensor = new Map<string, FusionMode>();
  /** Investigation parameters (runtime-tunable). */
  private currentParameters: InvestigationParameters = { ...DEFAULT_INVESTIGATION_PARAMETERS, weights: { ...DEFAULT_INVESTIGATION_PARAMETERS.weights }, thresholds: { ...DEFAULT_INVESTIGATION_PARAMETERS.thresholds } };
  /** Formal event envelopes for validation runner. */
  private eventEnvelopes: EventEnvelope[] = [];

  /** Dwell state: tracks how long each sensor has been dwelling on its current target */
  private dwellState = new Map<string, {
    sensorId: string;
    targetTrackId: string;
    dwellStartSec: number;      // sim time when dwell started
    dwellDurationSec: number;    // configured dwell (default 15s)
  }>();

  /** Default dwell time in simulation seconds */
  private static readonly DEFAULT_DWELL_SEC = 15;

  /** Per-sensor dwell duration overrides (operator control) */
  private dwellDurationOverrides = new Map<string, number>();

  /** Revisit tracking: last investigation time per track */
  private lastInvestigationTime = new Map<string, number>(); // trackId → sim time
  /** Maximum revisit interval in sim seconds */
  private static readonly MAX_REVISIT_INTERVAL_SEC = 60;

  /** Cycling history: ordered list of targets each sensor has visited */
  private cyclingHistory = new Map<string, Array<{
    trackId: string;
    startedSec: number;
    endedSec: number;
  }>>();

  // ── Before/After EO Comparison (REQ-9) ─────────────────────────────
  /** Snapshots of track state before and after EO investigation */
  private eoSnapshots = new Map<string, {
    preEo: {
      positionError: number;
      covariance: number;
      classification: string | null;
      geometryStatus: string;
      timestamp: number;
    };
    postEo: {
      positionError: number;
      covariance: number;
      classification: string | null;
      geometryStatus: string;
      timestamp: number;
    } | null;
  }>();

  // ── Search Mode state (REQ-5 Phase B) ────────────────────────────────
  /** Per-sensor search mode state: when no targets exist, EO sensors scan sectors */
  private searchModeState = new Map<string, {
    active: boolean;
    pattern: 'sector' | 'raster';
    currentAzimuth: number;     // current scan direction (degrees)
    scanStart: number;          // sector start azimuth
    scanEnd: number;            // sector end azimuth
    scanSpeed: number;          // degrees per second
    scanDirection: 1 | -1;     // 1 = clockwise, -1 = counter-clockwise
    idleTickCount: number;      // ticks with no candidates (activate after 3)
  }>();

  // ── Decision Chain Log ───────────────────────────────────────────────
  private decisionChains: DecisionChainEntry[] = [];
  private readonly MAX_DECISION_CHAINS = 200;

  // ── Quality Assessment state ──────────────────────────────────────────
  /** Time (sim seconds) when each target was first associated with a system track */
  private firstDetectionTime = new Map<string, number>();
  /** Time (sim seconds) when each target's associated track first reached confirmed_3d */
  private confirmedGeometryTime = new Map<string, number>();
  /** Accumulated sensor tasked ticks (each tick a sensor has an active dwell counts as 1) */
  private sensorTaskedTicks = new Map<string, number>();
  /** Accumulated sensor observation ticks (each tick a sensor produces at least one observation counts as 1) */
  private sensorObservationTicks = new Map<string, number>();
  /** Sensors that produced observations in the current tick (reset each tick) */
  private currentTickObservingSensors = new Set<string>();
  /** Total ticks elapsed (for sensor utilization denominator) */
  private totalTicks = 0;
  /** Cached quality metrics (recomputed each tick) */
  private cachedQualityMetrics: {
    /** Primary quality measure: overall system picture accuracy vs GT [0–100]. */
    pictureAccuracy: number;
    /** Per-GT-target match details. */
    gtMatchDetails: Array<{
      targetId: string;
      matched: boolean;
      positionErrorM: number;
      velocityErrorMps: number;
      trackId: string | null;
    }>;
    trackToTruthAssociation: number;
    positionErrorAvg: number;
    positionErrorMax: number;
    classificationAccuracy: number;
    coveragePercent: number;
    falseTrackRate: number;
    sensorUtilization: Record<string, number>;
    timeToFirstDetection: Record<string, number>;
    timeToConfirmed3D: Record<string, number>;
  } | null = null;

  /** Cached EO allocation quality metrics (REQ-10, recomputed each tick) */
  private cachedEoAllocationQuality: {
    coverageEfficiency: number;
    geometryOptimality: number;
    dwellEfficiency: number;
    revisitTimeliness: number;
    triangulationSuccessRate: number;
    sensorUtilization: number;
    priorityAlignment: number;
  } | null = null;

  // ── FOV overlap detection (REQ-6) ──────────────────────────────────────
  private fovOverlaps: FovOverlap[] = [];

  // ── Multi-target bearing association (REQ-6) ────────────────────────────
  private bearingAssociations: Array<{
    trackId: string;
    sensorId: string;
    bearing: number;            // azimuth degrees
    confidence: number;         // 0-1 association confidence
    ambiguous: boolean;         // true if multiple targets could match this bearing
    alternateTrackIds: string[]; // other tracks this bearing could belong to
  }> = [];

  // ── Multi-sensor 3D resolution (REQ-6) ────────────────────────────────
  private multiSensorResolutions: Array<{
    trackId: string;
    sensorCount: number;        // how many sensors contributed
    sensorIds: string[];         // which sensors
    qualityScore: number;        // 0-1 quality of the 3D solution
    positionEstimate: { lat: number; lon: number; alt: number } | null;
    method: '2-sensor' | 'multi-sensor';  // which method was used
  }> = [];

  // ── EO Management Module (REQ-16) ────────────────────────────────────
  /** Unified EO management module — delegates all EO-related processing. */
  private eoModule = new EoManagementModule();
  /** Cached EO module status for WS broadcast. */
  private cachedEoModuleStatus: EoModuleStatus | null = null;

  // ── Core EO Target Detector ─────────────────────────────────────────
  /** Two-tier staring EO detection: per-sensor az/el detections + cross-sensor triangulation. */
  private coreEoDetector = new CoreEoTargetDetector();

  // ── Latency tracking ─────────────────────────────────────────────────
  /** Rolling window of per-tick processing latencies (ms) */
  private tickLatencies: number[] = [];
  private static readonly LATENCY_WINDOW_SIZE = 100;
  private cachedLatency: { tickMs: number; avgMs: number; maxMs: number } = { tickMs: 0, avgMs: 0, maxMs: 0 };
  private tickStartTime = 0;

  // ── System load metrics ─────────────────────────────────────────────
  /** Rolling 10-second window of observation counts per tick */
  private observationCounts: number[] = [];
  private static readonly SYSTEM_LOAD_WINDOW = 10;
  /** Rolling 10-second window of WS messages sent per tick */
  private wsMessageCounts: number[] = [];
  /** Observations processed in the current tick */
  private currentTickObservations = 0;
  /** WS messages sent in the current tick */
  private currentTickWsMessages = 0;
  /** Cached system load for broadcast */
  private cachedSystemLoad: {
    tickMs: number;
    observationsPerSec: number;
    tracksActive: number;
    wsMessagesPerSec: number;
    memoryMB: number;
    uptime: number;
  } = { tickMs: 0, observationsPerSec: 0, tracksActive: 0, wsMessagesPerSec: 0, memoryMB: 0, uptime: 0 };

  /** Record tick processing latency and update rolling statistics. */
  private recordTickLatency(): void {
    const tickMs = Date.now() - this.tickStartTime;
    this.tickLatencies.push(tickMs);
    if (this.tickLatencies.length > LiveEngine.LATENCY_WINDOW_SIZE) {
      this.tickLatencies.shift();
    }
    const sum = this.tickLatencies.reduce((a, b) => a + b, 0);
    const avgMs = Math.round(sum / this.tickLatencies.length);
    const maxMs = Math.max(...this.tickLatencies);
    this.cachedLatency = { tickMs, avgMs, maxMs };
  }

  /** Update system load metrics at end of tick. */
  private updateSystemLoad(): void {
    // Track observation count for this tick
    this.observationCounts.push(this.currentTickObservations);
    if (this.observationCounts.length > LiveEngine.SYSTEM_LOAD_WINDOW) {
      this.observationCounts.shift();
    }
    // Track WS message count for this tick
    this.wsMessageCounts.push(this.currentTickWsMessages);
    if (this.wsMessageCounts.length > LiveEngine.SYSTEM_LOAD_WINDOW) {
      this.wsMessageCounts.shift();
    }

    const obsSum = this.observationCounts.reduce((a, b) => a + b, 0);
    const wsSum = this.wsMessageCounts.reduce((a, b) => a + b, 0);
    const windowSec = this.observationCounts.length || 1;

    const activeTracks = this.state.tracks.filter(
      t => t.status === 'confirmed' || t.status === 'tentative',
    ).length;

    this.cachedSystemLoad = {
      tickMs: this.cachedLatency.tickMs,
      observationsPerSec: Math.round((obsSum / windowSec) * 10) / 10,
      tracksActive: activeTracks,
      wsMessagesPerSec: Math.round((wsSum / windowSec) * 10) / 10,
      memoryMB: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
      uptime: Math.round(process.uptime()),
    };

    // Reset per-tick counters
    this.currentTickObservations = 0;
    this.currentTickWsMessages = 0;
  }

  /** Get the latest system load metrics. */
  getSystemLoad(): {
    tickMs: number;
    observationsPerSec: number;
    tracksActive: number;
    wsMessagesPerSec: number;
    memoryMB: number;
    uptime: number;
  } {
    return { ...this.cachedSystemLoad };
  }

  /** Get the latest latency metrics. */
  getLatency(): { tickMs: number; avgMs: number; maxMs: number } {
    return { ...this.cachedLatency };
  }

  // ── Convergence monitoring (REQ-5 Phase C) ────────────────────────────
  /** Tracks how triangulation quality improves over successive dwells */
  private convergenceState = new Map<string, {
    trackId: string;
    measurements: Array<{
      timestamp: number;
      positionErrorEstimate: number;
      intersectionAngle: number;
      numBearings: number;
    }>;
    convergenceRate: number;
    converged: boolean;
    convergedAt: number | null;
  }>();

  constructor(scenarioId?: string) {
    this.scenario = (scenarioId ? getScenarioById(scenarioId) : undefined) ?? centralIsrael;
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({
      confirmAfter: 3,
      dropAfterMisses: 8,
      // Enhanced radar track building
      enableExistence: true,
      existencePromotionThreshold: 0.5,
      existenceConfirmationThreshold: 0.8,
      existenceDeletionThreshold: 0.1,
      coastingMissThreshold: 3,
      pDetection: 0.9,
      pFalseAlarm: 0.01,
      maxCoastingTimeSec: 15,
      associationMode: 'nn', // default NN; switch to 'auto' for JPDA/MHT
      enableIMM: true, // P5: Enable IMM for coordinated turn detection
      enableTBD: false,
    });
    // Enable dual-hypothesis BM/ABT tracking: in early detection each track
    // is evaluated against both BM and ABT parameter profiles. Once velocity
    // and trajectory angle provide enough evidence, the system commits to the
    // appropriate profile (wide gates + fast confirm for BM, tight gates for ABT).
    this.trackManager.enableDualHypothesis = true;
    this.registrationService = new RegistrationHealthService();

    // P3: Initialize registration health for all sensors at startup.
    // Without this, getHealth() returns undefined → selectFusionMode defaults
    // to 'confirmation_only' which inflates covariance and degrades accuracy.
    this.initializeSensorRegistration();

    this.state = this.buildInitialState();
  }

  /**
   * Initialize registration health for all sensors defined in the scenario.
   * Registers them with zero bias (good health), so fusion-mode-selector
   * can choose centralized/conservative modes instead of confirmation_only.
   */
  private initializeSensorRegistration(): void {
    for (const sensor of this.scenario.sensors) {
      this.registrationService.updateBias(sensor.sensorId as SensorId, {
        azimuthBiasDeg: 0,
        elevationBiasDeg: 0,
        rangeBiasM: 0,
      });
    }
  }

  // ── Injection log ────────────────────────────────────────────────────
  injectionLog: Array<{ id: string; type: string; timestamp: number; details: any }> = [];

  getInjectionLog(): typeof this.injectionLog {
    return this.injectionLog;
  }

  // ── Public API ────────────────────────────────────────────────────────

  getState(): LiveState {
    return this.state;
  }

  getSimulationState(): { state: SimulationState; allowedActions: SimulationAction[] } {
    return {
      state: this.stateMachine.currentState,
      allowedActions: this.stateMachine.getAllowedActions(),
    };
  }

  /** Compute ground truth positions for all active targets at the current sim time. */
  getGroundTruth(): Array<{
    targetId: string;
    name: string;
    position: { lat: number; lon: number; alt: number };
    velocity: { vx: number; vy: number; vz: number } | undefined;
    classification?: string;
    active: true;
  }> {
    const timeSec = this.state.elapsedSec;
    const result: Array<{
      targetId: string;
      name: string;
      position: { lat: number; lon: number; alt: number };
      velocity: { vx: number; vy: number; vz: number } | undefined;
      classification?: string;
      active: true;
    }> = [];

    for (const target of this.scenario.targets) {
      if (!isTargetActive(target, timeSec)) continue;

      // Waypoint times are relative to startTime (same as ScenarioRunner)
      const relativeTime = timeSec - target.startTime;
      const pos = interpolatePosition(target.waypoints, relativeTime);
      if (!pos) continue;

      const vel = interpolateVelocity(target.waypoints, relativeTime);

      result.push({
        targetId: target.targetId,
        name: target.name,
        position: { lat: pos.lat, lon: pos.lon, alt: pos.alt },
        velocity: vel ? { vx: vel.vx, vy: vel.vy, vz: vel.vz } : undefined,
        ...((target as any).classification ? { classification: (target as any).classification } : {}),
        active: true,
      });
    }

    return result;
  }

  /** Look up the true classification of the target associated with a system track. */
  private getTargetClassificationForTrack(
    systemTrackId: string,
  ): TargetClassification | undefined {
    const track = this.state.tracks.find(
      t => (t.systemTrackId as string) === systemTrackId,
    );
    if (!track) return undefined;

    const groundTruth = this.getGroundTruth();
    let bestTarget: (typeof groundTruth)[number] | null = null;
    let bestDist = Infinity;
    for (const gt of groundTruth) {
      const dlat = gt.position.lat - track.state.lat;
      const dlon = gt.position.lon - track.state.lon;
      const dist = Math.sqrt(dlat * dlat + dlon * dlon);
      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = gt;
      }
    }

    // Only use if reasonably close (within ~8 km ≈ 0.072 degrees)
    if (bestTarget && bestDist < 0.072) {
      return bestTarget.classification as TargetClassification | undefined;
    }
    return undefined;
  }

  /** Build a full snapshot payload identical to broadcastRap() format. */
  getFullSnapshot(): Record<string, unknown> {
    const tracks = this.state.tracks;
    const lightTracks = tracks.map(t => ({
      ...t,
      lineage: t.lineage.length > 3 ? t.lineage.slice(-3) : t.lineage,
    }));
    const lightCues = this.state.activeCues.map(c => ({
      cueId: c.cueId,
      systemTrackId: c.systemTrackId,
      predictedState: c.predictedState,
      uncertaintyGateDeg: c.uncertaintyGateDeg,
      priority: c.priority,
      validFrom: c.validFrom,
      validTo: c.validTo,
    }));
    const lightTasks = this.state.tasks
      .filter(t => t.status === 'executing' || t.status === 'proposed')
      .map(t => ({
        taskId: t.taskId,
        cueId: t.cueId,
        sensorId: t.sensorId,
        systemTrackId: t.systemTrackId,
        status: t.status,
        scoreBreakdown: t.scoreBreakdown,
        policyMode: t.policyMode,
        createdAt: t.createdAt,
      }));
    return {
      type: 'rap.snapshot',
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      scenarioId: this.scenario.id,
      running: this.state.running,
      speed: this.state.speed,
      trackCount: tracks.length,
      confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: tracks.filter(t => t.status === 'tentative').length,
      tracks: lightTracks,
      sensors: this.state.sensors,
      activeCues: lightCues,
      tasks: lightTasks,
      eoTracks: this.state.eoTracks.slice(-20).map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        associatedSystemTrackId: t.associatedSystemTrackId,
        identificationSupport: t.identificationSupport,
      })),
      geometryEstimates: [...this.state.geometryEstimates.entries()].map(([trackId, est]) => ({
        trackId,
        estimateId: est.estimateId,
        position3D: est.position3D,
        quality: est.quality,
        classification: est.classification,
        intersectionAngleDeg: est.intersectionAngleDeg,
        timeAlignmentQualityMs: est.timeAlignmentQualityMs,
        bearingNoiseDeg: est.bearingNoiseDeg,
        eoTrackIds: est.eoTrackIds,
      })),
      registrationStates: this.state.registrationStates.map(r => ({
        sensorId: r.sensorId,
        spatialQuality: r.spatialQuality,
        timingQuality: r.timingQuality,
        fusionSafe: r.fusionSafe,
        azimuthBiasDeg: r.spatialBias?.azimuthBiasDeg ?? 0,
        elevationBiasDeg: r.spatialBias?.elevationBiasDeg ?? 0,
        clockOffsetMs: r.clockBias?.offsetMs ?? 0,
      })),
      unresolvedGroups: this.state.unresolvedGroups.map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        parentCueId: g.parentCueId,
        reason: g.reason,
      })),
      fusionModes: Object.fromEntries(this.fusionModePerSensor),
      investigationSummaries: this.getActiveInvestigations(),
      dwellStates: this.getDwellStates(),
      revisitSchedule: this.getRevisitSchedule(),
      operatorOverrides: this.getOperatorOverrides(),
      groundTruth: this.getGroundTruth(),
      coverZones: this.scenario.coverZones ?? [],
      operationalZones: (this.scenario as any).operationalZones ?? [],
      cyclingHistories: Object.fromEntries(
        [...this.cyclingHistory.entries()].map(([sensorId, history]) => [sensorId, history.slice(-5)]),
      ),
      qualityMetrics: this.cachedQualityMetrics ?? undefined,
      eoAllocationQuality: this.cachedEoAllocationQuality ?? undefined,
      decisionChains: this.decisionChains.length > 0 ? this.decisionChains : undefined,
      beforeAfterComparison: this.getBeforeAfterComparison(),
      fovOverlaps: this.fovOverlaps,
      bearingAssociations: this.bearingAssociations.filter(a => a.ambiguous || a.confidence < 1.0),
      multiSensorResolutions: this.multiSensorResolutions,
      searchModeStates: this.getSearchModeStatus().filter(s => s.active),
      convergenceStates: this.getConvergenceStates(),
      eoModuleStatus: this.cachedEoModuleStatus ?? undefined,
      latency: this.cachedLatency,
      systemLoad: this.cachedSystemLoad,
      ballisticEstimates: this.cachedBallisticEstimates,
      connectedUsers: this.getConnectedUsers(),
      autoLoopEnabled: this.autoLoopEnabled,
    };
  }

  // ── Fusion Config API ────────────────────────────────────────────────

  getFusionConfig(): { gateThreshold: number; mergeDistanceM: number } {
    return {
      gateThreshold: this.trackManager.getCorrelatorConfig().gateThreshold,
      mergeDistanceM: this.trackManager.getMergeDistance(),
    };
  }

  setFusionConfig(config: { gateThreshold?: number; mergeDistanceM?: number }): void {
    if (config.gateThreshold !== undefined) {
      this.trackManager.setCorrelatorConfig({ gateThreshold: config.gateThreshold });
    }
    if (config.mergeDistanceM !== undefined) {
      this.trackManager.setMergeDistance(config.mergeDistanceM);
    }
  }

  // ── Investigation Parameters API ─────────────────────────────────────

  getInvestigationParameters(): InvestigationParameters {
    return this.currentParameters;
  }

  setInvestigationParameters(params: Partial<InvestigationParameters>): void {
    if (params.weights) {
      this.currentParameters.weights = { ...this.currentParameters.weights, ...params.weights };
    }
    if (params.thresholds) {
      this.currentParameters.thresholds = { ...this.currentParameters.thresholds, ...params.thresholds };
    }
    if (params.policyMode) {
      this.currentParameters.policyMode = params.policyMode;
    }
  }

  resetInvestigationParameters(): void {
    this.currentParameters = {
      ...DEFAULT_INVESTIGATION_PARAMETERS,
      weights: { ...DEFAULT_INVESTIGATION_PARAMETERS.weights },
      thresholds: { ...DEFAULT_INVESTIGATION_PARAMETERS.thresholds },
    };
  }

  getActiveInvestigations(): InvestigationSummaryWS[] {
    const summaries: InvestigationSummaryWS[] = [];
    // Each active cue represents an active investigation
    for (const cue of this.activeCuesById.values()) {
      const systemTrackId = cue.systemTrackId as string;
      const track = this.state.tracks.find(t => (t.systemTrackId as string) === systemTrackId);
      if (!track) continue;

      // Find assigned sensors (tasks executing for this track)
      const assignedSensors = this.state.tasks
        .filter(t => (t.systemTrackId as string) === systemTrackId && t.status === 'executing')
        .map(t => t.sensorId as string);

      // Count bearings from eoTracks associated with this track
      const bearingCount = this.state.eoTracks
        .filter(et => (et.associatedSystemTrackId as string) === systemTrackId)
        .length;

      // Geometry status
      const geoEstimate = this.state.geometryEstimates.get(systemTrackId);
      let geometryStatus = 'bearing_only';
      if (geoEstimate) {
        geometryStatus = geoEstimate.classification ?? 'candidate_3d';
      }

      // Check for unresolved groups related to this track's cue
      const relatedGroup = [...this.unresolvedGroupsById.values()].find(
        g => (g.parentCueId as string) === (cue.cueId as string),
      );
      let investigationStatus = 'in_progress';
      const hypotheses: Array<{ label: string; probability: number }> = [];
      if (relatedGroup) {
        if (relatedGroup.status === 'active' || relatedGroup.status === 'escalated') {
          investigationStatus = 'split_detected';
          // Generate hypotheses from eoTracks in the group
          const groupTracks = relatedGroup.eoTrackIds.length;
          if (groupTracks > 0) {
            for (let i = 0; i < groupTracks; i++) {
              hypotheses.push({
                label: `Target ${i + 1}`,
                probability: 1 / groupTracks,
              });
            }
          }
        }
      }
      if (track.status === 'confirmed' && bearingCount >= 2 && geoEstimate) {
        investigationStatus = 'confirmed';
      }

      // Score breakdown from the most recent task for this track
      const recentTask = this.state.tasks.find(
        t => (t.systemTrackId as string) === systemTrackId && t.scoreBreakdown,
      );
      const scoreBreakdown = {
        threat: recentTask?.scoreBreakdown?.threat ?? 0,
        uncertainty: recentTask?.scoreBreakdown?.uncertaintyReduction ?? 0,
        geometry: recentTask?.scoreBreakdown?.geometryGain ?? 0,
        intent: recentTask?.scoreBreakdown?.operatorIntent ?? 0,
      };

      summaries.push({
        trackId: systemTrackId,
        trackStatus: track.status,
        investigationStatus,
        assignedSensors,
        cuePriority: cue.priority,
        bearingCount,
        geometryStatus,
        hypotheses,
        scoreBreakdown,
      });
    }
    return summaries;
  }

  forceResolveGroup(groupId: string): boolean {
    const group = this.unresolvedGroupsById.get(groupId);
    if (!group) return false;
    // Mark group as resolved
    const resolved: UnresolvedGroup = {
      ...group,
      status: 'resolved' as UnresolvedGroup['status'],
    };
    this.unresolvedGroupsById.set(groupId, resolved);
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()];
    this.pushEvent('investigation.force_resolved', `Group ${groupId} force-resolved by operator`);
    return true;
  }

  /** Returns formal EventEnvelope objects for use by the validation runner. */
  getEventEnvelopes(): EventEnvelope[] {
    return this.eventEnvelopes;
  }

  /** Public accessor exposing scenario metadata for report generation (REQ-12). */
  getScenarioInfo(): {
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
  } {
    const s = this.scenario;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      durationSec: s.durationSec,
      targetCount: s.targets.length,
      sensorCount: s.sensors.length,
      radarCount: s.sensors.filter(sen => sen.type === 'radar').length,
      eoCount: s.sensors.filter(sen => sen.type === 'eo').length,
      policyMode: s.policyMode,
      targetNames: s.targets.map(t => t.name),
      sensorNames: s.sensors.map(sen => `${sen.sensorId} (${sen.type})`),
      hasCoverZones: (s.coverZones ?? []).length > 0,
    };
  }

  // ── Dwell & Revisit Public API ──────────────────────────────────────

  /** Get current dwell states for all sensors */
  getDwellStates(): Array<{ sensorId: string; targetTrackId: string; dwellStartSec: number; remainingSec: number }> {
    const nowSec = this.state.elapsedSec;
    const result: Array<{ sensorId: string; targetTrackId: string; dwellStartSec: number; remainingSec: number }> = [];
    for (const [, dwell] of this.dwellState) {
      const elapsed = nowSec - dwell.dwellStartSec;
      const remaining = Math.max(0, dwell.dwellDurationSec - elapsed);
      result.push({
        sensorId: dwell.sensorId,
        targetTrackId: dwell.targetTrackId,
        dwellStartSec: dwell.dwellStartSec,
        remainingSec: remaining,
      });
    }
    return result;
  }

  /** Set dwell duration for a specific sensor (operator control) */
  setDwellDuration(sensorId: string, durationSec: number): void {
    this.dwellDurationOverrides.set(sensorId, Math.max(1, durationSec));
    // If sensor is currently dwelling, update the active dwell's duration
    const activeDwell = this.dwellState.get(sensorId);
    if (activeDwell) {
      activeDwell.dwellDurationSec = Math.max(1, durationSec);
    }
  }

  /** Get revisit schedule */
  getRevisitSchedule(): Array<{ trackId: string; lastInvestigatedSec: number; nextRevisitSec: number; overdue: boolean }> {
    const nowSec = this.state.elapsedSec;
    const result: Array<{ trackId: string; lastInvestigatedSec: number; nextRevisitSec: number; overdue: boolean }> = [];
    for (const track of this.state.tracks) {
      const trackId = track.systemTrackId as string;
      const lastInv = this.lastInvestigationTime.get(trackId) ?? 0;
      const nextRevisit = lastInv + LiveEngine.MAX_REVISIT_INTERVAL_SEC;
      const overdue = nowSec > nextRevisit;
      result.push({
        trackId,
        lastInvestigatedSec: lastInv,
        nextRevisitSec: nextRevisit,
        overdue,
      });
    }
    return result;
  }

  /** Get cycling history for a sensor */
  getCyclingHistory(sensorId: string): Array<{ trackId: string; startedSec: number; endedSec: number }> {
    return this.cyclingHistory.get(sensorId) ?? [];
  }

  /** Get all cycling histories */
  getAllCyclingHistories(): Map<string, Array<{ trackId: string; startedSec: number; endedSec: number }>> {
    return this.cyclingHistory;
  }

  start(): void {
    if (this.state.running) return;
    // Determine correct action: 'start' from idle, 'resume' from paused
    const action: SimulationAction = this.stateMachine.currentState === 'idle' ? 'start' : 'resume';
    const result = this.stateMachine.tryTransition(action);
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = true;
    this.scheduleStep();
    this.pushEvent('scenario.started', `Scenario "${this.scenario.name}" started`);
  }

  pause(): void {
    if (!this.state.running) return;
    const result = this.stateMachine.tryTransition('pause');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pushEvent('scenario.paused', 'Scenario paused');
    // Send final broadcast with running=false so frontend knows to stop
    this.broadcastRap(true);
  }

  /**
   * Stop the scenario and return to idle.
   * Unlike pause(), this resets the state machine to idle.
   */
  stop(): void {
    const result = this.stateMachine.tryTransition('stop');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pushEvent('scenario.stopped', 'Scenario stopped');
    this.broadcastRap(true);
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(0.1, Math.min(100, speed));
    // Reschedule with new speed
    if (this.state.running) {
      if (this.timer) clearTimeout(this.timer);
      this.scheduleStep();
    }
    this.pushEvent('scenario.speed_changed', `Speed set to ${this.state.speed}x`);
  }

  reset(scenarioId?: string): void {
    const result = this.stateMachine.tryTransition('reset');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    // Stop the timer without going through pause() state transition
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (scenarioId) {
      const s = getScenarioById(scenarioId);
      if (s) this.scenario = s;
    }
    this.resetInternalState();
    resetAccumulator();
    // Complete the reset: resetting → idle
    this.stateMachine.tryTransition('reset');
    this.pushEvent('scenario.reset', 'Scenario reset');
    this.broadcastRap(true);
  }

  /**
   * Seek to a specific simulation time (in seconds).
   * Replays the scenario from the start up to the target time,
   * then pauses at that point. Resumes playing if wasRunning.
   */
  seek(toSec: number): void {
    const wasRunning = this.state.running;
    // If running, pause first (state machine: running → paused)
    if (wasRunning) {
      this.pause();
    }
    // Now seek (state machine: paused → seeking)
    const result = this.stateMachine.tryTransition('seek');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }

    // Clamp to valid range
    toSec = Math.max(0, Math.min(toSec, this.scenario.durationSec));

    // Reset all state and replay up to target time
    this.resetInternalState();

    // Fast-forward by stepping 1 second at a time
    for (let t = 0; t < toSec; t++) {
      const result = this.runner.step(1);
      this.state.elapsedSec = result.currentTimeSec;

      // Separate observation events for batch processing (prevents ghost tracks)
      const obsEvents: SimulationEvent[] = [];
      const otherEvents: SimulationEvent[] = [];
      for (const ev of result.events) {
        if (ev.type === 'observation') obsEvents.push(ev);
        else otherEvents.push(ev);
      }
      this.processObservationBatch(obsEvents);
      for (const simEvent of otherEvents) {
        this.processSimEvent(simEvent);
      }

      // Update sensor status
      this.updateSensorStatus(result.activeFaults);

      // Drop stale tracks (same logic as finalizeTick)
      const seekNow = Date.now();
      for (const tr of this.trackManager.getAllTracks().filter(t => t.status !== 'dropped')) {
        const age = (seekNow - (tr.lastUpdated as number)) / 1000;
        if (age > 3) {
          try { this.trackManager.missedUpdate(tr.systemTrackId); } catch (_) { /* merged/dropped */ }
        }
      }

      this.trackManager.mergeCloseTracks();
      this.state.tracks = this.trackManager.getAllTracks().filter(tr => tr.status !== 'dropped');
      this.processAccumulatedBearings();
      this.expireStaleEoCues();
      this.computeGeometryEstimates();
      this.processCoreEoDetector();

      if (result.currentTimeSec - this.lastEoTaskingSec >= EO_TASKING_INTERVAL_SEC) {
        this.runEoTaskingCycle();
        this.lastEoTaskingSec = result.currentTimeSec;
      }

      // Compute quality metrics on last tick
      if (t === Math.floor(toSec) - 1) {
        this.computeQualityMetrics();
      }
    }

    // Sync Phase 5 state to LiveState
    this.state.eoTracks = [...this.eoTracksById.values()];
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()].filter(g => g.status === 'active');
    this.state.activeCues = [...this.activeCuesById.values()];

    // Complete the seek (state machine: seeking → paused)
    this.stateMachine.tryTransition('seek_complete');

    // Broadcast current state (force: user-initiated seek)
    this.broadcastRap(true);
    this.pushEvent('scenario.seeked', `Seeked to T+${toSec}s`);

    // Resume if was running
    if (wasRunning) {
      this.start();
    }
  }

  // ── Live Injection API ───────────────────────────────────────────────

  /**
   * Inject a fault into the running scenario. Creates a fault_start event
   * immediately and schedules a fault_end after durationSec.
   * Returns the injection ID.
   */
  injectFault(fault: { type: string; sensorId: string; magnitude?: number; durationSec: number }): string {
    const injectionId = generateId();
    const now = this.state.elapsedSec;

    // Log the injection
    this.injectionLog.push({
      id: injectionId,
      type: 'fault',
      timestamp: Date.now(),
      details: { ...fault, simTimeSec: now },
    });

    // Emit fault_start via the normal processing path
    this.processSimEvent({
      type: 'fault_start',
      timeSec: now,
      data: {
        type: fault.type,
        sensorId: fault.sensorId,
        magnitude: fault.magnitude,
        startTime: now,
        endTime: now + fault.durationSec,
      },
    });

    // Schedule fault_end after durationSec (using real time scaled by speed)
    const intervalMs = (fault.durationSec * 1000) / this.state.speed;
    setTimeout(() => {
      if (!this.state.running) return;
      this.processSimEvent({
        type: 'fault_end',
        timeSec: this.state.elapsedSec,
        data: {
          type: fault.type,
          sensorId: fault.sensorId,
          magnitude: fault.magnitude,
          startTime: now,
          endTime: this.state.elapsedSec,
        },
      });
      this.broadcastRap(true);
    }, intervalMs);

    // Broadcast the updated state immediately (force: user-initiated injection)
    this.broadcastRap(true);

    return injectionId;
  }

  /**
   * Inject a pop-up target into the running scenario.
   * Creates a new target entry that will produce observations on subsequent ticks.
   * Returns the target ID.
   */
  injectTarget(target: { lat: number; lon: number; alt: number; speed: number; headingDeg: number; label?: string }): string {
    const targetId = `INJ-${generateId().slice(0, 8)}`;
    const now = this.state.elapsedSec;
    const label = target.label || `Popup-${targetId.slice(4)}`;

    // Log the injection
    this.injectionLog.push({
      id: targetId,
      type: 'target',
      timestamp: Date.now(),
      details: { ...target, targetId, simTimeSec: now },
    });

    // Compute an end position based on speed and heading over remaining scenario time
    const remainingSec = this.state.durationSec - now;
    const speedDegPerSec = target.speed / 111_000; // rough m/s to deg/s
    const headingRad = (target.headingDeg * Math.PI) / 180;
    const endLat = target.lat + speedDegPerSec * remainingSec * Math.cos(headingRad);
    const endLon = target.lon + speedDegPerSec * remainingSec * Math.sin(headingRad);

    // Add target definition to the scenario so the ScenarioRunner picks it up
    // Note: ScenarioRunner reads scenario.targets directly, so we mutate it
    (this.scenario as any).targets.push({
      targetId,
      name: label,
      description: `Injected pop-up target at T+${now}s`,
      startTime: now,
      waypoints: [
        { time: 0, position: { lat: target.lat, lon: target.lon, alt: target.alt } },
        { time: remainingSec, position: { lat: endLat, lon: endLon, alt: target.alt } },
      ],
    });

    this.pushEvent(
      'target.injected',
      `Pop-up target ${label} injected at (${target.lat.toFixed(3)}, ${target.lon.toFixed(3)})`,
      { targetId, lat: target.lat, lon: target.lon, alt: target.alt, speed: target.speed, headingDeg: target.headingDeg },
    );

    this.broadcastRap(true);

    return targetId;
  }

  /**
   * Inject an operator action into the running scenario.
   * Routes to existing operator controls (reserve/veto).
   */
  injectOperatorAction(action: { type: string; sensorId?: string; targetId?: string; durationSec?: number }): void {
    const injectionId = generateId();
    const now = this.state.elapsedSec;

    this.injectionLog.push({
      id: injectionId,
      type: 'operator_action',
      timestamp: Date.now(),
      details: { ...action, simTimeSec: now },
    });

    this.processSimEvent({
      type: 'operator_action',
      timeSec: now,
      data: {
        action: action.type,
        sensorId: action.sensorId,
        targetId: action.targetId,
        durationSec: action.durationSec,
      },
    });
  }

  /**
   * Load a custom ScenarioDefinition into the engine and reset to use it.
   */
  loadCustomScenario(def: ScenarioDefinition): void {
    // Use reset transition (handles idle, running, and paused states)
    const result = this.stateMachine.tryTransition('reset');
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Transition not allowed');
    }
    this.state.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scenario = def;
    this.resetInternalState();
    // Complete: resetting → idle
    this.stateMachine.tryTransition('reset');
    this.pushEvent('scenario.loaded', `Custom scenario "${def.name}" loaded`);
  }

  private resetInternalState(): void {
    this.autoInjectEnabled = false;
    if (this.autoInjectTimer) {
      clearTimeout(this.autoInjectTimer);
      this.autoInjectTimer = null;
    }
    this.runner = new ScenarioRunner(this.scenario);
    this.trackManager = new TrackManager({
      confirmAfter: 3,
      dropAfterMisses: 8,
      enableExistence: true,
      existencePromotionThreshold: 0.5,
      existenceConfirmationThreshold: 0.8,
      existenceDeletionThreshold: 0.1,
      coastingMissThreshold: 3,
      pDetection: 0.9,
      pFalseAlarm: 0.01,
      maxCoastingTimeSec: 15,
      associationMode: 'nn',
      enableIMM: true, // P5: Enable IMM for coordinated turn detection
      enableTBD: false,
    });
    this.trackManager.enableDualHypothesis = true;
    this.registrationService = new RegistrationHealthService();
    this.initializeSensorRegistration(); // P3: Initialize sensor registration health

    // Reset EO state
    this.eoTracksById.clear();
    this.unresolvedGroupsById.clear();
    this.activeCuesById.clear();
    this.cueToTrack.clear();
    this.investigationLog.clear();
    this.trackPositionHistory.clear();
    this.cachedBallisticEstimates = [];
    this.pendingBearings.clear();
    this.lastEoTaskingSec = 0;
    this.fusionModePerSensor.clear();
    this.eventEnvelopes = [];
    this.operatorLockedSensors.clear();
    this.operatorTrackPriority.clear();
    this.dwellState.clear();
    this.dwellDurationOverrides.clear();
    this.lastInvestigationTime.clear();
    this.cyclingHistory.clear();

    // Search mode reset
    this.searchModeState.clear();

    // Quality assessment reset
    this.firstDetectionTime.clear();
    this.confirmedGeometryTime.clear();
    this.sensorTaskedTicks.clear();
    this.sensorObservationTicks.clear();
    this.currentTickObservingSensors.clear();
    this.totalTicks = 0;
    this.cachedQualityMetrics = null;

    // REQ-9: Before/after EO comparison reset
    this.eoSnapshots.clear();
    this.fovOverlaps = [];
    this.bearingAssociations = [];
    this.multiSensorResolutions = [];

    // REQ-5 Phase C: Convergence state reset
    this.convergenceState.clear();

    // REQ-16: Reset EO management module
    this.eoModule.reset();
    this.cachedEoModuleStatus = null;

    // Reset Core EO Target Detector
    this.coreEoDetector.reset();

    // Reset 6DOF consistency evaluator
    this.trackManager.consistencyEvaluator.reset();

    this.state = this.buildInitialState();
  }

  addWsClient(client: WsClient, role?: 'instructor' | 'operator' | 'anonymous'): void {
    this.wsClients.add(client);
    this.wsClientInfos.set(client, {
      client,
      role: role ?? 'anonymous',
      connectedAt: Date.now(),
    });
    this.onUserConnected();
  }

  removeWsClient(client: WsClient): void {
    this.wsClients.delete(client);
    this.wsClientInfos.delete(client);
    this.onUserDisconnected();
  }

  getConnectedUsers(): ConnectedUsers {
    let instructors = 0;
    let operators = 0;
    for (const info of this.wsClientInfos.values()) {
      if (info.role === 'instructor') instructors++;
      else if (info.role === 'operator') operators++;
    }
    return {
      total: this.wsClientInfos.size,
      instructors,
      operators,
    };
  }

  getConnectedUsersList(): Array<{ id: string; role: string; connectedAt: number }> {
    const list: Array<{ id: string; role: string; connectedAt: number }> = [];
    let idx = 0;
    for (const info of this.wsClientInfos.values()) {
      list.push({
        id: `user-${idx++}`,
        role: info.role,
        connectedAt: info.connectedAt,
      });
    }
    return list;
  }

  // ── Auto-loop & idle shutdown ──────────────────────────────────────────

  private onUserConnected(): void {
    // Cancel any pending idle shutdown (e.g. during role switch reconnect)
    if (this.idleShutdownTimer) {
      clearTimeout(this.idleShutdownTimer);
      this.idleShutdownTimer = null;
    }
    // Broadcast updated user counts only — no auto-loop start on connect
    this.broadcastUserCount();
  }

  private idleShutdownTimer: ReturnType<typeof setTimeout> | null = null;

  private onUserDisconnected(): void {
    // Notify remaining clients about instructor availability change
    this.broadcastInstructorAvailability();
    const users = this.getConnectedUsers();
    if (users.total === 0) {
      // Grace period before idle shutdown — allows role switching without stopping sim
      this.idleShutdownTimer = setTimeout(() => {
        this.idleShutdownTimer = null;
        const current = this.getConnectedUsers();
        if (current.total === 0) {
          this.onAllUsersDisconnected();
        }
      }, 5000);
    }
  }

  /** Broadcast instructor slot availability to all connected clients */
  broadcastInstructorAvailability(): void {
    const users = this.getConnectedUsers();
    const msg = JSON.stringify({ type: 'instructor.availability', available: users.instructors === 0 });
    for (const client of this.wsClients) {
      try { client.send(msg); } catch { /* ignore */ }
    }
  }

  /** Broadcast updated user counts to all connected clients */
  private broadcastUserCount(): void {
    const users = this.getConnectedUsers();
    const msg = JSON.stringify({ type: 'user.count', ...users });
    for (const client of this.wsClients) {
      try { client.send(msg); } catch { /* ignore */ }
    }
  }

  startAutoLoop(): void {
    if (this.autoLoopEnabled) return;
    this.autoLoopEnabled = true;
    this.pushEvent('autoloop.started', 'Auto-loop scenario started (no instructor present)');

    // Reset to central-israel and start
    try {
      // Only reset if idle or completed
      if (!this.state.running) {
        this.reset('central-israel');
        this.start();
      }
    } catch {
      // State machine may reject — that's fine, try to start anyway
      try { this.start(); } catch { /* already running */ }
    }

  }

  stopAutoLoop(): void {
    if (!this.autoLoopEnabled) return;
    this.autoLoopEnabled = false;
    this.autoInjectEnabled = false;
    if (this.autoLoopTimer) {
      clearTimeout(this.autoLoopTimer);
      this.autoLoopTimer = null;
    }
    if (this.autoInjectTimer) {
      clearTimeout(this.autoInjectTimer);
      this.autoInjectTimer = null;
    }
    this.pushEvent('autoloop.stopped', 'Auto-loop stopped (instructor connected)');
  }

  enableAutoInject(): void {
    this.autoInjectEnabled = true;
    if (this.state.running) {
      this.scheduleAutoInject();
    }
    this.pushEvent('autoinject.enabled', 'Instructor enabled random target injection');
  }

  disableAutoInject(): void {
    this.autoInjectEnabled = false;
    if (this.autoInjectTimer) {
      clearTimeout(this.autoInjectTimer);
      this.autoInjectTimer = null;
    }
    this.pushEvent('autoinject.disabled', 'Instructor disabled random target injection');
  }

  isAutoInjectEnabled(): boolean {
    return this.autoInjectEnabled;
  }

  private scheduleAutoInject(): void {
    if (!this.autoInjectEnabled) return;
    // Random interval between 30-60 seconds real time
    const delaySec = 30 + Math.random() * 30;
    this.autoInjectTimer = setTimeout(() => {
      if (!this.autoInjectEnabled || !this.state.running) return;
      // Inject 1-2 random targets
      const count = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        try {
          // Generate random target within scenario area (Central Israel bounding box)
          const lat = 31.5 + Math.random() * 1.5; // ~31.5 to 33.0
          const lon = 34.5 + Math.random() * 1.0; // ~34.5 to 35.5
          const alt = 500 + Math.random() * 5000; // 500m to 5500m
          const speed = 100 + Math.random() * 200; // 100-300 m/s
          const headingDeg = Math.random() * 360;
          this.injectTarget({ lat, lon, alt, speed, headingDeg, label: `Auto-${Date.now().toString(36).slice(-4)}` });
        } catch {
          // Injection may fail if engine is in wrong state — ignore
        }
      }
      // Schedule next injection
      this.scheduleAutoInject();
    }, delaySec * 1000);
  }

  private onAllUsersDisconnected(): void {
    this.stopAutoLoop();
    // Stop simulation loop and clear state
    if (this.state.running) {
      try { this.pause(); } catch { /* ignore state machine errors */ }
    }
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.running = false;
    this.pushEvent('idle.shutdown', 'All users disconnected — engine idle');
  }

  // ── Simulation step ──────────────────────────────────────────────────

  private scheduleStep(): void {
    if (!this.state.running) return;
    // 1-second sim steps, scaled by speed
    const intervalMs = 1000 / this.state.speed;
    this.timer = setTimeout(() => {
      this.tick();
      this.scheduleStep();
    }, intervalMs);
  }

  private tick(): void {
    this.tickStartTime = Date.now();
    const dtSec = 1; // fixed 1-second simulation step
    const result = this.runner.step(dtSec);
    this.state.elapsedSec = result.currentTimeSec;

    const events = result.events;

    // Separate observation events for batch processing (prevents ghost tracks)
    // from other event types (bearings, faults) which are processed individually.
    const observationEvents: SimulationEvent[] = [];
    const otherEvents: SimulationEvent[] = [];
    for (const ev of events) {
      if (ev.type === 'observation') {
        observationEvents.push(ev);
      } else {
        otherEvents.push(ev);
      }
    }

    // Process observations as a batch through TrackManager (spatial clustering)
    this.currentTickObservations += observationEvents.length;
    this.processObservationBatch(observationEvents);

    // Process other events individually
    for (const simEvent of otherEvents) {
      this.processSimEvent(simEvent);
    }

    this.finalizeTick(result);
  }

  private finalizeTick(result: { currentTimeSec: number; activeFaults: Array<{ sensorId: string; type: string }>; isComplete: boolean }): void {
    // Update sensor online status based on active faults
    this.updateSensorStatus(result.activeFaults);

    // Mark stale tracks as missed. Tracks not updated in this tick increment
    // their miss counter; after 5 consecutive misses they get dropped.
    // This prevents ghost-track accumulation from the correlator creating
    // new tracks when fast-moving targets outrun the Mahalanobis gate.
    const now = Date.now();
    const activeTracks = this.trackManager.getAllTracks().filter(t => t.status !== 'dropped');
    for (const track of activeTracks) {
      // If this track wasn't updated in the last 3 seconds, count it as missed.
      // (lastUpdated is set by TrackManager.updateTrack / createTrack)
      const ageSec = (now - (track.lastUpdated as number)) / 1000;
      if (ageSec > 3) {
        try {
          this.trackManager.missedUpdate(track.systemTrackId);
        } catch (_) {
          // Track may have been dropped or merged already
        }
      }
    }

    // Post-tick merge sweep: merge tracks within 3km to eliminate ghost tracks
    this.trackManager.mergeCloseTracks();

    // Snapshot tracks from track manager
    this.state.tracks = this.trackManager.getAllTracks().filter(t => t.status !== 'dropped');

    // Core EO Target Detector: correlate staring sensor az/el detections,
    // triangulate when ≥2 sensors overlap → create 3D EO targets → promote to system tracks.
    // Single-sensor detections fall back to enhanced cueing against existing tracks.
    this.processCoreEoDetector();

    // Phase 5: Process accumulated bearings (slewing sensors) and run EO tasking
    this.processAccumulatedBearings();
    this.expireStaleEoCues();

    // Phase 6: Compute geometry estimates from EO bearings
    this.computeGeometryEstimates();

    // REQ-6: Multi-sensor 3D resolution (enhance with 3+ sensors)
    this.resolveMultiSensorTargets();

    // REQ-5 Phase C: Update convergence monitoring
    this.updateConvergenceState();

    if (result.currentTimeSec - this.lastEoTaskingSec >= EO_TASKING_INTERVAL_SEC) {
      this.runEoTaskingCycle();
      this.lastEoTaskingSec = result.currentTimeSec;
    }

    // Sync Phase 5 state to LiveState
    this.state.eoTracks = [...this.eoTracksById.values()];
    this.state.unresolvedGroups = [...this.unresolvedGroupsById.values()].filter(g => g.status === 'active');
    this.state.activeCues = [...this.activeCuesById.values()];

    // Search mode: scan sectors when no targets available
    this.updateSearchMode(1); // dtSec = 1 (fixed tick)

    // Continuous gimbal tracking: update EO sensor gimbal azimuth toward current target
    this.updateGimbalPointing();

    // Quality assessment: compute metrics comparing tracks vs ground truth
    this.computeQualityMetrics();

    // Decision chain log: build every 5 seconds
    if (Math.floor(result.currentTimeSec) % 5 === 0) {
      this.buildDecisionChains();
    }

    // EO allocation quality (REQ-10)
    this.computeEoAllocationQuality();

    // FOV overlap detection (REQ-6)
    this.computeFovOverlaps();

    // Multi-target bearing association (REQ-6)
    this.computeBearingAssociations();

    // REQ-16: Delegate to EO Management Module (facade over existing EO logic)
    this.eoModule.ingestTracks(this.state.tracks, this.state.sensors);
    this.eoModule.tick(result.currentTimeSec, 1);
    this.cachedEoModuleStatus = this.eoModule.getStatus();

    // REQ-12: Accumulate report timeline data
    accumulateSample(this);

    // Compute tick latency (tickStart set in tick())
    this.recordTickLatency();

    // Update system load metrics
    this.updateSystemLoad();

    // Update ballistic estimates
    this.updateBallisticEstimates();

    // Broadcast updated RAP to WebSocket clients
    this.broadcastRap();

    // Check completion
    if (result.isComplete) {
      this.pause();
      this.pushEvent('scenario.completed', `Scenario completed at T+${result.currentTimeSec}s`);
      // Auto-loop: restart scenario if enabled
      if (this.autoLoopEnabled) {
        this.autoLoopTimer = setTimeout(() => {
          if (!this.autoLoopEnabled) return;
          this.pushEvent('autoloop.restart', 'Auto-loop restarting scenario');
          try {
            this.reset('central-israel');
            this.start();
          } catch {
            // State machine rejection — ignore
          }
        }, 3000); // 3 second pause before restart
      }
    }
  }

  /**
   * Process all observation events from a tick as a batch.
   * Extracts SourceObservation from each event, runs cover-zone filtering,
   * then delegates to TrackManager.processObservationBatch() for spatial
   * clustering which prevents ghost tracks when multiple sensors report
   * the same target simultaneously.
   */
  private processObservationBatch(observationEvents: SimulationEvent[]): void {
    const observations: SourceObservation[] = [];
    const healthMap = new Map<string, RegistrationState>();

    for (const simEvent of observationEvents) {
      const raw = simEvent.data as any;
      const obs: SourceObservation = raw?.observation ?? raw;
      if (!obs || !obs.position) continue;

      // Apply cover-zone detection probability modifier
      const coverZones = this.scenario.coverZones ?? [];
      if (coverZones.length > 0) {
        const modifier = getDetectionModifier(obs.position.lat, obs.position.lon, coverZones);
        if (modifier < 1.0 && Math.random() > modifier) continue;
      }

      // Get registration health for this sensor
      const health = this.registrationService.getHealth(obs.sensorId);
      if (health) {
        healthMap.set(obs.sensorId as string, health);
      }

      // Select fusion mode
      const sensorType = this.state.sensors.find(s => s.sensorId === obs.sensorId)?.sensorType ?? 'radar';
      const fusionDecision = selectFusionMode(health ?? undefined, sensorType, 0.5);
      this.fusionModePerSensor.set(obs.sensorId as string, fusionDecision.mode);

      // Track that this sensor produced an observation this tick
      this.currentTickObservingSensors.add(obs.sensorId as string);

      observations.push(obs);
    }

    if (observations.length === 0) return;

    // Track observation count for system load metrics
    this.currentTickObservations += observations.length;

    // Batch process through TrackManager (clusters spatially, creates fewer tracks)
    const results = this.trackManager.processObservationBatch(observations, healthMap);

    // Emit events for each processed observation
    for (const tmResult of results) {
      this.eventEnvelopes.push(tmResult.event);
      this.eventEnvelopes.push(tmResult.correlationEvent);

      const decision = tmResult.correlationEvent.data.decision;
      const trackId = tmResult.track.systemTrackId;
      const sensorId = tmResult.correlationEvent.data.observationId;
      this.pushEvent(
        'source.observation.reported',
        `observation → ${decision === 'new_track' ? 'new' : 'update'} ${trackId}`,
        { trackId, decision },
      );
    }
  }

  private processSimEvent(simEvent: SimulationEvent): void {
    switch (simEvent.type) {
      case 'observation': {
        // RadarObservation wraps SourceObservation in .observation;
        // unwrap if needed so the fusion pipeline gets the right shape.
        const raw = simEvent.data as any;
        const obs: SourceObservation = raw?.observation ?? raw;
        if (!obs || !obs.position) break;

        // Apply cover-zone detection probability modifier
        const coverZones = this.scenario.coverZones ?? [];
        if (coverZones.length > 0) {
          const modifier = getDetectionModifier(obs.position.lat, obs.position.lon, coverZones);
          if (modifier < 1.0 && Math.random() > modifier) {
            // Target not detected due to terrain cover
            break;
          }
        }

        // Get registration health for this sensor
        const health = this.registrationService.getHealth(obs.sensorId);

        // Phase 7: Select fusion mode based on registration health
        const sensorType = this.state.sensors.find(s => s.sensorId === obs.sensorId)?.sensorType ?? 'radar';
        const fusionDecision = selectFusionMode(health ?? undefined, sensorType, 0.5);
        this.fusionModePerSensor.set(obs.sensorId as string, fusionDecision.mode);

        // Track observation count for system load metrics
        this.currentTickObservations++;

        // Process through track manager (correlate + fuse)
        const tmResult = this.trackManager.processObservation(obs, health ?? undefined);

        // Collect formal event envelopes for validation
        this.eventEnvelopes.push(tmResult.event);
        this.eventEnvelopes.push(tmResult.correlationEvent);

        // Push event to log
        const decision = tmResult.correlationEvent.data.decision;
        const trackId = tmResult.track.systemTrackId;
        this.pushEvent(
          'source.observation.reported',
          `${obs.sensorId} → ${decision === 'new_track' ? 'new' : 'update'} ${trackId}`,
          { sensorId: obs.sensorId, trackId, decision },
        );
        break;
      }

      case 'bearing': {
        // Phase 5: EO bearing/az-el detection processing
        const bearingObs = simEvent.data as EoBearingObservation;
        if (!bearingObs?.bearing) break;

        const sensorId = bearingObs.sensorId;
        const sensor = this.state.sensors.find(s => (s.sensorId as string) === sensorId);
        const isStaring = sensor?.gimbal?.slewRateDegPerSec === 0;

        if (isStaring && sensor) {
          // ── Staring sensor: route through Core EO Target Detector ──
          // Each staring sensor independently manages az/el detections.
          // Cross-sensor correlation and triangulation happens in finalizeTick.
          this.coreEoDetector.ingestBearing(bearingObs, sensor.position);

          this.pushEvent(
            'eo.detection.ingested',
            `${sensorId} az/el detection az=${bearingObs.bearing.azimuthDeg.toFixed(1)}° el=${bearingObs.bearing.elevationDeg.toFixed(1)}° → core detector`,
            { sensorId, targetId: bearingObs.targetId, timeSec: simEvent.timeSec },
          );
        } else {
          // ── Slewing sensor: existing cue-based pipeline ──
          let matchedCueId = this.matchBearingToCue(bearingObs);

          if (matchedCueId) {
            if (!this.pendingBearings.has(matchedCueId)) {
              this.pendingBearings.set(matchedCueId, []);
            }
            this.pendingBearings.get(matchedCueId)!.push(bearingObs);
          }

          this.pushEvent(
            'eo.bearing.measured',
            `${sensorId} bearing az=${bearingObs.bearing.azimuthDeg.toFixed(1)}° → ${matchedCueId ? `cue ${matchedCueId.slice(0, 8)}` : 'unmatched'}`,
            { sensorId, targetId: bearingObs.targetId, cueId: matchedCueId ?? undefined, timeSec: simEvent.timeSec },
          );
        }
        break;
      }

      case 'fault_start': {
        const fault = simEvent.data as Record<string, unknown>;
        const sensorId = (fault?.sensorId ?? '') as string;
        const faultType = (fault?.type ?? '') as string;

        // Update sensor status
        const sensor = this.state.sensors.find(s => s.sensorId === sensorId);
        if (sensor && faultType === 'sensor_outage') {
          sensor.online = false;
        }

        // For bias faults, update registration health
        if (faultType === 'azimuth_bias') {
          const prevHealth = this.registrationService.getHealth(sensorId as SensorId);
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: (fault?.magnitude as number) ?? 2,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
          const newHealth = this.registrationService.getHealth(sensorId as SensorId);
          if (newHealth) {
            this.eventEnvelopes.push({
              ...createEventEnvelope('registration.state.updated', 'live-engine'),
              eventType: 'registration.state.updated',
              data: {
                sensorId: sensorId as SensorId,
                previousState: prevHealth ?? undefined,
                newState: newHealth,
                estimationMethod: 'fault_injection',
                confidence: 1.0,
              },
            } as any);
          }
        }

        this.pushEvent(
          'fault.started',
          `Fault: ${faultType} on ${sensorId}`,
          { sensorId, faultType },
        );
        break;
      }

      case 'fault_end': {
        const fault = simEvent.data as Record<string, unknown>;
        const sensorId = (fault?.sensorId ?? '') as string;
        const faultType = (fault?.type ?? '') as string;

        if (faultType === 'sensor_outage') {
          const sensor = this.state.sensors.find(s => s.sensorId === sensorId);
          if (sensor) sensor.online = true;
        }

        if (faultType === 'azimuth_bias') {
          const prevHealth = this.registrationService.getHealth(sensorId as SensorId);
          this.registrationService.updateBias(sensorId as SensorId, {
            azimuthBiasDeg: 0,
            elevationBiasDeg: 0,
            rangeBiasM: 0,
          });
          this.state.registrationStates = this.getAllRegistrationStates();
          const newHealth = this.registrationService.getHealth(sensorId as SensorId);
          if (newHealth) {
            this.eventEnvelopes.push({
              ...createEventEnvelope('registration.state.updated', 'live-engine'),
              eventType: 'registration.state.updated',
              data: {
                sensorId: sensorId as SensorId,
                previousState: prevHealth ?? undefined,
                newState: newHealth,
                estimationMethod: 'fault_cleared',
                confidence: 1.0,
              },
            } as any);
          }
        }

        this.pushEvent(
          'fault.ended',
          `Fault cleared: ${faultType} on ${sensorId}`,
          { sensorId, faultType },
        );
        break;
      }

      case 'operator_action': {
        const action = simEvent.data as Record<string, unknown>;
        const actionType = (action?.action ?? '') as string;
        this.pushEvent(
          'operator.action',
          `Operator: ${actionType}`,
          action,
        );
        break;
      }
    }
  }

  // ── Phase 5: EO Bearing Processing ────────────────────────────────────

  /**
   * Match an incoming bearing observation to an active EO cue.
   * Returns the cueId if matched, or null.
   */
  private matchBearingToCue(bearingObs: EoBearingObservation): string | null {
    const now = Date.now() as Timestamp;
    for (const [cueId, cue] of this.activeCuesById) {
      if (cue.systemTrackId && bearingObs.sensorId) {
        // Match by sensor: the cue was assigned to a specific sensor via a task
        const task = this.state.tasks.find(
          t => t.cueId === cueId && t.sensorId === bearingObs.sensorId && t.status === 'executing',
        );
        if (task && isCueValid(cue, now)) {
          return cueId;
        }
      }
    }

    // Fallback: match to any valid cue for this sensor
    for (const [cueId, cue] of this.activeCuesById) {
      if (isCueValid(cue, now)) {
        const task = this.state.tasks.find(t => t.cueId === cueId && t.sensorId === bearingObs.sensorId);
        if (task) return cueId;
      }
    }

    return null;
  }

  /**
   * For staring sensors: auto-create a cue + task when a bearing has no
   * matching cue. This allows staring sensors to process ALL targets in
   * their FOV simultaneously without waiting for the tasking engine.
   */
  private autoCreateCueForBearing(bearingObs: EoBearingObservation, sensor: SensorState): string | null {
    // Find nearest system track by comparing bearing azimuth to sensor→track azimuth
    const bearingAz = bearingObs.bearing.azimuthDeg;
    let bestTrack: SystemTrack | undefined;
    let bestAngularDiff = Infinity;
    for (const track of this.state.tracks) {
      if (track.status === 'dropped') continue;
      const trackAz = bearingDeg(
        sensor.position.lat, sensor.position.lon,
        track.state.lat, track.state.lon,
      );
      let diff = Math.abs(bearingAz - trackAz);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestAngularDiff) {
        bestAngularDiff = diff;
        bestTrack = track;
      }
    }

    // Only auto-cue if angular match is close enough (within 5°)
    if (!bestTrack || bestAngularDiff > 5) return null;

    const trackId = bestTrack.systemTrackId as string;

    // Check if there's already a cue for this track on this sensor
    for (const [cueId, _cue] of this.activeCuesById) {
      if (this.cueToTrack.get(cueId) === trackId) {
        const task = this.state.tasks.find(
          t => t.cueId === cueId && t.sensorId === (sensor.sensorId as string),
        );
        if (task) return cueId;
      }
    }

    // Auto-issue cue
    const health = this.registrationService.getHealth(sensor.sensorId);
    const qualityLevel = health?.spatialQuality ?? 'good';
    const cue = issueCue(bestTrack, sensor, qualityLevel);
    this.activeCuesById.set(cue.cueId, cue);
    this.cueToTrack.set(cue.cueId, trackId);

    // Create a virtual task for this cue
    this.state.tasks.push({
      taskId: generateId(),
      cueId: cue.cueId,
      sensorId: sensor.sensorId as string,
      targetTrackId: trackId,
      status: 'executing',
      priority: 5,
      assignedAt: Date.now(),
    } as any);

    return cue.cueId;
  }

  /**
   * Process all accumulated bearing observations from this tick.
   * For each cue with bearings: create EO tracks, assess ambiguity,
   * trigger split/merge if needed, and generate EO reports.
   */
  private processAccumulatedBearings(): void {
    for (const [cueId, bearings] of this.pendingBearings) {
      const cue = this.activeCuesById.get(cueId);
      if (!cue) continue;

      const systemTrackId = this.cueToTrack.get(cueId);

      // Update existing or create EO tracks from bearings (deduplicate by sensor+cue)
      const newEoTracks: EoTrack[] = [];
      for (const bearingObs of bearings) {
        // Check if there's already an EoTrack from this sensor for this cue
        const existingTrack = [...this.eoTracksById.values()].find(
          t => t.parentCueId === cueId && (t.sensorId as string) === bearingObs.sensorId,
        );
        if (existingTrack) {
          // Update existing track with new bearing instead of proliferating
          existingTrack.bearing = bearingObs.bearing;
          existingTrack.imageQuality = bearingObs.imageQuality;
          existingTrack.lastUpdated = Date.now() as Timestamp;
          existingTrack.confidence = Math.min(1, existingTrack.confidence + 0.1);
          newEoTracks.push(existingTrack);

          this.pushEvent(
            'eo.track.updated',
            `EO track ${(existingTrack.eoTrackId as string).slice(0, 8)} updated from ${bearingObs.sensorId} az=${bearingObs.bearing.azimuthDeg.toFixed(1)}°`,
            { eoTrackId: existingTrack.eoTrackId, sensorId: bearingObs.sensorId, cueId },
          );
        } else {
          const eoTrack = this.createEoTrack(bearingObs, cueId as CueId);
          newEoTracks.push(eoTrack);
        }
      }

      if (newEoTracks.length === 0) continue;

      // Collect all EO tracks for this cue (deduplicated)
      const cueEoTracks = [
        ...newEoTracks,
        ...[...this.eoTracksById.values()].filter(
          t => t.parentCueId === cueId && !newEoTracks.some(n => n.eoTrackId === t.eoTrackId),
        ),
      ];

      // Assess ambiguity
      const assessment = assessAmbiguity(cueEoTracks, cueId as CueId);

      switch (assessment.type) {
        case 'clear': {
          // Single target confirmed — generate EO report
          const eoTrack = cueEoTracks[0];
          if (eoTrack && systemTrackId) {
            // Look up true classification from scenario ground truth
            const trueClassification = this.getTargetClassificationForTrack(systemTrackId);
            const idResult = assessIdentification(
              eoTrack.bearing,
              eoTrack.imageQuality,
              undefined,
              trueClassification,
            );
            eoTrack.identificationSupport = idResult;
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: eoTrack.sensorId,
              outcome: 'confirmed',
              bearing: eoTrack.bearing,
              imageQuality: eoTrack.imageQuality,
              targetCountEstimate: 1,
              identificationSupport: idResult,
              timestamp: Date.now() as Timestamp,
            });

            // Apply report to system track
            handleEoReport(report, this.trackManager, systemTrackId);

            // Propagate EO classification to system track
            if (idResult.type && idResult.type !== 'unidentified') {
              const trackObj = this.state.tracks.find(
                t => (t.systemTrackId as string) === systemTrackId,
              );
              if (trackObj) {
                // Only update if EO confidence is higher than existing, or no existing classification
                if (
                  !trackObj.classification ||
                  trackObj.classification === 'unknown' ||
                  (trackObj.classificationConfidence ?? 0) < idResult.confidence
                ) {
                  trackObj.classification = idResult.type as TargetClassification;
                  trackObj.classificationSource = 'eo_identification';
                  trackObj.classificationConfidence = idResult.confidence;

                  this.pushEvent(
                    'track.classified',
                    `Track ${systemTrackId.slice(0, 8)} classified as ${idResult.type} (${(idResult.confidence * 100).toFixed(0)}% confidence) via EO`,
                    {
                      systemTrackId,
                      classification: idResult.type,
                      confidence: idResult.confidence,
                      source: 'eo_identification',
                    },
                  );
                }
              }
            }

            this.pushEvent(
              'eo.report.received',
              `EO confirmed track ${systemTrackId.slice(0, 8)} via ${eoTrack.sensorId}`,
              { cueId, systemTrackId, outcome: 'confirmed', sensorId: eoTrack.sensorId },
            );
          }
          break;
        }

        case 'crowded': {
          // Multiple confirmed targets — report split_detected
          if (systemTrackId) {
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: cueEoTracks[0].sensorId,
              outcome: 'split_detected',
              targetCountEstimate: cueEoTracks.length,
              timestamp: Date.now() as Timestamp,
            });

            handleEoReport(report, this.trackManager, systemTrackId);

            // Create unresolved group
            const mergeResult = mergeIntoGroup(
              cueEoTracks,
              `Multiple targets (${cueEoTracks.length}) detected in cue response`,
              cueId as CueId,
            );

            // Store group
            this.unresolvedGroupsById.set(mergeResult.mergedGroup.groupId, mergeResult.mergedGroup);
            for (const t of mergeResult.mergedTracks) {
              this.eoTracksById.set(t.eoTrackId, t);
            }

            // Emit formal event for validation
            this.eventEnvelopes.push({
              ...createEventEnvelope('eo.group.created', 'live-engine', 'eo-investigation'),
              eventType: 'eo.group.created',
              data: { group: mergeResult.mergedGroup },
            } as any);

            this.pushEvent(
              'eo.group.created',
              `Unresolved group ${mergeResult.mergedGroup.groupId.slice(0, 8)} — ${cueEoTracks.length} targets for track ${systemTrackId.slice(0, 8)}`,
              {
                groupId: mergeResult.mergedGroup.groupId,
                eoTrackCount: cueEoTracks.length,
                systemTrackId,
              },
            );
          }
          break;
        }

        case 'unresolved': {
          // Ambiguous — create unresolved group
          if (systemTrackId) {
            const report = createEoReport({
              cueId: cueId as CueId,
              sensorId: cueEoTracks[0].sensorId,
              outcome: 'split_detected',
              targetCountEstimate: cueEoTracks.length,
              timestamp: Date.now() as Timestamp,
            });

            handleEoReport(report, this.trackManager, systemTrackId);

            const mergeResult = mergeIntoGroup(
              cueEoTracks,
              `Ambiguous detection (${cueEoTracks.length} tracks, mixed confidence)`,
              cueId as CueId,
            );

            this.unresolvedGroupsById.set(mergeResult.mergedGroup.groupId, mergeResult.mergedGroup);
            for (const t of mergeResult.mergedTracks) {
              this.eoTracksById.set(t.eoTrackId, t);
            }

            // Emit formal event for validation
            this.eventEnvelopes.push({
              ...createEventEnvelope('eo.group.created', 'live-engine', 'eo-investigation'),
              eventType: 'eo.group.created',
              data: { group: mergeResult.mergedGroup },
            } as any);

            this.pushEvent(
              'eo.group.created',
              `Unresolved group ${mergeResult.mergedGroup.groupId.slice(0, 8)} — ambiguous ${cueEoTracks.length} tracks`,
              {
                groupId: mergeResult.mergedGroup.groupId,
                eoTrackCount: cueEoTracks.length,
                systemTrackId,
              },
            );
          }
          break;
        }
      }
    }

    // Clear pending bearings for this tick
    this.pendingBearings.clear();
  }

  /**
   * Create an EoTrack from a bearing observation.
   */
  private createEoTrack(bearingObs: EoBearingObservation, cueId: CueId): EoTrack {
    const eoTrackId = generateId() as EoTrackId;
    const now = Date.now() as Timestamp;

    const eoTrack: EoTrack = {
      eoTrackId,
      parentCueId: cueId,
      sensorId: bearingObs.sensorId as SensorId,
      bearing: bearingObs.bearing,
      imageQuality: bearingObs.imageQuality,
      identificationSupport: undefined,
      status: 'tentative',
      lineage: [
        createLineageEntry('eo.track.created', `From bearing az=${bearingObs.bearing.azimuthDeg.toFixed(1)}°`),
      ],
      associatedSystemTrackId: (this.cueToTrack.get(cueId) ?? undefined) as SystemTrackId | undefined,
      confidence: 0.5,
      lastUpdated: now,
    };

    this.eoTracksById.set(eoTrackId, eoTrack);

    this.pushEvent(
      'eo.track.created',
      `EO track ${eoTrackId.slice(0, 8)} from ${bearingObs.sensorId} az=${bearingObs.bearing.azimuthDeg.toFixed(1)}°`,
      { eoTrackId, sensorId: bearingObs.sensorId, cueId },
    );

    return eoTrack;
  }

  // ── EO Target Cycling ────────────────────────────────────────────────

  /**
   * Determine the next target for a sensor that just completed its dwell.
   * Uses the same scoring logic but only for this specific sensor.
   * Skips the track it just investigated (avoid ping-pong) unless it's the only option or overdue for revisit.
   * Returns true if a new target was assigned, false otherwise.
   */
  private cycleToNextTarget(sensorId: string, previousTrackId: string): boolean {
    const tracks = this.state.tracks;
    const sensors = this.state.sensors;
    const nowSec = this.state.elapsedSec;

    const sensor = sensors.find(s => (s.sensorId as string) === sensorId);
    if (!sensor || !sensor.online) return false;

    // 1. Generate candidates for just this sensor
    const candidates = generateCandidates(tracks, [sensor]);
    if (candidates.length === 0) return false;

    // 2. Score them (same as runEoTaskingCycle)
    const groupBoostedTrackIds = new Set<string>(this.operatorPriorityTracks);
    for (const group of this.unresolvedGroupsById.values()) {
      if (group.status !== 'active') continue;
      const systemTrackId = this.cueToTrack.get(group.parentCueId);
      if (systemTrackId) groupBoostedTrackIds.add(systemTrackId);
    }

    const sensorOccupancy = new Map<string, number>();
    for (const task of this.state.tasks) {
      if (task.status === 'executing') {
        sensorOccupancy.set(task.sensorId as string, (sensorOccupancy.get(task.sensorId as string) ?? 0) + 1);
      }
    }

    // Get cycling history for anti-ping-pong penalties
    const history = this.cyclingHistory.get(sensorId) ?? [];
    const recentTargets = history.slice(-3).reverse(); // most recent first

    const scoredCandidates = candidates.map(candidate => {
      const trackId = candidate.systemTrack.systemTrackId as string;
      const lastInvTime = this.lastInvestigationTime.get(trackId);
      let timeSinceLastObs = 0;
      if (lastInvTime !== undefined) {
        timeSinceLastObs = nowSec - lastInvTime;
      } else {
        timeSinceLastObs = LiveEngine.MAX_REVISIT_INTERVAL_SEC;
      }

      const score = scoreCandidate(
        candidate,
        this.currentParameters.weights as ScoringWeights,
        groupBoostedTrackIds,
        sensorOccupancy,
        undefined,
        timeSinceLastObs,
      );

      // Apply operator track priority overrides
      const trackPriority = this.operatorTrackPriority.get(trackId);
      if (trackPriority === 'high') score.total += 5;
      else if (trackPriority === 'low') score.total -= 3;

      // 3. Anti-ping-pong: penalize recently-visited targets
      const isOverdue = timeSinceLastObs > LiveEngine.MAX_REVISIT_INTERVAL_SEC;
      if (!isOverdue) {
        const penalties = [-3, -1.5, -0.5]; // most recent, second, third
        for (let i = 0; i < recentTargets.length && i < penalties.length; i++) {
          if (recentTargets[i].trackId === trackId) {
            score.total += penalties[i];
          }
        }

        // Also penalize the previous track (the one just completed)
        if (trackId === previousTrackId) {
          // Only apply if not already penalized via history (avoid double penalty)
          const alreadyPenalized = recentTargets.some(r => r.trackId === previousTrackId);
          if (!alreadyPenalized) {
            score.total -= 3;
          }
        }
      }

      return { candidate, score };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score.total - a.score.total);

    // 4. Pick the highest-scoring candidate
    const best = scoredCandidates[0];
    if (!best || best.score.total <= 0) return false;

    const track = tracks.find(t => t.systemTrackId === best.candidate.systemTrackId);
    if (!track) return false;

    // Skip if track already has a pending/active cue
    const hasActiveCue = [...this.cueToTrack.entries()].some(
      ([cueId, trackId]) => trackId === (best.candidate.systemTrackId as string) && this.activeCuesById.has(cueId),
    );
    if (hasActiveCue) return false;

    // 5. Issue a new cue and create a task
    const health = this.registrationService.getHealth(sensor.sensorId);
    const qualityLevel = health?.spatialQuality ?? 'good';
    const cue = issueCue(track, sensor, qualityLevel);

    this.activeCuesById.set(cue.cueId, cue);
    this.cueToTrack.set(cue.cueId, track.systemTrackId as string);

    // REQ-9: Capture pre-EO snapshot when cue is issued
    this.capturePreEoSnapshot(track.systemTrackId as string);

    this.trackManager.setEoInvestigationStatus(track.systemTrackId, 'in_progress');

    // 6. Start a new dwell
    const dwellDuration = this.dwellDurationOverrides.get(sensorId)
      ?? LiveEngine.DEFAULT_DWELL_SEC;
    this.dwellState.set(sensorId, {
      sensorId,
      targetTrackId: track.systemTrackId as string,
      dwellStartSec: nowSec,
      dwellDurationSec: dwellDuration,
    });

    this.lastInvestigationTime.set(track.systemTrackId as string, nowSec);

    // Create task record
    const taskId = generateId() as TaskId;
    const task: Task = {
      taskId,
      cueId: cue.cueId,
      sensorId: sensor.sensorId,
      systemTrackId: best.candidate.systemTrackId,
      status: 'executing',
      scoreBreakdown: best.score,
      policyMode: this.currentParameters.policyMode,
      operatorOverride: undefined,
      createdAt: Date.now() as Timestamp,
      completedAt: undefined,
    };
    this.state.tasks.push(task);

    // Update sensor gimbal pointing
    if (sensor.gimbal) {
      sensor.gimbal.azimuthDeg = bearingDeg(
        sensor.position.lat, sensor.position.lon,
        track.state.lat, track.state.lon,
      );
      sensor.gimbal.currentTargetId = track.systemTrackId;
    }

    // Emit formal TaskDecided event for validation
    this.eventEnvelopes.push({
      ...createEventEnvelope('task.decided', 'live-engine', 'eo-tasking'),
      eventType: 'task.decided',
      data: {
        taskId,
        sensorId: sensor.sensorId,
        systemTrackId: best.candidate.systemTrackId,
        scoreBreakdown: best.score,
        mode: this.currentParameters.policyMode,
        operatorOverride: undefined,
      },
    } as any);

    // 7. Log event: eo.cycling.next_target
    this.pushEvent(
      'eo.cycling.next_target',
      `Cycling: ${sensorId} → track ${(track.systemTrackId as string).slice(0, 8)} (from ${previousTrackId.slice(0, 8)}, score ${best.score.total.toFixed(1)})`,
      {
        sensorId,
        previousTrackId,
        nextTrackId: track.systemTrackId,
        score: best.score.total,
        cueId: cue.cueId,
      },
    );

    return true;
  }

  // ── Phase 5: EO Tasking Cycle ─────────────────────────────────────────

  /**
   * Run a full EO tasking cycle:
   * 1. Generate candidates (track × sensor pairs)
   * 2. Score each candidate (including group-aware boosting)
   * 3. Apply policy (auto_with_veto)
   * 4. Assign tasks (greedy, one per sensor)
   * 5. Issue cues for assigned tasks
   */
  private runEoTaskingCycle(): void {
    const tracks = this.state.tracks;
    const sensors = this.state.sensors;
    const nowSec = this.state.elapsedSec;

    // ── Dwell management: check which sensors have completed their dwell ──
    const sensorsStillDwelling = new Set<string>();
    for (const [sensorId, dwell] of this.dwellState) {
      const elapsed = nowSec - dwell.dwellStartSec;
      if (elapsed >= dwell.dwellDurationSec) {
        // Dwell completed — free this sensor for reassignment
        this.dwellState.delete(sensorId);

        // REQ-9: Capture post-EO snapshot when dwell completes
        this.capturePostEoSnapshot(dwell.targetTrackId);

        // Record completed dwell in cycling history
        if (!this.cyclingHistory.has(sensorId)) {
          this.cyclingHistory.set(sensorId, []);
        }
        const history = this.cyclingHistory.get(sensorId)!;
        history.push({
          trackId: dwell.targetTrackId,
          startedSec: dwell.dwellStartSec,
          endedSec: nowSec,
        });
        // Keep last 20 entries per sensor
        if (history.length > 20) {
          this.cyclingHistory.set(sensorId, history.slice(-20));
        }

        this.pushEvent(
          'eo.dwell.completed',
          `Dwell completed: ${sensorId} on track ${dwell.targetTrackId.slice(0, 8)} after ${dwell.dwellDurationSec}s`,
          { sensorId, targetTrackId: dwell.targetTrackId, dwellDurationSec: dwell.dwellDurationSec },
        );

        // Immediately cycle to next target
        const cycled = this.cycleToNextTarget(sensorId, dwell.targetTrackId);
        if (cycled) {
          // Sensor is now dwelling on a new target — mark as still dwelling
          sensorsStillDwelling.add(sensorId);
        }
        // If no target found, leave sensor free for normal assignment below
      } else {
        // Still dwelling — don't reassign this sensor
        sensorsStillDwelling.add(sensorId);
      }
    }

    // ── Update lastInvestigationTime for tracks with active EO investigations ──
    for (const task of this.state.tasks) {
      if (task.status === 'executing') {
        this.lastInvestigationTime.set(task.systemTrackId as string, nowSec);
      }
    }

    // 1. Generate candidates — exclude operator-locked sensors and sensors still dwelling
    const availableSensors = sensors.filter(s =>
      !this.operatorLockedSensors.has(s.sensorId as string) &&
      !sensorsStillDwelling.has(s.sensorId as string),
    );
    const candidates = generateCandidates(tracks, availableSensors);
    if (candidates.length === 0) return;

    // 2. Score each candidate
    // Tracks with unresolved groups get a boost via operator-interest set
    const groupBoostedTrackIds = new Set<string>(this.operatorPriorityTracks);
    for (const group of this.unresolvedGroupsById.values()) {
      if (group.status !== 'active') continue;
      const systemTrackId = this.cueToTrack.get(group.parentCueId);
      if (systemTrackId) groupBoostedTrackIds.add(systemTrackId);
    }

    // Compute sensor occupancy from active tasks
    const sensorOccupancy = new Map<string, number>();
    for (const task of this.state.tasks) {
      if (task.status === 'executing') {
        sensorOccupancy.set(task.sensorId as string, (sensorOccupancy.get(task.sensorId as string) ?? 0) + 1);
      }
    }

    // Track which tracks have already had revisit events logged this cycle
    const revisitTriggeredTracks = new Set<string>();

    const scoredDecisions = candidates.map(candidate => {
      // Compute revisit boost: time since last investigation for this track
      const trackId = candidate.systemTrack.systemTrackId as string;
      const lastInvTime = this.lastInvestigationTime.get(trackId);
      let timeSinceLastObs = 0;
      if (lastInvTime !== undefined) {
        timeSinceLastObs = nowSec - lastInvTime;
      } else {
        // Never investigated — treat as maximally overdue for revisit
        timeSinceLastObs = LiveEngine.MAX_REVISIT_INTERVAL_SEC;
      }

      // If overdue for revisit, log a revisit trigger event (once per track per cycle)
      if (timeSinceLastObs > LiveEngine.MAX_REVISIT_INTERVAL_SEC && !revisitTriggeredTracks.has(trackId)) {
        revisitTriggeredTracks.add(trackId);
        this.pushEvent(
          'eo.revisit.triggered',
          `Revisit overdue for track ${trackId.slice(0, 8)} (${timeSinceLastObs.toFixed(0)}s since last investigation)`,
          { trackId, timeSinceLastObs },
        );
      }

      const score = scoreCandidate(
        candidate,
        this.currentParameters.weights as ScoringWeights,
        groupBoostedTrackIds,
        sensorOccupancy,
        undefined, // activeBearings
        timeSinceLastObs,
      );
      // Apply operator track priority overrides
      const trackPriority = this.operatorTrackPriority.get(candidate.systemTrackId as string);
      if (trackPriority === 'high') score.total += 5;
      else if (trackPriority === 'low') score.total -= 3;

      // REQ-5 Phase C: Reduce score for converged tracks to reallocate sensors
      const convergenceEntry = this.convergenceState.get(trackId);
      if (convergenceEntry?.converged) {
        score.total *= 0.3;
      }

      return { candidate, score };
    });

    // 3. Apply policy
    const decisions = applyPolicy(
      scoredDecisions.map(sd => ({
        candidate: sd.candidate,
        score: sd.score,
        approved: true,
        reason: 'auto',
      })),
      this.currentParameters.policyMode,
      [],
    );

    // 4. Assign tasks
    const assignments = assignTasks(decisions, this.currentParameters.policyMode);

    // 5. Issue cues and create tasks for each assignment
    for (const assignment of assignments) {
      const track = tracks.find(t => t.systemTrackId === assignment.systemTrackId);
      const sensor = sensors.find(s => s.sensorId === assignment.sensorId);
      if (!track || !sensor) continue;

      // Skip if track already has a pending/active cue
      const hasActiveCue = [...this.cueToTrack.entries()].some(
        ([cueId, trackId]) => trackId === assignment.systemTrackId && this.activeCuesById.has(cueId),
      );
      if (hasActiveCue) continue;

      // Get registration health for sensor
      const health = this.registrationService.getHealth(sensor.sensorId);
      const qualityLevel = health?.spatialQuality ?? 'good';

      // Issue cue
      const cue = issueCue(track, sensor, qualityLevel);

      // Store cue
      this.activeCuesById.set(cue.cueId, cue);
      this.cueToTrack.set(cue.cueId, track.systemTrackId as string);

      // REQ-9: Capture pre-EO snapshot when cue is issued
      this.capturePreEoSnapshot(track.systemTrackId as string);

      // Mark track as under EO investigation
      this.trackManager.setEoInvestigationStatus(track.systemTrackId, 'in_progress');

      // Record dwell start for this sensor
      const dwellDuration = this.dwellDurationOverrides.get(assignment.sensorId as string)
        ?? LiveEngine.DEFAULT_DWELL_SEC;
      this.dwellState.set(assignment.sensorId as string, {
        sensorId: assignment.sensorId as string,
        targetTrackId: track.systemTrackId as string,
        dwellStartSec: nowSec,
        dwellDurationSec: dwellDuration,
      });

      // Record investigation time for revisit tracking
      this.lastInvestigationTime.set(track.systemTrackId as string, nowSec);

      // Create task record
      const task: Task = {
        taskId: assignment.taskId,
        cueId: cue.cueId,
        sensorId: assignment.sensorId,
        systemTrackId: assignment.systemTrackId,
        status: 'executing',
        scoreBreakdown: assignment.scoreBreakdown,
        policyMode: this.currentParameters.policyMode,
        operatorOverride: undefined,
        createdAt: Date.now() as Timestamp,
        completedAt: undefined,
      };
      this.state.tasks.push(task);

      // Update sensor gimbal pointing
      if (sensor.gimbal) {
        sensor.gimbal.azimuthDeg = bearingDeg(
          sensor.position.lat, sensor.position.lon,
          track.state.lat, track.state.lon,
        );
        sensor.gimbal.currentTargetId = track.systemTrackId;
      }

      // Emit formal TaskDecided event for validation
      this.eventEnvelopes.push({
        ...createEventEnvelope('task.decided', 'live-engine', 'eo-tasking'),
        eventType: 'task.decided',
        data: {
          taskId: assignment.taskId,
          sensorId: assignment.sensorId,
          systemTrackId: assignment.systemTrackId,
          scoreBreakdown: assignment.scoreBreakdown,
          mode: this.currentParameters.policyMode,
          operatorOverride: undefined,
        },
      } as any);

      this.pushEvent(
        'eo.cue.issued',
        `Cue ${cue.cueId.slice(0, 8)} → ${sensor.sensorId} for track ${track.systemTrackId.slice(0, 8)} (priority ${cue.priority})`,
        {
          cueId: cue.cueId,
          sensorId: sensor.sensorId,
          systemTrackId: track.systemTrackId,
          priority: cue.priority,
          uncertaintyGateDeg: cue.uncertaintyGateDeg,
        },
      );
    }

    // Keep task list manageable — remove completed tasks older than 60s
    const cutoff = Date.now() - 60_000;
    this.state.tasks = this.state.tasks.filter(
      t => t.status === 'executing' || t.status === 'proposed' || (t.completedAt ?? Date.now()) > cutoff,
    );
  }

  /**
   * Remove expired cues and mark their tasks as completed or expired.
   */
  private expireStaleEoCues(): void {
    const now = Date.now() as Timestamp;
    for (const [cueId, cue] of this.activeCuesById) {
      if (!isCueValid(cue, now)) {
        this.activeCuesById.delete(cueId);

        // Find and complete the associated task
        const task = this.state.tasks.find(t => t.cueId === cueId && t.status === 'executing');
        if (task) {
          task.status = 'completed';
          task.completedAt = now;
        }

        // If the track's investigation is still in_progress, mark as no_support
        const systemTrackId = this.cueToTrack.get(cueId);
        if (systemTrackId) {
          const track = this.trackManager.getTrack(systemTrackId as SystemTrackId);
          if (track && track.eoInvestigationStatus === 'in_progress') {
            // Only mark no_support if no bearings were received for this cue
            const hasEoTracks = [...this.eoTracksById.values()].some(t => t.parentCueId === cueId);
            if (!hasEoTracks) {
              this.trackManager.setEoInvestigationStatus(systemTrackId as SystemTrackId, 'no_support');
              this.pushEvent(
                'eo.report.received',
                `No EO support for track ${systemTrackId.slice(0, 8)} — cue expired`,
                { cueId, systemTrackId, outcome: 'no_support' },
              );
            }
          }
        }

        this.cueToTrack.delete(cueId);
      }
    }
  }

  // ── Phase 6: Geometry Computation ────────────────────────────────────

  /**
   * Compute triangulation geometry estimates for tracks with ≥2 EO bearings
   * from different sensors. Stores results in geometryEstimates Map.
   */
  private computeGeometryEstimates(): void {
    // Group EO tracks by associated system track
    const bearingsByTrack = new Map<string, EoTrack[]>();
    for (const eoTrack of this.eoTracksById.values()) {
      const trackId = eoTrack.associatedSystemTrackId;
      if (!trackId || !eoTrack.bearing) continue;
      if (!bearingsByTrack.has(trackId)) {
        bearingsByTrack.set(trackId, []);
      }
      bearingsByTrack.get(trackId)!.push(eoTrack);
    }

    for (const [systemTrackId, eoTracks] of bearingsByTrack) {
      // Need bearings from ≥2 different sensors
      const uniqueSensors = new Set(eoTracks.map(t => t.sensorId as string));
      if (uniqueSensors.size < 2) continue;

      // Pick the best (most recent) bearing per sensor
      const bestPerSensor = new Map<string, EoTrack>();
      for (const t of eoTracks) {
        const existing = bestPerSensor.get(t.sensorId as string);
        if (!existing || t.bearing.timestamp > existing.bearing.timestamp) {
          bestPerSensor.set(t.sensorId as string, t);
        }
      }
      const selectedTracks = [...bestPerSensor.values()];
      if (selectedTracks.length < 2) continue;

      // Get sensor positions
      const sensorPositions = selectedTracks.map(t => {
        const sensor = this.state.sensors.find(s => s.sensorId === t.sensorId);
        return sensor?.position ?? { lat: 0, lon: 0, alt: 0 };
      });
      const bearings = selectedTracks.map(t => t.bearing);

      try {
        const triResult = triangulateMultiple(sensorPositions, bearings);
        const estimate = buildGeometryEstimate(
          triResult,
          selectedTracks.map(t => t.eoTrackId),
          0.5, // assumed bearing noise deg
          Math.abs(bearings[0].timestamp - bearings[bearings.length - 1].timestamp),
        );

        this.state.geometryEstimates.set(systemTrackId, estimate);

        // Emit formal GeometryEstimateUpdated event for validation
        this.eventEnvelopes.push({
          ...createEventEnvelope('geometry.estimate.updated', 'live-engine', 'geometry'),
          eventType: 'geometry.estimate.updated',
          data: {
            estimateId: estimate.estimateId,
            eoTrackIds: estimate.eoTrackIds,
            classification: estimate.classification,
            quality: estimate.quality,
            position3D: estimate.position3D,
            covariance3D: estimate.covariance3D,
          },
        } as any);

        this.pushEvent(
          'geometry.estimate.updated',
          `Geometry ${estimate.classification} for track ${systemTrackId.slice(0, 8)} (${estimate.quality}, ${estimate.intersectionAngleDeg.toFixed(1)}°)`,
          {
            systemTrackId,
            classification: estimate.classification,
            quality: estimate.quality,
            intersectionAngleDeg: estimate.intersectionAngleDeg,
            numBearings: triResult.numBearings,
          },
        );
      } catch {
        // Triangulation can fail with degenerate geometry — skip
      }
    }
  }

  // ── Core EO Target Detector Integration ──────────────────────────────

  /**
   * Process the Core EO Target Detector results each tick.
   *
   * Flow:
   * 1. Run the detector's processTick() — correlates bearing detections
   *    across staring sensors, triangulates overlapping ones.
   * 2. For new 3D EO targets: try to fuse with existing system track
   *    (within spatial gate). If match → update track with EO source.
   *    If no match → create new EO-originated system track.
   * 3. For updated 3D targets: update the associated system track position.
   * 4. For single-sensor enhanced-cue bearings: route through existing
   *    cue pipeline (autoCreateCueForBearing) for EO investigation.
   */
  private processCoreEoDetector(): void {
    const staringSensors = this.state.sensors.filter(
      s => s.gimbal?.slewRateDegPerSec === 0 && s.online,
    );
    if (staringSensors.length === 0) return;

    const result = this.coreEoDetector.processTick(staringSensors, this.state.tracks);

    // ── 1. New 3D EO targets → fuse or create system track ──
    for (const target of result.newTargets) {
      const fusedTrackId = this.fuseOrCreateTrackFromEoTarget(target);
      this.coreEoDetector.markPromoted(target.eoTargetId, fusedTrackId);

      this.pushEvent(
        'eo.target.detected',
        `Core EO detector: 3D target from ${target.sensorIds.length} sensors → ` +
        `${target.classification} (angle=${target.intersectionAngleDeg.toFixed(1)}°) → track ${fusedTrackId.slice(0, 8)}`,
        {
          eoTargetId: target.eoTargetId,
          sensorIds: target.sensorIds,
          position: target.position,
          classification: target.classification,
          intersectionAngleDeg: target.intersectionAngleDeg,
          systemTrackId: fusedTrackId,
        },
      );
    }

    // ── 2. Updated 3D targets → update associated system track ──
    for (const target of result.updatedTargets) {
      if (target.promotedTrackId) {
        this.updateTrackFromEoTarget(target);
      }
    }

    // ── 3. Ambiguity-resolved targets → promote to system track ──
    for (const target of result.resolvedFromAmbiguity) {
      const fusedTrackId = this.fuseOrCreateTrackFromEoTarget(target);
      this.coreEoDetector.markPromoted(target.eoTargetId, fusedTrackId);

      this.pushEvent(
        'eo.target.detected',
        `Ambiguity resolved: ${target.sensorIds.length} sensors, ` +
        `consistency-confirmed → ${target.classification} → track ${fusedTrackId.slice(0, 8)}`,
        {
          eoTargetId: target.eoTargetId,
          sensorIds: target.sensorIds,
          position: target.position,
          classification: target.classification,
          intersectionAngleDeg: target.intersectionAngleDeg,
          systemTrackId: fusedTrackId,
          resolvedViaConsistency: true,
        },
      );
    }

    // ── 4. Single-sensor detections → enhanced cueing fallback ──
    for (const cue of result.enhancedCueBearings) {
      const sensor = this.state.sensors.find(s => (s.sensorId as string) === cue.detection.sensorId);
      if (!sensor) continue;

      // Route through existing cue pipeline to create EO tracks for investigation
      const cueId = this.autoCreateCueForBearing(
        {
          sensorId: cue.detection.sensorId,
          targetId: cue.detection.targetId,
          bearing: cue.detection.bearing,
          imageQuality: cue.detection.imageQuality,
        } as EoBearingObservation,
        sensor,
      );

      if (cueId) {
        // Accumulate for batch processing in processAccumulatedBearings
        if (!this.pendingBearings.has(cueId)) {
          this.pendingBearings.set(cueId, []);
        }
        this.pendingBearings.get(cueId)!.push({
          sensorId: cue.detection.sensorId,
          targetId: cue.detection.targetId,
          bearing: cue.detection.bearing,
          imageQuality: cue.detection.imageQuality,
        } as EoBearingObservation);

        this.pushEvent(
          'eo.enhanced.cue',
          `${cue.detection.sensorId} az/el detection → enhanced cue for track ${cue.systemTrackId.slice(0, 8)} (Δ=${cue.angularDiffDeg.toFixed(1)}°)`,
          { sensorId: cue.detection.sensorId, systemTrackId: cue.systemTrackId, angularDiff: cue.angularDiffDeg },
        );
      }
    }
  }

  /**
   * Create a 3D EO system track from a triangulated EO target, then
   * attempt to fuse it with an existing radar/system track.
   *
   * Flow:
   * 1. Always create a new EO 3D system track first.
   * 2. Try to fuse with an existing radar/system track (within gate).
   *    - If match: merge EO data into the existing track, mark EO track
   *      as fused (linked to the radar track).
   * 3. If no match: EO 3D track stands as a new independent system track.
   *
   * Returns the EO system track ID.
   */
  private fuseOrCreateTrackFromEoTarget(target: EoTarget3D): string {
    const now = Date.now() as Timestamp;
    const EO_FUSION_GATE_M = 3000; // 3km gate for EO→radar track fusion

    // ── Step 1: Always create the EO 3D system track ──
    const eoTrackId = generateId() as SystemTrackId;

    const eoSystemTrack: SystemTrack = {
      systemTrackId: eoTrackId,
      state: { ...target.position },
      velocity: undefined,
      covariance: [
        [2500, 0, 0],   // ~50m uncertainty in each axis (from triangulation)
        [0, 2500, 0],
        [0, 0, 10000],  // altitude less certain from EO
      ],
      confidence: target.classification === 'confirmed_3d' ? 0.6 : 0.4,
      status: 'tentative',
      lineage: [
        createLineageEntry(
          'eo.target.created',
          `EO 3D track: ${target.classification} from ${target.sensorIds.length} staring sensors (angle=${target.intersectionAngleDeg.toFixed(1)}°)`,
        ),
      ],
      lastUpdated: now,
      sources: target.sensorIds.map(s => s as SensorId),
      eoInvestigationStatus: 'confirmed',
      fusionMode: 'eo_triangulation',
    };

    // Register EO track with TrackManager
    this.trackManager.injectTrack(eoSystemTrack);

    // Store geometry estimate for the EO track
    this.state.geometryEstimates.set(eoTrackId as string, {
      estimateId: generateId(),
      eoTrackIds: target.detectionIds.map(d => d as EoTrackId),
      position3D: target.position,
      covariance3D: undefined,
      quality: target.intersectionAngleDeg > 15 ? 'strong' : 'acceptable',
      classification: target.classification,
      intersectionAngleDeg: target.intersectionAngleDeg,
      timeAlignmentQualityMs: 0,
      bearingNoiseDeg: 0.1,
    } as GeometryEstimate);

    // ── Step 2: Try to fuse with existing radar/system track ──
    let bestRadarTrack: SystemTrack | undefined;
    let bestDistance = Infinity;

    for (const track of this.state.tracks) {
      if (track.status === 'dropped') continue;
      // Skip tracks that are already EO-originated (don't fuse EO with EO)
      if (track.fusionMode === 'eo_triangulation') continue;

      const dLat = (target.position.lat - track.state.lat) * 110540;
      const dLon = (target.position.lon - track.state.lon) * 111320 *
        Math.cos(track.state.lat * Math.PI / 180);
      const dAlt = target.position.alt - track.state.alt;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);

      if (dist < bestDistance) {
        bestDistance = dist;
        bestRadarTrack = track;
      }
    }

    if (bestRadarTrack && bestDistance <= EO_FUSION_GATE_M) {
      // ── Fuse EO data into existing radar track ──
      const radarTrackId = bestRadarTrack.systemTrackId as string;

      // Weighted position fusion: radar has range, EO has angular triangulation
      const eoWeight = target.classification === 'confirmed_3d' ? 0.4 : 0.2;
      const radarWeight = 1 - eoWeight;

      bestRadarTrack.state = {
        lat: radarWeight * bestRadarTrack.state.lat + eoWeight * target.position.lat,
        lon: radarWeight * bestRadarTrack.state.lon + eoWeight * target.position.lon,
        alt: radarWeight * bestRadarTrack.state.alt + eoWeight * target.position.alt,
      };

      // Add EO sensor sources to radar track
      for (const sid of target.sensorIds) {
        if (!bestRadarTrack.sources.includes(sid as SensorId)) {
          bestRadarTrack.sources.push(sid as SensorId);
        }
      }

      bestRadarTrack.lineage.push(
        createLineageEntry(
          'eo.target.fused',
          `Fused with EO 3D track ${(eoTrackId as string).slice(0, 8)} (${target.sensorIds.length} sensors, angle=${target.intersectionAngleDeg.toFixed(1)}°, dist=${bestDistance.toFixed(0)}m)`,
        ),
      );
      bestRadarTrack.lastUpdated = now;
      bestRadarTrack.eoInvestigationStatus = 'confirmed';

      // Also copy geometry estimate to the radar track
      this.state.geometryEstimates.set(radarTrackId, {
        estimateId: generateId(),
        eoTrackIds: target.detectionIds.map(d => d as EoTrackId),
        position3D: target.position,
        covariance3D: undefined,
        quality: target.intersectionAngleDeg > 15 ? 'strong' : 'acceptable',
        classification: target.classification,
        intersectionAngleDeg: target.intersectionAngleDeg,
        timeAlignmentQualityMs: 0,
        bearingNoiseDeg: 0.1,
      } as GeometryEstimate);

      // Mark the EO track as fused to the radar track
      eoSystemTrack.lineage.push(
        createLineageEntry(
          'eo.track.fused',
          `Fused into radar track ${radarTrackId.slice(0, 8)} (dist=${bestDistance.toFixed(0)}m)`,
        ),
      );

      this.pushEvent(
        'eo.track.fused',
        `EO 3D track ${(eoTrackId as string).slice(0, 8)} fused into radar track ${radarTrackId.slice(0, 8)} (dist=${bestDistance.toFixed(0)}m)`,
        { eoTrackId: eoTrackId as string, radarTrackId, distance: bestDistance },
      );
    }
    // Step 3: If no match, the EO track stands alone as a new system track

    return eoTrackId as string;
  }

  /**
   * Update an existing EO system track (and any fused radar track) with
   * refreshed triangulated position from the Core EO Detector.
   */
  private updateTrackFromEoTarget(target: EoTarget3D): void {
    if (!target.promotedTrackId) return;
    const now = Date.now() as Timestamp;

    // Update the EO 3D system track directly
    const eoTrack = this.state.tracks.find(
      t => (t.systemTrackId as string) === target.promotedTrackId,
    );
    if (eoTrack && eoTrack.status !== 'dropped') {
      // 6DOF consistency evaluation: compare new position against predicted
      const consistency = this.trackManager.consistencyEvaluator.evaluate(
        target.promotedTrackId,
        target.position,
        eoTrack.velocity,
        now as number,
      );

      eoTrack.state = { ...target.position };
      eoTrack.lastUpdated = now;

      if (consistency) {
        // Apply consistency-based certainty delta
        eoTrack.confidence = Math.max(0, Math.min(1, eoTrack.confidence + consistency.certaintyDelta));
      } else {
        // First update — small boost
        eoTrack.confidence = Math.min(1, eoTrack.confidence + 0.05);
      }

      // Update geometry estimate for EO track
      this.state.geometryEstimates.set(target.promotedTrackId, {
        estimateId: generateId(),
        eoTrackIds: target.detectionIds.map(d => d as EoTrackId),
        position3D: target.position,
        covariance3D: undefined,
        quality: target.intersectionAngleDeg > 15 ? 'strong' : 'acceptable',
        classification: target.classification,
        intersectionAngleDeg: target.intersectionAngleDeg,
        timeAlignmentQualityMs: 0,
        bearingNoiseDeg: 0.1,
      } as GeometryEstimate);
    }

    // Also update any radar track this was fused into
    // (search for tracks that have an "eo.target.fused" lineage entry referencing this EO track)
    const eoTrackIdShort = target.promotedTrackId.slice(0, 8);
    for (const track of this.state.tracks) {
      if (track.status === 'dropped') continue;
      if (track.fusionMode === 'eo_triangulation') continue; // skip EO tracks
      const hasFusion = track.lineage.some(l => l.description.includes(eoTrackIdShort));
      if (!hasFusion) continue;

      // Update fused radar track with EO position
      const eoWeight = target.classification === 'confirmed_3d' ? 0.3 : 0.15;
      const existingWeight = 1 - eoWeight;
      track.state = {
        lat: existingWeight * track.state.lat + eoWeight * target.position.lat,
        lon: existingWeight * track.state.lon + eoWeight * target.position.lon,
        alt: existingWeight * track.state.alt + eoWeight * target.position.alt,
      };
      track.lastUpdated = now;

      // Copy geometry estimate to radar track
      this.state.geometryEstimates.set(track.systemTrackId as string, {
        estimateId: generateId(),
        eoTrackIds: target.detectionIds.map(d => d as EoTrackId),
        position3D: target.position,
        covariance3D: undefined,
        quality: target.intersectionAngleDeg > 15 ? 'strong' : 'acceptable',
        classification: target.classification,
        intersectionAngleDeg: target.intersectionAngleDeg,
        timeAlignmentQualityMs: 0,
        bearingNoiseDeg: 0.1,
      } as GeometryEstimate);
    }
  }

  // ── Multi-Sensor 3D Resolution (REQ-6) ─────────────────────────────

  /**
   * Resolve multi-sensor targets: when 3+ sensors observe the same target
   * (via bearing associations), use all available bearings for improved
   * triangulation. Called each tick after computeGeometryEstimates().
   */
  private resolveMultiSensorTargets(): void {
    const resolutions: typeof this.multiSensorResolutions = [];

    // Group confident bearing associations by track
    const bearingsByTrack = new Map<string, Array<{
      sensorId: string;
      bearing: number;
      confidence: number;
    }>>();

    for (const assoc of this.bearingAssociations) {
      if (!bearingsByTrack.has(assoc.trackId)) {
        bearingsByTrack.set(assoc.trackId, []);
      }
      bearingsByTrack.get(assoc.trackId)!.push({
        sensorId: assoc.sensorId,
        bearing: assoc.bearing,
        confidence: assoc.confidence,
      });
    }

    for (const [trackId, assocs] of bearingsByTrack) {
      // Filter to confident bearings only
      const confidentBearings = assocs.filter(a => a.confidence > 0.5);
      const uniqueSensors = new Set(confidentBearings.map(a => a.sensorId));

      // All bearings low confidence — mark bearing_only
      if (confidentBearings.length === 0) {
        const existingEstimate = this.state.geometryEstimates.get(trackId);
        if (existingEstimate) {
          (existingEstimate as any).lowConfidence = true;
        }
        resolutions.push({
          trackId,
          sensorCount: assocs.length,
          sensorIds: [...new Set(assocs.map(a => a.sensorId))],
          qualityScore: 0,
          positionEstimate: null,
          method: '2-sensor',
        });
        continue;
      }

      // Need 3+ sensors for multi-sensor resolution
      if (uniqueSensors.size < 3) {
        // Still record 2-sensor resolution if geometry estimate exists
        const existing = this.state.geometryEstimates.get(trackId);
        if (existing && existing.position3D) {
          resolutions.push({
            trackId,
            sensorCount: uniqueSensors.size,
            sensorIds: [...uniqueSensors],
            qualityScore: this.qualityScoreFromEstimate(existing),
            positionEstimate: existing.position3D,
            method: '2-sensor',
          });
        }
        continue;
      }

      // 3+ sensors: collect sensor positions and build bearing measurements
      const sensorPositions: Array<{ lat: number; lon: number; alt: number }> = [];
      const bearingMeasurements: Array<{ azimuthDeg: number; elevationDeg: number; timestamp: number }> = [];
      const sensorIds: string[] = [];

      // Pick best (highest confidence) bearing per sensor
      const bestPerSensor = new Map<string, typeof confidentBearings[0]>();
      for (const b of confidentBearings) {
        const existing = bestPerSensor.get(b.sensorId);
        if (!existing || b.confidence > existing.confidence) {
          bestPerSensor.set(b.sensorId, b);
        }
      }

      for (const [sensorId, assoc] of bestPerSensor) {
        const sensor = this.state.sensors.find(s => (s.sensorId as string) === sensorId);
        if (!sensor) continue;
        sensorPositions.push(sensor.position);
        bearingMeasurements.push({
          azimuthDeg: assoc.bearing,
          elevationDeg: 0,
          timestamp: Date.now(),
        });
        sensorIds.push(sensorId);
      }

      if (sensorPositions.length < 3) continue;

      try {
        const multiResult = triangulateMultiple(
          sensorPositions,
          bearingMeasurements as any,
        );

        // Compare against existing 2-sensor estimate
        const existingEstimate = this.state.geometryEstimates.get(trackId);
        const existingMissDistance = existingEstimate
          ? ((existingEstimate as any).averageMissDistance ?? Infinity)
          : Infinity;

        // Use multi-sensor result if it's better (lower miss distance or more bearings)
        if (!existingEstimate || multiResult.averageMissDistance <= existingMissDistance || multiResult.numBearings > 2) {
          const estimate = buildGeometryEstimate(
            multiResult,
            (existingEstimate?.eoTrackIds ?? []) as any,
            0.5,
            0,
          );

          // Mark as confirmed_3d if intersection angle > 15 and quality is good
          const qualityScore = this.qualityScoreFromIntersectionAngle(multiResult.intersectionAngleDeg);
          if (multiResult.intersectionAngleDeg > 15 && qualityScore > 0.5) {
            estimate.classification = 'confirmed_3d';
          }

          // Store the improved estimate
          this.state.geometryEstimates.set(trackId, estimate);

          resolutions.push({
            trackId,
            sensorCount: sensorIds.length,
            sensorIds,
            qualityScore,
            positionEstimate: multiResult.position,
            method: 'multi-sensor',
          });
        } else {
          // Keep existing estimate but still record the resolution attempt
          resolutions.push({
            trackId,
            sensorCount: sensorIds.length,
            sensorIds,
            qualityScore: this.qualityScoreFromEstimate(existingEstimate),
            positionEstimate: existingEstimate.position3D,
            method: '2-sensor',
          });
        }
      } catch {
        // Triangulation failed — skip
      }
    }

    this.multiSensorResolutions = resolutions;
  }

  /** Convert intersection angle to a 0-1 quality score */
  private qualityScoreFromIntersectionAngle(angleDeg: number): number {
    // 0° = 0, 15° = 0.5, 45° = 0.85, 90° = 1.0
    return Math.min(1.0, angleDeg / 90);
  }

  /** Extract a 0-1 quality score from a GeometryEstimate */
  private qualityScoreFromEstimate(est: GeometryEstimate): number {
    const qualityMap: Record<string, number> = {
      excellent: 1.0, strong: 0.9, good: 0.8, acceptable: 0.6,
      fair: 0.5, weak: 0.3, poor: 0.2, insufficient: 0.1,
    };
    return qualityMap[est.quality] ?? 0.5;
  }

  // ── Convergence Monitoring (REQ-5 Phase C) ─────────────────────────

  /**
   * Update convergence state for all tracks that have geometry estimates.
   * Called each tick after computeGeometryEstimates().
   */
  private updateConvergenceState(): void {
    const nowSec = this.state.elapsedSec;

    for (const [trackId, estimate] of this.state.geometryEstimates) {
      // Compute estimated position error from covariance (if available)
      let positionErrorEstimate: number;
      const cov = (estimate as any).covariance3D;
      if (cov && Array.isArray(cov) && cov.length >= 2) {
        const varLat = typeof cov[0]?.[0] === 'number' ? cov[0][0] : 0;
        const varLon = typeof cov[1]?.[1] === 'number' ? cov[1][1] : 0;
        positionErrorEstimate = Math.sqrt(varLat + varLon) * 111000;
      } else {
        const qualityMap: Record<string, number> = {
          excellent: 100, good: 300, fair: 700, poor: 1500,
        };
        positionErrorEstimate = qualityMap[estimate.quality] ?? 1000;
      }

      const intersectionAngle = estimate.intersectionAngleDeg ?? 0;
      const numBearings = estimate.eoTrackIds?.length ?? 0;

      let entry = this.convergenceState.get(trackId);
      if (!entry) {
        entry = {
          trackId,
          measurements: [],
          convergenceRate: 0,
          converged: false,
          convergedAt: null,
        };
        this.convergenceState.set(trackId, entry);
      }

      entry.measurements.push({
        timestamp: nowSec,
        positionErrorEstimate,
        intersectionAngle,
        numBearings,
      });

      // Keep last 10 measurements
      if (entry.measurements.length > 10) {
        entry.measurements = entry.measurements.slice(-10);
      }

      // Compute convergence rate via linear regression slope
      if (entry.measurements.length >= 3 && !entry.converged) {
        const n = entry.measurements.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const x = entry.measurements[i].timestamp;
          const y = entry.measurements[i].positionErrorEstimate;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }
        const denom = n * sumX2 - sumX * sumX;
        if (denom !== 0) {
          entry.convergenceRate = (n * sumXY - sumX * sumY) / denom;
        }

        if (entry.convergenceRate < 0 && positionErrorEstimate < 500) {
          entry.converged = true;
          entry.convergedAt = nowSec;
          this.pushEvent(
            'eo.convergence.achieved',
            `Triangulation converged for track ${trackId.slice(0, 8)} (error: ${positionErrorEstimate.toFixed(0)}m, rate: ${entry.convergenceRate.toFixed(2)})`,
            { trackId, positionErrorEstimate, convergenceRate: entry.convergenceRate },
          );
        }
      }
    }
  }

  /**
   * Get convergence states for all tracked targets.
   */
  getConvergenceStates(): Array<{
    trackId: string;
    convergenceRate: number;
    converged: boolean;
    convergedAt: number | null;
    measurementCount: number;
    positionErrorEstimate: number;
  }> {
    const result: Array<{
      trackId: string;
      convergenceRate: number;
      converged: boolean;
      convergedAt: number | null;
      measurementCount: number;
      positionErrorEstimate: number;
    }> = [];
    for (const entry of this.convergenceState.values()) {
      const lastMeasurement = entry.measurements[entry.measurements.length - 1];
      result.push({
        trackId: entry.trackId,
        convergenceRate: entry.convergenceRate,
        converged: entry.converged,
        convergedAt: entry.convergedAt,
        measurementCount: entry.measurements.length,
        positionErrorEstimate: lastMeasurement?.positionErrorEstimate ?? 0,
      });
    }
    return result;
  }

  // ── Track Dossier Methods ────────────────────────────────────────────

  /**
   * Collect evidence chain for a track: contributing sensors, observation
   * count, correlation decisions, and last 20 source observations from the
   * event log.
   */
  getTrackEvidence(trackId: string): Record<string, unknown> {
    const track = this.trackManager.getTrack(trackId as SystemTrackId);
    if (!track) return { contributingSensors: [], observationCount: 0, correlationDecisions: [], sourceObservations: [] };

    const contributingSensors = track.sources.map(sid => {
      const sensor = this.state.sensors.find(s => s.sensorId === sid);
      return {
        sensorId: sid,
        sensorType: sensor?.sensorType ?? 'unknown',
        online: sensor?.online ?? false,
      };
    });

    const trackEvents = this.state.eventLog.filter(
      e => e.data && (e.data as any).trackId === trackId,
    );
    const observationCount = trackEvents.filter(
      e => e.eventType === 'source.observation.reported',
    ).length;

    const correlationDecisions = trackEvents
      .filter(e => e.eventType === 'source.observation.reported')
      .slice(-20)
      .map(e => ({
        timestamp: e.timestamp,
        simTimeSec: e.simTimeSec,
        sensorId: (e.data as any)?.sensorId ?? '',
        decision: (e.data as any)?.decision ?? '',
      }));

    const sourceObservations = track.lineage.slice(-20).map(entry => ({
      version: entry.version,
      timestamp: entry.timestamp,
      event: entry.event,
      description: entry.description,
    }));

    return {
      contributingSensors,
      observationCount,
      correlationDecisions,
      sourceObservations,
    };
  }

  /**
   * Collect investigation history for a track: active cues, EO tracks/bearings,
   * EO reports, identification support, and unresolved groups.
   */
  getTrackInvestigation(trackId: string): Record<string, unknown> {
    const activeCues: Array<Record<string, unknown>> = [];
    for (const [cueId, sysTrackId] of this.cueToTrack) {
      if (sysTrackId !== trackId) continue;
      const cue = this.activeCuesById.get(cueId);
      if (!cue) continue;
      const task = this.state.tasks.find(t => t.cueId === cueId);
      activeCues.push({
        cueId,
        sensorId: task?.sensorId ?? null,
        priority: cue.priority,
        uncertaintyGateDeg: cue.uncertaintyGateDeg,
        validFrom: cue.validFrom,
        validTo: cue.validTo,
        taskStatus: task?.status ?? null,
      });
    }

    const eoTracks = [...this.eoTracksById.values()]
      .filter(t => t.associatedSystemTrackId === trackId)
      .map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        confidence: t.confidence,
        identificationSupport: t.identificationSupport ?? null,
      }));

    const eoReports = this.state.eventLog
      .filter(
        e =>
          e.eventType === 'eo.report.received' &&
          e.data &&
          (e.data as any).systemTrackId === trackId,
      )
      .slice(-20)
      .map(e => ({
        timestamp: e.timestamp,
        simTimeSec: e.simTimeSec,
        outcome: (e.data as any)?.outcome ?? '',
        sensorId: (e.data as any)?.sensorId ?? '',
        cueId: (e.data as any)?.cueId ?? '',
      }));

    const identifications = [...this.eoTracksById.values()]
      .filter(t => t.associatedSystemTrackId === trackId && t.identificationSupport)
      .map(t => ({
        sensorId: t.sensorId,
        type: t.identificationSupport!.type,
        confidence: t.identificationSupport!.confidence,
        features: t.identificationSupport!.features,
      }));

    const trackEoTrackIds = new Set(
      [...this.eoTracksById.values()]
        .filter(t => t.associatedSystemTrackId === trackId)
        .map(t => t.eoTrackId as string),
    );
    const unresolvedGroups = [...this.unresolvedGroupsById.values()]
      .filter(g => g.status === 'active' && g.eoTrackIds.some(id => trackEoTrackIds.has(id as string)))
      .map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        reason: g.reason,
        memberCount: g.eoTrackIds.length,
        escalated: g.escalated ?? false,
      }));

    return {
      activeCues,
      eoTracks,
      eoReports,
      identifications,
      unresolvedGroups,
    };
  }

  /**
   * Compute a threat assessment for a track: score breakdown, kinematic
   * profile, closure rate, and tasking priority.
   */
  getTrackThreat(trackId: string): Record<string, unknown> {
    const track = this.trackManager.getTrack(trackId as SystemTrackId);
    if (!track) {
      return {
        threatScore: 0,
        scoreBreakdown: null,
        kinematicProfile: null,
        closureRate: null,
        taskingPriority: 'none',
      };
    }

    const tasks = this.state.tasks.filter(t => (t.systemTrackId as string) === trackId);
    const activeTask = tasks.find(t => t.status === 'executing');
    const proposedTask = tasks.find(t => t.status === 'proposed');

    const taskForScore = activeTask ?? proposedTask ?? tasks[tasks.length - 1];

    // Compute kinematics
    const speed = track.velocity
      ? Math.sqrt(track.velocity.vx ** 2 + track.velocity.vy ** 2 + track.velocity.vz ** 2)
      : 0;
    const altitudeRate = track.velocity?.vz ?? 0;
    const headingRateDegPerSec = 0;

    const speedTrend: 'increasing' | 'decreasing' | 'steady' =
      speed > 250 ? 'increasing' : speed < 50 ? 'decreasing' : 'steady';
    const altitudeTrend: 'climbing' | 'descending' | 'level' =
      altitudeRate > 5 ? 'climbing' : altitudeRate < -5 ? 'descending' : 'level';

    let closureRate = 0;
    let closureSensorId: string | null = null;

    // Prefer Doppler-measured radial velocity when available and not blind
    if (track.radialVelocity !== undefined && track.dopplerQuality !== 'blind') {
      closureRate = -track.radialVelocity; // radialVelocity positive=receding → closureRate positive=approaching
      // Find nearest sensor for the closureSensorId label
      let minDist = Infinity;
      for (const sensor of this.state.sensors) {
        const dlat = track.state.lat - sensor.position.lat;
        const dlon = track.state.lon - sensor.position.lon;
        const dist = dlat * dlat + dlon * dlon;
        if (dist < minDist) {
          minDist = dist;
          closureSensorId = sensor.sensorId as string;
        }
      }
    } else {
      // Fallback: compute from Cartesian velocity
      for (const sensor of this.state.sensors) {
        if (!track.velocity) break;
        const dlat = track.state.lat - sensor.position.lat;
        const dlon = track.state.lon - sensor.position.lon;
        const dist = Math.sqrt(dlat ** 2 + dlon ** 2);
        if (dist < 1e-9) continue;

        const ux = dlon / dist;
        const uy = dlat / dist;
        const vr = track.velocity.vx * ux + track.velocity.vy * uy;
        if (closureSensorId === null || Math.abs(vr) > Math.abs(closureRate)) {
          closureRate = -vr;
          closureSensorId = sensor.sensorId as string;
        }
      }
    }

    // Use EO task score breakdown if available, otherwise compute standalone threat assessment
    let scoreBreakdown;
    if (taskForScore?.scoreBreakdown) {
      scoreBreakdown = taskForScore.scoreBreakdown;
    } else {
      // Standalone threat assessment based on track kinematics
      const confidenceBase = track.confidence * 10;
      const altPenalty = Math.max(0, 1 - track.state.alt / 15000);
      const speedBonus = speed / 500;
      const closureBonus = Math.max(0, closureRate / 200);
      const threatScore = confidenceBase * (1 + altPenalty + speedBonus + closureBonus);

      // Uncertainty from covariance
      const cov = track.covariance;
      const trace = (cov[0]?.[0] ?? 0) + (cov[1]?.[1] ?? 0) + (cov[2]?.[2] ?? 0);
      const uncertaintyReduction = trace > 0 ? Math.min(10, Math.sqrt(trace) / 100) : 0;

      const total = threatScore + uncertaintyReduction;
      scoreBreakdown = {
        threatScore,
        uncertaintyReduction,
        geometryGain: 0,
        operatorIntent: this.operatorPriorityTracks.has(trackId) ? 3.0 : 0,
        slewCost: 0,
        occupancyCost: 0,
        total,
      };
    }

    const taskingPriority = activeTask
      ? 'active'
      : proposedTask
        ? 'proposed'
        : 'none';

    return {
      threatScore: scoreBreakdown.total,
      scoreBreakdown: {
        threat: scoreBreakdown.threatScore,
        uncertainty: scoreBreakdown.uncertaintyReduction,
        geometry: scoreBreakdown.geometryGain,
        intent: scoreBreakdown.operatorIntent,
        slewCost: scoreBreakdown.slewCost,
        occupancyCost: scoreBreakdown.occupancyCost,
      },
      kinematicProfile: {
        speedMs: speed,
        speedTrend,
        altitudeM: track.state.alt,
        altitudeTrend,
        altitudeRateMs: altitudeRate,
        headingRateDegPerSec,
      },
      closureRate: {
        valueMs: closureRate,
        approaching: closureRate > 0,
        sensorId: closureSensorId,
      },
      taskingPriority,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private buildInitialState(): LiveState {
    return {
      tracks: [],
      sensors: this.buildSensorStates(),
      tasks: [],
      geometryEstimates: new Map(),
      registrationStates: [],
      eventLog: [],
      scenarioId: this.scenario.id,
      running: false,
      speed: 1,
      elapsedSec: 0,
      durationSec: this.scenario.durationSec,
      eoTracks: [],
      unresolvedGroups: [],
      activeCues: [],
    };
  }

  private buildSensorStates(): SensorState[] {
    return this.scenario.sensors.map(s => ({
      sensorId: s.sensorId as SensorId,
      sensorType: s.type as 'radar' | 'eo' | 'c4isr',
      position: { ...s.position },
      gimbal: s.type === 'eo' ? {
        azimuthDeg: 0,
        elevationDeg: 0,
        slewRateDegPerSec: s.slewRateDegPerSec ?? 30,
        currentTargetId: undefined,
      } : undefined,
      fov: s.fov ? { halfAngleHDeg: s.fov.halfAngleHDeg, halfAngleVDeg: s.fov.halfAngleVDeg } : undefined,
      coverage: { ...s.coverage },
      online: true,
      lastUpdateTime: Date.now() as Timestamp,
    }));
  }

  private updateSensorStatus(activeFaults: Array<{ sensorId: string; type: string }>): void {
    for (const sensor of this.state.sensors) {
      const hasOutage = activeFaults.some(
        f => f.sensorId === sensor.sensorId && f.type === 'sensor_outage',
      );
      sensor.online = !hasOutage;
      sensor.lastUpdateTime = Date.now() as Timestamp;
    }
  }

  /** Add a track to the operator priority set (boosts EO tasking score). */
  addPriorityTrack(trackId: string): void {
    this.operatorPriorityTracks.add(trackId);
  }

  /** Remove a track from the operator priority set. */
  removePriorityTrack(trackId: string): void {
    this.operatorPriorityTracks.delete(trackId);
  }

  /** Get all operator-prioritized track IDs. */
  getPriorityTracks(): string[] {
    return [...this.operatorPriorityTracks];
  }

  /** Classify a track by setting its classification, source, and confidence. */
  classifyTrack(
    trackId: string,
    classification: TargetClassification,
    source: ClassificationSource,
    confidence: number = 1.0,
  ): SystemTrack | undefined {
    const track = this.state.tracks.find(
      t => t.systemTrackId === trackId,
    );
    if (!track) return undefined;
    track.classification = classification;
    track.classificationSource = source;
    track.classificationConfidence = Math.max(0, Math.min(1, confidence));
    return track;
  }

  /** Lock a sensor to a target or position, preventing auto-reassignment. */
  lockSensor(sensorId: string, targetId?: string, position?: { lat: number; lon: number; alt: number }): boolean {
    const sensor = this.state.sensors.find(s => s.sensorId === sensorId);
    if (!sensor) return false;

    this.operatorLockedSensors.set(sensorId, {
      sensorId,
      targetTrackId: targetId,
      position,
      lockedAt: this.state.elapsedSec,
    });

    // Point gimbal immediately if target exists
    if (sensor.gimbal && targetId) {
      const track = this.state.tracks.find(t => t.systemTrackId === targetId);
      if (track) {
        sensor.gimbal.azimuthDeg = bearingDeg(
          sensor.position.lat, sensor.position.lon,
          track.state.lat, track.state.lon,
        );
        sensor.gimbal.currentTargetId = targetId;
      }
    } else if (sensor.gimbal && position) {
      sensor.gimbal.azimuthDeg = bearingDeg(
        sensor.position.lat, sensor.position.lon,
        position.lat, position.lon,
      );
      sensor.gimbal.currentTargetId = undefined;
    }

    this.pushEvent('operator.sensor.locked', `Sensor ${sensorId} locked by operator`, {
      sensorId,
      targetTrackId: targetId,
      position,
    });
    return true;
  }

  /** Release a locked sensor back to auto mode. */
  releaseSensor(sensorId: string): boolean {
    if (!this.operatorLockedSensors.has(sensorId)) return false;
    this.operatorLockedSensors.delete(sensorId);
    this.pushEvent('operator.sensor.released', `Sensor ${sensorId} released by operator`, { sensorId });
    return true;
  }

  /** Set priority level for a track. */
  setTrackPriority(trackId: string, priority: 'high' | 'normal' | 'low'): boolean {
    const track = this.state.tracks.find(t => t.systemTrackId === trackId);
    if (!track) return false;

    if (priority === 'normal') {
      this.operatorTrackPriority.delete(trackId);
      this.operatorPriorityTracks.delete(trackId);
    } else {
      this.operatorTrackPriority.set(trackId, priority);
      if (priority === 'high') {
        this.operatorPriorityTracks.add(trackId);
      } else {
        this.operatorPriorityTracks.delete(trackId);
      }
    }

    this.pushEvent('operator.priority.set', `Track ${trackId} priority set to ${priority}`, { trackId, priority });
    return true;
  }

  /** Get all active operator overrides. */
  getOperatorOverrides(): {
    lockedSensors: Array<{ sensorId: string; targetTrackId?: string; position?: { lat: number; lon: number; alt: number }; lockedAt: number }>;
    priorityTracks: Array<{ trackId: string; priority: 'high' | 'normal' | 'low' }>;
    manualClassifications: Array<{ trackId: string; classification: string; confidence: number }>;
  } {
    const lockedSensors = [...this.operatorLockedSensors.values()];
    const priorityTracks = [...this.operatorTrackPriority.entries()].map(([trackId, priority]) => ({ trackId, priority }));
    const manualClassifications = this.state.tracks
      .filter(t => t.classificationSource === 'operator' && t.classification)
      .map(t => ({
        trackId: t.systemTrackId as string,
        classification: t.classification!,
        confidence: t.classificationConfidence ?? 1.0,
      }));
    return { lockedSensors, priorityTracks, manualClassifications };
  }

  // ── Search Mode (REQ-5 Phase B) ────────────────────────────────────

  /**
   * Update search mode for all EO sensors.
   * Called each tick from finalizeTick(). If an EO sensor has no valid
   * tracking candidates for 3+ consecutive ticks, it enters search mode
   * and systematically scans its sector. Exits when candidates appear.
   */
  private updateSearchMode(dtSec: number): void {
    const tracks = this.state.tracks;
    const sensors = this.state.sensors;

    for (const sensor of sensors) {
      if (sensor.sensorType !== 'eo' || !sensor.online || !sensor.gimbal) continue;
      const sId = sensor.sensorId as string;

      // Fixed/staring sensors do not scan — skip search mode entirely
      if (sensor.gimbal.slewRateDegPerSec === 0) continue;

      // Operator-locked sensors skip search mode
      if (this.operatorLockedSensors.has(sId)) continue;

      // Check if sensor has any valid candidates: tracks in coverage, not dropped
      const hasCandidates = tracks.some(track => {
        if (track.status === 'dropped') return false;
        if (!sensor.coverage) return false;
        // Simple range check using coverage.maxRangeM
        const dlat = track.state.lat - sensor.position.lat;
        const dlon = track.state.lon - sensor.position.lon;
        const distM = Math.sqrt(dlat * dlat + dlon * dlon) * 111_000;
        return distM <= sensor.coverage.maxRangeM;
      });

      // Also check if sensor is actively dwelling
      const isDwelling = this.dwellState.has(sId);

      let searchState = this.searchModeState.get(sId);

      if (hasCandidates || isDwelling) {
        // Candidates available — deactivate search mode
        if (searchState?.active) {
          searchState.active = false;
          searchState.idleTickCount = 0;
          this.pushEvent('eo.search.deactivated', `Search mode deactivated for ${sId} — targets available`);
        } else if (searchState) {
          searchState.idleTickCount = 0;
        }
        continue;
      }

      // No candidates and not dwelling — increment idle counter
      if (!searchState) {
        searchState = {
          active: false,
          pattern: 'sector',
          currentAzimuth: sensor.gimbal.azimuthDeg ?? 0,
          scanStart: 0,
          scanEnd: 360,
          scanSpeed: 10,
          scanDirection: 1,
          idleTickCount: 0,
        };
        this.searchModeState.set(sId, searchState);
      }

      searchState.idleTickCount++;

      if (!searchState.active && searchState.idleTickCount >= 3) {
        // Activate search mode after 3 idle ticks
        searchState.active = true;
        searchState.currentAzimuth = sensor.gimbal.azimuthDeg ?? 0;
        this.pushEvent('eo.search.activated', `Search mode activated for ${sId} — no targets for ${searchState.idleTickCount} ticks`);
      }

      if (searchState.active) {
        // Advance scan azimuth
        const increment = searchState.scanSpeed * dtSec * searchState.scanDirection;
        searchState.currentAzimuth += increment;

        // Bounce at sector boundaries
        if (searchState.scanEnd > searchState.scanStart) {
          // Normal sector (e.g. 0-360)
          if (searchState.currentAzimuth >= searchState.scanEnd) {
            searchState.currentAzimuth = searchState.scanEnd;
            searchState.scanDirection = -1;
          } else if (searchState.currentAzimuth <= searchState.scanStart) {
            searchState.currentAzimuth = searchState.scanStart;
            searchState.scanDirection = 1;
          }
        }

        // Normalize to [0, 360)
        searchState.currentAzimuth = ((searchState.currentAzimuth % 360) + 360) % 360;

        // Update sensor gimbal to follow search pattern
        sensor.gimbal.azimuthDeg = searchState.currentAzimuth;
        sensor.gimbal.currentTargetId = undefined; // no target — searching
      }
    }
  }

  /** Get search mode status for all EO sensors. */
  getSearchModeStatus(): Array<{
    sensorId: string;
    active: boolean;
    pattern: 'sector' | 'raster';
    currentAzimuth: number;
    scanStart: number;
    scanEnd: number;
    scanSpeed: number;
    scanDirection: 1 | -1;
  }> {
    const result: Array<{
      sensorId: string;
      active: boolean;
      pattern: 'sector' | 'raster';
      currentAzimuth: number;
      scanStart: number;
      scanEnd: number;
      scanSpeed: number;
      scanDirection: 1 | -1;
    }> = [];
    for (const [sensorId, state] of this.searchModeState) {
      result.push({
        sensorId,
        active: state.active,
        pattern: state.pattern,
        currentAzimuth: state.currentAzimuth,
        scanStart: state.scanStart,
        scanEnd: state.scanEnd,
        scanSpeed: state.scanSpeed,
        scanDirection: state.scanDirection,
      });
    }
    return result;
  }

  /** Set search mode control for a specific sensor. */
  setSearchModeControl(sensorId: string, control: {
    enabled: boolean;
    pattern?: 'sector' | 'raster';
    scanStart?: number;
    scanEnd?: number;
  }): boolean {
    const sensor = this.state.sensors.find(s => (s.sensorId as string) === sensorId && s.sensorType === 'eo');
    if (!sensor) return false;

    let searchState = this.searchModeState.get(sensorId);
    if (!searchState) {
      searchState = {
        active: false,
        pattern: 'sector',
        currentAzimuth: sensor.gimbal?.azimuthDeg ?? 0,
        scanStart: 0,
        scanEnd: 360,
        scanSpeed: 10,
        scanDirection: 1,
        idleTickCount: 0,
      };
      this.searchModeState.set(sensorId, searchState);
    }

    if (control.pattern !== undefined) searchState.pattern = control.pattern;
    if (control.scanStart !== undefined) searchState.scanStart = control.scanStart;
    if (control.scanEnd !== undefined) searchState.scanEnd = control.scanEnd;

    if (control.enabled && !searchState.active) {
      searchState.active = true;
      searchState.idleTickCount = 3; // force active
      this.pushEvent('eo.search.activated', `Search mode manually activated for ${sensorId}`);
    } else if (!control.enabled && searchState.active) {
      searchState.active = false;
      searchState.idleTickCount = 0;
      this.pushEvent('eo.search.deactivated', `Search mode manually deactivated for ${sensorId}`);
    }

    return true;
  }

  /** Update EO gimbal azimuth to continuously track assigned targets. */
  private updateGimbalPointing(): void {
    const trackMap = new Map(this.state.tracks.map(t => [t.systemTrackId, t]));
    for (const sensor of this.state.sensors) {
      if (!sensor.gimbal || !sensor.online) continue;

      // Fixed/staring sensors do not slew — skip gimbal tracking
      if (sensor.gimbal.slewRateDegPerSec === 0) continue;

      // Operator-locked sensors: continuously point at locked target/position
      const lockInfo = this.operatorLockedSensors.get(sensor.sensorId as string);
      if (lockInfo) {
        if (lockInfo.targetTrackId) {
          const track = trackMap.get(lockInfo.targetTrackId);
          if (track && track.status !== 'dropped') {
            sensor.gimbal.azimuthDeg = bearingDeg(
              sensor.position.lat, sensor.position.lon,
              track.state.lat, track.state.lon,
            );
            sensor.gimbal.currentTargetId = lockInfo.targetTrackId;
          }
        } else if (lockInfo.position) {
          sensor.gimbal.azimuthDeg = bearingDeg(
            sensor.position.lat, sensor.position.lon,
            lockInfo.position.lat, lockInfo.position.lon,
          );
        }
        continue; // Skip normal auto-tracking for locked sensors
      }

      if (!sensor.gimbal.currentTargetId) continue;
      const track = trackMap.get(sensor.gimbal.currentTargetId as string);
      if (!track || track.status === 'dropped') {
        // Target lost — clear assignment
        sensor.gimbal.currentTargetId = undefined;
        continue;
      }
      // Predict track position forward by 1 tick to compensate for fusion lag
      let tLat = track.state.lat;
      let tLon = track.state.lon;
      if (track.velocity) {
        const dtSec = 1; // 1-tick prediction
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos(tLat * Math.PI / 180);
        if (mPerDegLon > 0) {
          tLat += (track.velocity.vy * dtSec) / mPerDegLat;
          tLon += (track.velocity.vx * dtSec) / mPerDegLon;
        }
      }
      sensor.gimbal.azimuthDeg = bearingDeg(
        sensor.position.lat, sensor.position.lon,
        tLat, tLon,
      );
    }
  }

  private getAllRegistrationStates(): RegistrationState[] {
    const states: RegistrationState[] = [];
    for (const sensor of this.state.sensors) {
      const health = this.registrationService.getHealth(sensor.sensorId);
      if (health) states.push(health);
    }
    return states;
  }

  private pushEvent(eventType: string, summary: string, data?: Record<string, unknown>): void {
    const event: LiveEvent = {
      id: generateId(),
      eventType,
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      summary,
      data,
    };

    // Keep last 500 events
    this.state.eventLog.push(event);
    if (this.state.eventLog.length > 500) {
      this.state.eventLog = this.state.eventLog.slice(-500);
    }

    // Broadcast to WebSocket clients
    this.broadcast({
      type: 'event',
      eventType: event.eventType,
      timestamp: event.timestamp,
      simTimeSec: event.simTimeSec,
      summary: event.summary,
      data: event.data,
    });
  }

  // ── Decision Chain Builder ─────────────────────────────────────────

  getDecisionChains(): DecisionChainEntry[] {
    return this.decisionChains;
  }

  /**
   * Build decision chain entries that trace each GT target through the pipeline.
   * Called periodically (every 5 seconds) to avoid overhead.
   */
  private buildDecisionChains(): void {
    const groundTruth = this.getGroundTruth();
    if (groundTruth.length === 0) return;

    const tracks = this.state.tracks.filter(t => t.status !== 'dropped');
    const timeSec = this.state.elapsedSec;
    const now = Date.now();
    const MATCH_THRESHOLD_M = 5000;

    // Build target startTime lookup from scenario definition
    const targetStartTime = new Map<string, number>();
    for (const target of this.scenario.targets) {
      targetStartTime.set(target.targetId, target.startTime ?? 0);
    }

    // Build GT-to-track mapping (reuse quality assessment logic)
    const gtToTrack = new Map<string, SystemTrack>();
    const trackDistances: Array<{ gt: any; track: SystemTrack; dist: number }> = [];

    for (const gt of groundTruth) {
      if (!gt.active) continue;
      for (const track of tracks) {
        const dist = LiveEngine.haversineMeters(
          track.state.lat, track.state.lon,
          gt.position.lat, gt.position.lon,
        );
        if (dist < MATCH_THRESHOLD_M) {
          trackDistances.push({ gt, track, dist });
        }
      }
    }
    trackDistances.sort((a, b) => a.dist - b.dist);
    const assignedTargets = new Set<string>();
    const assignedTracks = new Set<string>();
    for (const entry of trackDistances) {
      if (assignedTargets.has(entry.gt.targetId) || assignedTracks.has(entry.track.systemTrackId as string)) continue;
      gtToTrack.set(entry.gt.targetId, entry.track);
      assignedTargets.add(entry.gt.targetId);
      assignedTracks.add(entry.track.systemTrackId as string);
    }

    const chains: DecisionChainEntry[] = [];

    for (const gt of groundTruth) {
      if (!gt.active) continue;
      const track = gtToTrack.get(gt.targetId);
      const steps: DecisionChainStep[] = [];
      const tgtStartTime = targetStartTime.get(gt.targetId) ?? 0;

      // Step 1: Ground Truth
      steps.push({
        stage: 'ground_truth',
        timestamp: now, simTimeSec: timeSec,
        detail: `Target "${gt.name || gt.targetId}" active at (${gt.position.lat.toFixed(3)}, ${gt.position.lon.toFixed(3)}, ${gt.position.alt.toFixed(0)}m). Start: T+${tgtStartTime}s`,
        data: { classification: gt.classification, speed: gt.speed, headingDeg: gt.headingDeg, startTime: tgtStartTime },
      });

      if (!track) {
        // No track associated — detection failed
        steps.push({
          stage: 'detection',
          timestamp: now, simTimeSec: timeSec,
          detail: 'No system track associated — target not yet detected or track dropped',
          decision: 'undetected',
          score: 0,
        });
        chains.push({
          id: `chain-${gt.targetId}-${timeSec}`,
          targetId: gt.targetId,
          targetName: gt.name || gt.targetId,
          trackId: '',
          simTimeSec: timeSec,
          steps,
          chainQuality: 0,
          qualityBreakdown: { detectionLatency: 0, positionAccuracy: 0, correlationCorrectness: 0, promotionSpeed: 0, classificationAccuracy: 0, geometryQuality: 0, fusionEfficiency: 0 },
        });
        continue;
      }

      const trackId = track.systemTrackId as string;
      const dist = LiveEngine.haversineMeters(track.state.lat, track.state.lon, gt.position.lat, gt.position.lon);

      // Step 2: Detection — compute latency relative to target start time (P0 fix)
      const firstDetSec = this.firstDetectionTime.get(gt.targetId);
      const detLatencyRelative = firstDetSec != null ? Math.max(0, firstDetSec - tgtStartTime) : (timeSec - tgtStartTime);
      steps.push({
        stage: 'detection',
        timestamp: now, simTimeSec: timeSec,
        detail: `Detected by sensors: [${(track.sources || []).join(', ')}]. First detection ${detLatencyRelative.toFixed(1)}s after target active (T+${tgtStartTime}s)`,
        decision: 'detected',
        score: Math.min(1, Math.max(0, 1 - detLatencyRelative / 30)),
        data: { sources: track.sources, firstDetectionSec: firstDetSec, targetStartTime: tgtStartTime, detectionLatencySec: detLatencyRelative },
      });

      // Step 3: Correlation
      const corrMethod = track.lineage?.find(l => l.description?.includes('correlation'))?.description ?? 'nearest-neighbor gating';
      steps.push({
        stage: 'correlation',
        timestamp: now, simTimeSec: timeSec,
        detail: `Track ${trackId} associated via ${corrMethod}. Position error: ${dist.toFixed(0)}m`,
        decision: dist < 1000 ? 'good match' : dist < 3000 ? 'marginal match' : 'poor match',
        score: Math.min(1, Math.max(0, 1 - dist / 5000)),
        data: { positionErrorM: dist, correlationMethod: corrMethod },
      });

      // Step 4: Fusion — resolve actual fusion mode from per-sensor map
      const primarySensor = (track.sources || [])[0] as string | undefined;
      const actualFusionMode = (primarySensor && this.fusionModePerSensor.get(primarySensor)) ?? track.fusionMode ?? 'unknown';
      const primaryRegHealth = primarySensor ? this.registrationService.getHealth(primarySensor as SensorId) : undefined;
      const regHealthLabel = primaryRegHealth ? (primaryRegHealth.fusionSafe ? 'good' : 'degraded') : 'no_data';
      steps.push({
        stage: 'fusion',
        timestamp: now, simTimeSec: timeSec,
        detail: `Fusion mode: ${actualFusionMode}, registration health: ${regHealthLabel}. Confidence: ${track.confidence.toFixed(2)}`,
        decision: actualFusionMode,
        alternatives: 'confirmation_only | conservative_track_fusion | centralized_measurement_fusion',
        score: track.confidence,
        data: { fusionMode: actualFusionMode, registrationHealth: regHealthLabel, confidence: track.confidence, sourceDiversity: (track.sources || []).length },
      });

      // Step 5: Promotion
      const statusScore = track.status === 'confirmed' ? 1.0 : track.status === 'tentative' ? 0.5 : track.status === 'coasting' ? 0.3 : 0;
      steps.push({
        stage: 'promotion',
        timestamp: now, simTimeSec: timeSec,
        detail: `Track status: ${track.status}. Existence probability: ${(track.existenceProbability ?? track.confidence).toFixed(2)}`,
        decision: track.status,
        score: statusScore,
        data: { status: track.status, existenceProbability: track.existenceProbability },
      });

      // Step 6: EO Tasking (if applicable)
      const trackTasks = this.state.tasks.filter(t => t.systemTrackId === track.systemTrackId);
      if (trackTasks.length > 0) {
        const bestTask = trackTasks.reduce((a, b) => (a.scoreBreakdown?.total ?? 0) > (b.scoreBreakdown?.total ?? 0) ? a : b);
        steps.push({
          stage: 'eo_tasking',
          timestamp: now, simTimeSec: timeSec,
          detail: `EO tasked: sensor ${bestTask.sensorId}, score ${(bestTask.scoreBreakdown?.total ?? 0).toFixed(2)}`,
          decision: `assigned to ${bestTask.sensorId}`,
          score: Math.min(1, (bestTask.scoreBreakdown?.total ?? 0) / 10),
          data: { taskId: bestTask.taskId, sensorId: bestTask.sensorId, scoreBreakdown: bestTask.scoreBreakdown },
        });
      }

      // Step 7: EO Investigation
      if (track.eoInvestigationStatus && track.eoInvestigationStatus !== 'none') {
        const invScore = track.eoInvestigationStatus === 'confirmed' ? 1.0 : track.eoInvestigationStatus === 'in_progress' ? 0.6 : 0.3;
        steps.push({
          stage: 'eo_investigation',
          timestamp: now, simTimeSec: timeSec,
          detail: `EO investigation status: ${track.eoInvestigationStatus}`,
          decision: track.eoInvestigationStatus,
          score: invScore,
        });
      }

      // Step 8: Geometry
      const geoEst = this.state.geometryEstimates.get(trackId);
      if (geoEst) {
        const geoScore = geoEst.classification === 'confirmed_3d' ? 1.0 : geoEst.classification === 'candidate_3d' ? 0.6 : 0.2;
        steps.push({
          stage: 'geometry',
          timestamp: now, simTimeSec: timeSec,
          detail: `Geometry: ${geoEst.classification}, quality: ${geoEst.quality ?? 'unknown'}, intersection angle: ${(geoEst.intersectionAngleDeg ?? 0).toFixed(1)}°`,
          decision: geoEst.classification,
          score: geoScore,
          data: { classification: geoEst.classification, quality: geoEst.quality, intersectionAngleDeg: geoEst.intersectionAngleDeg },
        });
      }

      // Step 9: Classification (with broad category matching)
      if (track.classification) {
        const gtClass = (gt.classification ?? '').toLowerCase();
        const trackClass = (track.classification ?? '').toLowerCase();
        // Exact match
        let classMatch = !!(gtClass && trackClass && gtClass === trackClass);
        // Broad category match: "aircraft" matches any fixed-wing type
        let broadMatch = false;
        if (!classMatch && gtClass && trackClass) {
          const AIRCRAFT_TYPES = ['fighter_aircraft', 'passenger_aircraft', 'civilian_aircraft', 'light_aircraft', 'aircraft'];
          const UAV_TYPES = ['uav', 'small_uav', 'drone', 'small_air_vehicle'];
          const HELI_TYPES = ['helicopter', 'rotary_wing'];
          for (const group of [AIRCRAFT_TYPES, UAV_TYPES, HELI_TYPES]) {
            if (group.includes(gtClass) && group.includes(trackClass)) { broadMatch = true; break; }
          }
        }
        const matchLabel = classMatch ? 'exact match' : broadMatch ? 'broad match' : (gtClass ? 'mismatch' : 'unverifiable');
        const matchScore = classMatch ? 1.0 : broadMatch ? 0.75 : (track.classificationConfidence ?? 0.5);
        steps.push({
          stage: 'classification',
          timestamp: now, simTimeSec: timeSec,
          detail: `Classified as "${trackClass}" (source: ${track.classificationSource ?? 'unknown'}, confidence: ${(track.classificationConfidence ?? 0).toFixed(2)}). GT: "${gtClass}"`,
          decision: matchLabel,
          score: matchScore,
          data: { classification: trackClass, source: track.classificationSource, confidence: track.classificationConfidence, gtClassification: gtClass, exactMatch: classMatch, broadMatch },
        });
      }

      // Compute quality breakdown
      const detectionLatencyScore = Math.min(1, Math.max(0, 1 - detLatencyRelative / 30));
      const positionAccuracy = Math.min(1, Math.max(0, 1 - dist / 5000));
      const correlationCorrectness = dist < MATCH_THRESHOLD_M ? 1 : 0;
      const promotionSpeed = track.status === 'confirmed' ? 1.0 : track.status === 'tentative' ? 0.5 : 0.2;
      const classAcc = (() => {
        if (!gt.classification || !track.classification) return 0.5;
        const g = gt.classification.toLowerCase();
        const t = (track.classification ?? '').toLowerCase();
        if (g === t) return 1.0;
        // Broad category match
        const AIRCRAFT_TYPES = ['fighter_aircraft', 'passenger_aircraft', 'civilian_aircraft', 'light_aircraft', 'aircraft'];
        const UAV_TYPES = ['uav', 'small_uav', 'drone', 'small_air_vehicle'];
        const HELI_TYPES = ['helicopter', 'rotary_wing'];
        for (const group of [AIRCRAFT_TYPES, UAV_TYPES, HELI_TYPES]) {
          if (group.includes(g) && group.includes(t)) return 0.75;
        }
        return 0.0;
      })();
      const geoQ = geoEst ? (geoEst.classification === 'confirmed_3d' ? 1.0 : geoEst.classification === 'candidate_3d' ? 0.6 : 0.2) : 0;
      const fusionEff = Math.min(1, (track.sources || []).length / 3);

      const chainQuality = (
        detectionLatencyScore * 0.15 +
        positionAccuracy * 0.20 +
        correlationCorrectness * 0.15 +
        promotionSpeed * 0.15 +
        classAcc * 0.10 +
        geoQ * 0.15 +
        fusionEff * 0.10
      );

      chains.push({
        id: `chain-${gt.targetId}-${timeSec}`,
        targetId: gt.targetId,
        targetName: gt.name || gt.targetId,
        trackId,
        simTimeSec: timeSec,
        steps,
        chainQuality,
        qualityBreakdown: {
          detectionLatency: detectionLatencyScore,
          positionAccuracy,
          correlationCorrectness,
          promotionSpeed,
          classificationAccuracy: classAcc,
          geometryQuality: geoQ,
          fusionEfficiency: fusionEff,
        },
      });
    }

    this.decisionChains = chains;
    // Also archive to event log (sampled — keep last MAX)
    // Decision chains are computed on-demand, not accumulated
  }

  // ── Quality Assessment ─────────────────────────────────────────────

  /**
   * Haversine distance in meters between two lat/lon points.
   */
  private static haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6_371_000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Compute quality metrics by comparing system tracks against ground truth.
   * Called each tick from finalizeTick().
   */
  private computeQualityMetrics(): void {
    this.totalTicks++;

    // Update sensor tasked ticks (EO dwells)
    for (const [sensorId] of this.dwellState) {
      this.sensorTaskedTicks.set(sensorId, (this.sensorTaskedTicks.get(sensorId) ?? 0) + 1);
    }

    // Update sensor observation ticks (radar/c4isr observation counts)
    for (const sensorId of this.currentTickObservingSensors) {
      this.sensorObservationTicks.set(sensorId, (this.sensorObservationTicks.get(sensorId) ?? 0) + 1);
    }
    this.currentTickObservingSensors.clear();

    const groundTruth = this.getGroundTruth();
    const tracks = this.state.tracks;
    const timeSec = this.state.elapsedSec;

    if (groundTruth.length === 0 && tracks.length === 0) {
      this.cachedQualityMetrics = {
        pictureAccuracy: 100,
        gtMatchDetails: [],
        trackToTruthAssociation: 1,
        positionErrorAvg: 0,
        positionErrorMax: 0,
        classificationAccuracy: 1,
        coveragePercent: 1,
        falseTrackRate: 0,
        sensorUtilization: this.buildSensorUtilization(),
        timeToFirstDetection: Object.fromEntries(this.firstDetectionTime),
        timeToConfirmed3D: Object.fromEntries(this.confirmedGeometryTime),
      };
      return;
    }

    // Associate each system track to its nearest ground truth target (within 5km)
    // Use greedy optimal assignment: for each GT target, pick the closest track.
    // Remaining unmatched tracks are "false" tracks (no real target nearby).
    const MATCH_THRESHOLD_M = 5000;
    const trackToTarget = new Map<string, string>(); // trackId → targetId
    const targetToTrack = new Map<string, string>(); // targetId → best trackId
    const positionErrors: number[] = [];

    // Build distance matrix: for each track, find nearest GT target
    const trackDistances: Array<{ trackId: string; targetId: string; dist: number }> = [];

    for (const track of tracks) {
      for (const gt of groundTruth) {
        const dist = LiveEngine.haversineMeters(
          track.state.lat, track.state.lon,
          gt.position.lat, gt.position.lon,
        );
        if (dist < MATCH_THRESHOLD_M) {
          trackDistances.push({
            trackId: track.systemTrackId as string,
            targetId: gt.targetId,
            dist,
          });
        }
      }
    }

    // Sort by distance ascending for greedy assignment
    trackDistances.sort((a, b) => a.dist - b.dist);

    // Greedy assignment: each GT target gets its closest track first,
    // then remaining tracks can also match (as duplicates, still "associated")
    const assignedTargets = new Set<string>();
    const assignedTracks = new Set<string>();

    // Pass 1: optimal 1-to-1 assignment (best track per target)
    for (const entry of trackDistances) {
      if (assignedTargets.has(entry.targetId) || assignedTracks.has(entry.trackId)) continue;
      targetToTrack.set(entry.targetId, entry.trackId);
      trackToTarget.set(entry.trackId, entry.targetId);
      positionErrors.push(entry.dist);
      assignedTargets.add(entry.targetId);
      assignedTracks.add(entry.trackId);
    }

    // Pass 2: remaining tracks that are near a GT target are still "associated"
    // (duplicate tracks for same target — not false, just redundant)
    for (const entry of trackDistances) {
      if (assignedTracks.has(entry.trackId)) continue;
      trackToTarget.set(entry.trackId, entry.targetId);
      positionErrors.push(entry.dist);
      assignedTracks.add(entry.trackId);
    }

    // Record first detection and confirmed_3d times
    for (const [trackId, targetId] of trackToTarget) {
      if (!this.firstDetectionTime.has(targetId)) {
        this.firstDetectionTime.set(targetId, timeSec);
      }
      const geoEst = this.state.geometryEstimates.get(trackId);
      if (geoEst && geoEst.classification === 'confirmed_3d' && !this.confirmedGeometryTime.has(targetId)) {
        this.confirmedGeometryTime.set(targetId, timeSec);
      }
    }

    // Metrics
    const matchedTrackCount = trackToTarget.size;
    const trackToTruthAssociation = tracks.length > 0
      ? matchedTrackCount / tracks.length
      : 1;

    const positionErrorAvg = positionErrors.length > 0
      ? positionErrors.reduce((a, b) => a + b, 0) / positionErrors.length
      : 0;

    const positionErrorMax = positionErrors.length > 0
      ? Math.max(...positionErrors)
      : 0;

    // Classification accuracy: among tracks that have a classification and are matched
    let classifiedCorrect = 0;
    let classifiedTotal = 0;
    for (const track of tracks) {
      const targetId = trackToTarget.get(track.systemTrackId as string);
      if (!targetId) continue;
      if (!track.classification) continue;
      classifiedTotal++;
      const gt = groundTruth.find(g => g.targetId === targetId);
      if (gt && gt.classification && track.classification === gt.classification) {
        classifiedCorrect++;
      }
    }
    const classificationAccuracy = classifiedTotal > 0 ? classifiedCorrect / classifiedTotal : 1;

    // Coverage: % of active targets that have an associated system track
    const coveragePercent = groundTruth.length > 0
      ? targetToTrack.size / groundTruth.length
      : 1;

    // False track rate: % of system tracks with no corresponding real target
    const falseTrackRate = tracks.length > 0
      ? (tracks.length - matchedTrackCount) / tracks.length
      : 0;

    // ── PRIMARY MEASURE: Picture Accuracy (GT match score 0–100) ──
    // Composite of: coverage, position accuracy, velocity accuracy, false track penalty
    const gtMatchDetails: Array<{
      targetId: string;
      matched: boolean;
      positionErrorM: number;
      velocityErrorMps: number;
      trackId: string | null;
    }> = [];

    for (const gt of groundTruth) {
      const matchedTrackId = targetToTrack.get(gt.targetId) ?? null;
      if (!matchedTrackId) {
        gtMatchDetails.push({
          targetId: gt.targetId,
          matched: false,
          positionErrorM: Infinity,
          velocityErrorMps: Infinity,
          trackId: null,
        });
        continue;
      }

      const track = tracks.find(t => (t.systemTrackId as string) === matchedTrackId);
      if (!track) {
        gtMatchDetails.push({
          targetId: gt.targetId,
          matched: false,
          positionErrorM: Infinity,
          velocityErrorMps: Infinity,
          trackId: matchedTrackId,
        });
        continue;
      }

      const posErrorM = LiveEngine.haversineMeters(
        track.state.lat, track.state.lon,
        gt.position.lat, gt.position.lon,
      );

      // Velocity error (3D Euclidean, m/s)
      let velErrorMps = 0;
      if (gt.velocity && track.velocity) {
        const dvx = (track.velocity.vx ?? 0) - gt.velocity.vx;
        const dvy = (track.velocity.vy ?? 0) - gt.velocity.vy;
        const dvz = (track.velocity.vz ?? 0) - gt.velocity.vz;
        velErrorMps = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
      }

      gtMatchDetails.push({
        targetId: gt.targetId,
        matched: true,
        positionErrorM: posErrorM,
        velocityErrorMps: velErrorMps,
        trackId: matchedTrackId,
      });
    }

    // Compute composite picture accuracy [0–100]:
    //   40% coverage (what fraction of GT targets are tracked)
    //   30% position accuracy (how close tracks are to GT, normalized)
    //   15% velocity accuracy (how close velocities match)
    //   15% false track penalty (fewer false tracks = better)
    const coverageScore = coveragePercent * 100; // 0–100

    // Position accuracy: 100 for 0m error, degrades with distance
    // Calibrated so typical radar accuracy (~1km) scores ~90+
    // Uses exponential decay: e^(-error/5000)
    // 500m→90, 1000m→82, 2000m→67, 3000m→55
    const posScores = gtMatchDetails
      .filter(d => d.matched)
      .map(d => 100 * Math.exp(-d.positionErrorM / 5000));
    const posAccuracy = posScores.length > 0
      ? posScores.reduce((a, b) => a + b, 0) / posScores.length
      : 0;

    // Velocity accuracy: 100 for 0 m/s error, 0 for ≥200 m/s
    // Wider scale since velocity errors depend on target speed
    const velScores = gtMatchDetails
      .filter(d => d.matched && d.velocityErrorMps < Infinity)
      .map(d => Math.max(0, 100 * (1 - d.velocityErrorMps / 200)));
    const velAccuracy = velScores.length > 0
      ? velScores.reduce((a, b) => a + b, 0) / velScores.length
      : 100; // no velocity data = no penalty

    // False track penalty: 100 for 0% false, 0 for 100% false
    const falseTrackScore = (1 - falseTrackRate) * 100;

    // Weights: coverage is most important, then position, then false tracks, then velocity
    const pictureAccuracy = Math.round(
      0.45 * coverageScore +
      0.25 * posAccuracy +
      0.10 * velAccuracy +
      0.20 * falseTrackScore,
    );

    this.cachedQualityMetrics = {
      pictureAccuracy: Math.max(0, Math.min(100, pictureAccuracy)),
      gtMatchDetails,
      trackToTruthAssociation,
      positionErrorAvg,
      positionErrorMax,
      classificationAccuracy,
      coveragePercent,
      falseTrackRate,
      sensorUtilization: this.buildSensorUtilization(),
      timeToFirstDetection: Object.fromEntries(this.firstDetectionTime),
      timeToConfirmed3D: Object.fromEntries(this.confirmedGeometryTime),
    };
  }

  private buildSensorUtilization(): Record<string, number> {
    const result: Record<string, number> = {};
    if (this.totalTicks === 0) return result;
    for (const sensor of this.state.sensors) {
      const sensorId = sensor.sensorId as string;
      if (sensor.sensorType === 'eo') {
        // EO sensors: utilization = % of ticks with active dwell
        const tasked = this.sensorTaskedTicks.get(sensorId) ?? 0;
        result[sensorId] = tasked / this.totalTicks;
      } else {
        // Radar/C4ISR sensors: utilization = % of ticks that produced at least one observation
        const observed = this.sensorObservationTicks.get(sensorId) ?? 0;
        result[sensorId] = observed / this.totalTicks;
      }
    }
    return result;
  }

  /** Public accessor for quality metrics. */
  getQualityMetrics(): typeof this.cachedQualityMetrics {
    return this.cachedQualityMetrics;
  }

  /** Public accessor for EO allocation quality (REQ-10). */
  getEoAllocationQuality(): typeof this.cachedEoAllocationQuality {
    return this.cachedEoAllocationQuality;
  }

  /**
   * Compute EO allocation quality metrics (REQ-10).
   * Measures how well EO resources were allocated across 7 criteria.
   */

  // ── FOV Overlap Detection (REQ-6) ──────────────────────────────────────

  /**
   * Detect overlapping fields of view between EO sensors and identify
   * which tracks fall within the overlap regions.
   */
  private computeFovOverlaps(): void {
    const eoSensors = this.state.sensors.filter(
      s => s.sensorType === 'eo' && s.online && s.gimbal && s.fov,
    );

    const overlaps: FovOverlap[] = [];

    // Precompute FOV polygons for each EO sensor
    const fovPolygons = new Map<string, Array<{ lat: number; lon: number }>>();
    for (const sensor of eoSensors) {
      const rangeKm = (sensor.coverage?.maxRangeM ?? 30000) / 1000;
      const polygon = computeFovPolygon(sensor, rangeKm);
      if (polygon.length >= 3) {
        fovPolygons.set(sensor.sensorId as string, polygon);
      }
    }

    // Check each pair of EO sensors for overlap
    const sensorIds = [...fovPolygons.keys()];
    for (let i = 0; i < sensorIds.length; i++) {
      for (let j = i + 1; j < sensorIds.length; j++) {
        const id1 = sensorIds[i];
        const id2 = sensorIds[j];
        const fov1 = fovPolygons.get(id1)!;
        const fov2 = fovPolygons.get(id2)!;

        if (fovPolygonsOverlap(fov1, fov2)) {
          const overlapRegion = computeOverlapRegion(fov1, fov2);

          // Find tracks within the overlap region
          const tracksInOverlap: string[] = [];
          for (const track of this.state.tracks) {
            if (track.status === 'dropped') continue;
            const tp = { lat: track.state.lat, lon: track.state.lon };
            if (!Number.isFinite(tp.lat) || !Number.isFinite(tp.lon)) continue;
            // Track is in overlap if it's inside both FOV polygons
            if (pointInFovPolygon(tp, fov1) && pointInFovPolygon(tp, fov2)) {
              tracksInOverlap.push(track.systemTrackId as string);
            }
          }

          overlaps.push({
            sensorIds: [id1, id2],
            overlapRegion,
            tracksInOverlap,
          });
        }
      }
    }

    this.fovOverlaps = overlaps;
  }

  /** Get current FOV overlaps (for API endpoint). */
  getFovOverlaps(): FovOverlap[] {
    return this.fovOverlaps;
  }

  // ── Multi-target bearing association (REQ-6) ────────────────────────────

  /**
   * Compute bearing-to-track associations for all EO sensors.
   * For overlapping FOV regions with multiple targets, uses angular proximity
   * to associate each bearing observation to the nearest track, with confidence
   * scoring based on angular separation to the next-nearest target.
   */
  private computeBearingAssociations(): void {
    const associations: typeof this.bearingAssociations = [];
    const tracks = this.state.tracks.filter(t => t.status !== 'dropped');
    if (tracks.length === 0) {
      this.bearingAssociations = [];
      return;
    }

    // Build a set of trackIds that are in any overlap region
    const tracksInAnyOverlap = new Set<string>();
    for (const overlap of this.fovOverlaps) {
      for (const tid of overlap.tracksInOverlap) {
        tracksInAnyOverlap.add(tid);
      }
    }

    // For each EO sensor, get its gimbal azimuth as the "bearing"
    const eoSensors = this.state.sensors.filter(
      s => s.sensorType === 'eo' && s.online && s.gimbal && Number.isFinite(s.gimbal.azimuthDeg),
    );

    for (const sensor of eoSensors) {
      const sensorId = sensor.sensorId as string;
      const sensorBearing = sensor.gimbal!.azimuthDeg;
      const sensorLat = sensor.position.lat;
      const sensorLon = sensor.position.lon;

      // Compute angular distance from sensor to each non-dropped track
      const trackAngles: Array<{ trackId: string; angleDeg: number }> = [];
      for (const track of tracks) {
        if (!Number.isFinite(track.state.lat) || !Number.isFinite(track.state.lon)) continue;
        const az = bearingDeg(sensorLat, sensorLon, track.state.lat, track.state.lon);
        trackAngles.push({ trackId: track.systemTrackId as string, angleDeg: az });
      }

      if (trackAngles.length === 0) continue;

      // Find closest track to the sensor's current bearing
      let nearestIdx = 0;
      let nearestSep = Infinity;
      for (let i = 0; i < trackAngles.length; i++) {
        let diff = Math.abs(trackAngles[i].angleDeg - sensorBearing);
        if (diff > 180) diff = 360 - diff;
        if (diff < nearestSep) {
          nearestSep = diff;
          nearestIdx = i;
        }
      }

      const nearestTrackId = trackAngles[nearestIdx].trackId;

      // Check if this sensor is involved in any FOV overlap with multiple tracks
      const overlapsForSensor = this.fovOverlaps.filter(
        o => o.sensorIds.includes(sensorId) && o.tracksInOverlap.length >= 2,
      );
      const inOverlap = overlapsForSensor.length > 0;

      if (!inOverlap) {
        // No overlap — clean association
        associations.push({
          trackId: nearestTrackId,
          sensorId,
          bearing: sensorBearing,
          confidence: 1.0,
          ambiguous: false,
          alternateTrackIds: [],
        });
        continue;
      }

      // In overlap: compute separation to second-nearest track in the overlap
      const overlapTrackIds = new Set<string>();
      for (const o of overlapsForSensor) {
        for (const tid of o.tracksInOverlap) overlapTrackIds.add(tid);
      }

      // Sort overlap tracks by angular distance from the bearing
      const overlapAngles = trackAngles
        .filter(ta => overlapTrackIds.has(ta.trackId))
        .map(ta => {
          let diff = Math.abs(ta.angleDeg - sensorBearing);
          if (diff > 180) diff = 360 - diff;
          return { trackId: ta.trackId, sep: diff };
        })
        .sort((a, b) => a.sep - b.sep);

      if (overlapAngles.length < 2) {
        // Only one track in overlap — still clear
        associations.push({
          trackId: nearestTrackId,
          sensorId,
          bearing: sensorBearing,
          confidence: 1.0,
          ambiguous: false,
          alternateTrackIds: [],
        });
        continue;
      }

      const separation = overlapAngles.length >= 2
        ? overlapAngles[1].sep - overlapAngles[0].sep
        : 999;

      let confidence: number;
      if (separation > 5) {
        confidence = 1.0;
      } else if (separation >= 2) {
        confidence = 0.7;
      } else {
        confidence = 0.3;
      }

      const ambiguous = confidence < 0.7;
      const alternateTrackIds = ambiguous
        ? overlapAngles.filter(a => a.trackId !== overlapAngles[0].trackId).map(a => a.trackId)
        : [];

      associations.push({
        trackId: overlapAngles[0].trackId,
        sensorId,
        bearing: sensorBearing,
        confidence,
        ambiguous,
        alternateTrackIds,
      });
    }

    this.bearingAssociations = associations;
  }

  /** Get bearing associations (for API endpoint). */
  getBearingAssociations(): typeof this.bearingAssociations {
    return this.bearingAssociations;
  }

  private computeEoAllocationQuality(): void {
    const tracks = this.state.tracks;
    const eoSensors = this.state.sensors.filter(s => s.type === 'eo');
    const elapsedSec = this.state.elapsedSec;

    // 1. Coverage efficiency: % of high-priority/confirmed tracks that received EO investigation
    const highPriorityTracks = tracks.filter(t => {
      const trackId = t.systemTrackId as string;
      return this.operatorPriorityTracks.has(trackId)
        || this.operatorTrackPriority.get(trackId) === 'high'
        || t.status === 'confirmed';
    });
    let investigatedHighPriority = 0;
    for (const t of highPriorityTracks) {
      const trackId = t.systemTrackId as string;
      const hasEoTrack = [...this.eoTracksById.values()].some(
        et => (et.associatedSystemTrackId as string) === trackId,
      );
      if (hasEoTrack) investigatedHighPriority++;
    }
    const coverageEfficiency = highPriorityTracks.length > 0
      ? (investigatedHighPriority / highPriorityTracks.length) * 100
      : 100;

    // 2. Geometry optimality: avg intersection angle (closer to 90 is better)
    let angleSum = 0;
    let angleCount = 0;
    for (const [, est] of this.state.geometryEstimates) {
      if (est.intersectionAngleDeg != null && Number.isFinite(est.intersectionAngleDeg)) {
        angleSum += est.intersectionAngleDeg;
        angleCount++;
      }
    }
    const geometryOptimality = angleCount > 0 ? angleSum / angleCount : 0;

    // 3. Dwell efficiency: ratio of total dwell time vs total possible sensor time
    let totalDwellTimeSec = 0;
    for (const [, history] of this.cyclingHistory) {
      for (const entry of history) {
        totalDwellTimeSec += entry.endedSec - entry.startedSec;
      }
    }
    // Also add currently active dwells
    for (const [, dwell] of this.dwellState) {
      totalDwellTimeSec += elapsedSec - dwell.dwellStartSec;
    }
    const totalPossibleSec = elapsedSec * eoSensors.length;
    const dwellEfficiency = totalPossibleSec > 0
      ? Math.min(100, (totalDwellTimeSec / totalPossibleSec) * 100)
      : 0;

    // 4. Revisit timeliness: % of tracks whose revisit schedule is on time
    let onTimeCount = 0;
    let revisitTotal = 0;
    for (const track of tracks) {
      const trackId = track.systemTrackId as string;
      const lastInv = this.lastInvestigationTime.get(trackId);
      if (lastInv == null) continue; // never investigated, skip
      revisitTotal++;
      const nextRevisit = lastInv + LiveEngine.MAX_REVISIT_INTERVAL_SEC;
      if (elapsedSec <= nextRevisit) {
        onTimeCount++;
      }
    }
    const revisitTimeliness = revisitTotal > 0
      ? (onTimeCount / revisitTotal) * 100
      : 100;

    // 5. Triangulation success rate: % of investigated tracks achieving confirmed_3d
    let investigatedCount = 0;
    let confirmed3dCount = 0;
    for (const track of tracks) {
      const trackId = track.systemTrackId as string;
      const hasEoTrack = [...this.eoTracksById.values()].some(
        et => (et.associatedSystemTrackId as string) === trackId,
      );
      if (!hasEoTrack) continue;
      investigatedCount++;
      const geoEst = this.state.geometryEstimates.get(trackId);
      if (geoEst && geoEst.classification === 'confirmed_3d') {
        confirmed3dCount++;
      }
    }
    const triangulationSuccessRate = investigatedCount > 0
      ? (confirmed3dCount / investigatedCount) * 100
      : 0;

    // 6. Sensor utilization: avg % time each EO sensor is actively tasked
    let utilizationSum = 0;
    const sensorUtil = this.buildSensorUtilization();
    let eoSensorCount = 0;
    for (const sensor of eoSensors) {
      const sensorId = sensor.sensorId as string;
      utilizationSum += (sensorUtil[sensorId] ?? 0);
      eoSensorCount++;
    }
    const sensorUtilizationPct = eoSensorCount > 0
      ? (utilizationSum / eoSensorCount) * 100
      : 0;

    // 7. Priority alignment: rank correlation between threat priority and investigation order
    let priorityAlignment = 100;
    if (this.cyclingHistory.size > 0) {
      let totalComparisons = 0;
      let concordant = 0;
      for (const [, history] of this.cyclingHistory) {
        if (history.length < 2) continue;
        // Get priority rank for each visited track (high=3, normal=2, low=1, unset=2)
        const getRank = (trackId: string): number => {
          if (this.operatorPriorityTracks.has(trackId)) return 3;
          const p = this.operatorTrackPriority.get(trackId);
          if (p === 'high') return 3;
          if (p === 'low') return 1;
          return 2;
        };
        for (let i = 0; i < history.length - 1; i++) {
          const rankI = getRank(history[i].trackId);
          const rankJ = getRank(history[i + 1].trackId);
          totalComparisons++;
          // Concordant if higher-priority visited first or same priority
          if (rankI >= rankJ) concordant++;
        }
      }
      priorityAlignment = totalComparisons > 0
        ? (concordant / totalComparisons) * 100
        : 100;
    }

    this.cachedEoAllocationQuality = {
      coverageEfficiency,
      geometryOptimality,
      dwellEfficiency,
      revisitTimeliness,
      triangulationSuccessRate,
      sensorUtilization: sensorUtilizationPct,
      priorityAlignment,
    };
  }

  // ── Before/After EO Comparison (REQ-9) ─────────────────────────────

  /**
   * Compute position error (meters) for a track by finding nearest ground truth target.
   */
  private computeTrackPositionError(track: SystemTrack): number {
    const groundTruth = this.getGroundTruth();
    let bestDist = Infinity;
    for (const gt of groundTruth) {
      const dist = LiveEngine.haversineMeters(
        track.state.lat, track.state.lon,
        gt.position.lat, gt.position.lon,
      );
      if (dist < bestDist) {
        bestDist = dist;
      }
    }
    return bestDist === Infinity ? 0 : bestDist;
  }

  /**
   * Capture a pre-EO snapshot for a track (called when a cue is issued).
   * Only captures if no snapshot exists yet for this track.
   */
  private capturePreEoSnapshot(trackId: string): void {
    if (this.eoSnapshots.has(trackId)) return;

    const track = this.state.tracks.find(t => (t.systemTrackId as string) === trackId);
    if (!track) return;

    const positionError = this.computeTrackPositionError(track);
    const geoEst = this.state.geometryEstimates.get(trackId);
    const geometryStatus = geoEst?.classification ?? 'bearing_only';
    // Use covariance trace as uncertainty measure (fallback to 0)
    const covariance = track.covariance
      ? (track.covariance[0] ?? 0) + (track.covariance[3] ?? 0)
      : 0;

    this.eoSnapshots.set(trackId, {
      preEo: {
        positionError,
        covariance,
        classification: (track.classification as string) ?? null,
        geometryStatus,
        timestamp: this.state.elapsedSec,
      },
      postEo: null,
    });
  }

  /**
   * Capture a post-EO snapshot for a track (called when a dwell completes).
   */
  private capturePostEoSnapshot(trackId: string): void {
    const snapshot = this.eoSnapshots.get(trackId);
    if (!snapshot) return;

    const track = this.state.tracks.find(t => (t.systemTrackId as string) === trackId);
    if (!track) return;

    const positionError = this.computeTrackPositionError(track);
    const geoEst = this.state.geometryEstimates.get(trackId);
    const geometryStatus = geoEst?.classification ?? 'bearing_only';
    const covariance = track.covariance
      ? (track.covariance[0] ?? 0) + (track.covariance[3] ?? 0)
      : 0;

    snapshot.postEo = {
      positionError,
      covariance,
      classification: (track.classification as string) ?? null,
      geometryStatus,
      timestamp: this.state.elapsedSec,
    };
  }

  /**
   * Get before/after EO comparison data (REQ-9).
   */
  getBeforeAfterComparison(): {
    perTrack: Array<{
      trackId: string;
      preEo: { positionError: number; covariance: number; classification: string | null; geometryStatus: string; timestamp: number };
      postEo: { positionError: number; covariance: number; classification: string | null; geometryStatus: string; timestamp: number } | null;
      improvement: {
        positionErrorReduction: number;
        classificationGained: boolean;
        geometryUpgraded: boolean;
      };
    }>;
    aggregate: {
      avgPositionImprovement: number;
      tracksWithClassification: number;
      tracksWithGeometryUpgrade: number;
      totalTracksInvestigated: number;
    };
  } {
    const geometryRank: Record<string, number> = {
      bearing_only: 0,
      candidate_3d: 1,
      confirmed_3d: 2,
    };

    const perTrack: Array<{
      trackId: string;
      preEo: { positionError: number; covariance: number; classification: string | null; geometryStatus: string; timestamp: number };
      postEo: { positionError: number; covariance: number; classification: string | null; geometryStatus: string; timestamp: number } | null;
      improvement: {
        positionErrorReduction: number;
        classificationGained: boolean;
        geometryUpgraded: boolean;
      };
    }> = [];

    let totalPositionImprovement = 0;
    let tracksWithPositionData = 0;
    let tracksWithClassification = 0;
    let tracksWithGeometryUpgrade = 0;

    for (const [trackId, snapshot] of this.eoSnapshots) {
      const positionErrorReduction = snapshot.postEo
        ? snapshot.preEo.positionError - snapshot.postEo.positionError
        : 0;
      const classificationGained = snapshot.postEo
        ? snapshot.preEo.classification === null && snapshot.postEo.classification !== null
        : false;
      const geometryUpgraded = snapshot.postEo
        ? (geometryRank[snapshot.postEo.geometryStatus] ?? 0) > (geometryRank[snapshot.preEo.geometryStatus] ?? 0)
        : false;

      if (snapshot.postEo) {
        totalPositionImprovement += positionErrorReduction;
        tracksWithPositionData++;
        if (classificationGained) tracksWithClassification++;
        if (geometryUpgraded) tracksWithGeometryUpgrade++;
      }

      perTrack.push({
        trackId,
        preEo: snapshot.preEo,
        postEo: snapshot.postEo,
        improvement: {
          positionErrorReduction,
          classificationGained,
          geometryUpgraded,
        },
      });
    }

    return {
      perTrack,
      aggregate: {
        avgPositionImprovement: tracksWithPositionData > 0
          ? totalPositionImprovement / tracksWithPositionData
          : 0,
        tracksWithClassification,
        tracksWithGeometryUpgrade,
        totalTracksInvestigated: this.eoSnapshots.size,
      },
    };
  }

  private broadcastRap(force = false): void {
    // Throttle: at high speeds, cap broadcasts to ~4/sec (250ms interval)
    const now = Date.now();
    if (!force && this.state.speed > 2 && (now - this.lastBroadcastTime) < LiveEngine.MIN_BROADCAST_INTERVAL_MS) {
      return;
    }
    this.lastBroadcastTime = now;

    const tracks = this.state.tracks;
    // Strip lineage from broadcast to reduce WS payload size
    // (lineage can grow to hundreds of entries per track)
    const lightTracks = tracks.map(t => ({
      ...t,
      lineage: t.lineage.length > 3 ? t.lineage.slice(-3) : t.lineage,
    }));
    // Prepare lightweight active cues (strip covariance for payload size)
    const lightCues = this.state.activeCues.map(c => ({
      cueId: c.cueId,
      systemTrackId: c.systemTrackId,
      predictedState: c.predictedState,
      uncertaintyGateDeg: c.uncertaintyGateDeg,
      priority: c.priority,
      validFrom: c.validFrom,
      validTo: c.validTo,
    }));

    // Lightweight tasks — only active/recent ones
    const lightTasks = this.state.tasks
      .filter(t => t.status === 'executing' || t.status === 'proposed')
      .map(t => ({
        taskId: t.taskId,
        cueId: t.cueId,
        sensorId: t.sensorId,
        systemTrackId: t.systemTrackId,
        status: t.status,
        scoreBreakdown: t.scoreBreakdown,
        policyMode: t.policyMode,
        createdAt: t.createdAt,
      }));

    this.broadcast({
      type: 'rap.update',
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      running: this.state.running,
      speed: this.state.speed,
      trackCount: tracks.length,
      confirmedCount: tracks.filter(t => t.status === 'confirmed').length,
      tentativeCount: tracks.filter(t => t.status === 'tentative').length,
      tracks: lightTracks,
      sensors: this.state.sensors,
      activeCues: lightCues,
      tasks: lightTasks,
      // Recent EO bearing observations (from EO tracks created this cycle)
      eoTracks: this.state.eoTracks.slice(-20).map(t => ({
        eoTrackId: t.eoTrackId,
        sensorId: t.sensorId,
        bearing: t.bearing,
        imageQuality: t.imageQuality,
        status: t.status,
        associatedSystemTrackId: t.associatedSystemTrackId,
        identificationSupport: t.identificationSupport,
      })),
      // Phase 6: Geometry estimates
      geometryEstimates: [...this.state.geometryEstimates.entries()].map(([trackId, est]) => ({
        trackId,
        estimateId: est.estimateId,
        position3D: est.position3D,
        quality: est.quality,
        classification: est.classification,
        intersectionAngleDeg: est.intersectionAngleDeg,
        timeAlignmentQualityMs: est.timeAlignmentQualityMs,
        bearingNoiseDeg: est.bearingNoiseDeg,
        eoTrackIds: est.eoTrackIds,
      })),
      // Phase 2/7: Registration states
      registrationStates: this.state.registrationStates.map(r => ({
        sensorId: r.sensorId,
        spatialQuality: r.spatialQuality,
        timingQuality: r.timingQuality,
        fusionSafe: r.fusionSafe,
        azimuthBiasDeg: r.spatialBias?.azimuthBiasDeg ?? 0,
        elevationBiasDeg: r.spatialBias?.elevationBiasDeg ?? 0,
        clockOffsetMs: r.clockBias?.offsetMs ?? 0,
      })),
      // Phase 5: Unresolved groups
      unresolvedGroups: this.state.unresolvedGroups.map(g => ({
        groupId: g.groupId,
        eoTrackIds: g.eoTrackIds,
        status: g.status,
        parentCueId: g.parentCueId,
        reason: g.reason,
      })),
      // Phase 7: Fusion modes per sensor
      fusionModes: Object.fromEntries(this.fusionModePerSensor),
      // Investigation summaries for InvestigationManagerPanel
      investigationSummaries: this.getActiveInvestigations(),
      // Dwell and revisit state
      dwellStates: this.getDwellStates(),
      revisitSchedule: this.getRevisitSchedule(),
      // Operator overrides
      operatorOverrides: this.getOperatorOverrides(),
      // EO cycling histories (last 5 per sensor)
      cyclingHistories: Object.fromEntries(
        [...this.cyclingHistory.entries()].map(([sensorId, history]) => [sensorId, history.slice(-5)]),
      ),
      // Cover zones (REQ-11)
      coverZones: this.scenario.coverZones ?? [],
      operationalZones: (this.scenario as any).operationalZones ?? [],
      // Quality metrics (REQ-8)
      qualityMetrics: this.cachedQualityMetrics ?? undefined,
      // Decision chain log
      decisionChains: this.decisionChains.length > 0 ? this.decisionChains : undefined,
      // EO allocation quality (REQ-10)
      eoAllocationQuality: this.cachedEoAllocationQuality ?? undefined,
      // Before/after EO comparison aggregate (REQ-9)
      beforeAfterAggregate: this.getBeforeAfterComparison().aggregate,
      // FOV overlap detection (REQ-6)
      fovOverlaps: this.fovOverlaps,
      // Multi-target bearing association (REQ-6)
      bearingAssociations: this.bearingAssociations.filter(a => a.ambiguous || a.confidence < 1.0),
      // Multi-sensor 3D resolutions (REQ-6)
      multiSensorResolutions: this.multiSensorResolutions,
      // Search mode states (REQ-5 Phase B)
      searchModeStates: this.getSearchModeStatus().filter(s => s.active),
      // Convergence states (REQ-5 Phase C)
      convergenceStates: this.getConvergenceStates(),
      // REQ-16: EO management module status
      eoModuleStatus: this.cachedEoModuleStatus ?? undefined,
      // Latency metrics
      latency: this.cachedLatency,
      // System load metrics
      systemLoad: this.cachedSystemLoad,
      // Ballistic estimates
      ballisticEstimates: this.cachedBallisticEstimates,
      // Connected user counts
      connectedUsers: this.getConnectedUsers(),
      autoLoopEnabled: this.autoLoopEnabled,
    });

    // Separate ground truth broadcast
    const groundTruthTargets = this.getGroundTruth();
    if (groundTruthTargets.length > 0) {
      this.broadcast({
        type: 'groundTruth.update',
        timestamp: Date.now(),
        simTimeSec: this.state.elapsedSec,
        targets: groundTruthTargets,
      });
    }
  }

  private broadcast(msg: Record<string, unknown>): void {
    const json = JSON.stringify(msg);
    for (const client of this.wsClients) {
      try {
        client.send(json);
        this.currentTickWsMessages++;
      } catch {
        this.wsClients.delete(client);
      }
    }
  }

  // ── Ballistic Estimation ─────────────────────────────────────────────

  private updateBallisticEstimates(): void {
    const BALLISTIC_CLASSIFICATIONS = new Set(['missile', 'rocket']);
    const estimates: typeof this.cachedBallisticEstimates = [];

    for (const track of this.state.tracks) {
      if (track.status === 'dropped') continue;
      if (!track.classification || !BALLISTIC_CLASSIFICATIONS.has(track.classification)) continue;
      if (!track.state || !Number.isFinite(track.state.lat) || !Number.isFinite(track.state.lon)) continue;

      const trackId = track.systemTrackId as string;
      let history = this.trackPositionHistory.get(trackId);
      if (!history) {
        history = [];
        this.trackPositionHistory.set(trackId, history);
      }

      const pos = { lat: track.state.lat, lon: track.state.lon, alt: track.state.alt ?? 0, timeSec: this.state.elapsedSec };
      if (history.length === 0 || history[history.length - 1].timeSec < pos.timeSec) {
        history.push(pos);
        if (history.length > LiveEngine.MAX_POSITION_HISTORY) {
          history.shift();
        }
      }

      if (history.length < 3) continue;

      const positions = history.map(h => ({ lat: h.lat, lon: h.lon, altM: h.alt }));
      const timestamps = history.map(h => h.timeSec);

      const launch = estimateLaunchPoint(positions, timestamps);
      const impact = estimateImpactPoint(positions, timestamps);

      estimates.push({
        trackId,
        launchPoint: launch ? { lat: launch.point.lat, lon: launch.point.lon, alt: launch.point.altM, uncertainty2SigmaM: launch.uncertainty2SigmaM } : null,
        impactPoint: impact ? { lat: impact.point.lat, lon: impact.point.lon, alt: impact.point.altM, uncertainty2SigmaM: impact.uncertainty2SigmaM, timeToImpactSec: impact.timeToImpactSec } : null,
      });
    }

    this.cachedBallisticEstimates = estimates;
  }

  // ── Investigation Event Log ──────────────────────────────────────────

  /**
   * Push an investigation event for a specific track (pyrite/audit trail).
   */
  private pushInvestigationEvent(
    trackId: string,
    type: InvestigationEvent['type'],
    sensorId: string,
    details: Record<string, unknown>,
  ): void {
    if (!this.investigationLog.has(trackId)) {
      this.investigationLog.set(trackId, []);
    }
    const log = this.investigationLog.get(trackId)!;
    log.push({
      timestamp: Date.now(),
      simTimeSec: this.state.elapsedSec,
      type,
      sensorId,
      trackId,
      details,
    });
    // Keep last 200 events per track
    if (log.length > 200) {
      this.investigationLog.set(trackId, log.slice(-200));
    }
  }

  /**
   * Get the investigation event log for a specific track.
   */
  getInvestigationLog(trackId: string): InvestigationEvent[] {
    return this.investigationLog.get(trackId) ?? [];
  }

  /**
   * Inject an external observation (e.g. from an ASTERIX feed) directly into
   * the track manager. This bypasses the ScenarioRunner simulation loop and
   * feeds the observation straight into the fusion pipeline.
   */
  injectExternalObservation(obs: SourceObservation): void {
    this.trackManager.processObservation(obs);
    this.state.tracks = this.trackManager.getAllTracks().filter(t => t.status !== 'dropped');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const engine = new LiveEngine();
