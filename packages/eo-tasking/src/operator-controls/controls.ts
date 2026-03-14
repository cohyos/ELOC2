import type { SensorId, TaskId, Timestamp } from '@eloc2/domain';
import type { OperatorOverride } from '../policy/policy-engine.js';

// ---------------------------------------------------------------------------
// Sensor reservation
// ---------------------------------------------------------------------------

interface SensorReservation {
  sensorId: SensorId;
  until: Timestamp;
  operatorId: string;
}

// ---------------------------------------------------------------------------
// OperatorControlsService
// ---------------------------------------------------------------------------

/**
 * Manages operator overrides and sensor reservations for the tasking pipeline.
 * Operators can approve/reject task decisions and reserve sensors for manual use.
 */
export class OperatorControlsService {
  overrides: OperatorOverride[] = [];
  reservations: Map<string, SensorReservation> = new Map();

  /**
   * Approve a task by its composite key (systemTrackId::sensorId).
   */
  approve(taskId: TaskId): void {
    this.overrides.push({
      type: 'approve',
      taskId,
      timestamp: Date.now() as Timestamp,
      operatorId: 'operator',
    });
  }

  /**
   * Reject a task by its composite key (systemTrackId::sensorId).
   */
  reject(taskId: TaskId): void {
    this.overrides.push({
      type: 'reject',
      taskId,
      timestamp: Date.now() as Timestamp,
      operatorId: 'operator',
    });
  }

  /**
   * Reserve a sensor for exclusive manual use.
   *
   * @param sensorId   - The sensor to reserve.
   * @param durationMs - How long to hold the reservation (milliseconds).
   * @param operatorId - The operator making the reservation.
   */
  reserve(sensorId: SensorId, durationMs: number, operatorId: string): void {
    const until = (Date.now() + durationMs) as Timestamp;
    this.reservations.set(sensorId as string, {
      sensorId,
      until,
      operatorId,
    });
    this.overrides.push({
      type: 'reserve',
      sensorId,
      timestamp: Date.now() as Timestamp,
      operatorId,
    });
  }

  /**
   * Check whether a sensor is currently reserved.
   */
  isReserved(sensorId: SensorId, currentTime: Timestamp): boolean {
    const reservation = this.reservations.get(sensorId as string);
    if (!reservation) return false;
    return (currentTime as number) < (reservation.until as number);
  }

  /**
   * Returns a copy of all current overrides.
   */
  getOverrides(): OperatorOverride[] {
    return [...this.overrides];
  }

  /**
   * Removes expired reservations from the reservations map.
   */
  clearExpiredReservations(currentTime: Timestamp): void {
    for (const [key, reservation] of this.reservations.entries()) {
      if ((currentTime as number) >= (reservation.until as number)) {
        this.reservations.delete(key);
      }
    }
  }
}
