# ELOC2 Workstation Bug-Fix & Polish Plan

**Date:** 2026-03-17
**Status:** Complete (Rounds 1-3)
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

## Round 2 Fixes (commit fdf6ee8) — All HIGH/MEDIUM Complete

### HIGH Priority

#### H1: Continuous gimbal tracking during ticks — **DONE**
Added `updateGimbalPointing()` method called in `finalizeTick()`. EO sensors now continuously update their gimbal azimuth toward assigned targets every tick.
**Files:** `apps/api/src/simulation/live-engine.ts`

#### H2: MapLibre glyph font fallback — **DONE**
Switched glyph CDN from `demotiles.maplibre.org` to `fonts.openmaptiles.org` (standard MapLibre font CDN). Simplified font stack to `Open Sans Bold` (known available font).
**Files:** `MapView.tsx`, `track-layer.ts`, `sensor-layer.ts`

#### H3: Mobile footer missing panel types — **DONE**
Added Investigation tab to mobile footer navigation.
**Files:** `apps/workstation/src/App.tsx`

### MEDIUM Priority

#### M1: Add gimbal azimuth validation in ray layers — **DONE**
Added `Number.isFinite()` validation in both `eo-ray-layer.ts` and `selection-ray-layer.ts`.
**Files:** `eo-ray-layer.ts`, `selection-ray-layer.ts`

#### M2: Reduce console logging noise — **DONE**
Removed periodic logging from `track-layer.ts`, keeping only error-level logs.
**Files:** `track-layer.ts`

#### M3: Coverage layers render before play — **DONE** (via Round 1 rap.snapshot fix)
Sensors are now sent via `getFullSnapshot()` on WS connect, triggering coverage layer render.

### LOW Priority (Deferred)

#### L1: Bearing-line effect dependency — **NOT NEEDED**
Reviewed: bearing line colors are determined by `t.status`, not by cues. No change required.

#### L2: LayerFilterPanel responsive sizing — **DEFERRED**
Low priority cosmetic issue. Can be addressed in a future polish pass.

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
