# ELOC2 Session Handover — EO C2 Air Defense Demonstrator

## What This Project Is

A web-based demonstrator showing how electro-optical (EO) sensors integrated in a network within an air defense surveillance system autonomously interrogate every radar plot. The system builds a Recognized Air Picture (RAP) from multiple radar/C4ISR sources, autonomously assigns EO sensors to investigate tracks based on coverage and geometry, handles multi-target FOV situations, produces 3D plots via triangulation, and presents the entire process on an interactive map with replay.

**Demo scenario region:** Central Israel. **EO results:** Simulated (not real ML).

---

## Current State (as of commit 6c2e17a)

### Completed Phases

| Phase | Description | Package(s) | Tests |
|-------|-------------|------------|-------|
| **0** | Bootstrap: monorepo scaffold, all 12 packages + 3 apps | All | Build passes |
| **1** | Fusion core: correlation (Mahalanobis), fusion (info-matrix), track management (state machine), event store, RAP | `fusion-core`, `domain`, `events` | 29 |
| **2** | Registration: bias estimation, clock health, fusion gating | `registration` | 23 |
| **3** | EO cueing: cue issuance with state prediction, gimbal model, FOV model, EO report handling | `eo-investigation` | 50 |
| **4** | Tasking: multi-criteria scoring, policy engine (3 modes), operator controls, sensor assignment | `eo-tasking` | 22 |
| **5** | Multi-target resolution (partial): ambiguity handler, split/merge logic, identifier | `eo-investigation` | (included in 50) |

**Total: 72 source files, 20 test files, 146 tests — all passing.**

### Remaining Phases

| Phase | Description | Status | Key Work |
|-------|-------------|--------|----------|
| **5** | EO multi-target — **mostly done** | ~90% | May need integration tests with Phase 4 tasking |
| **6** | Triangulation and 3D geometry | **Not started** | `packages/geometry/`: bearing math, time alignment, triangulator, quality scorer. Stubs exist. |
| **7** | Advanced radar-EO fusion | **Not started** | `packages/fusion-core/`: fusion mode selector, conservative fuser (covariance intersection), centralized fuser, async handler |
| **8** | Workstation UI | **Not started** | `apps/workstation/`: React + MapLibre GL JS three-pane layout, all map overlays, detail panel, timeline, replay, WebSocket streaming. Shell exists (blank map). `apps/api/`: Fastify REST + WebSocket routes. |
| **9** | Scenario library + validation | **Not started** | `apps/simulator/`: scenario runner, synthetic radar/EO models, target generator. `packages/scenario-library/`: default Central Israel scenario + 8 named scenarios. `packages/validation/`: regression assertions. |

---

## Tech Stack

- **Language:** TypeScript 5.9 (strict), ESM
- **Monorepo:** pnpm 9.15 + Turborepo 2.8
- **Frontend:** React 19 + Vite 6 + MapLibre GL JS (workstation app)
- **Backend:** Fastify (api app)
- **Testing:** Vitest 3.2
- **Package bundler:** tsup (esbuild)
- **Map tiles:** OpenStreetMap via MapLibre GL JS

---

## Repository Structure

```
ELOC2/
├── apps/
│   ├── workstation/     React + MapLibre (shell only, needs Phase 8)
│   ├── simulator/       Scenario engine (stubs, needs Phase 9)
│   └── api/             Fastify server (shell, needs Phase 8)
├── packages/
│   ├── domain/          ✅ All entity types: SystemTrack, SourceObservation, EoTrack, etc.
│   ├── events/          ✅ All event types: 14 canonical events with envelope
│   ├── schemas/         ✅ Runtime validators
│   ├── shared-utils/    ✅ geo-math (WGS84), matrix (3x3), SimulationClock, UUID
│   ├── fusion-core/     ✅ Correlator, fuser, TrackManager, EventStore, RAP builder
│   ├── registration/    ✅ BiasEstimator, ClockHealth, HealthService
│   ├── eo-investigation/✅ CueIssuer, GimbalController, FOV, ReportHandler, Ambiguity, Split/Merge
│   ├── eo-tasking/      ✅ Scorer, Generator, PolicyEngine, Assigner, OperatorControls
│   ├── geometry/        ⬜ Stubs only (needs Phase 6)
│   ├── projections/     ✅ Partial: EoCueView, AmbiguityView, SensorHealthView
│   ├── scenario-library/⬜ Stub (needs Phase 9)
│   └── validation/      ⬜ Stub (needs Phase 9)
├── Knowledge_Base_and_Agents_instructions/  15 reference docs
├── docs/plans/implementation-plan.md        Full plan
└── HANDOVER.md                              This file
```

