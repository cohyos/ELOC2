# ELOC2 — Electro-Optical Command & Control Air Defense Demonstrator

A full-stack simulation of an air defense C2 system that fuses radar, electro-optical (EO), and C4ISR sensor data into a unified Recognized Air Picture (RAP). Tracks are correlated, fused, and displayed in real time on a tactical workstation.

## Live Application

**Production URL:** https://eloc2-820514480393.me-west1.run.app

Hosted on Google Cloud Run (region: `me-west1`). Auto-deployed on merge to `master` via Cloud Build.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Workstation (React + Leaflet)           │
│   Map ─ Track detail ─ Sensor detail ─ Timeline     │
└────────────────────────┬────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────┴────────────────────────────┐
│                    API Server (Fastify)              │  :3001
│   LiveEngine → ScenarioRunner → TrackManager → RAP  │
│   (serves static UI in production)                  │
└─────────────────────────────────────────────────────┘
```

In **development**, Vite runs the workstation on `:3000` with hot reload and proxies API calls to `:3001`. In **production** (Docker / Cloud Run), Fastify serves both the API and the static workstation build on a single port (`:3001`).

**LiveEngine** drives the simulation:
1. `ScenarioRunner` generates synthetic sensor observations (radar plots, EO bearings, C4ISR tracks) along scripted flight paths with injected faults.
2. Observations pass through `RegistrationHealthService` (bias/clock checks) and `TrackManager` (Mahalanobis correlation + information-matrix fusion).
3. The resulting system tracks are broadcast to the workstation via WebSocket every simulation second.

## Monorepo Structure

### Apps (3)

| App | Description |
|-----|-------------|
| `apps/api` | Fastify REST + WebSocket server with live simulation engine |
| `apps/workstation` | React 19 tactical workstation with Leaflet map + Zustand 5 stores |
| `apps/simulator` | Scenario execution engine (radar/EO/C4ISR models, fault injection) |

### Packages (21)

| Package | Description | Portable? |
|---------|-------------|-----------|
| `packages/domain` | Branded types & interfaces (SystemTrack, SensorState, Position3D, etc.) | Yes |
| `packages/events` | Event envelope definitions for the domain event bus | Yes |
| `packages/schemas` | Zod validation schemas for API payloads | Yes |
| `packages/shared-utils` | Geodetic math, matrix ops, UUID generation, simulation clock | Yes |
| `packages/fusion-core` | Sensor fusion: ingestion, correlation, track management, replay | Yes |
| `packages/registration` | Spatial/temporal registration, bias estimation, health scoring | Yes |
| `packages/geometry` | Bearing triangulation, time alignment, geometry quality scoring | **Yes** |
| `packages/eo-investigation` | EO investigation: cue handling, gimbal control, FOV, identification | **Yes** |
| `packages/eo-tasking` | EO tasking workflow: candidate scoring, policy engine, assignment | **Yes** |
| `packages/eo-management` | Modular EO module (pipelines, mode controller, sub-pixel/image) | Conditional |
| `packages/eo-core` | EO CORE: bearing aggregation, cross-sensor triangulation, EO tracks | **Yes** |
| `packages/sensor-bus` | EventEmitter-based message bus for distributed sensor architecture | **Yes** |
| `packages/sensor-instances` | Independent sensor classes (Radar, EO, C4ISR) with observation gen | Conditional |
| `packages/system-fuser` | Track-to-track fusion, distributed pipeline orchestrator, lifecycle | Conditional |
| `packages/projections` | View builders (RAP, sensor health, EO cues, task timeline) | Yes |
| `packages/validation` | System assertions: track continuity, registration safety, replay fidelity | Yes |
| `packages/scenario-library` | 8 predefined scenarios incl. EO-only defense (19 sensors) | Yes |
| `packages/deployment-planner` | Sensor deployment optimization (grid, scorers, LP optimizer) | Yes |
| `packages/terrain` | SRTM DEM line-of-sight checker | Yes |
| `packages/asterix-adapter` | CAT-048/CAT-062 binary parsing + export adapter | Yes |
| `packages/database` | PostgreSQL user/session management | Yes |

## Prerequisites

- **Node.js** >= 20
- **pnpm** 9.15+ (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- **Docker** (optional, for containerized deployment)

## Quick Start (Development)

```bash
# Install dependencies
pnpm install

# Build all packages (required before first run)
pnpm build

# Start API server (port 3001) and workstation dev server (port 3000)
pnpm dev
```

Open **http://localhost:3000** in your browser. Click **Start** in the header bar to begin the simulation.

## Quick Start (Docker)

```bash
# Build and run
docker compose up --build

# Or in detached mode
docker compose up --build -d
```

Open **http://localhost:3001** — both the UI and API are served on a single port.

## Deploy to Google Cloud Run

```bash
# One-time setup
gcloud auth login
gcloud config set project eloc2demo

# Deploy via Cloud Build (recommended)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=eloc2demo

