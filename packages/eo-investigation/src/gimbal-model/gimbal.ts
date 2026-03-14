import type {
  FieldOfView,
  GimbalState,
  Position3D,
} from '@eloc2/domain';
import {
  bearingDeg,
  haversineDistanceM,
  RAD_TO_DEG,
  DEG_TO_RAD,
  clampAngle,
} from '@eloc2/shared-utils';

// ---------------------------------------------------------------------------
// Elevation limits
// ---------------------------------------------------------------------------

const MIN_ELEVATION_DEG = -5;
const MAX_ELEVATION_DEG = 85;

// ---------------------------------------------------------------------------
// GimbalController
// ---------------------------------------------------------------------------

/**
 * Models an EO sensor's gimbal, supporting slew-time calculations, FOV
 * containment checks, and pointing commands.
 */
export class GimbalController {
  state: GimbalState;
  sensorPosition: Position3D;

  constructor(sensorPosition: Position3D, initialState: GimbalState) {
    this.sensorPosition = sensorPosition;
    this.state = { ...initialState };
  }

  // ── Slew to explicit azimuth / elevation ─────────────────────────────────

  /**
   * Computes the time required to slew the gimbal to the specified azimuth
   * and elevation, and whether the elevation is within the reachable range.
   *
   * @param targetAz - Desired azimuth in degrees [0, 360).
   * @param targetEl - Desired elevation in degrees.
   * @returns The slew time in milliseconds and whether the target is reachable.
   */
  slewTo(
    targetAz: number,
    targetEl: number,
  ): { slewTimeMs: number; canReach: boolean } {
    const canReach =
      targetEl >= MIN_ELEVATION_DEG && targetEl <= MAX_ELEVATION_DEG;

    // Compute shortest angular distance for azimuth (handles wrap-around)
    let deltaAz = Math.abs(targetAz - this.state.azimuthDeg);
    if (deltaAz > 180) {
      deltaAz = 360 - deltaAz;
    }
    const deltaEl = Math.abs(targetEl - this.state.elevationDeg);

    const maxDelta = Math.max(deltaAz, deltaEl);
    const slewTimeMs =
      this.state.slewRateDegPerSec > 0
        ? (maxDelta / this.state.slewRateDegPerSec) * 1000
        : 0;

    return { slewTimeMs, canReach };
  }

  // ── Slew to a target position ────────────────────────────────────────────

  /**
   * Computes azimuth and elevation from the sensor to a target position,
   * then returns slew time and reachability.
   *
   * @param targetPosition - Geodetic position of the target.
   * @returns Slew time, reachability, and the computed azimuth/elevation.
   */
  slewToTarget(targetPosition: Position3D): {
    slewTimeMs: number;
    canReach: boolean;
    azimuthDeg: number;
    elevationDeg: number;
  } {
    const azimuthDeg = bearingDeg(
      this.sensorPosition.lat,
      this.sensorPosition.lon,
      targetPosition.lat,
      targetPosition.lon,
    );

    const horizontalDistM = haversineDistanceM(
      this.sensorPosition.lat,
      this.sensorPosition.lon,
      targetPosition.lat,
      targetPosition.lon,
    );

    const altDiff = targetPosition.alt - this.sensorPosition.alt;
    const elevationDeg = Math.atan2(altDiff, horizontalDistM) * RAD_TO_DEG;

    const { slewTimeMs, canReach } = this.slewTo(azimuthDeg, elevationDeg);

    return { slewTimeMs, canReach, azimuthDeg, elevationDeg };
  }

  // ── FOV containment check ────────────────────────────────────────────────

  /**
   * Checks whether a target at the given azimuth/elevation falls within the
   * given field of view relative to the current gimbal pointing.
   *
   * @param targetAz - Target azimuth in degrees.
   * @param targetEl - Target elevation in degrees.
   * @param fov      - Field of view half-angles.
   * @returns `true` if the target is within the FOV.
   */
  isInFov(targetAz: number, targetEl: number, fov: FieldOfView): boolean {
    // Shortest azimuth difference (handles wrap-around)
    let deltaAz = targetAz - this.state.azimuthDeg;
    if (deltaAz > 180) deltaAz -= 360;
    if (deltaAz < -180) deltaAz += 360;

    const deltaEl = targetEl - this.state.elevationDeg;

    return (
      Math.abs(deltaAz) <= fov.halfAngleHDeg &&
      Math.abs(deltaEl) <= fov.halfAngleVDeg
    );
  }

  // ── Apply slew ───────────────────────────────────────────────────────────

  /**
   * Updates the gimbal state to point at the specified azimuth/elevation.
   *
   * @param targetAz - New azimuth in degrees.
   * @param targetEl - New elevation in degrees.
   */
  applySlew(targetAz: number, targetEl: number): void {
    this.state = {
      ...this.state,
      azimuthDeg: clampAngle(targetAz),
      elevationDeg: targetEl,
    };
  }

  // ── Current pointing ────────────────────────────────────────────────────

  /**
   * Returns the current gimbal pointing angles.
   */
  getCurrentPointing(): { azimuthDeg: number; elevationDeg: number } {
    return {
      azimuthDeg: this.state.azimuthDeg,
      elevationDeg: this.state.elevationDeg,
    };
  }
}
