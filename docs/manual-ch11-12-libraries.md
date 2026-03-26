## 11. Triangulation Geometry

Electro-optical (EO) sensors measure bearing angles to targets but cannot directly
determine range. When two or more EO sensors observe the same target from different
positions, their bearing lines intersect and the target position can be triangulated.
The accuracy of this triangulation depends critically on the geometry of the sensor
deployment.

### 11.1 Optimal Sensor Deployment

The ELOC2 system uses an **equilateral triangle** as the reference deployment geometry
for staring EO sensor clusters. This arrangement maximizes the minimum intersection
angle across the defended area.

**Reference deployment parameters:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Triangle side length | ~21 km | Maximizes baseline while staying within detection range |
| Center-to-vertex distance | ~12.2 km | Well within 40 km max detection range of MWIR sensors |
| Minimum intersection angle at center | 60 deg | Equilateral geometry guarantees this lower bound |
| Cluster internal spacing | ~1.5 km | 3 masts per cluster for local refinement |
| Cluster arrangement | N, SW, SE (90 deg, 210 deg, 330 deg) | Symmetric coverage of defended zone |

**How it works:**

Three sensor clusters are placed at the vertices of an equilateral triangle centered
on the defense area. Each cluster contains three staring sensors (each covering 120
degrees of azimuth) to provide full 360-degree coverage from that location. A target
anywhere within the triangle is observed by at least two clusters simultaneously,
producing bearing lines that intersect at angles no smaller than 60 degrees.

**Pentagon variant (EO Staring Defense scenario):**

For pure EO-only defense (no radar), five clusters are arranged in a regular pentagon
with ~12.2 km center-to-vertex radius. This provides:

- Adjacent baselines of ~14.3 km, diagonal baselines of ~23 km
- Every point in the defense zone covered by 3 or more staring sensors
- Minimum intersection angle of 36 degrees (vs. 60 degrees for triangle)
- Redundancy: any 2-sensor failure still leaves 3-sensor coverage

### 11.2 Detection Range vs. Geometry

The circular error probable (CEP) of a triangulated position depends on four factors:
bearing noise, range to target, baseline between sensors, and intersection angle.

**CEP formula:**

```
CEP  approx  (sigma_bearing * R^2) / (baseline * sin(theta))
```

Where:

| Symbol | Meaning | Typical value |
|--------|---------|---------------|
| sigma_bearing | Bearing measurement noise (radians) | 0.00175 rad (0.1 deg) |
| R | Range from sensor to target | 20,000 m |
| baseline | Distance between two sensors | 21,000 m |
| theta | Intersection angle at target | 60 deg |

**Worked example (optimal geometry):**

At 20 km range with a 21 km baseline and 0.1 degree bearing noise:

```
CEP = 0.00175 * (20000)^2 / (21000 * sin(60 deg))
    = 0.00175 * 4e8 / (21000 * 0.866)
    = 700000 / 18186
    approx 38 m
```

Under ideal conditions (near center of the triangle with favorable geometry), the
system achieves CEP values of approximately 30 m. This degrades as the target moves
further from the sensor baseline or as the intersection angle decreases.

**Geometry degradation factors:**

| Condition | Effect on CEP |
|-----------|---------------|
| Target at triangle center, 20 km range | ~30 m (best case) |
| Target at 30 km range, good angle | ~70 m |
| Intersection angle drops to 30 deg | CEP doubles |
| Intersection angle drops to 10 deg | CEP increases 6x |
| Single-sensor bearing only | No triangulation possible (bearing-only track) |

**Practical guidance:**

- Deploy sensors so that the defended area falls within the interior of the sensor polygon
- Maintain baselines of at least 15 km for targets at 20+ km range
- Avoid deploying all sensors in a line (collinear sensors produce degenerate geometry)
- The system automatically flags triangulations with intersection angles below 15 degrees as low-quality
- EO investigators can be cued to provide a third bearing line, improving geometry for edge cases

---

## 12. Libraries

The ELOC2 system includes three reference libraries that provide realistic threat,
sensor, and scenario data for training and demonstration. All libraries are accessible
from the **Libraries** view in the workstation (instructor role required for
create/update/delete operations).

### 12.1 Target Library (52 Types)

The target library contains 52 air platform definitions organized into six categories.
Each entry includes radar cross section (RCS), infrared emission signature, typical
speed and altitude, classification, and NATO APP-6 symbol code.

**Categories:**

