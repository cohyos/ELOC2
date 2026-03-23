# Pipeline Timing & Communication Gap Analysis

## Date: 2026-03-23
## Status: Active — findings implemented, monitoring in place

---

## 1. Executive Summary

Diagnostic testing of the ELOC2 processing pipeline revealed **three root causes** of quality degradation:

1. **`s.type` vs `s.sensorType` bug** — EO allocation quality always showed 0% because `computeEoAllocationQuality()` filtered sensors using `s.type === 'eo'` instead of `s.sensorType === 'eo'`. The `SensorState` interface uses `sensorType`, not `type`. **Fixed.**

2. **Track proliferation from unimplemented coasting timeout** — The `maxCoastingTimeSec` config existed but was never enforced in `missedUpdate()`. Coasting tracks lingered for 25-30+ seconds because existence probability decays slowly from Pe≈1.0. With Pd=0.9 and Pfa=0.01, ~25 consecutive misses are needed to drop Pe below 0.05. **Fixed:** Added enforcement of `maxCoastingTimeSec` in `missedUpdate()` and reduced from 30s to 15s.

3. **EO bearing→cue matching uses Date.now()** — The `isCueValid()` function and `matchBearingToCue()` use `Date.now()` (wall clock) while cue validity windows are set from `Date.now()` at creation time. In real-time mode this is consistent, but in `seek()` mode (used by tests and replay), `Date.now()` barely advances → cues never expire → 36+ active cues accumulate. **Documented as known limitation** — affects test/replay only, not live operation.

---

## 2. Complete Pipeline Timing Model

### 2.1 Time Domains in the System

The system uses **two distinct time domains** that MUST NOT be mixed:

| Domain | Type | Format | Where Used |
|--------|------|--------|------------|
| **Simulation time** | `number` (seconds) | 0-600+ | `state.elapsedSec`, track `lastUpdated`, dwell timing, tasking intervals, stale detection, coasting timeout |
| **Wall clock time** | `number` (ms since epoch) | ~1.7e12 | `Date.now()`, cue `validFrom`/`validTo`, `isCueValid()`, task `createdAt`, EoTrack `lastUpdated` |

### Critical Time Domain Mappings

```
Simulation Time                 Wall Clock Time
─────────────                   ─────────────
ScenarioRunner.currentTimeSec   Date.now()
observation.timestamp           issueCue() → validFrom/validTo
track.lastUpdated (should be    matchBearingToCue() → now
  sim time via obs.timestamp)   expireStaleEoCues() → now
dwellState.dwellStartSec        createEoTrack() → lastUpdated
EO_TASKING_INTERVAL_SEC (3s)    DEFAULT_VALIDITY_WINDOW_MS (30,000ms)
maxCoastingTimeSec (15s)
```

### 2.2 Speed Scaling Effects

| Speed | Wall Tick Interval | Sim Step | Impact |
|-------|-------------------|----------|--------|
| 0.5x | 2000ms | 1s | Wall time slower than sim → cues expire faster relative to sim |
| 1.0x | 1000ms | 1s | Aligned — no drift |
| 2.0x | 500ms | 1s | Wall time faster than sim → cues expire slower relative to sim |
| 5.0x | 200ms | 1s | Significant drift — 30s cue validity = 150 sim seconds |
| 10x  | 100ms | 1s | Severe drift — cues effectively never expire |
| seek() | ~0ms | 1s | Extreme — Date.now barely changes, all cues perpetually valid |

---

## 3. Per-Stage Pipeline Timing

### Stage 1: Scenario → Observation Generation

| Sensor Type | Update Rate | Mechanism |
|-------------|-------------|-----------|
| Radar | Every tick (1s sim) | `shouldSensorUpdate('radar') → true` |
| EO | Every 2 ticks (2s sim) | `shouldSensorUpdate('eo') → stepCount % 2 === 0` |
| C4ISR | Every 12 ticks (12s sim) | `shouldSensorUpdate('c4isr') → stepCount % 12 === 0` |

