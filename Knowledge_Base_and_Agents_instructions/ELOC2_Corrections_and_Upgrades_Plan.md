# ELOC2 — Corrections and Upgrades Plan

**Version:** 1.0
**Date:** 2026-03-18
**Branch:** `claude/eloc2-handover-deployment-XSyf8`
**Status:** PENDING APPROVAL

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System State](#2-current-system-state)
3. [Requirements Breakdown (Items 1–16)](#3-requirements-breakdown)
4. [LOROP_MPS Comparison Report (Item 3)](#4-lorop_mps-comparison-report)
5. [Implementation Phases (7 Phases)](#5-implementation-phases)
6. [Agent Work Breakdown](#6-agent-work-breakdown)
7. [Testing Strategy](#7-testing-strategy)
8. [Risk Register](#8-risk-register)

---

## 1. Executive Summary

This plan addresses 16 requirements ranging from UI corrections to new algorithmic modules for autonomous EO management, ground truth visualization, target classification, sensor deployment planning, and quality metrics. The work is organized into **7 phases**, each ending with a joint verification checkpoint. Agents are designed to work in parallel where dependencies allow, and each agent produces independently testable output.

---

## 2. Current System State

### 2.1 What Exists

| Capability | Status | Location |
|-----------|--------|----------|
| EO Tasking Scorer | Basic: threat + uncertainty + geometry + operator intent + slew + occupancy | `packages/eo-tasking/src/scoring/scorer.ts` |
| EO Task Assignment | One-shot per cycle (every 5 sim-sec), greedy best-score | `packages/eo-tasking/src/assignment/assigner.ts` |
| EO Investigation | Cue issuance, ambiguity, split/merge, identification | `packages/eo-investigation/` |
| Triangulation | Multi-bearing, quality scoring, geometry estimates | `packages/geometry/` |
| Fusion Modes | basic / conservative / centralized, auto-selected by registration health | `packages/fusion-core/` |
| Scenario Definition | Targets with waypoints, sensors with coverage/FOV, faults, operator actions | `apps/simulator/src/types/scenario.ts` |
| Target Model | targetId, name, description, waypoints (lat/lon/alt), startTime — **no classification** | `TargetDefinition` |
| SystemTrack | position, velocity, covariance, confidence, status, sources, eoInvestigationStatus — **no classification** | `packages/domain/src/system-track.ts` |
| Ground Truth | Exists only inside `ScenarioRunner` (target waypoint interpolation) — **never sent to frontend** | `apps/simulator/src/targets/target-generator.ts` |
| Build Info | `rev:{SHORT_SHA}` shown in header + `v0.3.0` label — **no build timestamp, no commit date** | `apps/workstation/src/App.tsx:319` |
| Panel Layout | CSS Grid, fixed 380px right panel, 150px/32px timeline — **not resizable by dragging** | `apps/workstation/src/App.tsx` |
| Land Cover | **Not implemented** — flat earth detection model | — |
| Report Generation | **Not implemented** | — |
| Scenario Dependency Management | **Not implemented** — start/reset/timeline can conflict | — |
| Sensor Deployment Planning | **Not implemented** | — |

### 2.2 EO Tasking Algorithm (Detailed)

The current EO tasking runs every 5 simulation seconds in `LiveEngine.tick()`:

1. `generateCandidates()` — pairs each EO sensor with each system track that falls within coverage
2. `scoreCandidate()` — multi-criteria scoring:
   - **Threat**: confidence × (1 + altPenalty + speedBonus + closureRateBonus)
   - **Uncertainty reduction**: sqrt(covariance trace) / 100
   - **Geometry gain**: 5.0 × intersectionPotential × revisitFactor
   - **Operator intent**: 3.0 if operator-marked, else 0
   - **Slew cost**: angular distance to target / 18
   - **Occupancy cost**: 2.0 × current tasks on sensor
   - **Total**: weighted sum (threat×1.0 + uncertainty×1.0 + geometry×0.5 + intent×2.0 − slew×0.3 − occupancy×0.5)
3. `applyPolicy()` — filters by policy mode (auto_with_veto / recommended_only / manual)
4. `assignTasks()` — greedy: sort by score descending, assign one task per sensor

**What's missing for autonomous management:**
- No target cycling/revisit scheduling
- No dwell time optimization
- No "search mode" when no targets exist
- No wide/narrow zoom search boundaries
- No concept of "sensor exhausted" or "excess sensors"
- No dynamic priority adjustment based on triangulation convergence
- No FOV overlap detection for multi-target resolution

---

## 3. Requirements Breakdown

### REQ-1: Ground Truth Toggle

**Description:** Toggle button switching between "World Picture" (ground truth) and "System Picture" (detections/fusion).

**World Picture mode displays:**
- All sensors with their true data (coverage arcs, bearing rays, FOV)
- All targets at their TRUE positions (from scenario waypoints)
- Target true velocity vectors, altitudes, classifications
- NO uncertainty ellipses, NO fused track positions, NO detection noise

**System Picture mode displays (current behavior):**
- Fused system tracks with covariance ellipses
- Sensor detections with noise
- Triangulation results, fusion outputs

**Implementation:**
- Backend: New `groundTruth.update` WS message type with true target positions interpolated from scenario waypoints each tick
- Frontend: New `ground-truth-store.ts` Zustand store
- Frontend: Toggle button in header, `DebugOverlay` switches rendering mode
- Ground truth markers: distinct style (e.g., diamond shape, white/cyan color, dashed trails)

### REQ-2: Build Version Info

**Description:** Display build-identifying information in System Overview.

**Data to add:**
- Git commit SHA (already exists as `rev:{SHORT_SHA}`)
- Build timestamp (date+time when Docker image was built)
- Branch name at build time
- Build number (Cloud Build execution ID if available)
- Display in: header tooltip + DefaultPanel "System Info" section

**Implementation:**
- Vite define: `__BUILD_TIMESTAMP__`, `__BUILD_BRANCH__`
- Dockerfile: pass `BUILD_TIMESTAMP` and `BUILD_BRANCH` as build args
- `cloudbuild.yaml`: add substitutions
- DefaultPanel: new "Build" section showing all fields

### REQ-3: LOROP_MPS Map Comparison

**Description:** Analyze and document differences between ELOC2 and LOROP_MPS map/layer implementations. **Research only — no implementation without approval.**

**See Section 4 below for the full comparison report.**

### REQ-4: Resizable Panel Layout

**Description:** Drag borders between right panel, bottom panel (timeline), and map to resize.

**Implementation:**
- Replace fixed CSS Grid dimensions with state-driven sizes
- Add `<ResizeHandle>` component for each border (right panel left-edge, timeline top-edge)
- Mouse/touch drag handlers update panel width/height in `ui-store`
- Persist sizes in localStorage
- Min/max constraints: right panel 250px–600px, timeline 80px–400px
- Double-click to reset to default

### REQ-5: Autonomous EO Management

**Description:** Full autonomous EO sensor management with operator override.

**Current state:** Basic scoring + one-shot assignment (see Section 2.2).

**New capabilities (incremental phases):**

**Phase A — Target Cycling & Dwell (Phase 3 of overall plan):**
- Dwell timer per task: sensor stays on target for configurable dwell period
- Revisit scheduler: tracks last observation time per track, increases priority over time
- Target cycling: when dwell complete, move to next-best target
- Operator override: API endpoint to lock sensor on specific target/location

**Phase B — Search Mode (Phase 5):**
- When no targets exist or all sensors exhausted: activate search mode
- Define wide-scan and narrow-scan search patterns (sector scan, raster scan)
- Search boundaries configurable per scenario
- Transition: search → track when detection occurs

**Phase C — Optimization Loop (Phase 5):**
- When triangulation solution exists: display optimized target data window
  - True data comparison (range, angles)
  - Noise reduction metrics
  - Ellipse shrinkage visualization
- When sensor points at target: show "investigation window" with target truth data
- Dynamic reallocation when convergence achieved on one target

**Scoring enhancements:**
- Add predicted detection range factor (sensor model + target altitude + range)
- Add geometry factor from `@eloc2/geometry` triangulation quality
- Add ASR threat level integration
- Add convergence factor (triangulation quality improvement rate)

### REQ-6: Multi-Target FOV Resolution

**Description:** When multiple targets are within overlapping FOVs of multiple EO sensors, resolve 3D positions and associate targets correctly.

**Implementation:**
- FOV overlap detector: compute intersection of sensor FOV polygons
- Multi-target bearing association: when N sensors see M targets in overlapping FOV, use combinatorial bearing matching
- 3D resolution: triangulate each target independently using bearing subsets
- Association confidence: score based on bearing consistency and target separation
- Edge cases: fast targets may not associate when FOV doesn't overlap — flag as "low-confidence association"
- When sensors > 2: use information-matrix fusion for optimal 3D estimate
- Display: show association links on map, confidence indicators

### REQ-7: Target Classifications

**Description:** Add target type taxonomy to scenario and system track.

**Classification types:**
```
civilian_aircraft | passenger_aircraft | light_aircraft | fighter_aircraft |
ally | predator | neutral | unknown | bird | birds | helicopter |
uav | small_uav | drone
```

**Implementation:**
- `TargetDefinition.classification: TargetClassification` — set in scenario
- `SystemTrack.classification?: TargetClassification` — starts as `unknown`, updated by operator or EO identification
- `SystemTrack.classificationSource?: 'operator' | 'eo_identification' | 'c4isr' | 'scenario'`
- `SystemTrack.classificationConfidence?: number` (0–1)
- API endpoint: `POST /api/operator/classify` to manually set classification
- EO identification: `assessIdentification()` can now set classification based on simulated image analysis
- Ground truth includes true classification; system track starts unknown
- Map display: classification icon/label next to track marker

### REQ-8: Algorithm Quality Testing (Ground Truth vs System)

**Description:** Compare world picture (ground truth/SBA) with system picture after EO processing.

**Metrics:**
- Track-to-truth association accuracy (how many system tracks match real targets)
- Position error: distance between fused track position and true target position
- Classification accuracy: correct vs incorrect classifications
- Coverage: what percentage of true targets have associated system tracks
- False track rate: system tracks with no corresponding real target
- Time to first detection per target
- Time to confirmed 3D solution per target

**Implementation:**
- Backend: `QualityAssessor` module that runs alongside simulation
- Compares `LiveState.tracks` against `ScenarioRunner` ground truth each tick
- Accumulates metrics over time
- API endpoint: `GET /api/quality/metrics`
- Frontend: "Quality Metrics" panel showing real-time accuracy

### REQ-9: Before/After EO Comparison

**Description:** Compare quality of the aerial picture before and after EO intervention.

**Implementation:**
- Snapshot mechanism: capture track state at each "EO investigation start" event
- Compare: pre-EO covariance, position error, classification vs post-EO
- Per-track: show uncertainty reduction, position refinement, classification gain
- Aggregate: total picture quality score before vs after EO
- Display: side-by-side or overlay comparison in a panel

### REQ-10: EO Allocation Quality Criteria

**Description:** Criteria to evaluate how well EO resources were allocated.

**Criteria:**
- **Coverage efficiency**: % of high-priority targets that received EO investigation
- **Geometry optimality**: average intersection angle of triangulation pairs (closer to 90° = better)
- **Dwell efficiency**: ratio of useful dwell time vs total sensor time
- **Revisit timeliness**: average time between revisits vs required revisit interval
- **Triangulation success rate**: % of investigated targets achieving confirmed 3D
- **Sensor utilization**: % time each sensor is actively tasked vs idle
- **Priority alignment**: correlation between target threat score and investigation order

**Implementation:**
- Computed by `QualityAssessor` module (same as REQ-8)
- Exposed via API and displayed in quality panel

### REQ-11: Land Cover Integration

**Description:** Integrate terrain/cover effects on detection probability.

**Phase 1 (Simple mask zones — this plan):**
- Define cover zones in scenario: `CoverZone { polygon: Position3D[], coverType: 'urban' | 'forest' | 'water' | 'open', detectionProbabilityModifier: number }`
- Apply modifier to detection probability in sensor models (radar + EO)
- Display cover zones on map (semi-transparent colored polygons)

**Phase 2 (Future — LOS + clutter model):**
- Terrain elevation data (DEM tiles)
- Line-of-sight computation between sensor and target
- Clutter model affecting false alarm rate
- Design interfaces now for Phase 2 extensibility

### REQ-12: Scenario Report Generation

**Description:** Export PDF/MD report at scenario end.

**Report contents:**
- Scenario definition (targets, sensors, duration, faults)
- Ground truth summary (target paths, classifications)
- System performance timeline (tracks detected, confirmed, dropped)
- EO investigation summary (tasks issued, triangulation results)
- Quality metrics (from REQ-8, 9, 10)
- Map snapshots (captured from frontend, sent to backend)
- Before/after EO comparison
- Conclusions and key statistics

**Implementation:**
- Backend: `ReportGenerator` service using PDFKit for PDF, string templating for MD
- API: `POST /api/report/generate` with options (format, include sections)
- API: `POST /api/report/snapshot` — frontend sends base64 map screenshots
- API: `GET /api/report/download/:id`
- Frontend: "Generate Report" button in scenario controls, capture map screenshots via html2canvas

### REQ-13: Scenario/Timeline Dependency Management

**Description:** Prevent conflicts between running scenarios, live injections, and timeline scrubbing.

**Current conflicts:**
- Starting a new scenario while one is running (data corruption)
- Timeline seeking while scenario is running (state inconsistency)
- Live injection while scenario is paused (injection lost)
- Reset during active injection (orphaned state)

**Implementation:**
- `SimulationStateMachine` with states: `idle | running | paused | seeking | resetting`
- State transition rules: e.g., cannot `seek` while `running`, cannot `inject` while `idle`
- API endpoints return 409 Conflict with reason when operation is not allowed
- Frontend: disable buttons that aren't valid in current state
- LiveEngine: lock mechanism preventing concurrent mutations

### REQ-14: Implementation Stages

See Section 5 (7 phases with verification checkpoints).

### REQ-15: Sensor Deployment Planning Module

**Description:** Interactive + algorithmic optimal EO sensor placement.

**Capabilities:**
1. **Interactive placement**: operator places sensors on map, gets real-time scoring feedback
2. **Constraint zones**: define areas where sensors can/cannot be installed
3. **Grid optimization**: divide area into cells, score each by coverage + geometry + threat exposure
4. **Automated suggestion**: system recommends optimal positions given constraints
5. **Export to scenario**: planned deployment feeds into activated scenario

**Implementation:**
- New view: "Deployment Planner" (alongside workstation and editor)
- `DeploymentPlanner` React component with:
  - Interactive map (click to place sensors)
  - Constraint zone drawing (inclusion/exclusion polygons)
  - Coverage visualization (heatmap showing detection probability)
  - Geometry quality map (triangulation potential between sensor pairs)
  - Threat overlay (where high-priority targets are expected)
- Backend: `DeploymentOptimizer` module
  - Grid-based scoring: coverage × geometry × threat for each cell
  - Greedy placement: iteratively place sensor at highest-scoring position
  - Constraint satisfaction: exclude forbidden zones, include only allowed zones
  - Mathematical optimization: LP/convex relaxation for sensor count minimization
- API: `POST /api/deployment/optimize` with constraints → returns ranked positions
- API: `POST /api/deployment/export-scenario` → generates ScenarioDefinition

### REQ-16: Modular EO Management Architecture

**Description:** Design EO management as a separate, add-on module to C4ISR.

**Architecture:**
```
┌─────────────────────────────────────────────────────┐
│                    C4ISR System                      │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Radar Fusion │  │ Track Mgr│  │ ASR Database  │  │
│  └──────┬──────┘  └────┬─────┘  └───────┬───────┘  │
│         │              │                │           │
│    ─────┴──────────────┴────────────────┴────       │
│         │      System Track Bus (events)            │
│    ─────┬───────────────────────────────────        │
│         │                                           │
│  ┌──────┴──────────────────────────────────────┐    │
│  │    EO Management Module (ELOC2 Add-on)      │    │
│  │                                              │    │
│  │  ┌────────────────────────────────────────┐  │    │
│  │  │  Target Classification Engine          │  │    │
│  │  │  ├─ Sub-pixel detector (bearing-only)  │  │    │
│  │  │  │   Point targets, no resolved image  │  │    │
│  │  │  │   Outputs: bearing, SNR, temporal   │  │    │
│  │  │  │   Uses: triangulation, kinematics   │  │    │
│  │  │  │                                     │  │    │
│  │  │  └─ Image target processor             │  │    │
│  │  │      Resolved targets (>1 pixel)       │  │    │
│  │  │      Outputs: shape, size, features    │  │    │
│  │  │      Uses: classification, ID          │  │    │
│  │  └────────────────────────────────────────┘  │    │
│  │                                              │    │
│  │  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │ EO Tasking   │  │ Triangulation Engine │  │    │
│  │  │ Scheduler    │  │ (multi-bearing)      │  │    │
│  │  └──────────────┘  └──────────────────────┘  │    │
│  │                                              │    │
│  │  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │ Search Mode  │  │ Quality Assessor     │  │    │
│  │  │ Controller   │  │ (metrics + reports)  │  │    │
│  │  └──────────────┘  └──────────────────────┘  │    │
│  │                                              │    │
│  │  Interface: receives SystemTracks, emits     │    │
│  │  EO-enriched tracks + quality reports        │    │
│  └──────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Sub-pixel vs Image target distinction:**

| Aspect | Sub-pixel Detection | Image Target |
|--------|-------------------|--------------|
| Definition | Target subtends <1 pixel at sensor range | Target subtends ≥1 pixel, shape features resolvable |
| EO output | Bearing angle + SNR + temporal signature | Bearing + shape + size + features + possible classification |
| Processing | Triangulation from bearings, kinematic filtering | Image analysis, feature extraction, template matching |
| Classification | Inferred from kinematics (speed, altitude, maneuver) | Direct from image features (wing shape, size, engine count) |
| Resolution trigger | Always (default mode) | When range decreases OR zoom changes to resolve pixels |
| Domain type | `EoDetection { type: 'sub_pixel', bearing, snr, temporalSignature }` | `EoDetection { type: 'image', bearing, shape, size, features, classificationHint }` |

**Module interface (package boundary):**
```typescript
// @eloc2/eo-management — new package
interface EoManagementModule {
  // Input: system tracks from C4ISR
  ingestTracks(tracks: SystemTrack[]): void;
  // Input: operator commands
  operatorOverride(command: OperatorCommand): void;
  // Output: enriched tracks with EO data
  getEnrichedTracks(): EnrichedTrack[];
  // Output: quality assessment
  getQualityMetrics(): QualityMetrics;
  // Output: EO status for display
  getEoStatus(): EoModuleStatus;
}
```

---

## 4. LOROP_MPS Comparison Report (Item 3)

### 4.1 Overview

| Aspect | LOROP_MPS | ELOC2 |
|--------|-----------|-------|
| **Map Library** | MapLibre GL JS via react-map-gl | MapLibre GL JS (tiles only) |
| **Data Rendering** | Native MapLibre WebGL layers (Source + Layer components) | HTML/SVG overlay (DebugOverlay) |
| **Layer Architecture** | 8+ independent React components (FlightPathLayer, CoverageLayer, etc.) | Single unified DebugOverlay |
| **Visibility Toggle** | Context API + `LayerVisibility` struct with 10+ boolean flags | Zustand `ui-store` + conditional render |
| **Data Source** | Synchronous in-browser computation (no backend) | Async WebSocket from live simulation engine |
| **State Management** | Single monolithic Zustand store (~1000 LOC) | Multi-store Zustand (track, sensor, geometry, UI, simulation) |
| **Interactivity** | Full: drag waypoints, draw polygons, ruler, context menu | Minimal: select track, toggle visibility, action buttons |
| **Feature Decimation** | Zoom-aware adaptive: outline→frames→sparse-labels→full + feature count caps | None (assumes <100 tracks) |
| **GeoJSON** | Primary data format for all geometry | Not used (manual coordinate projection) |
| **Performance** | `useMemo` caching, decimation at 20K features, zoom-threshold detail levels | RAF batching, WS throttling, small dataset assumption |

### 4.2 Key Architectural Differences

**1. Rendering Pipeline**

LOROP_MPS: `Store → useMemo(GeoJSON) → <Source><Layer/></Source> → MapLibre WebGL`

ELOC2: `WebSocket → Store → DebugOverlay → map.project(lngLat) → HTML div / SVG path`

LOROP_MPS fully trusts MapLibre's WebGL pipeline. ELOC2 abandoned it due to WebGL failures in Cloud Run production and uses manual HTML/SVG positioning.

**2. Layer Modularity**

LOROP_MPS has each layer as an independent React component returning MapLibre `<Source>` and `<Layer>` JSX. This makes each layer:
- Independently testable
- Independently togglable via visibility context
- Self-contained with its own GeoJSON construction logic

ELOC2's DebugOverlay is a single ~800 LOC component that renders everything. This is:
- Harder to test individual layers
- Harder to toggle individual layer types
- More tightly coupled

**3. Data Flow Direction**

LOROP_MPS is entirely client-side: user input → store action → derived computation → re-render. No server.

ELOC2 is server-driven: simulation engine → WebSocket broadcast → store update → re-render. The simulation is authoritative.

**4. Interactivity Model**

LOROP_MPS supports direct manipulation: drag waypoints on map, draw target areas, context menus. MapLibre's `<Marker>` component handles draggable elements natively.

ELOC2 is display-oriented: the map shows simulation state, user interaction is limited to selection and panel-based actions.

### 4.3 Recommendations (No Implementation Without Approval)

Based on the comparison, potential improvements to ELOC2's map architecture:

1. **Decompose DebugOverlay**: Break into independent layer components (TrackLayer, SensorLayer, GeometryLayer, CoverageLayer) — each still using HTML/SVG but encapsulated
2. **Add LayerVisibility context**: Structured visibility management similar to LOROP_MPS's `LayerVisibility` interface
3. **Add GeoJSON intermediate format**: Even with HTML/SVG rendering, structuring data as GeoJSON would standardize the data pipeline
4. **Adopt zoom-aware detail levels**: Important when track counts grow; show labels only at high zoom
5. **Add interactive map features**: Sensor placement, constraint zone drawing (needed for REQ-15)

**These are recommendations only. No changes will be made without explicit guidance.**

---

## 5. Implementation Phases

### Phase 1: Foundation — Build Info, Ground Truth, Classifications (Week 1)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Build version info | REQ-2 | Agent A | None | Yes — check header displays correct info |
| Ground truth WS channel | REQ-1 backend | Agent B | None | Yes — WS message contains correct positions |
| Target classification types | REQ-7 domain | Agent C | None | Yes — type definitions compile, tests pass |
| Scenario dependency state machine | REQ-13 | Agent D | None | Yes — state transitions unit-tested |

**Acceptance criteria:**
- Build timestamp, branch, SHA visible in header and Overview panel
- `groundTruth.update` WS messages sent with correct target positions
- `TargetClassification` type available in `@eloc2/domain`
- `ScenarioDefinition` accepts classification per target
- State machine prevents invalid scenario operations

---

### Phase 2: UI — Ground Truth Toggle, Resizable Panels, Layer Refactor (Week 2)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Ground truth frontend toggle | REQ-1 frontend | Agent E | Phase 1 (Agent B) | Yes — toggle switches rendering mode |
| Resizable panels | REQ-4 | Agent F | None | Yes — drag borders resize panels |
| DebugOverlay decomposition | REQ-3 prep | Agent G | None | Yes — same rendering, modular code |
| Dependency management frontend | REQ-13 frontend | Agent H | Phase 1 (Agent D) | Yes — buttons disabled in invalid states |

**Acceptance criteria:**
- Toggle button switches between ground truth view and system view
- Ground truth shows true target positions without noise/fusion artifacts
- Panel borders draggable with min/max constraints, sizes persist in localStorage
- DebugOverlay split into independent layer components
- Scenario controls properly gated by state machine

---

### Phase 3: EO Management Phase A — Cycling, Dwell, Override (Week 3)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Dwell timer + revisit scheduler | REQ-5 Phase A | Agent I | None | Yes — unit tests for timing logic |
| Target cycling logic | REQ-5 Phase A | Agent J | Agent I | Yes — cycling sequence testable |
| Operator override API | REQ-5 Phase A | Agent K | None | Yes — API endpoint tests |
| Investigation window UI | REQ-5 Phase A | Agent L | Phase 1 (REQ-1) | Yes — panel shows target data |
| Classification in tracks + EO ID | REQ-7 system | Agent M | Phase 1 (Agent C) | Yes — classification propagates |

**Acceptance criteria:**
- EO sensors dwell on target for configurable period then move to next
- Sensors cycle through targets by priority
- Operator can lock sensor on specific target via API
- Investigation window shows true target data when sensor points at target
- Classification flows from scenario → system track via operator or EO ID

---

### Phase 4: Quality Assessment + Land Cover (Week 4)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| QualityAssessor module | REQ-8 | Agent N | Phase 1 (ground truth) | Yes — metrics computed correctly |
| Before/after EO comparison | REQ-9 | Agent O | Agent N | Yes — snapshots + comparison logic |
| EO allocation quality criteria | REQ-10 | Agent P | Agent N | Yes — criteria formulas unit-tested |
| Land cover zones (simple mask) | REQ-11 | Agent Q | None | Yes — detection probability modified |
| Land cover display on map | REQ-11 UI | Agent R | Phase 2 (layer refactor) | Yes — polygons render on map |

**Acceptance criteria:**
- Quality metrics panel shows: position error, classification accuracy, coverage %, false track rate
- Before/after comparison shows uncertainty reduction per track
- EO allocation criteria: geometry optimality, dwell efficiency, revisit timeliness scored
- Cover zones in scenario reduce detection probability
- Cover zones visible on map as colored polygons

---

### Phase 5: EO Management Phase B + Multi-Target Resolution (Week 5)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Search mode controller | REQ-5 Phase B | Agent S | Phase 3 | Yes — scan patterns testable |
| Optimization loop + convergence | REQ-5 Phase C | Agent T | Phase 3 + 4 | Yes — convergence triggers realloc |
| FOV overlap detector | REQ-6 | Agent U | None | Yes — geometry unit tests |
| Multi-target bearing association | REQ-6 | Agent V | Agent U | Yes — association accuracy tests |
| Multi-sensor 3D resolution | REQ-6 | Agent W | Agent V | Yes — 3D positions match truth |

**Acceptance criteria:**
- Search mode activates when no targets; scans in defined pattern
- Sensors reallocate when triangulation converges
- Optimized target data displayed when triangulation succeeds
- FOV overlaps detected; targets resolved correctly when >2 sensors
- Association quality degrades gracefully for fast targets without FOV overlap

---

### Phase 6: Reporting, Deployment Planner, Modular Architecture (Week 6)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Report generator (PDF + MD) | REQ-12 | Agent X | Phase 4 (metrics) | Yes — generates valid PDF/MD |
| Map screenshot capture | REQ-12 UI | Agent Y | None | Yes — base64 screenshots captured |
| Deployment planner (interactive) | REQ-15 | Agent Z | Phase 2 (resizable panels) | Yes — place sensors, see scoring |
| Deployment optimizer (algorithm) | REQ-15 | Agent AA | Agent Z | Yes — optimization returns valid positions |
| EO module refactor | REQ-16 | Agent AB | Phase 5 | Yes — clean interface boundary |

**Acceptance criteria:**
- PDF/MD report generated with scenario summary, metrics, snapshots
- Report downloadable via API
- Deployment planner: interactive sensor placement with live scoring
- Optimizer suggests positions respecting constraint zones
- EO management has clean package boundary (`@eloc2/eo-management`)
- Sub-pixel vs image target distinction in detection pipeline

---

### Phase 7: Integration, Polish, End-to-End Verification (Week 7)
**Verification checkpoint at end**

| Item | REQ | Agent | Dependencies | Testable Independently |
|------|-----|-------|-------------|----------------------|
| Integration testing (all features) | All | Agent AC | All phases | Yes — E2E scenarios |
| Deployment planner → scenario export | REQ-15 | Agent AD | Phase 6 | Yes — exported scenario runs correctly |
| Full scenario report E2E | REQ-12 | Agent AE | Phase 6 | Yes — complete report from scenario |
| Performance testing | All | Agent AF | All phases | Yes — no degradation with all features |
| Documentation update | All | Agent AG | All phases | Yes — CLAUDE.md + knowledge base updated |

**Acceptance criteria:**
- Complete scenario: plan deployment → run scenario → ground truth toggle → EO cycling → report generation
- All 16 requirements verified
- No performance regression
- All tests passing (current 146+ tests + new tests)
- Knowledge base and CLAUDE.md updated

---

## 6. Agent Work Breakdown

### Parallel Execution Map

```
Phase 1 (all 4 agents parallel):
  Agent A (REQ-2) ──┐
  Agent B (REQ-1) ──┤── all independent
  Agent C (REQ-7) ──┤
  Agent D (REQ-13) ─┘

Phase 2 (3 parallel, 1 dependent):
  Agent F (REQ-4)  ──┐
  Agent G (REQ-3)  ──┤── parallel (no deps on each other)
  Agent H (REQ-13) ──┘── depends on Agent D output
  Agent E (REQ-1)  ──── depends on Agent B output

Phase 3 (3 parallel groups):
  Agent I → Agent J ──── sequential (J needs I)
  Agent K ─────────── independent
  Agent L ─────────── depends on Phase 1
  Agent M ─────────── depends on Agent C

Phase 4 (Agent N first, then O/P parallel, Q/R parallel):
  Agent Q ────── independent
  Agent R ────── depends on Phase 2
  Agent N ────── depends on Phase 1
  Agent O ────── depends on Agent N
  Agent P ────── depends on Agent N

Phase 5 (Agent U first, then V→W, S and T parallel):
  Agent S ────── depends on Phase 3
  Agent T ────── depends on Phase 3+4
  Agent U ────── independent geometry
  Agent U → Agent V → Agent W ── sequential

Phase 6 (all parallel):
  Agent X  ────── depends on Phase 4
  Agent Y  ────── independent
  Agent Z  ────── depends on Phase 2
  Agent AA ────── depends on Agent Z
  Agent AB ────── depends on Phase 5

Phase 7 (mostly sequential):
  Agent AC through AG ── integration + polish
```

### Agent Specifications

Each agent receives:
1. **Scope**: Exactly which files to create/modify
2. **Interface contract**: Types and APIs it must implement
3. **Test requirements**: Minimum test coverage
4. **Integration points**: How its output connects to the system

**Agent output validation before integration:**
- Each agent produces code that compiles independently (`pnpm build` for its package)
- Each agent's tests pass independently (`pnpm test` for its package)
- Interface contracts verified against TypeScript types
- Integration done only after both sides of an interface pass their tests

---

## 7. Testing Strategy

### Per-Agent Testing
- Each agent writes unit tests for its module
- Tests run in isolation before integration
- Minimum: 80% line coverage for new code

### Phase Verification Checkpoints
At the end of each phase:
1. `pnpm build` — full project builds
2. `pnpm test` — all tests pass (existing + new)
3. Manual walkthrough — key features demonstrated live
4. Joint review — discuss any deviations from plan

### Integration Tests
- Phase 7 adds end-to-end scenarios covering all 16 requirements
- Scenario: plan deployment → run → toggle ground truth → EO cycling → generate report
- Performance: ensure no degradation (WS message latency, render FPS)

### Quality Gate
No phase starts until previous phase passes its verification checkpoint.

---

## 8. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| WebGL still broken in production | Map features degrade | Medium | All new layers use HTML/SVG rendering (same as current DebugOverlay approach) |
| Ground truth WS doubles bandwidth | Slower updates, lag | Low | Ground truth channel only sends when toggle is ON; lightweight payload |
| PDFKit adds large bundle to Docker | Image size increases | Low | Lazy-load PDF generation; separate it from main bundle |
| Multi-target FOV resolution is O(n!) | Performance for large n | Medium | Cap combinatorial search at 8 targets; use greedy approximation above that |
| Resizable panels break mobile layout | Mobile unusable | Low | Resize only on desktop; mobile keeps current fixed layout |
| Deployment optimizer NP-hard | Slow for many positions | Medium | Grid resolution configurable; greedy placement as default; full optimization as opt-in |
| Phase dependencies cause delays | Schedule slip | Medium | Maximize parallel work within phases; agents are self-contained |

---

## Appendix A: New Package Structure

```
packages/
├── domain/                  # + TargetClassification, EnrichedTrack, CoverZone
├── eo-management/           # NEW — REQ-16 modular EO management
│   ├── src/
│   │   ├── scheduler/       # Dwell + revisit + cycling (REQ-5)
│   │   ├── search/          # Search mode controller (REQ-5B)
│   │   ├── resolver/        # Multi-target FOV resolution (REQ-6)
│   │   ├── classifier/      # Sub-pixel vs image target (REQ-16)
│   │   ├── quality/         # Quality assessor (REQ-8,9,10)
│   │   └── index.ts         # EoManagementModule interface
│   └── tests/
├── deployment-planner/      # NEW — REQ-15
│   ├── src/
│   │   ├── optimizer.ts     # Grid + greedy + LP optimization
│   │   ├── constraints.ts   # Zone constraints
│   │   ├── coverage.ts      # Coverage scoring
│   │   └── index.ts
│   └── tests/
├── report-generator/        # NEW — REQ-12
│   ├── src/
│   │   ├── pdf-builder.ts
│   │   ├── md-builder.ts
│   │   ├── snapshot-store.ts
│   │   └── index.ts
│   └── tests/
└── terrain/                 # NEW — REQ-11
    ├── src/
    │   ├── cover-zones.ts
    │   ├── detection-modifier.ts
    │   └── index.ts (design for LOS + clutter Phase 2)
    └── tests/
```

## Appendix B: New API Endpoints

| Method | Path | Purpose | Phase |
|--------|------|---------|-------|
| WS | `groundTruth.update` | True target positions | 1 |
| GET | `/api/quality/metrics` | Quality assessment metrics | 4 |
| GET | `/api/quality/before-after` | Pre/post EO comparison | 4 |
| POST | `/api/operator/classify` | Set target classification | 3 |
| POST | `/api/operator/lock-sensor` | Lock sensor on target/location | 3 |
| POST | `/api/report/generate` | Generate PDF/MD report | 6 |
| POST | `/api/report/snapshot` | Upload map screenshot | 6 |
| GET | `/api/report/download/:id` | Download generated report | 6 |
| POST | `/api/deployment/optimize` | Run deployment optimization | 6 |
| POST | `/api/deployment/export-scenario` | Export deployment as scenario | 6 |
| GET | `/api/scenario/state` | Get state machine state | 1 |

## Appendix C: New Zustand Stores

| Store | Purpose | Phase |
|-------|---------|-------|
| `ground-truth-store.ts` | True target positions from ground truth WS | 1 |
| `classification-store.ts` | Track classifications and operator inputs | 3 |
| `quality-store.ts` | Real-time quality metrics | 4 |
| `deployment-store.ts` | Sensor placement + optimization state | 6 |

## Appendix D: Scenario Definition Extensions

```typescript
// Extended TargetDefinition
interface TargetDefinition {
  // ... existing fields ...
  classification: TargetClassification;      // NEW — REQ-7
  rcsDbsm?: number;                          // Radar cross-section for detection modeling
  irSignature?: 'low' | 'medium' | 'high';  // IR signature for EO detection
  imageSize?: 'sub_pixel' | 'resolvable';    // REQ-16: pixel size category at typical range
}

// Extended ScenarioDefinition
interface ScenarioDefinition {
  // ... existing fields ...
  coverZones?: CoverZone[];                  // NEW — REQ-11
  searchBoundaries?: SearchBoundary[];       // NEW — REQ-5B
  deploymentConstraints?: DeploymentConstraint[]; // NEW — REQ-15
}
```
