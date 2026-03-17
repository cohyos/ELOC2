import { test, expect } from '@playwright/test';

test.describe('SV-02: Crossed Tracks Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'crossed-tracks' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Two targets create distinct tracks that are not incorrectly merged', async ({ request }) => {
    // Wait 5s real = ~50s sim — both targets should be detected by both radars
    await new Promise(r => setTimeout(r, 5000));

    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();

    // Should have at least 2 tracks (one per target)
    expect(rap.tracks.length).toBeGreaterThanOrEqual(2);

    // Tracks should have different IDs (not incorrectly merged)
    const trackIds = rap.tracks.map((t: any) => t.systemTrackId);
    const uniqueIds = new Set(trackIds);
    expect(uniqueIds.size).toBe(trackIds.length);

    // Wait until mid-scenario when tracks cross (~150s sim, so ~10s more real)
    await new Promise(r => setTimeout(r, 5000));

    const rap2Res = await request.get('/api/rap');
    const rap2 = await rap2Res.json();

    // After crossing, should still maintain separate tracks
    expect(rap2.tracks.length).toBeGreaterThanOrEqual(2);

    // Verify IDs remain distinct
    const trackIds2 = rap2.tracks.map((t: any) => t.systemTrackId);
    const uniqueIds2 = new Set(trackIds2);
    expect(uniqueIds2.size).toBe(trackIds2.length);

    // Verify simulation is progressing
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.elapsedSec).toBeGreaterThan(0);
  });
});
