# System Arena Construction Flow

## From Individual Sensor Detection to Fused System Picture

This document describes the complete data flow for constructing the Recognized Air Picture (RAP) in ELOC2, from raw sensor detections through to the fused system picture.

---

## Layer 1: Individual Sensor Detection

### Radar Systems

Each radar independently:
1. **Antenna scan** → raw RF returns (range, azimuth, elevation, Doppler, RCS)
2. **CFAR detection** → threshold against clutter
3. **Plot extraction** → individual detection with:
   - Position (lat, lon, alt) converted from polar
   - Radial velocity (Doppler)
   - RCS, SNR
   - Covariance matrix (measurement uncertainty)

### EO Sensors (Staring)

Each staring EO sensor independently:
1. **Continuous stare** → image stream
2. **Detection** → az/el bearing measurement
3. **Output**: `EoDetection` — bearing-only (no range), image quality score, IR signature

---

## Layer 2A: Radar-Level Track Building (per radar)

Each radar builds its own local track picture from successive plots:

```
Plot(n) ─────────────────────────────────────────────┐
     │                                                │
     ▼                                                ▼
┌──────────────────┐    ┌───────────────────────────────────────────────┐
│ CORRELATION GATE │    │  EXISTING RADAR TRACKS                       │
│                  │◄───│  (maintained by this radar's tracker)        │
│ • Position gate  │    │                                              │
│   (Mahalanobis)  │    │  Track A: pos, vel(vx,vy,vz),               │
│ • Velocity gate  │    │           acc(ax,ay,az), Doppler             │
│   (Doppler match)│    │  Track B: pos, vel, acc, Doppler             │
│ • RCS gate       │    │  Track C: pos, vel, acc, Doppler             │
└────────┬─────────┘    └───────────────────────────────────────────────┘
         │
    ┌────┴─────┐
    │ Match?   │
    └────┬─────┘
    YES  │    NO
  ┌──────┴──────┐
  ▼             ▼
UPDATE TRACK   CREATE NEW
(Kalman        TENTATIVE TRACK
 filter)       (initial state
               from first plot)
  │             │
  ▼             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6DOF CONSISTENCY EVALUATOR  (ConsistencyEvaluator)                │
│                                                                     │
│  For each track update:                                             │
│                                                                     │
│  1. PREDICT from previous cycle (constant-acceleration model):      │
│     pos_pred = pos_prev + vel*dt + 0.5*acc*dt²                      │
│     vel_pred = vel_prev + acc*dt                                    │
│                                                                     │
│  2. COMPUTE INNOVATION (predicted vs actual):                       │
│     ┌──────────────┬──────────────┬──────────────┬───────────────┐  │
│     │ Δ Position   │ Δ Velocity   │ Δ Accel.     │ Δ Doppler     │  │
│     │ (meters)     │ (m/s)        │ (m/s²)       │ (m/s)         │  │
│     │ gate: 500m   │ gate: 50m/s  │ gate: 15m/s² │ gate: 30m/s   │  │
│     └──────────────┴──────────────┴──────────────┴───────────────┘  │
│                                                                     │
│  3. ALL within gates?                                               │
│        YES → CONSISTENT: +5% confidence (×1.5 streak after 3)      │
│        NO  → INCONSISTENT: −8% confidence (scaled by overrun)      │
│                                                                     │
│  Acceleration estimated from consecutive velocity measurements.     │
│  Gates scale with dt (longer intervals → wider gates).              │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
   RADAR LOCAL TRACK
   • systemTrackId, position (lat, lon, alt)
   • velocity (vx, vy, vz), acceleration (estimated)
   • Doppler radial velocity, covariance (3×3)
   • confidence [0–1], consistencyScore [0–1]
   • status: tentative/confirmed, RCS, classification
```

### Track Lifecycle (existence-based)

```
candidate ──Pe≥0.5──▶ tentative ──Pe≥0.8──▶ confirmed
     │                     │                     │
     │     misses decay Pe │     misses decay Pe │
     └─────────────────────┴─────Pe<0.1──────────┴──▶ dropped
```

The 6DOF consistency evaluator **reinforces** the Bayesian existence probability:
- Consistent data accelerates Pe growth
- Inconsistent data slows or reverses Pe growth
- Streak bonus rewards stable, predictable tracks

---

## Layer 2B: EO Core — Centralized EO Target Building

