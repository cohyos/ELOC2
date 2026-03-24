# ELOC2 — EO C2 Air Defense Demonstrator

## Project Overview
Air defense C2 demonstrator with sensor fusion, EO investigation, and tasking.
Monorepo: `packages/` (domain libs) + `apps/` (api, workstation, simulator).

## Architecture
- **Backend**: `apps/api` — Fastify server, WebSocket events, live simulation engine
- **Frontend**: `apps/workstation` — React 19 + Leaflet (Canvas 2D) + Zustand 5 stores
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
- **EO Investigation**: `packages/eo-investigation` — Cue handling, gimbal/FOV models, EO reporting, ambiguity, split/merge
- **EO Tasking**: `packages/eo-tasking` — Candidate generation, scoring, policy engine, assignment, operator controls
- **Registration**: `packages/registration` — Bias estimation, clock health, registration health service
- **Events**: `packages/events` — Event types and event store for event-sourced state changes
- **Projections**: `packages/projections` — RAP projection and state projection utilities
- **Scenario Library**: `packages/scenario-library` — Predefined scenario definitions (central-israel, etc.)
- **Schemas**: `packages/schemas` — Zod validation schemas for API payloads
- **Shared Utils**: `packages/shared-utils` — Common utilities shared across packages
- **Validation**: `packages/validation` — Input validation and assertion helpers
- **Sensor Bus**: `packages/sensor-bus` — EventEmitter-based message bus for distributed sensor architecture (Redis-ready)
- **Sensor Instances**: `packages/sensor-instances` — Independent sensor classes (RadarSensorInstance, EoSensorInstance, C4isrSensorInstance)
- **EO Core**: `packages/eo-core` — EO CORE entity: bearing aggregation, cross-sensor triangulation, EO track management, investigator coordinator
- **System Fuser**: `packages/system-fuser` — Track-to-track fusion, DistributedPipeline orchestrator, LifecycleManager

## Key Files
- `apps/api/src/simulation/live-engine.ts` — Main simulation loop, WS broadcast, geometry & fusion integration
- `apps/workstation/src/map/MapView.tsx` — Map component, layer init
- `apps/workstation/src/map/layers/track-layer.ts` — Track circle + label layers
- `apps/workstation/src/map/layers/sensor-layer.ts` — Sensor circle + label layers
- `apps/workstation/src/map/layers/triangulation-layer.ts` — EO bearing rays + intersection points
- `apps/workstation/src/map/DebugOverlay.tsx` — Native Leaflet layer renderer (markers, polylines, circles, polygons)
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
- `apps/workstation/src/reports/ReportModal.tsx` — Report type/time selection modal (REQ-19)
- `apps/workstation/src/admin/UserManagementView.tsx` — User management page (REQ-23)
- `packages/sensor-bus/src/bus.ts` — SensorBus EventEmitter message bus
- `packages/sensor-bus/src/types.ts` — SensorTrackReport, BearingReport, SystemCommand, GroundTruthBroadcast
- `packages/sensor-instances/src/base-sensor.ts` — Abstract SensorInstance base (own TrackManager, GT filtering, commands)
- `packages/sensor-instances/src/radar-sensor.ts` — RadarSensorInstance (local tracks, dual-hypothesis BM/ABT)
- `packages/sensor-instances/src/eo-sensor.ts` — EoSensorInstance (gimbal, bearing reports, cue/search handling)
- `packages/sensor-instances/src/c4isr-sensor.ts` — C4isrSensorInstance (system-level local tracks)
- `packages/eo-core/src/eo-core.ts` — EoCoreEntity (bearing aggregation → triangulation → EO tracks)
- `packages/eo-core/src/investigator-coordinator.ts` — Greedy EO sensor-to-track assignment with dwell/revisit
- `packages/system-fuser/src/system-fuser.ts` — Track-to-track fusion (Mahalanobis correlation + information-matrix)
- `packages/system-fuser/src/distributed-pipeline.ts` — DistributedPipeline orchestrator (full GT→system tracks pipeline)
- `packages/system-fuser/src/lifecycle-manager.ts` — LifecycleManager (WS disconnect cleanup, scenario switch, reset)

## Data Flow

