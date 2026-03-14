import type { RegistrationState, SensorId } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Sensor health view types
// ---------------------------------------------------------------------------

export interface SensorHealthView {
  sensors: SensorHealthEntry[];
  timestamp: number;
}

export interface SensorHealthEntry {
  sensorId: SensorId;
  spatialQuality: string;
  timingQuality: string;
  fusionSafe: boolean;
  biasEstimateAge: number;
  spatialBias: { azimuthBiasDeg: number; elevationBiasDeg: number; rangeBiasM: number };
  clockBias: { offsetMs: number; driftRateMs: number };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a read-model projection of sensor registration health from a list
 * of {@link RegistrationState} records.
 */
export function buildSensorHealthView(
  states: RegistrationState[],
): SensorHealthView {
  const sensors: SensorHealthEntry[] = states.map((s) => ({
    sensorId: s.sensorId,
    spatialQuality: s.spatialQuality,
    timingQuality: s.timingQuality,
    fusionSafe: s.fusionSafe,
    biasEstimateAge: s.biasEstimateAge,
    spatialBias: {
      azimuthBiasDeg: s.spatialBias.azimuthBiasDeg,
      elevationBiasDeg: s.spatialBias.elevationBiasDeg,
      rangeBiasM: s.spatialBias.rangeBiasM,
    },
    clockBias: {
      offsetMs: s.clockBias.offsetMs,
      driftRateMs: s.clockBias.driftRateMs,
    },
  }));

  return {
    sensors,
    timestamp: Date.now(),
  };
}
