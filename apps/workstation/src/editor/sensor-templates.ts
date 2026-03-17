export const SENSOR_TEMPLATES = {
  'long-range-radar': {
    type: 'radar' as const,
    azMin: 0,
    azMax: 360,
    elMin: -5,
    elMax: 85,
    rangeMaxKm: 200,
  },
  'short-range-radar': {
    type: 'radar' as const,
    azMin: 0,
    azMax: 360,
    elMin: -5,
    elMax: 60,
    rangeMaxKm: 80,
  },
  'eo-turret': {
    type: 'eo' as const,
    azMin: 0,
    azMax: 360,
    elMin: -5,
    elMax: 85,
    rangeMaxKm: 30,
    fovHalfAngleH: 2.5,
    fovHalfAngleV: 1.8,
    slewRateDegSec: 30,
  },
  'eo-fixed': {
    type: 'eo' as const,
    azMin: 0,
    azMax: 360,
    elMin: -5,
    elMax: 85,
    rangeMaxKm: 20,
    fovHalfAngleH: 5.0,
    fovHalfAngleV: 3.0,
    slewRateDegSec: 0,
  },
  'c4isr-node': {
    type: 'c4isr' as const,
    azMin: 0,
    azMax: 360,
    elMin: -5,
    elMax: 85,
    rangeMaxKm: 500,
  },
} as const;

export type SensorTemplateName = keyof typeof SENSOR_TEMPLATES;

export const SENSOR_TEMPLATE_LABELS: Record<SensorTemplateName, string> = {
  'long-range-radar': 'Long-Range Radar',
  'short-range-radar': 'Short-Range Radar',
  'eo-turret': 'EO Turret (Steerable)',
  'eo-fixed': 'EO Fixed (Wide FOV)',
  'c4isr-node': 'C4ISR Node',
};
