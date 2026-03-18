# ELOC2 — Corrections and Upgrades Plan

**Version:** 1.1
**Date:** 2026-03-18
**Branch:** `claude/eloc2-handover-deployment-XSyf8`
**Status:** IN PROGRESS — Phases 1–6 COMPLETE, Phase 7 PENDING

---

## Table of Contents

0. [Requirements Traceability Matrix](#0-requirements-traceability-matrix)
1. [Executive Summary](#1-executive-summary)
2. [Current System State](#2-current-system-state)
3. [Requirements Breakdown (Items 1–16)](#3-requirements-breakdown)
4. [LOROP_MPS Comparison Report (Item 3)](#4-lorop_mps-comparison-report)
5. [Implementation Phases (7 Phases)](#5-implementation-phases)
6. [Agent Work Breakdown](#6-agent-work-breakdown)
7. [Testing Strategy](#7-testing-strategy)
8. [Risk Register](#8-risk-register)

---

## 0. Requirements Traceability Matrix

| # | Original Request | REQ ID | Plan Section | Phase | Depth | Key Deliverables |
|---|-----------------|--------|-------------|-------|-------|------------------|
| 1 | Ground Truth / World Picture toggle | REQ-1 | §3 REQ-1 | Phase 1 (backend), Phase 2 (frontend) | Full design | Separate `groundTruth.update` WS channel; toggle button; dual rendering mode (truth vs system); true target positions from scenario waypoints |
| 2 | Build version identification | REQ-2 | §3 REQ-2 | Phase 1 | Full design | Git SHA, build timestamp, branch name, build number displayed in header + System Overview panel; Vite defines + Dockerfile build args + cloudbuild.yaml substitutions |
| 3 | LOROP_MPS map comparison (research only) | REQ-3 | §4 (full section) | Phase 2 (prep) | Full comparison delivered | 11-aspect comparison table; rendering pipeline, layer modularity, data flow, interactivity, state management, decimation, performance — with recommendations (no impl without approval) |
| 4 | Resizable panel layout (drag borders) | REQ-4 | §3 REQ-4 | Phase 2 | Full design | `<ResizeHandle>` components; mouse/touch drag; CSS Grid state-driven sizes; localStorage persistence; min/max constraints (250–600px right, 80–400px timeline) |
| 5 | Autonomous EO management with operator override | REQ-5 | §3 REQ-5, §16.3–16.5 | Phase 3 (cycling/dwell/override), Phase 5 (search/optimization) | Deep design in 3 sub-phases | **Phase A**: dwell timer, revisit scheduler, target cycling, operator lock/release API, investigation window with true data. **Phase B**: search mode (wide/narrow scan patterns, auto-detect→track transition). **Phase C**: optimization loop, convergence-based reallocation, triangulation data display. Scoring enhanced with predicted detection range, geometry quality, ASR threat level, convergence rate |
| 6 | Multi-target FOV resolution | REQ-6 | §3 REQ-6 | Phase 5 | Full design | FOV overlap detector (geometric intersection); multi-target bearing association (combinatorial matching); 3D resolution per target with information-matrix fusion for >2 sensors; association confidence scoring; graceful degradation for fast targets without FOV overlap |
| 7 | Target classifications taxonomy | REQ-7 | §3 REQ-7, Appendix D | Phase 1 (types), Phase 3 (integration) | Full design | 14-type taxonomy (`civilian_aircraft` through `drone`); `TargetDefinition.classification` in scenario; `SystemTrack.classification` + `classificationSource` + `classificationConfidence`; operator classify API; EO identification integration |
| 8 | Algorithm quality testing (ground truth vs system) | REQ-8 | §3 REQ-8, §16.5 | Phase 4 | Full design | `QualityAssessor` module; metrics: position error, classification accuracy, coverage %, false track rate, time to first detection, time to confirmed 3D; real-time panel + API endpoint |
| 9 | Before/after EO comparison | REQ-9 | §3 REQ-9, §16.5 | Phase 4 | Full design | Snapshot at EO investigation start; per-track: covariance reduction, position refinement, classification gain; aggregate picture quality score; comparison panel |
| 10 | EO allocation quality criteria | REQ-10 | §3 REQ-10, §16.5 | Phase 4 | Full design | 7 criteria: coverage efficiency, geometry optimality (avg intersection angle), dwell efficiency, revisit timeliness, triangulation success rate, sensor utilization, priority alignment |
| 11 | Land cover / terrain integration | REQ-11 | §3 REQ-11 | Phase 4 | Phase 1 design (simple mask) + Phase 2 interface | Phase 1: `CoverZone` in scenario (polygon + cover type + detection probability modifier); applied to radar + EO sensor models; displayed on map. Phase 2 interface: designed for LOS + clutter model extensibility |
| 12 | Scenario report export (PDF/MD) | REQ-12 | §3 REQ-12 | Phase 6 | Full design | Backend `ReportGenerator` (PDFKit for PDF, template for MD); frontend map screenshot capture (html2canvas); report includes: scenario def, ground truth, performance timeline, EO summary, quality metrics, snapshots, before/after, conclusions. API: generate/snapshot/download |
| 13 | Scenario/timeline dependency management | REQ-13 | §3 REQ-13 | Phase 1 (backend), Phase 2 (frontend) | Full design | `SimulationStateMachine` with 5 states (idle/running/paused/seeking/resetting); transition rules preventing conflicts; API returns 409 on invalid operations; frontend disables invalid buttons |
| 14 | Implementation stages with verification | REQ-14 | §5 (7 phases) | All | Full plan | 7 phases, each ending with joint verification checkpoint. Quality gate: no phase starts until previous passes. Per-phase acceptance criteria defined |
| 15 | EO sensor deployment planning module | REQ-15 | §3 REQ-15 (expanded) | Phase 6 | **Deep design** — algorithm, UI layout, API, package structure | Parallel to scenario editor; inputs: scanned area, threat corridors, constraint zones (inclusion/exclusion), sensor inventory, terrain, required Pd; **Optimization**: grid discretization → per-cell scoring (coverage × geometry × threat × terrain − redundancy) → greedy placement → LP refinement → validation; **Interactive**: click-to-place with live scoring, drag-to-reposition, hybrid manual+auto workflow; **Export**: `SensorDeployment` → `ScenarioDefinition.sensors`; 7 API endpoints; dedicated package + frontend view |
| 16 | Modular EO management architecture | REQ-16 | §3 REQ-16 (expanded) | Phase 5 (refactor), Phase 6 (finalize) | **Deep design** — full architecture, interfaces, sub-modules, pipeline design | **Architecture**: C4ISR bus → EO Module (add-on) → enriched tracks back to C4ISR; clean interface boundary (`EoManagementModule`); **Sub-pixel pipeline**: bearing + SNR + temporal signature + kinematic classification (confidence 0.2–0.6); **Image pipeline**: shape + size + features + direct classification (confidence 0.5–0.95); **Dynamic transition**: `angular_size ≥ IFOV` triggers sub-pixel→image, reversible; target size table for 14 classifications; **Module structure**: 6 sub-modules (ingest, scheduler, search, processing, triangulation, quality) in `@eloc2/eo-management`; **Demonstration narrative**: split-screen before/after, enrichment badges, value scoreboard, detection mode indicators; **Refactoring plan**: existing `@eloc2/eo-tasking` + `@eloc2/eo-investigation` composed behind module interface; LiveEngine reduced from ~200 LOC EO logic to ~20 LOC delegation |

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

### REQ-15: EO Sensor Deployment Planning Module

**Description:** A standalone planning module (parallel to the scenario editor) that enables optimal deployment of electro-optical detection devices. The planner accounts for coverage requirements, threat definitions, the scanned area, and installation constraints. Its output is a sensor deployment that feeds directly into an activated scenario.

**Relationship to Scenario Editor:** The Deployment Planner and Scenario Editor are siblings in the application navigation. The Scenario Editor defines targets, faults, and timing. The Deployment Planner defines WHERE sensors are placed. The planner's output (sensor positions + configurations) is exported as the `sensors[]` array of a `ScenarioDefinition`, which the Scenario Editor can then augment with targets and faults.

#### 15.1 Inputs to the Planner

| Input | Source | Description |
|-------|--------|-------------|
| **Scanned area** | Operator draws on map | Polygon defining the area to be covered by EO sensors |
| **Threat corridors** | Operator draws or imports | Polygons/lines defining expected threat approach directions and intensity levels |
| **Threat definitions** | Operator configures | Target types (REQ-7 classifications), expected altitudes, speeds, RCS, approach directions |
| **Installation constraint zones** | Operator draws on map | **Inclusion zones**: areas where sensors CAN be installed (e.g., military bases, hilltops). **Exclusion zones**: areas where sensors CANNOT be installed (e.g., civilian areas, enemy territory) |
| **Sensor inventory** | Operator selects | Number and type of available EO sensors, each with known FOV, detection range, slew rate |
| **Terrain/cover data** | REQ-11 | Land cover zones that affect detection probability (from REQ-11) |
| **Required detection probability** | Operator sets | Minimum probability of detection across the scanned area (e.g., Pd ≥ 0.8) |
| **Required triangulation coverage** | Operator sets | Minimum percentage of scanned area where ≥2 sensors overlap for triangulation |

#### 15.2 Optimization Algorithm

**Step 1: Grid Discretization**
- Divide the scanned area into a grid of candidate positions (configurable resolution: 500m–2km)
- Filter out cells that fall in exclusion zones
- Keep only cells that fall in inclusion zones (if defined)

**Step 2: Per-Cell Scoring Function**

For each candidate position `p` and each sensor type `s`:

```
CellScore(p, s) = w₁·Coverage(p, s) + w₂·GeometryValue(p) + w₃·ThreatExposure(p) + w₄·TerrainAdvantage(p) - w₅·Redundancy(p)
```

Where:
- **Coverage(p, s)**: Fraction of the scanned area visible from position `p` with sensor `s`, considering FOV, detection range, elevation, and land cover (REQ-11). Uses the sensor's `CoverageArc` and `maxRangeM` from the domain model.
- **GeometryValue(p)**: Triangulation potential — how much this position improves intersection angles with already-placed sensors. Computes the average sin(intersection_angle) across the scanned area between this sensor and each existing sensor. Perpendicular baselines (90°) score highest [San01, Fer13].
- **ThreatExposure(p)**: How many threat corridor cells are within detection range. Weighted by threat intensity (higher threat = more value in covering it).
- **TerrainAdvantage(p)**: Elevation advantage — higher positions see further. Bonus for positions on elevation, penalty for positions in valleys (simplified; full LOS in REQ-11 Phase 2).
- **Redundancy(p)**: Penalty for overlap with already-placed sensors beyond the triangulation minimum. Prevents clustering.

**Step 3: Greedy Placement Algorithm**
```
sensors_placed = []
while sensors_remaining > 0:
    best_score = -inf
    best_position = null
    for each candidate cell p in grid:
        score = CellScore(p, next_sensor_type)
        if score > best_score:
            best_score = score
            best_position = p
    place sensor at best_position
    sensors_placed.append(best_position)
    update GeometryValue and Redundancy for all remaining cells
    sensors_remaining -= 1
```

**Step 4: Refinement (Mathematical Optimization)**
- After greedy placement, run a local search (hill climbing) that adjusts each sensor position within a neighborhood to improve overall coverage score
- Optionally: formulate as set-cover LP relaxation to find theoretical minimum sensor count for the required detection probability

**Step 5: Validation**
- Compute aggregate metrics:
  - Total area coverage percentage (at Pd ≥ threshold)
  - Triangulation coverage percentage (≥2 sensor overlap)
  - Worst-case detection gap (largest uncovered region)
  - Average geometry quality across scanned area
- Warn operator if requirements cannot be met with available sensors

#### 15.3 Interactive Placement Mode

In addition to automated optimization, the operator can:

1. **Click to place** a sensor on the map → system immediately shows:
   - Coverage footprint (shaded arc from sensor position)
   - Detection probability heatmap (color-coded by Pd)
   - Triangulation potential with existing sensors (intersection angle quality map)
   - Score breakdown: what this position contributes to overall coverage

2. **Drag to reposition** a placed sensor → all visualizations update in real-time

3. **Compare modes**: "My Placement" vs "Optimized Suggestion" side-by-side scoring

4. **Hybrid workflow**: operator places some sensors manually (e.g., constrained to specific bases), then asks the optimizer to place the remaining sensors optimally around the fixed ones

#### 15.4 Export to Scenario

The planner produces a `SensorDeployment`:
```typescript
interface SensorDeployment {
  deploymentId: string;
  name: string;
  sensors: SensorDefinition[];    // Ready for ScenarioDefinition.sensors
  scannedArea: Position3D[];      // Polygon vertices
  inclusionZones: Position3D[][]; // Allowed installation areas
  exclusionZones: Position3D[][]; // Forbidden installation areas
  threatCorridors: ThreatCorridor[];
  optimizationMetrics: {
    coveragePercent: number;
    triangulationCoveragePercent: number;
    worstCaseGapM: number;
    averageGeometryQuality: number;
  };
}
```

`POST /api/deployment/export-scenario` converts this to a `ScenarioDefinition` with the sensor array populated, ready for the Scenario Editor to add targets, faults, and timing.

#### 15.5 UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  ELOC2  │  Workstation  │  Scenario Editor  │ ★Deployment │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Planner  │              Interactive Map                  │
│ Panel    │   ┌─ Scanned area polygon (blue outline)     │
│          │   ├─ Inclusion zones (green fill)             │
│ [Sensors]│   ├─ Exclusion zones (red fill)               │
│ EO-1 ●   │   ├─ Threat corridors (orange gradient)      │
│ EO-2 ●   │   ├─ Placed sensors (★ icons)                │
│ EO-3 ●   │   ├─ Coverage arcs (semi-transparent fans)   │
│          │   ├─ Detection Pd heatmap                     │
│ [Zones]  │   └─ Triangulation quality overlay            │
│ Draw Inc │                                               │
│ Draw Exc │                                               │
│          │                                               │
│ [Threats]│                                               │
│ Corridor │                                               │
│ Alt range│                                               │
│          ├───────────────────────────────────────────────┤
│ [Actions]│  Metrics: Coverage 87% │ Tri-cover 72% │     │
│ Optimize │  Gap: 2.3km │ Geo-quality: 0.78              │
│ Export   │  [Optimize] [Export to Scenario] [Compare]    │
│ Clear    │                                               │
└──────────┴───────────────────────────────────────────────┘
```

#### 15.6 Package Structure

```
packages/deployment-planner/
├── src/
│   ├── grid.ts              # Grid discretization of scanned area
│   ├── coverage-scorer.ts   # Per-cell coverage computation
│   ├── geometry-scorer.ts   # Triangulation potential between sensor pairs
│   ├── threat-scorer.ts     # Threat exposure scoring
│   ├── terrain-scorer.ts    # Elevation/terrain advantage
│   ├── optimizer.ts         # Greedy + refinement placement algorithm
│   ├── constraints.ts       # Inclusion/exclusion zone filtering
│   ├── validator.ts         # Aggregate metrics + requirement validation
│   ├── export.ts            # Convert deployment → ScenarioDefinition
│   └── index.ts             # Public API
├── __tests__/
│   ├── grid.test.ts
│   ├── coverage-scorer.test.ts
│   ├── geometry-scorer.test.ts
│   ├── optimizer.test.ts
│   └── export.test.ts
└── package.json

apps/workstation/src/deployment/
├── DeploymentView.tsx        # Main planner view (top-level route)
├── DeploymentMap.tsx         # Interactive map with drawing tools
├── DeploymentPanel.tsx       # Left panel: sensors, zones, actions
├── DeploymentMetrics.tsx     # Bottom bar: aggregate metrics
├── SensorPlacer.tsx          # Click/drag sensor placement
├── ZoneDrawer.tsx            # Polygon drawing for zones
├── CoverageHeatmap.tsx       # Pd heatmap overlay
├── GeometryOverlay.tsx       # Triangulation quality overlay
└── deployment-store.ts       # Zustand store for planner state
```

#### 15.7 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/deployment/optimize` | Run optimization with constraints → returns ranked positions |
| POST | `/api/deployment/score-position` | Score a single candidate position (for interactive feedback) |
| POST | `/api/deployment/validate` | Check if deployment meets coverage requirements |
| POST | `/api/deployment/export-scenario` | Convert deployment → ScenarioDefinition |
| GET | `/api/deployment/list` | List saved deployments |
| POST | `/api/deployment/save` | Save a deployment plan |
| GET | `/api/deployment/:id` | Load a saved deployment |

### REQ-16: Modular EO Management Architecture

**Description:** The EO management system must be architecturally separate from the C4ISR system — an add-on that adds an information enrichment layer. The demonstration must clearly show that the C4ISR system works independently, and the EO module enhances the air picture by maximizing electro-optical and algorithmic capabilities. The module must distinguish between sub-pixel detections and image-resolvable targets, as these require fundamentally different processing pipelines.

**Key demonstration narrative:** "The C4ISR system provides the initial air picture. The ELOC2 EO management module plugs in as an add-on, receives that picture, and systematically improves it through intelligent EO sensor allocation, triangulation, and image investigation. The value added by the EO layer is measurable and demonstrable."

#### 16.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         C4ISR SYSTEM                                 │
│                                                                      │
│   ┌──────────────┐   ┌─────────────┐   ┌─────────────────────────┐  │
│   │ Radar Sensors │   │ C4ISR Feed  │   │ ASR Track Database      │  │
│   │ (detection)   │   │ (external)  │   │ (authoritative tracks)  │  │
│   └──────┬───────┘   └──────┬──────┘   └───────────┬─────────────┘  │
│          │                  │                       │                │
│   ═══════╪══════════════════╪═══════════════════════╪════════        │
│          │        System Track Event Bus            │                │
│   ═══════╪══════════════════════════════════════════╪════════        │
│          │                                          │                │
│          │   ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                │
│          │   │   ELOC2 INTERFACE BOUNDARY           │                │
│          │                                          │                │
│   ┌──────┴──────────────────────────────────────────┴──────────────┐ │
│   │              ELOC2 — EO MANAGEMENT MODULE                      │ │
│   │              (Add-on / Plug-in to C4ISR)                       │ │
│   │                                                                │ │
│   │  ╔════════════════════════════════════════════════════════════╗ │ │
│   │  ║              INGEST LAYER                                 ║ │ │
│   │  ║                                                           ║ │ │
│   │  ║  TrackIngester: receives SystemTrack[] from C4ISR bus     ║ │ │
│   │  ║  SensorRegistry: knows available EO sensors + state       ║ │ │
│   │  ║  OperatorCommandQueue: buffers operator override cmds     ║ │ │
│   │  ╚═══════════════════════╤═══════════════════════════════════╝ │ │
│   │                          │                                     │ │
│   │           ┌──────────────┼──────────────┐                      │ │
│   │           ▼              ▼              ▼                      │ │
│   │  ┌────────────────┐ ┌──────────┐ ┌──────────────────────────┐ │ │
│   │  │  EO TASKING    │ │ SEARCH   │ │ TARGET PROCESSING        │ │ │
│   │  │  SCHEDULER     │ │ MODE     │ │ ENGINE                   │ │ │
│   │  │                │ │ CTRL     │ │                          │ │ │
│   │  │ • Dwell mgmt   │ │          │ │ ┌──────────────────────┐ │ │ │
│   │  │ • Revisit sched│ │ • Wide   │ │ │ SUB-PIXEL PIPELINE   │ │ │ │
│   │  │ • Priority calc│ │   scan   │ │ │                      │ │ │ │
│   │  │ • Cycling logic│ │ • Narrow │ │ │ • Bearing extraction │ │ │ │
│   │  │ • Sensor alloc │ │   scan   │ │ │ • SNR measurement    │ │ │ │
│   │  │ • Operator     │ │ • Search │ │ │ • Temporal analysis  │ │ │ │
│   │  │   overrides    │ │   bound- │ │ │ • Kinematic class.   │ │ │ │
│   │  │                │ │   aries  │ │ │ • Triangulation      │ │ │ │
│   │  └───────┬────────┘ │ • Auto   │ │ │                      │ │ │ │
│   │          │          │   detect  │ │ └──────────┬───────────┘ │ │ │
│   │          │          │   →track  │ │            │             │ │ │
│   │          │          └────┬─────┘ │ ┌──────────▼───────────┐ │ │ │
│   │          │               │       │ │ IMAGE TARGET PIPELINE│ │ │ │
│   │          │               │       │ │                      │ │ │ │
│   │          │               │       │ │ • Shape extraction   │ │ │ │
│   │          │               │       │ │ • Size estimation    │ │ │ │
│   │          │               │       │ │ • Feature matching   │ │ │ │
│   │          │               │       │ │ • Direct classif.    │ │ │ │
│   │          │               │       │ │ • ID confidence      │ │ │ │
│   │          │               │       │ └──────────┬───────────┘ │ │ │
│   │          │               │       │            │             │ │ │
│   │          │               │       └────────────┤             │ │
│   │          │               │                    │               │ │
│   │  ┌───────▼───────────────▼────────────────────▼─────────────┐ │ │
│   │  │              TRIANGULATION & FUSION ENGINE                │ │ │
│   │  │                                                          │ │ │
│   │  │  • Multi-bearing triangulation (@eloc2/geometry)         │ │ │
│   │  │  • Quality scoring (intersection angle, time alignment)  │ │ │
│   │  │  • Information-matrix fusion for >2 sensors              │ │ │
│   │  │  • 3D position estimation with uncertainty               │ │ │
│   │  │  • Convergence detection (when to stop dwelling)         │ │ │
│   │  └──────────────────────────┬───────────────────────────────┘ │ │
│   │                             │                                  │ │
│   │  ┌──────────────────────────▼───────────────────────────────┐ │ │
│   │  │              QUALITY ASSESSOR                            │ │ │
│   │  │                                                          │ │ │
│   │  │  • Ground truth comparison (REQ-8)                       │ │ │
│   │  │  • Before/after EO metrics (REQ-9)                       │ │ │
│   │  │  • Allocation quality criteria (REQ-10)                  │ │ │
│   │  │  • Report data accumulation (REQ-12)                     │ │ │
│   │  └──────────────────────────┬───────────────────────────────┘ │ │
│   │                             │                                  │ │
│   │  ╔══════════════════════════╧═══════════════════════════════╗ │ │
│   │  ║              OUTPUT LAYER                                ║ │ │
│   │  ║                                                          ║ │ │
│   │  ║  EnrichedTrack[]: original track + EO enrichment data    ║ │ │
│   │  ║  QualityMetrics: real-time assessment of EO value added  ║ │ │
│   │  ║  EoModuleStatus: sensor states, task queue, mode         ║ │ │
│   │  ║  Events: emitted to C4ISR bus for track database update  ║ │ │
│   │  ╚═════════════════════════════════════════════════════════ ╝ │ │
│   │                                                                │ │
│   └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 16.2 Sub-pixel vs Image Target — Detailed Pipeline Design

**The distinction is fundamental:** it determines which processing pipeline a target enters, what data the EO sensor produces, and how classification is achieved.

**Physical basis:** Whether a target is sub-pixel or image-resolvable depends on:
```
angular_size = physical_size / range
pixel_size = IFOV (instantaneous field of view of one pixel)

if angular_size < pixel_size → SUB-PIXEL
if angular_size ≥ pixel_size → IMAGE TARGET
```

This is DYNAMIC — the same target transitions from sub-pixel to image as range decreases (target approaches) or as the sensor zooms in (narrow FOV mode).

##### 16.2.1 Sub-pixel Detection Pipeline

**When active:** Default mode. All EO detections start here. The target appears as a point source (single bright pixel or small cluster with no resolved shape).

**Sensor outputs:**
```typescript
interface SubPixelDetection {
  type: 'sub_pixel';
  sensorId: SensorId;
  timestamp: Timestamp;

  // Bearing measurement (same as current EoBearingObservation)
  bearing: BearingMeasurement;          // azimuth + elevation

  // Sub-pixel specific data
  snr: number;                          // Signal-to-noise ratio (detection confidence)
  peakIntensity: number;                // Pixel intensity (relates to target IR signature)
  temporalSignature: TemporalSignature; // Flicker pattern, strobe, steady-state

  // Estimated by sensor model
  detectionRangeM: number;              // Range at which detection occurred
  angularSizeRad: number;              // Estimated (always < IFOV for sub-pixel)
}

interface TemporalSignature {
  type: 'steady' | 'blinking' | 'strobing' | 'irregular';
  frequencyHz?: number;                 // For periodic signatures
  pattern?: number[];                   // Intensity over time samples
}
```

**Processing:**
1. **Bearing extraction** — same as current `generateEoBearing()` with noise model
2. **SNR computation** — signal-to-noise from target IR signature vs background
3. **Temporal analysis** — strobe pattern can help distinguish aircraft types (navigation lights flash at known frequencies)
4. **Kinematic classification** — from triangulated 3D track: speed, altitude, maneuver pattern → infer target type
   - Speed > 200 m/s + alt > 5000m → likely `fighter_aircraft` or `passenger_aircraft`
   - Speed 50–150 m/s + alt < 500m → likely `uav` or `helicopter`
   - Speed < 20 m/s + irregular path → likely `bird` or `small_uav`
   - Known friendly IFF → `ally`
5. **Triangulation** — feed bearing into `@eloc2/geometry` for multi-bearing 3D estimation

**Classification confidence for sub-pixel:** LOW to MEDIUM (0.2–0.6) because only kinematics and temporal signatures are available, not direct image features.

##### 16.2.2 Image Target Pipeline

**When active:** Triggered when `angular_size ≥ pixel_size`, meaning the target subtends enough pixels to resolve features. This can happen because:
- Target is close enough to the sensor
- Sensor has switched to narrow FOV (zoom mode)
- Target is physically large

**Transition trigger in simulation:**
```typescript
function isImageResolvable(
  targetSizeM: number,     // Physical size of target (from classification)
  rangeM: number,          // Distance to sensor
  sensorIFOVRad: number,   // Instantaneous FOV per pixel
): boolean {
  const angularSizeRad = targetSizeM / rangeM;
  return angularSizeRad >= sensorIFOVRad;  // At least 1 pixel
}

// Target sizes (wingspan or largest dimension)
const TARGET_SIZES: Record<TargetClassification, number> = {
  passenger_aircraft: 60,   // ~60m wingspan
  fighter_aircraft: 15,     // ~15m wingspan
  civilian_aircraft: 12,    // ~12m wingspan
  light_aircraft: 8,        // ~8m wingspan
  helicopter: 15,           // ~15m rotor diameter
  uav: 5,                   // ~5m wingspan
  small_uav: 1.5,           // ~1.5m
  drone: 0.5,               // ~0.5m
  predator: 20,             // ~20m wingspan
  bird: 0.5,                // ~0.5m
  birds: 2,                 // ~2m flock extent
  ally: 15,                 // varies — default fighter
  neutral: 12,              // varies — default civilian
  unknown: 10,              // default estimate
};
```

**Sensor outputs:**
```typescript
interface ImageDetection {
  type: 'image';
  sensorId: SensorId;
  timestamp: Timestamp;

  // Standard bearing (same as sub-pixel)
  bearing: BearingMeasurement;

  // Image-specific data
  resolvedPixels: number;               // How many pixels the target spans
  shapeSilhouette: ShapeSilhouette;     // Simplified shape descriptor
  estimatedSizeM: number;              // Estimated physical size from angular size + range estimate
  featureVector: number[];              // Simulated feature extraction (for template matching)
  classificationHint: TargetClassification; // Best guess from image
  classificationConfidence: number;     // 0–1

  // Image quality factors
  atmosphericDegradation: number;       // 0–1 (1 = perfect clarity)
  motionBlur: number;                   // 0–1 (0 = no blur)
}

interface ShapeSilhouette {
  type: 'fixed_wing' | 'rotary_wing' | 'delta_wing' | 'bird_like' | 'multi_rotor' | 'amorphous';
  aspectRatio: number;                  // Width / height
  symmetry: number;                     // 0–1 (1 = perfectly symmetric)
}
```

**Processing:**
1. **Shape extraction** — from resolved pixels, determine silhouette type
2. **Size estimation** — angular size × estimated range = physical size
3. **Feature matching** — compare feature vector against known templates
4. **Direct classification** — shape + size + features → classification with HIGH confidence (0.6–0.95)
5. **ID refinement** — multiple observations from different angles improve confidence

**Classification confidence for image targets:** MEDIUM to HIGH (0.5–0.95) because shape, size, and features are directly observable.

##### 16.2.3 Pipeline Transition Logic

```typescript
interface TargetProcessingState {
  targetTrackId: SystemTrackId;
  currentPipeline: 'sub_pixel' | 'image' | 'transitioning';

  // Sub-pixel accumulated data
  bearingHistory: BearingMeasurement[];
  kinematicClassification?: TargetClassification;
  kinematicConfidence: number;
  temporalSignature?: TemporalSignature;

  // Image accumulated data (when available)
  imageObservations: ImageDetection[];
  imageClassification?: TargetClassification;
  imageConfidence: number;

  // Combined (best available)
  bestClassification: TargetClassification;
  bestConfidence: number;
  classificationSource: 'kinematic' | 'image' | 'operator' | 'fused';
}
```

A target can **transition back** from image to sub-pixel if it moves away from the sensor (range increases beyond pixel resolution). The system retains the image classification but marks confidence as decaying.

#### 16.3 Module Interface — Clean Package Boundary

The EO Management Module communicates with the C4ISR system through a well-defined interface. This makes it pluggable — it can be attached to any C4ISR system that provides system tracks.

```typescript
// @eloc2/eo-management — new package
// This is the ONLY interface the C4ISR system needs to know about.

/** Main module interface — the C4ISR system interacts only through this. */
interface EoManagementModule {
  // ── LIFECYCLE ──────────────────────────────────────────────────────

  /** Initialize the module with available EO sensors. */
  initialize(sensors: SensorState[], config: EoModuleConfig): void;

  /** Shut down gracefully, release all sensor tasks. */
  shutdown(): void;

  // ── INPUTS (from C4ISR) ────────────────────────────────────────────

  /** Feed system tracks from the C4ISR track database. Called every cycle. */
  ingestTracks(tracks: SystemTrack[]): void;

  /** Feed sensor state updates (gimbal position, online status). */
  updateSensorState(sensorId: SensorId, state: SensorState): void;

  /** Operator command: override automatic allocation. */
  operatorCommand(command: OperatorCommand): void;

  // ── OUTPUTS (to C4ISR) ─────────────────────────────────────────────

  /** Get tracks enriched with EO data (classification, reduced uncertainty). */
  getEnrichedTracks(): EnrichedTrack[];

  /** Get the current EO contribution to each track. */
  getEoContributions(): Map<SystemTrackId, EoContribution>;

  /** Get real-time quality metrics measuring EO value added. */
  getQualityMetrics(): QualityMetrics;

  /** Get module operational status (for system health display). */
  getModuleStatus(): EoModuleStatus;

  /** Get pending sensor commands (gimbal slew, zoom change). */
  getSensorCommands(): SensorCommand[];

  // ── EVENTS ─────────────────────────────────────────────────────────

  /** Subscribe to EO module events. */
  on(event: EoModuleEvent, handler: (data: any) => void): void;
}

/** What the EO module knows about its configuration. */
interface EoModuleConfig {
  taskingIntervalSec: number;          // How often to re-evaluate tasking
  dwellTimeSec: number;                // Default dwell per target
  maxRevisitIntervalSec: number;       // Max time before revisiting a track
  searchMode: SearchModeConfig;        // Search pattern when no targets
  policyMode: 'auto' | 'auto_with_veto' | 'manual';
  scoringWeights: ScoringWeights;      // From existing @eloc2/eo-tasking
}

/** Operator commands the EO module accepts. */
type OperatorCommand =
  | { type: 'lock_sensor'; sensorId: SensorId; targetId?: SystemTrackId; position?: Position3D }
  | { type: 'release_sensor'; sensorId: SensorId }
  | { type: 'set_priority'; trackId: SystemTrackId; priority: 'high' | 'normal' | 'low' }
  | { type: 'classify_target'; trackId: SystemTrackId; classification: TargetClassification; source: 'operator' }
  | { type: 'set_search_boundary'; boundary: Position3D[] }
  | { type: 'force_search_mode' }
  | { type: 'resume_auto' };

/** What the EO module adds to each track it processes. */
interface EoContribution {
  trackId: SystemTrackId;
  processingPipeline: 'sub_pixel' | 'image' | 'none';
  bearingsCollected: number;
  triangulationQuality: 'none' | 'bearing_only' | 'candidate_3d' | 'confirmed_3d';
  positionRefinement?: {
    originalCovariance: Covariance3x3;
    refinedCovariance: Covariance3x3;
    positionShiftM: number;
  };
  classification?: {
    value: TargetClassification;
    confidence: number;
    source: 'kinematic' | 'image' | 'operator' | 'fused';
  };
  investigationDwellTimeSec: number;
  sensorsInvolved: SensorId[];
}

/** Enriched track = original SystemTrack + EO enrichment. */
interface EnrichedTrack extends SystemTrack {
  eoContribution?: EoContribution;
  eoClassification?: TargetClassification;
  eoClassificationConfidence?: number;
  eoRefinedPosition?: Position3D;
  eoRefinedCovariance?: Covariance3x3;
}

/** Overall module status. */
interface EoModuleStatus {
  mode: 'tracking' | 'searching' | 'mixed' | 'idle' | 'operator_override';
  sensorsTotal: number;
  sensorsActive: number;
  sensorsInSearch: number;
  sensorsLocked: number;
  tracksUnderInvestigation: number;
  tracksWithTriangulation: number;
  tracksWithImageResolution: number;
  coveragePercent: number;              // % of area covered by active sensors
  avgGeometryQuality: number;           // Average triangulation quality
}

/** Events emitted by the module. */
type EoModuleEvent =
  | 'track_enriched'           // A track received new EO data
  | 'classification_updated'   // Classification changed for a track
  | 'triangulation_achieved'   // 3D position confirmed for a track
  | 'image_resolved'           // Target transitioned from sub-pixel to image
  | 'search_detection'         // New detection from search mode
  | 'sensor_exhausted'         // Sensor completed all priority tasks
  | 'sensor_reallocated'       // Sensor moved to new target
  | 'operator_override_active' // Operator took manual control
  | 'quality_report_ready';    // Quality assessment cycle complete
```

#### 16.4 Demonstrating EO Value — The Demonstration Narrative

The UI must make the EO module's value **visually obvious**. This is achieved through:

1. **Split-screen before/after**: Toggle between C4ISR-only picture (radar tracks with large uncertainty ellipses, unknown classifications) and C4ISR+EO picture (refined positions, smaller ellipses, classifications).

2. **Track enrichment badges**: Each track on the map shows a visual indicator of EO contribution:
   - No EO: plain circle
   - Sub-pixel investigated: circle + bearing lines
   - Image resolved: circle + classification icon
   - Triangulated: circle + 3D position marker with small ellipse

3. **EO value scoreboard**: Persistent panel showing:
   - "Tracks improved by EO: 7/12"
   - "Average position improvement: 340m → 85m"
   - "Classifications added: 5 (3 confirmed, 2 tentative)"
   - "Triangulation solutions: 4"

4. **Investigation timeline**: Shows which sensor is looking at which target at each moment, with dwell periods and transitions animated

5. **Detection mode indicator**: Per-target badge showing "SUB-PIXEL" or "IMAGE" with the pipeline being used

#### 16.5 Internal Sub-modules and Responsibilities

```
@eloc2/eo-management/
│
├── src/
│   ├── index.ts                    # EoManagementModule class (implements interface above)
│   │
│   ├── ingest/
│   │   ├── track-ingester.ts       # Receives SystemTrack[], maintains internal mirror
│   │   └── sensor-registry.ts      # Tracks available EO sensors and their state
│   │
│   ├── scheduler/
│   │   ├── task-scheduler.ts       # Main scheduling loop: decide what each sensor does
│   │   ├── dwell-manager.ts        # Manages dwell timers per task
│   │   ├── revisit-planner.ts      # Ensures tracks get revisited based on priority
│   │   ├── cycling-logic.ts        # Determines next target after dwell completes
│   │   └── operator-override.ts    # Handles manual sensor locking/releasing
│   │
│   ├── search/
│   │   ├── search-controller.ts    # Activates/deactivates search mode
│   │   ├── scan-patterns.ts        # Wide-scan (sector) and narrow-scan (raster) generators
│   │   └── search-detector.ts      # Converts search-mode detections into tracks
│   │
│   ├── processing/
│   │   ├── pipeline-router.ts      # Routes detections to sub-pixel or image pipeline
│   │   ├── sub-pixel/
│   │   │   ├── bearing-processor.ts
│   │   │   ├── snr-estimator.ts
│   │   │   ├── temporal-analyzer.ts
│   │   │   └── kinematic-classifier.ts
│   │   └── image/
│   │       ├── shape-extractor.ts
│   │       ├── size-estimator.ts
│   │       ├── feature-matcher.ts
│   │       └── image-classifier.ts
│   │
│   ├── triangulation/
│   │   └── triangulation-engine.ts # Wraps @eloc2/geometry with convergence detection
│   │
│   ├── quality/
│   │   ├── quality-assessor.ts     # REQ-8: ground truth comparison
│   │   ├── before-after.ts         # REQ-9: pre/post EO comparison
│   │   ├── allocation-scorer.ts    # REQ-10: allocation quality criteria
│   │   └── metrics-accumulator.ts  # Time-series metric collection
│   │
│   └── types.ts                    # All types defined in 16.3 above
│
├── __tests__/
│   ├── scheduler/
│   │   ├── task-scheduler.test.ts
│   │   ├── dwell-manager.test.ts
│   │   ├── revisit-planner.test.ts
│   │   └── cycling-logic.test.ts
│   ├── processing/
│   │   ├── pipeline-router.test.ts
│   │   ├── kinematic-classifier.test.ts
│   │   └── image-classifier.test.ts
│   ├── search/
│   │   ├── search-controller.test.ts
│   │   └── scan-patterns.test.ts
│   ├── quality/
│   │   ├── quality-assessor.test.ts
│   │   └── allocation-scorer.test.ts
│   └── integration/
│       └── full-cycle.test.ts      # End-to-end: ingest → schedule → process → output
│
└── package.json
```

#### 16.6 Refactoring Existing Packages

The current `@eloc2/eo-tasking` and `@eloc2/eo-investigation` packages contain logic that belongs inside the EO Management Module. The refactoring approach:

| Current Package | What Moves to `@eloc2/eo-management` | What Stays |
|----------------|--------------------------------------|------------|
| `@eloc2/eo-tasking` | `scorer.ts` → `scheduler/`, `assigner.ts` → `scheduler/`, `generator.ts` → `scheduler/` | Policy types (reusable) |
| `@eloc2/eo-investigation` | `cue-issuer.ts` → `scheduler/`, `ambiguity.ts` → `processing/`, `identification.ts` → `processing/image/` | Domain types (reusable) |
| `@eloc2/geometry` | **Stays** — used by `triangulation-engine.ts` as a dependency | Everything stays |
| `@eloc2/fusion-core` | **Stays** — C4ISR responsibility, EO module consumes its output | Everything stays |

The existing packages are NOT deleted — they remain as lower-level libraries. The EO Management Module composes them behind its clean interface.

#### 16.7 Integration with LiveEngine

Currently, `live-engine.ts` directly calls `generateCandidates()`, `scoreCandidate()`, `applyPolicy()`, `assignTasks()`, and triangulation. After REQ-16:

```typescript
// BEFORE (current live-engine.ts — ~200 lines of EO logic inline)
private tickEoTasking() {
  const candidates = generateCandidates(tracks, sensors);
  const scored = candidates.map(c => scoreCandidate(c, weights, ...));
  const filtered = applyPolicy(scored, policyMode);
  const assignments = assignTasks(filtered, sensors);
  // ... handle assignments, issue cues, process bearings, triangulate
}

// AFTER (clean delegation to EO module)
private tickEoManagement() {
  // Feed tracks from C4ISR fusion
  this.eoModule.ingestTracks(this.state.tracks);

  // Get sensor commands (gimbal slew, zoom, search scan)
  const commands = this.eoModule.getSensorCommands();
  this.applySensorCommands(commands);

  // Get enriched tracks and update the system picture
  const enriched = this.eoModule.getEnrichedTracks();
  this.mergeEnrichments(enriched);

  // Get quality metrics for display
  this.qualityMetrics = this.eoModule.getQualityMetrics();
}
```

This reduces the EO-related code in `live-engine.ts` from ~200+ lines to ~20 lines, making the separation clear.

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
**Status: COMPLETE** (2026-03-18, branch `claude/eloc2-handover-deployment-XSyf8`)

| Item | REQ | Agent | Status | Commit |
|------|-----|-------|--------|--------|
| Build version info | REQ-2 | Agent A | **DONE** | `2b70111` — Vite defines, Dockerfile args, header tooltip |
| Ground truth WS channel | REQ-1 backend | Agent B | **DONE** | `2b70111` — `groundTruth.update` WS messages with true positions |
| Target classification types | REQ-7 domain | Agent C | **DONE** | `2b70111` — 14-type taxonomy in `@eloc2/domain`, scenario support |
| Scenario dependency state machine | REQ-13 | Agent D | **DONE** | `2b70111` — `SimulationStateMachine` with 5 states, 409 on invalid ops |

**All acceptance criteria met.**

---

### Phase 2: UI — Ground Truth Toggle, Resizable Panels, Layer Refactor (Week 2)
**Status: COMPLETE** (2026-03-18, branch `claude/eloc2-handover-deployment-XSyf8`)

| Item | REQ | Agent | Status | Commit |
|------|-----|-------|--------|--------|
| Ground truth frontend toggle | REQ-1 frontend | Agent E | **DONE** | `9bc55d6` — Toggle in header, DebugOverlay dual-mode rendering |
| Resizable panels | REQ-4 | Agent F | **DONE** | `9bc55d6` — ResizeHandle, drag borders, localStorage persistence |
| DebugOverlay decomposition | REQ-3 prep | Agent G | **DEFERRED** | DebugOverlay kept monolithic (too risky to split during active dev) |
| Dependency management frontend | REQ-13 frontend | Agent H | **DONE** | `9bc55d6` — Buttons disabled in invalid states per state machine |

**All acceptance criteria met (except G deferred — not blocking).**

---

### Phase 3: EO Management Phase A — Cycling, Dwell, Override (Week 3)
**Status: COMPLETE** (2026-03-18, branch `claude/eloc2-handover-deployment-XSyf8`)

| Item | REQ | Agent | Status | Commit |
|------|-----|-------|--------|--------|
| Dwell timer + revisit scheduler | REQ-5 Phase A | Agent I | **DONE** | `788044d` — 15s dwell, 60s revisit, `getDwellStates()` API |
| Target cycling logic | REQ-5 Phase A | Agent J | **DONE** | `788044d` — Anti-ping-pong penalties, cycling history (20/sensor) |
| Operator override API | REQ-5 Phase A | Agent K | **DONE** | `788044d` — lock/release/classify/set-priority endpoints |
| Investigation window UI | REQ-5 Phase A | Agent L | **DONE** | `788044d` — Score bars, classification dropdown, hypotheses |
| Classification in tracks + EO ID | REQ-7 system | Agent M | **DONE** | `788044d` — Scenario→EO ID→SystemTrack propagation |

**All acceptance criteria met. Duplicate route bug fixed in `3599c84`.**

---

### Phase 4: Quality Assessment + Land Cover (Week 4)
**Status: COMPLETE** (2026-03-18, branch `claude/eloc2-handover-deployment-XSyf8`)

| Item | REQ | Agent | Status | Commit |
|------|-----|-------|--------|--------|
| QualityAssessor module | REQ-8 | Agent N | **DONE** | `538f54e` — Haversine matching, 9 metrics, panel + API |
| Before/after EO comparison | REQ-9 | Agent O | **DONE** | `570ed3f` — Pre/post snapshots at cue/dwell, aggregate in WS |
| EO allocation quality criteria | REQ-10 | Agent P | **DONE** | `570ed3f` — 7 criteria scored, color-coded bars in panel |
| Land cover zones (simple mask) | REQ-11 | Agent Q | **DONE** | `538f54e` — 4 zones in central-israel, point-in-polygon Pd modifier |
| Land cover display on map | REQ-11 UI | Agent R | **DONE** | `538f54e` — SVG polygons, color-coded by type, centroid labels |

**All acceptance criteria met.**

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
