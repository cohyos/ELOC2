# ELOC2 Implementation Plan — EO C2 Air Defense Demonstrator

## Context

Build a web-based demonstrator showing how electro-optical (EO) sensors integrated in a network within an air defense surveillance system autonomously interrogate every radar plot. The system builds a Recognized Air Picture (RAP) from multiple sources, autonomously assigns EO sensors to investigate tracks based on coverage and geometry, handles multi-target FOV situations, produces 3D plots via triangulation, and presents the entire process on an interactive map. The demo uses a default scenario set in central Israel with simulated EO results. No code exists yet — only 15 knowledge-base documents in `Knowledge_Base_and_Agents_instructions/`.

---

## Platform Requirements

The demo is a **responsive web application** that runs in any modern browser on:
- **iPhone** (Safari/Chrome) — touch-optimized, single-pane with swipe navigation between map/details/timeline
- **iPad** (Safari/Chrome) — two-pane layout, map + collapsible side panel
- **Standard PC** (Chrome/Firefox/Edge) — full three-pane layout with all overlays

No native app or installation required. The user opens a URL and the demo runs. The UI uses responsive breakpoints and touch-friendly controls. MapLibre GL JS supports touch gestures (pinch-zoom, pan, rotate) natively.

---

## Technology Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| Language | **TypeScript 5.5+ (strict)** | Shared types across all packages; safety for complex domain model |
| Runtime | **Node.js 20 LTS** | ESM native, stable |
| Monorepo | **pnpm + Turborepo** | Strict dependency isolation matches spec's "strict package boundaries" |
| Package bundler | **tsup** (esbuild) | Fast library builds |
| Frontend | **React 19 + Vite** | Component composition for three-pane layout with overlays |
| Map | **MapLibre GL JS + OpenStreetMap tiles** | WebGL-accelerated; handles dense overlays (coverage arcs, FOV, triangulation rays, uncertainty ellipses) |
| State mgmt | **Zustand** | Lightweight stores mapping to `packages/projections` read models |
| Backend | **Fastify + WebSocket** | Fast HTTP + real-time event streaming to workstation |
| Data store | **In-memory event store + JSON file snapshots** | Event-sourced; no external DB needed; `pnpm dev` starts everything |
| Testing | **Vitest** (unit/integration), **Playwright** (E2E in Phase 8) |
| Math | **Hand-rolled small-matrix utils** | 3x3/6x6 covariance ops, bearing intersection — no heavy library needed |
| Linting | **ESLint + Prettier** |

---

## Phase 0: Bootstrap (Repo Skeleton)

Create the monorepo scaffold per `EO_C2_repo_scaffold_spec.md`:

```
ELOC2/
  pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .eslintrc.cjs
  apps/
    workstation/    (Vite + React + MapLibre blank map)
    simulator/      (simulation clock + event loop stub)
    api/            (Fastify server shell + WebSocket)
  packages/
    domain/         (common-types.ts: branded IDs, Position3D, Covariance, etc.)
    events/         (event-envelope.ts: eventId, eventType, timestamp, provenance)
    schemas/        (stub)
    fusion-core/    (stub dirs: ingest/, correlation/, fusion/, track-management/, rap-projection/, replay/)
    registration/   (stub)
    eo-tasking/     (stub)
    eo-investigation/ (stub)
    geometry/       (stub)
    projections/    (stub view files)
    scenario-library/ (stub)
    validation/     (stub)
    shared-utils/   (geo-math.ts: WGS84 conversions; uuid.ts; clock.ts)
  docs/, tests/, scripts/, configs/
```

**Done when:** `pnpm install && pnpm build && pnpm test` all succeed; `pnpm dev` shows blank MapLibre map centered on Israel.

---

## Phase 1: Fusion Core and Recognized Air Picture

**Packages:** `domain`, `events`, `schemas`, `fusion-core`, `projections`
**Ref:** `RAP_fusion_architecture.md`

**Key deliverables:**
- `SourceObservation` and `LocalTrack` models with validation
- Correlation engine using Mahalanobis distance with configurable gates, persisting score/method/evidence
- `SystemTrack` store with state machine: tentative → confirmed → dropped; create/update/merge/split/retire — all maintaining lineage
- RAP snapshot projection (read-only over core state)
- In-memory append-only event store with time-window and track-id queries
- Replay support: reconstruct RAP at any past time

**Key files:**
- `packages/fusion-core/src/correlation/correlator.ts` — statistical association
- `packages/fusion-core/src/fusion/fuser.ts` — information-matrix weighted fusion
- `packages/fusion-core/src/track-management/track-manager.ts` — state machine + lineage
- `packages/fusion-core/src/replay/event-store.ts` — append-only log

