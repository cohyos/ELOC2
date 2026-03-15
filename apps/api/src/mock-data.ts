import type {
  SystemTrack,
  SystemTrackId,
  SensorId,
  SensorState,
  Task,
  TaskId,
  CueId,
  GeometryEstimate,
  EoTrackId,
  Timestamp,
  RegistrationState,
} from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ts = (offset = 0): Timestamp => (Date.now() - offset) as Timestamp;
const stId = (id: string) => id as SystemTrackId;
const senId = (id: string) => id as SensorId;
const taskId = (id: string) => id as TaskId;
const cueId = (id: string) => id as CueId;
const eoId = (id: string) => id as EoTrackId;

// ---------------------------------------------------------------------------
// Sensors — realistic positions in central Israel
// ---------------------------------------------------------------------------

export const mockSensors: SensorState[] = [
  {
    sensorId: senId('RADAR-1'),
    sensorType: 'radar',
    position: { lat: 31.0, lon: 34.5, alt: 220 },
    gimbal: undefined,
    fov: undefined,
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 60, maxRangeM: 200_000 },
    online: true,
    lastUpdateTime: ts(),
  },
  {
    sensorId: senId('RADAR-2'),
    sensorType: 'radar',
    position: { lat: 32.0, lon: 34.8, alt: 45 },
    gimbal: undefined,
    fov: undefined,
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 60, maxRangeM: 180_000 },
    online: true,
    lastUpdateTime: ts(),
  },
  {
    sensorId: senId('EO-1'),
    sensorType: 'eo',
    position: { lat: 31.0, lon: 34.5, alt: 220 },
    gimbal: {
      azimuthDeg: 45,
      elevationDeg: 12,
      slewRateDegPerSec: 30,
      currentTargetId: stId('ST-001'),
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 85, maxRangeM: 50_000 },
    online: true,
    lastUpdateTime: ts(),
  },
  {
    sensorId: senId('EO-2'),
    sensorType: 'eo',
    position: { lat: 31.3, lon: 34.8, alt: 180 },
    gimbal: {
      azimuthDeg: 320,
      elevationDeg: 8,
      slewRateDegPerSec: 30,
      currentTargetId: stId('ST-002'),
    },
    fov: { halfAngleHDeg: 1.5, halfAngleVDeg: 1.0 },
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 85, maxRangeM: 50_000 },
    online: true,
    lastUpdateTime: ts(),
  },
  {
    sensorId: senId('EO-3'),
    sensorType: 'eo',
    position: { lat: 31.5, lon: 34.3, alt: 350 },
    gimbal: {
      azimuthDeg: 90,
      elevationDeg: 15,
      slewRateDegPerSec: 30,
      currentTargetId: undefined,
    },
    fov: { halfAngleHDeg: 2.0, halfAngleVDeg: 1.5 },
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -5, maxElDeg: 85, maxRangeM: 45_000 },
    online: true,
    lastUpdateTime: ts(),
  },
  {
    sensorId: senId('C4ISR-1'),
    sensorType: 'c4isr',
    position: { lat: 31.8, lon: 34.7, alt: 0 },
    gimbal: undefined,
    fov: undefined,
    coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: 0, maxElDeg: 90, maxRangeM: 500_000 },
    online: true,
    lastUpdateTime: ts(),
  },
];

// ---------------------------------------------------------------------------
// System tracks — realistic air picture over central Israel
// ---------------------------------------------------------------------------

