import type { SensorState, SystemTrack, SensorId, SystemTrackId } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Task candidate
// ---------------------------------------------------------------------------

/** A pairing of a system track with an EO sensor for potential tasking. */
export interface TaskCandidate {
  systemTrackId: SystemTrackId;
  sensorId: SensorId;
  systemTrack: SystemTrack;
  sensorState: SensorState;
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/**
 * Generates task candidates by pairing each eligible system track with each
 * online EO sensor.
 *
 * A track is eligible when:
 * - Its status is not 'dropped'
 * - Its eoInvestigationStatus is not 'confirmed'
 *
 * A sensor is eligible when:
 * - Its sensorType is 'eo'
 * - It is online
 */
export function generateCandidates(
  systemTracks: SystemTrack[],
  sensorStates: SensorState[],
): TaskCandidate[] {
  const eligibleTracks = systemTracks.filter(
    (t) => t.status !== 'dropped' && t.eoInvestigationStatus !== 'confirmed',
  );

  // Only investigator EO sensors (with gimbal slew capability) can be cued.
  // Staring sensors (slewRate === 0) are fixed-pointing and cannot be tasked.
  const eligibleSensors = sensorStates.filter(
    (s) =>
      s.sensorType === 'eo' &&
      s.online &&
      (s.gimbal?.slewRateDegPerSec ?? 0) > 0,
  );

  const candidates: TaskCandidate[] = [];

  for (const track of eligibleTracks) {
    for (const sensor of eligibleSensors) {
      candidates.push({
        systemTrackId: track.systemTrackId,
        sensorId: sensor.sensorId,
        systemTrack: track,
        sensorState: sensor,
      });
    }
  }

  return candidates;
}
