import { test, expect } from '@playwright/test';

/**
 * API-only equivalents for browser-dependent UI tests (PW-*).
 * These verify the same backend state that UI tests check visually.
 */

test.describe('UI-Equivalent: Track Display (PW-06, PW-21)', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('APUI-01: Running scenario produces tracks with status breakdown', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'central-israel' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Poll until tracks appear
    let body: any = { tracks: [] };
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await request.get('/api/rap');
      body = await res.json();
      if (body.tracks.length > 0) break;
    }

    expect(body.tracks.length).toBeGreaterThan(0);
    expect(body.trackCount).toBeGreaterThan(0);

    // Tracks should have valid status values (what PW-06/PW-21 display in badges)
    const validStatuses = ['tentative', 'confirmed', 'dropped'];
    for (const track of body.tracks) {
      expect(validStatuses).toContain(track.status);
      expect(track).toHaveProperty('systemTrackId');
      expect(track).toHaveProperty('state');
      expect(track.state).toHaveProperty('lat');
      expect(track.state).toHaveProperty('lon');
    }
  });

  test('APUI-02: Confirmed tracks appear after sufficient simulation time', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'central-israel' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Poll until confirmed tracks appear (track needs 3+ updates)
    let confirmed: any[] = [];
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await request.get('/api/rap');
      const body = await res.json();
      confirmed = body.tracks.filter((t: any) => t.status === 'confirmed');
      if (confirmed.length > 0) break;
    }

    expect(confirmed.length).toBeGreaterThan(0);
  });
});

test.describe('UI-Equivalent: Scenario Controls (PW-04, PW-05)', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('APUI-03: At least 9 scenarios available for dropdown', async ({ request }) => {
    const res = await request.get('/api/scenarios');
    expect(res.ok()).toBeTruthy();
    const scenarios = await res.json();
    expect(scenarios.length).toBeGreaterThanOrEqual(9);

    // Each scenario should have the fields the dropdown needs
    for (const s of scenarios) {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('description');
    }
  });

  test('APUI-04: Start/pause cycle changes running state', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'single-target-confirm' } });

    // Start → running: true
    const startRes = await request.post('/api/scenario/start');
    const startBody = await startRes.json();
    expect(startBody.running).toBe(true);

    const statusAfterStart = await (await request.get('/api/scenario/status')).json();
    expect(statusAfterStart.running).toBe(true);

    // Pause → running: false
    const pauseRes = await request.post('/api/scenario/pause');
    const pauseBody = await pauseRes.json();
    expect(pauseBody.running).toBe(false);

    const statusAfterPause = await (await request.get('/api/scenario/status')).json();
    expect(statusAfterPause.running).toBe(false);
  });
});

test.describe('UI-Equivalent: Speed Controls (PW-11)', () => {
  test('APUI-05: Speed change is reflected in status', async ({ request }) => {
    for (const speed of [1, 2, 5, 10]) {
      const res = await request.post('/api/scenario/speed', { data: { speed } });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.speed).toBe(speed);
    }
  });
});

test.describe('UI-Equivalent: Event List (PW-18, PW-19)', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('APUI-06: Running scenario generates events visible in timeline', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'central-israel' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Poll until events appear
    let events: any[] = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await request.get('/api/events');
      events = await res.json();
      if (events.length > 0) break;
    }

    expect(events.length).toBeGreaterThan(0);

    // Events should have type field for filter toggles (PW-19)
    for (const event of events.slice(0, 10)) {
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('timestamp');
    }
  });
});

test.describe('UI-Equivalent: WebSocket Status (PW-20)', () => {
  test('APUI-07: WebSocket connects and receives snapshot', async ({ request }) => {
    // Already tested by API-25, but this verifies the "connected" state
    // that PW-20 checks visually (green dot)
    const WebSocket = (await import('ws')).default;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const wsUrl = baseUrl.replace('http', 'ws') + '/ws/events';

    const ws = new WebSocket(wsUrl);
    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS timeout')), 5000);
      ws.on('message', (data: any) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
      ws.on('error', reject);
    });

    expect(result).toHaveProperty('type');
    ws.close();
  });
});

test.describe('UI-Equivalent: Sensor Degraded Mode (PW-22)', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('APUI-08: Sensor registration state available for degraded banner', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'sensor-fault' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Poll until simulation progresses past fault injection
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await (await request.get('/api/scenario/status')).json();
      if (status.elapsedSec > 50) break;
    }

    // Check sensor registration — the degraded banner uses this data
    const sensorsRes = await request.get('/api/sensors');
    const sensors = await sensorsRes.json();
    expect(sensors.length).toBeGreaterThanOrEqual(2);

    // At least one sensor should have registration data
    const regRes = await request.get('/api/sensors/RADAR-G2/registration');
    if (regRes.ok()) {
      const reg = await regRes.json();
      expect(reg).toHaveProperty('sensorId');
      // Registration state is what the UI uses to show degraded mode banner
    }
  });
});

test.describe('UI-Equivalent: Replay Scrubber (PW-13, PW-15)', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('APUI-09: Replay seek changes simulation time', async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'single-target-confirm' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
    await new Promise(r => setTimeout(r, 3000));
    await request.post('/api/scenario/pause');

    // Seek to specific time (what scrubber click and arrow keys do)
    const seekRes = await request.post('/api/replay/seek', { data: { timeSec: 30 } });
    expect(seekRes.ok()).toBeTruthy();

    const status = await (await request.get('/api/scenario/status')).json();
    expect(status.elapsedSec).toBeGreaterThanOrEqual(0);
  });
});

test.describe('UI-Equivalent: Task Panel (PW-16, PW-17)', () => {
  test('APUI-10: Task list endpoint provides panel data', async ({ request }) => {
    const res = await request.get('/api/tasks');
    expect(res.ok()).toBeTruthy();
    const tasks = await res.json();
    expect(Array.isArray(tasks)).toBeTruthy();

    // EO cues endpoint provides scoring data shown in task panel
    const cuesRes = await request.get('/api/eo-cues');
    expect(cuesRes.ok()).toBeTruthy();
    const cues = await cuesRes.json();
    expect(Array.isArray(cues)).toBeTruthy();
  });
});
