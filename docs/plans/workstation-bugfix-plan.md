# ELOC2 Workstation Bug-Fix & Polish Plan

**Date:** 2026-03-17
**Status:** In Progress
**Branch:** `claude/eloc2-development-U3sup`

---

## Context

The deployed workstation at `eloc2-820514480393.me-west1.run.app` has several rendering and UX bugs identified from production screenshots. An initial round of fixes (commit `5366833`) addressed the most critical issues. This plan covers the remaining items.

## Completed Fixes (Round 1 — commit 5366833)

| # | Fix | Files |
|---|-----|-------|
| 1 | Gate DebugOverlay behind `?debug=1` URL param | `MapView.tsx` |
| 2 | Increase coverage layer opacity + add radar outline | `coverage-layer.ts` |
| 3 | Default track/sensor labels OFF, short format (T1, R1, E2) | `ui-store.ts`, `track-layer.ts`, `sensor-layer.ts` |
| 4 | Complete `rap.snapshot` with all data fields | `ws-events.ts`, `live-engine.ts` (getFullSnapshot) |
| 5 | Broadcast throttling at high speed (>2x: cap 4/sec) | `live-engine.ts` |
| 6 | Add investigation rings + highlight rings to visibility map | `MapView.tsx` |

---

## Remaining Fixes (Round 2)

### HIGH Priority

#### H1: Continuous gimbal tracking during ticks
**Problem:** EO gimbal azimuth is only updated when a new task is assigned (every 2s in `runEoTaskingCycle`). Between tasking cycles, the gimbal stays pointed at the position computed at assignment time even as the target moves. This makes EO rays appear static/stale.
**Fix:** In `finalizeTick()`, after processing observations, update gimbal azimuth for all sensors with an active task (`gimbal.currentTargetId`) to point toward the current track position.
**Files:** `apps/api/src/simulation/live-engine.ts` (finalizeTick method)

#### H2: MapLibre glyph font fallback
**Problem:** Symbol/label layers depend on `demotiles.maplibre.org/font/` for glyph loading. If this CDN is unreachable, labels silently fail. The try/catch at init time prevents crash but labels never appear.
**Fix:** Add a local font fallback: register a `text-font` that uses a `SDF` generated from a system font, OR switch labels from `symbol` layers to MapLibre `text-field` expressions on circle layers (which don't need glyphs). Simplest fix: use a glyph source known to be reliable or bundle locally.
**Files:** `MapView.tsx` (glyphs URL), `track-layer.ts`, `sensor-layer.ts`

#### H3: Mobile footer missing panel types
**Problem:** Mobile footer only shows `['none', 'tasks', '__timeline__']`. Investigation, Cue, Group, and Geometry panels are unreachable on mobile.
**Fix:** Add all panel types to mobile footer navigation.
**Files:** `apps/workstation/src/App.tsx` (MobileLayout, lines 620-667)

### MEDIUM Priority

#### M1: Add gimbal azimuth validation in ray layers
**Problem:** `eo-ray-layer.ts` and `selection-ray-layer.ts` don't validate that `azimuthDeg` is a finite number. If `undefined` or `NaN`, the computed end coordinates produce invalid GeoJSON that MapLibre silently rejects.
**Fix:** Add `Number.isFinite()` checks before computing ray endpoints.
**Files:** `eo-ray-layer.ts`, `selection-ray-layer.ts`

#### M2: Reduce console logging noise
**Problem:** `track-layer.ts` logs every time track count is a multiple of 10, and logs all invalid-coordinate tracks. At 95+ tracks with rapid updates, this floods the console.
**Fix:** Throttle logging to once every 5 seconds, or remove periodic logging.
**Files:** `track-layer.ts`

#### M3: Ensure coverage layers render before play
**Problem:** Sensors are sent on initial WS connect (now via `getFullSnapshot`). Coverage arcs should render immediately when sensors arrive, before pressing Play.
**Fix:** Verify that the sensor effect triggers `updateCoverageLayer` on initial data load. This should now work after the rap.snapshot fix, but needs verification.
**Files:** `MapView.tsx` (sensor update effect)

### LOW Priority

#### L1: Add `activeCues` to bearing-line effect dependency
**Problem:** Bearing line colors may not update when cues change without eoTracks/sensors changing.
**Fix:** Add `activeCues` to the useEffect dependency array.
**Files:** `MapView.tsx` (line 224)

#### L2: LayerFilterPanel responsive sizing
**Problem:** `isMobileView()` evaluated once per render, not on resize.
**Fix:** Use CSS media queries or a resize observer for responsive padding.
**Files:** `LayerFilterPanel.tsx`

---

## Implementation Order

1. **H1** — Continuous gimbal tracking (live-engine)
2. **H2** — Font/glyph fallback (MapView + label layers)
3. **M1** — Ray layer validation (eo-ray-layer, selection-ray-layer)
4. **M2** — Reduce console noise (track-layer)
5. **H3** — Mobile footer panels (App.tsx)
6. **L1** — Bearing-line dependency fix (MapView)

---

## UI Deployment Tests Status

The `cloudbuild.yaml` pipeline runs:
1. Unit tests (`pnpm test`) — all 146+ pass
2. Playwright E2E tests (API, scenarios, desktop UI, mobile UI) — run against server inside Cloud Build container
3. GCP health check post-deploy — HTTP 200 + cold-start timing

The Playwright UI tests run against a local server in the build container, **not** against the live deployed URL. For live deployment verification, the only check is the `/api/health` endpoint.

---

## Acceptance Criteria

- [ ] Coverage arcs visible on map before pressing Play
- [ ] EO rays update in real-time as gimbal tracks targets
- [ ] Bearing lines, triangulation rays appear when EO investigation is active
- [ ] Labels hidden by default, short format when enabled (T1, R1, E2)
- [ ] Task/Investigation buttons properly toggle panels
- [ ] Demo runs smoothly at 5x and 10x speed
- [ ] All 146+ unit tests pass
- [ ] Build succeeds without errors
