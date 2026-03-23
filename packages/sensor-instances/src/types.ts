import type { SensorType, Position3D } from '@eloc2/domain';
import type { SensorMode } from '@eloc2/sensor-bus';

export interface SensorInstanceConfig {
  sensorId: string;
  type: SensorType; // 'radar' | 'eo' | 'c4isr'
  position: Position3D;
  coverage: {
    minAzDeg: number;
    maxAzDeg: number;
    minElDeg: number;
    maxElDeg: number;
    maxRangeM: number;
  };
  fov?: {
    halfAngleHDeg: number;
    halfAngleVDeg: number;
  };
  slewRateDegPerSec?: number;
  maxDetectionRangeM?: number;
  updateIntervalSec: number; // How often this sensor generates observations (1s for radar, 2s for EO, 12s for C4ISR)
}

export interface SensorTickResult {
  sensorId: string;
  simTimeSec: number;
  observationsGenerated: number;
  localTrackCount: number;
  mode: SensorMode;
  online: boolean;
}
