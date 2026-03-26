## 13. Instructor Features

### 13.1 Scenario Editor

The scenario editor (accessed via the "Editor" button in the header) allows instructors to create and modify scenarios:

- **Sensor placement**: Add sensors from the sensor library, drag to position on the map. Set type (radar/EO/C4ISR), coverage parameters, altitude.
- **Target definition**: Add targets with waypoints. Use the target library to auto-fill RCS, IR emission, speed, and altitude. Define flight paths by clicking waypoints on the map.
- **Zone drawing**: Draw operational zones (green), exclusion zones (red), and threat corridors (orange) as polygons on the map.
- **Fault injection**: Define timed sensor faults (azimuth bias, clock drift, outage) with start/end times and magnitudes.
- **Save/Load**: Save custom scenarios to the server. Load predefined or custom scenarios.
- **Nicknames**: Assign human-readable nicknames to sensors and targets.

### 13.2 Deployment Planner

Optimize sensor placement for maximum coverage:

- **Grid-based scoring**: Evaluates detection coverage across the defense area
- **Predefined deployments**: discovery-squadron, border-line, forward-outpost
- **Sensor library picker**: Select sensor types from the 15-type library
- **Coverage analysis**: Visual overlay showing detection probability across the area
- **Load into editor**: Transfer deployment plan into the scenario editor for fine-tuning

### 13.3 Live Injection

Inject events mid-scenario via the "Live Inject" toolbar:

- **Target injection**: Add new targets during a running scenario with position, velocity, classification, RCS, and IR emission
- **Fault injection**: Trigger sensor faults in real-time (azimuth bias, clock drift, outage) with configurable duration
- **Toggle**: "Live Inject" button in the header activates the injection toolbar below the header

### 13.4 Report Generation

Generate PDF scenario reports via the "Report" button:

- **Report types**: Scenario summary, track analysis, sensor utilization, quality assessment
- **Time range selection**: Full scenario or custom time window
- **Content**: Track counts, detection statistics, EO investigation results, quality metrics
- **Format**: PDF generated server-side via pdfmake, downloaded to browser

### 13.5 User Management

Manage users via the "Users" page (instructor only):

- **Create users**: Username (3-64 alphanumeric + underscore), password (8-128 chars), role assignment
- **Delete users**: Remove user accounts (cannot delete self)
- **Role assignment**: instructor or operator
- **Password policy**: Minimum 8 characters, maximum 128 characters, hashed with bcryptjs (12 rounds)

### 13.6 Libraries Management

Access via "Libraries" button in the header:

- **Sensor Library**: 15 predefined sensor types (5 radar + 5 EO + 5 original). CRUD operations. Types include Green Pine, Iron Dome radar, MWIR staring, MWIR investigator, etc.
- **Target Library**: 52 target types with full IR/RCS data. Category filters (BM, ABT, fighters, helicopters, civilian, military transport). Each entry includes classification, RCS (m²), IR emission (W/sr), speed range, altitude range.
- **Scenario Library**: List all scenarios. Load, clone, export (JSON), or delete. Instructor-gated CRUD operations.

---

## 14. Operator Features

### 14.1 Track Investigation

- Click on any track marker to open the detail panel on the right
- Detail panel shows: position, velocity, altitude, confidence, status, contributing sensors, classification, EO investigation status
- Double-click a track to open the EO video popup (simulated MWIR imagery)

### 14.2 EO Cue

- Right-click a track → "Cue EO"
- The EO tasking engine assigns the nearest available investigator sensor
- Investigator gimbal slews to the target bearing at 60°/sec
- Enters DRI identification mode with 0.4° zoom FOV
- Dwell time: 15 seconds (configurable per sensor via operator override)

### 14.3 Classification

- Right-click track → "Classify" submenu
- Available types: `fighter_aircraft`, `civilian_aircraft`, `helicopter`, `uav`, `missile`, `rocket`, `unknown`, `neutral`, `bird`
- Operator classification overrides auto-classification (trajectory-based and EO-based)
- Classification is displayed in the track detail panel and affects EO tasking priority

### 14.4 Priority Override

