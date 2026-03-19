# High-Load Architecture for ELOC2

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Current Architecture](#current-architecture)
  - [Process Model](#process-model)
  - [State Management](#state-management)
  - [WebSocket Broadcasting](#websocket-broadcasting)
- [Bottleneck Analysis](#bottleneck-analysis)
  - [Correlation Complexity](#correlation-complexity)
  - [Single-Threaded Event Loop](#single-threaded-event-loop)
  - [Memory Pressure](#memory-pressure)
  - [WebSocket Fan-Out](#websocket-fan-out)
- [Proposed Architecture](#proposed-architecture)
  - [System Overview](#system-overview)
  - [Event-Sourced State with Redis Streams](#event-sourced-state-with-redis-streams)
  - [Fusion Workers](#fusion-workers)
  - [Shared Track Store](#shared-track-store)
  - [WebSocket Gateway](#websocket-gateway)
  - [API Tier](#api-tier)
- [Horizontal Scaling Strategy](#horizontal-scaling-strategy)
  - [Stateless API Tier](#stateless-api-tier)
  - [Fusion Tier: Geographic Partitioning](#fusion-tier-geographic-partitioning)
  - [WebSocket Tier: Session Affinity](#websocket-tier-session-affinity)
- [Database Architecture](#database-architecture)
  - [PostgreSQL: Durable State](#postgresql-durable-state)
  - [Redis: Hot State](#redis-hot-state)
- [Performance Targets](#performance-targets)
- [Migration Path](#migration-path)
  - [Phase 1: Optimize Current Architecture](#phase-1-optimize-current-architecture)
  - [Phase 2: Extract WebSocket Gateway](#phase-2-extract-websocket-gateway)
  - [Phase 3: Distributed Fusion](#phase-3-distributed-fusion)
- [Cost Implications](#cost-implications)
- [Recommendation](#recommendation)
- [References](#references)

---

## Executive Summary

The current ELOC2 system runs as a single Node.js process: `LiveEngine` manages simulation, fusion, track management, and WebSocket broadcasting in one event loop. This architecture works well for the demonstrator (10-20 targets, 4-6 sensors, 1-3 operators) but will not scale to operational loads of 100+ targets, 10+ sensors, and 10+ concurrent operator workstations.

This document identifies the scaling bottlenecks, proposes a distributed architecture that addresses them, and defines a three-phase migration path that preserves backward compatibility at each step.

The core insight is that the fusion pipeline is CPU-bound and grows super-linearly with target count, while the WebSocket broadcast is I/O-bound and grows linearly with operator count. These two workloads should be separated and scaled independently.

---

## Current Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Node.js Process                     │
│                         (apps/api)                            │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Fastify HTTP │  │  LiveEngine   │  │  WebSocket Server │   │
│  │  (REST API)  │  │  (sim loop)   │  │  (ws broadcast)   │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘   │
│         │                │                    │               │
│         │         ┌──────▼───────┐            │               │
│         │         │ TrackManager  │            │               │
│         │         │ Correlator    │            │               │
│         │         │ Fuser         │            │               │
│         │         │ EventStore    │            │               │
│         │         └──────────────┘            │               │
│         │                                     │               │
│         └──────────────────┬──────────────────┘               │
│                            │                                  │
│                    In-Memory State                             │
│              (tracks, sensors, geometry)                       │
└─────────────────────────────────────────────────────────────┘
```

All components share the same V8 event loop. The simulation loop (`LiveEngine.tick()`) runs on a `setInterval`, and each tick must complete before the next event loop iteration can process HTTP requests or WebSocket messages.

### State Management

All state is held in memory:

| State                    | Structure                    | Size at 20 targets |
|:-------------------------|:-----------------------------|:-------------------|
| System tracks            | `Map<SystemTrackId, Track>`  | ~50 KB             |
| Event store              | `Array<DomainEvent>`         | ~200 KB (growing)  |
| Sensor state             | `Map<SensorId, SensorState>` | ~10 KB             |
| Geometry (bearings, tri) | Arrays per track             | ~30 KB             |
| EO management state      | `EoManagementModule`         | ~20 KB             |

Total memory at 20 targets: ~310 KB. At 100 targets this grows to ~2 MB for tracks but the event store grows unboundedly (mitigated by periodic compaction in the current code).

### WebSocket Broadcasting

`LiveEngine.broadcastRap()` serializes the full RAP state and sends it to every connected WebSocket client. With broadcast throttling (max 4/sec at >2x speed), each client receives up to 4 JSON messages per second, each containing the full track picture.

---

## Bottleneck Analysis

### Correlation Complexity

The correlator checks every incoming observation against every existing system track. With `n` tracks and `m` observations per tick:

- Current: O(n * m) per tick with distance gating
- At 100 tracks, 10 sensors reporting 5 obs each: 100 * 50 = 5,000 correlation checks per tick
- Each check involves covariance-weighted distance, which is computationally non-trivial
- Measured: ~15ms per tick at 20 tracks, extrapolated ~180ms at 100 tracks
- At 200ms tick interval, this leaves almost no headroom for fusion and broadcasting

### Single-Threaded Event Loop

Node.js processes JavaScript on a single thread. During a `LiveEngine.tick()`, the event loop is blocked:

```
Timeline for one tick at 100 targets (estimated):
├── processSimEvents()     80 ms   (observation ingestion)
├── correlate()           100 ms   (O(n*m) matching)
├── fuse()                 30 ms   (state update)
├── triangulate()          20 ms   (geometry)
├── eoManagement()         15 ms   (tasking decisions)
├── broadcastRap()         25 ms   (JSON serialize + send)
└── TOTAL                 270 ms   ← exceeds 200ms tick interval
```

When tick processing exceeds the tick interval, ticks queue up, latency grows, and the system falls behind real time.

### Memory Pressure

The event store is append-only. At 100 targets with 10 sensors:

- ~1,000 events/second (observations + state changes)
- ~500 bytes per event
- ~500 KB/second, ~1.8 GB/hour
- V8 heap limit: 1.5 GB by default (can be raised, but GC pauses grow)

### WebSocket Fan-Out

Each broadcast serializes the full RAP and sends it to every client:

- Full RAP at 100 tracks: ~150 KB JSON
- 10 operators * 4 broadcasts/sec = 40 sends/sec
- Bandwidth: ~6 MB/sec outbound (manageable, but serialization cost is the bottleneck)
- JSON.stringify on a 100-track RAP takes ~5ms per call

---

## Proposed Architecture

### System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Operator    │     │  Operator    │     │  Operator    │
│  Workstation │     │  Workstation │     │  Workstation │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │ WebSocket
                    ┌──────▼──────┐
                    │  WS Gateway  │  (horizontally scaled)
                    │  (read from  │
                    │   Redis pub) │
                    └──────┬──────┘
                           │ Redis Pub/Sub
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
│ Fusion       │     │ Fusion       │     │ API          │
│ Worker       │     │ Worker       │     │ (REST)       │
│ (Sector A)   │     │ (Sector B)   │     │ (stateless)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──┐  ┌──────▼──┐  ┌─────▼───┐
       │  Redis   │  │  Redis   │  │ Postgres │
       │  (hot    │  │  Streams │  │ (durable │
       │   state) │  │  (events)│  │  state)  │
       └─────────┘  └─────────┘  └─────────┘
```

### Event-Sourced State with Redis Streams

Replace the in-memory `EventStore` with Redis Streams:

- **Stream per sensor**: `events:sensor:{sensorId}` — raw observations
- **Stream per sector**: `events:sector:{sectorId}` — correlated/fused events
- **Consumer groups**: each fusion worker is a consumer in its sector group
- **Retention**: 1 hour sliding window (configurable), with PostgreSQL for long-term storage

Benefits:
- Events survive process restarts
- Multiple consumers can replay from any point
- Built-in backpressure via consumer group acknowledgment
- Redis Streams throughput: >100K messages/sec on a single node

### Fusion Workers

Each fusion worker runs the existing `TrackManager` + `Correlator` + `Fuser` logic but scoped to a geographic sector:

- Reads observations from its assigned sensor streams
- Maintains its own track state for tracks within its sector
- Publishes fused track updates to a shared Redis hash and a pub/sub channel
- Handles sector boundary handoff by publishing "track-leaving" events

Worker isolation means a slow sector does not block other sectors. Each worker can run on a dedicated CPU core or container.

### Shared Track Store

The recognized air picture is stored in Redis as a hash:

```
HSET track:{trackId} state <JSON> covariance <JSON> status confirmed ...
```

- **Optimistic locking** via Redis `WATCH`/`MULTI`/`EXEC` prevents conflicting updates from different fusion workers
- **TTL on tracks**: dropped tracks expire after configurable timeout
- **Pub/sub notification**: on every track update, publish to `channel:rap-updates`
- The WS Gateway subscribes to this channel to push updates to operators

### WebSocket Gateway

A dedicated service that:

1. Subscribes to `channel:rap-updates` via Redis pub/sub
2. Maintains WebSocket connections to operator workstations
3. Assembles the RAP view by reading from the Redis track store
4. Sends delta updates (not full snapshots) to reduce bandwidth
5. Handles `rap.snapshot` requests by reading full state from Redis

This service is stateless except for the WebSocket connections themselves, so it scales horizontally with session affinity.

### API Tier

The REST API (`/api/operator/*`, `/api/quality/*`, `/api/reports/*`, `/api/deployment/*`) becomes fully stateless:

- Reads track state from Redis
- Writes operator overrides to Redis (which fusion workers pick up)
- Generates reports from PostgreSQL historical data
- Scales horizontally via Cloud Run auto-scaling

---

## Horizontal Scaling Strategy

### Stateless API Tier

- Cloud Run auto-scales based on request concurrency
- Target: 80 concurrent requests per instance
- No sticky sessions needed
- Shared state in Redis/PostgreSQL

### Fusion Tier: Geographic Partitioning

Partition the operational area into sectors. Each sector is assigned to one fusion worker.

```
┌─────────────────────────────────────────┐
│           Operational Area               │
│                                          │
│   ┌──────────────┬──────────────┐       │
│   │              │              │       │
│   │  Sector A    │  Sector B    │       │
│   │  (Worker 1)  │  (Worker 2)  │       │
│   │              │              │       │
│   ├──────────────┼──────────────┤       │
│   │              │              │       │
│   │  Sector C    │  Sector D    │       │
│   │  (Worker 3)  │  (Worker 4)  │       │
│   │              │              │       │
│   └──────────────┴──────────────┘       │
│                                          │
└─────────────────────────────────────────┘
```

**Sector assignment rules:**
- Sensors are assigned to sectors based on their geodetic position
- Tracks are owned by the sector containing their current position
- Tracks near sector boundaries are processed by both adjacent workers (overlap zone of 5 km)
- Track handoff: when a track moves from Sector A to Sector B, Worker A publishes a `track-handoff` event; Worker B adopts the track state

**Scaling:**
- 4 sectors for 100 targets (25 tracks per worker)
- 16 sectors for 400 targets
- Sectors can be split dynamically based on track density

### WebSocket Tier: Session Affinity

- Cloud Run session affinity ensures a client stays connected to the same instance
- Each WS Gateway instance handles up to 100 concurrent connections
- 10 operators = 1 instance; 100 operators = 2 instances
- State is in Redis, so failover is seamless (client reconnects, gets `rap.snapshot`)

---

## Database Architecture

### PostgreSQL: Durable State

| Table               | Purpose                              | Write Rate     |
|:--------------------|:-------------------------------------|:---------------|
| `events`            | Event store (append-only)            | ~1,000/sec     |
| `track_history`     | Track state snapshots (every 5 sec)  | ~20/sec        |
| `operator_actions`  | Audit log of operator overrides      | ~1/min         |
| `scenarios`         | Scenario definitions and results     | Rare           |
| `reports`           | Generated report artifacts           | Rare           |
| `sensor_config`     | Sensor positions, calibration        | Rare           |

**Partitioning strategy:**
- `events` table partitioned by timestamp (daily partitions)
- `track_history` partitioned by timestamp (hourly partitions)
- Retention: 30 days online, archive to Cloud Storage

### Redis: Hot State

| Key Pattern                  | Type       | Purpose                        | TTL      |
|:-----------------------------|:-----------|:-------------------------------|:---------|
| `track:{trackId}`            | Hash       | Current fused track state      | 60s      |
| `sensor:{sensorId}`          | Hash       | Current sensor state           | 30s      |
| `sector:{sectorId}:tracks`   | Set        | Track IDs in sector            | None     |
| `events:sensor:{sensorId}`   | Stream     | Raw observation events         | 1 hour   |
| `events:sector:{sectorId}`   | Stream     | Fused events per sector        | 1 hour   |
| `channel:rap-updates`        | Pub/Sub    | Real-time track update channel | N/A      |
| `lock:track:{trackId}`       | String     | Optimistic lock token          | 5s       |
| `operator:overrides`         | Hash       | Active operator overrides      | None     |

**Redis deployment:**
- GCP Memorystore (managed Redis 7.0)
- Minimum: 4 GB instance (handles 100 tracks comfortably)
- High availability: replica in second zone

---

## Performance Targets

| Metric                         | Current (Demo) | Phase 2 Target  | Phase 3 Target  |
|:-------------------------------|:---------------|:----------------|:----------------|
| Max targets                    | ~50            | ~50             | 200+            |
| Max sensors                    | ~8             | ~8              | 20+             |
| Max concurrent operators       | ~3             | ~20             | 50+             |
| Tick-to-display latency        | ~50 ms         | ~100 ms         | <200 ms         |
| Correlation time (per tick)    | ~15 ms         | ~15 ms          | ~20 ms/sector   |
| WebSocket broadcast size       | ~50 KB (full)  | ~5 KB (delta)   | ~5 KB (delta)   |
| Memory per process             | ~300 MB        | ~200 MB (API)   | ~100 MB/worker  |
| Event throughput               | ~200/sec       | ~500/sec        | ~5,000/sec      |
| Recovery time (process crash)  | Full restart   | WS reconnect    | <5 sec failover |

---

## Migration Path

### Phase 1: Optimize Current Architecture (2-4 weeks)

**Goal: extend the single-process model to handle ~50 targets reliably.**

No architectural changes. Optimizations within the existing codebase:

1. **Spatial indexing for correlation**: Replace brute-force O(n*m) with a k-d tree or R-tree. Reduces correlation to O(m * log n). Libraries: `kd-tree-javascript` or `rbush`.

2. **Delta broadcasts**: Instead of serializing the full RAP every tick, track what changed since the last broadcast and send only deltas. Reduces serialization from ~5ms to ~0.5ms.

3. **Event store compaction**: Compact the in-memory event store every 60 seconds, keeping only the last 100 events per track. Caps memory growth.

4. **Worker thread for fusion**: Move the correlation + fusion computation to a Node.js `worker_threads` worker. The main thread handles HTTP and WebSocket I/O while the worker computes the next tick.

5. **Binary WebSocket messages**: Replace JSON serialization with MessagePack or Protocol Buffers. Reduces serialization CPU and bandwidth by ~60%.

**Estimated effort**: 2 weeks of development, no infrastructure changes.

### Phase 2: Extract WebSocket Gateway (4-6 weeks)

**Goal: decouple operator connections from the fusion process.**

1. Deploy Redis (Memorystore) for pub/sub and hot state
2. `LiveEngine` publishes track updates to Redis instead of directly to WebSocket clients
3. New `ws-gateway` service subscribes to Redis and manages operator connections
4. API routes become stateless (read from Redis)
5. `ws-gateway` scales independently on Cloud Run

```
Before:  [LiveEngine + WS + API]  (1 process)
After:   [LiveEngine + API] ──Redis──> [WS Gateway x N]
```

**Key benefit**: operator count no longer affects fusion performance. Adding operators only scales the WS tier.

**Estimated effort**: 4 weeks of development, Redis instance provisioned.

### Phase 3: Distributed Fusion (8-12 weeks)

**Goal: handle 100+ targets across geographic sectors.**

1. Split `LiveEngine` into sector-scoped fusion workers
2. Implement geographic partitioning and track handoff protocol
3. Replace in-memory event store with Redis Streams
4. Add PostgreSQL for durable event storage and reporting
5. Implement sector boundary management (overlap zones, handoff events)
6. Deploy fusion workers as separate Cloud Run services or Kubernetes pods

**Estimated effort**: 8-12 weeks, significant testing required for sector handoff correctness.

---

## Cost Implications

| Component              | Phase 1       | Phase 2          | Phase 3            |
|:-----------------------|:--------------|:-----------------|:-------------------|
| Cloud Run (API)        | $50/month     | $50/month        | $80/month          |
| Cloud Run (WS Gateway) | Included      | $30/month        | $60/month          |
| Cloud Run (Fusion)     | Included      | Included         | $120/month         |
| Redis (Memorystore)    | Not needed    | $70/month (1GB)  | $140/month (4GB)   |
| PostgreSQL (Cloud SQL) | Not needed    | Not needed       | $100/month (basic) |
| **Total monthly**      | **$50**       | **$150**         | **$500**           |

All estimates assume GCP `me-west1` region pricing with sustained use discounts. Costs scale sub-linearly: doubling operators adds ~$30/month (WS tier), doubling targets adds ~$60/month (fusion tier).

---

## Recommendation

**Do not over-engineer prematurely.** The current single-process architecture is correct for the demonstrator and will remain correct for early operational use.

| Trigger                                      | Action                     |
|:---------------------------------------------|:---------------------------|
| Demo and evaluation (current)                | Stay on Phase 1 (optimize) |
| Deployed with >5 simultaneous operators      | Execute Phase 2            |
| Operational requirement for >50 live targets  | Execute Phase 3            |
| Customer requests multi-site federation       | Phase 3 + federation layer |

The Phase 1 optimizations (spatial indexing, delta broadcasts, worker thread) should be implemented regardless, as they improve the demonstrator experience at minimal cost and risk.

Phase 2 (WS gateway extraction) is the highest-value architectural change: it is relatively simple, low-risk, and decouples the two fundamentally different workloads (compute-bound fusion vs I/O-bound broadcasting).

Phase 3 should only be pursued when there is a concrete operational requirement for >50 targets. The geographic partitioning and track handoff logic is complex and introduces new failure modes (split-brain sectors, handoff races). It should be thoroughly tested with synthetic load before deployment.

---

## References

- Node.js Worker Threads: https://nodejs.org/api/worker_threads.html
- Redis Streams: https://redis.io/docs/data-types/streams/
- Cloud Run Session Affinity: https://cloud.google.com/run/docs/configuring/session-affinity
- ELOC2 LiveEngine: `apps/api/src/simulation/live-engine.ts`
- ELOC2 TrackManager: `packages/fusion-core/`
- ELOC2 EventStore: `packages/fusion-core/src/event-store.ts`
- ELOC2 Domain Types: `packages/domain/src/`
- R-tree spatial index: https://github.com/mourner/rbush
- MessagePack for JS: https://github.com/msgpack/msgpack-javascript