**Acceptance:** Two local radar tracks → one system track; lineage queryable; replay reconstructs RAP.

---

## Phase 2: Registration and Timing Health

**Packages:** `registration`, `domain`, `events`, `fusion-core` (integration), `projections`
**Ref:** `Sensor_registration_and_timing.md`

**Key deliverables:**
- `RegistrationState` per sensor: spatial bias, clock bias, quality level (good/degraded/unsafe), fusionSafe flag
- Bias estimator from common-track observation pairs
- Clock health monitoring (drift, ordering violations)
- Fusion gating: when `fusionSafe === false`, fuser falls back to confirmation-only mode
- Sensor health projection for UI

**Acceptance:** Injected 2-deg azimuth bias → visible degradation; correction → tracks reconverge; unsafe → precision fusion blocked.

---

## Phase 3: Radar-to-EO Cueing and Basic Investigation

**Packages:** `eo-investigation`, `domain`, `events`, `schemas`, `projections`
**Ref:** `Radar_EO_cueing_and_fusion.md`

**Key deliverables:**
- `EoCue` event: systemTrackId, predicted state, covariance/uncertainty gate, priority, validity window, dwell time, registration health
- Cue issuance service: extrapolate track state to EO dwell start, grow covariance
- Gimbal model: az/el state, configurable slew rate, `slewTo()`, `isInFov()`
- FOV model: rectangular, ground-projected footprint
- EO report ingest with outcomes: confirmed | refined | no_support | split_detected
- Cue/investigation projection for workstation

**Acceptance:** System track generates valid cue → EO reports confirmed/no_support → confidence updated; expired cue rejected.

---

## Phase 4: Human-Supervised Tasking

**Packages:** `eo-tasking`, `domain`, `events`, `projections`
**Ref:** `EO_sensor_tasking.md`

**Key deliverables:**
- Candidate generator: pair each un-investigated track with each available sensor
- Task scorer: `total = w1*threat + w2*uncertaintyReduction + w3*geometryGain + w4*operatorIntent - w5*slewCost - w6*occupancyCost`
- Policy engine: three modes — recommended_only, auto_with_veto, manual
- Operator controls: approve, reject, reserve sensor
- Assignment: greedy by score or Hungarian algorithm for multi-sensor matching
- Task timeline projection with full score breakdowns

**Acceptance:** 3 tracks compete for 1 sensor → highest scored wins with explanation; operator veto changes result; reservation blocks auto-assign.

---

## Phase 5: EO Multi-Target Resolution

**Packages:** `eo-investigation` (ambiguity + split-merge), `domain`, `events`, `projections`
**Ref:** `EO_multi_target_resolution.md`

**Key deliverables:**
- `EoTrack` entity with status: tentative | confirmed | unresolved | split | dropped
- `UnresolvedGroup` entity: holds multiple EO tracks pending disambiguation
- Split/merge logic with lineage preservation
- Association hypothesis representation (delayed assignment, not forced certainty)
- Identification support assessment from simulated image features
- Ambiguity projection exposing groups to UI

**Acceptance:** One cue → two EO detections → unresolved group → later split with lineage; replay explains reassociation.

---

## Phase 6: Triangulation and 3D Geometry

**Packages:** `geometry`, `domain`, `events`, `projections`
**Ref:** `EO_triangulation_geometry.md`

**Key deliverables:**
- Bearing math: compute bearing ray, intersect two rays (closest point of approach), intersection angle
- Time alignment: extrapolate bearings to common reference time using bearing rate
- Triangulator: 2-bearing least-squares; 3+ bearing overdetermined least-squares
- Quality scorer with thresholds: intersection angle <10° → insufficient, <30° → weak, <60° → acceptable, ≥60° → strong
- Classification: bearing_only | candidate_3d | confirmed_3d
- Geometry projection: triangulation rays, intersection point, uncertainty volume for map overlay

**Acceptance:** 90° intersection → confirmed_3d; 5° → bearing_only; third sensor improves weak to acceptable; moving target uses time alignment.

---

## Phase 7: Advanced Radar-EO Fusion

**Packages:** `fusion-core`, `registration`, `geometry`, `projections`, `validation`
**Ref:** `Radar_EO_cueing_and_fusion.md` + `Sensor_registration_and_timing.md`

**Key deliverables:**
- Fusion mode selector: registration unsafe → confirmation_only; cross-covariance unknown → conservative_track_fusion; raw measurements available + registration good → centralized_measurement_fusion
- Conservative fuser: covariance intersection (no cross-covariance assumption needed)
- Centralized fuser: standard information-matrix Kalman update
- Async handler: predict track to measurement time, update, re-predict forward
- Fusion mode/confidence projection for workstation

