# ELOC2 Symbology & Icon Reference

Complete reference for all target and sensor icons used in the workstation map, including default mode, NATO APP-6D mode, and EO video popup silhouettes.

## Source Files
- `apps/workstation/src/map/DebugOverlay.tsx` — Default (non-NATO) marker rendering
- `apps/workstation/src/map/symbols/nato-symbols.ts` — NATO APP-6D SVG generators
- `apps/workstation/src/map/symbols/symbol-resolver.ts` — Classification → symbol mapping
- `apps/workstation/src/map/EoVideoPopup.tsx` — EO video popup silhouettes

---

## 1. Target Icons — Default Mode (no NATO)

All tracks are rendered as circles with a white border. Multi-sensor-resolved tracks use a diamond shape.

| Track Status | Shape | Color | Notes |
|---|---|---|---|
| Confirmed | Filled circle (12px), 2px white border | `#00cc44` green | Standard confirmed track |
| Tentative | Filled circle (12px), 2px white border | `#ffcc00` yellow | Below 3-update threshold |
| Dropped | Filled circle (12px), 2px white border | `#ff3333` red | Missed >8 updates |
| Multi-sensor resolved | Filled diamond (12px, 45° rotated), 2px white border | `#00ffcc` cyan | ≥3 sensors, multi-sensor method |

### Track Labels
- Format: `T<number>` (e.g., `T1`, `T2`)
- Font: 9px monospace, white with black text-shadow
- Extracted from numeric portion of `systemTrackId`

---

## 2. Target Icons — NATO APP-6D Mode

NATO symbols combine an **affiliation frame** (shape) with a **type modifier** (internal icon).

### Affiliation Frames

| Affiliation | Shape | Fill | Stroke | When Used |
|---|---|---|---|---|
| Hostile | Diamond (rotated square) | Semi-transparent red | `#ff3333` | Confirmed tracks, fighter/military classification |
| Unknown | Rounded rectangle (quatrefoil) | Semi-transparent yellow | `#ffcc00` | Tentative tracks, `unknown`/`neutral` classification |
| Assumed Friend | Rectangle | Semi-transparent blue | `#4488ff` | `ally` classification |
| Pending | Circle | Semi-transparent yellow | `#ffcc00` | Dropped tracks, no classification |

### Type Modifiers (Internal Icons)

| Modifier | Icon Description | Classifications |
|---|---|---|
| Fighter | Airplane silhouette: vertical fuselage line + horizontal wing line + short tail line | `fighter_aircraft`, `civilian_aircraft`, `passenger_aircraft`, `light_aircraft` |
| UAV | Quad-rotor: diagonal X cross + 4 small dashed circles at ends | `uav`, `small_uav`, `drone` |
| Helicopter | Rotor line with center hub circle + vertical body + horizontal skids | `helicopter` |
| Missile | Upward arrow: vertical line + chevron tip + short base line | `missile`, `rocket`, `predator` |
| Unknown | Question mark `?` in monospace font | `unknown`, `neutral`, `ally`, `bird`, `birds` |

### Classification → Symbol Mapping

| Classification | Track Type | Default Affiliation |
|---|---|---|
| `fighter_aircraft` | fighter | hostile (confirmed) / unknown (tentative) |
| `civilian_aircraft` | fighter | hostile (confirmed) / unknown (tentative) |
| `passenger_aircraft` | fighter | hostile (confirmed) / unknown (tentative) |
| `light_aircraft` | fighter | hostile (confirmed) / unknown (tentative) |
| `helicopter` | helicopter | hostile (confirmed) / unknown (tentative) |
| `uav` | uav | hostile (confirmed) / unknown (tentative) |
| `small_uav` | uav | hostile (confirmed) / unknown (tentative) |
| `drone` | uav | hostile (confirmed) / unknown (tentative) |
| `missile` | missile | hostile (confirmed) / unknown (tentative) |
| `rocket` | missile | hostile (confirmed) / unknown (tentative) |
| `predator` | missile | hostile (confirmed) / unknown (tentative) |
| `ally` | unknown | assumed_friend |
| `neutral` | unknown | unknown |
| `unknown` | unknown | unknown |
| `bird` / `birds` | unknown | unknown |

---

## 3. Sensor Icons — Default Mode (no NATO)

| Sensor Type | Shape | Size | Color | Label Prefix |
|---|---|---|---|---|
| Radar | Filled square, 2px black border | 14×14 px | `#4488ff` blue | `R` |
| EO Investigator (gimbal, slewRate > 0) | Filled square, 2px black border | 14×14 px | `#ff8800` orange | `E` |
| EO Staring (MWIR, slewRate = 0) | Concentric rings: outer ring + inner filled dot | 16×16 px | `#ff8800` orange | `S` |
| C4ISR | Filled square, 2px black border | 14×14 px | `#aa44ff` purple | `C` |
| Any sensor (offline) | Same shape as above, greyed out | same | `#555555` grey | same |

### Sensor Labels
- Format: `<prefix><number>` (e.g., `R1`, `E2`, `S3`, `C1`)
- Number extracted from numeric portion of `sensorId`
- Font: bold 10px monospace, sensor color with black text-shadow

### Visual Overlays by Sensor Type

| Overlay | Radar | EO Gimbal | EO Staring | C4ISR |
|---|---|---|---|---|
| Coverage circle/arc | Blue filled polygon, 8% opacity | Orange dashed outline | Orange dashed outline | None shown |
| FOV cone | N/A | Orange filled sector, 25% opacity | **None** (staring — no cone) | N/A |
| Gimbal ray | N/A | Orange dashed line to target | **None** (no gimbal movement) | N/A |
| Search sweep | N/A | Blue dashed line (when active) | **None** | N/A |

