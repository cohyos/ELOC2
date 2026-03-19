import type { DeploymentDefinition } from '../types.js';

/**
 * Border Line — linear sensor fence facing east along longitude 34.8°E.
 *
 * 5x sector-coverage sensors in a north-south line,
 * 2x probe-mounted EO sensors (mobile, shorter range),
 * 1x regional radar with 180° sector coverage.
 * Positions along longitude 34.8°E from lat 31.3 to 31.7.
 */
export const borderLine: DeploymentDefinition = {
  id: 'border-line',
  name: 'Border Line',
  description:
    'Linear sensor fence along 34.8°E from lat 31.3–31.7, facing east with 120° sector coverage. ' +
    'Includes 2 mobile EO probes and 1 regional 180° radar.',
  sensors: [
    // ── 5x Sector-coverage sensors (120° facing east, azimuth 30–150°) ──
    {
      sensorId: 'BL-SECTOR-1',
      type: 'radar',
      position: { lat: 31.3, lon: 34.8, alt: 30 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 100_000,
      },
    },
    {
      sensorId: 'BL-SECTOR-2',
      type: 'radar',
      position: { lat: 31.4, lon: 34.8, alt: 35 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 100_000,
      },
    },
    {
      sensorId: 'BL-SECTOR-3',
      type: 'radar',
      position: { lat: 31.5, lon: 34.8, alt: 40 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 100_000,
      },
    },
    {
      sensorId: 'BL-SECTOR-4',
      type: 'radar',
      position: { lat: 31.6, lon: 34.8, alt: 45 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 100_000,
      },
    },
    {
      sensorId: 'BL-SECTOR-5',
      type: 'radar',
      position: { lat: 31.7, lon: 34.8, alt: 50 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 100_000,
      },
    },

    // ── 2x Probe-mounted EO sensors (mobile, shorter range) ─────────────
    {
      sensorId: 'BL-EO-PROBE-1',
      type: 'eo',
      position: { lat: 31.45, lon: 34.8, alt: 10 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 20_000,
      },
      fov: { halfAngleHDeg: 1.2, halfAngleVDeg: 0.9 },
      slewRateDegPerSec: 45,
    },
    {
      sensorId: 'BL-EO-PROBE-2',
      type: 'eo',
      position: { lat: 31.55, lon: 34.8, alt: 10 },
      coverage: {
        minAzDeg: 30,
        maxAzDeg: 150,
        minElDeg: -5,
        maxElDeg: 90,
        maxRangeM: 20_000,
      },
      fov: { halfAngleHDeg: 1.2, halfAngleVDeg: 0.9 },
      slewRateDegPerSec: 45,
    },

    // ── 1x Regional radar (180° sector, extended range) ─────────────────
    {
      sensorId: 'BL-REGIONAL-1',
      type: 'radar',
      position: { lat: 31.5, lon: 34.8, alt: 70 },
      coverage: {
        minAzDeg: 0,
        maxAzDeg: 180,
        minElDeg: 0,
        maxElDeg: 90,
        maxRangeM: 180_000,
      },
    },
  ],
};