**Acceptance:** Mode switches cleanly; conservative reduces overconfidence vs naive fusion; async updates stable with 2s lag.

---

## Phase 8: Workstation and Demo Polish

**Packages:** `apps/workstation`, `projections`, `apps/api`
**Ref:** `Map_simulation_and_workstation.md`

**Responsive three-pane layout:**
- **PC (≥1024px):** Map (left, 60%) + Detail (right-top, 40%) + Timeline (bottom, full-width)
- **iPad (768–1023px):** Map (full) + collapsible side panel (Detail + Timeline tabs)
- **iPhone (<768px):** Full-screen map with bottom sheet navigation (swipe up for Detail/Timeline); touch-friendly controls

**Map pane** — MapLibre GL JS centered on central Israel
- Layers: system tracks (colored by status + uncertainty ellipses), local tracks (toggleable), sensor positions, radar coverage arcs, EO FOR/FOV footprints, EO line-of-sight rays, triangulation rays (color-coded by quality), ambiguity markers, degraded-mode indicators
- Touch support: pinch-zoom, pan, tap-to-select track (native MapLibre)

**Detail pane** — Track state, lineage, source contributions, EO results, identification, geometry quality, fusion mode

**Timeline pane** — Events, tasks, cue issuance, reports; task rationale on hover/tap; replay scrubber

**API (Fastify + WebSocket):**
- `ws/events` — real-time event stream
- REST: `/api/rap`, `/api/tracks/:id`, `/api/sensors`, `/api/tasks`, `/api/geometry/:id`
- Operator: `/api/operator/approve|reject|reserve`
- Scenario: `/api/scenario/start|pause|speed`

**Replay controls:** Play, pause, step, speed (1x/2x/5x/10x), time scrubber.

---

## Phase 9: Scenario Library and Validation Suite

**Packages:** `scenario-library`, `validation`, `apps/simulator`
**Ref:** All retrieval chunks

### Default Scenario: "Central Israel Defense Sector"

**Sensors:**

| ID | Type | Location | Coverage |
|----|------|----------|----------|
| RADAR-1 | 3D surveillance | Northern Negev | 200km, 360° |
| RADAR-2 | 3D medium-range | Coastal (central) | 120km, 360° |
| EO-1 | Gimballed EO/IR | Near RADAR-1 | FOR 360°; FOV 2×1.5° |
| EO-2 | Gimballed EO/IR | Near RADAR-2, ~35km baseline from EO-1 | FOR 360°; FOV 2×1.5° |
| EO-3 | Gimballed EO/IR | Northern, creates triangle | FOR 360°; FOV 2×1.5° |
| C4ISR-1 | External feed | — | System-level tracks |

**Targets (8 over 15 minutes):**
- TGT-1: Straight inbound from N → clean cue & confirm
- TGT-2: Inbound with turn → track continuity test
- TGT-3: Fast high-altitude → priority scoring test
- TGT-4a/4b: Formation, initially unresolved → multi-target split test
- TGT-5: Low, slow, along sensor baseline → bad triangulation geometry
- TGT-6: Crosses perpendicular to baseline → good triangulation (confirmed_3d)
- TGT-7: Enters EO-1 FOV simultaneously with TGT-2 → crowded FOV test

**Injected faults:** RADAR-2 azimuth bias at T+400s; EO-3 clock drift at T+500s; RADAR-1 outage T+600–630s

**Operator actions (auto_with_veto):** Reserve EO-2 for TGT-3 at T+200s; veto auto-assign at T+450s

### Additional Named Scenarios (8 total from roadmap):
1. Single target cue and confirm
2. Crossed tracks from two radars
3. Low altitude clutter
4. One cue, two EO objects
5. Good triangulation geometry
6. Bad triangulation geometry
7. Sensor bias and clock offset fault
8. Operator override against auto-tasking

### Validation Assertions:
- Track continuity (no spurious drops/ID switches)
- Registration safety (fusion degrades when bias injected)
- Task explanation quality (every auto-task has breakdown)
- Geometry honesty (weak ≠ confirmed_3d)
- Ambiguity handling (groups exposed, not hidden)
- Replay fidelity (replay ≡ live state)

### Simulator Engine:
- `apps/simulator/src/engine/scenario-runner.ts` — load, step(dt), speed multiplier
- `apps/simulator/src/sensors/radar/radar-model.ts` — synthetic observations with noise
- `apps/simulator/src/sensors/eo/eo-model.ts` — synthetic EO reports based on ground truth + noise + FOV visibility
- `apps/simulator/src/targets/target-generator.ts` — trajectories: straight, turning, altitude change, formation

