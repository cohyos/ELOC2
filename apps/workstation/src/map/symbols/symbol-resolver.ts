/**
 * Resolves track/sensor data to the appropriate NATO APP-6D symbol configuration.
 */

import type { SystemTrack, SensorState, TargetClassification } from '@eloc2/domain';
import {
  type Affiliation,
  type TrackType,
  type SensorSymbolType,
  trackSymbolSvg,
  sensorSymbolSvg,
} from './nato-symbols.js';

export interface TrackSymbolResult {
  svgHtml: string;
  size: number;
  color: string;
}

export interface SensorSymbolResult {
  svgHtml: string;
  size: number;
  color: string;
}

// ─── Classification to track type mapping ───────────────────────────────────

function classificationToTrackType(classification?: TargetClassification): TrackType {
  if (!classification) return 'unknown';
  switch (classification) {
    case 'fighter_aircraft':
      return 'fighter';
    case 'civilian_aircraft':
    case 'passenger_aircraft':
    case 'light_aircraft':
      return 'fighter'; // Use airplane silhouette for all fixed-wing
    case 'helicopter':
      return 'helicopter';
    case 'uav':
    case 'small_uav':
    case 'drone':
      return 'uav';
    case 'predator':
    case 'missile':
    case 'rocket':
      return 'missile';
    case 'bird':
    case 'birds':
      return 'unknown';
    case 'ally':
    case 'neutral':
    case 'unknown':
    default:
      return 'unknown';
  }
}

// ─── Status + classification to affiliation mapping ─────────────────────────

function resolveAffiliation(
  status: string,
  classification?: TargetClassification,
): Affiliation {
  // If classified as ally, always friendly
  if (classification === 'ally') return 'assumed_friend';
  // If classified as neutral, use unknown frame
  if (classification === 'neutral') return 'unknown';

  // Map track status to affiliation
  switch (status) {
    case 'confirmed':
      return 'hostile'; // Confirmed tracks are treated as hostile (air defense context)
    case 'tentative':
      return 'unknown';
    case 'dropped':
      return 'pending';
    default:
      return 'pending';
  }
}

// ─── Track status color (matching existing palette) ─────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#ff3333'; // Hostile = red in NATO
    case 'tentative': return '#ffcc00';
    case 'dropped': return '#ff3333';
    default: return '#888888';
  }
}

// ─── Public resolvers ───────────────────────────────────────────────────────

/**
 * Resolve a SystemTrack to its NATO symbol SVG.
 */
export function resolveTrackSymbol(
  track: SystemTrack,
  selected: boolean = false,
  size: number = 24,
): TrackSymbolResult {
  const affiliation = resolveAffiliation(track.status, track.classification);
  const trackType = classificationToTrackType(track.classification);
  const color = statusColor(track.status);

  const svgHtml = trackSymbolSvg({
    size,
    affiliation,
    trackType,
    selected,
    heading: undefined, // Could be derived from velocity if desired
  });

  return { svgHtml, size, color };
}

/**
 * Resolve a SensorState to its NATO symbol SVG.
 */
export function resolveSensorSymbol(
  sensor: SensorState,
  selected: boolean = false,
  size: number = 24,
): SensorSymbolResult {
  let sensorType: SensorSymbolType;
  let color: string;

  switch (sensor.sensorType) {
    case 'radar':
      sensorType = 'radar';
      color = '#4488ff';
      break;
    case 'eo':
      // Distinguish gimbal vs staring by slew rate (0 = staring, >0 = gimbal)
      sensorType = (sensor.gimbal && sensor.gimbal.slewRateDegPerSec > 0) ? 'eo_gimbal' : 'eo_staring';
      color = '#ff8800';
      break;
    case 'c4isr':
      sensorType = 'c4isr';
      color = '#aa44ff';
      break;
    default:
      sensorType = 'radar';
      color = '#888888';
  }

  const svgHtml = sensorSymbolSvg({
    size,
    sensorType,
    selected,
    online: sensor.online,
    color,
  });

  return { svgHtml, size, color };
}
