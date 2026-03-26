## 4. Scenario Controls

All scenario controls are located in the header bar, arranged left to right: scenario selector, start/pause, reset, speed buttons, elapsed timer, and state badge. Controls marked **(instructor only)** are hidden or disabled for operator-role users.

### 4.1 Start / Pause / Resume

The primary simulation control is a single toggle button that changes label and color based on the current simulation state:

| State | Button Label | Color | Action |
|-------|-------------|-------|--------|
| Idle | **Start** | Green (`#00aa44`) | Begins the scenario from t=0 |
| Running | **Pause** | Red (`#cc3300`) | Freezes the simulation; all tracks hold position |
| Paused | **Resume** | Green (`#00aa44`) | Continues from the paused timestamp |

**Access**: Instructor only. The button is visible to operators but rendered at 35% opacity with `cursor: not-allowed`.

**Behavior**: The UI updates optimistically on click -- the button label changes immediately before the server confirms the state transition. The backend sends a final WebSocket broadcast with `running: false` on pause, ensuring all connected clients synchronize.

**State machine**: The simulation follows a five-state machine (`idle` -> `loading` -> `running` -> `paused` -> `completed`). The start/pause button is only active when the allowed actions for the current state include `start`, `resume`, or `pause`. If no valid action is available, the button appears at 40% opacity and clicks are ignored.

### 4.2 Speed Control

Four speed buttons are displayed inline: **1x**, **2x**, **5x**, **10x**. The currently active speed is highlighted with a blue background (`#4a9eff`) and white text; inactive buttons use dark gray (`#333`) with muted text (`#aaa`).

**Access**: Instructor only.

**How it works**: The internal simulation pipeline always runs at a fixed 15 Hz tick rate. Speed control adjusts the wall-clock interval between ticks. At 1x, one second of scenario time passes per second of real time. At 10x, ten seconds of scenario time pass per real second. The server enforces a broadcast throttle of 4 messages per second when speed exceeds 2x, preventing WebSocket saturation.

| Speed | Scenario time per real second | Broadcast rate |
|-------|-------------------------------|---------------|
| 1x | 1 s | Up to 15/s |
| 2x | 2 s | Up to 15/s |
| 5x | 5 s | Throttled to 4/s |
| 10x | 10 s | Throttled to 4/s |

### 4.3 Reset

The **Reset** button returns the scenario to t=0. It is only enabled when the state machine allows the `reset` action (available from `running`, `paused`, or `completed` states). When disabled, the button appears at 40% opacity.

**Access**: Instructor only.

**What reset clears**:
- All system tracks, sensor states, and EO tracks
- Geometry estimates and triangulation data
- Event log and timeline history
- Track trails and trajectory toggles
- Operator overrides (priority, locks, classifications)
- Simulation clock returns to `T+00:00`
- State badge returns to `idle`

**What reset preserves**:
- The currently selected scenario
- Sensor deployment configuration
- User session and role
- UI preferences (dark mode, panel sizes)

### 4.4 Scenario Selection

A dropdown selector appears in the header when scenarios are available. It displays the scenario name and is populated from the server's scenario library on initial WebSocket connection.

**Access**: Instructor only. Operators see the dropdown but cannot interact with it (`opacity: 0.35`, `cursor: not-allowed`). Maximum display width is 180px; longer names are truncated with ellipsis.

**Available scenarios**:

| Scenario | Duration | Description |
|----------|----------|-------------|
| Green Pine Defense | 60 min | Multi-sensor radar + EO defense, ballistic and air-breathing targets |
| EO Advantage Demo | 15 min | EO-focused demonstration with cueing and triangulation |
| EO Staring Defense | 60 min | 19-sensor staring EO array, no radar |
| Central Israel | 60 min | Regional defense scenario with mixed threats |
| Ballistic | 30 min | Ballistic missile launches with boost/midcourse/terminal phases |
| Drone Swarm | 30 min | Multiple small UAV tracks, dense multi-target environment |
| Grad Barrage | 15 min | Rocket artillery barrage with high target count |
| Combined | 60 min | Mixed threat types: ballistic, air-breathing, UAVs, rockets |
| Fusion Demo | 30 min | Demonstrates fusion modes: centralized, conservative, confirmation |
| Green Pine Sorties | 60 min | Per-sortie variant with individual aircraft groups |

