## 3. Map Display

The map display is the primary operational view of the ELOC2 workstation. It renders all tracks, sensors, coverage areas, EO geometry, and ground truth overlays on a geospatial tile map using the Leaflet (Canvas 2D) rendering engine. All visual elements are drawn as native Leaflet layers (markers, polylines, circles, and polygons), which reposition automatically during pan and zoom operations.

### 3.1 Base Map

**Tile Provider.** The default base map uses CARTO Dark Matter tiles, which provide a dark-themed cartographic background optimized for overlaying bright operational symbology. A dark/light toggle is available in the application header bar to switch between CARTO Dark Matter and a lighter tile set.

**Zoom and Navigation.**

- **Scroll wheel zoom:** Zoom in and out by scrolling. The zoom behavior is continuous (`zoomSnap: 0`) with an 80 ms debounce to coalesce rapid scroll events into smooth transitions.
- **Click-and-drag pan:** Left-click and drag to pan the map.
- **Box zoom (Ctrl+drag):** Hold Ctrl, then left-click and drag to draw a rectangle on the map. On release, the map zooms to fit the drawn rectangle. This works on all three maps (main, editor, deployment).
- **Zoom buttons:** Standard Leaflet zoom-in (+) and zoom-out (-) buttons are displayed in the top-left corner of the map.
- **Double-click zoom:** Double-click to zoom in one level centered on the click location.

**Map Coordinate System.** All positions use WGS-84 geographic coordinates (latitude/longitude in decimal degrees). Altitudes are expressed in meters above mean sea level.

### 3.2 Layer Panel (Left Side)

The Layer Filter Panel is positioned in the top-left corner of the map, overlaying the tile layer. It can be collapsed to a single "Layers" label by clicking the header, and expanded again by clicking the collapsed label. On mobile viewports (width < 768 px), the panel starts collapsed by default.

**Picture Mode** (radio buttons -- only one active at a time):

| Mode | Label | Effect |
|------|-------|--------|
| `all` | System picture | Shows all tracks and all layers (default) |
| `radar` | Radar only | Shows only radar-originated tracks; hides EO bearing and EO FOR layers |
| `eo_bearings` | EO bearings | Shows EO bearing rays only; hides radar coverage and radar tracks |
| `eo_3d` | EO 3D tracks | Shows only EO-triangulated 3D tracks; hides radar coverage |

**Master Toggle.** Below the picture mode selector, a "Show all / Hide all" toggle controls every layer checkbox at once.

**Layer Groups** (checkboxes -- multiple can be active simultaneously):

| Group | Layer | Key | Default |
|-------|-------|-----|---------|
| **Tracks** | Track icons | `tracks` | ON |
| | Track labels | `trackLabels` | OFF |
| | Uncertainty ellipses | `trackEllipses` | ON |
| **Sensors** | Sensor icons | `sensors` | ON |
| | Sensor labels | `sensorLabels` | OFF |
| **Coverage** | Radar coverage | `radarCoverage` | ON |
| | EO field of regard | `eoFor` | ON |
| | EO field of view | `eoFov` | ON |
| **EO** | EO gimbal rays | `eoRays` | ON |
| | Bearing observations | `bearingLines` | ON |
| | Triangulation rays | `triangulation` | ON |
| | Ambiguity markers | `ambiguityMarkers` | ON |
| **3D / Ballistic** | 3D track paths | `show3DOverlay` | OFF |
| | Ballistic estimates | `ballisticEstimates` | ON |
| **Symbology** | NATO APP-6 symbols | `useNatoSymbols` | ON |

Each checkbox is rendered with a colored indicator matching its layer's primary color. The label text dims when the layer is toggled off.

### 3.3 Track Symbols

Track markers represent system tracks -- fused estimates of target positions derived from one or more sensor observations.

**Standard Symbology (when NATO APP-6 is OFF):**

- **Circle** -- Single-sensor track. A 12 px filled circle with a 2 px white border. Fill color indicates track status (see color table below).
- **Diamond** -- Multi-sensor fused track. A 12 px filled square rotated 45 degrees, colored cyan (`#00ffcc`) with a white border. Appears when three or more sensors contribute to a multi-sensor resolution.