All EO sensors report bearings to a **single EO Core** (`CoreEoTargetDetector`):

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  EO #1   │  │  EO #2   │  │  EO #3   │  │  EO #N   │
│ (staring)│  │ (staring)│  │ (staring)│  │ (staring)│
│ az/el    │  │ az/el    │  │ az/el    │  │ az/el    │
│ bearing  │  │ bearing  │  │ bearing  │  │ bearing  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     └──────┬──────┴──────┬──────┘             │
            ▼             ▼                    ▼
         ┌──────────────────────────────────────┐
         │            EO CORE                    │
         └──────────────────────────────────────┘
```

### EO Core Processing Steps

**Step 1: Ingest** — All bearing detections pooled by sensor

**Step 2: Cross-Sensor Correlation** — Union-find clustering
- Two bearings correlate if from different sensors AND rays plausibly intersect
- Check: convergent rays (both within ~90° of baseline direction)
- Precise: try triangulation, accept if miss distance < 5000m gate

**Step 3: Triangulation** (≥2 correlated bearings from ≥2 sensors)
- Pairwise ray intersections → weighted average position
- Quality: intersection angle, miss distance, sensor count

**Step 4: EO Target Track Building**
- Correlate new 3D point against existing EO targets
- Apply 6DOF consistency evaluator (same as radar)
- **Ambiguity resolution**: when multiple candidate positions exist,
  store them for N cycles and use consistency scoring to select
  the correct track (see Ambiguity Resolution section below)

**Classification progression:**
```
bearing_only → candidate_3d (2 sensors OR angle < 15°)
             → confirmed_3d (3+ sensors AND angle ≥ 15°)
```

**Enhanced cueing fallback:** Single-sensor detections match to nearest system track for investigation.

---

## Layer 3: System-Level Input Concentration

All source tracks arrive at the central system **in parallel**:

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐ ┌───────────────┐
│ RADAR #1  │ │ RADAR #2  │ │ RADAR #N  │ │  EO CORE     │ │ EXTERNAL C2   │
│ TRACKS    │ │ TRACKS    │ │ TRACKS    │ │  TARGETS     │ │ (if connected)│
│           │ │           │ │           │ │              │ │               │
│ pos, vel, │ │ pos, vel, │ │ pos, vel, │ │ pos, vel,    │ │ pos, vel,     │
│ acc,      │ │ acc,      │ │ acc,      │ │ acc, conf,   │ │ class, conf   │
│ Doppler,  │ │ Doppler,  │ │ Doppler,  │ │ geometry     │ │               │
│ RCS, conf │ │ RCS, conf │ │ RCS, conf │ │              │ │               │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬───────┘ └───────┬───────┘
      └─────────────┴──────┬──────┴──────────────┴─────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SOURCE INGEST & NORMALIZATION                                      │
│                                                                     │
│  • Normalize to common coordinate frame                             │
│  • Apply sensor registration (bias correction)                      │
│  • Time-align observations (clock health compensation)              │
│  • Tag each observation with source sensor ID + type                │
│  • Validate covariance matrices                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
```

---

## Layer 4: Central Fusion — Building the System Picture

### Multi-Dimensional Correlation Engine

For each incoming source track, correlate against all existing **system tracks**:

| Criterion | Method | Gate |
|-----------|--------|------|
| **Position** | Mahalanobis distance² against combined covariance | χ²(3) threshold |
| **Velocity (3D)** | Euclidean distance of velocity vectors | 50 m/s |
| **Acceleration** | Estimated from velocity history | 15 m/s² |
| **Doppler** | Radial velocity match | 30 m/s |
| **Historical trajectory** | ConsistencyEvaluator streak count + score | EMA-based |
| **Attributes** | RCS compatibility, classification, sensor type | Soft gate |

**Association mode** selected based on density and registration health:
- **NN** (nearest-neighbor) — low density, good registration
- **JPDA** — moderate density
- **MHT** — high density, complex scenarios
- **IPDA** — integrated probabilistic data association

### Fusion

```
Correlated? ──YES──▶ FUSE INTO SYSTEM TRACK
             │       Information-matrix fusion:
             │       P_fused = (P_sys⁻¹ + P_src⁻¹)⁻¹
             │       x_fused = P_fused·(P_sys⁻¹·x_sys + P_src⁻¹·x_src)
             │
             └──NO──▶ INITIATE NEW SYSTEM TRACK
                      Status: tentative, Confidence: 0.3
```

