import type { ThreatProfile } from '../types.js';

/**
 * Drone Swarm Threat — 4 UAVs in diamond formation.
 * Extracted from the drone-swarm scenario.
 *
 * Formation flies inbound, executes a 90-degree turn at t=120s,
 * then splits into two pairs at t=200s.
 */
export const droneSwarmThreat: ThreatProfile = {
  id: 'drone-swarm-threat',
  name: 'UAV Diamond Formation',
  description:
    '4 UAVs in diamond formation (~200 m spacing) fly inbound, execute 90-degree ' +
    'turn at t=120s, then split into pairs at t=200s. Tests close-proximity track ' +
    'discrimination and formation tracking.',
  targets: [
    {
      targetId: 'TGT-DS-1',
      name: 'Diamond Lead',
      description: 'Lead UAV in diamond formation. After split at t=200s, goes southeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.80, lon: 34.80, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        { time: 120, position: { lat: 31.77, lon: 34.80, alt: 1500 } },
        { time: 130, position: { lat: 31.77, lon: 34.81, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        { time: 200, position: { lat: 31.77, lon: 34.87, alt: 1500 } },
        { time: 210, position: { lat: 31.768, lon: 34.88, alt: 1500 }, velocity: { vx: 25, vy: -15, vz: 0 } },
        { time: 300, position: { lat: 31.74, lon: 34.96, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-DS-2',
      name: 'Diamond Left Wing',
      description: 'Left wing UAV in diamond formation. After split at t=200s, goes northeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.7982, lon: 34.798, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        { time: 120, position: { lat: 31.7682, lon: 34.798, alt: 1500 } },
        { time: 130, position: { lat: 31.7682, lon: 34.808, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        { time: 200, position: { lat: 31.7682, lon: 34.868, alt: 1500 } },
        { time: 210, position: { lat: 31.770, lon: 34.878, alt: 1500 }, velocity: { vx: 25, vy: 15, vz: 0 } },
        { time: 300, position: { lat: 31.80, lon: 34.95, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-DS-3',
      name: 'Diamond Right Wing',
      description: 'Right wing UAV in diamond formation. After split at t=200s, goes southeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.7982, lon: 34.802, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        { time: 120, position: { lat: 31.7682, lon: 34.802, alt: 1500 } },
        { time: 130, position: { lat: 31.7682, lon: 34.812, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        { time: 200, position: { lat: 31.7682, lon: 34.872, alt: 1500 } },
        { time: 210, position: { lat: 31.766, lon: 34.882, alt: 1500 }, velocity: { vx: 25, vy: -15, vz: 0 } },
        { time: 300, position: { lat: 31.738, lon: 34.962, alt: 1500 } },
      ],
    },
    {
      targetId: 'TGT-DS-4',
      name: 'Diamond Trail',
      description: 'Trail UAV in diamond formation. After split at t=200s, goes northeast.',
      classification: 'drone',
      startTime: 0,
      waypoints: [
        { time: 0, position: { lat: 31.7964, lon: 34.80, alt: 1500 }, velocity: { vx: 0, vy: -30, vz: 0 } },
        { time: 120, position: { lat: 31.7664, lon: 34.80, alt: 1500 } },
        { time: 130, position: { lat: 31.7664, lon: 34.81, alt: 1500 }, velocity: { vx: 30, vy: 0, vz: 0 } },
        { time: 200, position: { lat: 31.7664, lon: 34.87, alt: 1500 } },
        { time: 210, position: { lat: 31.768, lon: 34.878, alt: 1500 }, velocity: { vx: 25, vy: 15, vz: 0 } },
        { time: 300, position: { lat: 31.798, lon: 34.952, alt: 1500 } },
      ],
    },
  ],
  faults: [
    {
      type: 'azimuth_bias',
      sensorId: 'RADAR-DS-2',
      startTime: 150,
      endTime: 180,
      magnitude: 1.5,
    },
  ],
  operatorActions: [
    {
      type: 'reserve_sensor',
      time: 130,
      sensorId: 'EO-DS-1',
      targetId: 'TGT-DS-1',
    },
  ],
};