**NATO APP-6 Symbology (when NATO APP-6 is ON):**

When the NATO APP-6 symbols toggle is enabled, track markers are replaced with standard NATO tactical symbols rendered as inline SVG. The symbol shape and fill are determined by the track's affiliation and classification using the `resolveTrackSymbol()` function. Symbol size is 24 px.

**Track Status Colors:**

| Status | Color | Hex Code | Meaning |
|--------|-------|----------|---------|
| Confirmed | Green | `#00cc44` | Track has received 3 or more correlated updates |
| Tentative | Yellow | `#ffcc00` | Track has fewer than 3 updates; not yet confirmed |
| Dropped | Red | `#ff3333` | Track has missed 8 or more consecutive update cycles |

**Convergence Ring.** Tracks that have achieved EO convergence (triangulated from multiple EO sensors) display a green (`#00cc44`) ring around the track marker. The ring diameter is 18 px for standard symbols or 28 px for NATO symbols.

**Heading Indicator.** Each track with a non-zero velocity displays a heading line extending from the marker in the direction of travel. The line length scales with speed. Along the heading line, small filled dots indicate the speed class:

| Speed Range | Dot Count |
|-------------|-----------|
| < 50 m/s | 1 dot |
| 50 -- 200 m/s | 2 dots |
| 200 -- 500 m/s | 3 dots |
| > 500 m/s | 4 dots |

**Track Labels.** When the "Track labels" layer is enabled, a monospace label appears to the upper-right of each marker. The label format is:
- `STK-001` for human-readable track IDs
- `T<number>` for legacy UUID-based track IDs
- If an identification support classification is present (and not "unknown" or "none"), it is appended after a space (e.g., `STK-001 BM`).

**Trail Breadcrumbs.** Each track retains a history of past positions. When trails are active, the last several positions are rendered as small fading dots along the track's recent path. The newest dot includes a brief flash animation (`trail-flash`, 0.8 s ease-out) to highlight recent movement.

**Uncertainty Ellipses.** When the "Uncertainty ellipses" layer is enabled, a translucent ellipse is drawn around each track marker representing the position estimate uncertainty from the fusion covariance matrix.

**Interaction:**
- **Click** a track marker to select it and open the Track Detail Panel on the right side.
- **Right-click** a track marker to open a context menu with actions (investigate, mark priority, classify).
- **Double-click** a track marker to open the EO Video Popup for that track.
- When multiple tracks or sensors overlap at the click location, a disambiguation popup appears listing all candidates. Click a candidate in the popup to select it.

### 3.4 Sensor Symbols

Sensor markers represent physical sensor installations (radars, EO cameras, C4ISR systems). Only online sensors are displayed.

**Symbol Types:**

| Sensor Type | Symbol | Color | Description |
|-------------|--------|-------|-------------|
| Radar | Filled square | Blue `#4488ff` | 14 px filled square with black border |
| EO staring | Concentric rings | Orange `#ff8800` | Double circle (16 px outer ring, 8 px inner filled dot). Staring sensors have a gimbal slew rate of 0 deg/s |
| EO investigator | Filled square | Orange `#ff8800` | 14 px filled square with black border. Investigator (gimbal) EO sensors have a non-zero slew rate |
| C4ISR | Filled square | Purple `#aa44ff` | 14 px filled square with black border |

When NATO APP-6 symbols are enabled, sensor markers use the `resolveSensorSymbol()` function to render standard NATO equipment symbols.

**Sensor Labels.** When the "Sensor labels" layer is enabled, a short monospace label appears next to each sensor:
- Radar: `R<number>` (e.g., R1, R2)
- EO staring: `S<number>` (e.g., S1, S2)
- EO investigator: `E<number>` (e.g., E1, E2)
- C4ISR: `C<number>` (e.g., C1, C2)

**Gimbal Ray.** When the "EO gimbal rays" layer is enabled and an EO sensor has an active gimbal pointing direction, an orange dashed line extends from the sensor position outward along the gimbal azimuth to the sensor's maximum detection range.

