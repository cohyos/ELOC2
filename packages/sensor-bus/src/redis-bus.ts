/**
 * @module redis-bus
 * @experimental
 *
 * Redis-backed SensorBus implementation using ioredis pub/sub.
 *
 * Drop-in replacement for the in-memory {@link SensorBus}. All publish
 * methods serialize messages as JSON and push them to Redis channels.
 * Subscriptions listen on both the local EventEmitter (for same-process
 * consumers) and Redis pub/sub (for cross-process consumers).
 *
 * If Redis is unavailable and `fallbackToMemory` is true (the default),
 * the bus degrades gracefully to pure in-memory EventEmitter mode —
 * identical to the base {@link SensorBus}.
 *
 * ## Usage
 * ```ts
 * const bus = new RedisSensorBus({
 *   redisUrl: 'redis://my-redis:6379',
 *   channelPrefix: 'eloc2:',
 * });
 * await bus.connect();
 *
 * bus.onTrackReport((report) => { ... });
 * bus.publishTrackReport(report);
 *
 * // Graceful shutdown
 * await bus.destroy();
 * ```
 *
 * ## ioredis dependency
 * `ioredis` is loaded via dynamic `import()` so that this module does not
 * introduce a hard dependency. Install it as an optional peer dependency:
 * ```
 * pnpm add ioredis
 * ```
 *
 * @packageDocumentation
 */

import { SensorBus } from './bus.js';
import type {
  SensorTrackReport,
  BearingReport,
  SystemCommand,
  GroundTruthBroadcast,
} from './types.js';

// ── Channel constants ───────────────────────────────────────────────

/** All Redis channel names used by the bus (before prefix). */
const CHANNELS = {
  TRACK_REPORT: 'sensor.track.report',
  BEARING_REPORT: 'sensor.bearing.report',
  SYSTEM_COMMAND: 'system.command',
  GT_BROADCAST: 'gt.broadcast',
} as const;

// ── Types ───────────────────────────────────────────────────────────

/** Configuration for {@link RedisSensorBus}. */
export interface RedisBusConfig {
  /**
   * Redis connection URL.
   * @default 'redis://localhost:6379'
   */
  redisUrl?: string;

  /**
   * Prefix prepended to all Redis channel names to namespace messages.
   * @default 'eloc2:'
   */
  channelPrefix?: string;

  /**
   * If true, fall back to in-memory EventEmitter when Redis is unavailable.
   * If false, {@link RedisSensorBus.connect} will throw on connection failure.
   * @default true
   */
  fallbackToMemory?: boolean;
}

/** Connection state of the Redis bus. */
export type RedisBusState = 'disconnected' | 'connecting' | 'connected' | 'fallback' | 'destroyed';

/**
 * Envelope wrapper used for Redis serialization.
 * Includes a monotonic sequence number for ordering diagnostics.
 */
interface RedisEnvelope<T = unknown> {
  /** Fully-qualified channel name (with prefix). */
  channel: string;
  /** Monotonically increasing per-publisher sequence number. */
  seq: number;
  /** ISO-8601 wall-clock timestamp of publish. */
  publishedAt: string;
  /** The original payload. */
  payload: T;
}

/**
 * Minimal interface for the ioredis client methods we use.
 * Avoids importing ioredis types at compile time.
 */
interface RedisClient {
  connect(): Promise<void>;
  quit(): Promise<string>;
  disconnect(): void;
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<number>;
  psubscribe(...patterns: string[]): Promise<number>;
  on(event: string, handler: (...args: unknown[]) => void): this;
  removeAllListeners(): this;
  status: string;
}

// ── Implementation ──────────────────────────────────────────────────

/**
 * Redis-backed SensorBus with automatic in-memory fallback.
 *
 * Extends the base {@link SensorBus} so every local EventEmitter path
 * continues to work. Redis pub/sub is layered on top: publishes go to
 * both local emitter and Redis; subscriptions from Redis are forwarded
 * into the local emitter so handler registration is identical.
 *
 * @experimental This class is functional but has not been battle-tested
 * in a multi-node production deployment. The Redis serialization format
 * may change in future versions.
 */