# Or direct deploy
gcloud run deploy eloc2 \
  --source . \
  --port 3001 \
  --allow-unauthenticated \
  --region me-west1 \
  --memory 512Mi \
  --cpu 1
```

Auto-deploy: merge to `master` triggers Cloud Build.

## Running Tests

```bash
# All tests (73 Vitest tests across packages)
pnpm test

# E2E tests (Playwright)
pnpm test:e2e

# Generate QA report
pnpm test:e2e:report
```

Cloud Build runs tests automatically on deploy (see `cloudbuild.yaml`).

## Workstation Controls

| Control | Action |
|---------|--------|
| **Start / Pause** | Begin or pause the simulation |
| **Reset** | Reset the scenario to T+0:00 |
| **1x / 2x / 5x / 10x** | Set simulation speed |
| **Dark / Light** | Toggle dark/light map tiles |
| **Tasks / Investigation** | Toggle task or investigation detail panels |
| **Show/Hide Panel** | Toggle the track/sensor detail panel |
| **Show/Hide Timeline** | Toggle the event timeline |
| **Demo** | Toggle presenter dashboard mode |
| **Ctrl+Drag** | Rectangle zoom on map |
| **Space** | Play / Pause |
| **Left/Right arrows** | Seek -10s / +10s |
| **Ctrl+D** | Toggle demo mode |
| **Ctrl+I** | Toggle live injection mode |

### Roles

- **Instructor**: Full access — start/pause/reset, scenario selection, inject targets, manage users, generate reports
- **Operator**: Restricted — track investigation, priority marking, task approval/rejection only

## EO Tasking Algorithm

The EO allocation runs every 3 simulation seconds:

1. **Candidate generation**: All eligible tracks paired with all online EO sensors
2. **Scoring**: `total = threat + uncertainty + geometry - slewCost - occupancy`
   - Threat: confidence, altitude, speed, closure rate
   - Uncertainty: larger covariance = higher score
   - Geometry: intersection angle quality for triangulation
   - Operator intent: +3.0 boost for priority-marked tracks
3. **Policy**: Default `auto_with_veto` (auto-approved, operator can reject)
4. **Assignment**: Greedy — one task per sensor, highest score first
5. **Execution**: Gimbal slews to target, cue issued, investigation starts

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service health + simulation status |
| GET | `/api/rap` | Current Recognized Air Picture (all tracks) |
| GET | `/api/sensors` | All sensor states |
| GET | `/api/tasks` | Active EO tasks |
| GET | `/api/events` | Event log (last 500) |
| GET | `/api/scenarios` | Available scenario definitions |
| GET | `/api/scenario/status` | Simulation state (running, speed, elapsed) |
| POST | `/api/scenario/start` | Start simulation |
| POST | `/api/scenario/pause` | Pause simulation |
| POST | `/api/scenario/speed` | Set speed `{ "speed": N }` |
| POST | `/api/scenario/reset` | Reset scenario `{ "scenarioId?": "..." }` |
| POST | `/api/operator/priority` | Add/remove track from priority set |
| POST | `/api/operator/approve` | Approve a proposed task |
| POST | `/api/operator/reject` | Reject a proposed task |
| POST | `/api/operator/lock` | Lock EO sensor to track |
| POST | `/api/operator/release` | Release locked EO sensor |
| POST | `/api/operator/classify` | Classify a track |
| GET | `/api/quality/metrics` | Quality assessment metrics |
| GET | `/api/quality/allocation` | EO allocation quality criteria |
| GET | `/api/quality/before-after` | Before/after EO comparison |
| POST | `/api/reports/generate` | Generate PDF/MD scenario report |
| GET | `/api/deployment/*` | Deployment planner (7 endpoints) |
| GET | `/api/terrain/elevation` | Terrain elevation lookup |
| GET | `/api/sensor-library` | Sensor type library CRUD |
| GET | `/api/target-library` | Target type library CRUD |
| POST | `/api/auth/*` | Login/logout/user management (when AUTH_ENABLED) |
| GET | `/api/asterix/status` | ASTERIX UDP feed status |
| WS | `/ws/events` | Real-time event + RAP update stream |

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7
- **Build**: pnpm workspaces, Turborepo, tsup, Vite
- **API**: Fastify 5, @fastify/websocket
- **Frontend**: React 19, Leaflet (Canvas 2D rendering), Zustand 5
- **3D Overlay**: Deck.gl (altitude extrusion, ballistic trajectories)
- **Map Tiles**: CARTO Dark Matter (default), OpenStreetMap
- **PDF Reports**: pdfmake
- **Testing**: Vitest 3, Playwright (E2E)
- **Deployment**: Docker multi-stage build, Google Cloud Run, Cloud Build CI/CD
- **Database**: PostgreSQL (optional, for auth/sessions)

## Knowledge Base

The `Knowledge_Base_and_Agents_instructions/` directory contains **28 foundational design documents** (10,000+ lines) covering all domain logic, algorithms, UI requirements, architecture decisions, and implementation plans. See `Chunk_index.md` for a retrieval-oriented index.

## License

Private — internal demonstration only.
