import type { SystemTrack, SensorState } from '@eloc2/domain';
import { IFOV_THRESHOLD_MRAD, DEFAULT_SENSOR_IFOV_MRAD } from './types.js';
import type { PipelineStatus } from './types.js';
import { runSubPixelDetection } from './sub-pixel-pipeline.js';
import type { SubPixelResult } from './sub-pixel-pipeline.js';
import { runImagePipeline } from './image-pipeline.js';
import type { ImagePipelineResult } from './image-pipeline.js';

// ---------------------------------------------------------------------------
// Mode Controller
// ---------------------------------------------------------------------------

/**
 * Manages transitions between sub-pixel and image detection modes
 * based on `angular_size vs IFOV`.
 *
 * For each track–sensor pair the controller decides which pipeline to use:
 *   - angular_size < IFOV  →  sub-pixel pipeline
 *   - angular_size >= IFOV →  image pipeline
 */

export type PipelineSelection = 'sub-pixel' | 'image' | 'none';

export interface ModeDecision {
  trackId: string;
  sensorId: string;
  pipeline: PipelineSelection;
  angularSizeMrad: number;
  sensorIfovMrad: number;
  subPixelResult: SubPixelResult | null;
  imageResult: ImagePipelineResult | null;
}

export class ModeController {
  /** Per-sensor IFOV overrides (mrad). Falls back to DEFAULT_SENSOR_IFOV_MRAD. */
  private sensorIfov = new Map<string, number>();

  setSensorIfov(sensorId: string, ifovMrad: number): void {
    this.sensorIfov.set(sensorId, ifovMrad);
  }

  getIfov(sensorId: string): number {
    return this.sensorIfov.get(sensorId) ?? DEFAULT_SENSOR_IFOV_MRAD;
  }

  /**
   * Decide which pipeline to use for each eligible track–sensor pair
   * and run the chosen pipeline.
   */
  process(
    tracks: SystemTrack[],
    eoSensors: SensorState[],
    targetSizeM = 10,
  ): ModeDecision[] {
    const decisions: ModeDecision[] = [];

    for (const track of tracks) {
      for (const sensor of eoSensors) {
        const sensorId = sensor.sensorId as string;
        const ifov = this.getIfov(sensorId);

        // Run sub-pixel to get angular size (it always computes it)
        const subPixel = runSubPixelDetection(track, sensor, targetSizeM);
        if (!subPixel) {
          decisions.push({
            trackId: track.systemTrackId as string,
            sensorId,
            pipeline: 'none',
            angularSizeMrad: 0,
            sensorIfovMrad: ifov,
            subPixelResult: null,
            imageResult: null,
          });
          continue;
        }

        const angularSize = subPixel.angularSizeMrad;

        if (angularSize >= ifov) {
          // Image pipeline: target is resolved
          const imageResult = runImagePipeline(track, sensor, ifov, targetSizeM);
          decisions.push({
            trackId: track.systemTrackId as string,
            sensorId,
            pipeline: 'image',
            angularSizeMrad: angularSize,
            sensorIfovMrad: ifov,
            subPixelResult: subPixel,
            imageResult,
          });
        } else {
          // Sub-pixel pipeline: target is unresolved
          decisions.push({
            trackId: track.systemTrackId as string,
            sensorId,
            pipeline: 'sub-pixel',
            angularSizeMrad: angularSize,
            sensorIfovMrad: ifov,
            subPixelResult: subPixel,
            imageResult: null,
          });
        }
      }
    }

    return decisions;
  }

  /**
   * Extract pipeline status summary for the module status report.
   */
  summarise(decisions: ModeDecision[]): PipelineStatus[] {
    return decisions
      .filter(d => d.pipeline !== 'none')
      .map(d => ({
        trackId: d.trackId,
        pipeline: d.pipeline as 'sub-pixel' | 'image',
        angularSizeMrad: d.angularSizeMrad,
        snr: d.subPixelResult?.snr ?? 0,
      }));
  }

  reset(): void {
    this.sensorIfov.clear();
  }
}