---

## 4. Sensor Icons — NATO Mode

All sensors use a rounded rectangle frame with the sensor color fill (30% opacity) and 2px stroke.

| Sensor Type | Modifier Icon | Description | Color |
|---|---|---|---|
| Radar | Radar dish | Vertical mast + 2 concentric arc lines (radiating outward) | `#4488ff` blue |
| EO Gimbal | Camera lens | Small circle (pupil) + dot (iris) inside rectangle (housing) | `#ff8800` orange |
| EO Staring | Wide-angle lens | Wide arc (lens) + rectangle base + center dot | `#ff8800` orange |
| C4ISR | Antenna | Vertical mast + circle (hub) + 2 radiating wave arcs | `#aa44ff` purple |

### NATO Sensor Selection
- Selected sensors get a white dashed rectangle around the frame

---

## 5. EO Video Popup Silhouettes

The EO video popup shows a classification-based silhouette image (280×160 px) rendered as SVG line art on a dark background (`#0d0d1a`). Images are displayed only after an EO investigation (`confirmed` or `in_progress`), using the ground truth classification for the image.

| Classification Group | Silhouette | Accent Color | Background |
|---|---|---|---|
| Aircraft (`fighter_aircraft`, `civilian_aircraft`, `passenger_aircraft`, `light_aircraft`) | Top-down airplane: ellipse fuselage + horizontal wings + tail line + engine dot | `#33ff66` green | `#0d0d1a` |
| Drone (`drone`, `uav`, `small_uav`) | Quad-rotor: center rectangle body + 4 diagonal arms + 4 dashed prop circles | `#33ff66` green | `#0d0d1a` |
| Helicopter | Side-view: ellipse body + tail boom + rotor blade line + hub circle + skids | `#33ff66` green | `#0d0d1a` |
| Missile (`missile`, `rocket`) | Missile body: rounded rectangle + nose cone triangle + 2 fins + 3 exhaust lines | `#ff4444` red | `#0d0d1a` |
| Unknown (any unrecognized) | Dashed circle + inner dot + `?` text | `#ffcc00` yellow | `#0d0d1a` |

### Popup Layout
- **Position**: 60px right and 80px above the track marker
- **Size**: 280×200 px
- **Leader line**: Dashed SVG line from popup bottom-center to track position
- **Header**: Status dot (green if classified, orange if unknown) + "EO FEED" label + track ID
- **Footer**: Classification badge (color-coded) + confidence percentage
- **Close button**: `x` button in header

---

## 6. Context Menu Actions

Right-click on any map object opens a context menu. All actions are available to all users (no role restrictions).

### Track Context Menu

| Action | Description | API Endpoint |
|---|---|---|
| Select | Select and focus the track | UI state only |
| Cue EO | Add to operator priority set (boost EO tasking score) | `POST /api/operator/priority` |
| Set Priority | Set track priority to high | `POST /api/operator/set-priority` |
| Open EO Video | Show EO video popup (disabled if no EO investigation) | UI state only |
| ── Classify ── | Separator header | — |
| • Fighter | Classify as `fighter_aircraft` | `POST /api/operator/classify` |
| • Helicopter | Classify as `helicopter` | `POST /api/operator/classify` |
| • UAV / Drone | Classify as `uav` | `POST /api/operator/classify` |
| • Small UAV | Classify as `small_uav` | `POST /api/operator/classify` |
| • Missile | Classify as `missile` | `POST /api/operator/classify` |
| • Civilian | Classify as `civilian_aircraft` | `POST /api/operator/classify` |
| • Friendly | Classify as `ally` | `POST /api/operator/classify` |
| • Neutral | Classify as `neutral` | `POST /api/operator/classify` |
| • Unknown | Classify as `unknown` | `POST /api/operator/classify` |

### Sensor Context Menu

| Action | Description | API Endpoint |
|---|---|---|
| Select | Select and focus the sensor | UI state only |
| Turn Off / Turn On | Toggle sensor online/offline state | `POST /api/operator/toggle-sensor` |
| Release Sensor | Release a locked sensor back to auto | `POST /api/operator/release-sensor` |
| Toggle Search Mode | Toggle EO search sweep mode | `POST /api/operator/toggle-search` |

### Ground Truth Context Menu

| Action | Description |
|---|---|
| Select | Select and focus the GT target |

---

## 7. Color Palette Reference

### Track Status Colors
| Status | Hex | Usage |
|---|---|---|
| Confirmed | `#00cc44` | Default track, badges |
| Tentative | `#ffcc00` | Default track, badges |
| Dropped | `#ff3333` | Default track, badges |

### Sensor Type Colors
| Type | Hex | Usage |
|---|---|---|
| Radar | `#4488ff` | Marker, coverage, label |
| EO (gimbal + staring) | `#ff8800` | Marker, coverage, FOV, rays, label |
| C4ISR | `#aa44ff` | Marker, label |

### EO Investigation Badge Colors
| Status | Hex |
|---|---|
| In progress | `#4a9eff` |
| Confirmed | `#00cc44` |
| Split detected | `#ff3333` |
| No support | `#ff8800` |

### NATO Affiliation Colors
| Affiliation | Hex |
|---|---|
| Hostile | `#ff3333` |
| Unknown | `#ffcc00` |
| Assumed Friend | `#4488ff` |
| Pending | `#ffcc00` |
