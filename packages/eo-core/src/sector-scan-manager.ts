/**
 * SectorScanManager — manages sector threat scanning with assigned EO investigators.
 *
 * The operator defines a threat sector (azimuth start/end) and assigns 1-3
 * EO investigators. The manager:
 *   1. Divides the sector equally among assigned scanners
 *   2. Issues SearchPatternCommands to each scanner for its sub-sector
 *   3. On detection — selects the best-geometry investigator for triangulation
 *   4. TRI runs along the detector's bearing ray to self-detect the target,
 *      then EO CORE triangulates from two bearings (no radar dependency)
 *   5. Multiple detections — TRI hops between them at ~0.5s intervals
 *   6. Continuous triangulation — TRI keeps cycling detections to maintain
 *      track data, never "finishes" until detections expire
 *   7. TRI only releases when zero detections remain across ALL scanners
 *
 * EO video rate: 24 Hz. Dwell per detection: 0.5s (~12 frames).
 *
 * This is part of EO CORE management.
 */

import type { SensorId, Position3D } from '@eloc2/domain';
import type { SensorBus, BearingReport } from '@eloc2/sensor-bus';
import { generateId } from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectorDefinition {
  /** Sector start azimuth (degrees, 0-360) */
  azimuthStartDeg: number;
  /** Sector end azimuth (degrees, 0-360, can wrap past 360) */
  azimuthEndDeg: number;
  /** Optional elevation bounds */
  elevationMinDeg?: number;
  elevationMaxDeg?: number;
}

export interface SectorScanConfig {
  /** Scan speed in degrees per second (default: 10) */
  scanSpeedDegPerSec: number;
  /**
   * Dwell time per detection before hopping to next (default: 0.5s).
   * At 24 Hz video rate this gives ~12 frames per detection — enough for
   * the TRI to acquire a bearing for triangulation.
   */
  triangulationDwellSec: number;
  /** Minimum imageQuality to treat a bearing as a detection (default: 0.3) */
  detectionConfidenceThreshold: number;
  /** Detection expiry time in seconds (default: 30) */
  detectionExpiryTimeSec: number;
}

export type ScannerRole = 'scanning' | 'triangulating';

export interface ScannerAssignment {
  sensorId: string;
  role: ScannerRole;
  /** Sub-sector assigned for scanning */
  subSectorStart: number;
  subSectorEnd: number;
}

export interface SectorDetection {
  /** Bearing azimuth where detection occurred */
  azimuthDeg: number;
  /** Sensor that detected */
  detectedBySensorId: string;
  /** Sensor position for triangulation cueing */
  sensorPosition: Position3D;
  /** Target ID from bearing report */
  targetId: string;
  /** Simulation time of last detection update */
  detectedAtSec: number;
  /** How many triangulation passes have been completed on this detection */
  triangulationCount: number;
}

export interface SectorScanState {
  /** Unique scan ID */
  scanId: string;
  /** Sector being scanned */
  sector: SectorDefinition;
  /** Assigned investigators */
  scanners: ScannerAssignment[];
  /** Active detections requiring continuous triangulation */
  detections: SectorDetection[];
  /** Whether the scan is actively running */
  active: boolean;
  /** Simulation time when scan started */
  startedAtSec: number;
  /** Current triangulator sensor ID (if any) */
  triangulatorSensorId: string | null;
  /** Index into detections array for hop cycling */
  currentDetectionIndex: number;
  /** Last time the triangulator hopped to a new detection */
  lastHopTimeSec: number;
}

