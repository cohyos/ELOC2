# ELOC2 Session Handover — EO C2 Air Defense Demonstrator

**Last updated:** 2026-03-21 | **Branch:** `claude/review-knowledge-base-FTTzx` | **Latest commit:** `1858a10`

---

## What This Project Is

A web-based demonstrator showing how electro-optical (EO) sensors integrated in a network within an air defense surveillance system autonomously interrogate every radar plot. The system builds a Recognized Air Picture (RAP) from multiple radar/C4ISR sources, autonomously assigns EO sensors to investigate tracks based on coverage and geometry, handles multi-target FOV situations, produces 3D plots via triangulation, and presents the entire process on an interactive map with replay.

**Live app:** https://eloc2-820514480393.me-west1.run.app
**Demo scenario region:** Central Israel. **EO results:** Simulated (not real ML).

---

## Current State (as of 2026-03-21)

### Phase Completion Matrix

| Phase | Description | Status | Tests |
|-------|-------------|--------|-------|
| **0** | Bootstrap: monorepo, 17 packages + 3 apps | **Complete** | Build passes |
| **1** | Fusion core: correlation, fusion, track management, event store, RAP | **Complete** | 29 |
| **2** | Registration: bias estimation, clock health, fusion gating | **Complete** | 23 |
| **3** | EO cueing: cue issuance, gimbal/FOV models, EO reports | **Complete** | 50 |
| **4** | Tasking: scoring, policy engine, operator controls, assignment | **Complete** | 22 |
| **5** | Multi-target: ambiguity handler, split/merge, EoTrack | **Complete** | (in 50) |
| **6** | Triangulation: bearing math, triangulator, quality scorer | **Complete** | 22 |
| **7** | Advanced fusion: mode selector, conservative/centralized fusers | **Complete** | included |
| **8** | Workstation UI: map, panels, layers, responsive layout | **~95%** | 0 (no frontend tests) |
| **9** | Scenarios + validation: central-israel, 7 scenarios | **Partial** | 0 (no integration tests) |

### Corrections & Upgrades (16/16 REQ items complete)

All 7 phases complete: Foundation, UI, EO Mgmt A, Quality+Land, EO Mgmt B, Reports+Deploy, Integration (62 new tests).

### Enhancement Waves (5/5 complete)

Wave 1 (Foundation), Wave 2 (UI+Roles), Wave 3 (Detection), Wave 4 (Terrain+ASTERIX), Wave 5 (Environment+3D).

### Instructor/Operator UX (REQ-17 through REQ-23 — all complete)

No auto-start, no auto-inject, PDF reports, hybrid role selection, instructor button grouping, operator mode restrictions, user management page.

### System Updates (all complete)

Bug fixes (BF-1/3/4), Map UI (UI-1/2), Libraries (LIB-1/2/3), Deployment planner (DP-1/2/3), Scenario editor (ED-1 through ED-6).

### Map Renderer Migration (complete)

MapLibre GL JS replaced with **Leaflet** (Canvas 2D rendering). All visual elements rendered via native Leaflet layers (markers, polylines, circles, polygons). DebugOverlay refactored to use Leaflet's native API. Deck.gl overlay retained for 3D altitude/trajectory visualization.

### Test Summary

**73 passing tests** across 4 test files:
- `instructor-ux.test.ts` — 23 tests (REQ-17–23)
- `integration.test.ts` — 33 tests
- `report-e2e.test.ts` — 8 tests
- `performance.test.ts` — 9 tests

---

## Architecture Quick Reference

```
ELOC2/
├── apps/
│   ├── api/             Fastify + WebSocket, live simulation engine
│   ├── workstation/     React 19 + Leaflet + Zustand 5
│   └── simulator/       ScenarioRunner generates observations
├── packages/
│   ├── domain/          Branded types, SystemTrack, Position3D, etc.
│   ├── events/          14 canonical events with envelope
│   ├── schemas/         Zod validation schemas
│   ├── shared-utils/    Geo-math, matrix, SimulationClock, UUID
│   ├── fusion-core/     Correlator, fuser, TrackManager, EventStore, RAP
│   ├── registration/    BiasEstimator, ClockHealth, HealthService
│   ├── eo-investigation/CueIssuer, Gimbal, FOV, Report, Ambiguity, Split/Merge
│   ├── eo-tasking/      Scorer, Generator, PolicyEngine, Assigner
│   ├── eo-management/   Modular EO module: pipelines, mode controller
│   ├── geometry/        Triangulator, bearing-math, quality-scorer, time-aligner
│   ├── projections/     View builders (RAP, sensor health, EO cues, geometry)
│   ├── scenario-library/7 scenarios (central-israel + 6 more)
│   ├── validation/      Assertion framework + runner
│   ├── deployment-planner/ Grid optimizer, LP refinement, 7 API endpoints
│   ├── terrain/         SRTM DEM line-of-sight checker
│   ├── asterix-adapter/ CAT-048/062 parsing + export
│   └── database/        PostgreSQL user/session management
├── configs/
│   ├── sensor-library.json    15 sensor types (5 radar + 5 EO + 5 original)
│   ├── target-library.json    52 target types (BM, ABT, fighters, heli, civil, mil)
│   └── deployments/           3 pre-defined deployment configs
├── Knowledge_Base_and_Agents_instructions/  28 design docs (SOURCE OF TRUTH)
├── Dockerfile                 2-stage build, serves UI from API on :3001
├── cloudbuild.yaml            GCP Cloud Build CI/CD
├── CLAUDE.md                  Project instructions for Claude Code
└── HANDOVER.md                This file
```

