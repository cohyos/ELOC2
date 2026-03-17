# ELOC2 — Detailed Implementation Plan

> **Version:** 1.0
> **Date:** 2026-03-17
> **Status:** Ready for agent execution
> **Prerequisite:** Read `ELOC2_UI_Requirements_and_VV_Spec.md` first

---

## Table of Contents

1. [Task Dependency Graph](#1-task-dependency-graph)
2. [Task 3: EO Investigation Algorithm Overhaul](#2-task-3-eo-investigation-algorithm-overhaul)
3. [Task 4: Target Selection & Information](#3-task-4-target-selection--information)
4. [Task 1: Scenario Interactive Editor](#4-task-1-scenario-interactive-editor)
5. [Task 5: Demo Presentation Mode](#5-task-5-demo-presentation-mode)
6. [Task 2: QA Agent](#6-task-2-qa-agent)
7. [Agent Prompts](#7-agent-prompts)

---

## 1. Task Dependency Graph

```
Task 3: Algorithm Overhaul ──────────┐
                                     ├──▶ Task 5: Demo Mode ──▶ Task 2: QA Agent
Task 4: Target Selection ────────────┘           ▲
                                                  │
Task 1: Scenario Editor ─────────────────────────┘
```

**Execution order:**
1. **Task 3** (Algorithm) + **Task 4** (Selection) — can run in parallel
2. **Task 1** (Editor) — can start in parallel, no backend deps on 3/4
3. **Task 5** (Demo Mode) — depends on Tasks 3, 4, 1 being complete
4. **Task 2** (QA Agent) — runs last, tests everything

**Estimated work units:** Each sub-task below is one agent session.

---

## 2. Task 3: EO Investigation Algorithm Overhaul

### Sub-task 3A: Scoring Formula Refinement

**Scope:** Improve geometry gain, add closure rate, add revisit priority.

**Files to modify:**
- `packages/eo-tasking/src/scoring/scorer.ts` — Add dynamic geometry gain, closure rate
- `packages/eo-tasking/src/scoring/scoring-types.ts` — NEW: Extract weight types
- `packages/eo-tasking/src/__tests__/scorer.test.ts` — Add new test cases

**Changes:**
1. Replace fixed `geometryGain = 5.0` with:
   ```typescript
   geometryGain = baseGain * intersectionPotential * revisitFactor
   // intersectionPotential = sin(predictedIntersectionAngle) * 10
   // revisitFactor = 1 + (timeSinceLastObs / 60)
   ```
2. Add `closureRateBonus` to threat scoring:
   ```typescript
   closureRateBonus = max(0, -radialVelocity / 200)
   ```
3. Extract `ScoringWeights` interface for runtime configurability
4. Accept `weights` parameter in `scoreCandidate()` (default to current constants)
5. Accept `activeBearings` to compute intersection potential

**Tests to add:**
- Dynamic geometry gain varies with intersection angle
- Closure rate increases threat for approaching targets
- Custom weights override defaults
- Revisit factor increases for stale tracks

**Done criteria:** All existing scorer tests pass + 6 new tests pass.

---

### Sub-task 3B: Multi-Sensor Coordination

**Scope:** Pair EO sensors for triangulation, add coordination bonus.

**Files to modify:**
- `packages/eo-tasking/src/assignment/assigner.ts` — Coordination-aware assignment
- `packages/eo-tasking/src/candidate-generation/generator.ts` — Add pair metadata
- `packages/eo-tasking/src/__tests__/assigner.test.ts` — Coordination tests

**Changes:**
1. In `assignTasks()`, after greedy assignment:
   - Check if another EO sensor is already observing the same track
   - Compute intersection angle from sensor positions + predicted track position
   - Add `coordinationBonus = +3.0` if angle > 45°, `-1.0` if angle < 10°
2. Add `getActiveBearingsBySensorAndTrack()` helper
3. Add revisit scheduling: tracks with `bearing_only` get +2.0 revisit boost

**Tests to add:**
- Two EO sensors assigned to same track when angle is favorable
- Coordination penalty prevents near-collinear pair
- Revisit priority for bearing-only tracks

**Done criteria:** Existing assigner tests pass + 4 new tests.

---

### Sub-task 3C: Adaptive Ambiguity Resolution

**Scope:** Dynamic split threshold, Bayesian updating, convergence criterion.

**Files to modify:**
- `packages/eo-investigation/src/split-merge/splitter.ts` — Adaptive threshold
- `packages/eo-investigation/src/ambiguity/ambiguity-handler.ts` — Bayesian updating
- `packages/domain/src/unresolved-group.ts` — Add hypothesis probabilities
- `packages/eo-investigation/src/__tests__/splitter.test.ts` — New tests
- `packages/eo-investigation/src/__tests__/ambiguity-handler.test.ts` — New tests

**Changes:**
1. `clusterBearings()` accepts `adaptiveThreshold`:
   ```typescript
   threshold = baseThreshold * (1 + avgBearingNoise / 0.5)
   ```
2. `assessAmbiguity()` performs Bayesian update on existing hypotheses:
   - Compute angular likelihood of new bearing under each hypothesis
   - Update probabilities: `p_i_new = p_i * likelihood_i / sum(p_j * likelihood_j)`
3. Add convergence check: `maxProbability > convergenceThreshold (0.85)` → resolve
4. Add timeout: unresolved after 3 cycles → mark for operator escalation
5. Add `hypothesisProbabilities: number[]` to `UnresolvedGroup` type

**Tests to add:**
- Adaptive threshold widens with noisy bearings
- Bayesian update shifts probabilities toward likely hypothesis
- Convergence triggers auto-resolution
- Timeout escalation after 3 cycles

**Done criteria:** Existing ambiguity/splitter tests pass + 6 new tests.

---

### Sub-task 3D: Runtime Parameter API + Investigation Manager Panel

**Scope:** API endpoints for parameters, new Investigation Manager panel in frontend.

**Files to create:**
- `apps/api/src/routes/investigation-routes.ts` — Parameter GET/POST/reset endpoints
- `apps/workstation/src/investigation/InvestigationManagerPanel.tsx` — NEW panel
- `apps/workstation/src/stores/investigation-store.ts` — NEW Zustand store

**Files to modify:**
- `apps/api/src/server.ts` — Register new routes
- `apps/api/src/simulation/live-engine.ts` — Accept runtime parameters, expose investigation state
- `apps/workstation/src/App.tsx` — Add Investigation tab/panel
- `apps/workstation/src/stores/ui-store.ts` — Add 'investigation' to detailView union
- `apps/workstation/src/replay/ReplayController.ts` — Handle investigation state in WS messages

**API Endpoints:**
```
GET  /api/investigation/parameters    → { weights, thresholds, policyMode }
POST /api/investigation/parameters    → Update weights/thresholds/policy
POST /api/investigation/parameters/reset → Reset to defaults
GET  /api/investigation/active        → Active investigations summary
POST /api/investigation/force-resolve → Force resolve a group
```

**Panel Sections:**
1. **Active tab**: Cards per active investigation (track ID, sensors, cue, bearings, geometry, hypotheses, score breakdown)
2. **Resolved tab**: Recently resolved investigations
3. **Parameters tab**: Weight sliders (0-5 range), threshold sliders, policy mode dropdown, Reset/Apply buttons

**Live Engine Changes:**
- Store `currentParameters: InvestigationParameters` in engine state
- Pass parameters to `scoreCandidate()`, `clusterBearings()`, `assessAmbiguity()`
- Expose `getActiveInvestigations()` method returning investigation summaries
- Include `investigationSummaries` in `broadcastRap()` payload

**Done criteria:** Parameters persist across tasking cycles. Panel renders with real data. Sliders update parameters via API.

---

## 3. Task 4: Target Selection & Information

### Sub-task 4A: Track Dossier (Evidence Chain + Investigation History + Threat Assessment)

**Scope:** Enhance TrackDetailPanel with three new sections.

**Files to modify:**
- `apps/workstation/src/track-detail/TrackDetailPanel.tsx` — Add 3 new sections
- `apps/api/src/routes/rap-routes.ts` — Enrich `/api/tracks/:id` response
- `apps/api/src/simulation/live-engine.ts` — Compute threat assessment, gather evidence

**Files to create:**
- `apps/workstation/src/track-detail/EvidenceChain.tsx` — Contributing sensors, observations, correlations
- `apps/workstation/src/track-detail/InvestigationHistory.tsx` — Cues, bearings, reports, ID, groups
- `apps/workstation/src/track-detail/ThreatAssessment.tsx` — Score breakdown, kinematic profile, closure rate

**API Changes:**
- `GET /api/tracks/:id` response adds:
  ```typescript
  {
    ...existingTrack,
    evidence: {
      contributingSensors: SensorContribution[],
      observationCount: number,
      correlationDecisions: CorrelationEntry[],
      sourceObservations: ObservationEntry[]  // last 20
    },
    investigationHistory: {
      activeCues: LightCue[],
      bearingResults: BearingResult[],
      eoReports: EoReportEntry[],
      identification: IdentificationEntry | null,
      ambiguityGroups: GroupSummary[]
    },
    threatAssessment: {
      threatScore: number,
      scoreBreakdown: ScoreFactors,
      kinematicProfile: { speedTrend, altitudeTrend, headingRate },
      closureRate: number,   // m/s (negative = approaching)
      taskingPriority: 'active' | 'proposed' | 'none'
    }
  }
  ```

**Frontend Components:**
- `EvidenceChain.tsx`: Expandable list of source observations with sensor icons
- `InvestigationHistory.tsx`: Timeline-style list of EO events (cue → bearing → report → ID)
- `ThreatAssessment.tsx`: Score bar chart + kinematic trend indicators

**Done criteria:** Click track → panel shows all 3 new sections with real data from live engine.

---

### Sub-task 4B: Map Highlighting on Track Selection

**Scope:** When track selected, highlight related sensors, draw bearing rays, dim others, auto-center.

**Files to modify:**
- `apps/workstation/src/map/MapView.tsx` — Add selection highlight effects
- `apps/workstation/src/map/layers/track-layer.ts` — Add opacity expression based on selection
- `apps/workstation/src/map/layers/sensor-layer.ts` — Add highlight ring for contributing sensors
- `apps/workstation/src/stores/ui-store.ts` — Add `highlightedSensorIds: string[]`, `selectionBearingRays: BearingRay[]`

**Changes:**
1. When `selectedTrackId` changes in ui-store:
   - Compute `highlightedSensorIds` from track's `sourceContributions`
   - Compute `selectionBearingRays` from active cues/bearings for this track
   - Set `dimmedTrackOpacity = 0.3` for non-selected tracks
2. In `track-layer.ts`: Use `['case', ['==', ['get', 'id'], selectedId], 1.0, 0.3]` for opacity
3. In `sensor-layer.ts`: Add bright border ring on highlighted sensors
4. Add bearing ray sub-layer for selection context
5. `map.flyTo()` centering on selected track + visible contributing sensors
6. On deselect (click empty): restore all opacities, remove highlights

**Done criteria:** Click track → map dims unrelated, highlights contributing sensors with border, draws bearing rays, auto-centers. Click empty → resets.

---

### Sub-task 4C: Full Entity Selection (Cues, Groups, Geometry)

**Scope:** Make EO rays, ambiguity markers, and triangulation points clickable.

**Files to modify:**
- `apps/workstation/src/map/MapView.tsx` — Add click handlers for new layers
- `apps/workstation/src/stores/ui-store.ts` — Extend `detailView` union with 'cue' | 'group' | 'geometry'

**Files to create:**
- `apps/workstation/src/cue-detail/CueDetailPanel.tsx` — Cue info, bearing results, status
- `apps/workstation/src/group-detail/GroupDetailPanel.tsx` — Group members, hypotheses, resolution actions
- `apps/workstation/src/geometry-detail/GeometryDetailPanel.tsx` — 3D estimate, quality, sensors

**Changes:**
1. Register click handlers on `bearing-lines-layer`, `ambiguity-markers-layer`, `triangulation-rays-layer`
2. On click: look up entity by feature properties → set `selectedCueId` / `selectedGroupId` / `selectedGeometryId`
3. `App.tsx`: Render correct detail panel based on `detailView` value
4. Each panel includes clickable links to related entities (e.g., cue → track, group → member tracks)

**Panel Fields:**
- **CueDetailPanel**: Cue ID, target track (link), sensor (link), priority bar, uncertainty gate, validity countdown, bearing results list, status badge
- **GroupDetailPanel**: Group ID, status, reason text, member tracks (links), hypothesis probability bars, [Force Resolve] [Add Sensor] [Dismiss] buttons
- **GeometryDetailPanel**: 3D position, quality badge, classification, intersection angle, contributing sensors (links), time alignment quality

**Done criteria:** Click EO ray → cue detail. Click pink ring → group detail. Click intersection → geometry detail. All panels link back to related tracks/sensors.

---

## 4. Task 1: Scenario Interactive Editor

### Sub-task 1A: Editor Backend (Custom Scenario API + Live Injection)

**Scope:** Server-side endpoints for custom scenario CRUD and live injection.

**Files to create:**
- `apps/api/src/routes/editor-routes.ts` — Custom scenario CRUD + injection endpoints

**Files to modify:**
- `apps/api/src/server.ts` — Register editor routes
- `apps/api/src/simulation/live-engine.ts` — Add `injectFault()`, `injectTarget()`, `injectOperatorAction()` methods
- `packages/scenario-library/src/types.ts` — Ensure ScenarioDefinition is importable for validation

**API Endpoints:**
```
POST   /api/scenarios/custom         → Save custom ScenarioDefinition (body = full definition)
GET    /api/scenarios/custom         → List custom scenarios
DELETE /api/scenarios/custom/:id     → Delete custom scenario
POST   /api/scenario/inject-fault    → Live inject fault { type, sensorId, magnitude, durationSec }
POST   /api/scenario/inject-target   → Live inject target { position, altitude, speed, heading, label }
POST   /api/scenario/inject-action   → Live inject operator action { type, sensorId, targetId, durationSec }
POST   /api/scenarios/validate       → Validate ScenarioDefinition, return errors/warnings
```

**Live Engine Changes:**
- `injectFault(fault)`: Create SimulationEvent with type `fault_start`, schedule `fault_end` after duration
- `injectTarget(target)`: Add to scenario runner's active targets, create trajectory from position+heading+speed
- `injectOperatorAction(action)`: Route to operator controls (reserve/veto)
- Store injected items in `injectionLog[]` for audit

**Validation Logic (server-side):**
```typescript
validateScenario(def: ScenarioDefinition): { errors: string[], warnings: string[] }
  Errors:
    - No sensors → "At least one sensor required"
    - No targets → "At least one target required"
    - Duration <= 0
    - Duplicate IDs
    - Fault references unknown sensor
  Warnings:
    - Target never enters any sensor coverage
    - Only 1 EO sensor (no triangulation)
    - Zero-duration fault
    - No faults/actions defined
```

**Done criteria:** Can POST a custom scenario, retrieve it in scenario list, start it. Can inject faults/targets during live run. Validation returns meaningful errors.

---

### Sub-task 1B: Editor Frontend — Layout + Sensor Tab

**Scope:** Dedicated editor route with map, right panel, sensor placement.

**Files to create:**
- `apps/workstation/src/editor/ScenarioEditor.tsx` — Main editor layout (route component)
- `apps/workstation/src/editor/EditorMap.tsx` — Interactive map with click-to-place
- `apps/workstation/src/editor/EditorHeader.tsx` — Back, Save, Export, Import, Validate, Start buttons
- `apps/workstation/src/editor/SensorTab.tsx` — Sensor configuration form
- `apps/workstation/src/editor/sensor-templates.ts` — Predefined sensor templates
- `apps/workstation/src/stores/editor-store.ts` — Zustand store for editor state

**Files to modify:**
- `apps/workstation/src/App.tsx` — Add route for `/editor` (or toggle between workstation/editor views)
- `apps/workstation/src/main.tsx` — If using React Router, add route

**Editor Store:**
```typescript
interface EditorState {
  scenarioName: string;
  description: string;
  duration: number;
  policyMode: PolicyMode;
  sensors: EditorSensor[];
  targets: EditorTarget[];
  faults: EditorFault[];
  actions: EditorAction[];
  selectedItemType: 'sensor' | 'target' | 'fault' | 'action' | null;
  selectedItemId: string | null;
  editMode: 'select' | 'place-sensor' | 'place-waypoint';
  validationResult: { errors: string[], warnings: string[] } | null;
  // actions
  addSensor, removeSensor, updateSensor
  addTarget, removeTarget, updateTarget
  addWaypoint, removeWaypoint, updateWaypoint
  addFault, removeFault, updateFault
  addAction, removeAction, updateAction
  setEditMode, selectItem
  validate, save, exportJson, importJson
}
```

**Sensor Tab:**
- Template dropdown → fills defaults
- Form fields per spec (ID, type, position, coverage, FOV, slew)
- Map click in `place-sensor` mode → creates sensor at click point
- Drag existing sensor marker → updates position
- Selected sensor shows coverage arc preview on map

**Done criteria:** Editor page renders with map + right panel. Can place sensors on map, configure via form, see coverage preview.

---

### Sub-task 1C: Editor Frontend — Target Tab + Waypoints

**Scope:** Click-to-place waypoints, path drawing, per-waypoint configuration.

**Files to create:**
- `apps/workstation/src/editor/TargetTab.tsx` — Target list + waypoint table
- `apps/workstation/src/editor/WaypointRow.tsx` — Per-waypoint config (alt, speed, time)

**Files to modify:**
- `apps/workstation/src/editor/EditorMap.tsx` — Add waypoint placement mode, path lines
- `apps/workstation/src/stores/editor-store.ts` — Target/waypoint CRUD actions

**Changes:**
1. Target list with [Add Target] button
2. Click target → expand waypoint table
3. [Add Waypoint on Map] button → enters `place-waypoint` mode
4. Click map → adds waypoint at position, auto-computes arrival time from speed + distance
5. Lines drawn between waypoints (colored by speed: slow=green, fast=red)
6. Drag waypoint marker → updates position
7. Right-click waypoint → delete
8. Per-waypoint form: altitude (m), speed (m/s), arrival time (auto or manual)

**Done criteria:** Can create target, place 3+ waypoints on map, see connected path, edit altitude/speed per waypoint.

---

### Sub-task 1D: Editor Frontend — Faults + Actions + Settings + Persistence

**Scope:** Remaining editor tabs, validation UI, save/load, JSON export/import.

**Files to create:**
- `apps/workstation/src/editor/FaultTab.tsx` — Fault event configuration
- `apps/workstation/src/editor/ActionTab.tsx` — Operator action configuration
- `apps/workstation/src/editor/SettingsTab.tsx` — Name, description, duration, policy mode
- `apps/workstation/src/editor/ValidationBar.tsx` — Error/warning display

**Files to modify:**
- `apps/workstation/src/editor/ScenarioEditor.tsx` — Wire all tabs + validation bar
- `apps/workstation/src/editor/EditorHeader.tsx` — Wire Save/Export/Import/Validate/Start

**Changes:**
1. **FaultTab**: Select fault type, sensor, start/end time, magnitude. Timeline preview showing fault periods.
2. **ActionTab**: Select action type, time, sensor/target. Timeline preview showing action markers.
3. **SettingsTab**: Name, description (textarea), duration (with slider), policy mode dropdown.
4. **ValidationBar**: Collapsible bar at bottom. Red for errors (block Start), yellow for warnings.
5. **Save**: POST to `/api/scenarios/custom` → success toast → appears in header dropdown
6. **Export**: `JSON.stringify(buildScenarioDefinition()) → download as .json`
7. **Import**: File input → parse JSON → validate schema → populate editor state
8. **Start**: If no errors → POST start with custom scenario ID → switch to workstation view

**Done criteria:** Full editor flow: create scenario → place sensors/targets → add faults → validate → save → start → see it run in workstation.

---

### Sub-task 1E: Live Injection Toolbar

**Scope:** Toolbar during running scenario for live fault/target/action injection.

**Files to create:**
- `apps/workstation/src/injection/LiveInjectionToolbar.tsx` — Toolbar above map during playback

**Files to modify:**
- `apps/workstation/src/App.tsx` — Show toolbar when scenario running + injection mode active
- `apps/workstation/src/stores/ui-store.ts` — Add `injectionMode: boolean`, `injectionLog: InjectionEntry[]`

**Changes:**
1. Toolbar appears above map when scenario is running and user enables injection mode
2. Three buttons: [Inject Fault] [Inject Action] [Spawn Target]
3. Each opens a mini-form dropdown:
   - Fault: type, sensor (dropdown), magnitude → POST `/api/scenario/inject-fault`
   - Action: type, sensor/target (dropdown), duration → POST `/api/scenario/inject-action`
   - Target: click map for position, set altitude/speed/heading → POST `/api/scenario/inject-target`
4. Injection log: expandable list showing all injections with timestamps

**Done criteria:** Can inject fault during live scenario → sensor shows degraded → fault clears after duration. Can spawn target → new track appears.

---

## 5. Task 5: Demo Presentation Mode

### Sub-task 5A: Presenter Dashboard + Audience Profiles

**Scope:** Dashboard UI, audience profile switching, annotation system.

**Files to create:**
- `apps/workstation/src/demo/PresenterDashboard.tsx` — Dashboard panel (Ctrl+D toggle)
- `apps/workstation/src/demo/AnnotationOverlay.tsx` — Callout bubbles + step indicator
- `apps/workstation/src/demo/NarrationPanel.tsx` — Side narration text
- `apps/workstation/src/demo/MetricsOverlay.tsx` — Live counters overlay
- `apps/workstation/src/demo/guided-tour-steps.ts` — 12-step tour definition
- `apps/workstation/src/stores/demo-store.ts` — Zustand store for demo state

**Files to modify:**
- `apps/workstation/src/App.tsx` — Add Ctrl+D handler, render demo overlays
- `apps/workstation/src/stores/ui-store.ts` — Add `demoMode: boolean`

**Demo Store:**
```typescript
interface DemoState {
  active: boolean;
  audience: 'military' | 'technical' | 'mixed';
  narrativeMode: 'guided' | 'interactive' | 'guided_interactive';
  viewMode: 'full' | 'basic';     // toggle overlay
  showAnnotations: boolean;
  showNarrationPanel: boolean;
  tourStep: number;               // 0-11
  tourAutoAdvance: boolean;
  // computed
  totalSteps: number;             // 12
  currentStepDef: TourStepDef;
}
```

**Audience Profiles:**
- Military: Hide algorithm internals (covariance, scoring weights), emphasize operator controls + threat response
- Technical: Show algorithm details, scoring breakdowns, hypothesis probabilities
- Mixed: Show everything

**Implementation:**
- `PresenterDashboard` renders as a modal/overlay triggered by Ctrl+D or header button
- When audience profile changes, update CSS classes that show/hide relevant panel sections
- `AnnotationOverlay` positions callout bubbles near target elements using `getBoundingClientRect()`
- `MetricsOverlay` shows live counters: confirmed tracks, EO cues, geometry estimates, faults handled

---

### Sub-task 5B: Guided Tour + Toggle Overlay

**Scope:** 12-step guided tour with auto-navigation, basic/full view toggle.

**Files to modify:**
- `apps/workstation/src/demo/guided-tour-steps.ts` — Define all 12 steps
- `apps/workstation/src/demo/AnnotationOverlay.tsx` — Step-aware rendering
- `apps/workstation/src/App.tsx` — Toggle overlay logic

**Guided Tour Step Definition:**
```typescript
interface TourStepDef {
  id: number;
  title: string;
  narration: string;           // 2-3 sentences
  targetElement?: string;       // CSS selector to highlight
  mapAction?: 'flyTo' | 'zoomToFit';
  mapTarget?: [lng, lat, zoom];
  waitCondition?: (state) => boolean;  // auto-advance when true
  autoAdvanceMs?: number;       // fallback timeout
}
```

**Toggle Overlay (Basic vs Full):**
- When `viewMode === 'basic'`:
  - Hide layers: EO rays, triangulation, investigation rings, ambiguity markers, coverage, degraded indicators
  - Hide panels: task panel, investigation panel
  - Show only: track circles (radar-derived), sensor positions
- When `viewMode === 'full'`:
  - Show all layers and panels
- Toggle button in header or presenter dashboard

**Done criteria:** Ctrl+D opens dashboard. Can select audience, start guided tour, see annotations step through. Toggle shows clear difference between basic and full ELOC2 view.

---

## 6. Task 2: QA Agent

### Sub-task 2A: Test Infrastructure + API Test Suite

**Scope:** Set up Playwright + test framework, implement all 26 API tests.

**Files to create:**
- `tests/e2e/playwright.config.ts` — Configuration (BASE_URL from env, viewports, timeouts)
- `tests/e2e/api/health.test.ts` — API-01: Health check
- `tests/e2e/api/scenarios.test.ts` — API-02 to API-08: Scenario endpoints
- `tests/e2e/api/rap.test.ts` — API-09 to API-12: RAP endpoints
- `tests/e2e/api/sensors.test.ts` — API-13 to API-14: Sensor endpoints
- `tests/e2e/api/tasks.test.ts` — API-15 to API-18: Task endpoints
- `tests/e2e/api/groups.test.ts` — API-19 to API-21: Group/cue/track endpoints
- `tests/e2e/api/replay.test.ts` — API-22 to API-24: Replay seek
- `tests/e2e/api/websocket.test.ts` — API-25 to API-26: WebSocket

**Files to modify:**
- `package.json` (root) — Add playwright dependency, test:e2e script
- `pnpm-workspace.yaml` — May need test workspace

**Done criteria:** `pnpm test:e2e:api` runs 26 API tests against configurable BASE_URL, all pass.

---

### Sub-task 2B: Playwright Desktop UI Tests

**Scope:** 22 desktop viewport browser tests.

**Files to create:**
- `tests/e2e/ui/desktop/page-load.test.ts` — PW-01 to PW-03: Basic loading
- `tests/e2e/ui/desktop/header.test.ts` — PW-04 to PW-05: Header elements
- `tests/e2e/ui/desktop/tracks.test.ts` — PW-06 to PW-08: Track appearance + selection
- `tests/e2e/ui/desktop/panels.test.ts` — PW-09 to PW-10: Panel toggles
- `tests/e2e/ui/desktop/controls.test.ts` — PW-11 to PW-15: Speed, layers, scrub, keyboard
- `tests/e2e/ui/desktop/tasks.test.ts` — PW-16 to PW-17: Task panel + approve
- `tests/e2e/ui/desktop/events.test.ts` — PW-18 to PW-20: Events, filters, WS
- `tests/e2e/ui/desktop/scenario.test.ts` — PW-21 to PW-22: Counts + degraded mode
- `tests/e2e/ui/desktop/screenshots.test.ts` — PW-27: Full-page screenshots

**Done criteria:** `pnpm test:e2e:desktop` runs 22 browser tests at 1920x1080.

---

### Sub-task 2C: Playwright Mobile UI Tests

**Scope:** 4 mobile viewport tests.

**Files to create:**
- `tests/e2e/ui/mobile/layout.test.ts` — PW-23 to PW-26: Mobile layout, play, panel, dismiss

**Done criteria:** `pnpm test:e2e:mobile` runs 4 browser tests at 375x812.

---

### Sub-task 2D: GCP Integration Tests

**Scope:** 10 tests using gcloud CLI to verify Cloud Run deployment.

**Files to create:**
- `tests/e2e/gcp/cloud-run.test.ts` — GCP-01 to GCP-03: Service health, no errors
- `tests/e2e/gcp/monitoring.test.ts` — GCP-04, GCP-08, GCP-09: Metrics
- `tests/e2e/gcp/artifacts.test.ts` — GCP-05: Container image
- `tests/e2e/gcp/build.test.ts` — GCP-06: Build status
- `tests/e2e/gcp/websocket.test.ts` — GCP-07: WS upgrade
- `tests/e2e/gcp/cold-start.test.ts` — GCP-10: Cold start time

**Implementation Notes:**
- Use `child_process.execSync('gcloud ...')` for CLI commands
- Parse JSON output: `gcloud run services describe --format=json`
- For monitoring: `gcloud monitoring metrics list` or REST API
- For logs: `gcloud run services logs read --limit=100 --format=json`
- Skip GCP tests if `SKIP_GCP=true` env var (for local dev)

**Done criteria:** `pnpm test:e2e:gcp` runs 10 GCP validation tests.

---

### Sub-task 2E: Scenario Validation Tests

**Scope:** 8 full scenario playthrough tests.

**Files to create:**
- `tests/e2e/scenarios/single-target.test.ts` — SV-01
- `tests/e2e/scenarios/crossed-tracks.test.ts` — SV-02
- `tests/e2e/scenarios/good-triangulation.test.ts` — SV-03
- `tests/e2e/scenarios/bad-triangulation.test.ts` — SV-04
- `tests/e2e/scenarios/sensor-fault.test.ts` — SV-05
- `tests/e2e/scenarios/operator-override.test.ts` — SV-06
- `tests/e2e/scenarios/central-israel.test.ts` — SV-07
- `tests/e2e/scenarios/multi-eo.test.ts` — SV-08

**Implementation:**
1. Start scenario via API at 10x speed
2. Poll `/api/rap` and `/api/events` at 1s intervals
3. Assert conditions per `ELOC2_UI_Requirements_and_VV_Spec.md` §10
4. Take screenshots at key moments
5. Timeout at 2x expected duration

**Done criteria:** All 8 scenario tests pass against local and Cloud Run.

---

### Sub-task 2F: Report Generator + HTML Dashboard

**Scope:** Aggregate all test results into JSON report and HTML dashboard.

**Files to create:**
- `tests/e2e/reporting/json-reporter.ts` — Custom Playwright reporter → qa-report.json
- `tests/e2e/reporting/html-dashboard.ts` — Generate HTML from JSON report
- `tests/e2e/reporting/dashboard-template.html` — HTML template with charts

**JSON Report Format:** Per spec §9.6

**HTML Dashboard:**
- Summary header: pass/fail counts, pie chart (use inline SVG, no dependencies)
- Suite sections: collapsible, showing test name + status + duration
- Inline screenshots for visual tests (base64 encoded)
- Error details with stack traces for failures
- GCP metrics section (if available)

**Done criteria:** After running full suite, `qa-report.json` and `qa-report.html` are generated in `tests/e2e/output/`.

---

## 7. Agent Prompts

### Global Prefix (Prepend to ALL agent prompts)

```
You are working on the ELOC2 project — an EO C2 Air Defense Demonstrator.

CRITICAL RULES:
1. Read CLAUDE.md first for project context.
2. Read Knowledge_Base_and_Agents_instructions/ELOC2_UI_Requirements_and_VV_Spec.md for full UI/UX spec.
3. Read Knowledge_Base_and_Agents_instructions/ELOC2_Implementation_Plan.md for your specific sub-task.
4. Use existing patterns: Zustand stores (selector pattern), Fastify routes, MapLibre layers.
5. Use branded types from @eloc2/domain.
6. All tests must pass: run `pnpm test` before declaring done.
7. Use the project's color system (see V&V spec §1.3).
8. Do not break existing functionality.

Branch: claude/eloc2-development-U3sup
Package manager: pnpm
Build: pnpm build (Turbo)
Test: pnpm test
```

### Agent Prompt: Task 3A — Scoring Formula Refinement
```
[GLOBAL PREFIX]

YOUR TASK: Sub-task 3A — Scoring Formula Refinement

SCOPE: Improve the EO tasking scoring formula in @eloc2/eo-tasking.

READ FIRST:
- packages/eo-tasking/src/scoring/scorer.ts (current implementation)
- packages/eo-tasking/src/__tests__/scorer.test.ts (current tests)
- Knowledge_Base_and_Agents_instructions/EO_sensor_tasking.md (scoring design)

CHANGES:
1. Replace fixed geometryGain=5.0 with dynamic:
   geometryGain = baseGain * intersectionPotential * revisitFactor
   intersectionPotential = sin(predictedIntersectionAngle) * 10
   revisitFactor = 1 + (timeSinceLastObs / 60)

2. Add closureRateBonus to threat scoring:
   closureRateBonus = max(0, -radialVelocity / 200)

3. Extract ScoringWeights interface, accept as optional parameter (default to current constants)

4. scoreCandidate() should accept optional activeBearings to compute intersection potential

ADD TESTS:
- Dynamic geometry gain varies with intersection angle (0°→0, 90°→max)
- Closure rate bonus for approaching target
- Custom weights override defaults
- Revisit factor increases for stale tracks
- Backward compatibility: calling without new params produces same results

DONE WHEN: All existing tests pass + 6 new tests pass. pnpm build succeeds.
```

### Agent Prompt: Task 3D — Investigation Manager Panel
```
[GLOBAL PREFIX]

YOUR TASK: Sub-task 3D — Runtime Parameter API + Investigation Manager Panel

SCOPE: New API endpoints for algorithm parameters + new frontend panel.

READ FIRST:
- apps/api/src/routes/ (all route files for pattern)
- apps/api/src/server.ts (route registration)
- apps/api/src/simulation/live-engine.ts (engine state)
- apps/workstation/src/task-panel/TaskPanel.tsx (panel pattern)
- apps/workstation/src/stores/task-store.ts (store pattern)

CREATE:
1. apps/api/src/routes/investigation-routes.ts
   - GET /api/investigation/parameters → current weights + thresholds + policyMode
   - POST /api/investigation/parameters → update (validate ranges)
   - POST /api/investigation/parameters/reset → reset to defaults
   - GET /api/investigation/active → active investigation summaries
   - POST /api/investigation/force-resolve → force resolve group by ID

2. apps/workstation/src/stores/investigation-store.ts
   - parameters: ScoringWeights + thresholds + policyMode
   - activeInvestigations: InvestigationSummary[]
   - fetchParameters(), updateParameters(), resetParameters()
   - fetchActive()

3. apps/workstation/src/investigation/InvestigationManagerPanel.tsx
   - Three tabs: Active | Resolved | Parameters
   - Active: Cards per investigation (track, sensors, cue, bearings, geometry, hypotheses, score)
   - Resolved: Recently completed investigations
   - Parameters: Sliders for weights (0-5), thresholds, policy dropdown, Reset/Apply buttons

MODIFY:
4. apps/api/src/server.ts — register investigation routes
5. apps/api/src/simulation/live-engine.ts — store currentParameters, pass to scorer/splitter/ambiguity, expose getActiveInvestigations()
6. apps/workstation/src/App.tsx — add Investigation tab/panel option
7. apps/workstation/src/stores/ui-store.ts — add 'investigation' to detailView
8. apps/workstation/src/replay/ReplayController.ts — handle investigation summaries in WS

DONE WHEN: Panel renders with real data. Slider changes persist via API. Investigation cards show active investigations from live engine.
```

### Agent Prompt: Task 4A — Track Dossier
```
[GLOBAL PREFIX]

YOUR TASK: Sub-task 4A — Track Dossier (Evidence + Investigation + Threat)

SCOPE: Enhance TrackDetailPanel with 3 new sections showing full track information.

READ FIRST:
- apps/workstation/src/track-detail/TrackDetailPanel.tsx (current panel)
- apps/api/src/routes/rap-routes.ts (current /api/tracks/:id)
- apps/api/src/simulation/live-engine.ts (track state, EO state, event log)
- ELOC2_UI_Requirements_and_VV_Spec.md §5.2 (Track Dossier spec)

CREATE:
1. apps/workstation/src/track-detail/EvidenceChain.tsx
   - Contributing sensors list with type icons
   - Observation count
   - Correlation decisions (new_track / update_existing)
   - Expandable source observations (last 20): timestamp, sensor, position, residual

2. apps/workstation/src/track-detail/InvestigationHistory.tsx
   - Active cues (ID, sensor, priority, countdown)
   - Bearing results (sensor, azimuth, elevation, quality)
   - EO reports (outcome, timestamp)
   - Identification (type, confidence %, features)
   - Ambiguity groups (ID, status, member count)

3. apps/workstation/src/track-detail/ThreatAssessment.tsx
   - Threat score horizontal bar
   - Score breakdown: threat/uncertainty/geometry/intent/-slew/-occupancy
   - Kinematic profile: speed trend, altitude trend, heading rate
   - Closure rate with approaching/receding indicator
   - Tasking priority badge

MODIFY:
4. apps/api/src/routes/rap-routes.ts — Enrich GET /api/tracks/:id with evidence, investigationHistory, threatAssessment
5. apps/api/src/simulation/live-engine.ts — Add methods: getTrackEvidence(id), getTrackInvestigation(id), getTrackThreat(id)
6. apps/workstation/src/track-detail/TrackDetailPanel.tsx — Import and render 3 new sections

DONE WHEN: Click track → panel shows all sections with real data. Sections collapse/expand. Links to related entities work.
```

### Agent Prompt: Task 1B — Editor Frontend Sensors
```
[GLOBAL PREFIX]

YOUR TASK: Sub-task 1B — Scenario Editor Layout + Sensor Tab

SCOPE: Create the dedicated scenario editor page with interactive map and sensor placement.

READ FIRST:
- apps/workstation/src/App.tsx (current layout)
- apps/workstation/src/map/MapView.tsx (map initialization pattern)
- ELOC2_UI_Requirements_and_VV_Spec.md §3 (Editor requirements)
- packages/scenario-library/src/types.ts (ScenarioDefinition type)

CREATE:
1. apps/workstation/src/editor/ScenarioEditor.tsx — Main editor layout:
   - Full-screen: editor header + map (left) + panel (right, 400px) + validation bar
   - Tab navigation in panel: Sensors | Targets | Faults | Actions | Settings

2. apps/workstation/src/editor/EditorMap.tsx — Interactive map:
   - Same MapLibre setup as MapView but with edit interactions
   - Modes: select, place-sensor, place-waypoint
   - Click to place in placement mode, drag to move in select mode
   - Shows coverage arc preview for selected sensor

3. apps/workstation/src/editor/EditorHeader.tsx — Toolbar:
   - [← Back] returns to workstation
   - Scenario name (editable)
   - [Save] [Export JSON] [Import JSON] [Validate] [Start]

4. apps/workstation/src/editor/SensorTab.tsx — Sensor config form:
   - Template dropdown (long-range-radar, short-range-radar, eo-turret, eo-fixed, c4isr-node)
   - Fields: ID, type, position (lat/lon/alt), coverage arc, FOV, slew rate, initial gimbal
   - [Add Sensor] button → enters place-sensor map mode
   - Sensor list with select/delete actions

5. apps/workstation/src/editor/sensor-templates.ts — Template definitions

6. apps/workstation/src/stores/editor-store.ts — Editor state (sensors, targets, faults, actions, editMode, validation)

MODIFY:
7. apps/workstation/src/App.tsx — Add view toggle: workstation | editor (or use hash routing)

DONE WHEN: Can navigate to editor, place sensors on map via click, configure via form, see coverage preview, switch templates. [Back] returns to workstation.
```

### Agent Prompt: Task 2A — QA Test Infrastructure
```
[GLOBAL PREFIX]

YOUR TASK: Sub-task 2A — QA Test Infrastructure + API Test Suite

SCOPE: Set up Playwright, configure for local + Cloud Run, implement 26 API tests.

READ FIRST:
- ELOC2_UI_Requirements_and_VV_Spec.md §9 (QA Agent spec)
- apps/api/src/routes/ (all routes for endpoint reference)
- ELOC2_UI_Requirements_and_VV_Spec.md Appendix A (endpoint reference)

SETUP:
1. Install: pnpm add -Dw @playwright/test
2. Create tests/e2e/playwright.config.ts:
   - baseURL from env: process.env.BASE_URL || 'http://localhost:3001'
   - projects: desktop (1920x1080), mobile (375x812)
   - timeout: 60s per test, 300s for scenario tests
   - retries: 1
   - reporter: ['json', { outputFile: 'tests/e2e/output/qa-report.json' }]

CREATE API TESTS (see V&V spec §9.2 for all 26 test cases):
3. tests/e2e/api/health.test.ts — API-01
4. tests/e2e/api/scenarios.test.ts — API-02 to API-08
5. tests/e2e/api/rap.test.ts — API-09 to API-12
6. tests/e2e/api/sensors.test.ts — API-13 to API-14
7. tests/e2e/api/tasks.test.ts — API-15 to API-18
8. tests/e2e/api/groups.test.ts — API-19 to API-21
9. tests/e2e/api/replay.test.ts — API-22 to API-24
10. tests/e2e/api/websocket.test.ts — API-25 to API-26 (use ws library)

ADD SCRIPTS to root package.json:
  "test:e2e": "playwright test --config tests/e2e/playwright.config.ts"
  "test:e2e:api": "playwright test --config tests/e2e/playwright.config.ts tests/e2e/api/"

DONE WHEN: All 26 API tests pass against local dev server (start with pnpm dev first). Tests are parameterizable via BASE_URL.
```

---

## 8. File Creation Summary

| Sub-task | New Files | Modified Files |
|----------|-----------|----------------|
| 3A Scoring | 1 | 2 |
| 3B Coordination | 0 | 3 |
| 3C Ambiguity | 0 | 5 |
| 3D Investigation Panel | 3 | 5 |
| 4A Track Dossier | 3 | 3 |
| 4B Map Highlighting | 0 | 4 |
| 4C Entity Selection | 3 | 2 |
| 1A Editor Backend | 1 | 3 |
| 1B Editor Sensors | 6 | 1 |
| 1C Editor Targets | 2 | 2 |
| 1D Editor Faults/Settings | 4 | 2 |
| 1E Live Injection | 1 | 2 |
| 5A Presenter Dashboard | 6 | 2 |
| 5B Guided Tour | 0 | 2 |
| 2A API Tests | 9 | 1 |
| 2B Desktop Tests | 9 | 0 |
| 2C Mobile Tests | 1 | 0 |
| 2D GCP Tests | 6 | 0 |
| 2E Scenario Tests | 8 | 0 |
| 2F Report Generator | 3 | 0 |
| **TOTAL** | **~66 new** | **~39 modified** |

---

## 9. Execution Order for Agents

```
Phase A (parallel):
  Agent 3A: Scoring Formula
  Agent 3B: Multi-Sensor Coordination
  Agent 3C: Adaptive Ambiguity
  Agent 4A: Track Dossier

Phase B (after A):
  Agent 3D: Investigation Manager Panel (depends on 3A, 3B, 3C)
  Agent 4B: Map Highlighting
  Agent 4C: Entity Selection

Phase C (parallel with B):
  Agent 1A: Editor Backend
  Agent 1B: Editor Frontend Sensors

Phase D (after 1B):
  Agent 1C: Editor Targets
  Agent 1D: Editor Faults/Settings/Persistence

Phase E (after 1D):
  Agent 1E: Live Injection Toolbar

Phase F (after all above):
  Agent 5A: Presenter Dashboard
  Agent 5B: Guided Tour

Phase G (after all above):
  Agent 2A: Test Infrastructure + API Tests
  Agent 2B: Desktop UI Tests
  Agent 2C: Mobile Tests
  Agent 2D: GCP Tests
  Agent 2E: Scenario Validation Tests
  Agent 2F: Report Generator
```

---

*End of implementation plan. Each sub-task is self-contained and agent-ready with exact file paths, changes, and done criteria.*
