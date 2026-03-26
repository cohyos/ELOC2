/**
 * Core EO Target Detector
 *
 * Implements the two-tier staring-EO detection model:
 *
 * 1. **Primary detector mode** — Each staring sensor independently manages
 *    az/el detections. When ≥2 sensors have overlapping detections
 *    (within a correlation gate), the detector triangulates and produces
 *    a 3D EO target that can be promoted to a system track.
 *
 * 2. **Enhanced cueing mode** — When only a single sensor holds a detection
 *    and an existing system track falls near that az/el line, the detection
 *    enhances (cues) the existing track with EO data.
 *
 * Each EO detection is a full az/el measurement (BearingMeasurement),
 * not just azimuth. Elevation is used in both correlation and triangulation.
 */

import type {
  BearingMeasurement,
  Position3D,
  SensorState,
  SystemTrack,
} from '@eloc2/domain';
import type { EoBearingObservation } from '@eloc2/simulator';
import { generateId, bearingDeg } from '@eloc2/shared-utils';
import { triangulateMultiple } from '@eloc2/geometry';
import { ConsistencyEvaluator } from '@eloc2/fusion-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An az/el detection maintained by a single staring sensor. */
export interface EoDetection {
  /** Unique detection ID. */
  detectionId: string;
  /** Sensor that made the detection. */
  sensorId: string;
  /** Sensor position at time of detection. */
  sensorPosition: Position3D;
  /** The az/el measurement. */
  bearing: BearingMeasurement;
  /** Image quality score [0,1]. */
  imageQuality: number;
  /** GT target ID from simulator (for scoring, not used in correlation). */
  targetId: string;
  /** When first detected (ms wall-clock). */
  firstSeen: number;
  /** When last updated (ms wall-clock). */
  lastUpdated: number;
  /** When last updated (simulation seconds) — used for speed-independent pruning. */
  lastUpdatedSimSec: number;
  /** Consecutive update count. */
  updateCount: number;

  // ── Track feedback (from Core EO → Staring Sensor) ──
  /** Associated system track ID (fed back from Core EO after correlation). */
  associatedTrackId?: string;
  /** Angular velocity in az (deg/s) — from consecutive bearing measurements. */
  angularVelocityAzDegPerSec?: number;
  /** Angular velocity in el (deg/s). */
  angularVelocityElDegPerSec?: number;
  /** Predicted az for next tick (from angular velocity). */
  predictedAzDeg?: number;
  /** Predicted el for next tick. */
  predictedElDeg?: number;
}

/** A correlated EO target produced by matching bearings across ≥2 sensors. */
export interface EoTarget3D {
  /** Unique EO target ID. */
  eoTargetId: string;
  /** Contributing detection IDs (one per sensor). */
  detectionIds: string[];
  /** Contributing sensor IDs. */
  sensorIds: string[];
  /** Best DRI tier from contributing detections (for target-ID propagation). */
  bestDriTier?: 'detection' | 'recognition' | 'identification';
  /** Best image quality from contributing detections [0,1]. */
  bestImageQuality: number;
  /** Triangulated 3D position. */
  position: Position3D;
  /** Triangulation quality metrics. */
  intersectionAngleDeg: number;
  missDistanceM: number;
  /** Geometry classification. */
  classification: 'candidate_3d' | 'confirmed_3d';
  /** When created. */
  createdAt: number;
  /** When last updated. */
  lastUpdated: number;
  /** If promoted to a system track, its ID. */
  promotedTrackId: string | null;
}

/**
 * An ambiguous EO candidate — a potential 3D target position that needs
 * consistency validation over multiple cycles before promotion.
 */
export interface AmbiguityCandidate {
  /** Unique candidate ID. */
  candidateId: string;
  /** The bearing group key (sorted sensor IDs) that produced this candidate. */
  groupKey: string;
  /** Triangulated 3D position. */
  position: Position3D;
  /** Triangulation quality. */
  intersectionAngleDeg: number;
  missDistanceM: number;
  /** Contributing detection IDs. */
  detectionIds: string[];
  /** Contributing sensor IDs. */
  sensorIds: string[];
  /** How many cycles this candidate has been tracked. */
  cycleCount: number;
  /** When first created. */
  createdAt: number;
  /** When last updated. */
  lastUpdated: number;
  /** Running consistency score from the evaluator [0,1]. */
  consistencyScore: number;
  /** Whether this candidate has been resolved (promoted or discarded). */
  resolved: boolean;
}