export class RedisSensorBus extends SensorBus {
  // ── Private state ───────────────────────────────────────────────

  private readonly redisUrl: string;
  private readonly channelPrefix: string;
  private readonly fallbackToMemory: boolean;

  /** Publisher client — used for PUBLISH commands. */
  private pubClient: RedisClient | null = null;
  /** Subscriber client — dedicated connection for SUBSCRIBE. */
  private subClient: RedisClient | null = null;

  private _state: RedisBusState = 'disconnected';
  private _seq = 0;

  /** Set of prefixed channels we are subscribed to in Redis. */
  private subscribedChannels = new Set<string>();

  /** Pattern subscriptions active in Redis. */
  private subscribedPatterns = new Set<string>();

  // ── Constructor ─────────────────────────────────────────────────

  /**
   * Create a new RedisSensorBus.
   *
   * The bus starts in `disconnected` state. Call {@link connect} to
   * establish the Redis connection (or fall back to in-memory mode).
   *
   * @param config - Optional configuration overrides.
   */
  constructor(config: RedisBusConfig = {}) {
    super();
    this.redisUrl = config.redisUrl ?? 'redis://localhost:6379';
    this.channelPrefix = config.channelPrefix ?? 'eloc2:';
    this.fallbackToMemory = config.fallbackToMemory ?? true;
  }

  // ── Public accessors ────────────────────────────────────────────

  /** Current connection state. */
  get state(): RedisBusState {
    return this._state;
  }

  /** Whether the bus is operating in Redis mode (not fallback). */
  get isRedisConnected(): boolean {
    return this._state === 'connected';
  }

  // ── Connection lifecycle ────────────────────────────────────────

