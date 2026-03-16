# ELOC2 Session Handover — EO C2 Air Defense Demonstrator

## What This Project Is

A web-based demonstrator showing how electro-optical (EO) sensors integrated in a network within an air defense surveillance system autonomously interrogate every radar plot. The system builds a Recognized Air Picture (RAP) from multiple radar/C4ISR sources, autonomously assigns EO sensors to investigate tracks based on coverage and geometry, handles multi-target FOV situations, produces 3D plots via triangulation, and presents the entire process on an interactive map with replay.

**Demo scenario region:** Central Israel. **EO results:** Simulated (not real ML).

---

## Current State (as of commit 1f2500f — 2026-03-16)

### Phase Completion Matrix

| Phase | Description | Status | Tests |
|-------|-------------|--------|-------|
| **0** | Bootstrap: monorepo, 12 packages + 3 apps | **Complete** | Build passes |
| **1** | Fusion core: correlation, fusion, track management, event store, RAP | **Complete** | 29 |
| **2** | Registration: bias estimation, clock health, fusion gating | **Complete** | 23 |
| **3** | EO cueing: cue issuance, gimbal/FOV models, EO reports | **Complete** | 50 |
| **4** | Tasking: scoring, policy engine, operator controls, assignment | **Complete** | 22 |
| **5** | Multi-target: ambiguity handler, split/merge, EoTrack | **Complete** | (in 50) |
| **6** | Triangulation: bearing math, triangulator, quality scorer | **Packages complete, wired into live-engine** | 22 |
| **7** | Advanced fusion: mode selector, conservative/centralized fusers | **Packages complete, wired into live-engine** | included |
| **8** | Workstation UI: map, panels, layers, responsive layout | **~85% complete** | 0 (no frontend tests) |
| **9** | Scenarios + validation: central-israel, simple scenarios | **Partial** | 0 (no integration tests) |

**Total: ~146+ unit tests passing across all packages. Build clean. 30 turbo tasks pass.**

### What Was Done in This Session

1. **Geometry wired into live-engine** (Gap 1 closed) — `@eloc2/geometry` triangulation called after bearing processing, results stored and broadcast via WS
2. **Advanced fusion wired** (Gap 2 closed) — fusion-mode-selector integrated, conservative/centralized modes active based on registration health
3. **Validation framework** connected — assertion runner wired to live-engine output
4. **Task panel** — full EO tasking panel with approve/reject/reserve controls
5. **Layer filter panel** — toggleable visibility for tracks, sensors, coverage, EO rays, triangulation
6. **Mobile responsive layout** — iPhone single-pane with bottom sheet, iPad two-pane collapsible
7. **Map symbol rendering fixes** — font fallback, DebugOverlay HTML markers, try/catch isolation
8. **WS payload optimization** — lineage capped to last 3 entries per track

---

## Remaining Gaps (Priority Order)

### HIGH Priority

| Gap | Description | Files to Change |
|-----|-------------|----------------|
| **Map symbols blank** | Header shows 95 tracks but map is blank. MapLibre v5 font/glyph loading likely failing. DebugOverlay fallback exists but needs verification on deploy. | `apps/workstation/src/map/MapView.tsx`, `track-layer.ts`, `sensor-layer.ts` |
| **Deploy to Cloud Run** | Changes not yet deployed. Need merge to master → Cloud Build trigger. | `cloudbuild.yaml`, manual: `gcloud builds submit` |

### MEDIUM Priority

| Gap | Description | Files to Change |
|-----|-------------|----------------|
| **Replay/timeline scrubbing** | Timeline scrubber hardcoded at 50%. No server-side seek. `replayTime` unused. | `TimelinePanel.tsx`, `ui-store.ts`, new `replay-routes.ts` |
| **Ambiguity markers on map** | Unresolved groups exist in backend but no map visualization | New `ambiguity-marker-layer.ts`, `MapView.tsx` |
| **Per-sensor degraded indicators** | Only global banner exists, no per-sensor visual on map | `sensor-layer.ts`, `live-engine.ts` (broadcast reg states) |
| **Integration tests** | `tests/integration/`, `tests/regression/` empty. No pipeline test. | `tests/integration/`, `packages/validation/src/runner.ts` |
| **Missing API endpoints** | No replay seek, no EO cue details, no unresolved groups endpoint | `apps/api/src/routes/` |

### LOW Priority

| Gap | Description | Files to Change |
|-----|-------------|----------------|
| **Additional named scenarios** | Only central-israel + simple-scenarios. Plan calls for 8. | `packages/scenario-library/src/scenarios/` |
| **TrackDetail enhancements** | Fusion mode, ID support, split history not shown | `TrackDetailPanel.tsx` |
| **Playwright E2E tests** | Phase 8 requirement, not started | New `tests/e2e/` |

