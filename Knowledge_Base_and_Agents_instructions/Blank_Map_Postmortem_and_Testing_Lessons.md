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

MapLibre GL JS v5.20.1 **ALL data layers** (circles, lines, fills, symbols) were initialized correctly but **never rendered visible pixels on the WebGL canvas** in the production deployment. This includes not just symbol/text layers but also:
- Circle layers (track and sensor markers)
- Fill layers (coverage arcs, uncertainty ellipses)
- Line layers (EO rays, triangulation, bearing lines)

Only raster tile layers rendered correctly because they use a separate 2D rendering path within MapLibre.

### 2.2 The Underlying Mechanism (Revised — Round 5 Finding)

**Original hypothesis (Round 4):** The `glyphs` CDN URL in the map style stalls the WebGL pipeline when the CDN is slow/unreachable.

**Revised finding (Round 5):** Removing the `glyphs` URL entirely did NOT fix the problem. The MapLibre WebGL pipeline is **completely non-functional** in the Cloud Run production environment — no data layers render at all, regardless of whether they use fonts. The root cause is broader than just glyph loading; it appears to be a WebGL context issue specific to the containerized production environment (headless Chrome, GPU acceleration unavailable, or WebGL context limits).

**Evidence:** After removing the glyphs URL and ensuring symbol layers start hidden, coverage arcs (fill/line — no fonts), EO rays (line — no fonts), and track circles (circle — no fonts) still did not render. Only the raster tile layer and the HTML/SVG DebugOverlay rendered correctly.

**Previous hypothesis (kept for reference):**

The MapLibre map style included a `glyphs` URL pointing to an external CDN:

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

### Rule 7: Full HTML/SVG Rendering Architecture

The workstation uses a **full HTML/SVG rendering architecture** that bypasses MapLibre's WebGL data layers entirely:

| Renderer | Purpose | Technology | Reliability |
|----------|---------|-----------|-------------|
| DebugOverlay SVG (z-index 14) | Coverage arcs, EO FOR/FOV, gimbal rays, triangulation lines | SVG polygons/lines + `map.project()` | **High** — no WebGL deps |
| DebugOverlay HTML (z-index 15) | Track/sensor markers, labels, selection, trail dots | HTML divs + `map.project()` | **High** — no WebGL deps |
| MapLibre raster (base) | Map tiles (CartoDB Dark Matter / OSM) | Raster tiles | **High** — simple 2D |
| MapLibre data layers (disabled) | Originally: all of the above | GeoJSON + WebGL | **Broken in production** |

**This is intentional and mandatory.** As of Round 5, ALL visual elements (tracks, sensors, coverage arcs, EO rays, triangulation, FOV cones, trail dots) are rendered by the DebugOverlay using HTML divs and SVG elements. MapLibre is used ONLY for raster map tiles. The MapLibre data layer code is kept as fallback but is not the active rendering path.

**Architecture details:**
- `DebugOverlay.tsx` returns a React Fragment with two siblings:
  - `<svg>` element for geometric shapes (arcs, rays, lines) at z-index 14
  - `<div>` element for point markers (tracks, sensors, labels) at z-index 15
- All geometry uses `map.project([lon, lat])` to convert geo coords to screen pixels
- Coverage arcs are rendered as SVG polygons with 48 segments
- EO rays are SVG lines with dashed stroke
- Triangulation lines are SVG lines color-coded by quality
- All layers respect the `layerVisibility` store toggles from the Layers panel

Never remove or disable the DebugOverlay. It is the ONLY functional rendering path in production.

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

### Round 4 (initial fix)
| File | Change |
|------|--------|
| `apps/workstation/src/map/DebugOverlay.tsx` | Rewrite: short labels, layerVisibility, clickable markers |
| `apps/workstation/src/map/MapView.tsx` | Restore overlay as primary, pass proper props |
| `apps/workstation/src/map/layers/track-layer.ts` | Symbol layer: `visibility:'none'`, `text-optional:true` |
| `apps/workstation/src/map/layers/sensor-layer.ts` | Symbol layer: `visibility:'none'`, `text-optional:true` |

### Round 5 (full SVG rendering + additional fixes)
| File | Change |
|------|--------|
| `apps/workstation/src/map/DebugOverlay.tsx` | Added SVG layer for coverage arcs, EO rays, FOV/FOR cones, triangulation lines. Returns Fragment (SVG + HTML). Added trail dot rendering, pointer-events:auto for click selection |
| `apps/workstation/src/map/MapView.tsx` | Removed glyphs URL, removed symbol layer visibility sync, pass trailHistory to overlay |
| `apps/workstation/src/replay/ReplayController.ts` | Flush `speed` from WS broadcast to UI store |
| `apps/api/src/simulation/live-engine.ts` | Added `speed` field to `rap.update` WS broadcast |
| `packages/fusion-core/src/fusion/fuser.ts` | Confirmation-only mode now updates track position (with 2x inflated covariance) instead of freezing it |

---

## 8. Key Lessons

> **Lesson 1:** 200 passing backend tests gave false confidence that the system worked. The zero frontend tests meant the most visible part of the product — what the user actually sees — had no safety net. A rendering bug that would have been caught by a single screenshot comparison test survived through 3 development rounds and multiple deployments.

> **Lesson 2:** Never trust that a third-party rendering engine (MapLibre WebGL) will work in a containerized production environment the same way it works on a developer's machine. The WebGL pipeline broke completely in Cloud Run — not just fonts, but ALL data layers (circles, lines, fills). The fix was to remove all dependency on WebGL for data rendering and use HTML/SVG instead. Raster tiles still work because they use a simpler rendering path.

> **Lesson 3:** When a fix addresses the wrong root cause (Round 4: "glyphs CDN stalls WebGL"), the symptom recurs. The real root cause (Round 5: "WebGL data layers completely non-functional in production") required a more fundamental architectural change — moving ALL geometry rendering to SVG.

The fix is not just technical (SVG rendering). The fix is procedural: **every deployment must prove that the map shows what the data says it should show**, and **never depend on WebGL for mission-critical visual output when the deployment target doesn't guarantee GPU acceleration.**