### Monolithic Pipeline (LiveEngine — current production)

1. `ScenarioRunner.step()` generates `SimulationEvent[]` (observations, bearings, faults)
2. `LiveEngine.processSimEvent()` feeds observations through `TrackManager.processObservation()`
3. Fusion-mode-selector picks basic/conservative/centralized based on registration health
4. When ≥2 EO bearings exist for a track, `@eloc2/geometry` triangulation is called
5. `LiveEngine.broadcastRap()` sends tracks/sensors/geometry via WebSocket as `rap.update`
6. `ReplayController.handleMessage()` calls `setTracks()`/`setSensors()` on Zustand stores
7. `MapView` effects call `updateTrackLayer()`/`updateSensorLayer()` when data changes
8. `DebugOverlay` renders via native Leaflet layers (markers, polylines, circles, polygons)
9. Auth middleware (`auth-plugin.ts`) validates session tokens on protected routes when `AUTH_ENABLED=true`
10. ASTERIX adapter can ingest live CAT-048/CAT-062 UDP feeds and convert to internal observation format

### Distributed Pipeline (New — 124 tests, ready for integration)
1. `DistributedPipeline.tick()` broadcasts `GroundTruthBroadcast` on `SensorBus`
2. Each `SensorInstance` receives GT, filters by coverage, generates observations
3. Radar/C4ISR sensors maintain local tracks via own `TrackManager`, publish `SensorTrackReport`
4. EO sensors generate bearing reports via `generateEoBearing()`, publish `BearingReport`
5. `EoCoreEntity` aggregates bearings, finds cross-sensor matches, triangulates (≥2 sensors)
6. EO CORE publishes triangulated positions as `SensorTrackReport` (sensorId=`EO-CORE`)
7. `SystemFuser` correlates all incoming local tracks → fuses into system tracks
8. `InvestigatorCoordinator` assigns EO sensors to highest-priority system tracks via `CueCommand`
9. System-level classification sends `GatingOverrideCommand` to sensors for BM/ABT gating
10. `LifecycleManager` handles cleanup on WS disconnect, scenario switch, reset/destroy

## Knowledge Base — Source of Truth

The `Knowledge_Base_and_Agents_instructions/` folder contains **28 foundational design documents** (10,000+ lines) that define ALL domain logic, algorithms, and UI requirements. **Always consult the relevant document before implementing or debugging a feature.**

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
| `Instructor_Operator_UX_Plan.md` | **Instructor/Operator UX plan: REQ-17–23, role picker, header layout, PDF reports, user mgmt** | **Current** |
| `Claude_code_prompt_templates.md` | Copy-paste agent prompts with shared prefix | Agent execution |
| `Claude_agent_build_prompts.md` | Detailed agent prompts with scope + done criteria | Agent execution |
| `Raster_Map_Reimplementation_Design.md` | **Full spec for raster map renderer replacement, rollback strategy** | **Design** |
| `ELOC2_System_Updates_Plan.md` | **System updates plan: bug fixes, libraries, editor/planner, implementation status** | **Current** |
| `Symbology_and_Icon_Reference.md` | **Complete icon/symbol reference: track, sensor, NATO, EO popup, context menus, color palette** | **Reference** |
| `Chunk_index.md` | Index of all knowledge base chunks for retrieval | Reference |

## Current Completion (as of 2026-03-24)

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

### Instructor/Operator UX Plan (REQ-17 — REQ-23)
See `Knowledge_Base_and_Agents_instructions/Instructor_Operator_UX_Plan.md` for full details.

| REQ | Title | Status |
|-----|-------|--------|
| REQ-17 | No Auto-Start | ✅ Complete |
| REQ-18 | No Auto-Inject | ✅ Complete |
| REQ-19 | PDF Reports | ✅ Complete |
| REQ-20 | Hybrid Role Selection | ✅ Complete |
| REQ-21 | Instructor Button Grouping | ✅ Complete |
| REQ-22 | Operator Mode Restrictions | ✅ Complete |
| REQ-23 | User Management Page | ✅ Complete |

### EO-Only Pipeline Stress Testing (2026-03-23, branch `claude/eloc2-development-QxD7P`)

