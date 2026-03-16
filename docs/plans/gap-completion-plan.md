# ELOC2 Gap Analysis & Completion Plan

## Context

The implementation plan (`docs/plans/implementation-plan.md`) defines 10 phases (0–9) for the EO C2 Air Defense Demonstrator. Significant progress has been made — the monorepo is functional, backend packages exist with real implementations, and the workstation renders a live map with tracks, sensors, EO rays, and tasking. However, several subsystems are either missing integration, partially implemented, or only exist as stubs. This plan identifies every gap and proposes concrete steps to close them.

---

## Current Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| **0: Bootstrap** | **Complete** | Monorepo builds, dev server works, map renders |
| **1: Fusion Core** | **Complete** | TrackManager, correlator, fuser, event-store, RAP projection all implemented with tests |
| **2: Registration** | **Complete** | BiasEstimator, ClockHealth, HealthService implemented with tests |
| **3: EO Cueing** | **Complete** | CueIssuer, gimbal/FOV models, EO report handling, all with tests |
| **4: Tasking** | **Complete** | Candidate generation, scoring, policy engine, assigner, operator controls — all with tests |
| **5: Multi-Target** | **Complete** | Ambiguity handler, splitter, merger, EoTrack entity — all with tests |
| **6: Triangulation** | **Packages complete, NOT wired** | bearing-math, triangulator, quality-scorer, time-aligner, geometry-projection exist with tests — but **live-engine does NOT call `@eloc2/geometry`** |
| **7: Advanced Fusion** | **Packages complete, NOT wired** | fusion-mode-selector, conservative-fuser, centralized-fuser, async-handler exist — but **live-engine uses only basic TrackManager.processObservation**, never invokes advanced fusion modes |
| **8: Workstation** | **~80% complete** | See gap details below |
| **9: Scenarios** | **Partial** | central-israel + simple-scenarios exist; validation assertions exist as code but **no integration test runner, no regression suite, no Playwright E2E** |

---

## Gap Details

### Gap 1: Geometry/Triangulation NOT Integrated in Live Engine
**Severity: HIGH** — The `@eloc2/geometry` package is fully implemented but never called.
- `live-engine.ts` imports `GeometryEstimate` type but `geometryEstimates` Map is always empty
- No import of `@eloc2/geometry` (triangulator, quality-scorer, etc.)
- The workstation's `/api/geometry/:id` endpoint returns 404 for all tracks
- TrackDetailPanel fetches geometry but never gets data
- Triangulation layer on map draws rays based on heuristics in the frontend, not real geometry results

**Fix:** Wire `@eloc2/geometry` into `live-engine.ts` to compute triangulation estimates when ≥2 EO bearings exist for a track, populate `geometryEstimates` Map, and broadcast results.

**Files:**
- `apps/api/src/simulation/live-engine.ts` — add import + call triangulation after bearing processing
- `packages/geometry/src/index.ts` — verify exports

### Gap 2: Advanced Fusion Modes NOT Integrated
**Severity: MEDIUM** — fusion-mode-selector, conservative-fuser, centralized-fuser exist but aren't used.
- `live-engine.ts` uses only `TrackManager.processObservation()` which does basic information-matrix fusion
- Registration health exists but doesn't gate fusion mode (should switch to conservative when degraded)
- The detail panel shows "fusion mode" field but it's never populated

**Fix:** Wire `fusion-mode-selector` into the observation processing path in `live-engine.ts`. When registration is degraded, switch to conservative fusion. Populate fusion mode on tracks for UI display.

**Files:**
- `apps/api/src/simulation/live-engine.ts` — integrate fusion mode selection
- `packages/fusion-core/src/track-management/track-manager.ts` — may need to expose fusion mode on track

