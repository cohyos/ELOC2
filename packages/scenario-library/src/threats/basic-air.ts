import type { ThreatProfile } from '../types.js';

/**
 * Basic Air Threat — 3 aircraft targets at varying altitudes and speeds.
 * Extracted from the central-israel scenario (TGT-1, TGT-2, TGT-3).
 */
export const basicAir: ThreatProfile = {
  id: 'basic-air',
  name: 'Basic Air Threat',
  description:
    '3 aircraft targets: straight inbound, turning approach, and fast high-altitude. ' +
    'Tests basic track initiation, maneuvering target tracking, and speed diversity.',
  targets: [
    {
      targetId: 'TGT-1',
      name: 'Straight Inbound North',
      description: 'Straight-line inbound from north at 8 000 m altitude.',
      classification: 'civilian_aircraft',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 32.5, lon: 34.6, alt: 8000 }, velocity: { vx: 0, vy: -130, vz: 0 } },
        { time: 450, position: { lat: 32.0, lon: 34.6, alt: 8000 } },
        { time: 900, position: { lat: 31.5, lon: 34.6, alt: 8000 } },
      ],
    },
    {
      targetId: 'TGT-2',
      name: 'NE Inbound with Turn',
      description: 'Approaches from NE, turns west at T+200 s. 6 000 m altitude.',
      classification: 'fighter_aircraft',
      startTime: 30,
      waypoints: [
        { time: 0, position: { lat: 32.3, lon: 35.2, alt: 6000 }, velocity: { vx: -80, vy: -100, vz: 0 } },
        { time: 170, position: { lat: 31.8, lon: 34.8, alt: 6000 } },
        { time: 200, position: { lat: 31.75, lon: 34.75, alt: 6000 } },
        { time: 500, position: { lat: 31.7, lon: 34.2, alt: 6000 }, velocity: { vx: -120, vy: 0, vz: 0 } },
        { time: 870, position: { lat: 31.7, lon: 33.6, alt: 6000 } },
      ],
    },
    {
      targetId: 'TGT-3',
      name: 'Fast High-Altitude',
      description: 'Fast target from north at 300 m/s, 12 000 m altitude.',
      classification: 'fighter_aircraft',
      startTime: 60,
      waypoints: [
        { time: 0, position: { lat: 32.8, lon: 34.6, alt: 12000 }, velocity: { vx: 0, vy: -300, vz: 0 } },
        { time: 420, position: { lat: 31.6, lon: 34.6, alt: 12000 } },
        { time: 840, position: { lat: 30.4, lon: 34.6, alt: 12000 } },
      ],
    },
  ],
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-2',
      startTime: 400,
      magnitude: 2,
    },
  ],
};
