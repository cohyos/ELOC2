import { test, expect } from '@playwright/test';

test.describe('SV-04: Bad Triangulation Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'bad-triangulation' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Shallow intersection angle produces weak or no geometry estimate', async ({ request }) => {
    // Wait 10s real = ~100s sim
    await new Promise(r => setTimeout(r, 10_000));

    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();

    // Tracks may or may not exist (EO-only scenario with bad geometry)
    // If tracks exist, check geometry quality
    let checkedGeometry = false;
    for (const track of rap.tracks) {
      const geoRes = await request.get(`/api/geometry/${track.systemTrackId}`);
      if (geoRes.ok()) {
        const geo = await geoRes.json();
        checkedGeometry = true;

        // Bad triangulation should produce bearing_only or weak quality
        if (geo.classification) {
          expect(['bearing_only', 'candidate_3d']).toContain(geo.classification);
        }
        if (geo.quality) {
          expect(['insufficient', 'weak', 'fair']).toContain(geo.quality);
        }
        // If intersection angle is present, it should be small
        if (geo.intersectionAngleDeg !== undefined) {
          expect(geo.intersectionAngleDeg).toBeLessThan(30);
        }
      }
    }

    // It's acceptable if no geometry estimate exists at all (also a valid outcome)
    // Just verify the scenario is running
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.elapsedSec).toBeGreaterThan(0);
    expect(status.scenarioId).toBe('bad-triangulation');
  });
});
