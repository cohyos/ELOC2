# ELOC2 — EO C2 Air Defense Demonstrator

## Project Overview
Air defense C2 demonstrator with sensor fusion, EO investigation, and tasking.
Monorepo: `packages/` (domain libs) + `apps/` (api, workstation, simulator).

## Architecture
- **Backend**: `apps/api` — Fastify server, WebSocket events, live simulation engine
- **Frontend**: `apps/workstation` — React 19 + MapLibre GL JS 5 + Zustand 5 stores
- **Simulator**: `apps/simulator` — ScenarioRunner generates radar/EO observations
- **Fusion**: `packages/fusion-core` — TrackManager, correlator, information-matrix fuser
- **Geometry**: `packages/geometry` — Bearing-math, triangulator, quality-scorer, time-aligner
- **Domain types**: `packages/domain` — SystemTrack, SensorState, Position3D, etc.

## Key Files
- `apps/api/src/simulation/live-engine.ts` — Main simulation loop, WS broadcast, geometry & fusion integration
- `apps/workstation/src/map/MapView.tsx` — Map component, layer init
- `apps/workstation/src/map/layers/track-layer.ts` — Track circle + label layers
- `apps/workstation/src/map/layers/sensor-layer.ts` — Sensor circle + label layers
- `apps/workstation/src/map/layers/triangulation-layer.ts` — EO bearing rays + intersection points
- `apps/workstation/src/map/DebugOverlay.tsx` — HTML marker fallback (bypasses MapLibre)
- `apps/workstation/src/replay/ReplayController.ts` — WebSocket client, feeds stores
- `apps/workstation/src/stores/track-store.ts` — Zustand track state
- `apps/workstation/src/stores/ui-store.ts` — UI state (selected track, panels, replay time)
- `apps/workstation/src/App.tsx` — Main layout, header, scenario controls

## Data Flow
1. `ScenarioRunner.step()` generates `SimulationEvent[]` (observations, bearings, faults)
2. `LiveEngine.processSimEvent()` feeds observations through `TrackManager.processObservation()`
3. Fusion-mode-selector picks basic/conservative/centralized based on registration health
4. When ≥2 EO bearings exist for a track, `@eloc2/geometry` triangulation is called
5. `LiveEngine.broadcastRap()` sends tracks/sensors/geometry via WebSocket as `rap.update`
6. `ReplayController.handleMessage()` calls `setTracks()`/`setSensors()` on Zustand stores
7. `MapView` effects call `updateTrackLayer()`/`updateSensorLayer()` when data changes
8. `DebugOverlay` renders HTML markers using `map.project()` as a fallback

## Knowledge Base — Source of Truth

The `Knowledge_Base_and_Agents_instructions/` folder contains **18 foundational design documents** that define ALL domain logic, algorithms, and UI requirements. **Always consult the relevant document before implementing or debugging a feature.**

| File | Purpose | Phases |
|------|---------|--------|
| `EO_C2_demo_for_air_defense.md` | High-level concept and requirements | All |
| `EO_C2_build_roadmap.md` | Phase sequence, acceptance criteria, scenario specs | Planning, 9 |
| `EO_C2_demo_build_knowledge_base.md` | Research-grounded design decisions | All |
| `EO_C2_repo_scaffold_spec.md` | Monorepo structure, package boundaries | Phase 0 |
| `EO_C2_search_outcome_report.md` | Technology evaluation rationale | Architecture |
| `RAP_fusion_architecture.md` | Correlation, fusion, track management, event store | Phases 1, 7 |
| `Radar_EO_cueing_and_fusion.md` | Radar-to-EO cueing, fusion modes, EO reports | Phases 3, 7 |
| `Sensor_registration_and_timing.md` | Bias estimation, clock health, registration gating | Phases 2, 7 |
| `EO_sensor_tasking.md` | Scoring formula, policy engine, operator controls | Phase 4 |
| `EO_multi_target_resolution.md` | Ambiguity handling, split/merge, identification | Phase 5 |
| `EO_triangulation_geometry.md` | Bearing math, triangulation, quality scoring | Phase 6 |
| `Map_simulation_and_workstation.md` | UI layout, map layers, panels, responsive design | Phase 8 |
| `ELOC2_UI_Requirements_and_VV_Spec.md` | **Full UI/UX requirements, visual inventory, interaction flows, QA agent spec, acceptance criteria** | **QA, All** |
| `ELOC2_Implementation_Plan.md` | **Detailed implementation plan: 20 sub-tasks, file paths, agent prompts, execution order** | **All** |
| `Blank_Map_Postmortem_and_Testing_Lessons.md` | **Post-mortem: blank map bug, testing gaps, 7 mandatory rules, dual rendering architecture** | **QA, All** |
| `Claude_code_prompt_templates.md` | Copy-paste agent prompts with shared prefix | Agent execution |
| `Claude_agent_build_prompts.md` | Detailed agent prompts with scope + done criteria | Agent execution |
| `Chunk_index.md` | Index of all knowledge base chunks for retrieval | Reference |

## Current Completion (as of 2026-03-17)

