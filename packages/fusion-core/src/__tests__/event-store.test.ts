import { describe, it, expect, beforeEach } from 'vitest';
import type { Timestamp } from '@eloc2/domain';
import { createEventEnvelope } from '@eloc2/events';
import type { EventEnvelope } from '@eloc2/events';
import { EventStore } from '../replay/event-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  eventType: string,
  timestamp: number,
  sourceRefs: string[] = [],
): EventEnvelope {
  const envelope = createEventEnvelope(eventType, 'test-source');
  return {
    ...envelope,
    timestamp: timestamp as Timestamp,
    sourceReferences: sourceRefs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  it('should start empty', () => {
    expect(store.size()).toBe(0);
    expect(store.getAll()).toEqual([]);
  });

  it('should append events and return them in order', () => {
    const e1 = makeEvent('correlation.decided', 1000);
    const e2 = makeEvent('system.track.updated', 2000);

    store.append(e1);
    store.append(e2);

    expect(store.size()).toBe(2);
    const all = store.getAll();
    expect(all[0].eventType).toBe('correlation.decided');
    expect(all[1].eventType).toBe('system.track.updated');
  });

  describe('queryByTimeWindow', () => {
    it('should return events within the time window (inclusive)', () => {
      store.append(makeEvent('a', 1000));
      store.append(makeEvent('b', 2000));
      store.append(makeEvent('c', 3000));
      store.append(makeEvent('d', 4000));

      const result = store.queryByTimeWindow(2000 as Timestamp, 3000 as Timestamp);
      expect(result.length).toBe(2);
      expect(result[0].eventType).toBe('b');
      expect(result[1].eventType).toBe('c');
    });

    it('should return empty array when no events match', () => {
      store.append(makeEvent('a', 1000));
      const result = store.queryByTimeWindow(5000 as Timestamp, 6000 as Timestamp);
      expect(result.length).toBe(0);
    });
  });

  describe('queryByTrackId', () => {
    it('should return events that reference the given track ID', () => {
      store.append(makeEvent('a', 1000, ['track-1', 'obs-1']));
      store.append(makeEvent('b', 2000, ['track-2', 'obs-2']));
      store.append(makeEvent('c', 3000, ['track-1', 'obs-3']));

      const result = store.queryByTrackId('track-1');
      expect(result.length).toBe(2);
      expect(result[0].eventType).toBe('a');
      expect(result[1].eventType).toBe('c');
    });

    it('should return empty array when track ID not referenced', () => {
      store.append(makeEvent('a', 1000, ['track-1']));
      const result = store.queryByTrackId('track-99');
      expect(result.length).toBe(0);
    });
  });

  describe('queryByType', () => {
    it('should return events of the given type', () => {
      store.append(makeEvent('correlation.decided', 1000));
      store.append(makeEvent('system.track.updated', 2000));
      store.append(makeEvent('correlation.decided', 3000));

      const result = store.queryByType('correlation.decided');
      expect(result.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all events', () => {
      store.append(makeEvent('a', 1000));
      store.append(makeEvent('b', 2000));
      expect(store.size()).toBe(2);

      store.clear();
      expect(store.size()).toBe(0);
      expect(store.getAll()).toEqual([]);
    });
  });
});