---

## Agent Execution Strategy

### Dependency Graph
```
Phase 0 (Bootstrap)
  └→ Phase 1 (Fusion Core)
       ├→ Phase 2 (Registration)
       └→ Phase 3 (EO Cueing)
            ├→ Phase 4 (Tasking)
            └→ Phase 5 (Multi-target)
                 └→ Phase 6 (Triangulation)
                      └→ Phase 7 (Adv. Fusion)
                           └→ Phase 8 (Workstation)
                                └→ Phase 9 (Scenarios)
```

### Parallel Agent Schedule

| Slot | Agent A | Agent B | Agent C |
|------|---------|---------|---------|
| 1 | Phase 0 (bootstrap) | — | — |
| 2 | Phase 1 (fusion core) | — | — |
| 3 | Phase 2 (registration) | Phase 3 (EO cueing) | — |
| 4 | Phase 4 (tasking) | Phase 5 (multi-target) | Phase 8a (UI shell + map) |
| 5 | Phase 6 (triangulation) | Phase 7 (adv. fusion) | Phase 8b (overlays) |
| 6 | Phase 9 (scenarios + validation) | Phase 8c (polish + replay) | Integration review |

Phases 2 & 3 run in parallel (separate packages: `registration` vs `eo-investigation`). Phases 4 & 5 run in parallel (separate packages: `eo-tasking` vs `eo-investigation/ambiguity`). Phase 8 UI shell can start as soon as Phase 1 projections exist.

Each agent uses the corresponding prompt from `Claude_code_prompt_templates.md` with the shared prefix. Each produces a handoff note: implemented files, event/API changes, assumptions, known limits, tests, what the next phase can rely on.

---

## Commit Sequence (50 commits)

| # | Phase | Content |
|---|-------|---------|
| 1-6 | 0 | Repo skeleton, domain types, event envelope, shared-utils, workstation shell, API shell |
| 7-12 | 1 | Source ingest, correlation, track store, RAP projection, event store, integration tests |
| 13-16 | 2 | Registration state model, bias estimator, fusion gating, health projection |
| 17-20 | 3 | EO cue event + issuance, gimbal/FOV model, EO report handling, integration tests |
| 21-24 | 4 | Candidate generation + scoring, policy engine, operator controls, assignment tests |
| 25-28 | 5 | EO track + unresolved group, ambiguity + split/merge, identification, tests |
| 29-32 | 6 | Bearing math + time alignment, triangulator, quality scoring, geometry projection |
| 33-36 | 7 | Fusion mode selector, conservative fuser, centralized fuser, async handler tests |
| 37-42 | 8 | Three-pane layout + track layers, coverage/FOV overlays, triangulation/ambiguity overlays, detail+timeline panels, WebSocket streaming, degraded-mode indicators |
| 43-48 | 9 | Simulator engine + sensor models, target generator, default scenario, scenario library, validation assertions, regression runner |
| 49-50 | Final | Integration review + fixes, demo readiness |

---

## Verification

| Phase | Method | Key Assertion |
|-------|--------|---------------|
| 0 | `pnpm build && pnpm test` | All packages compile, blank map renders |
| 1 | Unit + integration (2 synthetic radars) | Tracks correlate, lineage complete, replay works |
| 2 | Bias injection test | Degradation visible, correction restores, unsafe blocks |
| 3 | Cue lifecycle test | Cue from track, EO report updates, validity enforced |
| 4 | Multi-target competition test | Highest score wins with explanation, override works |
| 5 | Split/merge scenario | Group created, resolved, lineage preserved |
| 6 | Good/bad geometry scenario | Quality scores correct, weak stays candidate |
| 7 | Fusion mode test | Mode switches, conservative stable, overconfidence controlled |
| 8 | Playwright E2E | Overlays render, detail panels populated, replay works |
| 9 | Full regression suite | All 8 scenarios pass, validation report generated |

---

## Critical Reference Files

- `Knowledge_Base_and_Agents_instructions/EO_C2_repo_scaffold_spec.md` — architectural blueprint
- `Knowledge_Base_and_Agents_instructions/EO_C2_build_roadmap.md` — phase sequence and acceptance criteria
- `Knowledge_Base_and_Agents_instructions/EO_C2_demo_build_knowledge_base.md` — research-grounded design decisions
- `Knowledge_Base_and_Agents_instructions/Claude_code_prompt_templates.md` — agent execution prompts
- `Knowledge_Base_and_Agents_instructions/Claude_agent_build_prompts.md` — detailed agent prompts with handoff protocol