| Category | Count | RCS Range (m^2) | Speed Range (m/s) | Altitude Range (m) |
|----------|-------|-----------------|--------------------|--------------------|
| Ballistic Missiles | 12 | 0.05 -- 0.8 | 700 -- 2,400 | 25,000 -- 300,000 |
| Air-Breathing Threats | 11 | 0.01 -- 0.5 | 44 -- 260 | 60 -- 8,000 |
| Fighter Aircraft | 11 | 0.005 -- 15 | 450 -- 850 | 10,000 -- 22,000 |
| Helicopters | 6 | 8 -- 20 | 60 -- 83 | 200 -- 500 |
| Civilian Aircraft | 6 | 3 -- 100 | 56 -- 250 | 2,400 -- 12,000 |
| Military Transport | 6 | 20 -- 80 | 75 -- 240 | 500 -- 11,000 |

**Representative targets by category:**

| Category | Name | RCS (m^2) | IR (W/sr) | Speed (m/s) | Altitude (m) | Classification |
|----------|------|-----------|-----------|-------------|---------------|----------------|
| BM | Scud-B (R-17 Elbrus) | 0.5 | 50,000 | 1,500 | 86,000 | Hostile |
| BM | Shahab-3 | 0.8 | 65,000 | 2,200 | 250,000 | Hostile |
| BM | Fateh-110 | 0.3 | 40,000 | 1,000 | 75,000 | Hostile |
| BM | Iskander-M (SS-26 Stone) | 0.2 | 55,000 | 2,100 | 50,000 | Hostile |
| BM | Emad | 0.6 | 60,000 | 2,400 | 300,000 | Hostile |
| BM | Fajr-5 | 0.05 | 15,000 | 700 | 25,000 | Hostile |
| ABT | Shahed-136 (Geran-2) | 0.01 | 200 | 56 | 1,000 | Hostile |
| ABT | Kh-55 (AS-15 Kent) | 0.3 | 3,000 | 260 | 100 | Hostile |
| ABT | Mohajer-6 | 0.1 | 500 | 56 | 5,500 | Hostile |
| ABT | Shahed-129 | 0.5 | 800 | 44 | 7,300 | Hostile |
| ABT | Hoveizeh | 0.2 | 2,600 | 260 | 80 | Hostile |
| Fighter | Su-35S Flanker-E | 3.0 | 12,000 | 680 | 15,000 | Hostile |
| Fighter | F-16C Fighting Falcon | 1.5 | 8,000 | 590 | 13,000 | Friendly |
| Fighter | F-35I Adir | 0.005 | 5,000 | 530 | 15,000 | Friendly |
| Fighter | MiG-25RB Foxbat | 15.0 | 25,000 | 850 | 22,000 | Hostile |
| Fighter | Rafale C | 1.0 | 7,500 | 600 | 14,000 | Unknown |
| Heli | Mi-24V Hind | 15.0 | 6,000 | 83 | 300 | Hostile |
| Heli | AH-64D Saraf | 10.0 | 5,500 | 80 | 200 | Friendly |
| Heli | Ka-52 Alligator | 12.0 | 5,800 | 78 | 250 | Hostile |
| Civil | Boeing 737-800 | 40.0 | 4,000 | 230 | 11,000 | Neutral |
| Civil | Cessna 172 Skyhawk | 3.0 | 300 | 56 | 2,400 | Neutral |
| Civil | Boeing 747-400 | 100.0 | 8,000 | 250 | 12,000 | Neutral |
| Mil Trans | C-130J Super Hercules | 35.0 | 6,000 | 180 | 8,500 | Friendly |
| Mil Trans | Il-76MD Candid | 80.0 | 10,000 | 220 | 10,000 | Hostile |
| Mil Trans | KC-135 Stratotanker | 70.0 | 7,000 | 240 | 11,000 | Friendly |

**Ballistic missile entries** include additional properties: range (km), apogee (m),
burn time (seconds), reentry speed (m/s), and default launch/impact bearings. These
are used by the ballistic estimator to compute predicted launch and impact points.

**Data fields per target entry:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (e.g., `shahed-136`) |
| name | string | Display name (e.g., `Shahed-136 (Geran-2)`) |
| category | enum | `ballistic_missile`, `abt`, `fighter`, `helicopter`, `civilian`, `military_transport` |
| description | string | Operational context and origin |
| rcs | number | Radar cross section in m^2 |
| irEmission | number | Infrared emission in W/sr |
| speedMs | number | Typical cruise speed in m/s |
| altitudeM | number | Typical operating altitude in meters |
| classification | enum | `hostile`, `friendly`, `neutral`, `unknown` |
| symbol | string | NATO APP-6 symbol code (SIDC) |
| ballisticProperties | object | (BM only) Range, apogee, burn time, reentry speed |

