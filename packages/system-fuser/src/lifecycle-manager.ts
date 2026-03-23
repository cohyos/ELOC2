/**
 * LifecycleManager — manages proper cleanup of distributed pipeline
 * resources during scenario transitions and user disconnect events.
 *
 * Ensures that:
 * 1. When the last WS user disconnects → pipeline is suspended (not destroyed)
 * 2. When switching scenarios → pipeline is fully reset
 * 3. When simulation stops/resets → pipeline state is cleared, logs preserved
 * 4. On destroy → all resources released (bus listeners, sensor instances)
 */

import type { SensorBus } from '@eloc2/sensor-bus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineState = 'idle' | 'running' | 'paused' | 'suspended' | 'destroyed';

export interface LifecycleEvent {
  type:
    | 'pipeline.created'
    | 'pipeline.started'
    | 'pipeline.paused'
    | 'pipeline.suspended'
    | 'pipeline.resumed'
    | 'pipeline.reset'
    | 'pipeline.scenario_switch'
    | 'pipeline.destroyed';
  timestamp: number;
  detail?: string;
}

export interface LifecycleManagerConfig {
  /** Grace period (ms) before suspending after last user disconnects (default 5000) */
  suspendGracePeriodMs: number;
  /** Max events to retain in log (default 100) */
  maxEventLogSize: number;
}

const DEFAULT_CONFIG: LifecycleManagerConfig = {
  suspendGracePeriodMs: 5000,
  maxEventLogSize: 100,
};

/** Interface for a resource that can be cleaned up */
export interface Disposable {
  reset(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// LifecycleManager
// ---------------------------------------------------------------------------

export class LifecycleManager {
  private state: PipelineState = 'idle';
  private config: LifecycleManagerConfig;
  private eventLog: LifecycleEvent[] = [];
  private activeUsers = 0;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private resources: Disposable[] = [];
  private onStateChange?: (state: PipelineState, event: LifecycleEvent) => void;

  constructor(config?: Partial<LifecycleManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Register a resource that needs cleanup */
  registerResource(resource: Disposable): void {
    this.resources.push(resource);
  }

  /** Set callback for state changes */
  setOnStateChange(cb: (state: PipelineState, event: LifecycleEvent) => void): void {
    this.onStateChange = cb;
  }

  // ── State Transitions ─────────────────────────────────────────────────

  /** Called when a new WS user connects */
  userConnected(): void {
    this.activeUsers++;

    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }

    if (this.state === 'suspended') {
      this.transitionTo('paused', {
        type: 'pipeline.resumed',
        timestamp: Date.now(),
        detail: `User reconnected (${this.activeUsers} active)`,
      });
    }
  }

  /** Called when a WS user disconnects */
  userDisconnected(): void {
    this.activeUsers = Math.max(0, this.activeUsers - 1);

    if (this.activeUsers === 0 && this.state !== 'idle' && this.state !== 'destroyed') {
      // Start grace period before suspending
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (this.activeUsers === 0 && this.state !== 'destroyed') {
          this.suspend();
        }
      }, this.config.suspendGracePeriodMs);
    }
  }

  /** Start the pipeline */
  start(): boolean {
    if (this.state === 'destroyed') return false;
    this.transitionTo('running', {
      type: 'pipeline.started',
      timestamp: Date.now(),
    });
    return true;
  }

  /** Pause the pipeline */
  pause(): void {
    if (this.state !== 'running') return;
    this.transitionTo('paused', {
      type: 'pipeline.paused',
      timestamp: Date.now(),
    });
  }

  /** Suspend pipeline (all users gone, preserve state for reconnection) */
  private suspend(): void {
    this.transitionTo('suspended', {
      type: 'pipeline.suspended',
      timestamp: Date.now(),
      detail: 'All users disconnected — pipeline suspended',
    });
  }

  /**
   * Reset the pipeline for a new scenario or fresh start.
   * Clears all resource state but preserves the log.
   */
  reset(): void {
    if (this.state === 'destroyed') return;

    // Reset all registered resources
    for (const resource of this.resources) {
      try {
        resource.reset();
      } catch (err) {
        // Log but don't throw during cleanup
        this.logEvent({
          type: 'pipeline.reset',
          timestamp: Date.now(),
          detail: `Reset error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    this.transitionTo('idle', {
      type: 'pipeline.reset',
      timestamp: Date.now(),
    });
  }

  /**
   * Switch to a different scenario. Fully resets pipeline state,
   * preserving event log for review.
   */
  switchScenario(newScenarioId: string): void {
    this.logEvent({
      type: 'pipeline.scenario_switch',
      timestamp: Date.now(),
      detail: `Switching to scenario: ${newScenarioId}`,
    });
    this.reset();
  }

  /**
   * Fully destroy the pipeline — release all resources, remove listeners.
   * Called on server shutdown or when the pipeline is no longer needed.
   */
  destroy(): void {
    // Cancel any pending suspend timer
    if (this.suspendTimer) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }

    // Destroy all registered resources
    for (const resource of this.resources) {
      try {
        resource.destroy();
      } catch {
        // Ignore errors during final cleanup
      }
    }
    this.resources = [];

    this.transitionTo('destroyed', {
      type: 'pipeline.destroyed',
      timestamp: Date.now(),
    });
  }

  // ── Query ─────────────────────────────────────────────────────────────

  getState(): PipelineState {
    return this.state;
  }

  getActiveUsers(): number {
    return this.activeUsers;
  }

  getEventLog(): LifecycleEvent[] {
    return [...this.eventLog];
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private transitionTo(newState: PipelineState, event: LifecycleEvent): void {
    this.state = newState;
    this.logEvent(event);
    this.onStateChange?.(newState, event);
  }

  private logEvent(event: LifecycleEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.config.maxEventLogSize) {
      this.eventLog = this.eventLog.slice(-this.config.maxEventLogSize);
    }
  }
}
