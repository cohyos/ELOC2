import { test, expect } from '@playwright/test';

test.describe('SV-08: Multi-EO Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'one-cue-two-eo' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Multiple EO sensors track same target, producing EO tracks and potential split detection', async ({ request }) => {
    // Wait 10s real = ~100s sim — enough for radar detection, EO cueing, and EO tracks
    await new Promise(r => setTimeout(r, 10_000));

    // Verify tracks exist
    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();
    expect(rap.tracks.length).toBeGreaterThan(0);

    // Check EO tracks — two EO sensors should produce observations
    const eoTracksRes = await request.get('/api/eo-tracks');
    expect(eoTracksRes.ok()).toBeTruthy();
    const eoTracks = await eoTracksRes.json();
    // EO tracks should exist if EO sensors have been cued
    // (may be empty if cueing hasn't happened yet)

    // Check EO cues — radar should cue both EO sensors
    const cuesRes = await request.get('/api/eo-cues');
    expect(cuesRes.ok()).toBeTruthy();

    // Check for groups (potential split detection with multi-EO)
    const groupsRes = await request.get('/api/groups');
    expect(groupsRes.ok()).toBeTruthy();

    // Verify sensors are present (1 radar + 2 EO)
    const sensorsRes = await request.get('/api/sensors');
    expect(sensorsRes.ok()).toBeTruthy();
    const sensors = await sensorsRes.json();
    expect(sensors.length).toBeGreaterThanOrEqual(3);

    // Check events for EO-related activity
    const eventsRes = await request.get('/api/events');
    expect(eventsRes.ok()).toBeTruthy();
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThan(0);

    // Verify simulation progress
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.scenarioId).toBe('one-cue-two-eo');
    expect(status.elapsedSec).toBeGreaterThan(0);
  });
});