| Component | Score | Notes |
|-----------|-------|-------|
| EO Stress Test (overall) | **B 84/100** | Up from 48/100 initial; 0 critical issues |
| S1: Bearing Generation | **A 90/100** | 0.1° noise, DRI-based detection, 80° elevation |
| S2: Correlation | **B 82/100** | Angular clustering replaces Union-Find for multi-target |
| S3: Triangulation | **B 70/100** | 89° intersection angle, 53m miss at best; limited by false groups |
| S4: Track Management | **B 74/100** | Core detector→stale order fix; dropped-track revival |
| S5: Quality Assessment | **B 77/100** | Follows S4 coverage |
| Green Pine (radar+EO) | **B 74/100** | Slight regression from correlation change |

**Key files:**
- `apps/api/src/__tests__/eo-staring-stress.test.ts` — EO-only scenario stress test
- `apps/api/src/__tests__/eo-pipeline-stages.test.ts` — Per-stage pipeline grading test
- `packages/scenario-library/src/scenarios/eo-staring-defense.ts` — 19-sensor EO-only scenario
- `eo-stress-test-reports/` — JSON reports per iteration
- `eo-pipeline-reports/` — Per-stage grading reports

**EO Module Portability:**
| Package | Portability | Notes |
|---------|-------------|-------|
| `@eloc2/geometry` | **PORTABLE** | Pure math, zero coupling |
| `@eloc2/sensor-bus` | **PORTABLE** | EventEmitter-based, framework-agnostic |
| `@eloc2/eo-core` | **PORTABLE** | Bearing aggregation + triangulation |
| `@eloc2/eo-investigation` | **PORTABLE** | Gimbal/FOV/ambiguity logic |
| `@eloc2/eo-tasking` | **PORTABLE** | Pure scoring/assignment algorithms |
| `@eloc2/sensor-instances` | **CONDITIONAL** | Needs `EoBearingGenerator` interface (defined, not yet injected) |
| `@eloc2/system-fuser` | **CONDITIONAL** | Transitive coupling via sensor-instances; needs tests |
| `@eloc2/eo-management` | **CONDITIONAL** | Monolithic design; needs service extraction |

### Distributed Sensor Architecture (2026-03-23, branch `claude/eloc2-development-QxD7P`)

| Milestone | Status | Tests | Key Deliverables |
|-----------|--------|-------|-----------------|
| 1: Sensor Bus + Base | ✅ Complete | 11 | SensorBus (EventEmitter), SensorInstance abstract base, GT filtering |
| 2: Radar + C4ISR | ✅ Complete | 54 | RadarSensorInstance, C4isrSensorInstance, sensor factory |
| 3: EO + CORE | ✅ Complete | 21 | EoSensorInstance (gimbal), EoCoreEntity (triangulation), InvestigatorCoordinator |
| 4: System Fuser | ✅ Complete | 12 | SystemFuser (track-to-track fusion, merge, lifecycle) |
| 5: Pipeline + Integration | ✅ Complete | 11 | DistributedPipeline orchestrator, 11 E2E integration tests |
| 6: Classification + Lifecycle | ✅ Complete | 15 | ABT/BM gating override, LifecycleManager (WS cleanup, scenario switch) |
| **Total** | **Complete** | **124** | **4 new packages, full distributed pipeline** |

### System Updates (2026-03-20, branch `claude/review-knowledge-base-FTTzx`)

