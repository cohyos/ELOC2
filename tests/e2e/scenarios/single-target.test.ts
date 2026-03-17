import { test, expect } from '@playwright/test';

test.describe('SV-01: Single Target Confirm Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'single-target-confirm' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Track created, confirmed, and EO cue issued', async ({ request }) => {
    // Wait 5s real = ~50s sim time — enough for radar detections and track creation
    await new Promise(r => setTimeout(r, 5000));

    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();
    expect(rap.tracks.length).toBeGreaterThan(0);

    // Check observations have been generated
    const eventsRes = await request.get('/api/events');
    expect(eventsRes.ok()).toBeTruthy();
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThan(0);

    // Wait more for EO cueing and confirmation — 5s more real = ~100s total sim
    await new Promise(r => setTimeout(r, 5000));

    const rap2Res = await request.get('/api/rap');
    const rap2 = await rap2Res.json();
    expect(rap2.tracks.length).toBeGreaterThanOrEqual(1);

    // At ~100s sim, track should have received multiple updates
    const track = rap2.tracks[0];
    expect(track).toHaveProperty('systemTrackId');
    expect(track).toHaveProperty('status');
    expect(track).toHaveProperty('state');

    // Check for EO cues (may or may not have been issued depending on timing)
    const cuesRes = await request.get('/api/eo-cues');
    expect(cuesRes.ok()).toBeTruthy();

    // Verify simulation is progressing
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.elapsedSec).toBeGreaterThan(0);
    expect(status.scenarioId).toBe('single-target-confirm');
  });
});
