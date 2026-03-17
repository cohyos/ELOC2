import type {
  GeometryClass,
  PolicyMode,
  Position3D,
  ScoreBreakdown,
  SensorId,
  SystemTrackId,
  TaskId,
} from '@eloc2/domain';
import { bearingDeg, generateId } from '@eloc2/shared-utils';
import type { TaskDecision } from '../policy/policy-engine.js';

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/** A concrete assignment of a sensor to a task. */
export interface Assignment {
  taskId: TaskId;
  sensorId: SensorId;
  systemTrackId: SystemTrackId;
  scoreBreakdown: ScoreBreakdown;
  mode: PolicyMode;
}

// ---------------------------------------------------------------------------
// Coordination options
// ---------------------------------------------------------------------------

/** Options for multi-sensor coordination during assignment. */
export interface CoordinationOptions {
  /** Existing assignments or active EO tasks: sensorId → trackId mapping. */
  activeEoTasks?: Map<string, string>;
  /** Sensor positions keyed by sensorId. */
  sensorPositions?: Map<string, Position3D>;
  /** Geometry classification per track (from triangulation results). */
  trackGeometryClass?: Map<string, GeometryClass>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the intersection angle at the track between bearings from two sensors.
 *
 * Returns the angle in degrees (0–180) formed at `trackPos` between the
 * lines of sight from `sensor1Pos` and `sensor2Pos`.
 */
export function computeIntersectionAngle(
  sensor1Pos: Position3D,
  sensor2Pos: Position3D,
  trackPos: Position3D,
): number {
  // Bearing from track to each sensor
  const bearing1 = bearingDeg(trackPos.lat, trackPos.lon, sensor1Pos.lat, sensor1Pos.lon);
  const bearing2 = bearingDeg(trackPos.lat, trackPos.lon, sensor2Pos.lat, sensor2Pos.lon);

  // Absolute angular difference, clamped to 0–180
  let diff = Math.abs(bearing1 - bearing2);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Get the list of sensor IDs currently executing EO tasks for a given track.
 */
export function getActiveObservingEoSensors(
  trackId: string,
  activeEoTasks: Map<string, string>,
): string[] {
  const result: string[] = [];
  for (const [sensorId, assignedTrackId] of activeEoTasks) {
    if (assignedTrackId === trackId) {
      result.push(sensorId);
    }
  }
  return result;
}

/**
 * Compute the coordination bonus for a candidate sensor–track pair.
 *
 * If another EO sensor is already observing the same track, we boost or
 * penalise based on the intersection angle at the track.
 */
function coordinationBonus(
  candidateSensorId: string,
  trackId: string,
  trackPos: Position3D,
  opts: CoordinationOptions,
): number {
  if (!opts.activeEoTasks || !opts.sensorPositions) return 0;

  const partners = getActiveObservingEoSensors(trackId, opts.activeEoTasks);
  if (partners.length === 0) return 0;

  const candidatePos = opts.sensorPositions.get(candidateSensorId);
  if (!candidatePos) return 0;

  let best = 0;
  for (const partnerId of partners) {
    if (partnerId === candidateSensorId) continue;
    const partnerPos = opts.sensorPositions.get(partnerId);
    if (!partnerPos) continue;

    const angle = computeIntersectionAngle(candidatePos, partnerPos, trackPos);

    let bonus: number;
    if (angle > 45) bonus = 3.0;
    else if (angle > 30) bonus = 1.0;
    else if (angle >= 10) bonus = 0;
    else bonus = -1.0;

    if (bonus > best) best = bonus;
  }

  return best;
}

/**
 * Compute a revisit priority adjustment based on the track's geometry class.
 */
function geometryPriorityBoost(
  trackId: string,
  opts: CoordinationOptions,
): number {
  if (!opts.trackGeometryClass) return 0;
  const cls = opts.trackGeometryClass.get(trackId);
  if (!cls) return 0;
  if (cls === 'bearing_only') return 2.0;
  if (cls === 'confirmed_3d') return -1.0;
  return 0; // candidate_3d → no adjustment
}

// ---------------------------------------------------------------------------
// Assigner
// ---------------------------------------------------------------------------

/**
 * Greedy assignment: sorts approved decisions by total score descending
 * (with coordination and geometry adjustments), then assigns each sensor
 * to at most one task (the highest-scored one).
 *
 * @param decisions - Task decisions from the policy engine.
 * @param mode - Policy mode label.
 * @param coordOpts - Optional multi-sensor coordination options.
 * @returns An array of assignments (one per sensor maximum).
 */
export function assignTasks(
  decisions: TaskDecision[],
  mode: PolicyMode = 'auto_with_veto',
  coordOpts: CoordinationOptions = {},
): Assignment[] {
  // Only consider approved decisions
  const approved = decisions.filter((d) => d.approved);

  // Build effective scores with coordination & geometry adjustments
  const scored = approved.map((d) => {
    const trackId = d.candidate.systemTrackId as string;
    const sensorId = d.candidate.sensorId as string;
    const trackPos = d.candidate.systemTrack.state;

    const coordBonus = coordinationBonus(sensorId, trackId, trackPos, coordOpts);
    const geomBoost = geometryPriorityBoost(trackId, coordOpts);
    const effectiveTotal = d.score.total + coordBonus + geomBoost;

    return { decision: d, effectiveTotal };
  });

  // Sort by effective total score descending
  scored.sort((a, b) => b.effectiveTotal - a.effectiveTotal);

  const assignedSensors = new Set<string>();
  const assignments: Assignment[] = [];

  for (const { decision } of scored) {
    const sensorKey = decision.candidate.sensorId as string;

    if (assignedSensors.has(sensorKey)) {
      continue; // sensor already assigned
    }

    assignedSensors.add(sensorKey);
    assignments.push({
      taskId: generateId() as TaskId,
      sensorId: decision.candidate.sensorId,
      systemTrackId: decision.candidate.systemTrackId,
      scoreBreakdown: decision.score,
      mode,
    });
  }

  return assignments;
}