| Task | Status | Notes |
|------|--------|-------|
| BF-1: Report button fix | ✅ Complete | Fixed pdfmake font paths (TTF instead of JS), added error display in modal |
| BF-3: Map first-click fix | ✅ Complete | Removed 500ms setTimeout delay on map instance handoff to DebugOverlay |
| BF-4: Refresh rate optimization | ✅ Complete | EO tasking 5s→3s, fallback polling 10s→5s |
| UI-1: Rectangle zoom | ✅ Complete | Ctrl+left-click+drag box zoom on all 3 maps |
| UI-2: Unified map behavior | ✅ Complete | All maps use CARTO Dark tiles, same controls/interaction |
| LIB-1: Sensor type library | ✅ Complete | 15 sensor types (5 radar + 5 EO + 5 original), CRUD API + UI panel |
| LIB-2: Target type library | ✅ Complete | 52 targets: 12 BM, 11 ABT, 11 fighters, 6 heli, 6 civil, 6 mil transport |
| LIB-3: Scenario library UI | ✅ Complete | List/load/clone/export/delete with instructor-gated CRUD |
| DP-1: Deployment persistence | ✅ Complete | File-based JSON persistence in `configs/deployments/` |
| DP-2: Deployment library | ✅ Complete | 3 predefined deployments (discovery-squadron, border-line, forward-outpost) |
| DP-3: Sensor library integration | ✅ Complete | Sensor type picker from library in deployment panel |
| ED-1: Load deployment into editor | ✅ Complete | "Load Deployment" button in editor header |
| ED-2: Zone drawing (areas/exclusions/threats) | ✅ Complete | Polygon drawing mode with operational/exclusion/threat zones |
| ED-3: Sensor enhancements | ✅ Complete | Nickname, library picker, template auto-fill |
| ED-4: Target enhancements | ✅ Complete | Nickname, IR emission, classification, library integration |
| ED-5: Draggable sensors | ✅ Complete | Sensor drag on editor map (waypoint drag already existed) |
| ED-6: Target library integration | ✅ Complete | "From Library" dropdown auto-fills RCS/speed/altitude/IR |
| Waypoint limits | ✅ Complete | Speed: 0–7000 m/s, Altitude: 0–200,000m (ballistic missile support) |
| Terrain elevation API | ✅ Complete | GET `/api/terrain/elevation?lat=X&lon=Y` |
| Raster map reimplementation | ✅ Complete | MapLibre replaced with Leaflet (Canvas 2D), native Leaflet layers for all rendering |

### Security Hardening (2026-03-24, branch `claude/eloc2-development-QxD7P`)

| Task | Status | Notes |
|------|--------|-------|
| SEC-1: Remove hardcoded credentials | ✅ Complete | `ADMIN_DEFAULT_PASSWORD` env var required (≥12 chars) |
| SEC-2: Docker non-root | ✅ Complete | `eloc2` user, HEALTHCHECK, source map strip |
| SEC-3: Security headers | ✅ Complete | HSTS, X-Frame-Options, X-Content-Type-Options, XSS-Protection |
| SEC-4: CORS configuration | ✅ Complete | Explicit origin allowlist via `CORS_ORIGINS` env var |
| SEC-5: Rate limiting | ✅ Complete | Login: 10 attempts / 15 min / IP |
| SEC-6: Body size limits | ✅ Complete | Fastify bodyLimit = 10MB |
| SEC-7: Secure cookies | ✅ Complete | `Secure` flag in production |
| SEC-8: bcrypt → bcryptjs | ✅ Complete | Eliminates 6 HIGH tar CVEs, salt rounds 10→12 |
| SEC-9: Auth guards | ✅ Complete | All 7 deployment POST routes require instructor role |
| SEC-10: Path traversal fix | ✅ Complete | Deployment ID validation + path containment |
| SEC-11: WS connection limit | ✅ Complete | Max 50 concurrent WebSocket clients |
| SEC-12: ASTERIX validation | ✅ Complete | Host whitelist, port range, parser iteration caps |
| SEC-13: XSS prevention | ✅ Complete | `escapeHtml()` on all popup/context menu labels |
| SEC-14: Memory leak prevention | ✅ Complete | Track pruning in TrackManager, EoTrackManager, SystemFuser |
| SEC-15: SensorBus error handler | ✅ Complete | Prevents process crash on unhandled EventEmitter error |
| SEC-16: Log redaction | ✅ Complete | password, session_id, cookie, authorization fields redacted |
| SEC-17: Error disclosure | ✅ Complete | Server errors logged internally, generic message to client |
| SEC-18: Password policy | ✅ Complete | Min 8 chars, max 128 chars |
| Leaflet zoom fix | ✅ Complete | `zoomSnap: 0`, `zoomDelta: 1`, `wheelDebounceTime: 80` — smooth zoom |
| Leaflet listener cleanup | ✅ Complete | contextmenu DOM listener + drag state cleanup on unmount |

