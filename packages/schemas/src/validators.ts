/**
 * Runtime validation utilities for domain types.
 *
 * These validators perform structural checks on unknown input and return
 * a typed value if the input is valid, or `null` otherwise.
 */

import type { Position3D, Timestamp, SensorId, Covariance3x3 } from "@eloc2/domain";
import type { SourceObservation, SensorFrame } from "@eloc2/domain";
import { normalizeLon } from "@eloc2/shared-utils";

// ── Primitive guards ─────────────────────────────────────────────────────────

/** Check whether a value is a non-empty string. */
export function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.length > 0;
}

/** Check whether a value is a finite positive number. */
export function isPositiveNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

// ── Assertion helper ─────────────────────────────────────────────────────────

/**
 * Assert that a value is neither `undefined` nor `null`.
 *
 * @param val  The value to check.
 * @param name A human-readable name used in the error message.
 * @returns The value, narrowed to exclude `undefined | null`.
 * @throws {Error} If the value is `undefined` or `null`.
 */
export function assertDefined<T>(val: T | undefined | null, name: string): T {
  if (val === undefined || val === null) {
    throw new Error(`Expected "${name}" to be defined, but received ${String(val)}`);
  }
  return val;
}

// ── Domain validators ────────────────────────────────────────────────────────

/**
 * Validate that an unknown value conforms to the Position3D shape.
 *
 * A valid Position3D has numeric `lat`, `lon`, and `alt` fields.
 *
 * @returns The validated Position3D or `null` if invalid.
 */
export function validatePosition3D(obj: unknown): Position3D | null {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return null;
  }

  const record = obj as Record<string, unknown>;

  if (
    typeof record.lat !== "number" ||
    typeof record.lon !== "number" ||
    typeof record.alt !== "number"
  ) {
    return null;
  }

  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !Number.isFinite(record.alt)) {
    return null;
  }

  if (record.lat < -90 || record.lat > 90) {
    return null;
  }

  // Normalize longitude to (-180, 180] instead of rejecting
  const lon = normalizeLon(record.lon);

  return { lat: record.lat, lon, alt: record.alt } as Position3D;
}

/**
 * Validate that an unknown value is a valid Timestamp.
 *
 * A Timestamp is a non-negative finite number representing milliseconds.
 *
 * @returns The validated Timestamp or `null` if invalid.
 */
export function validateTimestamp(val: unknown): Timestamp | null {
  if (typeof val !== "number") {
    return null;
  }

  if (!Number.isFinite(val) || val < 0) {
    return null;
  }

  return val as Timestamp;
}

/**
 * Validate that an unknown value is a valid SensorId.
 *
 * A SensorId is a non-empty string.
 *
 * @returns The validated SensorId or `null` if invalid.
 */
export function validateSensorId(val: unknown): SensorId | null {
  if (!isNonEmptyString(val)) {
    return null;
  }

  return val as SensorId;
}

// ── Covariance validator ────────────────────────────────────────────────────

const VALID_SENSOR_FRAMES: ReadonlySet<string> = new Set(['radar', 'eo', 'c4isr']);

/**
 * Validate that an unknown value is a 3x3 covariance matrix.
 *
 * A valid Covariance3x3 is a 3-element array of 3-element number arrays,
 * all entries finite.
 */
export function validateCovariance3x3(obj: unknown): Covariance3x3 | null {
  if (!Array.isArray(obj) || obj.length !== 3) {
    return null;
  }

  for (const row of obj) {
    if (!Array.isArray(row) || row.length !== 3) {
      return null;
    }
    for (const val of row) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        return null;
      }
    }
  }

  return obj as Covariance3x3;
}

// ── SourceObservation validator ─────────────────────────────────────────────

/**
 * Validate that an unknown value conforms to the SourceObservation shape.
 *
 * This is the primary input boundary validator — all sensor data entering
 * the fusion pipeline should pass through this.
 */
export function validateSourceObservation(obj: unknown): SourceObservation | null {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return null;
  }

  const r = obj as Record<string, unknown>;

  if (!isNonEmptyString(r.observationId)) return null;
  if (!isNonEmptyString(r.sensorId)) return null;

  const ts = validateTimestamp(r.timestamp);
  if (ts === null) return null;

  const pos = validatePosition3D(r.position);
  if (pos === null) return null;

  const cov = validateCovariance3x3(r.covariance);
  if (cov === null) return null;

  if (typeof r.sensorFrame !== 'string' || !VALID_SENSOR_FRAMES.has(r.sensorFrame)) {
    return null;
  }

  return {
    observationId: r.observationId,
    sensorId: r.sensorId as SensorId,
    timestamp: ts,
    position: pos,
    velocity: r.velocity !== undefined && r.velocity !== null ? r.velocity : undefined,
    covariance: cov,
    sensorFrame: r.sensorFrame as SensorFrame,
  } as SourceObservation;
}
