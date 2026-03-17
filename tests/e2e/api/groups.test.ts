import { test, expect } from '@playwright/test';

test.describe('Group & EO Endpoints', () => {
  test('API-19: GET /api/groups returns array', async ({ request }) => {
    const res = await request.get('/api/groups');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('API-20: GET /api/eo-cues returns array', async ({ request }) => {
    const res = await request.get('/api/eo-cues');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('API-21: GET /api/eo-tracks returns array', async ({ request }) => {
    const res = await request.get('/api/eo-tracks');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });
});
