import type {
  SensorType,
  Position3D,
  Velocity3D,
  CoverageArc,
  FieldOfView,
  PolicyMode,
} from '@eloc2/domain';

export interface SensorDefinition {
  sensorId: string;
  type: SensorType;
  position: Position3D;
  coverage: CoverageArc;
  fov?: FieldOfView;  // EO only
  slewRateDegPerSec?: number;  // EO only
}

export interface WaypointDef {
  time: number;  // seconds from scenario start
  position: Position3D;
  velocity?: Velocity3D;
}

export interface TargetDefinition {
  targetId: string;
  name: string;
  description: string;
  waypoints: WaypointDef[];  // linear interpolation between waypoints
  startTime: number;  // seconds from scenario start
}

export interface FaultDefinition {
  type: 'azimuth_bias' | 'clock_drift' | 'sensor_outage';
  sensorId: string;
  startTime: number;
  endTime?: number;
  magnitude?: number;  // degrees for bias, ms for drift
}

export interface OperatorActionDef {
  type: 'reserve_sensor' | 'veto_assignment' | 'approve_task';
  time: number;
  sensorId?: string;
  targetId?: string;
  taskId?: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  policyMode: PolicyMode;
  sensors: SensorDefinition[];
  targets: TargetDefinition[];
  faults: FaultDefinition[];
  operatorActions: OperatorActionDef[];
}
