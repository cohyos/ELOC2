/**
 * High-level ASTERIX adapter that wraps the UDP listener and parser
 * into a single, configuration-driven component.
 *
 * When `enabled: false` in config, all methods are no-ops — the adapter
 * has zero impact on the rest of the system.
 */

import type { Position3D } from '@eloc2/domain';
import type { SourceObservation } from '@eloc2/domain';
import { AsterixListener } from './udp-listener.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AsterixConfig {
  /** Master switch. When false, connect/disconnect are no-ops. */
  enabled: boolean;
  /** UDP port for incoming ASTERIX data. */
  port: number;
  /** Optional multicast group to join. */
  multicastGroup?: string;
  /** Geodetic position of the radar (needed for CAT-048 polar → WGS-84). */
  sensorPosition: Position3D;
  /** ASTERIX category: 48 (raw radar plots) or 62 (system tracks). */
  category: 48 | 62;
}

// ---------------------------------------------------------------------------
// AsterixAdapter
// ---------------------------------------------------------------------------

export class AsterixAdapter {
  private readonly config: AsterixConfig;
  private listener: AsterixListener | null = null;
  private connected = false;
  private observationCallback: ((obs: SourceObservation) => void) | null = null;
  private errorCallback: ((err: Error) => void) | null = null;

  constructor(config: AsterixConfig) {
    this.config = config;
  }

  /**
   * Register a callback to receive parsed SourceObservation objects.
   * Must be called before connect().
   */
  onObservation(callback: (obs: SourceObservation) => void): void {
    this.observationCallback = callback;
    if (this.listener) {
      this.listener.onObservation = callback;
    }
  }

  /**
   * Register a callback for adapter errors (socket, parse, etc.).
   */
  onError(callback: (err: Error) => void): void {
    this.errorCallback = callback;
    if (this.listener) {
      this.listener.onError = callback;
    }
  }

  /**
   * Start receiving ASTERIX data.
   * No-op when `config.enabled` is false.
   */
  connect(): void {
    if (!this.config.enabled) {
      console.log('[asterix-adapter] Disabled by configuration — skipping connect');
      return;
    }

    if (this.connected) {
      console.warn('[asterix-adapter] Already connected');
      return;
    }

    this.listener = new AsterixListener({
      port: this.config.port,
      multicastGroup: this.config.multicastGroup,
      sensorPosition: this.config.sensorPosition,
      category: this.config.category,
    });

    if (this.observationCallback) {
      this.listener.onObservation = this.observationCallback;
    }
    if (this.errorCallback) {
      this.listener.onError = this.errorCallback;
    }

    this.listener.start();
    this.connected = true;
    console.log(
      `[asterix-adapter] Connected — CAT-${this.config.category} on port ${this.config.port}`,
    );
  }

  /**
   * Stop receiving ASTERIX data and release the socket.
   * No-op when `config.enabled` is false or not connected.
   */
  disconnect(): void {
    if (!this.config.enabled) return;

    if (this.listener) {
      this.listener.stop();
      this.listener = null;
    }
    this.connected = false;
    console.log('[asterix-adapter] Disconnected');
  }

  /**
   * Whether the adapter is currently receiving data.
   * Always returns false when disabled.
   */
  isConnected(): boolean {
    if (!this.config.enabled) return false;
    return this.connected;
  }

  /** Returns the current configuration (read-only). */
  getConfig(): Readonly<AsterixConfig> {
    return this.config;
  }
}
