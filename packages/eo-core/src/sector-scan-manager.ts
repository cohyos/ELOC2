/**
 * SectorScanManager — manages sector threat scanning with assigned EO investigators.
 *
 * The operator defines a threat sector (azimuth start/end) and assigns 1-3
 * EO investigators. The manager:
 *   1. Divides the sector equally among assigned scanners
 *   2. Issues SearchPatternCommands to each scanner for its sub-sector
 *   3. On detection — designates another investigator for triangulation via CueCommand
 *   4. On multiple detections — the triangulator hops between them
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
  /** How long (seconds) a triangulator dwells on each detection before hopping (default: 3) */
  triangulationDwellSec: number;
  /** Minimum confidence to treat a bearing as a detection (default: 0.3) */
  detectionConfidenceThreshold: number;
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
  /** Simulation time of detection */
  detectedAtSec: number;
  /** Whether triangulation has been attempted */
  triangulated: boolean;
}

export interface SectorScanState {
  /** Unique scan ID */
  scanId: string;
  /** Sector being scanned */
  sector: SectorDefinition;
  /** Assigned investigators */
  scanners: ScannerAssignment[];
  /** Active detections pending triangulation */
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
  triangulationDwellSec: 3,
  detectionConfidenceThreshold: 0.3,
};

// ---------------------------------------------------------------------------
// SectorScanManager
// ---------------------------------------------------------------------------

export class SectorScanManager {
  private bus: SensorBus;
  private config: SectorScanConfig;
  private activeScan: SectorScanState | null = null;

  /** Sensor positions needed for cueing — populated by caller */
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
   * @param sensorPositions - Position of each sensor (needed for cue targeting)
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
   * Stop the active sector scan. Returns sensors to standby.
   */
  stopScan(simTimeSec: number): void {
    if (!this.activeScan) return;

    // Send standby commands to all assigned sensors
    for (const scanner of this.activeScan.scanners) {
      this.bus.sendCommand({
        messageType: 'system.command',
        commandId: generateId(),
        targetSensorId: scanner.sensorId as SensorId,
        simTimeSec,
        command: {
          type: 'mode',
          mode: 'track',
        },
      });
    }

    this.activeScan.active = false;
    this.activeScan = null;
  }

  /**
   * Called every tick to manage triangulation hopping.
   */
  tick(simTimeSec: number): void {
    if (!this.activeScan?.active) return;

    const scan = this.activeScan;

    // Prune old detections (older than 30 seconds)
    scan.detections = scan.detections.filter(
      (d) => simTimeSec - d.detectedAtSec < 30,
    );

    // If we have a triangulator and multiple detections, hop between them
    if (
      scan.triangulatorSensorId &&
      scan.detections.length > 1 &&
      simTimeSec - scan.lastHopTimeSec >= this.config.triangulationDwellSec
    ) {
      this.hopToNextDetection(simTimeSec);
    }

    // If no pending detections, release the triangulator back to scanning
    const untriangulated = scan.detections.filter((d) => !d.triangulated);
    if (untriangulated.length === 0 && scan.triangulatorSensorId) {
      this.releaseTriangulator(simTimeSec);
    }
  }

  /**
   * Get current scan state (for API/WS broadcast).
   */
  getState(): SectorScanState | null {
    return this.activeScan;
  }

  /**
   * Check if a sector scan is active.
   */
  isActive(): boolean {
    return this.activeScan?.active ?? false;
  }

  /**
   * Get available EO sensor IDs that could be assigned
   * (not currently in the active scan).
   */
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