export const mockTracks: SystemTrack[] = [
  {
    systemTrackId: stId('ST-001'),
    state: { lat: 31.4, lon: 34.9, alt: 8500 },
    velocity: { vx: -120, vy: 80, vz: 0 },
    covariance: [[100, 0, 0], [0, 100, 0], [0, 0, 50]],
    confidence: 0.92,
    status: 'confirmed',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(60000), parentTrackIds: [], description: 'Radar-1 initial detection' },
      { version: 2, event: 'correlation.decided', timestamp: ts(45000), parentTrackIds: [], description: 'Correlated with RADAR-2 observation' },
      { version: 3, event: 'eo.report.received', timestamp: ts(10000), parentTrackIds: [], description: 'EO-1 confirmed — fixed-wing aircraft' },
    ],
    lastUpdated: ts(2000),
    sources: [senId('RADAR-1'), senId('RADAR-2'), senId('EO-1')],
    eoInvestigationStatus: 'confirmed',
  },
  {
    systemTrackId: stId('ST-002'),
    state: { lat: 31.8, lon: 34.4, alt: 5200 },
    velocity: { vx: 60, vy: -40, vz: -5 },
    covariance: [[200, 0, 0], [0, 200, 0], [0, 0, 100]],
    confidence: 0.78,
    status: 'confirmed',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(90000), parentTrackIds: [], description: 'RADAR-2 initial detection' },
      { version: 2, event: 'eo.cue.issued', timestamp: ts(70000), parentTrackIds: [], description: 'EO cue issued to EO-2' },
    ],
    lastUpdated: ts(5000),
    sources: [senId('RADAR-2'), senId('EO-2')],
    eoInvestigationStatus: 'in_progress',
  },
  {
    systemTrackId: stId('ST-003'),
    state: { lat: 31.2, lon: 35.1, alt: 12000 },
    velocity: { vx: -200, vy: 50, vz: 0 },
    covariance: [[400, 0, 0], [0, 400, 0], [0, 0, 200]],
    confidence: 0.55,
    status: 'tentative',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(15000), parentTrackIds: [], description: 'RADAR-1 initial detection — tentative' },
    ],
    lastUpdated: ts(8000),
    sources: [senId('RADAR-1')],
    eoInvestigationStatus: 'pending',
  },
  {
    systemTrackId: stId('ST-004'),
    state: { lat: 32.1, lon: 34.6, alt: 3000 },
    velocity: { vx: 30, vy: 20, vz: -2 },
    covariance: [[150, 0, 0], [0, 150, 0], [0, 0, 80]],
    confidence: 0.85,
    status: 'confirmed',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(120000), parentTrackIds: [], description: 'C4ISR-1 external track report' },
      { version: 2, event: 'correlation.decided', timestamp: ts(100000), parentTrackIds: [], description: 'Correlated with RADAR-2 observation' },
    ],
    lastUpdated: ts(3000),
    sources: [senId('C4ISR-1'), senId('RADAR-2')],
    eoInvestigationStatus: 'none',
  },
  {
    systemTrackId: stId('ST-005'),
    state: { lat: 30.8, lon: 34.7, alt: 6800 },
    velocity: { vx: -80, vy: -60, vz: 3 },
    covariance: [[600, 0, 0], [0, 600, 0], [0, 0, 300]],
    confidence: 0.42,
    status: 'tentative',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(20000), parentTrackIds: [], description: 'RADAR-1 detection — low confidence' },
    ],
    lastUpdated: ts(12000),
    sources: [senId('RADAR-1')],
    eoInvestigationStatus: 'pending',
  },
  {
    systemTrackId: stId('ST-006'),
    state: { lat: 31.6, lon: 35.2, alt: 9500 },
    velocity: { vx: -150, vy: -20, vz: 0 },
    covariance: [[300, 0, 0], [0, 300, 0], [0, 0, 150]],
    confidence: 0.35,
    status: 'dropped',
    lineage: [
      { version: 1, event: 'source.observation.reported', timestamp: ts(300000), parentTrackIds: [], description: 'RADAR-1 initial detection' },
      { version: 2, event: 'system.track.updated', timestamp: ts(180000), parentTrackIds: [], description: 'Track dropped — no updates in 120s' },
    ],
    lastUpdated: ts(180000),
    sources: [senId('RADAR-1')],
    eoInvestigationStatus: 'no_support',
  },
];

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const mockTasks: Task[] = [
  {
    taskId: taskId('TASK-001'),
    cueId: cueId('CUE-001'),
    sensorId: senId('EO-1'),
    systemTrackId: stId('ST-001'),
    status: 'completed',
    scoreBreakdown: {
      threatScore: 0.8,
      uncertaintyReduction: 0.7,
      geometryGain: 0.65,
      operatorIntent: 0.5,
      slewCost: 0.1,
      occupancyCost: 0.05,
      total: 0.82,
    },
    policyMode: 'auto_with_veto',
    operatorOverride: undefined,
    createdAt: ts(70000),
    completedAt: ts(10000),
  },
  {
    taskId: taskId('TASK-002'),
    cueId: cueId('CUE-002'),
    sensorId: senId('EO-2'),
    systemTrackId: stId('ST-002'),
    status: 'executing',
    scoreBreakdown: {
      threatScore: 0.6,
      uncertaintyReduction: 0.8,
      geometryGain: 0.55,
      operatorIntent: 0.4,
      slewCost: 0.2,
      occupancyCost: 0.1,
      total: 0.71,
    },
    policyMode: 'auto_with_veto',
    operatorOverride: undefined,
    createdAt: ts(30000),
    completedAt: undefined,
  },
  {
    taskId: taskId('TASK-003'),
    cueId: cueId('CUE-003'),
    sensorId: senId('EO-3'),
    systemTrackId: stId('ST-003'),
    status: 'proposed',
    scoreBreakdown: {
      threatScore: 0.5,
      uncertaintyReduction: 0.9,
      geometryGain: 0.7,
      operatorIntent: 0.3,
      slewCost: 0.15,
      occupancyCost: 0.08,
      total: 0.68,
    },
    policyMode: 'recommended_only',
    operatorOverride: undefined,
    createdAt: ts(5000),
    completedAt: undefined,
  },
];

// ---------------------------------------------------------------------------
// Geometry estimates
// ---------------------------------------------------------------------------

