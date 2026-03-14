import type { EventEnvelope } from '@eloc2/events';
import type {
  EventId,
  Timestamp,
  SystemTrackId,
  SensorId,
  TaskId,
  EoTrackId,
  GroupId,
  CueId,
  QualityLevel,
  ScoreBreakdown,
  GeometryClass,
  GeometryQuality,
} from '@eloc2/domain';
import type { SystemTrackUpdated } from '@eloc2/events';
import type { RegistrationStateUpdated } from '@eloc2/events';
import type { TaskDecided } from '@eloc2/events';
import type { GeometryEstimateUpdated } from '@eloc2/events';
import type { UnresolvedGroupCreated } from '@eloc2/events';
import type { UnresolvedGroupResolved } from '@eloc2/events';

let counter = 0;

function nextId(): string {
  return `id-${++counter}`;
}

function ts(n: number): Timestamp {
  return n as Timestamp;
}

export function resetCounter(): void {
  counter = 0;
}

export function makeSystemTrackUpdated(overrides: {
  systemTrackId?: string;
  sourcesUsed?: string[];
  confidenceChange?: number;
  timestamp?: number;
}): SystemTrackUpdated {
  return {
    eventId: nextId() as EventId,
    eventType: 'system.track.updated',
    timestamp: ts(overrides.timestamp ?? 1000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      systemTrackId: (overrides.systemTrackId ?? 'track-1') as SystemTrackId,
      previousState: { lat: 0, lon: 0, alt: 0 },
      newState: { lat: 1, lon: 1, alt: 1000 },
      fusionMethod: 'weighted',
      sourcesUsed: (overrides.sourcesUsed ?? ['sensor-1']) as SensorId[],
      confidenceChange: overrides.confidenceChange ?? 0.1,
    },
  };
}

export function makeRegistrationStateUpdated(overrides: {
  sensorId?: string;
  spatialQuality?: QualityLevel;
  timingQuality?: QualityLevel;
  fusionSafe?: boolean;
  confidence?: number;
  timestamp?: number;
}): RegistrationStateUpdated {
  return {
    eventId: nextId() as EventId,
    eventType: 'registration.state.updated',
    timestamp: ts(overrides.timestamp ?? 1000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      sensorId: (overrides.sensorId ?? 'sensor-1') as SensorId,
      previousState: undefined,
      newState: {
        sensorId: (overrides.sensorId ?? 'sensor-1') as SensorId,
        spatialBias: { azimuthBiasDeg: 0, elevationBiasDeg: 0, rangeBiasM: 0 },
        clockBias: { offsetMs: 0, driftRateMs: 0 },
        spatialQuality: overrides.spatialQuality ?? 'good',
        timingQuality: overrides.timingQuality ?? 'good',
        biasEstimateAge: 0,
        fusionSafe: overrides.fusionSafe ?? true,
        lastUpdated: ts(overrides.timestamp ?? 1000),
      },
      estimationMethod: 'online',
      confidence: overrides.confidence ?? 0.9,
    },
  };
}

export function makeTaskDecided(overrides: {
  taskId?: string;
  mode?: 'recommended_only' | 'auto_with_veto' | 'manual';
  scoreTotal?: number;
  timestamp?: number;
}): TaskDecided {
  const total = overrides.scoreTotal ?? 5.0;
  return {
    eventId: nextId() as EventId,
    eventType: 'task.decided',
    timestamp: ts(overrides.timestamp ?? 1000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      taskId: (overrides.taskId ?? nextId()) as TaskId,
      sensorId: 'sensor-1' as SensorId,
      systemTrackId: 'track-1' as SystemTrackId,
      scoreBreakdown: {
        threatScore: 1.0,
        uncertaintyReduction: 1.0,
        geometryGain: 1.0,
        operatorIntent: 1.0,
        slewCost: -0.5,
        occupancyCost: -0.5,
        total,
      } as ScoreBreakdown,
      mode: overrides.mode ?? 'auto_with_veto',
      operatorOverride: undefined,
    },
  };
}

export function makeGeometryEstimateUpdated(overrides: {
  estimateId?: string;
  quality?: GeometryQuality;
  classification?: GeometryClass;
  timestamp?: number;
}): GeometryEstimateUpdated {
  return {
    eventId: nextId() as EventId,
    eventType: 'geometry.estimate.updated',
    timestamp: ts(overrides.timestamp ?? 1000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      estimateId: overrides.estimateId ?? nextId(),
      eoTrackIds: ['eo-1' as EoTrackId, 'eo-2' as EoTrackId],
      classification: overrides.classification ?? 'candidate_3d',
      quality: overrides.quality ?? 'acceptable',
      position3D: { lat: 1, lon: 1, alt: 1000 },
      covariance3D: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    },
  };
}

export function makeUnresolvedGroupCreated(overrides: {
  groupId?: string;
  reason?: string;
  timestamp?: number;
}): UnresolvedGroupCreated {
  const groupId = (overrides.groupId ?? nextId()) as GroupId;
  return {
    eventId: nextId() as EventId,
    eventType: 'eo.group.created',
    timestamp: ts(overrides.timestamp ?? 1000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      group: {
        groupId,
        eoTrackIds: ['eo-1' as EoTrackId, 'eo-2' as EoTrackId],
        parentCueId: 'cue-1' as CueId,
        reason: overrides.reason ?? 'split detected',
        createdAt: ts(overrides.timestamp ?? 1000),
        status: 'active',
        resolutionEvent: undefined,
      },
    },
  };
}

export function makeUnresolvedGroupResolved(overrides: {
  groupId: string;
  reason?: string;
  timestamp?: number;
}): UnresolvedGroupResolved {
  return {
    eventId: nextId() as EventId,
    eventType: 'eo.group.resolved',
    timestamp: ts(overrides.timestamp ?? 2000),
    provenance: { source: 'test' },
    sourceReferences: [],
    data: {
      groupId: overrides.groupId as GroupId,
      resolvedTrackIds: ['eo-1' as EoTrackId, 'eo-2' as EoTrackId],
      reason: overrides.reason ?? 'operator confirmed',
    },
  };
}