  /**
   * Divide the sector equally among assigned sensors.
   * All start as 'scanning' role.
   */
  private divideSector(
    sector: SectorDefinition,
    sensorIds: string[],
  ): ScannerAssignment[] {
    let sectorWidth = sector.azimuthEndDeg - sector.azimuthStartDeg;
    if (sectorWidth <= 0) sectorWidth += 360; // Handle wrap-around

    const n = sensorIds.length;
    const subWidth = sectorWidth / n;

    return sensorIds.map((sensorId, i) => {
      let subStart = sector.azimuthStartDeg + i * subWidth;
      let subEnd = sector.azimuthStartDeg + (i + 1) * subWidth;
      // Normalize
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

  // ── Private: Detection Handling ─────────────────────────────────────────

  private handleBearingReport(report: BearingReport): void {
    if (!this.activeScan?.active) return;

    // Only process reports from our assigned sensors
    const sensorId = report.sensorId as string;
    const scanner = this.activeScan.scanners.find(
      (s) => s.sensorId === sensorId,
    );
    if (!scanner) return;

    // Only process from scanners (not from the triangulator)
    if (scanner.role !== 'scanning') return;

    // Check for detections above confidence threshold (use imageQuality as proxy)
    for (const bearing of report.bearings) {
      if (bearing.imageQuality < this.config.detectionConfidenceThreshold) {
        continue;
      }

      // Check if we already have this detection (same target within ~2° azimuth)
      const existing = this.activeScan.detections.find(
        (d) =>
          d.targetId === bearing.targetId &&
          Math.abs(d.azimuthDeg - bearing.bearing.azimuthDeg) < 2,
      );
      if (existing) {
        // Update detection time
        existing.detectedAtSec = report.simTimeSec;
        continue;
      }

      // New detection
      const detection: SectorDetection = {
        azimuthDeg: bearing.bearing.azimuthDeg,
        detectedBySensorId: sensorId,
        sensorPosition: bearing.sensorPosition,
        targetId: bearing.targetId,
        detectedAtSec: report.simTimeSec,
        triangulated: false,
      };
      this.activeScan.detections.push(detection);

      // Try to assign a triangulator
      this.tryAssignTriangulator(detection, report.simTimeSec);
    }
  }

  /**
   * Try to designate another scanner as triangulator for a detection.
   * Picks the scanner that is NOT the detector and NOT already triangulating.
   */
  private tryAssignTriangulator(
    detection: SectorDetection,
    simTimeSec: number,
  ): void {
    const scan = this.activeScan!;

    // If already have a triangulator, just add this detection to queue
    if (scan.triangulatorSensorId) {
      // Cue the existing triangulator to the new detection
      this.cueTriangulatorToDetection(detection, simTimeSec);
      return;
    }

    // Need at least 2 scanners to spare one for triangulation
    if (scan.scanners.length < 2) return;

    // Pick a scanner that isn't the detector — prefer the one closest in azimuth
    const candidates = scan.scanners.filter(
      (s) =>
        s.sensorId !== detection.detectedBySensorId && s.role === 'scanning',
    );
    if (candidates.length === 0) return;

    // Pick first available candidate
    const triangulator = candidates[0];
    triangulator.role = 'triangulating';
    scan.triangulatorSensorId = triangulator.sensorId;
    scan.currentDetectionIndex = scan.detections.indexOf(detection);
    scan.lastHopTimeSec = simTimeSec;

    // Cue the triangulator to the detection
    this.cueTriangulatorToDetection(detection, simTimeSec);
  }

  /**
   * Send a CueCommand to the triangulator to look at a detection.
   * We estimate a position along the bearing from the detecting sensor.
   */
  private cueTriangulatorToDetection(
    detection: SectorDetection,
    simTimeSec: number,
  ): void {
    const scan = this.activeScan!;
    if (!scan.triangulatorSensorId) return;

    // Estimate a target position along the detection bearing
    // Use a rough range estimate (e.g., 5km along the bearing)
    const estimatedRangeM = 5000;
    const azRad = (detection.azimuthDeg * Math.PI) / 180;
    const dLat = (estimatedRangeM * Math.cos(azRad)) / 111_320;
    const dLon =
      (estimatedRangeM * Math.sin(azRad)) /
      (111_320 * Math.cos((detection.sensorPosition.lat * Math.PI) / 180));

    const predictedPosition: Position3D = {
      lat: detection.sensorPosition.lat + dLat,
      lon: detection.sensorPosition.lon + dLon,
      alt: detection.sensorPosition.alt + 1000, // Assume target is above sensor
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
        priority: 8,
      },
    });
  }

  /**
   * Hop the triangulator to the next unresolved detection.
   */
  private hopToNextDetection(simTimeSec: number): void {
    const scan = this.activeScan!;
    const untriangulated = scan.detections.filter((d) => !d.triangulated);
    if (untriangulated.length === 0) return;

    // Mark current as triangulated (we've dwelled long enough)
    if (scan.currentDetectionIndex < scan.detections.length) {
      scan.detections[scan.currentDetectionIndex].triangulated = true;
    }

    // Find next untriangulated
    const next = scan.detections.find((d) => !d.triangulated);
    if (!next) return;

    scan.currentDetectionIndex = scan.detections.indexOf(next);
    scan.lastHopTimeSec = simTimeSec;

    this.cueTriangulatorToDetection(next, simTimeSec);
  }

  /**
   * Release the triangulator back to scanning duty.
   */
  private releaseTriangulator(simTimeSec: number): void {
    const scan = this.activeScan!;
    if (!scan.triangulatorSensorId) return;

    const scanner = scan.scanners.find(
      (s) => s.sensorId === scan.triangulatorSensorId,
    );
    if (scanner) {
      scanner.role = 'scanning';
      // Re-issue search command for its sub-sector
      this.issueSearchCommand(scanner, simTimeSec);
    }

    scan.triangulatorSensorId = null;
  }
}
