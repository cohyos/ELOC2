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
- **EO Management**: `packages/eo-management` — Modular EO module (REQ-16): ingest, sub-pixel/image pipelines, mode controller
- **Deployment Planner**: `packages/deployment-planner` — Sensor deployment optimization (REQ-15): grid, scorers, optimizer
- **Database**: `packages/database` — PostgreSQL user/session management
- **Terrain**: `packages/terrain` — SRTM DEM line-of-sight checker
- **ASTERIX Adapter**: `packages/asterix-adapter` — Complete CAT-048/CAT-062 parsing + export
- **Reports**: `apps/api/src/reports/report-generator.ts` — Scenario report generation (REQ-12)

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
- `apps/workstation/src/quality/QualityMetricsPanel.tsx` — Quality metrics + EO allocation display
- `apps/workstation/src/investigation/InvestigationWindowPanel.tsx` — EO investigation detail view
- `apps/workstation/src/stores/ground-truth-store.ts` — Ground truth target state
- `apps/workstation/src/stores/quality-store.ts` — Quality metrics + allocation state
- `apps/workstation/src/stores/cover-zone-store.ts` — Land cover zone state
- `apps/workstation/src/deployment/DeploymentView.tsx` — Deployment planner view
- `apps/workstation/src/deployment/deployment-store.ts` — Deployment planner state
- `apps/api/src/routes/report-routes.ts` — Report generation API
- `apps/api/src/routes/deployment-routes.ts` — Deployment planner API (7 endpoints)
- `packages/eo-management/src/eo-module.ts` — EoManagementModule main class
- `apps/workstation/src/components/ResizeHandle.tsx` — Draggable panel resize
- `apps/api/src/routes/operator-routes.ts` — Operator override API (lock/release/classify/priority)
- `apps/api/src/routes/quality-routes.ts` — Quality metrics + before/after + allocation API
- `apps/api/src/simulation/state-machine.ts` — Simulation state machine (5 states)
- `apps/api/src/auth/auth-plugin.ts` — Auth Fastify plugin
- `apps/api/src/auth/auth-middleware.ts` — Session validation middleware
- `apps/api/src/routes/auth-routes.ts` — Login/logout/user management
- `apps/api/src/routes/asterix-routes.ts` — ASTERIX UDP feed control
- `apps/workstation/src/auth/LoginPage.tsx` — Login page
- `apps/workstation/src/auth/auth-store.ts` — Auth Zustand store
- `apps/workstation/src/map/symbols/nato-symbols.ts` — NATO APP-6 SVG symbology
- `apps/workstation/src/map/EoVideoPopup.tsx` — EO video popup with leader line
- `apps/workstation/src/components/FusionConfigPanel.tsx` — Fusion threshold sliders
- `packages/terrain/src/los-checker.ts` — Ray-march LOS checker
- `packages/terrain/src/dem-loader.ts` — SRTM HGT tile loader
- `configs/sensor-library.json` — Predefined sensor definitions
- `packages/asterix-adapter/src/cat048-parser.ts` — CAT-048 radar plot binary parser
- `packages/asterix-adapter/src/cat062-parser.ts` — CAT-062 system track binary parser
- `apps/workstation/src/3d/DeckGlOverlay.tsx` — Deck.gl 3D altitude/trajectory overlay
- `packages/geometry/src/ballistic-estimator.ts` — Ballistic launch/impact point estimation
- `packages/domain/src/weather.ts` — Weather condition types and effects

## Data Flow
1. `ScenarioRunner.step()` generates `SimulationEvent[]` (observations, bearings, faults)
2. `LiveEngine.processSimEvent()` feeds observations through `TrackManager.processObservation()`
3. Fusion-mode-selector picks basic/conservative/centralized based on registration health
4. When ≥2 EO bearings exist for a track, `@eloc2/geometry` triangulation is called
5. `LiveEngine.broadcastRap()` sends tracks/sensors/geometry via WebSocket as `rap.update`
6. `ReplayController.handleMessage()` calls `setTracks()`/`setSensors()` on Zustand stores
7. `MapView` effects call `updateTrackLayer()`/`updateSensorLayer()` when data changes
8. `DebugOverlay` renders HTML markers using `map.project()` as a fallback
9. Auth middleware (`auth-plugin.ts`) validates session tokens on protected routes when `AUTH_ENABLED=true`
10. ASTERIX adapter can ingest live CAT-048/CAT-062 UDP feeds and convert to internal observation format

