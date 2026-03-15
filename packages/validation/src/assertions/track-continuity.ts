import type { EventEnvelope, SystemTrackUpdated } from '@eloc2/events';
import type { SensorId, SystemTrackId } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Track continuity assertion
// ---------------------------------------------------------------------------

export interface TrackContinuityResult {
  passed: boolean;
  trackCount: number;
  spuriousDrops: number;
  idSwitches: number;
  details: string[];
}

/**
 * Validates track number continuity -- no spurious drops or ID switches.
 *
 * A "spurious drop" is a track that goes confirmed -> dropped -> tentative
 * (same source sensors).
 *
 * An "ID switch" is when two tracks share the same source sensor observations
 * but have different system track IDs.
 */
export function assertTrackContinuity(
  events: EventEnvelope[],
  expectedTrackCount: number,
  maxSpuriousDrops: number = 0,
): TrackContinuityResult {
  const details: string[] = [];

  // Filter to system track updated events
  const trackEvents = events.filter(
    (e): e is SystemTrackUpdated => e.eventType === 'system.track.updated',
  );

  // Track the status history per system track ID
  const trackStatusHistory = new Map<
    SystemTrackId,
    { statuses: string[]; sources: SensorId[] }
  >();

  // Track source-set to track-ID mapping for ID switch detection
  const sourceSetToTrackIds = new Map<string, Set<SystemTrackId>>();

  for (const event of trackEvents) {
    const { systemTrackId, sourcesUsed } = event.data;

    // Build status history
    if (!trackStatusHistory.has(systemTrackId)) {
      trackStatusHistory.set(systemTrackId, { statuses: [], sources: [] });
    }
    const entry = trackStatusHistory.get(systemTrackId)!;
    entry.sources = sourcesUsed;

    // Infer status from confidence change:
    // We detect status transitions by examining the event stream.
    // For the assertion, we look at sourceReferences for status hints,
    // but primarily use the presence/absence pattern of the track.
    // Since SystemTrackUpdated doesn't carry status directly, we infer:
    // - confidenceChange > 0 or stable = confirmed/tentative (active)
    // - confidenceChange significantly negative = potential drop

    // Build source-set key for ID switch detection
    const sourceKey = [...sourcesUsed].sort().join(',');
    if (sourceKey) {
      if (!sourceSetToTrackIds.has(sourceKey)) {
        sourceSetToTrackIds.set(sourceKey, new Set());
      }
      sourceSetToTrackIds.get(sourceKey)!.add(systemTrackId);
    }
  }

  const trackCount = trackStatusHistory.size;

  // Detect spurious drops: look for tracks that appear, disappear (no events
  // for a gap), then reappear with same sources. We detect this by finding
  // tracks whose events show a confidence drop followed by a recovery.
  let spuriousDrops = 0;
  for (const [trackId, entry] of trackStatusHistory) {
    const trackEvts = trackEvents.filter(
      (e) => e.data.systemTrackId === trackId,
    );

    // Look for confirmed -> dropped -> tentative pattern via confidence changes
    let wasNegative = false;
    let hadRecovery = false;
    let confirmedSeen = false;

    for (const evt of trackEvts) {
      if (evt.data.confidenceChange > 0) {
        if (wasNegative) {
          hadRecovery = true;
        }
        confirmedSeen = true;
      } else if (evt.data.confidenceChange < -0.5) {
        if (confirmedSeen) {
          wasNegative = true;
        }
      }
    }

    if (wasNegative && hadRecovery) {
      spuriousDrops++;
      details.push(
        `Spurious drop detected on track ${trackId}: confidence dropped then recovered`,
      );
    }
  }

  // Detect ID switches: same source sensors mapped to multiple track IDs
  let idSwitches = 0;
  for (const [sourceKey, trackIds] of sourceSetToTrackIds) {
    if (trackIds.size > 1) {
      idSwitches += trackIds.size - 1;
      details.push(
        `ID switch: sources [${sourceKey}] mapped to ${trackIds.size} track IDs: ${[...trackIds].join(', ')}`,
      );
    }
  }

  // Validate track count
  if (trackCount !== expectedTrackCount) {
    details.push(
      `Expected ${expectedTrackCount} tracks, found ${trackCount}`,
    );
  }

  const passed =
    trackCount === expectedTrackCount &&
    spuriousDrops <= maxSpuriousDrops &&
    idSwitches === 0;

  if (passed) {
    details.push('Track continuity assertion passed');
  }

  return { passed, trackCount, spuriousDrops, idSwitches, details };
}
