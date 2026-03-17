import { test, expect } from '@playwright/test';

test.describe('Scenario Endpoints', () => {
  // Reset scenario state before each test to ensure independence
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('API-02: GET /api/scenarios returns array with >= 9 scenarios', async ({ request }) => {
    const res = await request.get('/api/scenarios');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThanOrEqual(9);
    // Each scenario should have required fields
    for (const scenario of body) {
      expect(scenario).toHaveProperty('id');
      expect(scenario).toHaveProperty('name');
      expect(scenario).toHaveProperty('durationSec');
      expect(scenario).toHaveProperty('sensorCount');
      expect(scenario).toHaveProperty('targetCount');
    }
  });

  test('API-03: GET /api/scenario/status returns valid status', async ({ request }) => {
    const res = await request.get('/api/scenario/status');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('scenarioId');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('speed');
    expect(body).toHaveProperty('elapsedSec');
    expect(body).toHaveProperty('durationSec');
    expect(body).toHaveProperty('trackCount');
    expect(typeof body.running).toBe('boolean');
    expect(typeof body.speed).toBe('number');
  });

  test('API-04: POST /api/scenario/start returns ok with running true', async ({ request }) => {
    const res = await request.post('/api/scenario/start');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.running).toBe(true);
  });

  test('API-05: POST /api/scenario/pause returns ok with running false', async ({ request }) => {
    // Start first so we can pause
    await request.post('/api/scenario/start');
    const res = await request.post('/api/scenario/pause');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.running).toBe(false);
  });

  test('API-06: POST /api/scenario/speed with speed 5 returns success', async ({ request }) => {
    const res = await request.post('/api/scenario/speed', {
      data: { speed: 5 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.speed).toBe(5);
  });

  test('API-07: POST /api/scenario/reset returns ok', async ({ request }) => {
    const res = await request.post('/api/scenario/reset');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('API-08: POST /api/scenario/reset with scenarioId switches scenario', async ({ request }) => {
    const res = await request.post('/api/scenario/reset', {
      data: { scenarioId: 'single-target-confirm' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scenarioId).toBe('single-target-confirm');
  });
});