const DEFAULT_CONFIG: SectorScanConfig = {
  scanSpeedDegPerSec: 10,
  triangulationDwellSec: 0.5, // ~12 frames at 24 Hz
  detectionConfidenceThreshold: 0.3,
  detectionExpiryTimeSec: 30,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute angular difference normalized to [-180, 180] */
function angleDiffDeg(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Compute the geometry spread score for a candidate triangulator relative
 * to a detection. Best triangulation geometry is when the angle between
 * the detector→target bearing and the candidate→target bearing approaches 90°.
 * Score ranges from 0 (collinear, worst) to 1 (perpendicular, best).
 */
function geometrySpreadScore(
  detectorPos: Position3D,
  detectionAzDeg: number,
  candidatePos: Position3D,
): number {
  // Bearing from candidate to the estimated detection point
  // Use a rough 5 km estimate along the detection ray from detector
  const rangeM = 5000;
  const azRad = (detectionAzDeg * Math.PI) / 180;
  const estLat = detectorPos.lat + (rangeM * Math.cos(azRad)) / 111_320;
  const estLon = detectorPos.lon + (rangeM * Math.sin(azRad)) /
    (111_320 * Math.cos((detectorPos.lat * Math.PI) / 180));

  // Bearing from candidate to estimated target position
  const dLat = estLat - candidatePos.lat;
  const dLon = (estLon - candidatePos.lon) *
    Math.cos((candidatePos.lat * Math.PI) / 180);
  const candAzDeg = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;

  // Intersection angle = difference between the two bearings
  const intersectionAngle = Math.abs(angleDiffDeg(detectionAzDeg, candAzDeg));

  // Score: 1.0 at 90° (best), 0.0 at 0° or 180° (worst)
  return Math.sin((intersectionAngle * Math.PI) / 180);
}

// ---------------------------------------------------------------------------
// SectorScanManager
// ---------------------------------------------------------------------------

export class SectorScanManager {
  private bus: SensorBus;
  private config: SectorScanConfig;
  private activeScan: SectorScanState | null = null;

  /** Sensor positions needed for geometry scoring — populated by caller */
  private sensorPositions: Map<string, Position3D> = new Map();

  constructor(bus: SensorBus, config?: Partial<SectorScanConfig>) {
    this.bus = bus;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Subscribe to bearing reports to detect targets during scan
    this.bus.onBearingReport((report) => this.handleBearingReport(report));
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start a sector scan with assigned investigators.
   * @param sector - The threat sector to scan
   * @param sensorIds - 1 to 3 EO sensor IDs to assign
   * @param sensorPositions - Position of each sensor (needed for geometry scoring)
   * @param simTimeSec - Current simulation time
   * @returns scanId or null if invalid
   */
  startScan(
    sector: SectorDefinition,
    sensorIds: string[],
    sensorPositions: Map<string, Position3D>,
    simTimeSec: number,
  ): string | null {
    if (sensorIds.length < 1 || sensorIds.length > 3) return null;

    // Store sensor positions
    this.sensorPositions = new Map(sensorPositions);

    // Stop any active scan first
    if (this.activeScan?.active) {
      this.stopScan(simTimeSec);
    }

    const scanId = `SCAN-${generateId().slice(0, 6)}`;

    // Divide sector among scanners
    const scanners = this.divideSector(sector, sensorIds);

    this.activeScan = {
      scanId,
      sector,
      scanners,
      detections: [],
      active: true,
      startedAtSec: simTimeSec,
      triangulatorSensorId: null,
      currentDetectionIndex: 0,
      lastHopTimeSec: 0,
    };

    // Issue search pattern commands to each scanner
    for (const scanner of scanners) {
      this.issueSearchCommand(scanner, simTimeSec);
    }

    return scanId;
  }

  /**
   * Stop the active sector scan. Returns sensors to track mode.
   */
  stopScan(simTimeSec: number): void {
    if (!this.activeScan) return;

    for (const scanner of this.activeScan.scanners) {
      this.bus.sendCommand({
        messageType: 'system.command',
        commandId: generateId(),
        targetSensorId: scanner.sensorId as SensorId,
        simTimeSec,
        command: { type: 'mode', mode: 'track' },
      });
    }

    this.activeScan.active = false;
    this.activeScan = null;
  }

  /**
   * Called every tick to manage triangulation hopping and release logic.
   */
  tick(simTimeSec: number): void {
    if (!this.activeScan?.active) return;

    const scan = this.activeScan;

    // Prune expired detections
    scan.detections = scan.detections.filter(
      (d) => simTimeSec - d.detectedAtSec < this.config.detectionExpiryTimeSec,
    );

    // ── TRI release logic: only release when ZERO detections remain ──
    if (scan.triangulatorSensorId && scan.detections.length === 0) {
      this.releaseTriangulator(simTimeSec);
      return;
    }

    // ── Continuous triangulation: hop to next detection after dwell ──
    if (
      scan.triangulatorSensorId &&
      scan.detections.length > 0 &&
      simTimeSec - scan.lastHopTimeSec >= this.config.triangulationDwellSec
    ) {
      this.hopToNextDetection(simTimeSec);
    }
  }

  /** Get current scan state (for API/WS broadcast). */
  getState(): SectorScanState | null {
    return this.activeScan;
  }

  /** Check if a sector scan is active. */
  isActive(): boolean {
    return this.activeScan?.active ?? false;
  }

  /** Get assigned sensor IDs. */
  getAssignedSensorIds(): string[] {
    if (!this.activeScan) return [];
    return this.activeScan.scanners.map((s) => s.sensorId);
  }

  /** Reset all state */
  reset(): void {
    this.activeScan = null;
    this.sensorPositions.clear();
  }

  // ── Private: Sector Division ────────────────────────────────────────────

  private divideSector(
    sector: SectorDefinition,
    sensorIds: string[],
  ): ScannerAssignment[] {
    let sectorWidth = sector.azimuthEndDeg - sector.azimuthStartDeg;
    if (sectorWidth <= 0) sectorWidth += 360;

    const n = sensorIds.length;
    const subWidth = sectorWidth / n;

    return sensorIds.map((sensorId, i) => {
      let subStart = sector.azimuthStartDeg + i * subWidth;
      let subEnd = sector.azimuthStartDeg + (i + 1) * subWidth;
      subStart = ((subStart % 360) + 360) % 360;
      subEnd = ((subEnd % 360) + 360) % 360;

      return {
        sensorId,
        role: 'scanning' as const,
        subSectorStart: subStart,
        subSectorEnd: subEnd,
      };
    });
  }

  // ── Private: Command Issuance ───────────────────────────────────────────

  private issueSearchCommand(
    scanner: ScannerAssignment,
    simTimeSec: number,
  ): void {
    this.bus.sendCommand({
      messageType: 'system.command',
      commandId: generateId(),
      targetSensorId: scanner.sensorId as SensorId,
      simTimeSec,
      command: {
        type: 'search_pattern',
        pattern: 'sector',
        azimuthStartDeg: scanner.subSectorStart,
        azimuthEndDeg: scanner.subSectorEnd,
        scanSpeedDegPerSec: this.config.scanSpeedDegPerSec,
      },
    });
  }

  /**
   * Cue the triangulator to look along the detector's bearing ray.
   * The TRI slews its gimbal to the detection azimuth so it can
   * self-detect the target from its own position — giving EO CORE
   * two independent bearings for triangulation.
   */
  private cueTriangulatorToRay(
    detection: SectorDetection,
    simTimeSec: number,
  ): void {
    const scan = this.activeScan!;
    if (!scan.triangulatorSensorId) return;

    // The TRI needs to look along the *detector's bearing ray* from its
    // own position. Estimate target position along that ray at ~5 km.
    const rangeM = 5000;
    const azRad = (detection.azimuthDeg * Math.PI) / 180;
    const estLat = detection.sensorPosition.lat +
      (rangeM * Math.cos(azRad)) / 111_320;
    const estLon = detection.sensorPosition.lon +
      (rangeM * Math.sin(azRad)) /
        (111_320 * Math.cos((detection.sensorPosition.lat * Math.PI) / 180));

    const predictedPosition: Position3D = {
      lat: estLat,
      lon: estLon,
      alt: detection.sensorPosition.alt + 1000,
    };

    this.bus.sendCommand({
      messageType: 'system.command',
      commandId: generateId(),
      targetSensorId: scan.triangulatorSensorId as SensorId,
      simTimeSec,
      command: {
        type: 'cue',
        systemTrackId: `SECTOR-DET-${detection.targetId}`,
        predictedPosition,
        uncertaintyGateDeg: 10,
        priority: 9,
      },
    });
  }

  // ── Private: Detection Handling ─────────────────────────────────────────

  private handleBearingReport(report: BearingReport): void {
    if (!this.activeScan?.active) return;

    const sensorId = report.sensorId as string;
    const scanner = this.activeScan.scanners.find(
      (s) => s.sensorId === sensorId,
    );
    if (!scanner) return;

    // Only process bearing reports from sensors in scanning role
    if (scanner.role !== 'scanning') return;

    for (const bearing of report.bearings) {
      if (bearing.imageQuality < this.config.detectionConfidenceThreshold) {
        continue;
      }

      // Update existing detection (same target within ~2°) or create new
      const existing = this.activeScan.detections.find(
        (d) =>
          d.targetId === bearing.targetId &&
          Math.abs(angleDiffDeg(d.azimuthDeg, bearing.bearing.azimuthDeg)) < 2,
      );
      if (existing) {
        existing.detectedAtSec = report.simTimeSec;
        existing.azimuthDeg = bearing.bearing.azimuthDeg; // Update bearing
        continue;
      }

      // New detection
      const detection: SectorDetection = {
        azimuthDeg: bearing.bearing.azimuthDeg,
        detectedBySensorId: sensorId,
        sensorPosition: bearing.sensorPosition,
        targetId: bearing.targetId,
        detectedAtSec: report.simTimeSec,
        triangulationCount: 0,
      };
      this.activeScan.detections.push(detection);

      // Try to assign a triangulator if we don't have one
      if (!this.activeScan.triangulatorSensorId) {
        this.assignTriangulator(detection, report.simTimeSec);
      }
    }
  }

  /**
   * Select the best triangulator based on geometry spread.
   * Picks the investigator whose bearing to the estimated target
   * creates the largest intersection angle with the detector's bearing
   * (closest to 90° is ideal for triangulation accuracy).
   *
   * Prefers sensors not currently assigned to scanning (free sensors)
   * over pulling an active scanner off duty.
   */
  private assignTriangulator(
    detection: SectorDetection,
    simTimeSec: number,
  ): void {
    const scan = this.activeScan!;

    // Need at least 2 investigators to do triangulation
    if (scan.scanners.length < 2) return;

    // Candidates: anyone except the detector
    const candidates = scan.scanners.filter(
      (s) => s.sensorId !== detection.detectedBySensorId,
    );
    if (candidates.length === 0) return;

    // Score each candidate by geometry spread
    let bestScore = -1;
    let bestCandidate: ScannerAssignment | null = null;

    for (const cand of candidates) {
      const candPos = this.sensorPositions.get(cand.sensorId);
      if (!candPos) continue;

      let score = geometrySpreadScore(
        detection.sensorPosition,
        detection.azimuthDeg,
        candPos,
      );

      // Bonus for sensors not currently scanning (free/idle) — prefer them
      // so we don't pull an active scanner off duty unnecessarily
      if (cand.role !== 'scanning') {
        score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    if (!bestCandidate) return;

    bestCandidate.role = 'triangulating';
    scan.triangulatorSensorId = bestCandidate.sensorId;
    scan.currentDetectionIndex = scan.detections.indexOf(detection);
    scan.lastHopTimeSec = simTimeSec;

    // Cue the TRI to look along the detector's bearing ray
    this.cueTriangulatorToRay(detection, simTimeSec);
  }

  /**
   * Hop the triangulator to the next detection in round-robin.
   * Continuous triangulation — never marks detections as "done".
   * Each hop increments the triangulationCount so the UI can show progress.
   */
  private hopToNextDetection(simTimeSec: number): void {
    const scan = this.activeScan!;
    if (scan.detections.length === 0) return;

    // Increment triangulation count on current detection
    const current = scan.detections[scan.currentDetectionIndex];
    if (current) {
      current.triangulationCount++;
    }

    // Round-robin to next detection
    scan.currentDetectionIndex =
      (scan.currentDetectionIndex + 1) % scan.detections.length;
    scan.lastHopTimeSec = simTimeSec;

    const next = scan.detections[scan.currentDetectionIndex];
    if (next) {
      this.cueTriangulatorToRay(next, simTimeSec);
    }
  }

  /**
   * Release the triangulator back to scanning duty.
   * Only called when zero detections remain across all scanners.
   */
  private releaseTriangulator(simTimeSec: number): void {
    const scan = this.activeScan!;
    if (!scan.triangulatorSensorId) return;

    const scanner = scan.scanners.find(
      (s) => s.sensorId === scan.triangulatorSensorId,
    );
    if (scanner) {
      scanner.role = 'scanning';
      this.issueSearchCommand(scanner, simTimeSec);
    }

    scan.triangulatorSensorId = null;
    scan.currentDetectionIndex = 0;
  }
}
