import type { DeploymentDefinition } from '../types.js';

/**
 * Discovery Squadron — balanced 360° radar coverage with EO investigation capability.
 *
 * 3x 360° radars in a triangle for overlapping coverage,
 * 2x gimbal EO sensors for target investigation,
 * 1x area surveillance radar with extended range.
 * Center point: 31.5°N, 34.8°E
 */
export const discoverySquadron: DeploymentDefinition = {
  id: 'discovery-squadron',
  name: 'Discovery Squadron',
  description:
    'Balanced 360° radar triangle with 2 EO investigation sensors and 1 extended-range ' +
    'surveillance radar. Provides full azimuth coverage around 31.5°N, 34.8°E.',
  sensors: [
    // ── 3x 360° Radar (triangle positions) ──────────────────────────────
    {
      sensorId: 'DS-RADAR-N',
      type: 'radar',
      position: { lat: 31.7, lon: 34.8, alt: 45 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    {
      sensorId: 'DS-RADAR-SW',
      type: 'radar',
      position: { lat: 31.35, lon: 34.6, alt: 60 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },
    {
      sensorId: 'DS-RADAR-SE',
      type: 'radar',
      position: { lat: 31.35, lon: 35.0, alt: 55 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 150_000,
      },
    },

    // ── 2x Gimbal EO (narrow FOV, investigation) ────────────────────────
    {
      sensorId: 'DS-EO-1',
      type: 'eo',
      position: { lat: 31.6, lon: 34.65, alt: 40 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 40_000,
      },
      fov: { halfAngleHDeg: 0.8, halfAngleVDeg: 0.6 },
      slewRateDegPerSec: 60,
    },
    {
      sensorId: 'DS-EO-2',
      type: 'eo',
      position: { lat: 31.4, lon: 34.95, alt: 35 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 40_000,
      },
      fov: { halfAngleHDeg: 0.8, halfAngleVDeg: 0.6 },
      slewRateDegPerSec: 60,
    },

    // ── 1x Area Surveillance Radar (extended range) ─────────────────────
    {
      sensorId: 'DS-SURV-1',
      type: 'radar',
      position: { lat: 31.5, lon: 34.8, alt: 80 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 360,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 200_000,
      },
    },
  ],
};
