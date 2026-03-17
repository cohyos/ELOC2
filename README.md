# ELOC2 — Electro-Optical Command & Control Air Defense Demonstrator

A full-stack simulation of an air defense C2 system that fuses radar, electro-optical (EO), and C4ISR sensor data into a unified Recognized Air Picture (RAP). Tracks are correlated, fused, and displayed in real time on a tactical workstation.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Workstation (React + MapLibre)    │
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

| Package | Description |
|---------|-------------|
| `packages/domain` | Branded types & interfaces (SystemTrack, SensorState, Task, etc.) |
| `packages/events` | Event envelope definitions for the domain event bus |
| `packages/schemas` | Validation utilities for positions, timestamps, sensor IDs |
| `packages/shared-utils` | Geodetic math, matrix ops, UUID generation, simulation clock |
| `packages/fusion-core` | Sensor fusion: ingestion, correlation, track management, replay |
| `packages/registration` | Spatial/temporal registration, bias estimation, health scoring |
| `packages/geometry` | Bearing triangulation, time alignment, geometry quality scoring |
| `packages/eo-investigation` | EO investigation: cue handling, gimbal control, FOV, identification |
| `packages/eo-tasking` | EO tasking workflow: candidate scoring, policy engine, assignment |
| `packages/projections` | View builders (RAP, sensor health, EO cues, task timeline) |
| `packages/validation` | System assertions: track continuity, registration safety, replay fidelity |
| `packages/scenario-library` | Predefined scenarios with flight paths, sensors, and fault scripts |
| `apps/simulator` | Scenario execution engine (radar/EO/C4ISR models, fault injection) |
| `apps/api` | Fastify REST + WebSocket server with live simulation engine |
| `apps/workstation` | React tactical workstation with MapLibre GL map |

## Prerequisites

- **Node.js** ≥ 20
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
gcloud config set project YOUR_PROJECT_ID

# Deploy (builds Docker image and deploys)
gcloud run deploy eloc2 \
  --source . \
  --port 3001 \
  --allow-unauthenticated \
  --region me-west1 \
  --memory 1Gi \
  --cpu 1
```

Cloud Run will print the public URL (e.g. `https://eloc2-xxxxx.a.run.app`). Open it to use the workstation.

## Running Tests

```bash
# Unit tests (146+ Vitest tests across all packages)
pnpm test

# E2E tests (33 Playwright specs: API, scenarios, desktop UI, mobile UI)
pnpm test:e2e

# Generate HTML QA dashboard
pnpm test:e2e:report
# Reports output to: tests/e2e/output/qa-report.json
```

Cloud Build runs all tests automatically on deploy (see `cloudbuild.yaml`).

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
| **Space** | Play / Pause |
| **Left/Right arrows** | Seek -10s / +10s |
| **Ctrl+D** | Toggle demo mode |
| **Ctrl+I** | Toggle live injection mode |

Click a track on the map to see its detail (classification, velocity, contributing sensors, action buttons). Click a sensor icon to see its status, coverage, and registration health.

## EO Tasking Algorithm

The EO allocation runs every 5 simulation seconds:

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
| POST | `/api/operator/priority` | Add/remove track from priority set `{ "trackId": "...", "priority": true }` |
| POST | `/api/operator/approve` | Approve a proposed task `{ "taskId": "..." }` |
| POST | `/api/operator/reject` | Reject a proposed task `{ "taskId": "..." }` |
| WS | `/ws/events` | Real-time event + RAP update stream |

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7
- **Build**: pnpm workspaces, Turborepo, tsup, Vite
- **API**: Fastify 5, @fastify/websocket
- **Frontend**: React 19, MapLibre GL JS 5, Zustand 5
- **Testing**: Vitest 3
- **Deployment**: Docker multi-stage build, Google Cloud Run

## License

Private — internal demonstration only.