## Knowledge Base — Source of Truth

The `Knowledge_Base_and_Agents_instructions/` folder contains **25 foundational design documents** that define ALL domain logic, algorithms, and UI requirements. **Always consult the relevant document before implementing or debugging a feature.**

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
| `ELOC2_Corrections_and_Upgrades_Plan.md` | **Corrections & upgrades: 7 phases, 16 REQ items, traceability matrix** | **All** |
| `Blank_Map_Postmortem_and_Testing_Lessons.md` | **Post-mortem: blank map bug, testing gaps, 7 mandatory rules, dual rendering architecture** | **QA, All** |
| `MHT_JPDA_Design.md` | **MHT vs JPDA algorithm comparison for dense multi-target tracking** | **Phases 1, 7** |
| `ASTERIX_Feasibility_Study.md` | **CAT-048/062 integration evaluation, Cloud Run constraints** | **Wave 4** |
| `ASTERIX_Integration.md` | **ASTERIX implementation spec: AsterixListener, parsers, adapter** | **Wave 4** |
| `Map_Renderer_Evaluation.md` | **Rendering approach evaluation, dual architecture justification** | **Wave 5** |
| `EO_Processing_Server_Architecture.md` | **EO processing microservice: RTSP ingestion, YOLO detection, gRPC output** | **Wave 5** |
| `High_Load_Architecture.md` | **Distributed architecture for 100+ targets, 10+ operators, Redis Streams** | **Wave 5** |
| `Claude_code_prompt_templates.md` | Copy-paste agent prompts with shared prefix | Agent execution |
| `Claude_agent_build_prompts.md` | Detailed agent prompts with scope + done criteria | Agent execution |
| `Chunk_index.md` | Index of all knowledge base chunks for retrieval | Reference |

## Current Completion (as of 2026-03-19)

### Original Build Phases (0–9)
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

### Corrections & Upgrades Plan Phases (1–7)
See `Knowledge_Base_and_Agents_instructions/ELOC2_Corrections_and_Upgrades_Plan.md` for full details.

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| 1: Foundation | **Complete** | Build info (REQ-2), ground truth WS (REQ-1), classifications (REQ-7), state machine (REQ-13) |
| 2: UI | **Complete** | Ground truth toggle, resizable panels (REQ-4), state-aware controls |
| 3: EO Mgmt A | **Complete** | Dwell timer, target cycling, operator override API, investigation window, EO classification (REQ-5A) |
| 4: Quality + Land | **Complete** | QualityAssessor (REQ-8), before/after EO (REQ-9), allocation criteria (REQ-10), cover zones (REQ-11) |
| 5: EO Mgmt B | **Complete** | Search mode (REQ-5B), optimization loop (REQ-5C), FOV overlap + multi-target resolution (REQ-6) |
| 6: Reports + Deploy | **Complete** | Report generator (REQ-12), deployment planner (REQ-15), EO module refactor (REQ-16) |
| 7: Integration | **Complete** | E2E testing (33 integration + 12 deploy + 8 report + 9 perf = 62 new tests) |

### Enhancement Plan Waves (1–5)

| Wave | Status | Key Deliverables |
|------|--------|-----------------|
| 1: Foundation | **Complete** | Track proliferation fix, PostgreSQL+Auth infra, 7 scenarios, NATO symbols, MHT/JPDA doc |
| 2: UI + Roles | **Complete** | Fusion config sliders, role enforcement, deployment configs, EO popup, trail flash |
| 3: Detection | **Complete** | RCS-based radar, EO max range, auto-loop, user count, threat profiles, sensor library, system load |
| 4: Terrain + ASTERIX | **Complete** | SRTM LOS, ASTERIX CAT-048/062, investigation modes, feasibility docs |
| 5: Environment + 3D | **Complete** | Weather effects, clutter, Deck.gl 3D, ballistic display, architecture docs |

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
- **Full HTML/SVG rendering**: DebugOverlay is the ONLY renderer for ALL visual elements. MapLibre is used ONLY for raster map tiles.
- **Why**: MapLibre WebGL data layers (circles, lines, fills, symbols — ALL of them) are completely non-functional in the Cloud Run production environment. Not just fonts/glyphs — the entire WebGL pipeline for data layers is broken.
- **DebugOverlay**: Returns two layers: SVG (z-index 14) for geometry (coverage arcs, EO rays, FOV, triangulation) + HTML divs (z-index 15) for markers (tracks, sensors, labels, trails).
- **MapLibre data layer code**: Kept as fallback but NOT the active rendering path. Do not rely on it.
- **Full post-mortem**: See `Knowledge_Base_and_Agents_instructions/Blank_Map_Postmortem_and_Testing_Lessons.md`

