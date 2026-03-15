# ELOC2 — Electro-Optical Command & Control Air Defense Demonstrator

A full-stack simulation of an air defense C2 system that fuses radar, electro-optical (EO), and C4ISR sensor data into a unified Recognized Air Picture (RAP). Tracks are correlated, fused, and displayed in real time on a tactical workstation.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Workstation (React + MapLibre)    │  :3000
│   Map ─ Track detail ─ Sensor detail ─ Timeline     │
└────────────────────────┬────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────┴────────────────────────────┐
│                    API Server (Fastify)              │  :3001
│   LiveEngine → ScenarioRunner → TrackManager → RAP  │
└─────────────────────────────────────────────────────┘
```

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

The workstation is served at **http://localhost:3000** and the API at **http://localhost:3001**.

## Running Tests

```bash
pnpm test
```

Runs Vitest across all packages via Turborepo.

## Workstation Controls

| Control | Action |
|---------|--------|
| **Start / Pause** | Begin or pause the simulation |
| **Reset** | Reset the scenario to T+0:00 |
| **1x / 2x / 5x / 10x** | Set simulation speed |
| **Show/Hide Panel** | Toggle the track/sensor detail panel |
| **Show/Hide Timeline** | Toggle the event timeline |

Click a track on the map to see its detail (classification, velocity, contributing sensors). Click a sensor icon to see its status and coverage.

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
| WS | `/ws` | Real-time event + RAP update stream |

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7
- **Build**: pnpm workspaces, Turborepo, tsup, Vite
- **API**: Fastify 5, @fastify/websocket
- **Frontend**: React 19, MapLibre GL JS 5, Zustand 5
- **Testing**: Vitest 3
- **Deployment**: Docker multi-stage build, `serve` for static files

## License

Private — internal demonstration only.