**Timing constants:**
- `dtSec = 1` — Fixed 1-second simulation step per tick
- `intervalMs = 1000 / speed` — Wall-clock interval between ticks
- Observations are batched per tick (all sensors fire, results collected)

### Stage 2: Observation → Track Creation/Update

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| `processObservationBatch()` | Every tick | None — synchronous within tick |
| Spatial clustering | 5km radius | May merge observations incorrectly if >5km error |
| Correlator gate | `gateThreshold: 20.0` | Prediction dt depends on `track.lastUpdated` |
| `markStaleTracksAsMissed()` | Every tick, grace=3 ticks | Track not missed until 3 ticks without update |
| `mergeCloseTracks()` | Every tick, 8km merge distance | Slow convergence if tracks drift apart |

**Timestamp handling in correlator:**
- `track.lastUpdated` set from `observation.timestamp` (simulation time)
- Correlator uses `dt = observation.timestamp - track.lastUpdated` for prediction
- If timestamps are consistent (both sim time), prediction is accurate
- ⚠ Track creation uses `observation.timestamp` but some paths may mix in `Date.now()`

### Stage 3: Track Confirmation → EO Tasking

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| Track confirmation | After `confirmAfter: 3` updates | 3 ticks minimum |
| EO tasking interval | `EO_TASKING_INTERVAL_SEC = 3` | Up to 3s delay from confirmation to cue |
| Candidate generation | Generates all track×sensor pairs | None — computed fresh each cycle |
| Scoring | Multi-criteria with anti-ping-pong | Penalties may suppress valid candidates |
| Policy application | `auto_with_veto` mode | None — auto-approve by default |
| Task assignment | Greedy, one per sensor | Sensors still dwelling are excluded |

**EO tasking cycle (every 3 sim seconds):**
1. Check dwell completions → free sensors
2. Generate candidates from available sensors × confirmed tracks
3. Score: threat + uncertainty + geometry + intent + slew + occupancy
4. Apply policy (auto approve)
5. Assign tasks (greedy)
6. Issue cues + create tasks + update gimbal

### Stage 4: EO Cue → Bearing Detection

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| Cue validity window | 30,000ms (Date.now based) | At >1x speed, window is effectively longer in sim time |
| Bearing generation | Every 2 ticks for EO sensors | Max 2s delay |
| Gimbal pointing | Updated every tick | Slew time = angle / 60 deg/sec |
| `matchBearingToCue()` | Per bearing event | Requires matching task.sensorId AND executing status |

**Critical path:** Bearing → `matchBearingToCue()` → `pendingBearings` → `processAccumulatedBearings()` → `createEoTrack()`

### Stage 5: EO Track → Geometry Estimation

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| `computeGeometryEstimates()` | Every tick | None — synchronous |
| Requirement | ≥2 EO sensors with bearings on same track | **Major bottleneck** — requires 2+ sensors assigned |
| `triangulateMultiple()` | Immediate when data available | None |
| Quality scoring | Intersection angle check | <30°: weak, 30-60°: acceptable, >60°: strong |

**Root cause of 0% geometry:** The scenario has 3 EO sensors with slewRate=60°/s, but the tasking engine assigns one sensor per track (greedy). Getting 2 sensors on the same track requires the same target to be the top candidate for 2 different sensors in the same tasking cycle.

### Stage 6: Dwell Management

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| Default dwell duration | `DEFAULT_DWELL_SEC = 15` | Sensor locked to target for 15s |
| Dwell completion check | Every 3s (tasking cycle) | Up to 3s after dwell expires |
| Anti-ping-pong | Penalties [-3, -1.5, -0.5] for last 3 targets | May delay revisit scheduling |
| Max revisit interval | `MAX_REVISIT_INTERVAL_SEC = 60` | Overdue boost only after 60s |

### Stage 7: Quality Assessment

| Component | Timing | Potential Delay |
|-----------|--------|-----------------|
| `computeQualityMetrics()` | Every tick | None |
| `buildDecisionChains()` | Every 5 sim seconds | Chains may be 5s stale |
| `computeEoAllocationQuality()` | Every tick | ~~Uses `s.type` instead of `s.sensorType`~~ **FIXED** |
| GT matching | 5km threshold, greedy assignment | None |

