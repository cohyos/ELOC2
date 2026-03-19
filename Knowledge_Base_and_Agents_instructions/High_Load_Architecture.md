# High-Load Architecture Design — ELOC2 at Scale

## 1. Overview

This document describes the architecture required to scale ELOC2 from its current single-process demonstration (1 CPU, 512Mi RAM, ~10 targets, 1-2 operators) to a production-grade system handling **100+ simultaneous targets, 10+ sensor feeds, and 10+ concurrent operators**.

### Current Constraints
| Resource | Current | Target |
|----------|---------|--------|
| Targets | ~10 | 100+ |
| Sensors | 5-8 | 20+ |
| Operators | 1-2 | 10+ |
| Tick rate | 1 Hz | 1-5 Hz |
| Latency (obs→track) | ~50ms | <100ms |
| Memory | 512Mi | 2-4Gi |
| CPU | 1 vCPU | 4-8 vCPU |

---

## 2. Bottleneck Analysis

### 2.1 Fusion Pipeline
The current `TrackManager.processObservation()` runs sequentially. At 100 targets × 5 sensors × 1 Hz = **500 observations/sec**, key costs:

- **Correlation**: O(N×M) where N=observations, M=active tracks. At 100 tracks, ~50,000 comparisons/sec.
- **Information matrix fusion**: Matrix inversion per update. Currently ~0.1ms per fusion → 50ms/sec total.
- **Spatial clustering**: `processObservationBatch` clusters by proximity. Linear scan is O(N²) — becomes ~125,000 comparisons at 500 obs.

**Verdict**: Fusion is CPU-bound but manageable on 2+ cores with partitioning.

### 2.2 WebSocket Broadcasting
Current: JSON-serialize full RAP picture every tick → broadcast to all clients.

At 100 tracks with geometry: ~50KB per broadcast × 10 clients × 5 Hz = **2.5 MB/sec outbound**. Manageable for network, but JSON serialization at 5 Hz becomes a bottleneck.

### 2.3 Scenario Simulation
`ScenarioRunner.step()` iterates all targets × all sensors per tick. At 100 × 20 = 2,000 detection checks, each involving range/bearing/noise computation. Currently ~0.05ms each → 100ms/tick. Tight at 5 Hz.

### 2.4 Memory
Per track: ~2KB (state, covariance, history). Per sensor: ~1KB. Event store: grows unbounded.
At 100 tracks × 5 min: ~1MB tracks + ~50MB event store. Well within 2Gi.

---

## 3. Horizontal Scaling Architecture

### 3.1 Service Decomposition

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
│              (Cloud Run / nginx)                         │
└──────┬───────────┬───────────┬──────────────────────────┘
       │           │           │
┌──────▼──┐  ┌─────▼───┐  ┌───▼──────┐
│ API      │  │ API      │  │ API       │  ← Stateless HTTP/WS
│ Gateway  │  │ Gateway  │  │ Gateway   │     (N replicas)
│ + WS     │  │ + WS     │  │ + WS      │
└────┬─────┘  └────┬─────┘  └────┬──────┘
     │             │              │
     └─────────┬───┘──────────────┘
               │
     ┌─────────▼──────────┐
     │   Redis Pub/Sub    │ ← RAP broadcast relay
     │   (Memorystore)    │
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │  Fusion Engine      │ ← Single-writer process
     │  (Cloud Run Job     │    (or primary replica)
     │   or dedicated VM)  │
     └─────────┬──────────┘
               │
     ┌─────────▼──────────┐
     │   PostgreSQL        │ ← Persistent state
     │   (Cloud SQL)       │
     └────────────────────┘
```

### 3.2 Key Design Decisions

**Single-Writer Fusion**: Track fusion requires consistent state (covariance matrices, track IDs). Running multiple fusion writers creates split-brain. Keep fusion as a **single process** with failover, not horizontal sharding.

**Stateless API Gateways**: HTTP routes and WebSocket connections are stateless. Scale horizontally behind a load balancer. Each gateway subscribes to Redis Pub/Sub for RAP updates.

**Redis Pub/Sub for Broadcast**: Replaces direct WS broadcast from fusion engine. Fusion publishes RAP updates to Redis channel; all API gateways receive and forward to their connected clients.

**PostgreSQL for Durability**: Event store, user sessions, scenario configs, audit logs. Not in the hot path — fusion works in-memory, persists asynchronously.

---

## 4. Optimized Fusion Pipeline

### 4.1 Spatial Indexing
Replace linear scan correlation with **R-tree** spatial index:

```typescript
import RBush from 'rbush';

