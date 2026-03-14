/**
 * Simple UUID v4 generator backed by the Node.js crypto module.
 */

import { randomUUID } from "node:crypto";

/**
 * Generate a random UUID v4 string.
 *
 * @returns A string of the form `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
 */
export function generateId(): string {
  return randomUUID();
}