**Switching scenarios**: Selecting a new scenario from the dropdown triggers a reset (`POST /api/scenario/reset` with the new `scenarioId`). All tracks and state are cleared, and the new scenario loads in idle state. The simulation does not auto-start; the instructor must press Start.

### 4.5 Timeline

The timeline panel is displayed at the bottom of the workstation view. It provides a scrollable, time-indexed event log and a horizontal progress bar.

**Elapsed timer**: A monospace counter in the header shows elapsed scenario time in `T+MM:SS` format (e.g., `T+04:32`). This updates in real time during simulation and holds steady when paused.

**Event log**: Events are listed chronologically with color-coded type badges. Each entry shows the event type (shortened to the last two segments, e.g., `track.confirmed`) and a summary.

**Event type colors**:

| Event Type | Color | Hex |
|------------|-------|-----|
| Observations (`source.observation.reported`) | Blue | `#4488ff` |
| EO Cues (`eo.cue.issued`) | Orange | `#ff8800` |
| EO Reports (`eo.report.received`) | Orange | `#ff8800` |
| EO Bearings (`eo.bearing.measured`) | Amber | `#ffaa33` |
| Track Confirmed (`system.track.updated`) | Green | `#00cc44` |
| Correlation (`correlation.decided`) | Teal | `#44ccaa` |
| Geometry (`geometry.estimate.updated`) | Yellow | `#ffcc00` |
| Faults (`fault.started`) | Red | `#ff3333` |
| Fault Cleared (`fault.ended`) | Green | `#00cc44` |
| Registration (`registration.state.updated`) | Purple | `#aa44ff` |
| Task Decided (`task.decided`) | Pink | `#ff6699` |
| Scenario events (`scenario.started`, `.paused`, `.reset`) | Blue/Yellow/Gray | Various |
| Operator actions (`operator.action`) | Purple | `#aa44ff` |

**Filtering**: Event type toggles allow filtering the log to show only specific categories. Filter state is maintained in the UI store.

**Scrubbing**: When the simulation is paused, clicking on the timeline progress bar seeks to that point. The timeline position updates optimistically for responsive feel. Scrubbing is disabled during active simulation to avoid conflicts with the live data stream.

### 4.6 State Badge

A compact badge in the header displays the current simulation state using uppercase text with a colored background and border:

| State | Text Color | Background | Border |
|-------|-----------|------------|--------|
| `RUNNING` | `#00cc44` (green) | `#00aa4422` | `#00cc4444` |
| `PAUSED` | `#ffcc00` (yellow) | `#ffcc0022` | `#ffcc0044` |
| `IDLE` | `#888` (gray) | `#88888822` | `#88888844` |

The badge uses 9px bold uppercase text with 0.5px letter spacing. It updates in real time as the simulation state machine transitions between states. The `loading` and `completed` states also display when applicable, using the same gray styling as `idle`.

---

## 5. Track Management

### 5.1 Track Lifecycle

Tracks progress through a defined lifecycle managed by the TrackManager. Two modes are available: legacy hit-count mode and Bayesian existence-probability mode. The active mode depends on the `enableExistence` configuration flag.

**Bayesian existence mode** (default for distributed pipeline):

| State | Entry Condition | Visual Color | Description |
|-------|----------------|--------------|-------------|
| **Candidate** | New observation, no existing correlation | -- | Initial state; not yet displayed on map |
| **Tentative** | Existence probability (Pe) >= 0.5 | Yellow (`#ffcc00`) | Probable target; shown with dashed indicator |
| **Confirmed** | Pe >= 0.8 | Green (`#00cc44`) | High-confidence target; solid indicator |
| **Coasting** | Consecutive misses >= coastingMissThreshold (default 3) | Gray (`#888`) | No recent updates; predicted position shown |
| **Dropped** | Pe < 0.1 or max coasting time exceeded (15s default) | Red (`#ff3333`) | Track removed from active display |

