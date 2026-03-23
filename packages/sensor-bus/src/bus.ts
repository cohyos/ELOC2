import { EventEmitter } from 'node:events';
import type {
  SensorTrackReport,
  BearingReport,
  SystemCommand,
  GroundTruthBroadcast,
} from './types.js';

/**
 * SensorBus — message bus abstraction for sensor ↔ system communication.
 *
 * Current implementation uses Node.js EventEmitter (in-process).
 * Designed for drop-in replacement with Redis Streams / Pub-Sub later.
 */
export class SensorBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many sensors to subscribe without warnings
    this.emitter.setMaxListeners(100);
  }

  // ── Sensor → System (upstream) ──────────────────────────────

  /** Publish a track report from a radar / C4ISR sensor */
  publishTrackReport(report: SensorTrackReport): void {
    this.emitter.emit('sensor.track.report', report);
    this.emitter.emit(`sensor.track.report.${report.sensorId}`, report);
  }

  /** Publish a bearing report from an EO sensor */
  publishBearingReport(report: BearingReport): void {
    this.emitter.emit('sensor.bearing.report', report);
    this.emitter.emit(`sensor.bearing.report.${report.sensorId}`, report);
  }

  // ── System → Sensor (downstream) ───────────────────────────

  /** Send a command to a specific sensor */
  sendCommand(command: SystemCommand): void {
    this.emitter.emit(`system.command.${command.targetSensorId}`, command);
    this.emitter.emit('system.command', command);
  }

  /** Broadcast ground truth to all listeners */
  broadcastGroundTruth(gt: GroundTruthBroadcast): void {
    this.emitter.emit('gt.broadcast', gt);
  }

  // ── Subscriptions ──────────────────────────────────────────

  /** Subscribe to all track reports */
  onTrackReport(handler: (report: SensorTrackReport) => void): void {
    this.emitter.on('sensor.track.report', handler);
  }

  /** Subscribe to track reports from a specific sensor */
  onTrackReportFrom(sensorId: string, handler: (report: SensorTrackReport) => void): void {
    this.emitter.on(`sensor.track.report.${sensorId}`, handler);
  }

  /** Subscribe to all bearing reports */
  onBearingReport(handler: (report: BearingReport) => void): void {
    this.emitter.on('sensor.bearing.report', handler);
  }

  /** Subscribe to bearing reports from a specific sensor */
  onBearingReportFrom(sensorId: string, handler: (report: BearingReport) => void): void {
    this.emitter.on(`sensor.bearing.report.${sensorId}`, handler);
  }

  /** Subscribe to commands targeted at a specific sensor */
  onCommand(sensorId: string, handler: (cmd: SystemCommand) => void): void {
    this.emitter.on(`system.command.${sensorId}`, handler);
  }

  /** Subscribe to all commands (system-wide monitor) */
  onAnyCommand(handler: (cmd: SystemCommand) => void): void {
    this.emitter.on('system.command', handler);
  }

  /** Subscribe to ground truth broadcasts */
  onGroundTruth(handler: (gt: GroundTruthBroadcast) => void): void {
    this.emitter.on('gt.broadcast', handler);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /** Remove all listeners from the bus */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  /** Tear down the bus, removing all listeners */
  destroy(): void {
    this.removeAllListeners();
  }
}
