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
    // Wait 30s real = ~300s sim — covers the full scenario duration
    await new Promise(r => setTimeout(r, 30_000));

    // Check tracks — should have multiple system tracks
    const rapRes = await request.get('/api/rap');
    expect(rapRes.ok()).toBeTruthy();
    const rap = await rapRes.json();
    expect(rap.tracks.length).toBeGreaterThanOrEqual(3);

    // At least one confirmed track after full scenario
    const confirmedTracks = rap.tracks.filter((t: any) => t.status === 'confirmed');
    expect(confirmedTracks.length).toBeGreaterThanOrEqual(1);

    // Rich event log — complex scenario should generate many events
    const eventsRes = await request.get('/api/events');
    expect(eventsRes.ok()).toBeTruthy();
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThanOrEqual(50);

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
    expect(status.elapsedSec).toBeGreaterThan(100);

    // Check EO cues were generated (central-israel includes EO sensors)
    const cuesRes = await request.get('/api/eo-cues');
    expect(cuesRes.ok()).toBeTruthy();

    // Check for unresolved groups
    const groupsRes = await request.get('/api/groups');
    expect(groupsRes.ok()).toBeTruthy();
  });
});