## Key Files Added
- `apps/workstation/src/map/ctrl-box-zoom.ts` — Ctrl+drag rectangle zoom utility
- `apps/workstation/src/libraries/LibrariesView.tsx` — Libraries view (tabbed: sensors, targets, scenarios)
- `apps/workstation/src/libraries/SensorLibraryPanel.tsx` — Sensor CRUD panel
- `apps/workstation/src/libraries/TargetLibraryPanel.tsx` — Target CRUD panel with category filters
- `apps/workstation/src/libraries/ScenarioLibraryPanel.tsx` — Scenario list/clone/export/delete panel
- `configs/target-library.json` — 52 realistic target types (BM, ABT, fighters, heli, civil, mil)
- `configs/deployments/` — 3 pre-defined deployment files (JSON persistence)
- `Knowledge_Base_and_Agents_instructions/Raster_Map_Reimplementation_Design.md` — Map renderer design doc

## Recent Fixes (Rounds 1-5)

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

### Round 4 — Leaflet fixes (branch `claude/eloc2-development-QxD7P`)
- **Smooth zoom**: Replaced `zoomSnap: 0.25` / `zoomDelta: 0.5` with `zoomSnap: 0` / `zoomDelta: 1` on all 3 maps — eliminates two-step zoom animation
- **DOM listener cleanup**: `contextmenu` `addEventListener` now properly removed on unmount (was leaking on all 3 maps)
- **Drag handler safety**: DeploymentView + EditorMap reset drag state on unmount to prevent stale `mousemove`/`mouseup` handlers
- **wheelDebounceTime**: Added 80ms debounce to coalesce rapid scroll events

### Round 5 — Security hardening (branch `claude/eloc2-development-QxD7P`)
- **Hardcoded credentials removed**: Default `admin/admin123` replaced with `ADMIN_DEFAULT_PASSWORD` env var (≥12 chars required)
- **Docker non-root**: Container now runs as `eloc2` user (was root), HEALTHCHECK added, source maps stripped from prod image
- **Security headers**: X-Content-Type-Options, X-Frame-Options, HSTS, XSS-Protection, Referrer-Policy on all responses
- **CORS**: Explicit origin allowlist via `CORS_ORIGINS` env var (defaults to localhost in dev)
- **Rate limiting**: Login endpoint capped at 10 attempts / 15 min per IP
- **Body limit**: Fastify bodyLimit set to 10MB (was unlimited)
- **Secure cookie**: Session cookie gets `Secure` flag in production
- **bcrypt → bcryptjs**: Pure JS drop-in eliminates 6 HIGH `tar` CVEs from native `bcrypt` → `@mapbox/node-pre-gyp` → `tar@6.2.1` chain; salt rounds increased 10→12
- **Auth guards**: All 7 deployment routes now require instructor role when `AUTH_ENABLED=true`
- **Path traversal**: Deployment ID validated non-empty + `path.resolve` containment check
- **WS connection limit**: Max 50 concurrent WebSocket clients (was unbounded)
- **ASTERIX validation**: Export host whitelisted (localhost only), port validated (1024-65535), parser extension loop capped (64 iterations), Mode S rep count capped (32)
- **XSS prevention**: `escapeHtml()` applied to all popup/context menu labels in DebugOverlay
- **Memory leak prevention**: Track pruning added to TrackManager, EoTrackManager, SystemFuser — dropped tracks auto-removed after retention period
- **SensorBus crash prevention**: Error event handler added (prevents process crash on unhandled EventEmitter error)
- **Log redaction**: Sensitive fields (password, session_id, cookie, authorization) redacted from Fastify logs
- **Error disclosure**: Report routes no longer expose `err.message` to client
- **Password policy**: Minimum 8 chars (was 6), max 128 chars

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
- **Leaflet (Canvas 2D)**: MapLibre was fully replaced with Leaflet. All map rendering uses native Leaflet layers.
- **Why**: MapLibre WebGL data layers were completely non-functional in Cloud Run production. See `Blank_Map_Postmortem_and_Testing_Lessons.md` for the full post-mortem.
- **DebugOverlay**: Refactored to use native Leaflet API — L.marker, L.polyline, L.circle, L.polygon. No custom HTML/SVG overlays.
- **Map tiles**: CARTO Dark Matter (default), with dark/light toggle.
- **All 3 maps** (main, editor, deployment) use the same Leaflet-based architecture.