/** Result from a single tick of the core detector. */
export interface CoreDetectorResult {
  /** New 3D targets triangulated this tick. */
  newTargets: EoTarget3D[];
  /** Updated 3D targets (re-triangulated with fresh bearings). */
  updatedTargets: EoTarget3D[];
  /** Targets promoted from ambiguity resolution this tick. */
  resolvedFromAmbiguity: EoTarget3D[];
  /** Single-sensor bearings matched to existing system tracks (enhanced cueing). */
  enhancedCueBearings: Array<{
    detection: EoDetection;
    systemTrackId: string;
    angularDiffDeg: number;
  }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CoreDetectorConfig {
  /** Max angular difference (degrees) for cross-sensor bearing correlation. */
  correlationGateDeg: number;
  /** Max age (ms) of a bearing detection before it's pruned. */
  maxDetectionAgeMs: number;
  /** Min intersection angle (degrees) for usable triangulation. */
  minIntersectionAngleDeg: number;
  /** Max miss distance (meters) for accepting a triangulation. */
  maxMissDistanceM: number;
  /** Angular gate for enhanced cueing fallback (degrees). */
  enhancedCueGateDeg: number;
  /** Min cycles before an ambiguous candidate can be promoted. */
  minCyclesForResolution: number;
  /** Max cycles before an unresolved candidate is escalated/discarded. */
  maxCyclesBeforeEscalation: number;
  /** Consistency score threshold to promote an ambiguous candidate. */
  ambiguityConsistencyThreshold: number;
  /** Miss distance above which a triangulation is flagged ambiguous (meters). */
  ambiguousMissDistanceM: number;
}

const DEFAULT_CONFIG: CoreDetectorConfig = {
  correlationGateDeg: 3.0,
  maxDetectionAgeMs: 15_000,
  minIntersectionAngleDeg: 5.0,
  maxMissDistanceM: 5000,
  enhancedCueGateDeg: 5.0,
  minCyclesForResolution: 3,
  maxCyclesBeforeEscalation: 8,
  ambiguityConsistencyThreshold: 0.6,
  ambiguousMissDistanceM: 3000,
};

// ---------------------------------------------------------------------------
// Core EO Target Detector
// ---------------------------------------------------------------------------

export class CoreEoTargetDetector {
  /** Per-sensor bearing-only detections. Key = sensorId. */
  private sensorDetections = new Map<string, Map<string, EoDetection>>();

  /** Active 3D EO targets. Key = eoTargetId. */
  private eoTargets = new Map<string, EoTarget3D>();

  /** Ambiguous candidates awaiting consistency resolution. Key = candidateId. */
  private ambiguityCandidates = new Map<string, AmbiguityCandidate>();

  /** Consistency evaluator for tracking candidate state across cycles. */
  private consistencyEvaluator = new ConsistencyEvaluator();

  private config: CoreDetectorConfig;