### Data Flow

```
ScenarioRunner.step() → SimulationEvent[]
  → LiveEngine.processSimEvent() → TrackManager.processObservation()
    → fusionModeSelector → conservative/centralized/basic fusion
    → triangulate() when ≥2 EO bearings exist
  → LiveEngine.broadcastRap() → WebSocket "rap.update"
    → ReplayController → Zustand stores (tracks, sensors, tasks, geometry)
      → Leaflet map layers (markers, polylines, circles, polygons)
      → Deck.gl overlay (3D altitude, ballistic trajectories)
```

---

## Remaining Gaps

### HIGH — Must fix for full demo readiness
| Gap | Description |
|-----|-------------|
| **Playwright E2E** | Browser smoke tests not yet implemented |
| **Integration tests** | Full pipeline scenario→live-engine→validation assertions |

### MEDIUM — Feature completeness
| Gap | Description |
|-----|-------------|
| **Additional scenarios** | 7 exist; plan called for 8+ |
| **Frontend unit tests** | No React component tests |

### LOW — Polish
| Gap | Description |
|-----|-------------|
| **Cloud SQL auth in prod** | Auth works locally but disabled in Cloud Run (`AUTH_ENABLED=false`) |
| **Raster map design** | Full Leaflet Canvas spec written (`Raster_Map_Reimplementation_Design.md`), partially implemented |

---

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (turbo cached)
pnpm test             # Run all tests (73 passing)
pnpm dev              # workstation (:3000) + api (:3001)
```

### Deploy

```bash
# Auto: merge to master → Cloud Build triggers
git checkout master && git merge <dev-branch>

# Manual:
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=eloc2demo
```

---

## Design Decisions (Locked In)

1. **Event-sourced**: All state via EventStore. Replay reconstructs from events.
2. **Track state machine**: tentative → confirmed (3 updates) → dropped (8 misses)
3. **Correlation**: Mahalanobis distance, chi-squared gate 9.21 (2-DoF 99%)
4. **Fusion**: Information-matrix weighted. Conservative (covariance intersection) when degraded.
5. **Registration gating**: `fusionSafe === false` → confirmation-only mode
6. **EO cueing**: Carries predicted state, covariance, uncertainty gate, priority, validity window
7. **Tasking scoring**: `total = w1*threat + w2*uncertainty + w3*geometry + w4*operator - w5*slew - w6*occupancy`
8. **Policy modes**: recommended_only, auto_with_veto, manual
9. **Multi-target**: Delayed association via UnresolvedGroup, not forced 1:1
10. **3D geometry honesty**: bearing_only | candidate_3d | confirmed_3d — never overstate
11. **Responsive UI**: PC (3-pane), iPad (2-pane), iPhone (single + bottom sheet)
12. **Colors**: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333; radar=#4488ff, eo=#ff8800, c4isr=#aa44ff
13. **Map renderer**: Leaflet (Canvas 2D) — replaced MapLibre due to WebGL failures in Cloud Run
14. **Dual rendering**: Native Leaflet layers for all map elements; Deck.gl for 3D overlay

---

## Reference Documents Per Task

| Task Area | Primary Reference |
|-----------|------------------|
| Triangulation | `EO_triangulation_geometry.md` |
| Fusion modes | `Radar_EO_cueing_and_fusion.md` + `Sensor_registration_and_timing.md` |
| Workstation UI | `Map_simulation_and_workstation.md` + `ELOC2_UI_Requirements_and_VV_Spec.md` |
| Scenarios | `EO_C2_build_roadmap.md` |
| Quality metrics | `ELOC2_Corrections_and_Upgrades_Plan.md` (REQ-8 through REQ-11) |
| Deployment planner | `ELOC2_Corrections_and_Upgrades_Plan.md` (REQ-15) |
| EO management | `ELOC2_Corrections_and_Upgrades_Plan.md` (REQ-16) |
| Instructor/Operator UX | `Instructor_Operator_UX_Plan.md` (REQ-17 through REQ-23) |
| System updates | `ELOC2_System_Updates_Plan.md` |
| Map rendering | `Raster_Map_Reimplementation_Design.md` + `Blank_Map_Postmortem_and_Testing_Lessons.md` |
| ASTERIX integration | `ASTERIX_Integration.md` + `ASTERIX_Feasibility_Study.md` |
| Agent prompts | `Claude_code_prompt_templates.md` + `Claude_agent_build_prompts.md` |
