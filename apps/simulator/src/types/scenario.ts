/**
 * Scenario definition types for the ELOC2 simulator.
 * These will eventually move to @eloc2/scenario-library.
 */

import type {
  Position3D,
  Velocity3D,
  SensorType,
  CoverageArc,
  FieldOfView,
  TargetClassification,
} from '@eloc2/domain';

export interface WaypointDef {
  time: number;
  position: Position3D;
  velocity?: Velocity3D;
}

export interface TargetDefinition {
  targetId: string;
  name: string;
  description: string;
  waypoints: WaypointDef[];
  startTime: number;
  classification?: TargetClassification;
  rcs?: number;  // Radar Cross Section in m² (overrides TARGET_RCS lookup)
}

export interface SensorDefinition {
  sensorId: string;
  type: SensorType;
  position: Position3D;
  coverage: CoverageArc;
  fov?: FieldOfView;
  slewRateDegPerSec?: number;
  maxDetectionRangeM?: number;  // EO only — max detection range in meters
}

export interface FaultDefinition {
  type: 'azimuth_bias' | 'clock_drift' | 'sensor_outage';
  sensorId: string;
  startTime: number;
  endTime?: number;
  magnitude?: number;
}

export interface OperatorActionDef {
  type: 'reserve_sensor' | 'veto_assignment' | 'approve_task';
  time: number;
  sensorId?: string;
  targetId?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  policyMode: string;
  sensors: SensorDefinition[];
  targets: TargetDefinition[];
  faults: FaultDefinition[];
  operatorActions: OperatorActionDef[];
  seed?: number;          // Random seed for deterministic replay
  center?: { lat: number; lon: number };  // Geographic center point
}