  /**
   * Establish Redis connections (pub + sub clients).
   *
   * If Redis is unreachable and `fallbackToMemory` is enabled, the bus
   * transitions to `'fallback'` state and operates as a plain in-memory
   * EventEmitter (identical to the base {@link SensorBus}).
   *
   * @throws If Redis connection fails and `fallbackToMemory` is false.
   */
  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'destroyed') {
      return;
    }

    this._state = 'connecting';

    try {
      const RedisConstructor = await this.loadIoredis();

      const clientOptions = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // No automatic retry — we handle fallback
        enableReadyCheck: true,
        connectTimeout: 5_000,
      };

      // Two separate connections: one for pub, one for sub (ioredis requirement)
      this.pubClient = new RedisConstructor(this.redisUrl, clientOptions) as unknown as RedisClient;
      this.subClient = new RedisConstructor(this.redisUrl, clientOptions) as unknown as RedisClient;

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      // Wire up Redis message handler
      this.subClient.on('message', (channel: unknown, message: unknown) => {
        this.handleRedisMessage(channel as string, message as string);
      });

      this.subClient.on('pmessage', (_pattern: unknown, channel: unknown, message: unknown) => {
        this.handleRedisMessage(channel as string, message as string);
      });

      // Subscribe to the four core channels
      await this.subscribeRedisChannel(CHANNELS.TRACK_REPORT);
      await this.subscribeRedisChannel(CHANNELS.BEARING_REPORT);
      await this.subscribeRedisChannel(CHANNELS.SYSTEM_COMMAND);
      await this.subscribeRedisChannel(CHANNELS.GT_BROADCAST);

      // Subscribe to per-sensor patterns so sensor-specific listeners work
      await this.subscribeRedisPattern(`${CHANNELS.TRACK_REPORT}.*`);
      await this.subscribeRedisPattern(`${CHANNELS.BEARING_REPORT}.*`);
      await this.subscribeRedisPattern(`${CHANNELS.SYSTEM_COMMAND}.*`);

      // Listen for unexpected disconnects
      this.pubClient.on('error', (err: unknown) => {
        this.handleRedisError('pub', err instanceof Error ? err : new Error(String(err)));
      });
      this.subClient.on('error', (err: unknown) => {
        this.handleRedisError('sub', err instanceof Error ? err : new Error(String(err)));
      });

      this._state = 'connected';
    } catch (err) {
      await this.cleanupRedisClients();

      if (this.fallbackToMemory) {
        this._state = 'fallback';
        // In fallback mode, the base SensorBus EventEmitter handles everything
      } else {
        this._state = 'disconnected';
        throw new Error(
          `RedisSensorBus: failed to connect to ${this.redisUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Gracefully shut down the bus, disconnecting Redis clients and
   * removing all listeners.
   */
  override async destroy(): Promise<void> {
    this._state = 'destroyed';
    await this.cleanupRedisClients();
    super.destroy();
  }

  // ── Publish overrides ──────────────────────────────────────────

  /**
   * Publish a track report to both local EventEmitter and Redis.
   * @param report - The sensor track report to publish.
   */
  override publishTrackReport(report: SensorTrackReport): void {
    // Always emit locally first (low-latency same-process path)
    super.publishTrackReport(report);

    // Additionally publish to Redis for cross-process subscribers
    if (this.isRedisConnected) {
      this.publishToRedis(CHANNELS.TRACK_REPORT, report);
      this.publishToRedis(`${CHANNELS.TRACK_REPORT}.${report.sensorId}`, report);
    }
  }

  /**
   * Publish a bearing report to both local EventEmitter and Redis.
   * @param report - The EO bearing report to publish.
   */
  override publishBearingReport(report: BearingReport): void {
    super.publishBearingReport(report);

    if (this.isRedisConnected) {
      this.publishToRedis(CHANNELS.BEARING_REPORT, report);
      this.publishToRedis(`${CHANNELS.BEARING_REPORT}.${report.sensorId}`, report);
    }
  }

  /**
   * Send a command to a specific sensor via both local and Redis channels.
   * @param command - The system command to send.
   */
  override sendCommand(command: SystemCommand): void {
    super.sendCommand(command);

    if (this.isRedisConnected) {
      this.publishToRedis(`${CHANNELS.SYSTEM_COMMAND}.${command.targetSensorId}`, command);
      this.publishToRedis(CHANNELS.SYSTEM_COMMAND, command);
    }
  }

  /**
   * Broadcast ground truth to both local and Redis channels.
   * @param gt - Ground truth broadcast payload.
   */
  override broadcastGroundTruth(gt: GroundTruthBroadcast): void {
    super.broadcastGroundTruth(gt);

    if (this.isRedisConnected) {
      this.publishToRedis(CHANNELS.GT_BROADCAST, gt);
    }
  }

  // ── Redis internals ────────────────────────────────────────────

  /**
   * Dynamically load ioredis to avoid a hard dependency.
   * Returns the Redis constructor function.
   * @throws If ioredis is not installed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadIoredis(): Promise<any> {
    try {
      // Use a variable to hide the module specifier from TypeScript's
      // static module resolution (ioredis is an optional peer dependency).
      const moduleName = 'ioredis';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await (Function('m', 'return import(m)') as (m: string) => Promise<any>)(moduleName);
      // Handle both ESM default export and CJS module.exports
      return mod.default ?? mod;
    } catch {
      throw new Error(
        'RedisSensorBus requires the "ioredis" package. Install it with: pnpm add ioredis',
      );
    }
  }

  /**
   * Build a prefixed Redis channel name.
   */
  private prefixedChannel(channel: string): string {
    return `${this.channelPrefix}${channel}`;
  }

  /**
   * Publish a JSON-serialized envelope to a Redis channel.
   */
  private publishToRedis<T>(channel: string, payload: T): void {
    if (!this.pubClient) return;

    const envelope: RedisEnvelope<T> = {
      channel: this.prefixedChannel(channel),
      seq: ++this._seq,
      publishedAt: new Date().toISOString(),
      payload,
    };

    this.pubClient.publish(
      this.prefixedChannel(channel),
      JSON.stringify(envelope),
    ).catch((err: unknown) => {
      this.handleRedisError('pub', err instanceof Error ? err : new Error(String(err)));
    });
  }

  /**
   * Subscribe to a Redis channel (exact match).
   */
  private async subscribeRedisChannel(channel: string): Promise<void> {
    if (!this.subClient) return;
    const prefixed = this.prefixedChannel(channel);
    if (this.subscribedChannels.has(prefixed)) return;
    await this.subClient.subscribe(prefixed);
    this.subscribedChannels.add(prefixed);
  }

  /**
   * Subscribe to a Redis pattern (glob-style).
   */
  private async subscribeRedisPattern(pattern: string): Promise<void> {
    if (!this.subClient) return;
    const prefixed = this.prefixedChannel(pattern);
    if (this.subscribedPatterns.has(prefixed)) return;
    await this.subClient.psubscribe(prefixed);
    this.subscribedPatterns.add(prefixed);
  }

  /**
   * Handle an incoming message from Redis and re-emit on the local EventEmitter.
   *
   * In single-process mode, callers may receive the message twice (once from
   * the local `super.publish*()` call and once from Redis round-trip). This is
   * by design — in a multi-process deployment each process has its own
   * EventEmitter and only receives Redis messages from other processes.
   *
   * For single-process deployments where deduplication matters, use the base
   * {@link SensorBus} instead.
   */
  private handleRedisMessage(prefixedChannel: string, raw: string): void {
    try {
      const envelope = JSON.parse(raw) as RedisEnvelope;
      const channel = prefixedChannel.slice(this.channelPrefix.length);

      // Route the payload back into the local EventEmitter based on channel
      if (
        channel === CHANNELS.TRACK_REPORT ||
        channel.startsWith(`${CHANNELS.TRACK_REPORT}.`) ||
        channel === CHANNELS.BEARING_REPORT ||
        channel.startsWith(`${CHANNELS.BEARING_REPORT}.`) ||
        channel === CHANNELS.SYSTEM_COMMAND ||
        channel.startsWith(`${CHANNELS.SYSTEM_COMMAND}.`) ||
        channel === CHANNELS.GT_BROADCAST
      ) {
        this.reEmitLocally(channel, envelope.payload);
      }
    } catch {
      // Silently ignore malformed messages — they may come from other systems
      // sharing the same Redis instance with different serialization.
    }
  }

  /**
   * Re-emit a payload on the local EventEmitter for a given unprefixed channel.
   *
   * Accesses the parent class's private emitter field. This is intentionally
   * coupled to the SensorBus implementation. In a future refactor, the base
   * class should expose a protected `emit()` method.
   */
  private reEmitLocally(channel: string, payload: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitter = (this as any).emitter;
    if (emitter && typeof emitter.emit === 'function') {
      emitter.emit(channel, payload);
    }
  }

  /**
   * Handle a Redis client error. If the connection is lost, transition
   * to fallback mode (if enabled).
   */
  private handleRedisError(client: 'pub' | 'sub', err: Error): void {
    // Only log if we were previously connected
    if (this._state === 'connected') {
      console.warn(
        `RedisSensorBus: ${client} client error — ${err.message}. ` +
        (this.fallbackToMemory ? 'Falling back to in-memory mode.' : 'Bus may be degraded.'),
      );
    }

    if (this.fallbackToMemory && this._state === 'connected') {
      this._state = 'fallback';
      // Don't tear down clients — they may reconnect. But stop publishing.
    }
  }

  /**
   * Disconnect and clean up Redis clients.
   */
  private async cleanupRedisClients(): Promise<void> {
    this.subscribedChannels.clear();
    this.subscribedPatterns.clear();

    const cleanup = async (client: RedisClient | null): Promise<void> => {
      if (!client) return;
      try {
        client.removeAllListeners();
        if (client.status === 'ready' || client.status === 'connecting') {
          await client.quit();
        }
      } catch {
        // Force disconnect if quit fails
        try {
          client.disconnect();
        } catch {
          // Already disconnected — ignore
        }
      }
    };

    await Promise.all([
      cleanup(this.pubClient),
      cleanup(this.subClient),
    ]);

    this.pubClient = null;
    this.subClient = null;
  }
}
