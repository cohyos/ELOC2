import { test, expect } from '@playwright/test';

test.describe('Sensor Endpoints', () => {
  test('API-13: GET /api/sensors returns array of sensors', async ({ request }) => {
    const res = await request.get('/api/sensors');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    // Each sensor should have standard fields
    for (const sensor of body) {
      expect(sensor).toHaveProperty('sensorId');
      expect(sensor).toHaveProperty('sensorType');
    }
  });

  test('API-14: GET /api/sensors/:id/registration returns registration state', async ({ request }) => {
    // First get the list of sensors to find a valid ID
    const sensorsRes = await request.get('/api/sensors');
    const sensors = await sensorsRes.json();

    if (sensors.length === 0) {
      test.skip(true, 'No sensors available — scenario may not be loaded');
      return;
    }

    const sensorId = sensors[0].sensorId;
    const res = await request.get(`/api/sensors/${sensorId}/registration`);

    // Registration state might not exist for all sensors
    if (res.status() === 404) {
      const body = await res.json();
      expect(body).toHaveProperty('error');
    } else {
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body).toHaveProperty('sensorId');
      expect(body.sensorId).toBe(sensorId);
    }
  });
});
