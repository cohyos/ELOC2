/**
 * UDP socket listener for receiving ASTERIX data blocks.
 *
 * Binds to a configurable port (optionally joining a multicast group)
 * and emits parsed SourceObservation objects via a callback.
 */

import { createSocket, type Socket } from 'node:dgram';
import type { Position3D } from '@eloc2/domain';
import type { SourceObservation } from '@eloc2/domain';
import { parseCAT048, parseCAT062 } from './parser.js';
import { cat048ToObservation, cat062ToObservation } from './adapter.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AsterixListenerConfig {
  /** UDP port to listen on. */
  port: number;
  /** Optional multicast group address to join (e.g. "239.1.1.1"). */
  multicastGroup?: string;
  /** Geodetic position of the radar sensor (needed for CAT-048 polar→WGS84). */
  sensorPosition: Position3D;
  /** ASTERIX category to parse: 48 (radar plots) or 62 (system tracks). */
  category: 48 | 62;
}

// ---------------------------------------------------------------------------
// AsterixListener
// ---------------------------------------------------------------------------

export class AsterixListener {
  private readonly config: AsterixListenerConfig;
  private socket: Socket | null = null;
  private bound = false;

  /** Callback invoked for each parsed observation. Set before calling start(). */
  onObservation: ((obs: SourceObservation) => void) | null = null;

  /** Callback invoked when a parse or socket error occurs. */
  onError: ((err: Error) => void) | null = null;

  constructor(config: AsterixListenerConfig) {
    this.config = config;
  }

  /**
   * Bind the UDP socket and start receiving ASTERIX datagrams.
   * Idempotent — calling start() when already bound is a no-op.
   */
  start(): void {
    if (this.bound) return;

    try {
      this.socket = createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err: Error) => {
        console.error(`[asterix-listener] Socket error: ${err.message}`);
        this.onError?.(err);
        this.stop();
      });

      this.socket.on('message', (msg: Buffer) => {
        this.handleDatagram(msg);
      });

      this.socket.bind(this.config.port, () => {
        this.bound = true;
        console.log(
          `[asterix-listener] Listening on UDP port ${this.config.port} for CAT-${this.config.category}`,
        );

        if (this.config.multicastGroup && this.socket) {
          try {
            this.socket.addMembership(this.config.multicastGroup);
            console.log(
              `[asterix-listener] Joined multicast group ${this.config.multicastGroup}`,
            );
          } catch (err) {
            console.error(
              `[asterix-listener] Failed to join multicast group: ${(err as Error).message}`,
            );
            this.onError?.(err as Error);
          }
        }
      });
    } catch (err) {
      console.error(`[asterix-listener] Failed to create socket: ${(err as Error).message}`);
      this.onError?.(err as Error);
    }
  }

  /**
   * Close the UDP socket and stop receiving.
   * Idempotent — safe to call multiple times.
   */
  stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Socket may already be closed — ignore
      }
      this.socket = null;
      this.bound = false;
      console.log('[asterix-listener] Stopped');
    }
  }

  /** Whether the listener is currently bound and receiving. */
  get isListening(): boolean {
    return this.bound;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private handleDatagram(buffer: Buffer): void {
    try {
      if (this.config.category === 48) {
        const records = parseCAT048(buffer);
        for (const rec of records) {
          const obs = cat048ToObservation(rec, this.config.sensorPosition);
          this.onObservation?.(obs);
        }
      } else {
        const records = parseCAT062(buffer);
        for (const rec of records) {
          const obs = cat062ToObservation(rec);
          this.onObservation?.(obs);
        }
      }
    } catch (err) {
      console.error(`[asterix-listener] Parse error: ${(err as Error).message}`);
      this.onError?.(err as Error);
    }
  }
}
