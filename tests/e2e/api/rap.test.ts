import { test, expect } from '@playwright/test';

test.describe('RAP Endpoints', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('API-09: GET /api/rap returns object with tracks array and timestamp', async ({ request }) => {
    const res = await request.get('/api/rap');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('tracks');
    expect(Array.isArray(body.tracks)).toBeTruthy();
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('number');
    expect(body).toHaveProperty('trackCount');
    expect(body).toHaveProperty('simTimeSec');
  });

  test('API-10: Start scenario, wait 2s, GET /api/rap has tracks', async ({ request }) => {
    // Reset and start with a known scenario
    await request.post('/api/scenario/reset', {
      data: { scenarioId: 'central-israel' },
    });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');

    // Wait for simulation to produce tracks
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const res = await request.get('/api/rap');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.tracks.length).toBeGreaterThan(0);
  });

  test('API-11: GET /api/events returns array', async ({ request }) => {
    const res = await request.get('/api/events');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('API-12: GET /api/geometry/:id returns 404 for non-existent track', async ({ request }) => {
    const res = await request.get('/api/geometry/nonexistent-track-id');
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});