---

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all 15 packages (turbo cached)
pnpm test             # Run all tests (146 passing)
pnpm dev              # Start workstation (port 3000) + api (port 3001) — NOT FULLY WIRED YET
```

---

## Implementation Plan Location

The full detailed plan with per-phase file lists, algorithms, acceptance criteria, agent parallelization strategy, default scenario spec, and 50-commit sequence is at:

- **`docs/plans/implementation-plan.md`** (in-repo copy)
- **`.claude/plans/cosmic-swinging-codd.md`** (Claude Code plan file)

---

## Agent Execution Strategy for Remaining Phases

Per the plan's dependency graph and parallelization schedule:

### Slot 5 (next): Run in parallel
- **Agent A:** Phase 6 (Triangulation) — `packages/geometry/`
- **Agent B:** Phase 7 (Advanced Fusion) — `packages/fusion-core/` additions
- **Agent C:** Phase 8a (UI shell + basic map overlays) — `apps/workstation/`

### Slot 6 (after slot 5):
- **Agent A:** Phase 9 (Scenarios + Validation) — `apps/simulator/`, `packages/scenario-library/`, `packages/validation/`
- **Agent B:** Phase 8b (polish + replay) — `apps/workstation/`, `apps/api/`
- **Agent C:** Integration review across all packages

### Agent Prompt Templates
Pre-written prompts for each phase are in:
- `Knowledge_Base_and_Agents_instructions/Claude_code_prompt_templates.md` — copy-paste prompts with shared prefix
- `Knowledge_Base_and_Agents_instructions/Claude_agent_build_prompts.md` — detailed prompts with scope, constraints, done criteria

### Key Reference Documents Per Phase
| Phase | Primary Reference |
|-------|------------------|
| 6 | `EO_triangulation_geometry.md` |
| 7 | `Radar_EO_cueing_and_fusion.md` + `Sensor_registration_and_timing.md` |
| 8 | `Map_simulation_and_workstation.md` |
| 9 | `EO_C2_build_roadmap.md` + all chunks |

---

## Important Design Decisions Already Made

1. **Event-sourced architecture:** All state changes go through events in the EventStore. Replay reconstructs state from events.
2. **Track state machine:** tentative → confirmed (after 3 updates) → dropped (after 5 misses). All transitions emit events with lineage.
3. **Correlation:** Mahalanobis distance in ENU frame with chi-squared gate (default 9.21, 2-DoF 99%).
4. **Fusion:** Information-matrix weighted fusion. Falls back to simple averaging if covariance is singular.
5. **Registration gating:** When `fusionSafe === false`, fuser falls back to confirmation-only mode.
6. **EO cueing:** Cues carry predicted state, covariance, uncertainty gate, priority, validity window.
7. **Tasking scoring:** `total = w1*threat + w2*uncertainty + w3*geometry + w4*operator - w5*slew - w6*occupancy`
8. **Policy modes:** recommended_only, auto_with_veto, manual.
9. **Multi-target:** Delayed association via UnresolvedGroup entities, not forced 1:1 mapping.
10. **3D geometry honesty:** Never present weak geometry as confirmed 3D. Three output classes: bearing_only, candidate_3d, confirmed_3d.
11. **Responsive UI:** PC (3-pane), iPad (2-pane), iPhone (single pane + bottom sheet).
12. **Default scenario:** Central Israel defense sector, 6 sensors (2 radar + 3 EO + 1 C4ISR), 8 targets over 15 minutes, injected faults, operator interactions.

---

## Known Issues / Watch Points

1. **No git remote yet.** Repo is local only. User needs to `git remote add origin <url>` and push.
2. **Phase 5 integration:** The ambiguity/split-merge logic is implemented but not yet wired end-to-end with Phase 4 tasking. Need integration tests.
3. **Workstation is shell only:** Just a blank MapLibre map. All overlays, panels, and WebSocket wiring are Phase 8.
4. **API is shell only:** Basic Fastify server, no routes implemented yet. Phase 8 adds all REST + WS endpoints.
5. **Simulator has no logic yet:** Just stubs. Phase 9 builds the full scenario engine.
6. **CRLF warnings on Windows:** Git shows LF→CRLF warnings. Consider adding `.gitattributes` with `* text=auto`.

---

## How to Resume

```
claude --resume
```

Or start a new session and say:
> "Continue building ELOC2. Read HANDOVER.md and docs/plans/implementation-plan.md for context. Phases 0-4 are complete (plus partial Phase 5). Next: implement Phases 6, 7, 8 in parallel, then Phase 9."