export const mockGeometryEstimates: Map<string, GeometryEstimate> = new Map([
  ['ST-001', {
    estimateId: 'GEO-001',
    eoTrackIds: [eoId('EOT-001'), eoId('EOT-002')],
    position3D: { lat: 31.4, lon: 34.9, alt: 8500 },
    covariance3D: [[50, 0, 0], [0, 50, 0], [0, 0, 30]],
    quality: 'strong',
    classification: 'confirmed_3d',
    intersectionAngleDeg: 42,
    timeAlignmentQualityMs: 12,
    bearingNoiseDeg: 0.15,
  }],
  ['ST-002', {
    estimateId: 'GEO-002',
    eoTrackIds: [eoId('EOT-003')],
    position3D: undefined,
    covariance3D: undefined,
    quality: 'weak',
    classification: 'bearing_only',
    intersectionAngleDeg: 0,
    timeAlignmentQualityMs: 45,
    bearingNoiseDeg: 0.3,
  }],
  ['ST-003', {
    estimateId: 'GEO-003',
    eoTrackIds: [eoId('EOT-004'), eoId('EOT-005')],
    position3D: { lat: 31.2, lon: 35.1, alt: 12000 },
    covariance3D: [[300, 0, 0], [0, 300, 0], [0, 0, 200]],
    quality: 'acceptable',
    classification: 'candidate_3d',
    intersectionAngleDeg: 25,
    timeAlignmentQualityMs: 30,
    bearingNoiseDeg: 0.22,
  }],
]);

// ---------------------------------------------------------------------------
// Registration states
// ---------------------------------------------------------------------------

export const mockRegistrationStates: RegistrationState[] = [
  {
    sensorId: senId('RADAR-1'),
    spatialBias: { azimuthBiasDeg: 0.02, elevationBiasDeg: 0.01, rangeBiasM: 15 },
    clockBias: { offsetMs: 2, driftRateMs: 0.001 },
    spatialQuality: 'good',
    timingQuality: 'good',
    biasEstimateAge: 5000,
    fusionSafe: true,
    lastUpdated: ts(),
  },
  {
    sensorId: senId('RADAR-2'),
    spatialBias: { azimuthBiasDeg: 0.05, elevationBiasDeg: 0.03, rangeBiasM: 25 },
    clockBias: { offsetMs: 5, driftRateMs: 0.002 },
    spatialQuality: 'good',
    timingQuality: 'good',
    biasEstimateAge: 8000,
    fusionSafe: true,
    lastUpdated: ts(),
  },
  {
    sensorId: senId('EO-1'),
    spatialBias: { azimuthBiasDeg: 0.1, elevationBiasDeg: 0.08, rangeBiasM: 0 },
    clockBias: { offsetMs: 3, driftRateMs: 0.001 },
    spatialQuality: 'good',
    timingQuality: 'good',
    biasEstimateAge: 3000,
    fusionSafe: true,
    lastUpdated: ts(),
  },
  {
    sensorId: senId('EO-2'),
    spatialBias: { azimuthBiasDeg: 0.12, elevationBiasDeg: 0.1, rangeBiasM: 0 },
    clockBias: { offsetMs: 8, driftRateMs: 0.003 },
    spatialQuality: 'degraded',
    timingQuality: 'good',
    biasEstimateAge: 15000,
    fusionSafe: true,
    lastUpdated: ts(),
  },
  {
    sensorId: senId('EO-3'),
    spatialBias: { azimuthBiasDeg: 0.08, elevationBiasDeg: 0.06, rangeBiasM: 0 },
    clockBias: { offsetMs: 4, driftRateMs: 0.001 },
    spatialQuality: 'good',
    timingQuality: 'good',
    biasEstimateAge: 6000,
    fusionSafe: true,
    lastUpdated: ts(),
  },
];

// ---------------------------------------------------------------------------
// Scenario state
// ---------------------------------------------------------------------------

export interface ScenarioState {
  running: boolean;
  speed: number;
  startedAt: Timestamp | null;
}

export const scenarioState: ScenarioState = {
  running: false,
  speed: 1,
  startedAt: null,
};

// ---------------------------------------------------------------------------
// Event log for WebSocket streaming
// ---------------------------------------------------------------------------

export interface SimEvent {
  eventType: string;
  timestamp: Timestamp;
  summary: string;
  data: Record<string, unknown>;
}

export function generateSimEvent(): SimEvent {
  const types = [
    { eventType: 'system.track.updated', summary: 'Track ST-001 position updated' },
    { eventType: 'system.track.updated', summary: 'Track ST-002 position updated' },
    { eventType: 'eo.cue.issued', summary: 'EO cue issued for ST-003 to EO-3' },
    { eventType: 'source.observation.reported', summary: 'RADAR-1 observation on ST-001' },
    { eventType: 'source.observation.reported', summary: 'RADAR-2 observation on ST-004' },
    { eventType: 'registration.state.updated', summary: 'EO-2 registration updated' },
    { eventType: 'geometry.estimate.updated', summary: 'Geometry estimate GEO-001 refined' },
    { eventType: 'task.decided', summary: 'TASK-003 score recalculated' },
  ];
  const pick = types[Math.floor(Math.random() * types.length)];
  return {
    eventType: pick.eventType,
    timestamp: Date.now() as Timestamp,
    summary: pick.summary,
    data: {},
  };
}
