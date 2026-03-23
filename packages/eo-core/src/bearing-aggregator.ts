import type { BearingReport, BearingMeasurementReport } from '@eloc2/sensor-bus';

/**
 * BearingAggregator — collects bearing reports from all EO sensors per tick,
 * then groups by targetId for cross-sensor triangulation matching.
 */
export class BearingAggregator {
  private bearingBuffer: Map<string, BearingMeasurementReport[]> = new Map();

  /** Add bearings from a sensor report */
  ingestReport(report: BearingReport): void {
    const sensorId = report.sensorId as string;
    this.bearingBuffer.set(sensorId, report.bearings);
  }

  /** Get all bearings grouped by sensor for this tick */
  getAllBearings(): Map<string, BearingMeasurementReport[]> {
    return new Map(this.bearingBuffer);
  }

  /** Clear buffer for next tick */
  clear(): void {
    this.bearingBuffer.clear();
  }

  /** Get the total number of sensors that reported this tick */
  getSensorCount(): number {
    return this.bearingBuffer.size;
  }

  /**
   * Find cross-sensor matches — bearings from different sensors
   * aimed at the same target (grouped by targetId).
   * Only returns groups with ≥2 sensors.
   */
  findCrossSensorMatches(): Array<{
    bearings: Array<{ sensorId: string; bearing: BearingMeasurementReport }>;
    targetId: string;
  }> {
    const byTarget = new Map<
      string,
      Array<{ sensorId: string; bearing: BearingMeasurementReport }>
    >();

    for (const [sensorId, bearings] of this.bearingBuffer) {
      for (const b of bearings) {
        if (!byTarget.has(b.targetId)) byTarget.set(b.targetId, []);
        byTarget.get(b.targetId)!.push({ sensorId, bearing: b });
      }
    }

    return [...byTarget.entries()]
      .filter(([, entries]) => entries.length >= 2)
      .map(([targetId, entries]) => ({ bearings: entries, targetId }));
  }
}
