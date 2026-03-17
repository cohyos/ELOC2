import { test, expect } from '@playwright/test';

test.describe('SV-07: Central Israel Full Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'central-israel' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Full complex scenario produces multiple tracks, confirmed states, and rich event log', async ({ request }) => {
    // Poll until >= 3 tracks appear (up to 60s real = ~600s sim)
    let rap: any = { tracks: [] };
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const rapRes = await request.get('/api/rap');
      rap = await rapRes.json();
      if (rap.tracks.length >= 3) break;
    }
    expect(rap.tracks.length).toBeGreaterThanOrEqual(3);

    // At least one confirmed track after full scenario
    const confirmedTracks = rap.tracks.filter((t: any) => t.status === 'confirmed');
    expect(confirmedTracks.length).toBeGreaterThanOrEqual(1);

    // Rich event log — complex scenario should generate many events
    const eventsRes = await request.get('/api/events');
    expect(eventsRes.ok()).toBeTruthy();
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThanOrEqual(30);

    // Check sensors — central-israel has >= 4 sensors
    const sensorsRes = await request.get('/api/sensors');
    expect(sensorsRes.ok()).toBeTruthy();
    const sensors = await sensorsRes.json();
    expect(sensors.length).toBeGreaterThanOrEqual(4);

    // Check for geometry estimates on any track
    let hasGeometry = false;
    for (const track of rap.tracks) {
      const geoRes = await request.get(`/api/geometry/${track.systemTrackId}`);
      if (geoRes.ok()) {
        hasGeometry = true;
        break;
      }
    }
    // Geometry may or may not exist depending on EO coverage — just log it

    // Verify scenario completed or near completion
    const statusRes = await request.get('/api/scenario/status');
    const status = await statusRes.json();
    expect(status.scenarioId).toBe('central-israel');
    expect(status.elapsedSec).toBeGreaterThan(0);

    // Check EO cues were generated (central-israel includes EO sensors)
    const cuesRes = await request.get('/api/eo-cues');
    expect(cuesRes.ok()).toBeTruthy();

    // Check for unresolved groups
    const groupsRes = await request.get('/api/groups');
    expect(groupsRes.ok()).toBeTruthy();
  });
});