---

## 4. Identified Pipeline Gaps (from Diagnostic Tests)

### Gap 1: Track Proliferation (FIXED)
- **Symptom:** 19 tracks for 8 GT targets, 68% false track rate
- **Root cause:** `maxCoastingTimeSec` never enforced in `missedUpdate()`
- **Fix:** Added coasting timeout enforcement; reduced from 30s to 15s
- **Test:** DIAG-11, DIAG-12, DIAG-13

### Gap 2: EO Allocation Quality Always 0% (FIXED)
- **Symptom:** All EO allocation metrics (coverage, dwell, triangulation, utilization) at 0%
- **Root cause:** `s.type === 'eo'` instead of `s.sensorType === 'eo'` at line 5122
- **Fix:** Changed to `s.sensorType === 'eo'`
- **Test:** DIAG-6, DIAG-10

### Gap 3: EO Bearing → EO Track Latency (225 seconds)
- **Symptom:** First EO track created at T+228s despite cues at T+3s
- **Root cause:** Simulator generates bearings for all EO sensors, but most don't have matching active tasks. The tasking cycle creates tasks, but task sensorId must exactly match the bearing's sensorId.
- **Contributing factor:** EO sensors generate bearings every 2s, but tasking assigns sensors in 3s cycles. Bearings arriving before the first tasking cycle at T+3s have no cues to match.
- **Mitigation:** Pipeline health monitoring now tracks bearing match rate

### Gap 4: Geometry Quality Always 0%
- **Symptom:** No geometry estimates created
- **Root cause:** Requires ≥2 EO sensors with bearings on the same track simultaneously. The greedy tasking algorithm assigns at most 1 sensor per track per cycle.
- **Impact:** 15% weight in chain quality formula is always 0
- **Theoretical max with 1 radar, no geometry:** 79.3%

### Gap 5: Fusion Diversity Limited to 33%
- **Symptom:** Tracks have 1 sensor source type (radar only)
- **Root cause:** Chain quality formula: `fusionEfficiency = min(1, sources.length / 3)`. With 1 radar source, this is 0.333. Even with radar + EO, it's 0.667.
- **Impact:** 10% weight in chain quality — max 33% without multi-sensor

---

## 5. Time Stamps Used per Pipeline Component

| Component | Timestamp Field | Time Domain | Notes |
|-----------|----------------|-------------|-------|
| `SourceObservation.timestamp` | `baseTimestamp + timeSec * 1000` | Hybrid (ms from epoch + sim) | Generated by ScenarioRunner |
| `SystemTrack.lastUpdated` | `observation.timestamp` | Sim-based ms | Set in `createTrack()`/`updateTrack()` |
| `EoCue.validFrom` | `Date.now()` | Wall clock ms | Set in `issueCue()` |
| `EoCue.validTo` | `Date.now() + 30_000` | Wall clock ms | 30s validity window |
| `Task.createdAt` | `Date.now()` | Wall clock ms | |
| `EoTrack.lastUpdated` | `Date.now()` | Wall clock ms | Set in `createEoTrack()` |
| `dwellState.dwellStartSec` | `state.elapsedSec` | Sim seconds | |
| `lastInvestigationTime` | `state.elapsedSec` | Sim seconds | |
| `lastEoTaskingSec` | `state.elapsedSec` | Sim seconds | |
| `markStaleTracksAsMissed()` | `currentTick (elapsedSec)` | Sim seconds | Tick-based, speed-independent |
| `matchBearingToCue()` | `Date.now()` for `isCueValid()` | Wall clock ms | Consistent with cue creation |
| `expireStaleEoCues()` | `Date.now()` | Wall clock ms | Consistent with cue creation |

**Key insight:** The cue lifecycle (issuance, validity check, expiration) is self-consistent using Date.now(). The dwell lifecycle (start, duration check, completion) is self-consistent using sim time. The two lifecycles run independently but are coupled by the tasking cycle which uses sim time.

---

