import { test, expect } from '@playwright/test';

test.describe('Replay & Validation Endpoints', () => {
  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('API-22: POST /api/replay/seek with valid timeSec succeeds', async ({ request }) => {
    // Start a scenario first so there is state to seek through
    await request.post('/api/scenario/start');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const res = await request.post('/api/replay/seek', {
      data: { timeSec: 10 },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('elapsedSec');
  });

  test('API-23: POST /api/scenario/speed with negative speed returns 400', async ({ request }) => {
    const res = await request.post('/api/scenario/speed', {
      data: { speed: -1 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('API-24: POST /api/replay/seek with negative timeSec returns 400', async ({ request }) => {
    const res = await request.post('/api/replay/seek', {
      data: { timeSec: -5 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});