**Using the target library in the scenario editor:**

When adding targets in the scenario editor, click "From Library" to open the target
type picker. Selecting a library entry auto-fills RCS, IR emission, speed, altitude,
and classification fields. These values can be overridden for specific scenario needs.

### 12.2 Sensor Library (15 Types)

The sensor library contains 15 sensor definitions across three categories: radar
systems (8 types), EO sensors (7 types), and the original generic sensors (included
for backward compatibility with early scenarios).

**Radar sensors:**

| Name | Azimuth | Range (km) | Modes | Notes |
|------|---------|------------|-------|-------|
| 360 deg Surveillance Radar | 360 deg | 150 | Search | Full azimuth general purpose |
| Sector Radar 180 deg | 180 deg | 180 | Search | Half-sector, extended range |
| Long-Range Surveillance Radar | 360 deg | 200 | Search | Area surveillance |
| EL/M-2084 Multi-Mission | 360 deg | 100 | Search, Track | Iron Dome fire-control |
| EL/M-2080 Green Pine | 120 deg | 500 | Search, Track, BM detection | Arrow system phased-array |
| EL/M-2288 AD-STAR | 360 deg | 250 | Search, Track | Medium-range 3D |
| AN/TPS-80 G/ATOR | 360 deg | 200 | Search, Track, Ground | Multi-role 3D |
| SPYDER MR Search Radar | 360 deg | 80 | Search | Short-range acquisition |
| Phased Array 45 deg Staring | 45 deg | 120 | Search, Track | Fixed electronic scan, 3D |
| 360 deg Quad-Panel Phased Array | 360 deg | 120 | Search, Track | 4x 45 deg panels, full hemisphere |

**EO sensors:**

| Name | Mount | FOV | Range (km) | Spectrum | Notes |
|------|-------|-----|------------|----------|-------|
| Gimbal EO Sensor | Gimbal | 4 deg | 40 | -- | Generic narrow-FOV investigator |
| Staring EO Sensor | Staring | 30 deg | 20 | -- | Generic wide-FOV surveillance |
| MEOS 500 IRST | Gimbal | 1.5 deg | 50 | Thermal MWIR | High-resolution, 60 deg/s slew |
| TopLite III Turret | Gimbal | 3 deg | 30 | Multi-spectral | CCD/FLIR/laser, 90 deg/s slew |
| Litening Pod (Ground) | Gimbal | 2.5 deg | 40 | Multi-spectral | Laser designator capable |
| SkyGuard Staring Array | Staring | 20 deg | 25 | Thermal MWIR | 360 deg persistent surveillance |
| Distributed Sensor Station | Gimbal | 4 deg | 35 | Multi-spectral | Autonomous cueing, 120 deg/s slew |
| MWIR Staring (20 deg x 90 deg) | Fixed | 20x90 deg | 30 | Thermal MWIR | 24 Hz, 1 Mpixel, elevation adjustable |
| MWIR 360 deg Quad-Head | Fixed | 4x 20x90 deg | 30 | Thermal MWIR | 4 heads on single mast, 360 deg |
| MWIR Staring (45 deg x 45 deg) | Fixed | 45x45 deg | 30 | Thermal MWIR | 24 Hz, 1 Mpixel, elevation adjustable |

**Data fields per sensor entry:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (e.g., `radar-elta-elm2080`) |
| name | string | Display name |
| type | enum | `radar` or `eo` |
| coverage | object | minAzDeg, maxAzDeg, maxRangeM (and optionally minElDeg, maxElDeg) |
| fov | object | (EO only) halfAngleHDeg, halfAngleVDeg, depthM |
| radarParams | object | (Radar only) scanTypeDeg, modes, system, dimensionality |
| eoParams | object | (EO only) mountType, slewRateDegSec, spectrum, channels |
| description | string | Operational description |

**CRUD management:**

Instructors can create, edit, and delete sensor library entries from the Libraries
panel in the workstation. The sensor library is stored in `configs/sensor-library.json`
and is loaded at API startup. Changes made through the UI are persisted to disk. When
adding sensors in the scenario editor or deployment planner, clicking the library
picker auto-fills all sensor parameters from the selected template.

