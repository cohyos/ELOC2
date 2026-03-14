import type { UnresolvedGroup } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A hypothesis entry within the ambiguity view (simplified projection). */
export interface AmbiguityHypothesis {
  eoTrackId: string;
  probability: number;
}

/** A single entry in the ambiguity view. */
export interface AmbiguityViewEntry {
  groupId: string;
  eoTrackIds: string[];
  parentCueId: string;
  status: 'active' | 'resolved';
  hypotheses: AmbiguityHypothesis[];
  createdAt: number;
}

/** Aggregated view of unresolved groups and their ambiguity state. */
export interface AmbiguityView {
  groups: AmbiguityViewEntry[];
  totalUnresolved: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Association hypothesis (matches eo-investigation's type shape)
// ---------------------------------------------------------------------------

/** Projection-side mirror of AssociationHypothesis for the builder input. */
export interface AssociationHypothesis {
  hypothesisId: string;
  eoTrackId: string;
  associatedSystemTrackId: string | undefined;
  probability: number;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds a read-model view of unresolved groups and their hypotheses.
 *
 * @param groups      - All known unresolved groups.
 * @param hypotheses  - Map from groupId to the association hypotheses.
 * @param currentTime - The current time in milliseconds since epoch.
 * @returns An AmbiguityView summarising the ambiguity state.
 */
export function buildAmbiguityView(
  groups: UnresolvedGroup[],
  hypotheses: Map<string, AssociationHypothesis[]>,
  currentTime: number,
): AmbiguityView {
  const entries: AmbiguityViewEntry[] = [];
  let totalUnresolved = 0;

  for (const group of groups) {
    const groupHypotheses = hypotheses.get(group.groupId) ?? [];

    const entry: AmbiguityViewEntry = {
      groupId: group.groupId,
      eoTrackIds: group.eoTrackIds as string[],
      parentCueId: group.parentCueId as string,
      status: group.status,
      hypotheses: groupHypotheses.map((h) => ({
        eoTrackId: h.eoTrackId as string,
        probability: h.probability,
      })),
      createdAt: group.createdAt as number,
    };

    entries.push(entry);

    if (group.status === 'active') {
      totalUnresolved++;
    }
  }

  return {
    groups: entries,
    totalUnresolved,
    timestamp: currentTime,
  };
}
