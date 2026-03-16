# ELOC2 — EO C2 Air Defense Demonstrator

## Project Overview
Air defense C2 demonstrator with sensor fusion, EO investigation, and tasking.
Monorepo: `packages/` (domain libs) + `apps/` (api, workstation, simulator).

## Architecture
- **Backend**: `apps/api` — Fastify server, WebSocket events, live simulation engine
- **Frontend**: `apps/workstation` — React + MapLibre GL + Zustand stores
- **Simulator**: `apps/simulator` — ScenarioRunner generates radar/EO observations
- **Fusion**: `packages/fusion-core` — TrackManager, correlator, information-matrix fuser
- **Domain types**: `packages/domain` — SystemTrack, SensorState, Position3D, etc.

## Key Files
- `apps/api/src/simulation/live-engine.ts` — Main simulation loop, WS broadcast
- `apps/workstation/src/map/MapView.tsx` — Map component, layer init
- `apps/workstation/src/map/layers/track-layer.ts` — Track circle + label layers
- `apps/workstation/src/map/layers/sensor-layer.ts` — Sensor circle + label layers
- `apps/workstation/src/map/DebugOverlay.tsx` — HTML marker fallback (bypasses MapLibre)
- `apps/workstation/src/replay/ReplayController.ts` — WebSocket client, feeds stores
- `apps/workstation/src/stores/track-store.ts` — Zustand track state
- `apps/workstation/src/App.tsx` — Main layout, header, scenario controls

## Data Flow
1. `ScenarioRunner.step()` generates `SimulationEvent[]` (observations, bearings, faults)
2. `LiveEngine.processSimEvent()` feeds observations through `TrackManager.processObservation()`
3. `LiveEngine.broadcastRap()` sends tracks/sensors via WebSocket as `rap.update`
4. `ReplayController.handleMessage()` calls `setTracks()`/`setSensors()` on Zustand stores
5. `MapView` effects call `updateTrackLayer()`/`updateSensorLayer()` when data changes
6. `DebugOverlay` renders HTML markers using `map.project()` as a fallback

## Known Issues

### Map symbols not rendering (ACTIVE)
- Header shows correct track counts (95 tentative) but map is blank
- Data pipeline verified correct: tracks have valid `state: { lat, lon, alt }`
- Likely cause: MapLibre GL v5 font/glyph loading failure blocking rendering
- Fixes applied but NOT YET DEPLOYED:
  - Symbol/label layers isolated in try/catch (font failure won't block circles)
  - Font fallback stack: Open Sans Bold, Noto Sans Bold, Arial Unicode MS Bold
  - DebugOverlay renders HTML markers bypassing MapLibre entirely
  - WS payload trimmed (lineage capped to last 3 entries per track)
  - MapLibre error event logging added

### Deployment (ACTIVE)
- Cloud Run service: `eloc2-820514480393.me-west1.run.app`
- Cloud Build trigger was deleted/missing — needs recreation or manual deploy
- Deploy manually:
  ```bash
  gcloud auth login
  git checkout master && git merge claude/eloc2-development-ElpmM
  gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
    --project=eloc2demo
  ```

## Development
- Package manager: pnpm (v9.15.0) with workspaces
- Build: `pnpm build` (uses Turbo)
- Dev branch: `claude/eloc2-development-ElpmM`
- Dockerfile: 2-stage build, serves workstation static files from API on port 3001
- Vite dev server on port 3000 proxies `/api` and `/ws` to 3001

## Conventions
- Branded types: `SystemTrackId`, `SensorId`, `Timestamp` (string/number underneath)
- Track status: tentative → confirmed (after 3 updates) → dropped (after 8 misses)
- Colors: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333
- Sensor colors: radar=#4488ff, eo=#ff8800, c4isr=#aa44ff
