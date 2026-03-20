/**
 * Integration tests for REQ-17 through REQ-23 — Instructor UX features.
 *
 * REQ-17: No auto-start on user connect
 * REQ-18: Gated auto-inject
 * REQ-19: Dual report types (operator vs instructor)
 * REQ-20: Instructor slot enforcement / role protocol
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';
import { generateReport } from '../reports/report-generator.js';

// ---------------------------------------------------------------------------
// Helper — advance engine to a given simulation time synchronously
// ---------------------------------------------------------------------------

function advanceTo(engine: LiveEngine, toSec: number): void {
  const sm = engine.getSimulationState();
  if (sm.state === 'idle') {
    engine.start();
    engine.pause();
  } else if (sm.state === 'running') {
    engine.pause();
  }
  engine.seek(toSec);
}

// ---------------------------------------------------------------------------
// Mock WebSocket client
// ---------------------------------------------------------------------------

function createMockWsClient(): { send: (data: string) => void; messages: string[] } {
  const messages: string[] = [];
  return {
    send: (data: string) => { messages.push(data); },
    messages,
  };
}

// ---------------------------------------------------------------------------
// 1. REQ-17: No Auto-Start
// ---------------------------------------------------------------------------

describe('REQ-17: No auto-start', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
  });

  it('engine stays idle when first user connects', () => {
    const client = createMockWsClient();
    engine.addWsClient(client);

    const simState = engine.getSimulationState();
    expect(simState.state).toBe('idle');
    // autoLoopEnabled should be false — engine should not have started
    const snap = engine.getFullSnapshot();
    expect(snap.autoLoopEnabled).toBe(false);
    expect(snap.running).toBe(false);
  });

  it('engine stays idle when multiple users connect', () => {
    const client1 = createMockWsClient();
    const client2 = createMockWsClient();
    engine.addWsClient(client1, 'operator');
    engine.addWsClient(client2, 'operator');

    const simState = engine.getSimulationState();
    expect(simState.state).toBe('idle');
    expect(engine.getFullSnapshot().running).toBe(false);
  });

  it('startAutoLoop() can be called manually', () => {
    engine.startAutoLoop();

    const snap = engine.getFullSnapshot();
    expect(snap.autoLoopEnabled).toBe(true);

    // Cleanup: stop the auto-loop so timers don't leak
    engine.stopAutoLoop();
  });

  it('stopAutoLoop() disables auto-loop', () => {
    engine.startAutoLoop();
    expect(engine.getFullSnapshot().autoLoopEnabled).toBe(true);

    engine.stopAutoLoop();
    expect(engine.getFullSnapshot().autoLoopEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. REQ-18: Gated Auto-Inject
// ---------------------------------------------------------------------------

describe('REQ-18: Gated auto-inject', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
  });

  it('auto-inject is disabled by default', () => {
    expect(engine.isAutoInjectEnabled()).toBe(false);
  });

  it('enableAutoInject() enables injection', () => {
    engine.enableAutoInject();
    expect(engine.isAutoInjectEnabled()).toBe(true);

    // Cleanup
    engine.disableAutoInject();
  });

  it('disableAutoInject() stops injection', () => {
    engine.enableAutoInject();
    expect(engine.isAutoInjectEnabled()).toBe(true);

    engine.disableAutoInject();
    expect(engine.isAutoInjectEnabled()).toBe(false);
  });

  it('auto-inject remains disabled after engine reset', () => {
    engine.enableAutoInject();
    engine.reset('central-israel');
    expect(engine.isAutoInjectEnabled()).toBe(false);
  });

  it('stopAutoLoop() also disables auto-inject', () => {
    engine.startAutoLoop();
    engine.enableAutoInject();
    expect(engine.isAutoInjectEnabled()).toBe(true);

    engine.stopAutoLoop();
    expect(engine.isAutoInjectEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. REQ-19: Dual Report Types
// ---------------------------------------------------------------------------

describe('REQ-19: Dual report types', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
    advanceTo(engine, 60);
  });

  it('generates operator report without GT or situational awareness sections', () => {
    const report = generateReport(engine, { type: 'operator' });
    expect(report.type).toBe('operator');
    expect(report.content).toContain('Operator Report');
    // Operator reports exclude ground truth and situational awareness
    expect(report.content).not.toContain('Ground Truth Summary');
    expect(report.content).not.toContain('Situational Awareness Assessment');
  });

  it('generates instructor report with all sections', () => {
    const report = generateReport(engine, { type: 'instructor' });
    expect(report.type).toBe('instructor');
    expect(report.content).toContain('Instructor Report');
    // Instructor reports include ground truth and situational awareness
    expect(report.content).toContain('Ground Truth Summary');
    expect(report.content).toContain('Situational Awareness Assessment');
  });

  it('both report types contain common sections', () => {
    const opReport = generateReport(engine, { type: 'operator' });
    const instrReport = generateReport(engine, { type: 'instructor' });

    // Both should have scenario definition and conclusions
    for (const report of [opReport, instrReport]) {
      expect(report.content).toContain('Scenario Definition');
      expect(report.content).toContain('Conclusions');
      expect(report.id).toBeTruthy();
      expect(report.generatedAt).toBeGreaterThan(0);
    }
  });

  it('instructor report includes quality metrics section', () => {
    const report = generateReport(engine, { type: 'instructor' });
    expect(report.content).toContain('Quality Metrics');
  });

  it('operator report excludes quality metrics section', () => {
    const report = generateReport(engine, { type: 'operator' });
    expect(report.content).not.toContain('Quality Metrics');
  });
});

// ---------------------------------------------------------------------------
// 4. REQ-20: Instructor Slot Enforcement / Role Protocol
// ---------------------------------------------------------------------------

describe('REQ-20: Instructor slot enforcement', () => {
  let engine: LiveEngine;

  beforeEach(() => {
    engine = new LiveEngine('central-israel');
  });

  it('getConnectedUsers() starts at zero', () => {
    const users = engine.getConnectedUsers();
    expect(users.total).toBe(0);
    expect(users.instructors).toBe(0);
    expect(users.operators).toBe(0);
  });

  it('getConnectedUsers() tracks instructor role correctly', () => {
    const client = createMockWsClient();
    engine.addWsClient(client, 'instructor');

    const users = engine.getConnectedUsers();
    expect(users.total).toBe(1);
    expect(users.instructors).toBe(1);
    expect(users.operators).toBe(0);
  });

  it('getConnectedUsers() tracks operator role correctly', () => {
    const client = createMockWsClient();
    engine.addWsClient(client, 'operator');

    const users = engine.getConnectedUsers();
    expect(users.total).toBe(1);
    expect(users.instructors).toBe(0);
    expect(users.operators).toBe(1);
  });

  it('getConnectedUsers() tracks mixed roles correctly', () => {
    const instructor = createMockWsClient();
    const operator1 = createMockWsClient();
    const operator2 = createMockWsClient();
    engine.addWsClient(instructor, 'instructor');
    engine.addWsClient(operator1, 'operator');
    engine.addWsClient(operator2, 'operator');

    const users = engine.getConnectedUsers();
    expect(users.total).toBe(3);
    expect(users.instructors).toBe(1);
    expect(users.operators).toBe(2);
  });

  it('defaults to anonymous role when role not specified', () => {
    const client = createMockWsClient();
    engine.addWsClient(client);

    const users = engine.getConnectedUsers();
    expect(users.total).toBe(1);
    expect(users.instructors).toBe(0);
    expect(users.operators).toBe(0);
  });

  it('getConnectedUsersList() returns client details', () => {
    const instructor = createMockWsClient();
    const operator = createMockWsClient();
    engine.addWsClient(instructor, 'instructor');
    engine.addWsClient(operator, 'operator');

    const list = engine.getConnectedUsersList();
    expect(list.length).toBe(2);

    // Each entry should have id, role, and connectedAt
    for (const entry of list) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.role).toBe('string');
      expect(typeof entry.connectedAt).toBe('number');
      expect(entry.connectedAt).toBeGreaterThan(0);
    }

    // Verify roles are present
    const roles = list.map(e => e.role);
    expect(roles).toContain('instructor');
    expect(roles).toContain('operator');
  });

  it('removeWsClient() decrements user count', () => {
    const client = createMockWsClient();
    engine.addWsClient(client, 'instructor');
    expect(engine.getConnectedUsers().total).toBe(1);

    engine.removeWsClient(client);
    expect(engine.getConnectedUsers().total).toBe(0);
    expect(engine.getConnectedUsers().instructors).toBe(0);
  });

  it('broadcasts user count when client connects', () => {
    const existingClient = createMockWsClient();
    engine.addWsClient(existingClient, 'operator');

    // Clear any messages from first connection
    existingClient.messages.length = 0;

    const newClient = createMockWsClient();
    engine.addWsClient(newClient, 'instructor');

    // Existing client should have received a user.count message
    const countMsg = existingClient.messages.find(m => {
      try {
        const parsed = JSON.parse(m);
        return parsed.type === 'user.count';
      } catch { return false; }
    });
    expect(countMsg).toBeDefined();
    if (countMsg) {
      const parsed = JSON.parse(countMsg);
      expect(parsed.total).toBe(2);
    }
  });

  it('connectedUsers is included in full snapshot', () => {
    const client = createMockWsClient();
    engine.addWsClient(client, 'instructor');

    const snap = engine.getFullSnapshot();
    expect(snap.connectedUsers).toBeDefined();
    expect(snap.connectedUsers.total).toBe(1);
    expect(snap.connectedUsers.instructors).toBe(1);
  });
});