**Legacy hit-count mode**:

| State | Entry Condition | Visual Color |
|-------|----------------|--------------|
| **Tentative** | New observation creates track | Yellow (`#ffcc00`) |
| **Confirmed** | 3 consistent updates (`confirmAfter`) | Green (`#00cc44`) |
| **Dropped** | 5 consecutive misses (`dropAfterMisses`) | Red (`#ff3333`) |

**Target-category-specific thresholds**: Ballistic missiles use aggressive coasting (2 misses), air-breathing targets use moderate coasting (3 misses), and slow movers (helicopters, UAVs) use generous coasting (4 misses). These profiles are defined in `target-category-profiles.ts`.

**Track pruning**: Dropped tracks are automatically removed from memory after a retention period to prevent memory leaks. This applies to the TrackManager, EoTrackManager, and SystemFuser.

### 5.2 Selecting a Track

Click on any track marker on the map to select it. The track detail panel opens on the right side of the workstation.

**Click handling**: Clicks are collected with a 120ms debounce window. This serves two purposes:
1. It allows the system to collect multiple overlapping click targets when markers are close together.
2. It survives re-renders at the 2 Hz WebSocket update rate without dropping clicks.

**Single target**: If only one object is under the click point, it is selected immediately and the detail panel opens.

**Disambiguation**: If multiple objects overlap (tracks, sensors, or ground truth targets), a disambiguation popup appears at the click location. The popup lists all candidates with colored indicators matching their type. Click on a row to select that specific object.

**Double-click**: Double-clicking a track marker opens the EO Video popup for that track (see Section 8).

**Tooltip**: Hovering over any track marker shows a tooltip with the short track label and status (e.g., `STK-001 -- confirmed`).

### 5.3 Track Detail Panel

The track detail panel appears in the right sidebar when a track is selected. It displays comprehensive information organized into collapsible sections.

**Header**: Shows the system track ID (e.g., `STK-001`) with a close button.

**Status section**:
- **Track Status**: Badge showing `confirmed`, `tentative`, or `dropped` with corresponding color
- **Confidence**: Percentage value (e.g., `87.3%`) derived from existence probability or hit-count ratio
- **EO Investigation**: Badge showing `confirmed`, `in_progress`, `pending`, `no_support`, or `split_detected`
- **Last Updated**: Timestamp of most recent sensor update

**Actions section**:
- **Center**: Centers the map view on this track's current position
- **Investigate**: Boosts EO tasking priority for this track (disabled if EO investigation is already `in_progress`)
- **Mark Priority**: Marks the track as high-priority for EO observation scheduling

**Position section**:
- **Lat / Lon**: Decimal degrees to 4 decimal places
- **Alt**: Altitude in meters, with thousands separator

**Velocity section** (shown when velocity data is available):
- **Vx (East)**: East component in m/s
- **Vy (North)**: North component in m/s
- **Vz (Up)**: Vertical component in m/s

**Geometry section** (shown when triangulation data exists):
- Triangulation quality score
- Number of contributing bearings
- Intersection angle
- Position uncertainty estimate

**Fusion mode**: Displays the dominant fusion mode for this track's contributing sensors -- Centralized (green), Conservative (yellow), or Confirmation Only (orange).

**Sources**: Lists all sensor IDs contributing to this track.

**Classification**: Current classification label, if assigned.

**Lineage**: Chronological history of track state changes (creation, promotion, confirmation, merges).

**Enriched dossier**: When a track is selected, the panel fetches an enriched dossier from `GET /api/tracks/:trackId` containing:
- **Evidence Chain**: Sensor observations, correlation decisions, and fusion events
- **Investigation History**: EO cue history, investigation outcomes, and EO track associations
- **Threat Assessment**: Threat level, engagement recommendations, and classification confidence

The dossier refreshes automatically every 5 seconds while the track is selected.

### 5.4 Context Menu (Right-Click)

Right-clicking on any map object opens a dark-themed context menu popup anchored to the click location. The menu header shows the object label, followed by a list of actions. Hover highlights rows in dark gray (`#333`).

