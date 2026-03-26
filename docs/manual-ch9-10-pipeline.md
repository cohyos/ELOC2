## 9. Pipeline Flow

### 9.1 Internal Architecture

ELOC2 operates on a **dual-rate architecture**:

- **Internal pipeline**: 15 Hz (66.7ms ticks) — full simulation fidelity
- **Workstation broadcast**: 2 Hz (500ms updates) — smooth UI without overload

The pipeline processes target generation, sensor observations, track management, fusion, and EO tasking at 15 Hz. The workstation receives coalesced updates at 2 Hz via WebSocket, with `requestAnimationFrame` batching on the frontend.

### 9.2 Monolithic Pipeline (LiveEngine)

The main production pipeline executes this sequence every tick:

1. **ScenarioRunner.step(1/15)** — advances simulation by 66.7ms, generates `SimulationEvent[]` (observations, bearings, faults, operator actions)
2. **Observation batch processing** — radar/C4ISR observations processed through `TrackManager.processObservationBatch()` with spatial clustering
3. **Bearing accumulation** — EO bearings collected per sensor for batch triangulation
4. **Core EO Detector** — cross-sensor bearing correlation → triangulation when ≥2 sensors overlap → 3D EO targets → promotion to system tracks
5. **Stale track detection** — time-based (3-second grace period), marks unupdated tracks as missed
6. **Track merge sweep** — eliminates ghost/duplicate tracks within 500m merge distance
7. **EO tasking cycle** — runs every 3 sim-seconds: candidate scoring → policy engine → sensor assignment → gimbal commands
8. **Search mode update** — idle investigators enter sector scan after 3 seconds (45 ticks)
9. **Gimbal tracking** — continuous pointing update for assigned EO investigators
10. **Quality metrics** — computes track-vs-ground-truth accuracy metrics
11. **broadcastRap()** — sends tracks, sensors, geometry, events via WebSocket (throttled to 2 Hz). Events are batched (not sent individually).

### 9.3 Distributed Pipeline

The new architecture (124 tests, ready for integration) uses independent sensor instances:

1. **DistributedPipeline.tick()** — broadcasts `GroundTruthBroadcast` on `SensorBus`
2. **SensorInstance.tick()** — each sensor independently filters GT by coverage, generates observations
3. **Radar/C4ISR sensors** — maintain local tracks via own `TrackManager`, publish `SensorTrackReport`
4. **EO sensors** — generate bearing reports via `generateEoBearing()`, publish `BearingReport`
5. **EoCoreEntity** — aggregates bearings → finds cross-sensor matches → triangulates (≥2 sensors) → manages EO tracks
6. **EO CORE publishes** — triangulated positions as `SensorTrackReport` (sensorId=`EO-CORE`) with quality-based covariance
7. **SystemFuser** — correlates all incoming local tracks → information-matrix fusion (in ENU coordinates) → system tracks
8. **InvestigatorCoordinator** — assigns EO sensors to highest-priority system tracks via `CueCommand`

### 9.4 Sensor Update Rates (at 15 Hz)

| Sensor Type | Step Modulo | Effective Rate | Update Interval |
|-------------|-------------|----------------|-----------------|
| Radar | every 15th step | 1.0 Hz | 1.0 seconds |
| EO | every 30th step | 0.5 Hz | 2.0 seconds |
| C4ISR | every 180th step | 0.083 Hz | 12.0 seconds |

---

## 10. Track Building & Fusion

### 10.1 Observation Ingestion

Each radar/C4ISR observation is normalized to a `SourceObservation` with:
- Position (lat, lon, alt)
- Covariance (3×3 matrix in meters²)
- Timestamp (milliseconds)
- Sensor ID

### 10.2 Correlation

The correlator determines whether an observation belongs to an existing track or requires a new track:

- **Mahalanobis distance gating**: d² = Δx^T × S⁻¹ × Δx, where S = P_track + P_obs + Q_process
- **Gate threshold**: 25.0 (permissive, ~99.9997% for 3-DoF chi-squared)
- **Velocity gating**: rejects if speed difference > 75 m/s
- **Covariance floor**: 5000 m² minimum diagonal (prevents over-tight gates)
- **Association modes**: Nearest-Neighbor (default), JPDA (dense scenarios), Auto (switches based on cluster density)

### 10.3 Information-Matrix Fusion

Fuses observation into existing track using the information-matrix approach:

```
P_fused = (P_track⁻¹ + P_obs⁻¹)⁻¹
x_fused = P_fused × (P_track⁻¹ × x_track + P_obs⁻¹ × x_obs)
```

**Key**: Operates in **ENU coordinates** (East-North-Up) centered on the track position to avoid the ~15% east-west distortion that occurs when fusing directly in lat/lon space.

Fallback: simple position averaging if any matrix inversion fails.

### 10.4 Kalman Prediction

Three motion models available:

| Model | Use Case | Process Noise (qSigma) |
|-------|----------|----------------------|
| Constant Velocity (CV) | Straight-line flight | 5 m/s² |
| Coordinated Turn (CT) | Maneuvering targets | 10 m/s² |
| Ballistic | BMs in free flight | 2 m/s² + gravity |

Process noise Q scales naturally with dt: position terms ~ dt⁴, velocity terms ~ dt². At 15 Hz (dt=67ms), Q per tick is very small, enabling tight covariance maintenance.

### 10.5 IMM (Interacting Multiple Model)

Runs CV and CT models in parallel per track:

1. **Mixing**: weighted combination of model states based on transition probabilities
2. **Prediction**: each model predicts independently
3. **Update**: each model processes the observation
4. **Probability renormalization**: model likelihoods updated using proper 3×3 determinant computation

Transition probabilities: 0.95 self-transition, 0.05 model switch. Log-determinant computed via Cholesky-based 3×3 cofactor expansion (not diagonal approximation).

### 10.6 Existence Probability

Bayesian IPDA (Integrated Probabilistic Data Association):

- **Detection**: Pe increases based on detection probability Pd
- **Miss**: Pe decreases based on (1-Pd)
- **Cap**: Pe ≤ 0.999 (prevents singularity where misses have no effect)

### 10.7 Track Lifecycle at 15 Hz

| Transition | Trigger | Approx Time |
|------------|---------|-------------|
| candidate → tentative | Pe > 0.5 | ~200-333ms |
| tentative → confirmed | Pe > 0.8 or 5 updates | ~333ms |
| confirmed → coasting | 15 missed updates | ~1.0s |
| coasting → dropped | 45 total misses | ~3.0s |

### 10.8 EO Triangulation

1. **Bearing aggregation**: collect all bearings from EO sensors per tick
2. **Cross-sensor matching**: group bearings by target ID (simulation mode) or angular proximity (real mode)
3. **Triangulation**: closest-point-of-approach (CPA) for 2 bearings, weighted average for 3+
4. **Quality scoring**: based on intersection angle — strong (>30°), acceptable (10-30°), weak (<10°)
5. **EO track covariance**: quality-adaptive — strong: 50m², acceptable: 200m², weak: 1000m²
6. **Publication**: EO CORE publishes tracks as `SensorTrackReport` to SystemFuser for fusion with radar tracks
