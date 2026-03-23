import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LifecycleManager, type Disposable } from '../lifecycle-manager.js';

// ── Helpers ──

function createMockResource(): Disposable & { resetCalled: boolean; destroyCalled: boolean } {
  return {
    resetCalled: false,
    destroyCalled: false,
    reset() {
      this.resetCalled = true;
    },
    destroy() {
      this.destroyCalled = true;
    },
  };
}

// ── Tests ──

describe('LifecycleManager', () => {
  let manager: LifecycleManager;

  beforeEach(() => {
    manager = new LifecycleManager({ suspendGracePeriodMs: 50 });
  });

  it('starts in idle state', () => {
    expect(manager.getState()).toBe('idle');
    expect(manager.getActiveUsers()).toBe(0);
  });

  it('can transition to running', () => {
    const result = manager.start();
    expect(result).toBe(true);
    expect(manager.getState()).toBe('running');
  });

  it('tracks user connections', () => {
    manager.userConnected();
    expect(manager.getActiveUsers()).toBe(1);
    manager.userConnected();
    expect(manager.getActiveUsers()).toBe(2);
  });

  it('tracks user disconnections', () => {
    manager.userConnected();
    manager.userConnected();
    manager.userDisconnected();
    expect(manager.getActiveUsers()).toBe(1);
  });

  it('suspends after grace period when last user disconnects', async () => {
    manager.start();
    manager.userConnected();
    manager.userDisconnected();

    // Before grace period
    expect(manager.getState()).toBe('running');

    // After grace period
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(manager.getState()).toBe('suspended');
  });

  it('cancels suspend if user reconnects during grace period', async () => {
    manager.start();
    manager.userConnected();
    manager.userDisconnected();

    // Reconnect before grace period expires
    await new Promise((resolve) => setTimeout(resolve, 20));
    manager.userConnected();

    // After original grace period would have expired
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(manager.getState()).not.toBe('suspended');
  });

  it('resumes from suspended when user reconnects', async () => {
    manager.start();
    manager.userConnected();
    manager.userDisconnected();

    // Wait for suspension
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(manager.getState()).toBe('suspended');

    // Reconnect
    manager.userConnected();
    expect(manager.getState()).toBe('paused');
  });

  it('reset clears all resource state', () => {
    const resource = createMockResource();
    manager.registerResource(resource);
    manager.start();

    manager.reset();

    expect(resource.resetCalled).toBe(true);
    expect(manager.getState()).toBe('idle');
  });

  it('switchScenario resets pipeline and logs event', () => {
    const resource = createMockResource();
    manager.registerResource(resource);
    manager.start();

    manager.switchScenario('new-scenario');

    expect(resource.resetCalled).toBe(true);
    expect(manager.getState()).toBe('idle');
    const log = manager.getEventLog();
    const switchEvent = log.find((e) => e.type === 'pipeline.scenario_switch');
    expect(switchEvent).toBeDefined();
    expect(switchEvent!.detail).toContain('new-scenario');
  });

  it('destroy releases all resources', () => {
    const resource1 = createMockResource();
    const resource2 = createMockResource();
    manager.registerResource(resource1);
    manager.registerResource(resource2);
    manager.start();

    manager.destroy();

    expect(resource1.destroyCalled).toBe(true);
    expect(resource2.destroyCalled).toBe(true);
    expect(manager.getState()).toBe('destroyed');
  });

  it('cannot start after destroyed', () => {
    manager.destroy();
    const result = manager.start();
    expect(result).toBe(false);
    expect(manager.getState()).toBe('destroyed');
  });

  it('event log tracks all transitions', () => {
    manager.start();
    manager.pause();
    manager.reset();

    const log = manager.getEventLog();
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log.map((e) => e.type)).toContain('pipeline.started');
    expect(log.map((e) => e.type)).toContain('pipeline.paused');
    expect(log.map((e) => e.type)).toContain('pipeline.reset');
  });

  it('onStateChange callback fires on transitions', () => {
    const callback = vi.fn();
    manager.setOnStateChange(callback);

    manager.start();
    expect(callback).toHaveBeenCalledWith('running', expect.objectContaining({ type: 'pipeline.started' }));

    manager.pause();
    expect(callback).toHaveBeenCalledWith('paused', expect.objectContaining({ type: 'pipeline.paused' }));
  });

  it('event log trims to max size', () => {
    const smallManager = new LifecycleManager({ suspendGracePeriodMs: 50, maxEventLogSize: 5 });
    for (let i = 0; i < 10; i++) {
      smallManager.start();
      smallManager.pause();
    }
    expect(smallManager.getEventLog().length).toBeLessThanOrEqual(5);
  });

  it('reset error does not propagate (logged instead)', () => {
    const brokenResource: Disposable = {
      reset() {
        throw new Error('Reset failed');
      },
      destroy() {},
    };
    manager.registerResource(brokenResource);

    // Should not throw
    expect(() => manager.reset()).not.toThrow();
    expect(manager.getState()).toBe('idle');
  });
});