**Interaction:**
- **Click** a sensor marker to select it and view sensor details in the right panel.
- **Right-click** a sensor marker to open a context menu.
- **Hover** over a sensor marker to display a tooltip with the short label and full sensor ID.

### 3.5 Coverage Visualization

Coverage layers show the detection envelopes of each sensor. All coverage shapes are non-interactive (clicks pass through to the map or underlying markers).

**Radar Coverage:**
- Rendered as a filled sector polygon (or full circle for 360-degree radars).
- Fill color: blue (`#4488ff`) at 8% opacity.
- Outline: blue at 35% opacity, 1.5 px weight.
- The sector extends from the sensor position to the sensor's maximum detection range, spanning from the minimum to maximum azimuth of the radar's coverage definition.
- Hidden when picture mode is set to "EO bearings" or "EO 3D tracks."

**EO Field of Regard (FOR):**
- Rendered as an unfilled sector polygon with a dashed outline.
- Outline color: orange (`#ff8800`) at 50% opacity, 1.5 px weight, dash pattern 4 px on / 4 px off.
- Represents the full mechanical scanning limits of the EO sensor.
- Hidden when picture mode is set to "Radar only."

**EO Field of View (FOV):**
- Rendered as a filled sector cone showing the current gimbal pointing direction.
- Fill color: orange (`#ff8800`) at 25% opacity.
- Outline: orange at 60% opacity, 1 px weight.
- The cone half-angle matches the sensor's horizontal FOV specification.
- Only drawn for gimbal (non-staring) EO sensors. Staring sensors display their coverage via the EO FOR layer instead.

**FOV Overlap Regions:**
- When two or more EO sensor FOVs overlap, the intersection area is highlighted.
- Three or more overlap vertices: rendered as a yellow polygon (fill `rgba(255,255,0,0.1)`, outline `rgba(255,255,0,0.4)`, dashed).
- Two overlap vertices: rendered as a yellow circle marker (radius 6 px, fill `rgba(255,255,0,0.3)`).
- Overlap regions are only drawn when the "EO field of view" layer is enabled.

### 3.6 Ground Truth Overlay

The ground truth overlay displays the actual simulated target positions, allowing instructors to compare fused track estimates against true target locations. This overlay is restricted to the instructor role.

**Activation.** Toggle the overlay using the "GT" button in the application header bar. When active, the button highlights with a cyan (`#00ffff`) border and tinted background. Activating ground truth hides all fused track markers to avoid visual clutter -- only ground truth markers and sensor markers remain visible.

**Target Markers:**
- Each active ground truth target is rendered as a cyan (`#00ffff`) diamond (rotated square), 14 px with a 2 px white border.
- Selected targets enlarge to 18 px with a 3 px white border and a cyan glow effect (`box-shadow: 0 0 12px #00ffff`).

**Selection Ring.** When a ground truth target is selected, a 32 px pulsing cyan ring animates around the marker (`pulse-ring` animation, 1.5 s ease-in-out infinite loop).

**GT-to-Track Connection.** When a ground truth target is selected and a fused track exists within 5,000 m, a dashed connecting line is drawn between them:
- Green (`#00cc44`) dashed line if the distance is less than 500 m (good track accuracy).
- Yellow (`#ffcc00`) dashed line if the distance is 500 -- 2,000 m (moderate accuracy).
- Red (`#ff3333`) dashed line if the distance is 2,000 -- 5,000 m (poor accuracy).
- A distance label appears at the midpoint of the line (e.g., "342m" or "1.85km").

**Name and Classification Labels:**
- The target name appears in bold cyan monospace text to the upper-right of the marker.
- If a classification is assigned, it appears below the name in a slightly darker cyan (`#00cccc`).

**Trail Lines.** Ground truth targets display trail history as:
- A thin cyan polyline (1.5 px, 70% opacity) connecting past positions.
- Small cyan circle markers at each historical position.

**Altitude Labels.** When altitude data is available, a dashed cyan line extends vertically from the target with an altitude label (e.g., "ALT 3.2km").

**Interaction:**
- **Click** a ground truth target to select it and view its details.
- **Right-click** to open a context menu.
- **Hover** to display a tooltip showing the target name and classification.