### 12.3 Scenario Library

The system ships with 18 predefined scenarios covering a range of threat types,
sensor configurations, and engagement durations. Scenarios are divided into three
tiers: full-engagement scenarios for comprehensive demonstrations, per-sortie
scenarios for focused testing, and simple training scenarios for learning specific
system behaviors.

**Full engagement scenarios:**

| Scenario | Duration | Sensors | Threats | Description |
|----------|----------|---------|---------|-------------|
| Green Pine Defense | 3600 s | 1 radar + 3 INV + 9 staring | 4 phases: fighter, formation, BM, mixed (up to 15 simultaneous) | Full 1-hour engagement with all threat types |
| EO Staring Defense | 3600 s | 15 staring + 4 INV (no radar) | Same threats as Green Pine | Pure EO-only air picture, pentagon deployment |
| EO Advantage Demo | 900 s | 3 staring + 2 INV + 1 radar | 6 phases: stealth, formation, terrain, EMCON, ID, stress | Demonstrates EO advantages over radar |
| Central Israel | 900 s | 2 radar + 3 EO + 1 C4ISR | 8 mixed targets, 3 faults, 2 operator actions | Full-complexity regional defense |
| Fusion Demo | 600 s | 2 radar + 3 EO + 1 C4ISR | 6 targets exercising all fusion paths | Radar-radar, radar-EO, EO-only fusion, split/merge |
| Combined Threat | 300 s | 3 radar + 4 EO | Grad barrage + UAV swarm simultaneously | Multi-threat-type handling under load |

**Per-sortie scenarios (Green Pine deployment):**

| Scenario | Duration | Threat | Purpose |
|----------|----------|--------|---------|
| GP Sortie 1 -- Fighter | 300 s | Single Su-35, Mach 1.5, 10 km alt | Detection, track formation, radar-EO handoff |
| GP Sortie 2 -- Formation | 300 s | 5x Shahed-136 V-formation | Formation discrimination, close-proximity tracking |
| GP Sortie 3 -- Ballistic | 300 s | Single BM from 150 km | Ballistic detection, high-speed tracking |
| GP Sortie 4 -- Mixed | 300 s | Fighter + drones + BM | Simultaneous multi-type threat handling |

**Focused threat scenarios:**

| Scenario | Duration | Sensors | Threats | Purpose |
|----------|----------|---------|---------|---------|
| Ballistic Missile | 120 s | 2 radar + 2 EO | Single BM, parabolic trajectory | Long-range detection, high-speed tracking |
| UAV Diamond Formation | 300 s | 2 radar + 4 EO | 4 UAVs in diamond, turn + split | Close-proximity discrimination |
| Grad Rocket Barrage | 60 s | 1 radar + 3 EO | 10 simultaneous rockets | Mass track initiation, proliferation |

**Simple training scenarios:**

| Scenario | Duration | Sensors | Purpose |
|----------|----------|---------|---------|
| Single Target Confirm | 300 s | 1 radar + 1 EO | Basic radar-to-EO cue and confirm |
| Crossed Tracks | 300 s | 1 radar + 2 EO | Track crossing and identity maintenance |
| Low Altitude Clutter | 300 s | 1 radar + 2 EO | Ground clutter effects on tracking |
| One Cue Two EO | 300 s | 1 radar + 2 EO | Multi-sensor EO investigation from single cue |
| Good Triangulation | 300 s | 3 EO | Well-separated EO sensors, high-quality geometry |
| Bad Triangulation | 300 s | 3 EO | Collinear sensors, poor intersection angles |
| Sensor Fault | 300 s | 2 radar + 2 EO | Fault injection and graceful degradation |
| Operator Override | 300 s | 1 radar + 2 EO | Manual operator intervention in automated tasking |

**Managing scenarios:**

The scenario library is accessible from the Libraries view. Instructors can:

- **Load** any scenario into the simulation engine
- **Clone** an existing scenario as a starting point for customization
- **Export** a scenario definition as JSON for sharing or backup
- **Delete** user-created scenarios (built-in scenarios cannot be deleted)
- **Create** new scenarios from the scenario editor with full sensor, target, waypoint, fault, and zone configuration

All scenarios use the `auto_with_veto` policy mode by default, meaning the EO tasking
engine runs automatically but the operator can override any assignment. The policy mode
can be changed to `manual` (operator controls all assignments) or `full_auto` (no
operator intervention) from the simulation controls.