  constructor(config?: Partial<CoreDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Track which detections were updated this tick (for frame-aware matching). */
  private updatedThisTick = new Set<string>();
  private lastIngestTick = -1;

  /**
   * Ingest a bearing observation from a staring sensor.
   *
   * WFOV frame-aware: A staring sensor's 360° MWIR array detects ALL targets
   * in a single frame at 24Hz. When multiple bearings arrive from the same
   * sensor in the same tick, they represent DISTINCT targets in the same frame.
   * We must NOT merge them into the same detection — each bearing gets matched
   * only to detections NOT already updated this tick.
   */
  ingestBearing(obs: EoBearingObservation, sensorPosition: Position3D, simTimeSec?: number): EoDetection {
    const sensorId = obs.sensorId;
    if (!this.sensorDetections.has(sensorId)) {
      this.sensorDetections.set(sensorId, new Map());
    }

    // Reset per-tick tracking when a new tick starts
    const currentTick = simTimeSec ?? -1;
    if (currentTick !== this.lastIngestTick) {
      this.updatedThisTick.clear();
      this.lastIngestTick = currentTick;
    }

    const sensorStore = this.sensorDetections.get(sensorId)!;

    // Try to match to existing detection from same sensor (same target az/el).
    // WFOV frame-aware: skip detections already updated this tick to prevent
    // merging distinct targets from the same 360° frame. However, only skip
    // if the existing detection's bearing is significantly different (>1°),
    // since very close targets may genuinely be the same detection updated.
    const existing = this.findMatchingDetection(
      sensorStore, obs.bearing.azimuthDeg, obs.bearing.elevationDeg,
      this.updatedThisTick,
    );

    if (existing) {
      // Compute angular velocity from consecutive bearing measurements
      const prevAz = existing.bearing.azimuthDeg;
      const prevEl = existing.bearing.elevationDeg;
      const dtSec = (simTimeSec ?? 0) - existing.lastUpdatedSimSec;
      if (dtSec > 0.5 && dtSec < 30) {
        let dAz = obs.bearing.azimuthDeg - prevAz;
        if (dAz > 180) dAz -= 360;
        if (dAz < -180) dAz += 360;
        const dEl = obs.bearing.elevationDeg - prevEl;
        existing.angularVelocityAzDegPerSec = dAz / dtSec;
        existing.angularVelocityElDegPerSec = dEl / dtSec;
        // Predict next bearing position (for improved matching next tick)
        const predictDt = 2; // next EO bearing at ~2s interval (30 steps × 1/15s)
        let predAz = obs.bearing.azimuthDeg + existing.angularVelocityAzDegPerSec * predictDt;
        if (predAz > 360) predAz -= 360;
        if (predAz < 0) predAz += 360;
        existing.predictedAzDeg = predAz;
        existing.predictedElDeg = obs.bearing.elevationDeg + existing.angularVelocityElDegPerSec * predictDt;
      }

      // Update existing detection with new bearing
      existing.bearing = obs.bearing;
      existing.imageQuality = obs.imageQuality;
      existing.lastUpdated = Date.now();
      existing.lastUpdatedSimSec = simTimeSec ?? existing.lastUpdatedSimSec;
      existing.updateCount++;
      this.updatedThisTick.add(existing.detectionId);
      return existing;
    }

    // Create new bearing-only detection
    const detection: EoDetection = {
      detectionId: generateId(),
      sensorId,
      sensorPosition: { ...sensorPosition },
      bearing: obs.bearing,
      imageQuality: obs.imageQuality,
      targetId: obs.targetId,
      firstSeen: Date.now(),
      lastUpdated: Date.now(),
      lastUpdatedSimSec: simTimeSec ?? 0,
      updateCount: 1,
    };

    sensorStore.set(detection.detectionId, detection);
    this.updatedThisTick.add(detection.detectionId);
    return detection;
  }

  /**
   * Run the core detection cycle: correlate bearings across sensors,
   * triangulate overlapping detections, and identify enhanced-cue
   * candidates for single-sensor detections.
   *
   * @param sensors Active staring sensors
   * @param existingTracks Current system tracks (for enhanced cueing fallback)
   */
  processTick(
    sensors: SensorState[],
    existingTracks: SystemTrack[],
    simTimeSec?: number,
  ): CoreDetectorResult {
    const now = Date.now();
    const result: CoreDetectorResult = {
      newTargets: [],
      updatedTargets: [],
      resolvedFromAmbiguity: [],
      enhancedCueBearings: [],
    };

    // 1. Prune stale detections (use sim time if available for speed-independent pruning)
    this.pruneStaleDetections(now, simTimeSec);

    // 2. Collect all live detections across sensors
    const allDetections: EoDetection[] = [];
    for (const sensorStore of this.sensorDetections.values()) {
      for (const det of sensorStore.values()) {
        allDetections.push(det);
      }
    }

    if (allDetections.length === 0) return result;

    // 3. Group detections by target using cross-sensor bearing correlation
    const correlationGroups = this.correlateBearings(allDetections, sensors);

    // 4. Process each correlation group
    const matchedDetectionIds = new Set<string>();

    for (const group of correlationGroups) {
      if (group.length < 2) continue;

      // Ensure detections come from different sensors
      const uniqueSensors = new Set(group.map(d => d.sensorId));
      if (uniqueSensors.size < 2) continue;

      // Mark all as matched
      for (const det of group) {
        matchedDetectionIds.add(det.detectionId);
      }

      // Pick best (most recent) detection per sensor.
      // MHT: If group has many sensors, use spatial sub-grouping to separate
      // overlapping targets that the angular clustering may have merged.
      const bestPerSensor = new Map<string, EoDetection>();
      for (const det of group) {
        const existing = bestPerSensor.get(det.sensorId);
        if (!existing || det.bearing.timestamp > existing.bearing.timestamp) {
          bestPerSensor.set(det.sensorId, det);
        }
      }
      const selected = [...bestPerSensor.values()];
      if (selected.length < 2) continue;

      // Triangulate — with MHT outlier removal for large groups
      let triResult = this.tryTriangulate(selected);

      // MHT: If miss distance is high and we have many sensors,
      // try removing the detection that contributes most to the error.
      // This handles cases where one sensor's bearing points at a different
      // target than the rest of the group.
      if (triResult && selected.length >= 4 && triResult.missDistanceM > 500) {
        let bestSubset = selected;
        let bestMiss = triResult.missDistanceM;

        for (let drop = 0; drop < selected.length; drop++) {
          const subset = selected.filter((_, i) => i !== drop);
          if (subset.length < 2) continue;
          const subTri = this.tryTriangulate(subset);
          if (subTri && subTri.missDistanceM < bestMiss * 0.7) {
            bestMiss = subTri.missDistanceM;
            bestSubset = subset;
          }
        }

        if (bestSubset !== selected) {
          triResult = this.tryTriangulate(bestSubset);
          // Re-select only the subset detections
          // (dropped detection may be from a different target)
        }
      }

      if (!triResult) continue;

      // Check if this group already has an existing EO target
      const existingTarget = this.findExistingTarget(selected);

      if (existingTarget) {
        // Update existing target
        existingTarget.position = triResult.position;
        existingTarget.intersectionAngleDeg = triResult.intersectionAngleDeg;
        existingTarget.missDistanceM = triResult.missDistanceM;
        existingTarget.detectionIds = selected.map(d => d.detectionId);
        existingTarget.sensorIds = [...uniqueSensors];
        existingTarget.lastUpdated = now;
        existingTarget.classification =
          uniqueSensors.size >= 3 && triResult.intersectionAngleDeg > 15
            ? 'confirmed_3d'
            : 'candidate_3d';
        // Update DRI/image quality from latest detections
        const updIq = Math.max(...selected.map(d => d.imageQuality));
        existingTarget.bestImageQuality = updIq;
        existingTarget.bestDriTier = updIq >= 0.8 ? 'identification' : updIq >= 0.5 ? 'recognition' : 'detection';
        result.updatedTargets.push(existingTarget);
      } else {
        // Decide: clear triangulation or ambiguous candidate?
        // With good multi-sensor geometry (pentagon layout), real targets
        // should have miss distance < 1 km. Higher values indicate
        // cross-contaminated groups (bearings from different targets merged).
        // High-elevation targets (>50°) have inherently poor ground-based
        // triangulation geometry — always route through ambiguity.
        const avgElevation = selected.reduce((s, d) => s + Math.abs(d.bearing.elevationDeg), 0) / selected.length;
        // Tighter quality gate for 2-sensor intersections (more prone to false positives)
        const twoSensorMissLimit = uniqueSensors.size <= 2 ? 1500 : this.config.ambiguousMissDistanceM;
        const isAmbiguous = triResult.missDistanceM > twoSensorMissLimit
          || triResult.intersectionAngleDeg < 10
          || (selected.length >= 3 && triResult.missDistanceM > 1000)
          || (uniqueSensors.size <= 2 && triResult.intersectionAngleDeg < 20) // 2-sensor needs better geometry
          || avgElevation > 50;

        if (isAmbiguous) {
          // Route to ambiguity candidate pool for consistency resolution
          const groupKey = [...uniqueSensors].sort().join('+');
          this.addOrUpdateAmbiguityCandidate(
            groupKey, triResult.position, triResult.intersectionAngleDeg,
            triResult.missDistanceM, selected, uniqueSensors, now,
          );
        } else {
          // Temporal consistency gate for low-sensor-count intersections:
          // 2-sensor intersections are noisy — require seeing them twice before
          // creating a real target. 3+ sensor groups are more reliable and
          // create targets immediately.
          if (uniqueSensors.size <= 2) {
            const groupKey = [...uniqueSensors].sort().join('+');
            const existingCandidate = this.findAmbiguityCandidateByGroup(groupKey);
            if (!existingCandidate) {
              this.addOrUpdateAmbiguityCandidate(
                groupKey, triResult.position, triResult.intersectionAngleDeg,
                triResult.missDistanceM, selected, uniqueSensors, now,
              );
              continue; // Wait for next tick confirmation
            }
          }
          // Propagate best image quality from contributing detections
          const bestIq = Math.max(...selected.map(d => d.imageQuality));
          const target: EoTarget3D = {
            eoTargetId: generateId(),
            detectionIds: selected.map(d => d.detectionId),
            sensorIds: [...uniqueSensors],
            position: triResult.position,
            intersectionAngleDeg: triResult.intersectionAngleDeg,
            missDistanceM: triResult.missDistanceM,
            classification:
              uniqueSensors.size >= 3 && triResult.intersectionAngleDeg > 15
                ? 'confirmed_3d'
                : 'candidate_3d',
            bestDriTier: bestIq >= 0.8 ? 'identification' : bestIq >= 0.5 ? 'recognition' : 'detection',
            bestImageQuality: bestIq,
            createdAt: now,
            lastUpdated: now,
            promotedTrackId: null,
          };
          this.eoTargets.set(target.eoTargetId, target);
          result.newTargets.push(target);
        }
      }
    }

    // 5. Resolve ambiguity candidates that have enough cycles
    const resolved = this.resolveAmbiguityCandidates(now);
    for (const target of resolved) {
      this.eoTargets.set(target.eoTargetId, target);
      result.resolvedFromAmbiguity.push(target);
    }

    // 6. For unmatched single-sensor detections → enhanced cueing fallback
    for (const det of allDetections) {
      if (matchedDetectionIds.has(det.detectionId)) continue;

      const match = this.findEnhancedCueMatch(det, existingTracks);
      if (match) {
        result.enhancedCueBearings.push({
          detection: det,
          systemTrackId: match.trackId,
          angularDiffDeg: match.angularDiff,
        });
      }
    }

    return result;
  }

  /** Get all active 3D EO targets. */
  getEoTargets(): EoTarget3D[] {
    return [...this.eoTargets.values()];
  }

  /** Get all bearing-only detections for a sensor. */
  getSensorDetections(sensorId: string): EoDetection[] {
    const store = this.sensorDetections.get(sensorId);
    return store ? [...store.values()] : [];
  }

  /** Get all bearing-only detections across all sensors. */
  getAllDetections(): EoDetection[] {
    const all: EoDetection[] = [];
    for (const store of this.sensorDetections.values()) {
      for (const det of store.values()) {
        all.push(det);
      }
    }
    return all;
  }

  /** Mark an EO target as promoted to a system track.
   *  Also feeds back the track association to all contributing detections,
   *  so staring sensors can use angular velocity prediction for better
   *  detection-to-track continuity.
   */
  markPromoted(eoTargetId: string, systemTrackId: string): void {
    const target = this.eoTargets.get(eoTargetId);
    if (target) {
      target.promotedTrackId = systemTrackId;

      // Feed back track association to contributing detections
      for (const detId of target.detectionIds) {
        for (const store of this.sensorDetections.values()) {
          const det = store.get(detId);
          if (det) {
            det.associatedTrackId = systemTrackId;
          }
        }
      }
    }
  }

  /** Get all active ambiguity candidates (for UI display). */
  getAmbiguityCandidates(): AmbiguityCandidate[] {
    return [...this.ambiguityCandidates.values()].filter(c => !c.resolved);
  }

  /** Reset all state (on scenario reset). */
  reset(): void {
    this.sensorDetections.clear();
    this.eoTargets.clear();
    this.ambiguityCandidates.clear();
    this.consistencyEvaluator.reset();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Find an existing detection from same sensor within the correlation gate
   * using both azimuth and elevation. This prevents duplicate detections
   * from the same sensor for the same target.
   */
  private findMatchingDetection(
    sensorStore: Map<string, EoDetection>,
    azimuthDeg: number,
    elevationDeg: number,
    excludeIds?: Set<string>,
  ): EoDetection | undefined {
    let bestDet: EoDetection | undefined;
    let bestDist = Infinity;

    for (const det of sensorStore.values()) {
      // Skip detections already matched this tick (WFOV frame-aware)
      if (excludeIds?.has(det.detectionId)) continue;

      // Use predicted position if available (angular velocity feedback),
      // otherwise fall back to last measured position.
      // This improves matching for fast-moving targets where the bearing
      // changes significantly between ticks.
      const refAz = det.predictedAzDeg ?? det.bearing.azimuthDeg;
      const refEl = det.predictedElDeg ?? det.bearing.elevationDeg;

      let azDiff = Math.abs(azimuthDeg - refAz);
      if (azDiff > 180) azDiff = 360 - azDiff;
      const elDiff = Math.abs(elevationDeg - refEl);

      // Both az and el must be within the correlation gate
      if (azDiff < this.config.correlationGateDeg && elDiff < this.config.correlationGateDeg) {
        // Pick the closest match (in case multiple detections are within gate)
        const dist = azDiff * azDiff + elDiff * elDiff;
        if (dist < bestDist) {
          bestDist = dist;
          bestDet = det;
        }
      }
    }
    return bestDet;
  }

  /**
   * Correlate bearing detections across different sensors.
   * Two detections from different sensors are correlated if their bearing
   * rays intersect within the correlation gate (projected from sensor positions).
   *
   * Returns groups of correlated detections.
   */
  private correlateBearings(
    detections: EoDetection[],
    _sensors: SensorState[],
  ): EoDetection[][] {
    // Multi-target correlation using angular clustering.
    //
    // Step 1: Group detections by sensor (each sensor may see multiple targets)
    // Step 2: Pick the sensor with the most detections as the reference
    // Step 3: For each reference detection, find the best-matching detection
    //         from every other sensor (by ray intersection quality)
    // Step 4: Each reference detection seeds a target group
    //
    // This avoids the Union-Find transitive merge problem where separate targets
    // get merged because intermediate rays happen to intersect.

    if (detections.length === 0) return [];

    // Group detections by sensor
    const bySensor = new Map<string, EoDetection[]>();
    for (const det of detections) {
      if (!bySensor.has(det.sensorId)) bySensor.set(det.sensorId, []);
      bySensor.get(det.sensorId)!.push(det);
    }

    // Pick reference sensor (most detections = sees the most targets)
    let refSensorId = '';
    let maxDets = 0;
    for (const [sid, dets] of bySensor) {
      if (dets.length > maxDets) { maxDets = dets.length; refSensorId = sid; }
    }

    const refDets = bySensor.get(refSensorId) ?? [];
    if (refDets.length === 0) return [detections]; // fallback: one group

    // For each reference detection, build a target group by finding
    // the best matching detection from each other sensor
    const groups: EoDetection[][] = [];
    const assigned = new Set<string>(); // detection IDs already assigned

    for (const refDet of refDets) {
      const group: EoDetection[] = [refDet];
      assigned.add(refDet.detectionId);

      for (const [sid, dets] of bySensor) {
        if (sid === refSensorId) continue;

        // Find best matching detection from this sensor
        let bestDet: EoDetection | null = null;
        let bestScore = Infinity; // lower = better (miss distance)

        for (const det of dets) {
          if (assigned.has(det.detectionId)) continue;
          if (!this.bearingsCorrelate(refDet, det)) continue;

          // Score by ray intersection quality
          try {
            const triResult = triangulateMultiple(
              [refDet.sensorPosition, det.sensorPosition],
              [refDet.bearing, det.bearing],
            );
            if (triResult.averageMissDistance < bestScore) {
              bestScore = triResult.averageMissDistance;
              bestDet = det;
            }
          } catch {
            // Triangulation failed — skip
          }
        }

        if (bestDet) {
          group.push(bestDet);
          assigned.add(bestDet.detectionId);
        }
      }

      groups.push(group);
    }

    // Collect any unassigned detections as singleton groups
    for (const det of detections) {
      if (!assigned.has(det.detectionId)) {
        groups.push([det]);
      }
    }

    return groups;
  }

  /**
   * Check if two bearing detections from different sensors plausibly
   * point at the same target. Uses simplified ray intersection:
   * compute where the two bearing lines cross, and check that the
   * intersection distance from each sensor is reasonable.
   */
  private bearingsCorrelate(a: EoDetection, b: EoDetection): boolean {
    // Quick angular check: compute expected azimuth from sensor A
    // to the point along sensor B's bearing, and vice versa.
    // If the bearing rays are roughly convergent, they correlate.

    const latA = a.sensorPosition.lat;
    const lonA = a.sensorPosition.lon;
    const latB = b.sensorPosition.lat;
    const lonB = b.sensorPosition.lon;

    // Azimuth from sensor A to sensor B
    const azAtoB = bearingDeg(latA, lonA, latB, lonB);
    // Azimuth from sensor B to sensor A
    const azBtoA = bearingDeg(latB, lonB, latA, lonA);

    // For two bearings to point at the same target, the target must lie
    // on the "same side" relative to the baseline.
    // Check: bearing A should point roughly toward the half-plane
    // that sensor B sees, and vice versa.
    const azA = a.bearing.azimuthDeg;
    const azB = b.bearing.azimuthDeg;

    // Angular difference between bearing A and direction A→B
    let diffA = azA - azAtoB;
    if (diffA > 180) diffA -= 360;
    if (diffA < -180) diffA += 360;

    // Angular difference between bearing B and direction B→A
    let diffB = azB - azBtoA;
    if (diffB > 180) diffB -= 360;
    if (diffB < -180) diffB += 360;

    // For convergent rays: the bearings should point roughly "past" each other
    // (i.e., bearing A is within ~90° of A→B direction, and bearing B is within
    // ~90° of B→A direction, and they converge rather than diverge).
    // A simple test: the sum of angular deviations should indicate convergence.
    // If both bearings point toward the baseline region, they converge.
    if (Math.abs(diffA) > 90 || Math.abs(diffB) > 90) return false;

    // More precise: try a quick triangulation and check miss distance
    try {
      const triResult = triangulateMultiple(
        [a.sensorPosition, b.sensorPosition],
        [a.bearing, b.bearing],
      );
      // Accept if miss distance is within gate and intersection angle is usable
      return triResult.averageMissDistance < this.config.maxMissDistanceM;
    } catch {
      return false;
    }
  }

  /**
   * Attempt triangulation on a set of detections.
   * Returns null if triangulation fails or quality is too low.
   */
  private tryTriangulate(
    detections: EoDetection[],
  ): { position: Position3D; intersectionAngleDeg: number; missDistanceM: number } | null {
    const positions = detections.map(d => d.sensorPosition);
    const bearings = detections.map(d => d.bearing);

    try {
      const result = triangulateMultiple(positions, bearings);

      if (!result.position) return null;

      // Quality gate: intersection angle must be usable
      if (result.intersectionAngleDeg < this.config.minIntersectionAngleDeg) return null;

      // Quality gate: miss distance must be acceptable
      if (result.averageMissDistance > this.config.maxMissDistanceM) return null;

      return {
        position: result.position,
        intersectionAngleDeg: result.intersectionAngleDeg,
        missDistanceM: result.averageMissDistance,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find an existing EO target that involves the same sensors/detections.
   */
  private findExistingTarget(detections: EoDetection[]): EoTarget3D | undefined {
    const detIds = new Set(detections.map(d => d.detectionId));
    for (const target of this.eoTargets.values()) {
      // Match if any detection ID overlaps (same bearing group, same target)
      if (target.detectionIds.some(id => detIds.has(id))) {
        return target;
      }
    }

    // Also match by spatial proximity: triangulate the new group and compare
    // to existing targets. Sensor overlap alone is insufficient because staring
    // sensors cover 360° and would match ALL targets indiscriminately.
    const triResult = this.tryTriangulate(detections);
    if (triResult) {
      // Spatial gate widens for high-altitude targets (BMs move fast and
      // triangulation geometry is weaker at high elevation)
      const altKm = triResult.position.alt / 1000;
      const SPATIAL_GATE_M = altKm > 10 ? 5000 + altKm * 200 : 2500;
      for (const target of this.eoTargets.values()) {
        const dLat = (triResult.position.lat - target.position.lat) * 110540;
        const dLon = (triResult.position.lon - target.position.lon) * 111320 *
          Math.cos(target.position.lat * Math.PI / 180);
        const dAlt = triResult.position.alt - target.position.alt;
        const dist = Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
        if (dist < SPATIAL_GATE_M) {
          return target;
        }
      }
    }
    return undefined;
  }

  /**
   * Enhanced cueing fallback: find the nearest system track to a
   * single-sensor az/el detection.
   * Compares both azimuth and elevation to the track's direction.
   */
  private findEnhancedCueMatch(
    detection: EoDetection,
    tracks: SystemTrack[],
  ): { trackId: string; angularDiff: number } | null {
    const detAz = detection.bearing.azimuthDeg;
    const detEl = detection.bearing.elevationDeg;
    let bestTrackId: string | null = null;
    let bestDiff = Infinity;

    for (const track of tracks) {
      if (track.status === 'dropped') continue;

      // Compute expected azimuth from sensor to track
      const trackAz = bearingDeg(
        detection.sensorPosition.lat,
        detection.sensorPosition.lon,
        track.state.lat,
        track.state.lon,
      );
      let azDiff = Math.abs(detAz - trackAz);
      if (azDiff > 180) azDiff = 360 - azDiff;

      // Compute expected elevation from sensor to track
      const dLat = (track.state.lat - detection.sensorPosition.lat) * 110540;
      const dLon = (track.state.lon - detection.sensorPosition.lon) * 111320 * Math.cos(detection.sensorPosition.lat * Math.PI / 180);
      const horizDist = Math.sqrt(dLat * dLat + dLon * dLon);
      const dAlt = track.state.alt - detection.sensorPosition.alt;
      const expectedEl = Math.atan2(dAlt, horizDist) * (180 / Math.PI);
      const elDiff = Math.abs(detEl - expectedEl);

      // Combined angular distance (RSS of az and el diffs)
      const combinedDiff = Math.sqrt(azDiff * azDiff + elDiff * elDiff);

      if (combinedDiff < bestDiff) {
        bestDiff = combinedDiff;
        bestTrackId = track.systemTrackId as string;
      }
    }

    if (bestTrackId && bestDiff <= this.config.enhancedCueGateDeg) {
      return { trackId: bestTrackId, angularDiff: bestDiff };
    }
    return null;
  }

  /**
   * Remove detections older than maxDetectionAgeMs.
   * Uses simulation time when available for speed-independent pruning during seek/fast-forward.
   * maxDetectionAgeMs = 15s → maxDetectionAgeSec = 15 in sim time.
   */
  private pruneStaleDetections(now: number, simTimeSec?: number): void {
    const maxAgeSec = this.config.maxDetectionAgeMs / 1000; // convert ms to sim seconds

    for (const [sensorId, store] of this.sensorDetections) {
      for (const [detId, det] of store) {
        // Prefer simulation-time-based pruning (speed-independent)
        const staleBySimTime = simTimeSec !== undefined && det.lastUpdatedSimSec > 0 &&
          (simTimeSec - det.lastUpdatedSimSec) > maxAgeSec;
        const staleByWallClock = (now - det.lastUpdated) > this.config.maxDetectionAgeMs;

        if (staleBySimTime || staleByWallClock) {
          store.delete(detId);
        }
      }
      if (store.size === 0) {
        this.sensorDetections.delete(sensorId);
      }
    }

    // Also prune 3D targets whose detections are all gone.
    // Previously, promoted targets were never pruned, causing them to
    // accumulate with stale positions and interfere with spatial matching.
    // Now: prune ALL stale targets regardless of promotion status.
    for (const [targetId, target] of this.eoTargets) {
      const anyAlive = target.detectionIds.some(dId => {
        for (const store of this.sensorDetections.values()) {
          if (store.has(dId)) return true;
        }
        return false;
      });
      if (!anyAlive) {
        this.eoTargets.delete(targetId);
      }
    }

    // Prune resolved or stale ambiguity candidates
    for (const [cId, candidate] of this.ambiguityCandidates) {
      if (candidate.resolved) {
        this.ambiguityCandidates.delete(cId);
        this.consistencyEvaluator.removeTrack(cId);
      } else if (now - candidate.lastUpdated > this.config.maxDetectionAgeMs * 2) {
        this.ambiguityCandidates.delete(cId);
        this.consistencyEvaluator.removeTrack(cId);
      }
    }
  }

  // ── Ambiguity Resolution ──────────────────────────────────────────────

  /**
   * Add or update an ambiguity candidate. Each candidate is tracked by the
   * ConsistencyEvaluator to assess whether it represents a real target.
   */
  /** Find an existing ambiguity candidate by group key */
  private findAmbiguityCandidateByGroup(groupKey: string): AmbiguityCandidate | undefined {
    for (const c of this.ambiguityCandidates.values()) {
      if (c.groupKey === groupKey && !c.resolved) return c;
    }
    return undefined;
  }

  private addOrUpdateAmbiguityCandidate(
    groupKey: string,
    position: Position3D,
    intersectionAngleDeg: number,
    missDistanceM: number,
    detections: EoDetection[],
    sensorIds: Set<string>,
    now: number,
  ): void {
    // Find existing candidate for this bearing group
    let candidate: AmbiguityCandidate | undefined;
    for (const c of this.ambiguityCandidates.values()) {
      if (c.groupKey === groupKey && !c.resolved) {
        candidate = c;
        break;
      }
    }

    if (candidate) {
      // Update existing candidate
      candidate.position = { ...position };
      candidate.intersectionAngleDeg = intersectionAngleDeg;
      candidate.missDistanceM = missDistanceM;
      candidate.detectionIds = detections.map(d => d.detectionId);
      candidate.sensorIds = [...sensorIds];
      candidate.cycleCount++;
      candidate.lastUpdated = now;

      // Evaluate consistency: does this position match the predicted trajectory?
      const evalResult = this.consistencyEvaluator.evaluate(
        candidate.candidateId,
        position,
        undefined, // velocity estimated internally by evaluator
        now,
      );
      if (evalResult) {
        candidate.consistencyScore = evalResult.consistencyScore;
      }
    } else {
      // Create new candidate
      const candidateId = generateId();
      const newCandidate: AmbiguityCandidate = {
        candidateId,
        groupKey,
        position: { ...position },
        intersectionAngleDeg,
        missDistanceM,
        detectionIds: detections.map(d => d.detectionId),
        sensorIds: [...sensorIds],
        cycleCount: 1,
        createdAt: now,
        lastUpdated: now,
        consistencyScore: 0.5,
        resolved: false,
      };
      this.ambiguityCandidates.set(candidateId, newCandidate);

      // Seed the consistency evaluator with initial position
      this.consistencyEvaluator.evaluate(candidateId, position, undefined, now);
    }
  }

  /**
   * Resolve ambiguity candidates that have accumulated enough cycles.
   * Promotes candidates with high consistency; discards those that fail
   * after max cycles.
   *
   * @returns Newly promoted EoTarget3D objects.
   */
  private resolveAmbiguityCandidates(now: number): EoTarget3D[] {
    const promoted: EoTarget3D[] = [];

    // Group candidates by groupKey to handle competing candidates
    const byGroup = new Map<string, AmbiguityCandidate[]>();
    for (const c of this.ambiguityCandidates.values()) {
      if (c.resolved) continue;
      const list = byGroup.get(c.groupKey) ?? [];
      list.push(c);
      byGroup.set(c.groupKey, list);
    }

    for (const [, candidates] of byGroup) {
      // Sort by consistency score descending
      candidates.sort((a, b) => b.consistencyScore - a.consistencyScore);

      const best = candidates[0];
      if (!best) continue;

      if (best.cycleCount >= this.config.minCyclesForResolution
        && best.consistencyScore >= this.config.ambiguityConsistencyThreshold) {
        // Promote the best candidate to a real EO target
        const target: EoTarget3D = {
          eoTargetId: best.candidateId,
          detectionIds: best.detectionIds,
          sensorIds: best.sensorIds,
          position: best.position,
          intersectionAngleDeg: best.intersectionAngleDeg,
          missDistanceM: best.missDistanceM,
          classification: best.sensorIds.length >= 3 && best.intersectionAngleDeg > 15
            ? 'confirmed_3d'
            : 'candidate_3d',
          bestImageQuality: 0.5, // default for ambiguity-resolved targets
          bestDriTier: 'recognition',
          createdAt: best.createdAt,
          lastUpdated: now,
          promotedTrackId: null,
        };
        promoted.push(target);

        // Mark all candidates in this group as resolved
        for (const c of candidates) {
          c.resolved = true;
        }
      } else if (best.cycleCount >= this.config.maxCyclesBeforeEscalation) {
        // Exceeded max cycles without meeting threshold — discard all
        for (const c of candidates) {
          c.resolved = true;
        }
      }
    }

    return promoted;
  }
}