**Track context menu**:

| Action | Description |
|--------|-------------|
| Select | Opens the track detail panel for this track |
| Show/Hide Trajectory | Toggles full flight path polyline display |
| Cue EO | Sends operator priority cue to boost EO tasking (toggles off if already active; shows checkmark when active) |
| Set Priority | Sets the track to high priority for EO scheduling |
| Open EO Video | Opens the EO video popup with simulated camera feed |
| -- Classify -- | Separator heading for classification submenu |
| Fighter | Classifies as `fighter_aircraft` |
| Helicopter | Classifies as `helicopter` |
| UAV / Drone | Classifies as `uav` |
| Small UAV | Classifies as `small_uav` |
| Missile | Classifies as `missile` |
| Civilian | Classifies as `civilian_aircraft` |
| Friendly | Classifies as `ally` |
| Neutral | Classifies as `neutral` |
| Unknown | Classifies as `unknown` |

**Sensor context menu**:

| Action | Description |
|--------|-------------|
| Select | Opens the sensor detail view |
| Turn On/Off | Toggles sensor online/offline state |
| Release Sensor | Releases sensor from current tasking assignment |
| Start/Stop Search | (EO sensors only) Toggles autonomous search mode |
| Sector Scan... | (EO gimbal sensors only) Opens sector scan configuration |
| Stop Sector Scan | (EO gimbal sensors only, shown when scan is active) Stops active sector scan |

**Ground truth context menu**:

| Action | Description |
|--------|-------------|
| Select | Opens the ground truth detail panel |
| Show/Hide Trajectory | Toggles ground truth flight path polyline |

**Security**: All label text in context menus is sanitized through `escapeHtml()` to prevent XSS injection.

### 5.5 Trajectory Display

Trajectory display has two modes controlled independently per track:

**Breadcrumb trails** (always visible for active tracks): Up to 10 fading breadcrumb dots showing recent past positions. These are rendered automatically for all confirmed and tentative tracks without user action.

**Full trajectory** (toggled via context menu): When "Show Trajectory" is selected from the right-click menu, the full flight path polyline is drawn on the map. This includes up to 2000 stored positions. The polyline uses the track's status color.

- **Track data accumulation**: Position history is always recorded regardless of whether the trajectory polyline is visible. Enabling trajectory display reveals all previously accumulated positions.
- **Ground truth trajectories**: Ground truth targets also support trajectory display via their context menu. GT trajectories use cyan (`#00ffff`) coloring to distinguish them from system track paths.
- **Toggle behavior**: The context menu label changes between "Show Trajectory" and "Hide Trajectory" based on current state. The toggle state is stored in the UI store (`trajectoryTrackIds` set) and persists until reset.

### 5.6 Classification

Operators can classify tracks through two methods:

**Context menu classification**: Right-click a track and select from the classification submenu. Available types:

| Classification | API Value | Description |
|---------------|-----------|-------------|
| Fighter | `fighter_aircraft` | Military fixed-wing combat aircraft |
| Helicopter | `helicopter` | Rotary-wing aircraft |
| UAV / Drone | `uav` | Unmanned aerial vehicle (standard) |
| Small UAV | `small_uav` | Small unmanned aerial vehicle (low RCS) |
| Missile | `missile` | Guided missile (ballistic or cruise) |
| Civilian | `civilian_aircraft` | Non-military fixed-wing aircraft |
| Friendly | `ally` | Identified friendly asset |
| Neutral | `neutral` | Identified non-hostile |
| Unknown | `unknown` | Resets classification to unidentified |

**API endpoint**: All classification changes are sent via `POST /api/operator/classify` with the track ID and classification string. The classification is applied immediately and broadcast to all connected clients on the next RAP update.

**Auto-classification**: The system may automatically classify tracks based on radar cross-section (RCS), speed profile, altitude behavior, and IR emission characteristics. Operator classification always overrides automatic classification.

**Visual indicator**: Classified tracks display their classification in the track detail panel and in the tooltip shown on hover. NATO APP-6 symbology on the map also updates to reflect the assigned classification when applicable.
