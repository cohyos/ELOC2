import type { SystemTrack, SensorState } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Sub-pixel detection pipeline
// ---------------------------------------------------------------------------

/**
 * Models the sub-pixel detection pipeline for EO sensors.
 *
 * When the target's angular size is SMALLER than the sensor IFOV, only
 * sub-pixel detection is possible. This pipeline extracts:
 *   - Bearing (azimuth/elevation) via centroid fitting
 *   - Signal-to-noise ratio (SNR)
 *   - Kinematic classification hints (constant-velocity vs manoeuvring)
 *
 * In this simplified/simulated model the outputs are derived from the
 * track state and sensor geometry rather than actual image processing.
 */

export interface SubPixelResult {
  trackId: string;
  sensorId: string;
  bearingAzDeg: number;
  bearingElDeg: number;
  snr: number;
  kinematicClass: 'constant_velocity' | 'manoeuvring' | 'hovering' | 'unknown';
  angularSizeMrad: number;
}

/**
 * Simulate sub-pixel detection for a track observed by an EO sensor.
 *
 * @param track  - The system track being observed
 * @param sensor - The observing EO sensor
 * @param targetSizeM - Assumed physical target size in metres (default 10m)
 * @returns SubPixelResult or null if detection not possible
 */
export function runSubPixelDetection(
  track: SystemTrack,
  sensor: SensorState,
  targetSizeM = 10,
): SubPixelResult | null {
  if (!sensor.online || sensor.sensorType !== 'eo') return null;

  // Compute slant range (simplified: great-circle distance in metres)
  const dLat = track.state.lat - sensor.position.lat;
  const dLon = track.state.lon - sensor.position.lon;
  const dAlt = (track.state.alt ?? 0) - (sensor.position.alt ?? 0);
  const groundDistM = Math.sqrt(dLat * dLat + dLon * dLon) * 111_320; // rough deg-to-m
  const slantRangeM = Math.sqrt(groundDistM * groundDistM + dAlt * dAlt);

  if (slantRangeM < 1) return null; // degenerate

  // Angular size in milliradians
  const angularSizeMrad = (targetSizeM / slantRangeM) * 1000;

  // Bearing (azimuth from sensor to track)
  const azRad = Math.atan2(dLon, dLat);
  const azDeg = ((azRad * 180) / Math.PI + 360) % 360;
  const elRad = Math.atan2(dAlt, groundDistM);
  const elDeg = (elRad * 180) / Math.PI;

  // SNR model: inversely proportional to range squared, with some randomisation
  const snrBase = Math.max(0, 40 - 20 * Math.log10(slantRangeM / 10_000));
  const snr = Math.max(1, snrBase);

  // Kinematic classification from velocity
  let kinematicClass: SubPixelResult['kinematicClass'] = 'unknown';
  if (track.velocity) {
    const speed = Math.sqrt(
      track.velocity.vx ** 2 + track.velocity.vy ** 2 + (track.velocity.vz ?? 0) ** 2,
    );
    if (speed < 5) kinematicClass = 'hovering';
    else if (speed < 50) kinematicClass = 'constant_velocity';
    else kinematicClass = 'manoeuvring';
  }

  return {
    trackId: track.systemTrackId as string,
    sensorId: sensor.sensorId as string,
    bearingAzDeg: azDeg,
    bearingElDeg: elDeg,
    snr,
    kinematicClass,
    angularSizeMrad,
  };
}
