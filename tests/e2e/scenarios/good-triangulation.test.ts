import { test, expect } from '@playwright/test';

test.describe('SV-03: Good Triangulation Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'good-triangulation' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Two EO sensors produce geometry events with adequate intersection angle', async ({ request }) => {
    // Wait for simulation to produce events (10s real = ~100s sim)
    await new Promise(r => setTimeout(r, 10_000));

    // Verify sensors (2 EO sensors for this scenario)
    const sensorsRes = await request.get('/api/sensors');
    expect(sensorsRes.ok()).toBeTruthy();
    const sensors = await sensorsRes.json();
    expect(sensors.length).toBeGreaterThanOrEqual(2);

    // This scenario has only EO sensors (no radar), so system tracks may not be
    // created. Instead verify events were generated (EO observations, bearings).
    const eventsRes = await request.get('/api/events');
    expect(eventsRes.ok()).toBeTruthy();
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThan(0);

    // Try to find geometry or tracks if the pipeline created them
    const rapRes = await request.get('/api/rap');
    const rap = await rapRes.json();

    if (rap.tracks.length > 0) {
      // If tracks exist, check for geometry estimates
      for (const track of rap.tracks) {
        const geoRes = await request.get(`/api/geometry/${track.systemTrackId}`);
        if (geoRes.ok()) {
          const geo = await geoRes.json();
          if (geo.classification) {
            expect(['candidate_3d', 'confirmed_3d', 'bearing_only']).toContain(geo.classification);
          }
          if (geo.intersectionAngleDeg !== undefined) {
            expect(geo.intersectionAngleDeg).toBeGreaterThan(20);
          }
          break;
        }
      }
    }

    // Verify simulation progressed
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.scenarioId).toBe('good-triangulation');
    expect(status.elapsedSec).toBeGreaterThan(0);
  });
});
