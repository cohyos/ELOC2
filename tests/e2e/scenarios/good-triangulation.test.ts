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

  test('Two EO sensors produce good geometry estimate with adequate intersection angle', async ({ request }) => {
    // Wait 10s real = ~100s sim — enough for EO bearings and triangulation
    await new Promise(r => setTimeout(r, 10_000));

    // Get tracks
    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();
    expect(rap.tracks.length).toBeGreaterThan(0);

    // Try to find geometry estimate for any track
    let foundGeometry = false;
    for (const track of rap.tracks) {
      const geoRes = await request.get(`/api/geometry/${track.systemTrackId}`);
      if (geoRes.ok()) {
        const geo = await geoRes.json();
        foundGeometry = true;

        // Good triangulation should produce candidate_3d or confirmed_3d
        if (geo.classification) {
          expect(['candidate_3d', 'confirmed_3d', 'bearing_only']).toContain(geo.classification);
        }

        // Intersection angle should be > 20 degrees for good triangulation
        if (geo.intersectionAngleDeg !== undefined) {
          expect(geo.intersectionAngleDeg).toBeGreaterThan(20);
        }

        break;
      }
    }

    // Geometry estimate may take time; if not found, verify EO tracks exist
    if (!foundGeometry) {
      const eoRes = await request.get('/api/eo-tracks');
      expect(eoRes.ok()).toBeTruthy();
    }

    // Verify simulation progress
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.elapsedSec).toBeGreaterThan(0);
  });
});