- Right-click track → "Set Priority"
- Boosts the track's score in the EO tasking engine
- Prioritized tracks get EO investigator attention before lower-priority targets
- Multiple tracks can be prioritized simultaneously
- Priority status shown with visual indicator on the map

### 14.5 Sensor Lock

- Right-click an EO sensor → "Lock to Track" → select target track
- Locks the investigator to continuously track a specific target, bypassing automatic tasking
- The sensor maintains gimbal pointing on the locked target until released
- Right-click → "Release" to return sensor to automatic tasking pool

---

## 15. Keyboard Shortcuts & Tips

### 15.1 Map Controls

| Action | Control |
|--------|---------|
| Zoom in/out | Mouse scroll wheel |
| Pan | Click + drag |
| Box zoom | Ctrl + left-click + drag |
| Zoom to integer level | Integer zoom snap (prevents tile flickering) |

### 15.2 Operational Tips

- **Ground truth overlay**: Toggle the "GT" button in the header to compare system tracks against true target positions. Cyan diamonds show GT, with connecting lines to nearest system track.
- **Trajectory display**: Right-click a track → "Show Trajectory" to see its full flight path. Data is accumulated from scenario start regardless of when you toggle it.
- **High-speed operation**: At 5x or 10x speed, the display updates at 2 Hz. Pause before making precise selections to avoid click misses during re-renders.
- **Layer management**: Use the left panel to show/hide specific elements. "EO gimbal rays" shows where investigators are pointing. "Triangulation rays" shows bearing intersection geometry.
- **Search mode**: Investigators automatically enter sector scan after 3 seconds with no targets. The scan pattern is visible as a moving gimbal ray.
- **Formation discrimination**: EO staring sensors can resolve targets at 0.1° angular separation (~35m at 20 km). Radar merges targets closer than ~260m at 30 km (0.5° beam width).
- **Night operations**: MWIR sensors perform 10% better at night (thermal contrast improvement). Dawn/dusk shows 15% reduction (thermal crossover).

---

## 16. Troubleshooting

### 16.1 Map Not Rendering

- **Blank map**: Verify internet connectivity (CARTO tile server requires network access). Try toggling dark mode in the header.
- **White tile lines**: Known at fractional zoom levels. Tiles are slightly oversized (256.5px) to minimize gaps. Zoom to integer level to eliminate.
- **Browser compatibility**: Requires modern browser with Canvas 2D support. Chrome 90+, Firefox 90+, Edge 90+ recommended.

### 16.2 WebSocket Disconnection

- **Status**: WS connection indicator in the right panel (Online count)
- **Auto-reconnect**: Automatic after 3 seconds on disconnect
- **Fallback polling**: Active at 5-second intervals when WS is down. Deactivates when WS reconnects.
- **Firewall**: Ensure WebSocket protocol (ws:// or wss://) is not blocked

### 16.3 Tracks Not Appearing

- Verify scenario is running (state badge = "running" in green)
- Check layer visibility: left panel → Tracks → "Track icons" must be checked
- Check picture mode: "Radar Only" hides EO-only tracks, "EO Bearings" hides all tracks
- Targets may not be in sensor coverage yet (check scenario timeline)

### 16.4 Buttons Unresponsive

- At high speeds (5x/10x), the 2 Hz WS update rate may cause brief re-render lag
- Pause the scenario before clicking buttons for reliable interaction
- If persistent: refresh the browser page (Ctrl+Shift+R)
- Coverage polygon overlays use `pointer-events: none` and should not block clicks

### 16.5 EO Investigation Not Starting

- Verify at least one EO investigator sensor is online (right panel → Sensors → EO count)
- Check that the target is within EO detection range (depends on IR emission — see Chapter 8)
- The investigator may be locked to another target (right-click sensor → check lock status)
- Search mode takes 3 seconds to activate after idle — the investigator may be in transition

### 16.6 Classification Not Saving

- Requires either AUTH_ENABLED=false or a valid operator/instructor session
- Check browser console (F12) for 401/403 errors
- Ensure the track exists and is not in "dropped" status
- Valid classification types: fighter_aircraft, civilian_aircraft, helicopter, uav, missile, rocket, unknown, neutral, bird
