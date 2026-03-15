import type { EventEnvelope, UnresolvedGroupCreated, UnresolvedGroupResolved } from '@eloc2/events';
import type { GroupId } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Ambiguity handling assertion
// ---------------------------------------------------------------------------

export interface AmbiguityHandlingResult {
  passed: boolean;
  groupsCreated: number;
  groupsResolved: number;
  hiddenAmbiguities: number;
  details: string[];
}

/**
 * Validates that ambiguous groups are exposed, not hidden.
 *
 * UnresolvedGroupCreated events should exist when multi-target scenarios run.
 * Groups should eventually resolve.
 */
export function assertAmbiguityHandling(
  events: EventEnvelope[],
): AmbiguityHandlingResult {
  const details: string[] = [];

  const createdEvents = events.filter(
    (e): e is UnresolvedGroupCreated => e.eventType === 'eo.group.created',
  );

  const resolvedEvents = events.filter(
    (e): e is UnresolvedGroupResolved => e.eventType === 'eo.group.resolved',
  );

  const groupsCreated = createdEvents.length;
  const groupsResolved = resolvedEvents.length;

  // Track which groups were resolved
  const resolvedGroupIds = new Set<GroupId>(
    resolvedEvents.map((e) => e.data.groupId),
  );

  // Find groups that were created but never resolved
  let hiddenAmbiguities = 0;
  for (const evt of createdEvents) {
    const groupId = evt.data.group.groupId;
    if (!resolvedGroupIds.has(groupId)) {
      hiddenAmbiguities++;
      details.push(
        `Group ${groupId} was created but never resolved (reason: ${evt.data.group.reason})`,
      );
    }
  }

  if (groupsCreated === 0) {
    details.push('No UnresolvedGroupCreated events found — ambiguity may be hidden');
  }

  const passed = groupsCreated > 0 && hiddenAmbiguities === 0;

  if (passed) {
    details.push(`All ${groupsCreated} groups were resolved`);
  }

  return { passed, groupsCreated, groupsResolved, hiddenAmbiguities, details };
}
