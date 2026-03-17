import { test, expect } from '@playwright/test';

test.describe('Task Endpoints', () => {
  test('API-15: GET /api/tasks returns array', async ({ request }) => {
    const res = await request.get('/api/tasks');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('API-16: POST /api/operator/approve with invalid taskId returns 404', async ({ request }) => {
    const res = await request.post('/api/operator/approve', {
      data: { taskId: 'nonexistent-task' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('API-17: POST /api/operator/reject with invalid taskId returns 404', async ({ request }) => {
    const res = await request.post('/api/operator/reject', {
      data: { taskId: 'nonexistent-task' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('API-18: POST /api/operator/reserve with valid sensorId returns reservation', async ({ request }) => {
    // Get a sensor ID to reserve
    const sensorsRes = await request.get('/api/sensors');
    const sensors = await sensorsRes.json();

    if (sensors.length === 0) {
      // No sensors: just test graceful handling
      const res = await request.post('/api/operator/reserve', {
        data: { sensorId: 'nonexistent-sensor' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(false);
    } else {
      const sensorId = sensors[0].sensorId;
      const res = await request.post('/api/operator/reserve', {
        data: { sensorId },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.reserved).toBe(true);
      expect(body.sensorId).toBe(sensorId);
    }
  });
});