class SpatialTrackIndex {
  private tree = new RBush<TrackEntry>();

  // Insert/update track bounding box (position ± 3σ)
  update(track: SystemTrack): void;

  // Find candidate tracks within gate distance
  query(obs: Observation, gateM: number): SystemTrack[];
}
```

R-tree reduces correlation from O(N×M) to O(N × log(M)) for spatially distributed targets.

### 4.2 Batch Processing
Group observations arriving within a tick window (200ms) and process as a batch:

```typescript
// Current: process one at a time
for (const obs of observations) {
  trackManager.processObservation(obs);
}

// Optimized: batch with spatial clustering
const clusters = spatialCluster(observations, clusterRadiusM);
for (const cluster of clusters) {
  trackManager.processObservationBatch(cluster);
}
```

### 4.3 Covariance Computation
The information matrix fusion involves 6×6 matrix operations. For 500 updates/sec:

- Current JS: ~0.1ms per fusion → 50ms/sec (acceptable)
- If needed: Pre-compiled WASM module for matrix math → ~10× speedup
- Alternative: Simplified 2D fusion (4×4) for confirmed tracks where altitude is stable

### 4.4 Track Partitioning (Future)
For 500+ targets, partition tracks by geographic sector:

```
Sector A (North): Fusion Worker A handles tracks in [32°N-33°N]
Sector B (South): Fusion Worker B handles tracks in [31°N-32°N]
Overlap zone: Both workers correlate, primary resolves duplicates
```

Adds complexity — only justified above 500 simultaneous targets.

---

## 5. WebSocket Optimization

### 5.1 Delta Encoding
Instead of full RAP snapshot every tick, send only changed fields:

```typescript
interface RapDelta {
  tick: number;
  updated: Array<{ id: string; lat?: number; lon?: number; alt?: number; status?: string }>;
  removed: string[];  // Track IDs dropped
  added: SystemTrack[];  // Full data for new tracks
}
```

Expected reduction: 50KB → 2-5KB per tick (90%+ reduction).

### 5.2 Binary Encoding
Replace JSON with MessagePack or Protocol Buffers for WS messages:

| Format | 100 tracks payload | Encode time | Decode time |
|--------|-------------------|-------------|-------------|
| JSON | ~50KB | ~5ms | ~3ms |
| MessagePack | ~25KB | ~2ms | ~1ms |
| Protobuf | ~15KB | ~1ms | ~0.5ms |

Recommendation: **MessagePack** — good compression, no schema compilation step, easy migration from JSON.

### 5.3 Client-Side Throttling
Operators viewing zoomed-in regions don't need updates for off-screen tracks. Implement viewport-based filtering:

```typescript
// Server-side: client registers viewport
ws.on('viewport', ({ bounds }) => {
  client.viewport = bounds;
});

// Broadcast: filter per client
for (const client of clients) {
  const visible = tracks.filter(t => isInBounds(t, client.viewport));
  client.send(encode(visible));
}
```

---

## 6. Event Sourcing at Scale

### 6.1 Current Event Store
In-memory array, unbounded growth. At 500 events/sec × 15 min = 450,000 events (~90MB).

### 6.2 Scaled Event Store

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  tick INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_session_tick ON events(session_id, tick);
CREATE INDEX idx_events_entity ON events(entity_id);
```

**Write strategy**: Batch INSERT every 1 second (500 events/batch). PostgreSQL handles this easily.

**Read strategy**: Query by session + tick range for replay. JSONB indexing for entity-specific queries.

**Retention**: Auto-delete sessions older than 30 days via pg_cron.

### 6.3 Replay from Events
Full deterministic replay by replaying events through fusion pipeline:

```typescript
async replaySession(sessionId: string, fromTick: number, toTick: number) {
  const events = await db.query(
    'SELECT * FROM events WHERE session_id = $1 AND tick BETWEEN $2 AND $3 ORDER BY tick, id',
    [sessionId, fromTick, toTick]
  );
  for (const event of events) {
    trackManager.processEvent(event);
  }
}
```