| Phase | Status | Notes |
|-------|--------|-------|
| 0: Bootstrap | **Complete** | Monorepo builds, dev server works |
| 1: Fusion Core | **Complete** | TrackManager, correlator, fuser, event-store, RAP (29 tests) |
| 2: Registration | **Complete** | BiasEstimator, ClockHealth, HealthService (23 tests) |
| 3: EO Cueing | **Complete** | CueIssuer, gimbal/FOV, EO reports (50 tests) |
| 4: Tasking | **Complete** | Scoring, policy engine, assigner (22 tests) |
| 5: Multi-Target | **Complete** | Ambiguity, split/merge, EoTrack |
| 6: Triangulation | **Complete** | Integrated in live-engine, geometry broadcast via WS |
| 7: Advanced Fusion | **Complete** | fusion-mode-selector active, conservative/centralized modes |
| 8: Workstation | **~95%** | Map, panels, layers, dark mode, trails, actions, responsive layout |
| 9: Scenarios | **Partial** | central-israel exists; no integration tests |

## Recent Fixes (Rounds 1-3, branch `claude/eloc2-development-U3sup`)

### Round 1 — Core rendering fixes
- DebugOverlay gated behind `?debug=1` URL param
- Coverage layer opacity increased + radar outline stroke
- Labels default OFF, short format (T1, R1, E2)
- `rap.snapshot` complete with all data fields on WS connect
- Broadcast throttling (cap 4/sec at >2x speed)

### Round 2 — Gimbal and font fixes
- Continuous gimbal tracking every tick (not just at task assignment)
- Glyph CDN switched to `fonts.openmaptiles.org` (reliable)
- Font stack simplified to `Open Sans Bold`
- Azimuth validation in ray layers (`Number.isFinite` guards)
- Reduced console logging noise

### Round 3 — UX and features
- **Dark mode map**: CartoDB Dark Matter tiles, toggle in header (default ON)
- **Track trails**: Fading breadcrumb dots (max 5 past positions per track)
- **System health panel**: DefaultPanel shows fusion mode, registration health, sensor online count
- **Track action buttons**: "Investigate" and "Mark Priority" in TrackDetailPanel
- **Operator priority API**: `POST /api/operator/priority` boosts EO tasking score
- **Demo button toggle**: Now properly toggles demo mode off when clicked again
- **Version label**: Updated to v0.3.0 with tooltip
- **RAF batching**: ReplayController coalesces WS messages via requestAnimationFrame
- **Pause fix**: Backend sends final broadcast with `running: false` on pause

## Gap Completion Plan (Ordered)

### HIGH — Must fix for demo
1. ~~**Map symbols blank on deploy**~~ — **FIXED (Round 4)**: Root cause was MapLibre glyph CDN stalling WebGL pipeline. Fix: dual rendering (DebugOverlay as primary HTML renderer + MapLibre for geometry). See `Blank_Map_Postmortem_and_Testing_Lessons.md`.
2. **Deploy to Cloud Run** — Merge dev→master triggers Cloud Build. Or manual `gcloud builds submit`.

### MEDIUM — Feature completeness
3. ~~**Replay/timeline scrubbing**~~ — **DONE**
4. ~~**Ambiguity map markers**~~ — **DONE**
5. ~~**Per-sensor degraded indicators**~~ — **DONE**
6. **Integration tests** — Full pipeline: scenario -> live-engine -> validation assertions
7. ~~**Missing API endpoints**~~ — **DONE**

### LOW — Polish
8. ~~**Named scenarios**~~ — **DONE**
9. ~~**TrackDetail enhancements**~~ — **DONE**: Shows fusion mode, geometry, ID support, lineage, action buttons
10. **Playwright E2E** — Smoke browser test. New `tests/e2e/`

## Known Issues

### Map Rendering Architecture (CRITICAL — read before touching map code)
- **Dual rendering**: DebugOverlay (HTML divs) is the PRIMARY renderer for tracks/sensors. MapLibre GL layers are SECONDARY (handle coverage arcs, EO rays, triangulation, trails).
- **Why**: MapLibre circle/symbol layers fail in production due to glyph CDN stalling the WebGL pipeline. The HTML overlay has zero external dependencies and always works.
- **DebugOverlay**: Always on by default. Disable with `?nodebug` URL param for MapLibre-only testing.
- **Symbol layers**: Init with `visibility:'none'` to prevent glyph loading on startup. Labels are rendered by the HTML overlay instead.
- **Full post-mortem**: See `Knowledge_Base_and_Agents_instructions/Blank_Map_Postmortem_and_Testing_Lessons.md`

### Deployment (ACTIVE)
- Cloud Run service: `eloc2-820514480393.me-west1.run.app`
- Cloud Build trigger active — merging to master triggers auto deploy
- Manual deploy:
  ```bash
  gcloud auth login
  git checkout master && git merge claude/eloc2-development-U3sup
  gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
    --project=eloc2demo
  ```

## Development
- Package manager: pnpm (v9.15.0) with workspaces
- Build: `pnpm build` (uses Turbo)
- Test: `pnpm test` (146+ tests, all passing)
- Dev branch: `claude/eloc2-development-ElpmM`
- Dockerfile: 2-stage build, serves workstation static files from API on port 3001
- Vite dev server on port 3000 proxies `/api` and `/ws` to 3001

## Conventions
- Branded types: `SystemTrackId`, `SensorId`, `Timestamp` (string/number underneath)
- Track status: tentative → confirmed (after 3 updates) → dropped (after 8 misses)
- Colors: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333
- Sensor colors: radar=#4488ff, eo=#ff8800, c4isr=#aa44ff
- Event-sourced: all state changes through EventStore
- 3D honesty: bearing_only | candidate_3d | confirmed_3d — never overstate geometry