### Deck.gl 3D Rendering
- Deck.gl uses a **separate WebGL context** from MapLibre, so it may work in environments where MapLibre WebGL data layers fail (e.g., Cloud Run).
- 3D view (ballistic display, altitude extrusion) is rendered via Deck.gl overlay on the map.
- If Deck.gl also fails in production, the same HTML/SVG fallback strategy from DebugOverlay applies.

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

### Deployment Guardrails (GCP Cloud Run + Cloud SQL)
- **GCP Edition**: Project uses **Enterprise Plus** Cloud SQL edition — NEVER suggest `db-f1-micro` or `db-g1-small` tiers (incompatible). Use `db-custom-*` or `db-n1-*` tiers only
- **Required GCP APIs** — verify these are enabled before any deployment:
  - `sqladmin.googleapis.com` (Cloud SQL Admin)
  - `run.googleapis.com` (Cloud Run)
  - `cloudbuild.googleapis.com` (Cloud Build)
  - `artifactregistry.googleapis.com` (Artifact Registry)
- **Auth startup safety**: Auth plugin (`auth-plugin.ts`) connects to PostgreSQL synchronously at startup. If `AUTH_ENABLED=true` but `DATABASE_URL` is missing/wrong, the container will hang and fail Cloud Run health check. Always set `AUTH_ENABLED=false` in CI unless DB credentials are configured in the build trigger
- **DB password**: Never hardcode in `cloudbuild.yaml`. Pass via `--substitutions=_DB_PASSWORD=xxx` or use Secret Manager
- **Cloud SQL proxy**: The `--add-cloudsql-instances` flag is only needed when `AUTH_ENABLED=true`
- **Health check**: Cloud Run expects HTTP 200 on `/api/health` within startup timeout. If server hangs on DB connection, increase `--startup-cpu-boost` or fix the root cause

### Docker / CI Build Checklist
- After adding new source files or directories, always verify the Dockerfile includes the necessary COPY steps for `package.json` (line ~10-29) and source dirs
- Test container startup locally before pushing to Cloud Build: `docker build -t eloc2-test . && docker run -p 3001:3001 -e NODE_ENV=production eloc2-test`
- Ensure all route endpoints (especially `/api/auth/status`) are registered before deploying
- When fixing a blank page or UI issue in production, check BOTH the backend (missing routes/endpoints) AND the frontend build output (static files copied correctly) before declaring the fix complete

## Development
- Package manager: pnpm (v9.15.0) with workspaces
- Build: `pnpm build` (uses Turbo)
- Test: `pnpm test` (514 tests, all passing)
- Dev branch: `claude/eloc2-handover-deployment-XSyf8`
- Dockerfile: 2-stage build, serves workstation static files from API on port 3001
- Vite dev server on port 3000 proxies `/api` and `/ws` to 3001
- Auth: Set `AUTH_ENABLED=true` env var to enable PostgreSQL-backed authentication (requires running DB)
- PostgreSQL: Use `docker-compose.yml` to start the database for auth/session management

## Conventions
- Branded types: `SystemTrackId`, `SensorId`, `Timestamp` (string/number underneath)
- Track status: tentative → confirmed (after 3 updates) → dropped (after 8 misses)
- Colors: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333
- Sensor colors: radar=#4488ff, eo=#ff8800, c4isr=#aa44ff
- Event-sourced: all state changes through EventStore
- 3D honesty: bearing_only | candidate_3d | confirmed_3d — never overstate geometry
