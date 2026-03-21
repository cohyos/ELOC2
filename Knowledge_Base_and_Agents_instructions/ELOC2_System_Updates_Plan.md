# ELOC2 System Updates — Implementation Plan & Status

**Date**: 2026-03-20
**Branch**: `claude/review-knowledge-base-FTTzx`

---

## Phase 0 — Bug Fixes (COMPLETE)

| Task | Status | Details |
|------|--------|---------|
| BF-1: Report download | DONE | Fixed pdfmake font paths (used vfs_fonts.js instead of actual Roboto TTF files). Added error display in modal. |
| BF-3: Map first-click | DONE | Removed 500ms setTimeout on map instance handoff to DebugOverlay. Click handlers now available immediately. |
| BF-4: Refresh rates | DONE | EO tasking: 5s→3s. Fallback polling: 10s→5s. |

## Phase 1 — Map & UI (COMPLETE)

| Task | Status | Details |
|------|--------|---------|
| UI-1: Rectangle zoom | DONE | Ctrl+left-click+drag on all 3 maps. New `ctrl-box-zoom.ts` utility. |
| UI-2: Unified map behavior | DONE | EditorMap switched from OSM light to CARTO Dark. All maps identical appearance. |

## Phase 2 — Libraries (COMPLETE)

| Task | Status | Details |
|------|--------|---------|
| LIB-1: Sensor library | DONE | 15 types (5 radar + 5 EO + 5 original). CRUD API: POST/DELETE `/api/sensors/library`. UI: `SensorLibraryPanel.tsx`. |
| LIB-2: Target library | DONE | 52 types: 12 BM (with ballistic props), 11 ABT, 11 fighters, 6 heli, 6 civil, 6 mil transport. |
| LIB-3: Scenario library | DONE | List/load/clone/export/delete. API: GET/POST `/api/scenarios/:id/clone`. UI: `ScenarioLibraryPanel.tsx`. |

### Target Type Categories
- **Ballistic Missiles (12)**: Scud-B, Scud-C, Fateh-110, Shahab-3, Qiam-1, Zelzal-2, Fajr-5, M-302, Iskander-M, DF-15, Emad, Zolfaghar
- **ABT (11)**: Shahed-136, Mohajer-6, Harop, Kh-55, Soumar, Quds-1, Samad-3, Ababil-3, Karrar, Hoveizeh, Kh-101
- **Fighters (11)**: Su-35, MiG-29, F-16C, F-15E, Mirage-2000, Su-24, MiG-25, Su-22, F-4E, Rafale, J-10C
- **Helicopters (6)**: Mi-24, AH-64, Ka-52, Mi-8, Bell-412, CH-53
- **Civilian (6)**: Boeing 737, A320, Cessna 172, E175, King Air, Gulfstream G550
- **Military Transport (6)**: C-130, Il-76, C-17, An-26, CH-47, KC-135

### Sensor Types (15)
- **Radar**: 360-150km, Sector-180km, Longrange-200km, EL/M-2084, EL/M-2080, EL/M-2288, AN/TPS-80, SPYDER MR
- **EO**: Gimbal-40km, Staring-20km, MEOS-500, TopLite-III, Litening, SkyGuard, DSS

## Phase 3 — Deployment Planner (COMPLETE)

| Task | Status | Details |
|------|--------|---------|
| DP-1: Persistence | DONE | File-based JSON in `configs/deployments/`. Read on startup, write on save. |
| DP-2: Pre-defined library | DONE | 3 deployments: discovery-squadron, border-line, forward-outpost |
| DP-3: Sensor library integration | DONE | Dropdown in deployment panel loads from `/api/sensors/library` |
| DP-4: Coverage area | DONE | Already existed via exclusion/threat zones |

## Phase 4 — Scenario Editor (COMPLETE)

| Task | Status | Details |
|------|--------|---------|
| ED-1: Load deployment | DONE | "Load Deployment" button in editor header |
| ED-2: Zone drawing | DONE | Polygon drawing mode for operational/exclusion/threat zones |
| ED-3: Sensor enhancements | DONE | Nickname, library picker, template auto-fill |
| ED-4: Target enhancements | DONE | Nickname, IR emission, classification, library auto-fill |
| ED-5: Draggable sensors | DONE | Sensor drag on editor map |
| ED-6: Target library integration | DONE | "From Library" dropdown auto-fills all properties |

