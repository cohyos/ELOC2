# Blank Map Post-Mortem & Testing Lessons Learned

## Date: 2026-03-18
## Severity: HIGH — Demo-blocking
## Component: `apps/workstation` — Map rendering pipeline

---

## 1. Incident Summary

**What happened:** After deploying to Cloud Run, the ELOC2 workstation map showed zero visual objects — no track circles, no sensor markers, no coverage arcs, no EO rays — despite the right panel correctly showing 5+ tracks and 6 sensors online. The map tiles (CartoDB Dark Matter) rendered fine.

**Impact:** Complete loss of the core visual output. The system appeared broken to any observer even though all backend fusion, tasking, and geometry pipelines were working correctly.

**Time to detect:** The bug existed from the first production deployment. It was never caught by any automated test. It was masked for weeks by the DebugOverlay (an HTML-based fallback renderer) which was mistakenly left as the only functional rendering path.

**Time to fix:** ~2 hours of investigation across multiple rounds before the root cause was identified.

---

## 2. Root Cause Analysis

### 2.1 The Immediate Bug

MapLibre GL JS v5.20.1 circle layers (`system-tracks-layer`, `sensors-layer`) were initialized correctly but **never rendered visible pixels on the WebGL canvas** in the production deployment.

### 2.2 The Underlying Mechanism

The MapLibre map style includes a `glyphs` URL pointing to an external CDN:

```javascript
glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf'
```

During `initTrackLayer()` and `initSensorLayer()`, symbol (text label) layers were added with `visibility: 'visible'` (MapLibre default). This triggered **immediate glyph loading** from the CDN. When the CDN was slow, unreachable, or returned errors (CORS, rate-limiting, network latency), the MapLibre WebGL render pipeline stalled — preventing ALL data layers (circles, lines, fills) from rendering.

Raster tile layers were unaffected because they use a separate rendering path.

### 2.3 Why It Worked Locally but Failed in Production

| Environment | Glyph CDN Status | Result |
|-------------|-----------------|--------|
| Local dev (Vite) | Cached from previous loads | Glyphs load instantly → layers render ✓ |
| Cloud Run (Docker) | Cold start, no cache | Glyph request may timeout/fail → stall ✗ |
| User's browser | Depends on network/ISP | Inconsistent behavior ✗ |

### 2.4 The Masking Factor

The DebugOverlay (`DebugOverlay.tsx`) was an HTML-based fallback that rendered tracks and sensors as positioned `<div>` elements using `map.project()`. It was introduced in Round 1 as a "diagnostic tool" but became the **only functional rendering path**. Because it showed objects on the map, the MapLibre layer failure went undetected.

The overlay had several issues of its own:
- Showed full UUID strings instead of short labels
- Ignored the layer visibility filter panel
- Markers were not clickable (no track/sensor selection)
- Was documented as "gated behind `?debug=1`" but code actually showed it by default

---

## 3. What Testing Missed — and Why

### 3.1 Test Coverage Map

| Layer | Tests Exist | Coverage | Caught This Bug? |
|-------|------------|----------|-----------------|
| Fusion core (packages/fusion-core) | 29 unit tests | High | N/A — backend only |
| EO investigation (packages/eo-investigation) | 63 unit tests | High | N/A — backend only |
| Geometry (packages/geometry) | 5 unit tests | Medium | N/A — backend only |
| Registration (packages/registration) | 23 unit tests | High | N/A — backend only |
| Tasking (packages/eo-tasking) | 22 unit tests | High | N/A — backend only |
| Simulator (apps/simulator) | 45 unit tests | High | N/A — backend only |
| Validation (packages/validation) | 30 unit tests | High | N/A — backend only |
| **Workstation (apps/workstation)** | **0 unit tests** | **None** | **No** |
| **API (apps/api)** | **0 unit tests** | **None** | **No** |
| E2E page load | 3 Playwright tests | Low | **No** — only checks canvas exists |
| E2E screenshots | 1 test | Minimal | **No** — screenshot saved but not inspected |
| CI/CD pipeline | Health check only | Minimal | **No** — only checks HTTP 200 |

### 3.2 The Five Gaps

**Gap 1: Zero frontend component tests**

```json
// apps/workstation/package.json
"test": "echo No tests"
```

No React component tests, no Zustand store tests, no MapLibre layer tests. The entire frontend was "tested by visual inspection only."

**Gap 2: Screenshot test with no assertion**

The E2E suite takes a screenshot (`PW-27`) but never compares it to a baseline. The test _passes_ whether the map shows 50 tracks or zero:

```typescript
// What exists:
await page.screenshot({ path: 'output/screenshots/desktop-stable.png' });
// ✓ Test passes — file was created

// What should exist:
await expect(page).toHaveScreenshot('map-stable-state.png', {
  maxDiffPixels: 500
});
// ✗ Would FAIL if tracks disappeared
```

**Gap 3: No data-on-map verification**

The Playwright tests check that the header shows "5 total" (track count text), but never verify that the map canvas contains visual elements corresponding to that data. The right panel and the map rendering are completely independent paths — testing one doesn't validate the other.

**Gap 4: CI/CD tests disabled**

```yaml
# cloudbuild.yaml
# NOTE: Unit tests, integration tests, and E2E tests are disabled during
# this deployment phase.
```

Deployments are gated only on Docker build success + health check endpoint. No test suite runs before code reaches production.

**Gap 5: Silent error handling**

```typescript
try {
  map.addLayer({ id: LABEL_LAYER_ID, type: 'symbol', ... });
} catch (e) {
  console.warn('[track-layer] Label layer failed:', e);
  // ← Continues silently. No metric. No alert. No fallback.
}
```

Errors in map layer initialization are caught and logged to `console.warn` — which is invisible in production unless someone opens DevTools. No error reporting, no health metric, no user-visible indicator.

---

## 4. The Fix Applied

### Part 1: Reliable HTML Renderer (DebugOverlay)

The DebugOverlay was restored as the **primary track/sensor renderer** but properly fixed:

| Before | After |
|--------|-------|
| Full UUID labels (`7f4deb33-7c52-49b0...`) | Short labels (`T1`, `R1`, `E2`) |
| Ignored layer visibility filters | Respects `layerVisibility` store |
| Ignored track status filters | Respects `trackStatusFilter` |
| Non-clickable markers | Click triggers `selectTrack()`/`selectSensor()` |
| Always shown, no gating | Shown by default, disable with `?nodebug` |

### Part 2: MapLibre Glyph Stall Prevention

Symbol layers now initialize with `visibility: 'none'` and `text-optional: true`:

```typescript
layout: {
  'text-font': ['Open Sans Bold'],
  'text-optional': true,     // ← render even if glyphs missing
  'visibility': 'none',      // ← don't load glyphs on init
}
```

This matches the UI store defaults (`trackLabels: false`, `sensorLabels: false`) and prevents glyph CDN loading from stalling the WebGL pipeline.

### Part 3: Layer Visibility Unification

Merged the demo mode visibility effect and the layer filter visibility effect into a single `useEffect`, preventing conflicts where demo mode would hide layers and the filter panel couldn't restore them.

---

## 5. Testing Rules — Mandatory for Future Development

### Rule 1: No Deployment Without Visual Regression Test

Every deployment must include a Playwright visual regression test that:
- Starts the scenario, waits for stable state (15s at 10x)
- Takes a screenshot
- **Compares against a checked-in baseline** using `toHaveScreenshot()`
- Fails the build if the diff exceeds threshold

```typescript
test('PW-27: Map renders tracks and sensors', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => fetch('/api/scenario/start', { method: 'POST' }));
  await page.waitForTimeout(15000);
  await expect(page).toHaveScreenshot('map-stable.png', { maxDiffPixels: 500 });
});
```

### Rule 2: Data-Presence Assertion on Map

After scenario runs, verify that the map area contains visual markers:

```typescript
test('PW-30: Track markers visible on map', async ({ page }) => {
  // Start scenario and wait
  await page.evaluate(() => fetch('/api/scenario/start', { method: 'POST' }));
  await page.waitForTimeout(10000);

  // Count HTML overlay markers (DebugOverlay renders clickable divs)
  const trackMarkers = await page.locator('.map-container div[title^="T"]').count();
  expect(trackMarkers).toBeGreaterThan(0);

  // Verify the count matches the panel
  const panelCount = await page.locator('text=/\\d+ total/').textContent();
  const expected = parseInt(panelCount?.match(/(\d+)/)?.[1] ?? '0');
  expect(trackMarkers).toBeGreaterThanOrEqual(expected - 2); // allow small diff
});
```

### Rule 3: External CDN Health Check in Build

Any external CDN dependency (fonts, tiles, sprites) must be validated during the Docker build:

```dockerfile
# In Dockerfile, during build stage:
RUN curl -sf --max-time 5 \
  'https://fonts.openmaptiles.org/Open%20Sans%20Bold/0-255.pbf' \
  -o /dev/null \
  || echo "WARNING: Glyph CDN unreachable — labels may not render"
```