## 6. Pipeline Health Monitoring (NEW)

### Implementation
Added `pipelineHealth` object in LiveEngine that tracks:
- **Milestones:** First timestamp (sim seconds) for each pipeline stage achievement
- **Bearing stats:** Total received, matched to cues, unmatched
- **Track proliferation:** Peak track-to-GT ratio
- **Gap detection:** Ticks since last EO track, ticks since last geometry
- **Health score:** 0-100 composite score deducting for known issues
- **Alerts:** Timestamped alerts for detected pipeline gaps

### API Endpoint
`GET /api/quality/pipeline-health` — Returns full pipeline health state

### WebSocket Broadcast
Pipeline health summary included in every `rap.update` message:
```json
{
  "pipelineHealth": {
    "healthScore": 75,
    "milestones": { "firstTrackCreated": 1, "firstTrackConfirmed": 2, ... },
    "bearingsReceived": 150,
    "bearingsMatched": 120,
    "bearingsUnmatched": 30,
    "peakTrackToGtRatio": 2.4,
    "alertCount": 1,
    "latestAlert": { "stage": "track_proliferation", "message": "...", "severity": "warning" }
  }
}
```

### Alert Conditions
| Condition | Severity | Threshold |
|-----------|----------|-----------|
| Track proliferation | Warning/Critical | Track:GT ratio > 3 / > 5 |
| EO bearing gap | Critical | >10 bearings received, 0 matched |
| EO track creation gap | Warning | No EO tracks for 60s despite active cues |

---

## 7. Recommendations for Future Robustness

### 7.1 Algorithm Hardening
1. **Multi-sensor geometry tasking:** Modify the greedy assignment algorithm to occasionally assign 2 sensors to the same high-priority track, enabling triangulation
2. **Existence probability decay acceleration:** Use higher Pd for coasting tracks (e.g., 0.95) to speed up Pe decay
3. **Cue validity using sim time:** Convert `isCueValid()` to use simulation time instead of `Date.now()` for consistent behavior across all playback speeds

### 7.2 Communication Gap Minimization
1. **Reduce EO tasking interval** from 3s to 2s for faster response to new tracks
2. **Reduce dwell duration** from 15s to 10s to increase sensor cycling rate
3. **Pre-cue on tentative tracks:** Issue EO cues on tentative tracks (not just confirmed) to reduce detection gap

### 7.3 Monitoring & Alerting
1. **Frontend display:** Show pipeline health score in the quality panel
2. **Bearing match rate indicator:** Visual indicator showing % of bearings matched to cues
3. **Track proliferation warning:** Alert operator when track:GT ratio exceeds threshold
4. **Stage waterfall chart:** Visual timeline showing when each pipeline stage activates

---

## 8. Diagnostic Test Suite

Test file: `apps/api/src/__tests__/pipeline-latency.test.ts`

| Test ID | Focus | Key Metric |
|---------|-------|------------|
| DIAG-1 | Observation → Track creation | Detection latency |
| DIAG-2 | Track confirmation → EO cue | Cue issuance latency |
| DIAG-3 | EO cue → Bearing detection | Bearing gap duration |
| DIAG-4 | EO track → Geometry estimate | Geometry latency |
| DIAG-5 | Dwell completion & cycling | Sensor idle percentage |
| DIAG-6 | End-to-end quality evolution | Full metric timeline |
| DIAG-7 | Time domain mixing | Date.now vs sim time |
| DIAG-8 | EO coverage gap analysis | Per-track EO status |
| DIAG-9 | Per-sensor utilization | Sensor idle periods |
| DIAG-10 | Pipeline bottleneck summary | First failure stage |
| DIAG-11 | Radar track proliferation | Track:GT ratio |
| DIAG-12 | Radar correlation timing | New vs updated tracks |
| DIAG-13 | Radar-only quality analysis | False track rate |
| DIAG-14 | Timestamp consistency | Mixed time domains |
| DIAG-15 | Complete timing summary | All milestones |

Run: `npx vitest run apps/api/src/__tests__/pipeline-latency.test.ts --reporter=verbose`
