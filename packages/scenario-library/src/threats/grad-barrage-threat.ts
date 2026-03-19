import type { ThreatProfile } from '../types.js';

/**
 * Grad Rocket Barrage Threat — 10 rockets launched simultaneously.
 * Extracted from the grad-barrage scenario.
 *
 * All rockets originate from a single launch point ~40 km north and spread
 * to impact points ~500 m apart in a grid pattern. 60-second flight time.
 */
export const gradBarrageThreat: ThreatProfile = {
  id: 'grad-barrage-threat',
  name: 'Grad Rocket Barrage',
  description:
    '10 rockets launched simultaneously from a single point, spreading toward impact ' +
    'zone with ~500 m spacing. Tests simultaneous track initiation and proliferation handling.',
  targets: (() => {
    const launchLat = 31.86;
    const launchLon = 34.80;
    const launchAlt = 500;
    const impactBaseLat = 31.50;
    const impactBaseLon = 34.80;

    const offsets: Array<[number, number]> = [
      [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
      [-2,  0], [-1,  0], [0,  0], [1,  0], [2,  0],
    ];

    return offsets.map(([dRow, dCol], i) => ({
      targetId: `TGT-GR-${i + 1}`,
      name: `Grad Rocket ${i + 1}`,
      description: `Rocket ${i + 1} of 10 in simultaneous barrage.`,
      classification: 'missile' as const,
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: launchLat, lon: launchLon, alt: launchAlt }, velocity: { vx: 0, vy: -700, vz: 300 } },
        { time: 15, position: { lat: launchLat - 0.09 + dRow * 0.001, lon: launchLon + dCol * 0.001, alt: 12000 } },
        { time: 30, position: { lat: (launchLat + impactBaseLat) / 2 + dRow * 0.002, lon: (launchLon + impactBaseLon) / 2 + dCol * 0.002, alt: 18000 } },
        { time: 45, position: { lat: impactBaseLat + 0.05 + dRow * 0.003, lon: impactBaseLon + dCol * 0.003, alt: 8000 } },
        { time: 60, position: { lat: impactBaseLat + dRow * 0.0045, lon: impactBaseLon + dCol * 0.005, alt: 200 } },
      ],
    }));
  })(),
  faults: [
    {
      type: 'clock_drift',
      sensorId: 'EO-GR-2',
      startTime: 20,
      magnitude: 80,
    },
  ],
};