### Deck.gl 3D Rendering
- Deck.gl uses a **separate WebGL context** overlaid on the Leaflet map.
- 3D view (ballistic display, altitude extrusion) is rendered via Deck.gl overlay.
- If Deck.gl fails in production, fallback to 2D Leaflet rendering.

### Deployment (ACTIVE)
- **Live URL**: https://eloc2-820514480393.me-west1.run.app
- Cloud Build trigger active — merging to master triggers auto deploy
- Manual deploy:
  ```bash
  gcloud auth login
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
- **Health check**: Cloud Run expects HTTP 200 on `/api/health` within startup timeout. If server hangs on DB connection, increase `--cpu-boost` or fix the root cause

### Security Configuration (2026-03-24)
- **Docker**: Container runs as non-root `eloc2` user; source maps stripped from prod image
- **Admin seed**: Default admin account requires `ADMIN_DEFAULT_PASSWORD` env var (≥12 chars). Without it, no default user is created
- **CORS**: Set `CORS_ORIGINS=https://your-domain.com` in production. Defaults to `localhost:3000,localhost:3001` in dev
- **Rate limiting**: Login endpoint: 10 attempts / 15 min / IP. No env var override yet
- **WS connections**: Max 50 concurrent WebSocket clients (hardcoded in `LiveEngine.MAX_WS_CLIENTS`)
- **Session cookies**: `Secure` flag auto-added when `NODE_ENV=production`
- **Password policy**: Min 8 chars, max 128 chars (enforced in `auth-routes.ts`)
- **Deployment routes**: All POST endpoints require instructor role when `AUTH_ENABLED=true`
- **ASTERIX export**: Host restricted to localhost; port must be 1024-65535
- **Body size**: Fastify bodyLimit = 10MB; larger payloads rejected with 413
- **Log redaction**: Passwords, session IDs, cookies, and auth headers are redacted from Fastify logs

### Docker / CI Build Checklist
- After adding new source files or directories, always verify the Dockerfile includes the necessary COPY steps for `package.json` (line ~10-29) and source dirs
- Test container startup locally before pushing to Cloud Build: `docker build -t eloc2-test . && docker run -p 3001:3001 -e NODE_ENV=production eloc2-test`
- Ensure all route endpoints (especially `/api/auth/status`) are registered before deploying
- When fixing a blank page or UI issue in production, check BOTH the backend (missing routes/endpoints) AND the frontend build output (static files copied correctly) before declaring the fix complete
- Container runs as non-root `eloc2` user — ensure all file paths are writable by this user
- Source maps (`.js.map`, `.d.ts.map`) are stripped from production image automatically
- HEALTHCHECK is configured: `GET /api/health` every 30s with 15s startup grace period

## Development
- Package manager: pnpm (v9.15.0) with workspaces
- Build: `pnpm build` (uses Turbo)
- Test: `pnpm test` (all passing; 2 pre-existing sensor-instances failures)
- Dev branch: `claude/eloc2-development-QxD7P`
- Dockerfile: 2-stage build, non-root `eloc2` user, serves workstation static files from API on port 3001
- Vite dev server on port 3000 proxies `/api` and `/ws` to 3001
- Auth: Set `AUTH_ENABLED=true` + `DATABASE_URL` + `ADMIN_DEFAULT_PASSWORD` (≥12 chars) to enable PostgreSQL-backed authentication
- PostgreSQL: Use `docker-compose.yml` to start the database for auth/session management
- CORS: Set `CORS_ORIGINS` env var for production (comma-separated origins)
- Password hashing: `bcryptjs` (pure JS, 12 salt rounds) — no native compilation needed

## Conventions
- Branded types: `SystemTrackId`, `SensorId`, `Timestamp` (string/number underneath)
- Track status: tentative → confirmed (after 3 updates) → dropped (after 8 misses)
- Colors: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333
- Sensor colors: radar=#4488ff, eo=#ff8800, c4isr=#aa44ff
- Event-sourced: all state changes through EventStore
- 3D honesty: bearing_only | candidate_3d | confirmed_3d — never overstate geometry
