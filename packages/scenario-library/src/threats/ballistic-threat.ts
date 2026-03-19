import type { ThreatProfile } from '../types.js';

/**
 * Ballistic Missile Threat — single ballistic target with parabolic trajectory.
 * Extracted from the ballistic scenario.
 */
export const ballisticThreat: ThreatProfile = {
  id: 'ballistic-threat',
  name: 'Ballistic Missile',
  description:
    'Single ballistic target launched from 150 km range with parabolic trajectory. ' +
    'Climbs to 80 km apex then descends rapidly. Tests long-range detection, ' +
    'high-speed tracking, and track maintenance during altitude changes.',
  targets: [
    {
      targetId: 'TGT-BM-1',
      name: 'Ballistic Missile',
      description:
        'Single ballistic target with parabolic trajectory. Launched from 150 km north, ' +
        'climbs to 80 km altitude at apex, then descends rapidly toward defense point.',
      classification: 'missile',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.85, lon: 34.8, alt: 5000 }, velocity: { vx: 0, vy: -1500, vz: 800 } },
        { time: 15, position: { lat: 32.65, lon: 34.8, alt: 25000 }, velocity: { vx: 0, vy: -1200, vz: 600 } },
        { time: 35, position: { lat: 32.35, lon: 34.8, alt: 60000 }, velocity: { vx: 0, vy: -900, vz: 200 } },
        { time: 50, position: { lat: 32.10, lon: 34.8, alt: 80000 }, velocity: { vx: 0, vy: -800, vz: 0 } },
        { time: 70, position: { lat: 31.85, lon: 34.8, alt: 55000 }, velocity: { vx: 0, vy: -1000, vz: -500 } },
        { time: 90, position: { lat: 31.65, lon: 34.8, alt: 25000 }, velocity: { vx: 0, vy: -1500, vz: -1200 } },
        { time: 110, position: { lat: 31.52, lon: 34.8, alt: 5000 }, velocity: { vx: 0, vy: -2000, vz: -1800 } },
        { time: 120, position: { lat: 31.50, lon: 34.8, alt: 100 }, velocity: { vx: 0, vy: -2000, vz: -2000 } },
      ],
    },
  ],
  faults: [
    {
      type: 'sensor_outage',
      sensorId: 'RADAR-BM-2',
      startTime: 40,
      endTime: 55,
    },
  ],
};