### Gap 3: Replay/Time Scrubbing Not Functional
**Severity: MEDIUM** — Timeline scrubber is hardcoded at 50%, `replayTime` in UI store is unused.
- No ability to jump to a specific simulation time
- No server-side replay endpoint (event store exists in fusion-core but isn't exposed)
- Plan calls for: "replay reconstructs RAP at any past time"

**Fix:** Add `/api/replay/seek` endpoint that reconstructs state at a given time from the event store. Wire the timeline scrubber to call this endpoint. Update `replayTime` in ui-store.

**Files:**
- `apps/api/src/routes/` — add replay route
- `apps/api/src/simulation/live-engine.ts` — expose event store replay
- `apps/workstation/src/timeline/TimelinePanel.tsx` — wire scrubber
- `apps/workstation/src/stores/ui-store.ts` — use replayTime

### Gap 4: Missing Workstation UI Elements
**Severity: MEDIUM**

#### 4a: No local track layer (toggleable)
- Plan says "local tracks (toggleable)" on map — only system tracks shown currently

#### 4b: No ambiguity markers on map
- Plan says "ambiguity markers" — unresolved groups exist in backend but no map visualization
- `DegradedModeOverlay.tsx` exists but only shows "sensor offline" banner

#### 4c: No degraded-mode indicators on map per-sensor
- Plan says "degraded-mode indicators" per sensor — only global banner exists
- Should show visual indicator on sensor icons when registration is degraded

#### 4d: Track detail doesn't show fusion mode
- TrackDetailPanel has geometry section but no explicit "fusion mode" indicator

#### 4e: No association/split history display
- Plan says "Association and split history" — lineage exists but split/merge history from EO investigation isn't surfaced

#### 4f: No identification support display
- EO tracks have `identificationSupport` but it's not shown in any panel

**Files:**
- `apps/workstation/src/map/layers/` — new local-track-layer, ambiguity-marker-layer
- `apps/workstation/src/map/MapView.tsx` — integrate new layers
- `apps/workstation/src/track-detail/TrackDetailPanel.tsx` — add fusion mode, ID support
- `apps/workstation/src/stores/ui-store.ts` — add local track visibility toggle

### Gap 5: Missing API Endpoints
**Severity: LOW-MEDIUM**

| Planned Endpoint | Status |
|-----------------|--------|
| `GET /api/rap` | Exists |
| `GET /api/tracks/:id` | Exists |
| `GET /api/sensors` | Exists |
| `GET /api/sensors/:id/registration` | Exists |
| `GET /api/tasks` | Exists |
| `GET /api/geometry/:id` | Exists but always empty |
| `POST /api/operator/approve\|reject` | Exists |
| `POST /api/operator/reserve` | Exists (stub — no real effect) |
| `POST /api/scenario/start\|pause\|speed\|reset` | Exists |
| `GET /api/scenarios` | Exists |
| **Missing: REST event replay** | Not implemented |
| **Missing: EO cue details endpoint** | Not implemented |
| **Missing: Unresolved groups endpoint** | Not implemented |

**Fix:** Add missing endpoints. Wire `/api/operator/reserve` to actually reserve a sensor.

**Files:**
- `apps/api/src/routes/` — add replay-routes.ts, group-routes.ts
- `apps/api/src/routes/task-routes.ts` — fix reserve endpoint

### Gap 6: Integration Tests / Regression Suite Empty
**Severity: MEDIUM**
- `tests/integration/`, `tests/regression/`, `tests/replay/` directories exist but are empty
- `packages/validation/` has assertion code but no runner that exercises the full live-engine pipeline
- No Playwright E2E tests (Phase 8 requirement)
- Individual package tests exist and pass

**Fix:** Create integration tests that run a scenario through live-engine and validate assertions. Add at least smoke-level E2E test.

**Files:**
- `tests/integration/` — add full-pipeline test
- `tests/regression/` — wire validation assertions
- `packages/validation/src/runner.ts` — integrate with live-engine

### Gap 7: Additional Named Scenarios Missing
**Severity: LOW**
- Plan calls for 8 named scenarios. Only `central-israel` (full) and `simple-scenarios.ts` (basic ones) exist.
- Missing dedicated scenarios for: crossed tracks, low altitude clutter, bad geometry, operator override

**Fix:** Add remaining scenario definitions to `packages/scenario-library/src/scenarios/`.

### Gap 8: Geometry Estimates Not Broadcast via WebSocket
**Severity: HIGH** (linked to Gap 1)
- `broadcastRap()` sends tracks, sensors, activeCues, tasks, eoTracks — but NOT geometry estimates
- Frontend has no store for geometry estimates from WS (only fetches via REST per-track)
- Should broadcast so triangulation rays reflect real computed geometry

**Fix:** Add `geometryEstimates` to WS broadcast. Add to frontend stores.

**Files:**
- `apps/api/src/simulation/live-engine.ts` — add to broadcastRap()
- `apps/workstation/src/replay/ReplayController.ts` — parse geometry from WS
- `apps/workstation/src/stores/` — add geometry store or extend track-store

---

## Implementation Plan (Priority Order)

### Phase A: Wire Geometry & Advanced Fusion into Live Engine (Gaps 1, 2, 8)

1. **Import `@eloc2/geometry` in live-engine.ts** and call triangulation after bearing processing
   - After `processAccumulatedBearings()`, collect all bearing measurements per track
   - Call `triangulate()` when ≥2 bearings from different sensors exist
   - Call `scoreQuality()` on results
   - Store in `geometryEstimates` Map
   - File: `apps/api/src/simulation/live-engine.ts`

2. **Wire fusion-mode-selector** into observation processing
   - Before `trackManager.processObservation()`, check registration health
   - Select fusion mode via `selectFusionMode()`
   - Pass mode to track manager (may need to extend TrackManager API)
   - Store active fusion mode per track
   - File: `apps/api/src/simulation/live-engine.ts`

3. **Broadcast geometry estimates via WebSocket**
   - Add `geometryEstimates` array to `broadcastRap()` payload
   - File: `apps/api/src/simulation/live-engine.ts`

4. **Parse geometry in frontend ReplayController**
   - Handle `geometryEstimates` from WS message
   - Store in task-store or new geometry-store
   - File: `apps/workstation/src/replay/ReplayController.ts`

### Phase B: Workstation Completeness (Gaps 4, 5)

5. **Add ambiguity markers layer** on map for unresolved groups
   - New `ambiguity-marker-layer.ts` using circle layer with pulsing effect
   - Need `unresolvedGroups` broadcast from WS
   - Files: `apps/workstation/src/map/layers/ambiguity-marker-layer.ts`, `MapView.tsx`

6. **Add degraded-mode per-sensor indicators** on map
   - Modify sensor-layer to show degraded color/style when registration health is poor
   - Broadcast `registrationStates` via WS
   - Files: `apps/api/src/simulation/live-engine.ts` (broadcast), `apps/workstation/src/map/layers/sensor-layer.ts`

7. **Enhance TrackDetailPanel** with fusion mode, identification support, split history
   - File: `apps/workstation/src/track-detail/TrackDetailPanel.tsx`

8. **Add missing API endpoints** — replay, unresolved groups, fix reserve
   - Files: `apps/api/src/routes/`

9. **Wire real triangulation data into triangulation map layer**
   - Currently frontend computes heuristic rays; should use real geometry estimates
   - File: `apps/workstation/src/map/layers/triangulation-layer.ts`

### Phase C: Replay & Timeline (Gap 3)

10. **Wire timeline scrubber** to actual simulation progress
    - Use `elapsedSec` / `durationSec` from WS for scrubber position
    - File: `apps/workstation/src/timeline/TimelinePanel.tsx`

11. **Add server-side replay seek** (stretch goal)
    - Expose event store query via REST
    - File: `apps/api/src/routes/`

### Phase D: Scenarios & Testing (Gaps 6, 7)

12. **Add remaining named scenarios**
    - File: `packages/scenario-library/src/scenarios/`

13. **Create integration test** that runs live-engine with central-israel scenario
    - Validate: tracks created, EO cues issued, geometry computed, faults handled
    - File: `tests/integration/`

14. **Wire validation runner** to live-engine output
    - File: `packages/validation/src/runner.ts`

---

## Verification

1. **Build**: `pnpm build` succeeds
2. **Unit tests**: `pnpm test` passes (existing package tests)
3. **Manual verification**: Start dev server (`pnpm dev`), open workstation:
   - Press Play → tracks appear on map
   - After ~30s: EO cues issued, bearing lines visible
   - Click track → detail panel shows geometry quality (not 404)
   - Triangulation rays color-coded by actual quality
   - When fault injected at T+400s → sensor shows degraded indicator
   - Unresolved groups show ambiguity markers on map
   - Timeline scrubber advances with simulation time
4. **Integration test**: `pnpm test --filter=tests` passes