---

## 7. Cloud Run Deployment at Scale

### 7.1 Resource Sizing

| Component | CPU | Memory | Min Instances | Max Instances |
|-----------|-----|--------|---------------|---------------|
| API Gateway | 1 vCPU | 512Mi | 1 | 10 |
| Fusion Engine | 4 vCPU | 2Gi | 1 | 1 |
| PostgreSQL | 2 vCPU | 4Gi | 1 (Cloud SQL) | 1 |
| Redis | — | 1Gi | 1 (Memorystore) | 1 |

### 7.2 Cost Estimate (GCP)

| Component | Monthly Cost (est.) |
|-----------|-------------------|
| Cloud Run (API × 2 avg) | $30-60 |
| Cloud Run (Fusion × 1) | $40-80 |
| Cloud SQL (db-f1-micro) | $10-15 |
| Memorystore (1GB) | $35 |
| **Total** | **$115-190/mo** |

For demo/training use with intermittent load, costs drop significantly with min-instances=0 on API gateways.

### 7.3 Auto-Scaling Triggers
- API Gateway: Scale on concurrent connections (threshold: 50 per instance)
- Fusion Engine: No auto-scaling (single writer). Health check restarts on failure.

---

## 8. Monitoring & Observability

### 8.1 Key Metrics
```typescript
const metrics = {
  // Fusion performance
  'fusion.tick_duration_ms': histogram,
  'fusion.observations_per_sec': gauge,
  'fusion.active_tracks': gauge,
  'fusion.correlation_time_ms': histogram,

  // WebSocket
  'ws.connected_clients': gauge,
  'ws.broadcast_size_bytes': histogram,
  'ws.messages_per_sec': gauge,

  // System
  'system.memory_mb': gauge,
  'system.cpu_percent': gauge,
  'system.event_store_size': gauge,
};
```

### 8.2 Alerting
- Tick duration > 500ms → WARNING (fusion falling behind)
- Tick duration > 900ms → CRITICAL (real-time broken)
- Memory > 80% → WARNING
- WebSocket disconnection rate > 10%/min → WARNING

### 8.3 Structured Logging
```typescript
logger.info({
  component: 'fusion',
  tick: currentTick,
  tracks: activeTracks.length,
  observations: obsCount,
  durationMs: tickDuration,
  msg: 'tick complete'
});
```

Use Cloud Logging with structured JSON. Query by component, filter by duration.

---

## 9. Migration Path

### Phase 1: Vertical Scaling (Current → 50 targets)
- Increase Cloud Run to 2 vCPU, 1Gi
- Add R-tree spatial indexing
- Implement delta encoding for WS
- Add event store batching to PostgreSQL
- **Effort**: 1-2 weeks

### Phase 2: Service Split (50 → 200 targets)
- Separate fusion engine from API gateway
- Add Redis Pub/Sub for RAP relay
- Stateless API gateways with horizontal scaling
- MessagePack binary encoding
- **Effort**: 2-3 weeks

### Phase 3: Full Scale (200+ targets)
- Geographic track partitioning
- WASM matrix computation
- Viewport-based client filtering
- Event replay infrastructure
- **Effort**: 3-4 weeks

---

## 10. Technology Recommendations

| Need | Recommended | Alternative |
|------|-------------|-------------|
| Spatial index | rbush (R-tree) | Flatbush (static) |
| Message relay | Redis Pub/Sub | NATS |
| Binary encoding | MessagePack | Protobuf |
| Matrix math | Current JS | WASM (assemblyscript) |
| Monitoring | Cloud Monitoring | Prometheus + Grafana |
| Task queue | Bull (Redis) | Cloud Tasks |

---

## 11. Conclusion

ELOC2 can scale to 100+ targets on a single optimized process (Phase 1) with R-tree indexing and delta encoding. Beyond 50 targets, splitting fusion from API gateways (Phase 2) provides horizontal scaling for operators while maintaining fusion consistency. The architecture avoids premature complexity — each phase is adopted only when the previous phase's limits are reached.

Key principle: **Fusion is inherently single-writer**. Scale reads (API, WebSocket) horizontally; scale writes (fusion) vertically until geographic partitioning is justified.