### Waypoint Capabilities
- Per-waypoint altitude: 0–200,000m (ballistic missile support)
- Per-waypoint speed: 0–7,000 m/s (reentry speed support)
- Each leg between WPs can have different height and speed

### Ballistic Missile Properties (per type)
- `rangeKm` — Maximum range in km
- `apogeeM` — Maximum altitude of trajectory
- `burnTimeSec` — Boost phase duration
- `reentrySpeedMs` — Terminal velocity on reentry
- `defaultLaunchBearingDeg` / `defaultImpactBearingDeg` — Default trajectory bearing

## Phase 5 — Raster Map Reimplementation (COMPLETE)

**Status**: Implemented and merged.

Key changes:
- **MapLibre fully replaced with Leaflet** (Canvas 2D rendering)
- **DebugOverlay refactored** to use native Leaflet layers (L.marker, L.polyline, L.circle, L.polygon)
- **DeploymentMap refactored** to native Leaflet layers
- **All 3 maps** (main, editor, deployment) use the same Leaflet architecture
- **CARTO Dark Matter** tiles as default, with dark/light toggle
- **Deck.gl 3D overlay** retained for altitude/trajectory visualization
- Design doc: `Knowledge_Base_and_Agents_instructions/Raster_Map_Reimplementation_Design.md`

Commits:
- `7f57694` — Raster map reimplementation: Replace MapLibre with Leaflet
- `62e0cf3` — Refactor DeploymentMap to native Leaflet layers
- `1858a10` — Refactor DebugOverlay to native Leaflet layers + fix altitude inheritance

---

## API Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sensors/library` | Add/update sensor type (instructor) |
| DELETE | `/api/sensors/library/:id` | Remove sensor type (instructor) |
| GET | `/api/targets/library` | Full target type library |
| GET | `/api/targets/library/:id` | Single target type |
| GET | `/api/targets/library/category/:cat` | Filter by category |
| POST | `/api/targets/library` | Add/update target type (instructor) |
| DELETE | `/api/targets/library/:id` | Remove target type (instructor) |
| GET | `/api/scenarios/:id` | Full scenario definition |
| POST | `/api/scenarios/:id/clone` | Clone scenario as custom (instructor) |
| GET | `/api/terrain/elevation` | SRTM elevation at lat/lon |

## Files Modified/Added Summary

### New Files (8)
- `apps/workstation/src/map/ctrl-box-zoom.ts`
- `apps/workstation/src/libraries/LibrariesView.tsx`
- `apps/workstation/src/libraries/SensorLibraryPanel.tsx`
- `apps/workstation/src/libraries/TargetLibraryPanel.tsx`
- `apps/workstation/src/libraries/ScenarioLibraryPanel.tsx`
- `configs/target-library.json`
- `configs/deployments/` (3 JSON files)
- `Knowledge_Base_and_Agents_instructions/Raster_Map_Reimplementation_Design.md`

### Modified Files (19)
- `apps/api/src/reports/pdf-generator.ts` — Font path fix
- `apps/api/src/routes/scenario-routes.ts` — Library CRUD, elevation API
- `apps/api/src/routes/deployment-routes.ts` — File persistence
- `apps/api/src/simulation/live-engine.ts` — EO tasking interval
- `apps/workstation/src/App.tsx` — Libraries view, refresh rate
- `apps/workstation/src/map/MapView.tsx` — Box zoom, click fix
- `apps/workstation/src/reports/ReportModal.tsx` — Error display
- `apps/workstation/src/editor/EditorMap.tsx` — Box zoom, zone drawing, dark tiles
- `apps/workstation/src/editor/SensorTab.tsx` — Library integration
- `apps/workstation/src/editor/TargetTab.tsx` — Library integration
- `apps/workstation/src/editor/EditorHeader.tsx` — Load deployment
- `apps/workstation/src/editor/WaypointRow.tsx` — Extended limits
- `apps/workstation/src/stores/editor-store.ts` — Zone types, target fields
- `apps/workstation/src/deployment/DeploymentPanel.tsx` — Library integration
- `apps/workstation/src/deployment/DeploymentView.tsx` — Box zoom
- `configs/sensor-library.json` — 10 new sensor types
