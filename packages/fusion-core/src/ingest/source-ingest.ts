import type { SourceObservation, LocalTrack, Timestamp } from '@eloc2/domain';

/**
 * Validate and normalize a raw source observation.
 *
 * - Clamps latitude to [-90, 90]
 * - Normalizes longitude to [-180, 180]
 * - Ensures timestamp is positive
 *
 * Throws if the observation is fundamentally invalid (missing fields).
 */
export function normalizeObservation(raw: SourceObservation): SourceObservation {
  if (!raw.observationId) {
    throw new Error('SourceObservation must have an observationId');
  }
  if (!raw.sensorId) {
    throw new Error('SourceObservation must have a sensorId');
  }
  if (raw.timestamp <= 0) {
    throw new Error('SourceObservation timestamp must be positive');
  }

  const lat = clampLat(raw.position.lat);
  const lon = normalizeLon(raw.position.lon);
  const alt = raw.position.alt;

  return {
    ...raw,
    position: { lat, lon, alt },
    timestamp: raw.timestamp as Timestamp,
  };
}

/**
 * Validate and return a local track. Ensures basic fields are present.
 */
export function ingestLocalTrack(track: LocalTrack): LocalTrack {
  if (!track.localTrackId) {
    throw new Error('LocalTrack must have a localTrackId');
  }
  if (!track.sensorId) {
    throw new Error('LocalTrack must have a sensorId');
  }
  if (track.lastUpdated <= 0) {
    throw new Error('LocalTrack lastUpdated must be positive');
  }

  return track;
}

// ── internal helpers ──────────────────────────────────────────────────────────

function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

function normalizeLon(lon: number): number {
  // Wrap into (-180, 180]
  let normalized = ((lon + 180) % 360) - 180;
  if (normalized <= -180) normalized += 360;
  return normalized;
}
