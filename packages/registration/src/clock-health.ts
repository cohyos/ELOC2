import type { QualityLevel, SensorId, Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Timestamp record — a received sensor message with timing info
// ---------------------------------------------------------------------------

export interface TimestampRecord {
  sensorId: SensorId;
  timestamp: Timestamp;
  receivedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Clock health assessment
// ---------------------------------------------------------------------------

export interface ClockHealthAssessment {
  offsetMs: number;
  driftRateMs: number;
  quality: QualityLevel;
}

// ---------------------------------------------------------------------------
// assessClockHealth
// ---------------------------------------------------------------------------

/**
 * Assess the clock health of a sensor based on its recent timestamp records.
 *
 * Computes the mean offset between expected and actual inter-arrival times,
 * then classifies quality:
 *   - deviation > 200 ms  → 'unsafe'
 *   - deviation > 50 ms   → 'degraded'
 *   - otherwise            → 'good'
 *
 * Drift rate is estimated as the difference between the last two offset
 * values (simple first-order estimate).  If fewer than 2 records are
 * available the drift rate is 0.
 *
 * @param records           Recent timestamp records for a single sensor,
 *                          ordered by receivedAt ascending.
 * @param expectedIntervalMs  The nominal reporting interval in ms.
 */
export function assessClockHealth(
  records: TimestampRecord[],
  expectedIntervalMs: number,
): ClockHealthAssessment {
  if (records.length === 0) {
    return { offsetMs: 0, driftRateMs: 0, quality: 'good' };
  }

  // Compute per-record offset: difference between sensor timestamp and
  // received-at timestamp.  A perfectly synchronised sensor would have
  // offset ≈ 0.
  const offsets = records.map((r) => (r.receivedAt as number) - (r.timestamp as number));

  // Mean offset
  const meanOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;

  // Drift rate: difference between consecutive offsets normalised to the
  // expected interval.  Use the last two if available.
  let driftRateMs = 0;
  if (offsets.length >= 2) {
    const lastOffset = offsets[offsets.length - 1];
    const prevOffset = offsets[offsets.length - 2];
    driftRateMs = lastOffset - prevOffset;
  }

  // Compute deviation from expected inter-arrival times
  let deviation = Math.abs(meanOffset);

  if (records.length >= 2) {
    // Also consider inter-arrival jitter
    const interArrivals: number[] = [];
    for (let i = 1; i < records.length; i++) {
      const actual =
        (records[i].receivedAt as number) - (records[i - 1].receivedAt as number);
      interArrivals.push(Math.abs(actual - expectedIntervalMs));
    }
    const meanJitter =
      interArrivals.reduce((a, b) => a + b, 0) / interArrivals.length;
    deviation = Math.max(deviation, meanJitter);
  }

  // Classify quality
  let quality: QualityLevel;
  if (deviation > 200) {
    quality = 'unsafe';
  } else if (deviation > 50) {
    quality = 'degraded';
  } else {
    quality = 'good';
  }

  return { offsetMs: meanOffset, driftRateMs, quality };
}
