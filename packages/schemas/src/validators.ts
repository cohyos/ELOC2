/**
 * Runtime validation utilities for domain types.
 *
 * These validators perform structural checks on unknown input and return
 * a typed value if the input is valid, or `null` otherwise.
 */

import type { Position3D, Timestamp, SensorId } from "@eloc2/domain";

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

  if (record.lon < -180 || record.lon > 180) {
    return null;
  }

  return { lat: record.lat, lon: record.lon, alt: record.alt } as Position3D;
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
