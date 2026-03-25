# Optimal EO Staring Sensor Deployment — 3×360° Layout

## 1. Problem Statement

Deploying 360° staring MWIR EO sensors for passive air defense requires optimizing two competing objectives:
- **Triangulation accuracy** — requires large baselines (sensor spacing)
- **Detection coverage** — requires sensors within detection range of targets

This document defines the optimal geometry for a 3-sensor equilateral triangle deployment, derived from bearing-only triangulation mathematics and validated against ELOC2 simulation results.

## 2. Triangulation Geometry Fundamentals

### Intersection Angle

With bearing-only sensors, position accuracy depends on the **intersection angle** between bearing lines from different sensors:

- **Optimal**: 90° (orthogonal bearings → minimum position uncertainty)
- **Usable range**: 15°–165°
- **Degraded**: <15° or >165° (near-parallel bearings → position blows up along the baseline)

### Position Error Formula

For two sensors separated by baseline `d`, observing a target at range `R`:

```
CEP ≈ (σ_bearing × R²) / (d × sin(θ))
```

Where:
- `σ_bearing` = bearing noise (0.1° for cooled MWIR staring sensors)
- `R` = range from sensor to target
- `d` = baseline distance between sensors
- `θ` = intersection angle

### Key Insight

Doubling the baseline **halves** the position error. But the baseline cannot exceed the detection range, or the sensors lose mutual coverage.

## 3. Optimal 3-Sensor Layout

### Why Equilateral Triangle

For 3 sensors, the equilateral triangle is optimal because:
1. **Maximizes worst-case intersection angle** — minimum angle at center is 60° (excellent)
2. **Symmetric coverage** — no blind sectors
3. **Maximum enclosed area** for a given perimeter
4. **Any target inside the triangle** is seen by all 3 sensors with at least two pairs having usable intersection angles

```
        S1 (North)
       /  \
      /    \
     /  ⊕   \       ⊕ = defense center
    /        \
   S2─────────S3
  (SW)       (SE)
```

### Geometry Properties

For equilateral triangle with side length `d`:

| Property | Formula | Example (d=21km) |
|----------|---------|-------------------|
| Side length | `d` | 21 km |
| Center-to-vertex | `d / √3` | 12.1 km |
| Center-to-edge | `d / (2√3)` | 6.1 km |
| Enclosed area | `(√3/4) × d²` | 191 km² |
| Min intersection angle (center) | 60° | 60° |
| Min intersection angle (edge) | ~30° | ~30° |

## 4. Distance Optimization

### Detection Range Constraints (Cooled MWIR)

| Target Type | IR Signature | Max Detection Range | Effective Range |
|-------------|-------------|--------------------|-----------------|
| Fighter aircraft | High | 55 km | 40 km |
| Helicopter | Medium | 35 km | 25 km |
| UAV/Drone (Shahed) | Very low | 20–30 km | 15–20 km |
| Ballistic missile | Very high | 55+ km | 50 km |

### Optimal Spacing Table

| Detection Range | Triangle Side | Center-to-Vertex | Coverage Radius | CEP at 20km |
|----------------|--------------|-------------------|-----------------|-------------|
| 15 km (uncooled) | **12 km** | 6.9 km | ~12 km | ~58m |
| 25 km (cooled) | **20 km** | 11.5 km | ~20 km | ~35m |
| 40 km (cooled MWIR) | **25 km** | 14.4 km | ~28 km | ~27m |
| 55 km (max cooled) | **35 km** | 20.2 km | ~40 km | ~20m |

### Recommended Configuration

For general air defense with cooled MWIR sensors (`maxDetectionRangeM: 40,000`):

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Geometry** | Equilateral triangle | Best worst-case intersection angle |
| **Side length** | **20–25 km** | Balances baseline vs coverage overlap |
| **Center-to-vertex** | **11.5–14.4 km** | All sensors within mutual detection range |
| **Coverage zone** | ~20–28 km radius | Triple-covered core, dual-covered edges |
| **Sensor altitude** | 15–25m mast | Minimizes terrain masking |
| **FOV** | 360° azimuth, ±10° elevation | Full hemisphere staring |

## 5. Why NOT Larger Spacing?

If sensors are spaced at 40 km (the detection range limit):
- A target **between** sensors at 20 km has excellent triangulation
- A target **behind** a sensor (away from triangle) is seen by only 1–2 sensors at long range with poor intersection angles
- **UAV detection suffers most** — their low IR signature limits effective range to 15–20 km

The **20–25 km sweet spot** ensures:
- All targets within the defense zone are seen by **all 3 sensors**
- Even edge targets have ≥2 sensors with usable angles (≥30°)
- UAV detection probability stays high (closer = stronger IR signal)
- Formation discrimination is possible (0.1° angular resolution at 20 km ≈ 35m)

## 6. Multi-Cluster Extension

For larger defense zones, deploy multiple 3-sensor clusters:

```
    Cluster A          Cluster B
    △                  △
   S1-S2-S3          S4-S5-S6
        ↘            ↙
         Defense Zone
        ↗            ↘
   S7-S8-S9          S10-S11-S12
    △                  △
    Cluster C          Cluster D
```

Each cluster covers ~20 km radius. Clusters can share triangulation across boundaries for targets visible to sensors from adjacent clusters (cross-cluster baselines of 40+ km give excellent accuracy for high-altitude targets).

## 7. Implementation in ELOC2

### Sensor Configuration

```typescript
const TRIANGLE_RADIUS_DEG = 0.11;  // ~12.2 km center-to-vertex → ~21 km sides
const TRIANGLE_ANGLES = [90, 210, 330]; // North, SW, SE — equilateral

const sensors = TRIANGLE_ANGLES.map((angleDeg, i) => ({
  sensorId: `EO-STARE-${i + 1}`,
  type: 'eo',
  position: {
    lat: CENTER_LAT + TRIANGLE_RADIUS_DEG * Math.sin(angleDeg * Math.PI / 180),
    lon: CENTER_LON + TRIANGLE_RADIUS_DEG * Math.cos(angleDeg * Math.PI / 180)
                    / Math.cos(CENTER_LAT * Math.PI / 180),
    alt: 20,
  },
  coverage: { minAzDeg: 0, maxAzDeg: 360, minElDeg: -3, maxElDeg: 20, maxRangeM: 40_000 },
  fov: { halfAngleHDeg: 180, halfAngleVDeg: 10 },
  slewRateDegPerSec: 0, // staring — no gimbal
  maxDetectionRangeM: 40_000,
}));
```

### Expected Performance

At the 15 Hz pipeline rate with 3×360° staring sensors:
- **Detection latency**: <200ms (bearing generated every tick)
- **Triangulation latency**: <400ms (cross-sensor match + triangulate)
- **Track confirmation**: ~500ms (5 updates at 15 Hz)
- **Position accuracy**: 25–60m CEP depending on range
- **Formation discrimination**: Down to ~35m at 20 km range

## 8. Comparison: 3-Sensor vs 5-Sensor Pentagon

| Metric | 3-Sensor Triangle | 5-Sensor Pentagon (current) |
|--------|-------------------|---------------------------|
| Sensor count | 3 | 15 (5 clusters × 3) |
| Min intersection angle | 60° | 72° |
| Coverage radius | ~20 km | ~25 km |
| CEP at center | ~30m | ~20m |
| Cost | Low | 5× higher |
| Redundancy | None | 2-sensor failure tolerant |
| Best for | Point defense, cost-constrained | Area defense, high reliability |

The 3-sensor triangle is the **minimum viable configuration** for bearing-only triangulation. For operational deployments, the 5-cluster pentagon provides better coverage and redundancy.