### Rule 4: No Silent Catches in Rendering Pipeline

Replace `console.warn` catches with observable error state:

```typescript
// BAD:
try { map.addLayer(...) } catch (e) { console.warn(e); }

// GOOD:
try { map.addLayer(...) } catch (e) {
  console.error('[RENDER FAIL]', e);
  useUiStore.getState().addRenderError(layerId, e.message);
  // UI shows degraded-mode banner
}
```

### Rule 5: Frontend Component Tests for Critical Paths

The following must have unit tests before any future release:

| Component | What to Test |
|-----------|-------------|
| `MapView.tsx` | Layer init completes, `layersReady` becomes true |
| `track-layer.ts` | `updateTrackLayer` sets correct GeoJSON features |
| `sensor-layer.ts` | `updateSensorLayer` sets correct GeoJSON features |
| `DebugOverlay.tsx` | Renders correct number of markers, uses short labels |
| `ReplayController.ts` | WS message → store update flow |
| `track-store.ts` | `setTracks` updates trail history correctly |
| `ui-store.ts` | `toggleLayer` changes visibility, `selectTrack` opens detail |

### Rule 6: CI/CD Must Run Tests Before Deploy

Re-enable tests in `cloudbuild.yaml`:

```yaml
steps:
  - name: 'node:20'
    entrypoint: 'pnpm'
    args: ['install']
  - name: 'node:20'
    entrypoint: 'pnpm'
    args: ['test']        # ← Gate on unit tests
  - name: 'node:20'
    entrypoint: 'pnpm'
    args: ['build']
  # ... Docker build, push, deploy
  - name: 'mcr.microsoft.com/playwright'
    args: ['npx', 'playwright', 'test', '--project=desktop']  # ← Gate on E2E
```

### Rule 7: Dual Rendering Architecture

The workstation uses a **dual rendering architecture**:

| Renderer | Purpose | Technology | Reliability |
|----------|---------|-----------|-------------|
| DebugOverlay (primary) | Track/sensor markers, labels, selection | HTML divs + `map.project()` | **High** — no WebGL/font deps |
| MapLibre layers (secondary) | Coverage arcs, EO rays, triangulation, trails, ellipses | GeoJSON + WebGL | **Medium** — depends on fonts CDN |

**This is intentional.** The HTML overlay handles the critical rendering (tracks/sensors) because it has zero external dependencies. MapLibre handles geometric overlays (polygons, lines) which don't require fonts.

Never remove or disable the DebugOverlay without first confirming that MapLibre circle layers render correctly in the production environment.

---

## 6. Checklist for Future Map Rendering Changes

Before any commit that touches `MapView.tsx`, layer files, or the map style:

- [ ] Verify tracks/sensors appear on the deployed map (not just local dev)
- [ ] Verify the DebugOverlay renders markers correctly
- [ ] Verify layer filter toggles affect both MapLibre layers AND the overlay
- [ ] Verify click-selection works (track detail panel opens)
- [ ] Verify coverage arcs appear when "Radar coverage" is toggled ON
- [ ] Run `pnpm build` — no TypeScript errors
- [ ] Take a screenshot comparison test (when available)
- [ ] Check browser console for `[RENDER FAIL]` or MapLibre errors
- [ ] Test with `?nodebug` URL param to verify MapLibre-only rendering
- [ ] Test with network throttling (Slow 3G) to simulate CDN delays

---

## 7. Files Modified in This Fix

| File | Change |
|------|--------|
| `apps/workstation/src/map/DebugOverlay.tsx` | Complete rewrite: short labels, layerVisibility, clickable |
| `apps/workstation/src/map/MapView.tsx` | Restore overlay as primary, pass proper props |
| `apps/workstation/src/map/layers/track-layer.ts` | Symbol layer: `visibility:'none'`, `text-optional:true` |
| `apps/workstation/src/map/layers/sensor-layer.ts` | Symbol layer: `visibility:'none'`, `text-optional:true` |
| `apps/workstation/src/App.tsx` | Tasks/Investigation buttons → return to Overview |
| `apps/workstation/src/demo/NarrationPanel.tsx` | Added X close button |

---

## 8. Key Lesson

> **200 passing backend tests gave false confidence that the system worked. The zero frontend tests meant the most visible part of the product — what the user actually sees — had no safety net. A rendering bug that would have been caught by a single screenshot comparison test survived through 3 development rounds and multiple deployments.**

The fix is not just technical (dual rendering, glyph prevention). The fix is procedural: **every deployment must prove that the map shows what the data says it should show.**
