import { describe, it, expect } from 'vitest';
import type { SensorId, Timestamp } from '@eloc2/domain';
import { assessClockHealth } from '../clock-health.js';
import type { TimestampRecord } from '../clock-health.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  sensorTimestamp: number,
  receivedAt: number,
  sensorId = 'radar-1' as SensorId,
): TimestampRecord {
  return {
    sensorId,
    timestamp: sensorTimestamp as Timestamp,
    receivedAt: receivedAt as Timestamp,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assessClockHealth', () => {
  it('should report good quality when timestamps match expected interval', () => {
    const baseTime = 1000;
    const interval = 100; // 100ms expected interval
    const records: TimestampRecord[] = [
      makeRecord(baseTime, baseTime),
      makeRecord(baseTime + interval, baseTime + interval),
      makeRecord(baseTime + interval * 2, baseTime + interval * 2),
      makeRecord(baseTime + interval * 3, baseTime + interval * 3),
    ];

    const result = assessClockHealth(records, interval);

    expect(result.quality).toBe('good');
    expect(Math.abs(result.offsetMs)).toBeLessThan(1);
  });

  it('should report degraded quality when offset > 50ms', () => {
    const baseTime = 1000;
    const interval = 100;
    // Sensor timestamps are 80ms behind received-at times
    const records: TimestampRecord[] = [
      makeRecord(baseTime, baseTime + 80),
      makeRecord(baseTime + interval, baseTime + interval + 80),
      makeRecord(baseTime + interval * 2, baseTime + interval * 2 + 80),
    ];

    const result = assessClockHealth(records, interval);

    expect(result.quality).toBe('degraded');
    expect(result.offsetMs).toBeCloseTo(80, 0);
  });

  it('should report unsafe quality when offset > 200ms', () => {
    const baseTime = 1000;
    const interval = 100;
    // Sensor timestamps are 300ms behind received-at times
    const records: TimestampRecord[] = [
      makeRecord(baseTime, baseTime + 300),
      makeRecord(baseTime + interval, baseTime + interval + 300),
      makeRecord(baseTime + interval * 2, baseTime + interval * 2 + 300),
    ];

    const result = assessClockHealth(records, interval);

    expect(result.quality).toBe('unsafe');
    expect(result.offsetMs).toBeCloseTo(300, 0);
  });

  it('should compute drift rate from consecutive offsets', () => {
    const baseTime = 1000;
    const interval = 100;
    // Offset increases by 10ms each record: 0, 10, 20, 30
    const records: TimestampRecord[] = [
      makeRecord(baseTime, baseTime),
      makeRecord(baseTime + interval, baseTime + interval + 10),
      makeRecord(baseTime + interval * 2, baseTime + interval * 2 + 20),
      makeRecord(baseTime + interval * 3, baseTime + interval * 3 + 30),
    ];

    const result = assessClockHealth(records, interval);

    // Drift rate = last offset (30) - second-to-last offset (20) = 10
    expect(result.driftRateMs).toBeCloseTo(10, 0);
  });

  it('should return good quality for empty records', () => {
    const result = assessClockHealth([], 100);

    expect(result.quality).toBe('good');
    expect(result.offsetMs).toBe(0);
    expect(result.driftRateMs).toBe(0);
  });

  it('should report unsafe quality when inter-arrival jitter exceeds 200ms', () => {
    const baseTime = 1000;
    const interval = 100;
    // Normal offset but wildly irregular inter-arrival times
    const records: TimestampRecord[] = [
      makeRecord(baseTime, baseTime),
      makeRecord(baseTime + interval, baseTime + interval + 300), // arrived 300ms late
      makeRecord(baseTime + interval * 2, baseTime + interval * 2),
    ];

    const result = assessClockHealth(records, interval);

    expect(result.quality).toBe('unsafe');
  });
});