**Fusion modes** (selected by registration health):
- **Basic** — good registration, standard information-matrix
- **Conservative** — degraded registration, covariance intersection
- **Centralized** — full measurement fusion

### System-Level 6DOF Consistency

After every fusion update, the **same ConsistencyEvaluator** runs at system level:
- Predict system track state from previous cycle
- Compare predicted vs fused state
- Boost/decay confidence based on consistency
- High consistency + Bayesian existence → fast confirmation

---

## Layer 5: Fused System Picture (RAP)

The output is the **Recognized Air Picture** — a single unified table of system tracks:

| Field | Description |
|-------|-------------|
| **systemTrackId** | Unique system-level ID |
| **position** | Fused 3D position (best estimate of truth) |
| **velocity** | Fused 3D velocity (vx, vy, vz) |
| **acceleration** | Estimated from velocity history |
| **confidence** | Shaped by Bayesian existence × 6DOF consistency |
| **consistencyScore** | EMA of recent consistency evaluations |
| **sources** | Which sensors contributed (radar IDs, EO IDs, C2 IDs) |
| **fusionMode** | basic / conservative / centralized |
| **classification** | Threat classification |
| **geometryEstimate** | If EO triangulation contributed |
| **lineage** | Full history of observations and decisions |

Broadcast via WebSocket as `rap.update` → Operator workstations.

---

## Ambiguity Resolution via Consistency

When EO cross-sensor correlation produces ambiguous candidates (multiple potential 3D positions for the same bearing group), the system **stores candidates over N cycles** and uses the ConsistencyEvaluator to resolve:

1. **Candidate pool**: Each ambiguous group gets multiple candidate positions stored
2. **Per-candidate consistency tracking**: Each candidate gets its own consistency history
3. **Selection**: After `minCyclesForResolution` (default 3), the candidate with highest consistency score wins
4. **Promotion**: Winning candidate becomes the EO target; losers are discarded
5. **Fallback**: If no candidate achieves threshold after `maxCyclesBeforeEscalation` (default 8), escalate to operator

This leverages the fact that a **real target** produces consistent 6DOF data across cycles, while false intersections (ghosts) produce inconsistent trajectories.

---

## Summary Data Flow

```
Raw RF returns ──▶ Radar plots ──▶ Radar local tracks (with 6DOF consistency)
                                         │
Raw EO bearings ──▶ EO Core ──▶ Triangulated EO targets (with 6DOF consistency)
                                         │
External C2 tracks ──────────────────────┤
                                         │
                                         ▼
                                ┌─────────────────┐
                                │ CENTRAL FUSION   │
                                │                  │
                                │ Correlation by:  │
                                │ • Position       │
                                │ • Velocity (3D)  │
                                │ • Acceleration   │
                                │ • Doppler        │
                                │ • History match  │
                                │                  │
                                │ Fusion:          │
                                │ Information      │
                                │ matrix weighted  │
                                │ by confidence    │
                                │ & consistency    │
                                └────────┬─────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │ SYSTEM PICTURE   │
                                │ (RAP)            │
                                │                  │
                                │ Best estimate    │
                                │ of true air      │
                                │ picture, with    │
                                │ confidence per   │
                                │ track shaped by  │
                                │ 6DOF consistency │
                                └──────────────────┘
```

**Key insight**: Certainty is not just "did we see it?" — it's "does what we see now match what physics says we should see?" The 6DOF consistency evaluator operates at every level (radar local, EO core, system fusion) using the same constant-acceleration prediction model.

---

## Implementation References

| Component | File |
|-----------|------|
| ConsistencyEvaluator | `packages/fusion-core/src/track-management/consistency-evaluator.ts` |
| TrackManager (radar/system) | `packages/fusion-core/src/track-management/track-manager.ts` |
| CoreEoTargetDetector (EO core) | `apps/api/src/simulation/core-eo-detector.ts` |
| Information-matrix fuser | `packages/fusion-core/src/fusion/fuser.ts` |
| Correlator | `packages/fusion-core/src/correlation/correlator.ts` |
| Triangulator | `packages/geometry/src/triangulation/triangulator.ts` |
| Existence calculator | `packages/fusion-core/src/track-management/existence-calculator.ts` |
| Live engine integration | `apps/api/src/simulation/live-engine.ts` |
| Quality metrics (GT match) | `apps/api/src/simulation/live-engine.ts` (computeQualityMetrics) |
