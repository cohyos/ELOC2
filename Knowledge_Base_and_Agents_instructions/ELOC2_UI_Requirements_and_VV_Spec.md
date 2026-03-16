# ELOC2 — UI/UX Requirements & Verification/Validation Specification

> **Version:** 1.0
> **Date:** 2026-03-16
> **Status:** Authoritative design document
> **Purpose:** Exhaustive UI requirements, interaction flows, and QA acceptance criteria for all ELOC2 workstation features. This document is the single source of truth for the QA UI Agent.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Workstation Layout Specification](#2-workstation-layout-specification)
3. [Feature 1: Scenario Interactive Editor](#3-feature-1-scenario-interactive-editor)
4. [Feature 2: EO Investigation Manager](#4-feature-2-eo-investigation-manager)
5. [Feature 3: Target Selection & Information](#5-feature-3-target-selection--information)
6. [Feature 4: Demo Presentation Mode](#6-feature-4-demo-presentation-mode)
7. [Visual Inventory — Complete UI Element Registry](#7-visual-inventory)
8. [Interaction Flow Sequences](#8-interaction-flow-sequences)
9. [QA Agent Specification](#9-qa-agent-specification)
10. [Acceptance Criteria per Scenario](#10-acceptance-criteria-per-scenario)

---

## 1. System Overview

### 1.1 Architecture
- **Backend:** Fastify API server (`apps/api`) on port 3001
- **Frontend:** React 19 + MapLibre GL JS 5 + Zustand 5 (`apps/workstation`)
- **Deployment:** Google Cloud Run (`eloc2-820514480393.me-west1.run.app`)
- **WebSocket:** `/ws/events` for real-time RAP updates
- **Simulation:** LiveEngine with ScenarioRunner, 1-second ticks

### 1.2 Design Principles
1. **Map as primary** — System tracks on map are the default air picture
2. **Transparency** — Operator sees why automation acted
3. **Temporal reasoning** — Replay and timeline are first-class
4. **Degraded mode visibility** — Faults and uncertainty are exposed, never hidden
5. **Evidence chain** — Every displayed fact traces to observable evidence
6. **Geometry honesty** — 3D estimates never appear without uncertainty; weak geometry is marked
7. **Human in loop** — Three tasking modes give operator control

### 1.3 Color System

| Element | Color | Hex |
|---------|-------|-----|
| Background | Dark navy | `#0d0d1a` |
| Panel background | Dark indigo | `#141425` |
| Header background | Dark slate | `#1a1a2e` |
| Border | Muted blue-gray | `#2a2a3e` |
| Primary text | Light gray | `#e0e0e0` |
| Dim text | Medium gray | `#888888` |
| Accent/active | Blue | `#4a9eff` |
| Confirmed track | Green | `#00cc44` |
| Tentative track | Yellow | `#ffcc00` |
| Dropped track | Red | `#ff3333` |
| Radar sensor | Blue | `#4488ff` |
| EO sensor | Orange | `#ff8800` |
| C4ISR sensor | Purple | `#aa44ff` |
| Ambiguity marker | Pink | `#ff6699` |
| Degraded state | Yellow | `#ffcc00` |
| Unsafe state | Red | `#ff3333` |

---

## 2. Workstation Layout Specification

### 2.1 Desktop Layout (>= 768px)

```
+------------------------------------------------------+
|                     HEADER (40px)                     |
+-------------------+----------------------------------+
|                   |          DETAIL PANEL (380px)     |
|                   |  [Track / Sensor / Tasks /       |
|    MAP CANVAS     |   Investigation / Editor]         |
|   (fills rest)    |                                  |
|                   |                                  |
+-------------------+----------------------------------+
|              TIMELINE PANEL (150px / 32px collapsed)  |
+------------------------------------------------------+
```

### 2.2 Mobile Layout (< 768px)

```
+----------------------------+
|    HEADER (flexible rows)  |
+----------------------------+
|                            |
|       MAP CANVAS           |
|    (fills viewport)        |
|                            |
|  [Detail bottom-sheet]     |
|  [Timeline bottom-sheet]   |
+----------------------------+
|    BOTTOM TOOLBAR (46px)   |
+----------------------------+
```

### 2.3 Header Elements

| Element | Type | Location | Description |
|---------|------|----------|-------------|
| Logo | Text | Left | "ELOC2" bold white, 15px |
| Subtitle | Text | After logo | "EO C2 Air Defense Demonstrator" dim |
| Revision | Text | After subtitle | Git short hash, monospace |
| Scenario selector | Dropdown | Center-left | Lists all ScenarioDefinition IDs |
| Track status badges | Clickable spans | Center | confirmed (green), tentative (yellow), dropped (red) with counts |
| Track total | Text | After badges | "{N} total" dim |
| Play/Pause button | Button | Center-right | Green/Red toggle |
| Reset button | Button | After play | Resets scenario |
| Speed buttons | Button group | After reset | 1x, 2x, 5x, 10x with active highlight |
| Time display | Text | After speed | "T+MM:SS" monospace |
| Tasks toggle | Button | Right section | Opens/closes task panel |
| Panel toggle | Button | Right section | Show/Hide detail panel |
| Timeline toggle | Button | Right section | Show/Hide timeline |
| Demo Mode toggle | Button | Right section | NEW: Opens presenter dashboard |
| WS indicator | Dot + text | Far right | Green=connected, Red=disconnected |
| Version | Text | Far right | "v0.2.0" dim |

---

## 3. Feature 1: Scenario Interactive Editor

### 3.1 Requirements Summary
- **Dedicated full-screen editor** (separate route/view)
- **Full scenario authoring:** sensors, targets, faults, operator actions, duration
- **Click-to-place waypoints** on map for target paths
- **Template-based sensor placement** with full override
- **Both pre-start editing and live injection** (faults, operator actions, new targets)
- **Persistence:** Save to server API + export/import JSON
- **Full validation** before allowing Start

### 3.2 Editor Layout

```
+------------------------------------------------------+
|  EDITOR HEADER: [Back to Workstation] [Scenario Name] |
|  [Save] [Export JSON] [Import JSON] [Validate] [Start]|
+-------------------+----------------------------------+
|                   |       EDITOR PANEL (400px)       |
|                   |  [Tabs: Sensors | Targets |      |
|   EDITOR MAP      |   Faults | Actions | Settings]   |
|   (interactive)   |                                  |
|   click-to-place  |  [Selected item config form]     |
|   drag-to-move    |                                  |
+-------------------+----------------------------------+
|  VALIDATION BAR: Errors/Warnings (collapsible)       |
+------------------------------------------------------+
```

### 3.3 Editor Panels (Right Side Tabs)

#### 3.3.1 Sensors Tab

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| Sensor ID | Text input | Auto-generated | Unique, non-empty |
| Sensor Type | Select: radar/eo/c4isr | — | Required |
| Template | Select: preset templates | — | Optional, fills defaults |
| Position | Map click or Lat/Lon/Alt inputs | — | Required, valid coords |
| Coverage Arc: azMin/azMax | Number inputs (deg) | 0/360 | 0-360 |
| Coverage Arc: elMin/elMax | Number inputs (deg) | -5/85 | -90 to 90 |
| Coverage Range (km) | Number input | Type-dependent | > 0 |
| FOV Half-Angle H (deg) | Number input (EO only) | 2.5 | > 0 |
| FOV Half-Angle V (deg) | Number input (EO only) | 1.8 | > 0 |
| Slew Rate (deg/s) | Number input (EO only) | 30 | > 0 |
| Initial Gimbal Az (deg) | Number input (EO only) | 0 | 0-360 |

**Sensor Templates:**
- `long-range-radar`: Range 200km, az 0-360, el -5/85
- `short-range-radar`: Range 80km, az 0-360, el -5/60
- `eo-turret`: Range 30km, FOV 2.5/1.8, slew 30 deg/s
- `eo-fixed`: Range 20km, FOV 5.0/3.0, slew 0
- `c4isr-node`: Range 500km, az 0-360

**Map Interaction:**
- Click on map → places sensor at clicked position
- Drag existing sensor marker → moves it
- Selected sensor shows coverage arc preview on map
- EO sensors show FOV cone preview

#### 3.3.2 Targets Tab

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| Target ID | Text input | Auto-generated | Unique |
| Target Label | Text input | — | Optional display name |
| RCS (m²) | Number input | 5 | > 0 |
| Waypoints | Table + map | — | >= 2 waypoints |

**Per Waypoint:**
| Field | Type | Validation |
|-------|------|------------|
| Position | Map click or Lat/Lon | Valid coords |
| Altitude (m) | Number input | 0-30000 |
| Speed (m/s) | Number input | 0-1000 |
| Arrival Time (s) | Number input (auto-computed) | > previous waypoint |

**Map Interaction:**
- Click sequentially on map to add waypoints
- Lines drawn between waypoints (colored by speed)
- Drag waypoint marker to reposition
- Right-click waypoint to delete
- Selected target path highlighted in white

#### 3.3.3 Faults Tab

| Field | Type | Validation |
|-------|------|------------|
| Fault Type | Select: azimuth_bias / clock_drift / sensor_outage | Required |
| Sensor ID | Select from defined sensors | Required |
| Start Time (s) | Number input | 0 to duration |
| End Time (s) | Number input | > startTime, <= duration |
| Magnitude | Number input (type-dependent) | Type-dependent |

**Fault Types:**
- `azimuth_bias`: magnitude in degrees (e.g., +3.0)
- `clock_drift`: magnitude in ms/s
- `sensor_outage`: no magnitude (binary on/off)

#### 3.3.4 Operator Actions Tab

| Field | Type | Validation |
|-------|------|------------|
| Action Type | Select: reserve_sensor / veto_assignment | Required |
| Time (s) | Number input | 0 to duration |
| Sensor ID | Select (for reserve) | Required for reserve |
| Target ID | Select (for veto) | Required for veto |
| Duration (s) | Number input (for reserve) | > 0 |

#### 3.3.5 Settings Tab

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| Scenario Name | Text input | "Custom Scenario" | Non-empty |
| Description | Textarea | — | Optional |
| Duration (s) | Number input | 300 | 30-3600 |
| Policy Mode | Select: recommended_only / auto_with_veto / manual | auto_with_veto | Required |

### 3.4 Live Injection Mode

When scenario is running, a "Live Inject" toolbar appears above the map:

| Control | Type | Description |
|---------|------|-------------|
| Inject Fault | Button → dropdown | Select fault type, sensor, magnitude → inject immediately |
| Inject Operator Action | Button → dropdown | Reserve sensor or veto assignment → takes effect now |
| Spawn Target | Button → map mode | Click map to place new pop-up target, set altitude/speed/heading |
| Injection Log | Expandable list | Shows all live injections with timestamps |

### 3.5 Validation Rules

**Errors (block Start):**
- No sensors defined
- No targets defined
- Duration <= 0
- Duplicate sensor/target IDs
- Waypoint positions outside coverage of all sensors (unreachable target)
- Fault references non-existent sensor

**Warnings (allow Start):**
- Target path never enters any sensor's coverage arc
- Only 1 EO sensor (no triangulation possible)
- Fault start == fault end (zero duration)
- No faults or operator actions defined (simple scenario)

### 3.6 Persistence

**Save to Server:**
- `POST /api/scenarios/custom` → stores in-memory (or file-based)
- Custom scenarios appear in header dropdown with `[Custom]` prefix
- `GET /api/scenarios` includes custom scenarios
- `DELETE /api/scenarios/custom/:id` removes custom scenario

**JSON Export/Import:**
- Export: Download as `scenario-{name}-{timestamp}.json`
- Import: Upload `.json` file, validate schema, load into editor
- Schema matches `ScenarioDefinition` type from `@eloc2/scenario-library`

---

## 4. Feature 2: EO Investigation Manager

### 4.1 Algorithm Improvements

#### 4.1.1 Scoring Formula Refinement

**Current (hardcoded):**
```
geometry_gain = 5.0 (fixed)
```

**New (dynamic):**
```
geometry_gain = base_gain × intersection_potential × revisit_factor
  where:
    base_gain = 5.0
    intersection_potential = sin(predicted_intersection_angle) × 10
      (orthogonal = max gain, collinear = zero)
    revisit_factor = 1 + (time_since_last_observation / 60)
      (stale tracks get higher revisit priority)
```

**New Threat Scoring:**
```
threat = confidence_base × (1 + alt_penalty + speed_bonus + closure_rate_bonus)
  where:
    closure_rate_bonus = max(0, -radial_velocity / 200)
      (approaching targets are higher threat)
```

#### 4.1.2 Multi-Sensor Coordination

**Coordinated Pair Assignment:**
- When assigning EO sensors, check if another EO is already observing the track
- If yes, compute intersection angle of proposed pair
- Boost score if pair would yield angle > 30 deg (good triangulation)
- Penalize if pair would yield angle < 10 deg (poor geometry)
- Add `coordination_bonus` factor: `+3.0 if creates pair with angle > 45 deg`

**Revisit Scheduling:**
- Tracks with confirmed_3D geometry: lower revisit priority
- Tracks with bearing_only: higher revisit priority
- Tracks in unresolved groups: highest revisit priority

#### 4.1.3 Adaptive Ambiguity Resolution

**Dynamic Split Threshold:**
```
split_threshold = base_threshold × (1 + noise_factor)
  where:
    base_threshold = 0.5 deg
    noise_factor = avg_bearing_noise / 0.5
      (noisier sensors → wider threshold)
```

**Bayesian Hypothesis Updating:**
- Initialize hypotheses with equal probability (1/N)
- On new bearing: update probabilities using angular likelihood
- Convergence criterion: max probability > 0.85 → resolve hypothesis
- Timeout: if unresolved after 3 tasking cycles → escalate to operator

### 4.2 Investigation Manager Panel (NEW)

A new panel accessible from the detail panel area, showing the full EO investigation state.

```
+------------------------------------------+
|  INVESTIGATION MANAGER                   |
|  Active Investigations: 4                |
+------------------------------------------+
|  [Tabs: Active | Resolved | Parameters]  |
+------------------------------------------+
| ACTIVE TAB:                              |
| ┌─ Track T-abc123 ─────────────────┐    |
| │ Status: in_progress               │    |
| │ Sensors: EO-1 (bearing), EO-2     │    |
| │ Cue: active, priority 7           │    |
| │ Bearings: 3 received              │    |
| │ Geometry: candidate_3d (42° int)  │    |
| │ Hypotheses: 1 (p=0.92)            │    |
| │ Score: threat=6.2 uncert=4.1      │    |
| │        geom=7.3 intent=0 slew=1.2 │    |
| │ [View on Map] [Override] [Cancel]  │    |
| └────────────────────────────────────┘    |
| ┌─ Track T-def456 (AMBIGUOUS) ──────┐    |
| │ Status: split_detected             │    |
| │ Unresolved Group: G-789           │    |
| │ Hypotheses: 3 (0.45, 0.35, 0.20)  │    |
| │ Awaiting: 2 more bearings          │    |
| │ [Force Resolve] [Add Sensor]       │    |
| └────────────────────────────────────┘    |
+------------------------------------------+
| PARAMETERS TAB:                          |
| Scoring Weights:                         |
|   Threat:      [====|======] 1.0        |
|   Uncertainty: [====|======] 1.0        |
|   Geometry:    [==|========] 0.5        |
|   Op Intent:   [========|==] 2.0        |
|   Slew Cost:   [=|=========] 0.3        |
|   Occupancy:   [==|========] 0.5        |
|                                          |
| Thresholds:                              |
|   Split Angle: [===|=======] 0.5°       |
|   Confidence Gate: [======|====] 0.7    |
|   Cue Validity (s): [30________]         |
|   Convergence: [=======|===] 0.85       |
|                                          |
| Policy Mode: [auto_with_veto ▼]         |
|                                          |
| [Reset to Defaults] [Apply]             |
+------------------------------------------+
```

### 4.3 Runtime Parameter Controls

| Parameter | Type | Range | Default | Effect |
|-----------|------|-------|---------|--------|
| Threat weight | Slider | 0-5 | 1.0 | Scales threat factor in scoring |
| Uncertainty weight | Slider | 0-5 | 1.0 | Scales uncertainty gain |
| Geometry weight | Slider | 0-5 | 0.5 | Scales geometry gain |
| Operator intent weight | Slider | 0-5 | 2.0 | Scales operator boost |
| Slew cost weight | Slider | 0-5 | 0.3 | Scales slew penalty |
| Occupancy cost weight | Slider | 0-5 | 0.5 | Scales sensor load penalty |
| Split angle threshold | Slider | 0.1-5.0 | 0.5 deg | Min angle for bearing split |
| Confidence gate | Slider | 0.3-1.0 | 0.7 | Crowded vs. unresolved threshold |
| Cue validity window | Number | 10-120 | 30 sec | Cue lifetime |
| Convergence threshold | Slider | 0.5-1.0 | 0.85 | Hypothesis resolution trigger |
| Policy mode | Dropdown | 3 modes | auto_with_veto | Tasking policy |

**API Endpoint:**
- `POST /api/investigation/parameters` — Set all parameters
- `GET /api/investigation/parameters` — Get current parameters
- `POST /api/investigation/parameters/reset` — Reset to defaults

---

## 5. Feature 3: Target Selection & Information

### 5.1 Selectable Entities

| Entity | Map Element | Click Action | Detail View |
|--------|-------------|--------------|-------------|
| System Track | Circle marker | Opens Track Dossier panel | Full evidence chain, investigation history, threat assessment |
| Sensor | Square marker | Opens Sensor Detail panel | Position, registration, coverage, gimbal state |
| EO Bearing Ray | Line on map | Opens Cue Detail panel | Cue info, bearing result, associated track |
| Ambiguity Marker | Pink ring | Opens Ambiguity Group panel | Group members, hypotheses, resolution status |
| Triangulation Point | Intersection marker | Opens Geometry Detail panel | 3D estimate, quality, contributing sensors |

### 5.2 Track Dossier (Enhanced TrackDetailPanel)

When a track is selected, the detail panel shows a comprehensive dossier:

#### Section 1: Status Overview
| Field | Source | Display |
|-------|--------|---------|
| Track ID | `systemTrackId` | Monospace, truncated to 12 chars |
| Status | `status` | Color badge (confirmed/tentative/dropped) |
| Confidence | `confidence` | Percentage with color gradient |
| EO Investigation | `eoInvestigationStatus` | Status badge |
| Last Updated | `lastUpdateTime` | Relative time ("3s ago") |

#### Section 2: Position & Kinematics
| Field | Source | Display |
|-------|--------|---------|
| Latitude | `state.lat` | 6 decimal places |
| Longitude | `state.lon` | 6 decimal places |
| Altitude | `state.alt` | Meters, with "AGL" label |
| Speed | Computed from velocity | m/s + km/h |
| Heading | Computed from vx/vy | Degrees + cardinal (e.g., "045 NE") |
| Climb Rate | `state.vz` | m/s with up/down arrow |

#### Section 3: Evidence Chain (NEW)
| Field | Source | Display |
|-------|--------|---------|
| Contributing Sensors | `sourceContributions` | List with sensor type icon + ID |
| Observation Count | From event log | Number of observations for this track |
| Correlation Decisions | From lineage | "new_track" / "update_existing" history |
| Source Observations | Expandable list | Timestamp, sensor ID, raw position, residual |

#### Section 4: EO Investigation History (NEW)
| Field | Source | Display |
|-------|--------|---------|
| Active Cues | `activeCues` filtered | Cue ID, sensor, priority, validity window countdown |
| Bearing Results | `eoTracks` filtered | Sensor, azimuth, elevation, image quality, timestamp |
| EO Reports | From event log | Outcome (confirmed/split_detected/no_support), timestamp |
| Identification | `identificationSupport` | Type, confidence %, features list |
| Ambiguity Groups | `unresolvedGroups` filtered | Group ID, member count, status, hypotheses |

#### Section 5: Threat Assessment (NEW)
| Field | Source | Display |
|-------|--------|---------|
| Threat Score | Computed | Horizontal bar with value |
| Score Breakdown | Scoring factors | threat / uncertainty / geometry / intent / -slew / -occupancy |
| Kinematic Profile | Computed | Speed trend (accelerating/steady/decelerating), altitude trend |
| Closure Rate | Computed | Approaching/receding indicator with m/s |
| Tasking Priority | From task list | Whether EO tasking is proposed/active for this track |

#### Section 6: Geometry Estimate
(Already implemented — intersection angle, quality, classification, 3D position, covariance)

#### Section 7: Lineage
(Already implemented — last 3 entries)

### 5.3 Map Highlighting on Selection

When a track is selected:

| Highlight | Description |
|-----------|-------------|
| Selected track pulse | Selected track circle pulses (scale animation) |
| Contributing sensor highlight | Sensors that observed this track get bright border |
| Bearing rays drawn | All EO bearings for this track shown as colored rays |
| Unrelated tracks dimmed | Other tracks reduced to 30% opacity |
| Camera auto-center | Map smoothly pans/zooms to show selected track + contributing sensors |
| Coverage footprint | Contributing sensors' coverage arcs shown at 50% opacity |

When deselected (click empty map area):
- All highlights removed
- Track opacities restored
- No auto-camera movement

### 5.4 Cue Detail View (NEW)

Opened when clicking an EO bearing ray on the map:

| Field | Display |
|-------|---------|
| Cue ID | Monospace |
| System Track | Clickable link to track |
| Sensor | Clickable link to sensor |
| Priority | 1-10 scale with color bar |
| Uncertainty Gate | Degrees |
| Valid From/To | Timestamps + countdown |
| Bearing Results | List of received bearings with azimuth/elevation |
| Status | active / expired / completed |

### 5.5 Ambiguity Group View (NEW)

Opened when clicking an ambiguity marker on the map:

| Field | Display |
|-------|---------|
| Group ID | Monospace |
| Status | active / resolved badge |
| Reason | Human-readable explanation |
| Member Tracks | List of EO track IDs with individual hypotheses |
| Hypothesis Probabilities | Bar chart showing probability per hypothesis |
| Parent Cue | Link to originating cue |
| Resolution Actions | [Force Resolve] [Request Additional Sensor] [Dismiss] |

---

## 6. Feature 4: Demo Presentation Mode

### 6.1 Presenter Dashboard

Accessible via "Demo Mode" button in header or keyboard shortcut (Ctrl+D).

```
+------------------------------------------+
|  PRESENTER DASHBOARD                     |
+------------------------------------------+
|  Audience:                               |
|    (*) Military   ( ) Technical          |
|    ( ) Mixed      ( ) Custom             |
+------------------------------------------+
|  Narrative Mode:                         |
|    (*) Guided Tour                       |
|    ( ) Interactive Exploration           |
|    ( ) Guided + Interactive              |
+------------------------------------------+
|  View Mode:                              |
|    (*) Full ELOC2                        |
|    ( ) Basic Tracking (comparison)       |
|    [ ] Show Annotations                  |
|    [ ] Show Narration Panel              |
+------------------------------------------+
|  Guided Tour Controls:                   |
|    Step: [3/12] "EO Cueing"             |
|    [< Prev] [Next >] [Auto-advance]     |
+------------------------------------------+
|  [Apply] [Close]                         |
+------------------------------------------+
```

### 6.2 Audience Profiles

| Profile | Emphasis | Hidden/Simplified |
|---------|----------|-------------------|
| Military | Operational value, operator control, threat response, decision superiority | Algorithm internals, covariance matrices, scoring weights |
| Technical | Algorithm correctness, fusion quality, geometry honesty, hypothesis management | Operational context, tactical implications |
| Mixed | Both operational and technical, balanced depth | Nothing hidden |

### 6.3 Guided Tour Steps

The guided tour auto-navigates through a scripted sequence:

| Step | Title | Actions | Annotation |
|------|-------|---------|------------|
| 1 | System Overview | Pan to full scenario view | "ELOC2 manages air defense using fused radar and EO sensors" |
| 2 | Radar Detection | Start scenario, wait for first track | "Radar detects targets. System creates tentative tracks." |
| 3 | Track Confirmation | Wait for confirmed track | "After 3 observations, tracks promote to confirmed." |
| 4 | EO Cueing | Wait for first EO cue | "System cues EO sensor to investigate radar tracks." |
| 5 | Bearing Observation | Wait for EO bearing | "EO sensor returns bearing measurement toward target." |
| 6 | Triangulation | Wait for geometry estimate | "Multiple bearings from different sensors enable 3D triangulation." |
| 7 | Identification | Wait for ID result | "EO provides visual identification support." |
| 8 | Ambiguity | Wait for split_detected (if applicable) | "System detects multiple targets in EO field — preserves hypotheses." |
| 9 | Degradation | Inject fault (or wait for scripted fault) | "Sensor fault degrades registration. System falls back to conservative fusion." |
| 10 | Operator Override | Show task panel, demonstrate veto | "Operator can approve, reject, or reserve sensors." |
| 11 | Recovery | Wait for fault clear | "System recovers. Full fusion restored." |
| 12 | Summary | Show metrics overlay | "ELOC2 demonstrated: coordination, transparency, resilience, honesty." |

### 6.4 Toggle Overlay (Basic vs. ELOC2)

A toggle in the header or presenter dashboard switches between two visualization modes:

| Mode | Shows | Hides |
|------|-------|-------|
| **Full ELOC2** | All layers, all panels, all annotations | Nothing |
| **Basic Tracking** | Track circles only (radar-derived), sensor positions | EO rays, triangulation, investigation rings, ambiguity markers, coverage, degraded indicators, score breakdowns, geometry estimates |

The toggle demonstrates the "edge" — what ELOC2 adds beyond basic radar tracking.

### 6.5 Annotation System

When annotations are enabled:

| Element | Type | Description |
|---------|------|-------------|
| Callout bubbles | Floating div | Positioned near relevant UI element, with arrow pointing to it |
| Step indicator | Top bar | "Step 3/12: Track Confirmation" with progress dots |
| Highlight ring | CSS glow | Pulsing highlight around the UI element being explained |
| Narration text | Side panel or bottom bar | 2-3 sentences explaining what's happening and why it matters |
| Metrics overlay | Bottom-right | Live counters: tracks confirmed, EO cues issued, geometry estimates, faults handled |

---

## 7. Visual Inventory

### 7.1 Header Bar Elements

| ID | Element | Type | Expected State | V&V Check |
|----|---------|------|---------------|-----------|
| H-01 | Logo "ELOC2" | Text | Visible, white, bold, 15px | `text-content === "ELOC2"` |
| H-02 | Subtitle | Text | Visible, dim gray | `.textContent includes "EO C2"` |
| H-03 | Scenario dropdown | Select | Contains >= 9 options | `option.length >= 9` |
| H-04 | Confirmed badge | Span | Green text, shows count | `color === #00cc44, text matches /\d+/` |
| H-05 | Tentative badge | Span | Yellow text, shows count | `color === #ffcc00` |
| H-06 | Dropped badge | Span | Red text | `color === #ff3333` |
| H-07 | Total count | Span | Shows sum | `text matches /\d+ total/` |
| H-08 | Play/Pause btn | Button | Green when stopped, red when running | `background changes on click` |
| H-09 | Reset btn | Button | Always visible | `click → scenario resets` |
| H-10 | Speed 1x btn | Button | Highlighted when active | `background === #4a9eff when speed=1` |
| H-11 | Speed 2x btn | Button | Normal when inactive | Similar |
| H-12 | Speed 5x btn | Button | Normal when inactive | Similar |
| H-13 | Speed 10x btn | Button | Normal when inactive | Similar |
| H-14 | Time display | Span | Shows T+MM:SS | `text matches /T\+\d+:\d{2}/` |
| H-15 | Tasks btn | Button | Toggles task panel | `click → panel content changes` |
| H-16 | Panel toggle | Button | Shows/hides right panel | `click → grid changes` |
| H-17 | Timeline toggle | Button | Shows/hides bottom panel | `click → timeline height changes` |
| H-18 | WS indicator | Span | Green dot when connected | `dot.background === #00cc44` |
| H-19 | Version | Span | Shows version string | `text matches /v\d+\.\d+\.\d+/` |

### 7.2 Map Layer Elements

| ID | Layer | Type | Expected Appearance | V&V Check |
|----|-------|------|-------------------|-----------|
| M-01 | system-tracks-layer | Circle | 8px, colored by status | `circle-radius: 8` |
| M-02 | system-tracks-labels | Symbol | Track ID text above circles | Text visible |
| M-03 | track-ellipses-layer | Circle | Uncertainty ellipses behind tracks | Visible when toggled |
| M-04 | track-eo-badge | Circle | 4px offset badge for EO status | Visible on investigated tracks |
| M-05 | sensors-layer | Circle | 7px, colored by type | `circle-radius: 7` |
| M-06 | sensors-labels | Symbol | Sensor ID text above circles | Text visible |
| M-07 | sensors-degraded | Circle | 12px ring, yellow/red when degraded | Visible only on degraded sensors |
| M-08 | radar-coverage-layer | Fill | Blue, 6% opacity | Visible when toggled |
| M-09 | eo-for-layer | Line | Orange dashed | Visible when toggled |
| M-10 | eo-fov-layer | Fill | Orange, 15% opacity | Visible when toggled |
| M-11 | eo-rays-layer | Line | Orange dashed, from EO sensor | Visible when toggled |
| M-12 | bearing-lines-layer | Line | 1.5px, 60% opacity | Visible when EO bearings exist |
| M-13 | triangulation-rays-layer | Line | Colored by quality | Visible when >= 2 bearings |
| M-14 | investigation-rings-layer | Circle | Concentric rings, 12/16px | Around investigated tracks |
| M-15 | ambiguity-markers-layer | Circle | Pink 14px inner ring | On split_detected tracks |
| M-16 | ambiguity-markers-pulse | Circle | Pink 20px outer, animated | Pulsing animation |

### 7.3 Detail Panel Elements

| ID | Component | Element | Expected State |
|----|-----------|---------|---------------|
| D-01 | TrackDetailPanel | Track ID title | Shows selected track ID |
| D-02 | TrackDetailPanel | Close button | Clears selection on click |
| D-03 | TrackDetailPanel | Status badge | Colored by status |
| D-04 | TrackDetailPanel | Confidence % | 0-100 range |
| D-05 | TrackDetailPanel | EO status badge | Shows investigation status |
| D-06 | TrackDetailPanel | Position lat | 4+ decimal places |
| D-07 | TrackDetailPanel | Position lon | 4+ decimal places |
| D-08 | TrackDetailPanel | Position alt | Number with "m" |
| D-09 | TrackDetailPanel | Velocity vx/vy/vz | m/s values |
| D-10 | TrackDetailPanel | Speed computed | Total magnitude |
| D-11 | TrackDetailPanel | Fusion mode badges | Color-coded |
| D-12 | TrackDetailPanel | Source contributions | Sensor list |
| D-13 | TrackDetailPanel | Geometry quality | strong/acceptable/weak/insufficient |
| D-14 | TrackDetailPanel | Geometry classification | bearing_only/candidate_3d/confirmed_3d |
| D-15 | TrackDetailPanel | Intersection angle | Degrees |
| D-16 | TrackDetailPanel | Time alignment | Ms |
| D-17 | TrackDetailPanel | Bearing noise | Degrees |
| D-18 | TrackDetailPanel | 3D position | Lat/lon/alt if available |
| D-19 | TrackDetailPanel | ID support type | Text |
| D-20 | TrackDetailPanel | ID confidence | Percentage |
| D-21 | TrackDetailPanel | Lineage entries | Timestamp + description |
| D-22 | SensorDetailPanel | Sensor ID title | Shows selected sensor |
| D-23 | SensorDetailPanel | Type badge | Colored by type |
| D-24 | SensorDetailPanel | Online badge | Green/red |
| D-25 | SensorDetailPanel | Coverage details | Az/el/range |
| D-26 | SensorDetailPanel | Gimbal state | Az/el/slew (EO only) |
| D-27 | SensorDetailPanel | FOV details | Half-angles (EO only) |
| D-28 | SensorDetailPanel | Registration health | Spatial/timing quality |
| D-29 | SensorDetailPanel | Bias values | Az/el bias deg, clock ms |
| D-30 | TaskPanel | Header counts | Active cues + tasks |
| D-31 | TaskPanel | Task cards | Track ID, sensor, status, score |
| D-32 | TaskPanel | Approve button | Green, on proposed tasks |
| D-33 | TaskPanel | Reject button | Red, on proposed tasks |
| D-34 | TaskPanel | Score bars | Threat/uncertainty/geometry |

### 7.4 Timeline Panel Elements

| ID | Element | Expected State |
|----|---------|---------------|
| T-01 | Title "Timeline" | Visible |
| T-02 | Play/Pause button | State-dependent text |
| T-03 | Speed buttons (1x-10x) | Active one highlighted |
| T-04 | Event count | Shows number |
| T-05 | Filter buttons | 6 toggleable filters |
| T-06 | Scrubber bar | Blue fill proportional to time |
| T-07 | Scrubber thumb | Draggable circle |
| T-08 | Current time display | T+MM:SS format |
| T-09 | Duration display | MM:SS format |
| T-10 | Event rows | Timestamp + type + summary |

### 7.5 Overlay Elements

| ID | Element | Condition | Expected State |
|----|---------|-----------|---------------|
| O-01 | DegradedModeOverlay | Any sensor offline | Red banner with sensor IDs |
| O-02 | LayerFilterPanel (collapsed) | Default | "Layers" button visible |
| O-03 | LayerFilterPanel (expanded) | On click | 4 groups with toggles |
| O-04 | DebugOverlay diagnostics | No data + layers not ready | Info box top-left |
| O-05 | DebugOverlay track markers | Fallback mode | HTML circles on map |
| O-06 | DebugOverlay sensor markers | Fallback mode | HTML squares on map |
| O-07 | Navigation controls | Always | Zoom +/- top-right |
| O-08 | Scale control | Always | Metric scale bottom-left |

---

## 8. Interaction Flow Sequences

### Flow 1: Start Scenario and Observe Track Creation
```
1. Page load → header shows "ELOC2", WS indicator green
2. Dropdown shows "Central Israel Defense Sector" selected
3. Click [Start] → button turns red, text changes to "Pause"
4. Time display starts incrementing: T+0:01, T+0:02...
5. Within 5s: header track counts increase (tentative > 0)
6. Map shows yellow circles appearing (tentative tracks)
7. Timeline shows "source.observation.reported" events
8. After ~15s: some tracks turn green (confirmed, after 3 obs)
9. Header confirmed count increases
```

### Flow 2: Select Track and View Details
```
1. Click on green track circle on map
2. Detail panel slides open (if closed)
3. Panel shows: Track ID, Status="confirmed" (green badge)
4. Position section shows lat/lon/alt
5. Velocity section shows vx/vy/vz + computed speed
6. If EO investigated: EO status badge + geometry section
7. Lineage section shows 1-3 history entries
8. Cursor changes to pointer on hover over tracks
```

### Flow 3: Observe EO Cueing Cycle
```
1. Start scenario, wait ~10s for tracks
2. Timeline shows "eo.cue.issued" event (orange)
3. Map shows EO ray (orange dashed) pointing from sensor toward track
4. Within 5s: "eo.bearing.measured" events appear
5. Bearing lines appear on map (yellow/orange)
6. "eo.report.received" event: outcome confirmed or split_detected
7. Track's EO badge updates (blue → green or red)
```

### Flow 4: Test Timeline Scrubbing
```
1. Start scenario, let run for 30s
2. Click [Pause]
3. Click on scrubber bar at 50% position
4. Time display jumps to ~half of duration
5. Track counts may change (reflecting state at that time)
6. Drag scrubber thumb left → time decreases
7. Drag scrubber thumb right → time increases
8. Release → state settles at new time
9. Click [Play] → resumes from seeked position
```

### Flow 5: Test Keyboard Shortcuts
```
1. Press [Space] → scenario starts (Play)
2. Press [Space] → scenario pauses (Pause)
3. Press [→] → time advances 10s
4. Press [←] → time goes back 10s
5. Focus an input field → shortcuts disabled
```

### Flow 6: Toggle Layer Visibility
```
1. Click "Layers" button on map (left side)
2. Panel expands showing 4 groups
3. Uncheck "Track icons" → track circles disappear from map
4. Check "Track icons" → track circles reappear
5. Click "Hide all" → all layers hidden
6. Click "Show all" → all layers visible
```

### Flow 7: Test Degraded Mode
```
1. Run "sensor-fault" scenario
2. At T+100s: fault injected (azimuth_bias on radar)
3. Red banner appears: "DEGRADED MODE: RADAR-1 offline..."
4. Sensor marker gets yellow/red ring on map
5. Sensor detail panel shows degraded spatial quality
6. Timeline shows "fault.started" event (red)
7. Fusion mode may change (check task panel)
8. When fault clears: banner disappears, ring disappears
```

### Flow 8: Test Task Approval/Rejection
```
1. Run scenario with auto_with_veto mode
2. Open Task panel (click Tasks button)
3. Task cards appear with score breakdowns
4. Click [Approve] on proposed task → status changes to executing
5. Click [Reject] on proposed task → status changes to rejected
6. Task disappears from active list, appears in recent completed
```

### Flow 9: Test Scenario Selection
```
1. Click scenario dropdown in header
2. Select "single-target-confirm"
3. Scenario resets (tracks clear, time resets)
4. Click [Start] → simple scenario begins
5. Single track appears, confirms, EO cue issued
6. Select "central-israel" → resets to complex scenario
```

### Flow 10: Test Mobile Layout
```
1. Resize to 375px width (or use device mode)
2. Header collapses to 2 rows
3. [More] button visible → click expands controls
4. Bottom toolbar shows 3 buttons: Overview, Tasks, Timeline
5. Tap Overview → bottom-sheet panel rises
6. Tap × on panel → dismisses
7. Tap Timeline → timeline overlay appears
8. Swipe/tap × → dismisses
```

---

## 9. QA Agent Specification

### 9.1 Architecture

```
QA Agent
  ├── Config (BASE_URL, viewport, scenario)
  ├── API Test Suite
  │   ├── Health check
  │   ├── Scenario endpoints
  │   ├── RAP endpoints
  │   ├── Sensor endpoints
  │   ├── Task endpoints
  │   ├── Group endpoints
  │   ├── Replay seek endpoint
  │   └── WebSocket connectivity
  ├── Playwright Test Suite
  │   ├── Desktop viewport (1920x1080)
  │   │   ├── Layout verification
  │   │   ├── Header elements
  │   │   ├── Map rendering
  │   │   ├── Panel interactions
  │   │   ├── Timeline scrubbing
  │   │   └── Full scenario playthrough
  │   └── Mobile viewport (375x812)
  │       ├── Mobile layout
  │       ├── Bottom toolbar
  │       ├── Bottom sheets
  │       └── Touch interactions
  ├── GCP Integration Tests
  │   ├── Cloud Run service health
  │   ├── Cloud Run logs (no errors)
  │   ├── Cloud Build status
  │   ├── Cloud Monitoring metrics
  │   └── Artifact Registry image
  ├── Report Generator
  │   ├── JSON report
  │   ├── Screenshots (pass + fail)
  │   └── HTML dashboard
  └── Scenario Validation Tests
      ├── single-target-confirm (60s @ 10x)
      ├── crossed-tracks (60s @ 10x)
      ├── good-triangulation (60s @ 10x)
      ├── sensor-fault (120s @ 10x)
      └── central-israel (900s @ 10x = 90s real)
```

### 9.2 API Test Cases

| ID | Test | Method | Endpoint | Expected |
|----|------|--------|----------|----------|
| API-01 | Health check | GET | `/api/health` | 200 OK, `status: "ok"` |
| API-02 | List scenarios | GET | `/api/scenarios` | Array of >= 9 scenarios |
| API-03 | Scenario status | GET | `/api/scenario/status` | Valid status object |
| API-04 | Start scenario | POST | `/api/scenario/start` | `ok: true, running: true` |
| API-05 | Pause scenario | POST | `/api/scenario/pause` | `ok: true, running: false` |
| API-06 | Set speed | POST | `/api/scenario/speed` | Speed accepted (1-100) |
| API-07 | Reset scenario | POST | `/api/scenario/reset` | `ok: true` |
| API-08 | Switch scenario | POST | `/api/scenario/reset` + body | `scenarioId` matches |
| API-09 | Get RAP | GET | `/api/rap` | Tracks array, timestamp |
| API-10 | Get track | GET | `/api/tracks/:id` | Track with lineage |
| API-11 | Get geometry | GET | `/api/geometry/:id` | Geometry estimate or 404 |
| API-12 | Get events | GET | `/api/events` | Array of events |
| API-13 | Get sensors | GET | `/api/sensors` | Array of sensor states |
| API-14 | Get registration | GET | `/api/sensors/:id/registration` | Registration state |
| API-15 | Get tasks | GET | `/api/tasks` | Array of tasks |
| API-16 | Approve task | POST | `/api/operator/approve` | Task status changes |
| API-17 | Reject task | POST | `/api/operator/reject` | Task status changes |
| API-18 | Reserve sensor | POST | `/api/operator/reserve` | Reservation confirmed |
| API-19 | Get groups | GET | `/api/groups` | Array of groups |
| API-20 | Get EO cues | GET | `/api/eo-cues` | Array of cues |
| API-21 | Get EO tracks | GET | `/api/eo-tracks` | Array of EO tracks |
| API-22 | Seek replay | POST | `/api/replay/seek` | `ok: true, elapsedSec` |
| API-23 | Invalid speed | POST | `/api/scenario/speed` | 400 error |
| API-24 | Invalid seek | POST | `/api/replay/seek` | 400 error |
| API-25 | WebSocket connect | WS | `/ws/events` | Connection established |
| API-26 | WS rap.update | WS | Message | Contains tracks, sensors |

### 9.3 Playwright Test Cases

| ID | Test | Viewport | Steps | Assertion |
|----|------|----------|-------|-----------|
| PW-01 | Page loads | Desktop | Navigate to URL | Title contains "ELOC2" |
| PW-02 | Header renders | Desktop | Check header elements | All H-* elements visible |
| PW-03 | Map renders | Desktop | Wait for map canvas | MapLibre canvas visible |
| PW-04 | Scenario dropdown | Desktop | Click dropdown | >= 9 options |
| PW-05 | Start scenario | Desktop | Click Play | Button turns red |
| PW-06 | Tracks appear | Desktop | Start, wait 5s | Track count > 0 |
| PW-07 | Track selection | Desktop | Click track circle | Detail panel opens |
| PW-08 | Sensor selection | Desktop | Click sensor marker | Sensor panel opens |
| PW-09 | Panel toggle | Desktop | Click Show/Hide | Panel appears/disappears |
| PW-10 | Timeline toggle | Desktop | Click Show/Hide | Timeline expands/collapses |
| PW-11 | Speed change | Desktop | Click 5x button | Button highlights |
| PW-12 | Layer filter | Desktop | Open Layers, toggle | Layer visibility changes |
| PW-13 | Timeline scrub | Desktop | Click scrubber | Time display changes |
| PW-14 | Keyboard space | Desktop | Press Space | Play/pause toggles |
| PW-15 | Keyboard arrows | Desktop | Press Left/Right | Time changes |
| PW-16 | Task panel | Desktop | Click Tasks button | Task cards visible |
| PW-17 | Task approve | Desktop | Click Approve | Status changes |
| PW-18 | Events appear | Desktop | Start, wait | Event list populates |
| PW-19 | Event filter | Desktop | Toggle filter button | Event list filters |
| PW-20 | WS connected | Desktop | Check indicator | Green dot |
| PW-21 | Track counts | Desktop | Start, wait 15s | confirmed > 0 |
| PW-22 | Degraded mode | Desktop | Run sensor-fault | Red banner appears |
| PW-23 | Mobile layout | Mobile | Navigate | Bottom toolbar visible |
| PW-24 | Mobile play | Mobile | Tap Start | Scenario runs |
| PW-25 | Mobile panel | Mobile | Tap Overview | Bottom-sheet rises |
| PW-26 | Mobile dismiss | Mobile | Tap × | Bottom-sheet closes |
| PW-27 | Screenshot pass | Desktop | After stable state | Full-page screenshot |

### 9.4 GCP Integration Tests

| ID | Test | Command/Method | Expected |
|----|------|----------------|----------|
| GCP-01 | Service exists | `gcloud run services describe eloc2` | Service found in me-west1 |
| GCP-02 | Service healthy | `curl -s https://eloc2-*.run.app/api/health` | 200 OK |
| GCP-03 | No error logs | `gcloud run services logs read --limit=100` | No ERROR level entries |
| GCP-04 | Request latency | Cloud Monitoring metric | p95 < 500ms for API |
| GCP-05 | Container image | `gcloud artifacts docker images list` | Latest image exists |
| GCP-06 | Build success | `gcloud builds list --limit=1` | Status: SUCCESS |
| GCP-07 | WS upgrade | Test WebSocket connection to Cloud Run | 101 Switching Protocols |
| GCP-08 | Memory usage | Cloud Monitoring | < 80% of allocated |
| GCP-09 | Error rate | Cloud Monitoring | < 1% of requests |
| GCP-10 | Cold start time | First request after idle | < 10s |

### 9.5 Scenario Validation Tests

| ID | Scenario | Duration | Speed | Assertions |
|----|----------|----------|-------|------------|
| SV-01 | single-target-confirm | 300s | 10x (30s real) | Track created, confirmed, EO cue issued, bearing received |
| SV-02 | crossed-tracks | 300s | 10x | 2 tracks created, correlation correct (not merged) |
| SV-03 | good-triangulation | 300s | 10x | Geometry estimate with confirmed_3d, intersection > 30 deg |
| SV-04 | bad-triangulation | 300s | 10x | Geometry stays bearing_only, quality = insufficient |
| SV-05 | sensor-fault | 300s | 10x | Fault detected, degraded mode shown, recovery after fault end |
| SV-06 | operator-override | 300s | 10x | Task proposed, veto respects operator action |
| SV-07 | central-israel | 900s | 10x (90s real) | >= 5 tracks confirmed, EO cues issued, geometry computed, faults handled |
| SV-08 | one-cue-two-eo | 300s | 10x | Multi-EO response, potential split detected |

### 9.6 Report Format

**JSON Report:**
```json
{
  "timestamp": "2026-03-16T12:00:00Z",
  "baseUrl": "https://eloc2-*.run.app",
  "duration_ms": 180000,
  "summary": {
    "total": 50,
    "passed": 47,
    "failed": 2,
    "skipped": 1,
    "pass_rate": 0.94
  },
  "suites": {
    "api": { "total": 26, "passed": 26, "failed": 0 },
    "playwright_desktop": { "total": 22, "passed": 20, "failed": 2 },
    "playwright_mobile": { "total": 4, "passed": 4, "failed": 0 },
    "gcp": { "total": 10, "passed": 9, "failed": 1 },
    "scenario_validation": { "total": 8, "passed": 8, "failed": 0 }
  },
  "tests": [
    {
      "id": "API-01",
      "name": "Health check",
      "suite": "api",
      "status": "passed",
      "duration_ms": 120,
      "screenshot": null,
      "error": null
    }
  ],
  "screenshots": {
    "PW-27": "screenshots/desktop-stable-state.png",
    "PW-22": "screenshots/degraded-mode-banner.png"
  }
}
```

**HTML Dashboard:**
- Summary header with pass/fail pie chart
- Collapsible test suite sections
- Inline screenshots for visual tests
- Error details with stack traces
- GCP metrics graphs
- Scenario timeline with event markers

---

## 10. Acceptance Criteria per Scenario

### 10.1 Single Target Confirm (SV-01)
- [ ] 1 track appears within 10s
- [ ] Track status changes from tentative to confirmed
- [ ] At least 1 EO cue issued
- [ ] At least 1 EO bearing received
- [ ] Track confidence > 0.5 after confirmation
- [ ] Timeline shows observation + cue + bearing events

### 10.2 Central Israel Full (SV-07)
- [ ] >= 5 system tracks created
- [ ] >= 3 tracks reach confirmed status
- [ ] >= 2 EO cues issued
- [ ] At least 1 geometry estimate computed
- [ ] At least 1 fault event in timeline
- [ ] Degraded mode banner appears during fault
- [ ] Track counts match API response
- [ ] All 6 sensors appear on map
- [ ] WebSocket remains connected throughout
- [ ] No JavaScript errors in console
- [ ] Timeline events exceed 50 entries

### 10.3 Good Triangulation (SV-03)
- [ ] Geometry estimate has classification = confirmed_3d
- [ ] Intersection angle > 30 degrees
- [ ] Quality = "strong" or "acceptable"
- [ ] 3D position available in track detail
- [ ] Triangulation rays visible on map

### 10.4 Sensor Fault (SV-05)
- [ ] Fault event appears at expected time
- [ ] Degraded mode banner shows affected sensor
- [ ] Sensor marker gets yellow/red ring
- [ ] Registration health shows "degraded" or "unsafe"
- [ ] Fusion mode may change (conservative/basic)
- [ ] After fault clears: banner disappears, health recovers

---

## Appendix A: API Endpoint Reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Service health check |
| GET | `/api/scenarios` | List all scenarios |
| GET | `/api/scenario/status` | Current scenario state |
| POST | `/api/scenario/start` | Start simulation |
| POST | `/api/scenario/pause` | Pause simulation |
| POST | `/api/scenario/speed` | Set speed (0.1-100x) |
| POST | `/api/scenario/reset` | Reset (optionally switch) |
| POST | `/api/replay/seek` | Seek to time |
| GET | `/api/rap` | RAP snapshot |
| GET | `/api/tracks/:id` | Single track |
| GET | `/api/geometry/:id` | Geometry estimate |
| GET | `/api/events` | Recent events |
| GET | `/api/sensors` | All sensors |
| GET | `/api/sensors/:id/registration` | Registration state |
| GET | `/api/tasks` | All tasks |
| POST | `/api/operator/approve` | Approve task |
| POST | `/api/operator/reject` | Reject task |
| POST | `/api/operator/reserve` | Reserve sensor |
| GET | `/api/groups` | Unresolved groups |
| GET | `/api/groups/:id` | Single group |
| GET | `/api/eo-cues` | Active EO cues |
| GET | `/api/eo-tracks` | Recent EO tracks |
| WS | `/ws/events` | Real-time event stream |

## Appendix B: New Endpoints Required

| Method | Path | Purpose | For Feature |
|--------|------|---------|-------------|
| POST | `/api/scenarios/custom` | Save custom scenario | Scenario Editor |
| DELETE | `/api/scenarios/custom/:id` | Delete custom scenario | Scenario Editor |
| POST | `/api/scenario/inject-fault` | Live fault injection | Scenario Editor (live) |
| POST | `/api/scenario/inject-target` | Live target spawn | Scenario Editor (live) |
| GET | `/api/investigation/parameters` | Get algorithm parameters | Investigation Manager |
| POST | `/api/investigation/parameters` | Set algorithm parameters | Investigation Manager |
| POST | `/api/investigation/parameters/reset` | Reset to defaults | Investigation Manager |
| GET | `/api/investigation/active` | Active investigations | Investigation Manager |
| POST | `/api/investigation/force-resolve` | Force resolve group | Investigation Manager |

## Appendix C: Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| Space | Toggle play/pause | Not in text input |
| Left Arrow | Seek back 10s | Not in text input |
| Right Arrow | Seek forward 10s | Not in text input |
| Ctrl+D | Toggle demo/presenter mode | Always |
| Escape | Close panel / exit edit mode | Always |
| L | Toggle layer filter panel | Not in text input |
| T | Toggle timeline panel | Not in text input |

---

*End of document. This specification is the authoritative source for QA Agent test generation and V&V acceptance criteria.*
