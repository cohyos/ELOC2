import { describe, it, expect, beforeEach } from 'vitest';
import { assertAmbiguityHandling } from '../src/assertions/ambiguity-handling.js';
import {
  makeUnresolvedGroupCreated,
  makeUnresolvedGroupResolved,
  resetCounter,
} from './helpers.js';

describe('assertAmbiguityHandling', () => {
  beforeEach(() => resetCounter());

  it('passes when all created groups are resolved', () => {
    const events = [
      makeUnresolvedGroupCreated({ groupId: 'g1', timestamp: 1000 }),
      makeUnresolvedGroupCreated({ groupId: 'g2', timestamp: 1500 }),
      makeUnresolvedGroupResolved({ groupId: 'g1', timestamp: 2000 }),
      makeUnresolvedGroupResolved({ groupId: 'g2', timestamp: 2500 }),
    ];

    const result = assertAmbiguityHandling(events);
    expect(result.passed).toBe(true);
    expect(result.groupsCreated).toBe(2);
    expect(result.groupsResolved).toBe(2);
    expect(result.hiddenAmbiguities).toBe(0);
  });

  it('fails when a group is created but never resolved', () => {
    const events = [
      makeUnresolvedGroupCreated({ groupId: 'g1', timestamp: 1000 }),
      makeUnresolvedGroupCreated({ groupId: 'g2', timestamp: 1500 }),
      makeUnresolvedGroupResolved({ groupId: 'g1', timestamp: 2000 }),
    ];

    const result = assertAmbiguityHandling(events);
    expect(result.passed).toBe(false);
    expect(result.hiddenAmbiguities).toBe(1);
  });

  it('fails when no groups are created (ambiguity may be hidden)', () => {
    const result = assertAmbiguityHandling([]);
    expect(result.passed).toBe(false);
    expect(result.groupsCreated).toBe(0);
    expect(result.details).toContain(
      'No UnresolvedGroupCreated events found — ambiguity may be hidden',
    );
  });

  it('handles multiple groups with same reason', () => {
    const events = [
      makeUnresolvedGroupCreated({ groupId: 'g1', reason: 'split detected' }),
      makeUnresolvedGroupCreated({ groupId: 'g2', reason: 'split detected' }),
      makeUnresolvedGroupResolved({ groupId: 'g1' }),
      makeUnresolvedGroupResolved({ groupId: 'g2' }),
    ];

    const result = assertAmbiguityHandling(events);
    expect(result.passed).toBe(true);
    expect(result.groupsCreated).toBe(2);
    expect(result.groupsResolved).toBe(2);
  });
});