---

## Architecture Quick Reference

```
ELOC2/
├── apps/
│   ├── api/             Fastify + WebSocket, live simulation engine
│   ├── workstation/     React 19 + MapLibre GL JS 5 + Zustand 5
│   └── simulator/       ScenarioRunner generates observations
├── packages/
│   ├── domain/          ✅ Branded types, SystemTrack, Position3D, etc.
│   ├── events/          ✅ 14 canonical events with envelope
│   ├── schemas/         ✅ Runtime validators
│   ├── shared-utils/    ✅ geo-math, matrix, SimulationClock, UUID
│   ├── fusion-core/     ✅ Correlator, fuser, TrackManager, EventStore, RAP
│   ├── registration/    ✅ BiasEstimator, ClockHealth, HealthService
│   ├── eo-investigation/✅ CueIssuer, Gimbal, FOV, Report, Ambiguity, Split/Merge
│   ├── eo-tasking/      ✅ Scorer, Generator, PolicyEngine, Assigner
│   ├── geometry/        ✅ Triangulator, bearing-math, quality-scorer, time-aligner
│   ├── projections/     ✅ View builders (RAP, sensor health, EO cues, geometry)
│   ├── scenario-library/✅ central-israel + simple-scenarios
│   └── validation/      ✅ Assertion framework (needs integration runner)
├── Knowledge_Base_and_Agents_instructions/  15 design docs (SOURCE OF TRUTH)
│   ├── EO_C2_demo_for_air_defense.md        High-level concept & requirements
│   ├── EO_C2_build_roadmap.md               Phase sequence & acceptance criteria
│   ├── EO_C2_demo_build_knowledge_base.md   Research-grounded design decisions
│   ├── EO_C2_repo_scaffold_spec.md          Monorepo structure & package boundaries
│   ├── EO_C2_search_outcome_report.md       Technology evaluation rationale
│   ├── RAP_fusion_architecture.md           Correlation, fusion, track mgmt (Ph 1,7)
│   ├── Radar_EO_cueing_and_fusion.md        Radar→EO cueing, fusion modes (Ph 3,7)
│   ├── Sensor_registration_and_timing.md    Bias estimation, clock health (Ph 2,7)
│   ├── EO_sensor_tasking.md                 Scoring, policy engine (Ph 4)
│   ├── EO_multi_target_resolution.md        Ambiguity, split/merge (Ph 5)
│   ├── EO_triangulation_geometry.md         Bearing math, triangulation (Ph 6)
│   ├── Map_simulation_and_workstation.md    UI layout, map layers (Ph 8)
│   ├── Claude_code_prompt_templates.md      Agent execution prompts
│   ├── Claude_agent_build_prompts.md        Detailed agent prompts + done criteria
│   └── Chunk_index.md                       Index of all KB chunks
├── docs/plans/
│   ├── implementation-plan.md    Full 10-phase plan
│   └── gap-completion-plan.md    Gap analysis with fix steps
├── Dockerfile                    2-stage build, serves UI from API on :3001
├── cloudbuild.yaml               GCP Cloud Build CI/CD
└── HANDOVER.md                   This file
```

### Data Flow

```
ScenarioRunner.step() → SimulationEvent[]
  → LiveEngine.processSimEvent() → TrackManager.processObservation()
    → fusionModeSelector → conservative/centralized/basic fusion
    → triangulate() when ≥2 EO bearings exist
  → LiveEngine.broadcastRap() → WebSocket "rap.update"
    → ReplayController → Zustand stores (tracks, sensors, tasks, geometry)
      → MapView effects → updateTrackLayer/updateSensorLayer/etc.
      → DebugOverlay → HTML markers (MapLibre bypass fallback)
```

---

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (turbo cached)
pnpm test             # Run all tests (~146 passing)
pnpm dev              # workstation (:3000) + api (:3001)
```

### Deploy

```bash
# Auto: merge to master → Cloud Build triggers
git checkout master && git merge claude/eloc2-development-ElpmM
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

---

## Reference Documents Per Task

| Task Area | Primary Reference |
|-----------|------------------|
| Triangulation | `EO_triangulation_geometry.md` |
| Fusion modes | `Radar_EO_cueing_and_fusion.md` + `Sensor_registration_and_timing.md` |
| Workstation UI | `Map_simulation_and_workstation.md` |
| Scenarios | `EO_C2_build_roadmap.md` |
| Agent prompts | `Claude_code_prompt_templates.md` + `Claude_agent_build_prompts.md` |
