import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('API-01: Health check returns 200 with status ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('eloc2-api');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('scenario');
    expect(body).toHaveProperty('running');
    expect(body).toHaveProperty('tracks');
  });
});
