import type {
  SensorType,
  Position3D,
  Velocity3D,
  CoverageArc,
  FieldOfView,
  PolicyMode,
  TargetClassification,
  CoverZone,
  OperationalZone,
  WeatherCondition,
  ClutterZone,
} from '@eloc2/domain';

export interface SensorDefinition {
  sensorId: string;
  type: SensorType;
  position: Position3D;
  coverage: CoverageArc;
  fov?: FieldOfView;  // EO only
  slewRateDegPerSec?: number;  // EO only
  maxDetectionRangeM?: number;  // EO only — max detection range in meters
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
  classification?: TargetClassification;
  rcs?: number;  // Radar Cross Section in m² (overrides TARGET_RCS lookup)
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
  coverZones?: CoverZone[];
  operationalZones?: OperationalZone[];
  seed?: number;          // Random seed for deterministic replay
  center?: { lat: number; lon: number };  // Geographic center point
  weather?: WeatherCondition;             // Environmental conditions
  clutterZones?: ClutterZone[];           // Radar clutter zones for false alarms
}

export interface DeploymentDefinition {
  id: string;
  name: string;
  description: string;
  sensors: SensorDefinition[];
}

// ── Composition Types ────────────────────────────────────────────────────────

export interface ThreatProfile {
  id: string;
  name: string;
  description: string;
  targets: TargetDefinition[];
  faults?: FaultDefinition[];
  operatorActions?: OperatorActionDef[];
}

export interface WeatherProfile {
  id: string;
  name: string;
  visibility_km: number;      // EO range modifier
  rain_mm_hr: number;         // Radar clutter modifier
  cloud_ceiling_ft: number;   // Altitude-dependent detection
  fog: boolean;               // Heavy EO degradation
}

/** Compose a scenario from deployment + threat + weather */
export function composeScenario(
  deployment: DeploymentDefinition,
  threat: ThreatProfile,
  weather?: WeatherProfile,
  options?: { durationSec?: number; seed?: number; center?: { lat: number; lon: number } },
): ScenarioDefinition {
  // Determine duration: explicit option > max target end time > 60s minimum
  let durationSec = options?.durationSec ?? 0;
  if (!durationSec) {
    for (const t of threat.targets) {
      const lastWp = t.waypoints[t.waypoints.length - 1];
      const endTime = t.startTime + (lastWp?.time ?? 0);
      if (endTime > durationSec) durationSec = endTime;
    }
    // Add 10% buffer, minimum 60s
    durationSec = Math.max(60, Math.ceil(durationSec * 1.1));
  }

  const composedId = `${deployment.id}--${threat.id}${weather ? `--${weather.id}` : ''}`;
  const weatherNote = weather
    ? ` Weather: ${weather.name} (vis ${weather.visibility_km} km, rain ${weather.rain_mm_hr} mm/hr).`
    : '';

  // Convert WeatherProfile to WeatherCondition for sensor models
  const weatherCondition: WeatherCondition | undefined = weather
    ? {
        visibilityKm: weather.fog ? 0.5 : weather.visibility_km,
        rainMmHr: weather.rain_mm_hr,
        cloudCeilingFt: weather.cloud_ceiling_ft,
        windSpeedKts: 10,
      }
    : undefined;

  return {
    id: composedId,
    name: `${deployment.name} + ${threat.name}`,
    description:
      `Composed scenario: ${deployment.description} | ${threat.description}${weatherNote}`,
    durationSec,
    policyMode: 'auto_with_veto',
    sensors: deployment.sensors,
    targets: threat.targets,
    faults: threat.faults ?? [],
    operatorActions: threat.operatorActions ?? [],
    seed: options?.seed,
    center: options?.center,
    weather: weatherCondition,
  };
}
