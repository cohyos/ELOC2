import type { EventEnvelope, SystemTrackUpdated } from '@eloc2/events';

// ---------------------------------------------------------------------------
// Replay fidelity assertion
// ---------------------------------------------------------------------------

export interface ReplayFidelityResult {
  passed: boolean;
  eventsReplayed: number;
  stateMatches: boolean;
  details: string[];
}

/**
 * Validates that replaying events produces the same state as live.
 *
 * Counts events by type, verifies all expected event types are present,
 * and verifies the final track count matches expected.
 */
export function assertReplayFidelity(
  events: EventEnvelope[],
  finalTrackCount: number,
): ReplayFidelityResult {
  const details: string[] = [];

  const eventsReplayed = events.length;

  // Count events by type
  const eventTypeCounts = new Map<string, number>();
  for (const evt of events) {
    eventTypeCounts.set(
      evt.eventType,
      (eventTypeCounts.get(evt.eventType) ?? 0) + 1,
    );
  }

  // Expected event types for a complete scenario
  const expectedTypes = [
    'system.track.updated',
    'registration.state.updated',
    'task.decided',
    'geometry.estimate.updated',
  ];

  const missingTypes: string[] = [];
  for (const t of expectedTypes) {
    if (!eventTypeCounts.has(t)) {
      missingTypes.push(t);
    }
  }

  if (missingTypes.length > 0) {
    details.push(`Missing event types: ${missingTypes.join(', ')}`);
  }

  // Report event type distribution
  for (const [type, count] of eventTypeCounts) {
    details.push(`${type}: ${count} events`);
  }

  // Count unique system tracks from the event stream
  const trackEvents = events.filter(
    (e): e is SystemTrackUpdated => e.eventType === 'system.track.updated',
  );
  const uniqueTracks = new Set(trackEvents.map((e) => e.data.systemTrackId));
  const actualTrackCount = uniqueTracks.size;

  const stateMatches = actualTrackCount === finalTrackCount;

  if (!stateMatches) {
    details.push(
      `Final track count mismatch: expected ${finalTrackCount}, found ${actualTrackCount}`,
    );
  } else {
    details.push(`Final track count matches: ${actualTrackCount}`);
  }

  const passed =
    eventsReplayed > 0 && missingTypes.length === 0 && stateMatches;

  if (passed) {
    details.push('Replay fidelity assertion passed');
  }

  return { passed, eventsReplayed, stateMatches, details };
}
