## 8. IR Detection Physics

### 8.1 Overview

EO detection range in ELOC2 is derived from first-principles physics, not hardcoded
constants. Every tick of the simulation computes whether a given sensor can detect a
given target by evaluating four factors in sequence:

1. **Target IR emission** -- the thermal radiant intensity of the target in Watts per
   steradian (W/sr).
2. **Sensor hardware** -- aperture diameter, detector sensitivity (D*), pixel pitch,
   focal length, and frame rate.
3. **Atmospheric transmission** -- Beer-Lambert extinction along the sensor-to-target
   path, adjusted for humidity, visibility, altitude, and temperature.
4. **Weather and environment** -- visibility degradation from rain, haze, and fog;
   time-of-day background contrast changes.

The implementation lives in `packages/geometry/src/ir-detection.ts`. All constants,
formulas, and threshold values referenced in this chapter are taken directly from that
file.

---

### 8.2 Target IR Emission

Each target type carries an `irEmission` property expressed in W/sr (Watts per
steradian). This value represents the total thermal radiant intensity of the target
in the MWIR 3--5 micrometer band, integrated over the sensor's spectral window. Higher
values mean the target is "brighter" in the infrared and detectable at longer range.

Representative values used in ELOC2 scenarios:

| Target | IR Emission (W/sr) | Classification |
|---|---|---|
| Shahab-3 BM (reentry) | 65,000 | missile |
| Su-35 Flanker | 20,000 | fighter_aircraft |
| F-16C Fighting Falcon | 8,000 | fighter_aircraft |
| Generic Helicopter | 5,000 | helicopter |
| Cruise Missile | 3,000 | uav |
| Mohajer-6 UAV | 500 | uav |
| Shahed-136 One-Way Attack Drone | 200 | uav |

The classification string also determines the **critical target dimension** used for
Johnson DRI criteria (Section 8.6):

| Classification | Critical Dimension (m) |
|---|---|
| missile | 1.0 |
| rocket | 0.8 |
| fighter_aircraft | 3.0 |
| civilian_aircraft | 5.0 |
| passenger_aircraft | 6.0 |
| helicopter | 3.5 |
| uav | 1.5 |
| small_uav | 0.5 |
| drone | 1.0 |
| bird / birds | 0.3 |
| unknown / neutral | 2.0 |

---

### 8.3 Atmospheric Transmission

Atmospheric transmission follows **Beer-Lambert's law**:

```
T(R) = exp(-sigma * R)
```

where `sigma` is the extinction coefficient (1/km) and `R` is the range in kilometers.

The base extinction coefficient for the **MWIR 3--5 micrometer atmospheric window** is:

```
sigma_0 = 0.06 /km   (sea level, clear day, moderate humidity)
```

This is significantly lower than visible-band extinction (~0.2/km) because the 3--5
micrometer window avoids the major H2O and CO2 absorption bands.

Four corrections are applied to the base coefficient:

**Humidity correction.** Water vapor continuum absorption increases extinction with
relative humidity. The effect is moderate in the MWIR window:

```
sigma = sigma_0 * (1.0 + RH * 0.4)
```

At 100% relative humidity, extinction increases by 40%.

**Visibility correction (Koschmieder's law).** When visibility drops below 15 km,
the visible-band extinction is computed as `sigma_vis = 3.912 / V_km`, and the MWIR
extinction is taken as 30% of the visible value (MWIR penetrates haze and fog much
better than visible light):

```
sigma_mwir = max(sigma, 3.912 / V_km * 0.3)
```

**Altitude correction.** Air density decreases exponentially with altitude. The
atmospheric scale height is 8,500 m (8.5 km):

```
sigma(z) = sigma_0 * exp(-z / 8500)
```

**Temperature correction.** Cold air holds less moisture (Clausius-Clapeyron relation),
reducing absorption. Below 15 degrees C, extinction decreases by 1.5% per degree. Above
30 degrees C, it increases by 2% per degree, clamped to a factor of 2.0.

The final extinction coefficient is clamped to the range 0.05 -- 5.0 /km.

Computed extinction coefficients for the four standard atmosphere profiles:

| Profile | Visibility (km) | RH | Temp (C) | Extinction (1/km) |
|---|---|---|---|---|
| Good weather | 40 | 30% | 20 | 0.0672 |
| Standard (MIL-STD) | 23 | 50% | 15 | 0.0720 |
| Hazy | 8 | 70% | 25 | 0.1467 |
| Rain | 3 | 95% | 18 | 0.3912 |

---

### 8.4 Slant-Path Atmosphere Model

For targets at significant altitude (above 500 m ASL), horizontal Beer-Lambert is
inaccurate because the air along the line of sight is not uniform -- it thins
exponentially with altitude. ELOC2 uses an analytical integral of the
altitude-dependent extinction:

```
sigma(z) = sigma_0 * exp(-z / H)
```

where H = 8,500 m is the atmospheric scale height.

For a slant path from sensor altitude z1 to target altitude z2, the total optical depth
is:

```
tau = sigma_0 * H * |exp(-z1/H) - exp(-z2/H)| * (slantRange / |dAlt|)
```

The factor `slantRange / |dAlt|` equals `1 / sin(elevation)` and converts the vertical
integral to the actual slant-path geometry. Transmission is then:

```
T = exp(-tau)
```

For near-horizontal paths (altitude difference less than 100 m), the model falls back
to horizontal Beer-Lambert at the average altitude.

**Impact on ballistic missile detection.** A BM at 50 km altitude traverses mostly
vacuum; only the lowest few kilometers of atmosphere contribute significant extinction.
This dramatically extends detection range:

| Target | Altitude | Staring Detection Range | Ratio vs Sea Level |
|---|---|---|---|
| Shahab-3 BM (65 kW/sr) | 0 m (sea level) | 100 km | 1.0x |
| Shahab-3 BM (65 kW/sr) | 50,000 m | 364 km | 3.6x |
| Fighter (15 kW/sr) | 0 m (sea level) | 84 km | 1.0x |
| Fighter (15 kW/sr) | 10,000 m | 123 km | 1.5x |
| Shahed-136 (200 W/sr) | 300 m | 41 km | 1.0x |

Low-altitude drones (300 m) receive negligible benefit from the slant-path model.

---

### 8.5 SNR Detection Model

Detection is determined by whether the target's infrared signal exceeds the sensor's
noise floor by a sufficient margin. The minimum detection SNR threshold is:

```
SNR >= 5.0
```

#### Signal

The signal power collected by the sensor from a point source at range R is:

```
Signal = targetIrWsr * T(R) * A_aperture * eta / R^2
```

where:

- `targetIrWsr` is the target radiant intensity (W/sr)
- `T(R)` is the atmospheric transmission at range R
- `A_aperture` is the collecting area of the aperture (m^2)
- `eta = 0.65` is the optical throughput (lens + window + filter transmission)
- `R` is the slant range in meters

**Aperture area.** Computed from the explicit aperture diameter if specified, otherwise
derived from the focal length assuming f/2 optics:

- Staring sensor: 75 mm diameter, area = pi * (0.0375)^2 = 4.42 x 10^-3 m^2
- Investigator (zoom): derived from 1,400 mm focal length at f/2 = 700 mm diameter
  (but limited by actual aperture spec)

#### Noise

Noise is the root-sum-square (RSS) of two independent sources:

```
NEP_total = sqrt(NEP_detector^2 + NEP_clutter^2)
```

**Detector NEP** is derived from the specific detectivity D*:

```
NEP_detector = sqrt(A_detector * BW) / D*
```

where:

- `A_detector` = pixel pitch squared = (15 x 10^-6)^2 = 2.25 x 10^-10 m^2
- `BW` = frame_rate / 2 = 24 / 2 = 12 Hz (Nyquist bandwidth)
- `D*` = 4 x 10^10 cm * sqrt(Hz) / W (cooled InSb MWIR production grade)
- `D*` in SI = 4 x 10^8 m * sqrt(Hz) / W

**Background clutter NEP** models the thermal background radiation from sky and terrain
leaking through the pixel IFOV:

```
clutter_power = L_bg * A_aperture * Omega_pixel * eta * rejection_factor
```

where:

- `L_bg` = 1.5 W/m^2/sr (average sky MWIR background radiance)
- `Omega_pixel` = (pixel_pitch / focal_length)^2 (pixel solid angle in steradians)
- `rejection_factor`: residual clutter after temporal frame differencing
  - **Staring sensors:** 8% residual (wide IFOV sees more atmospheric scintillation)
  - **Investigator sensors:** 3% residual (narrow IFOV, less background variation)

#### Frame Integration

Staring sensors integrate frames over a 2-second update interval at 24 Hz, yielding
48 frames. The SNR improves by the square root of the frame count:

- **Staring:** sqrt(48) = 6.93x integration gain
- **Investigator:** sqrt(12) = 3.46x integration gain (0.5 s at 24 Hz, capped at 12 frames)

#### Point-Source vs Resolved Mode

The detection model branches based on the sensor's IFOV:

- **IFOV > 0.1 mrad (staring sensors):** Target is a sub-pixel point source. Detection
  depends on SNR only. Johnson DRI spatial criteria do not apply to detection (the sensor
  cannot resolve target shape -- it detects IR blobs).
- **IFOV < 0.1 mrad (investigator zoom):** Target may be spatially resolved. Detection
  range is the minimum of the SNR limit and the Johnson DRI detection limit.

The detection range is found by binary search over 100 m to 500 km, finding the maximum
range where SNR >= 5.0.

---

### 8.6 Johnson DRI Criteria

Johnson's criteria define the minimum number of resolution cycles (line pairs) across
the target's critical dimension needed to achieve detection, recognition, or
identification:

| Tier | Cycles Required | Pixels on Target |
|---|---|---|
| Detection | 1 cycle | 2 pixels |
| Recognition | 3 cycles | 6 pixels |
| Identification | 6 cycles | 12 pixels |

The range for each tier is:

```
R_dri = targetDimension / (N_cycles * 2 * IFOV_rad)
```

where:

- `targetDimension` is the critical dimension in meters (see Section 8.2 table)
- `N_cycles` is 1, 3, or 6 for detection, recognition, identification
- `IFOV_rad` is the instantaneous field of view per pixel in radians

**IFOV computation:**

```
IFOV_mrad = (pixelPitch_um / 1000) / focalLength_mm * 1000
```

For the two standard sensor profiles:

| Sensor | Pixel Pitch | Focal Length | IFOV |
|---|---|---|---|
| Staring panoramic | 15 um | 50 mm | 0.300 mrad |
| Investigator (wide) | 15 um | 35 mm | 0.429 mrad |
| Investigator (zoom) | 15 um | 1,400 mm | 0.0107 mrad |

**Applicability rules:**

- **Staring sensors (IFOV > 0.1 mrad):** SNR-only detection. Point-source mode. Johnson
  DRI does NOT limit detection range. Staring sensors detect targets as unresolved IR
  blobs at extreme range but cannot classify them spatially.
- **Investigator zoom (IFOV < 0.1 mrad):** Full Johnson DRI applies to all tiers.
  The zoom lens resolves target shape, enabling recognition and identification at
  operationally useful ranges.

Example Johnson DRI ranges for the investigator zoom (IFOV = 0.0107 mrad):

| Target | Dimension | Detection (1 cycle) | Recognition (3 cycles) | Identification (6 cycles) |
|---|---|---|---|---|
| fighter_aircraft | 3.0 m | 140 km | 46.7 km | 23.3 km |
| helicopter | 3.5 m | 163 km | 54.4 km | 27.2 km |
| uav (1.5 m) | 1.5 m | 70 km | 23.3 km | 11.7 km |
| missile (1.0 m) | 1.0 m | 46.7 km | 15.6 km | 7.8 km |

---

### 8.7 Detection Range Table (Good Weather)

All values computed with good weather atmosphere (visibility 40 km, RH 30%, 20 C,
extinction 0.0672/km). Staring sensor: 75 mm aperture, 15 um pitch, 50 mm focal
length. Investigator: 1,400 mm zoom focal length.

| Target | IR (W/sr) | Staring Detection | Investigator Zoom ID |
|---|---|---|---|
| Shahab-3 BM (sea level) | 65,000 | 100 km | 7.8 km |
| Shahab-3 BM (50 km altitude) | 65,000 | 364 km | -- |
| Su-35 Flanker | 20,000 | 87 km | 23.3 km |
| Fighter (15 kW/sr, sea level) | 15,000 | 84 km | 23.3 km |
| Fighter (15 kW/sr, 10 km alt) | 15,000 | 123 km | 23.3 km |
| F-16C | 8,000 | 77 km | 23.3 km |
| Generic Helicopter | 5,000 | 72 km | 27.2 km |
| Cruise Missile | 3,000 | 67 km | 11.7 km |
| Mohajer-6 UAV | 500 | 49 km | 11.7 km |
| Shahed-136 Drone | 200 | 41 km | 11.7 km |

**Key observations:**

- Staring detection range is driven entirely by SNR (point-source mode). Higher IR
  emission translates directly to longer detection range.
- Investigator zoom identification range is driven by Johnson DRI (spatial resolution).
  All fighter-class targets share the same ID range (23.3 km) because they share the
  same critical dimension (3.0 m). The zoom lens resolves them identically regardless
  of IR brightness.
- Ballistic missiles at high altitude benefit enormously from reduced atmospheric path.
  A BM at 50 km altitude is detectable at 364 km -- 3.6 times the sea-level range.
- The helicopter has a longer zoom ID range (27.2 km) than fighters because its critical
  dimension (3.5 m rotor disc) is larger.

---

### 8.8 Weather Effects

Weather degrades detection range primarily through increased atmospheric extinction.
All values below are for a 15 kW/sr fighter-class target against the staring sensor.

| Condition | Visibility (km) | RH | Extinction (1/km) | Detection Range | % of Good Weather |
|---|---|---|---|---|---|
| Good weather | 40 | 30% | 0.0672 | 84 km | 100% (baseline) |
| Standard (MIL-STD) | 23 | 50% | 0.0720 | 79 km | ~95% |
| Hazy | 8 | 70% | 0.1467 | 46 km | ~55% |
| Rain | 3 | 95% | 0.3912 | 21 km | ~25% |

**Degradation mechanics:**

- In **good weather**, extinction is dominated by the base MWIR coefficient (0.06/km)
  with a small humidity contribution. Detection ranges are at their maximum.
- In **standard conditions**, the slightly higher humidity (50% vs 30%) adds modest
  extinction. Range drops by only about 5%.
- In **haze**, visibility drops below 15 km, triggering Koschmieder's correction.
  The MWIR extinction roughly doubles, cutting range to about 55% of clear-weather
  baseline.
- In **rain**, visibility of 3 km combined with 95% humidity produces extinction of
  0.39/km -- nearly 6 times the good-weather value. Detection range drops to
  approximately 25% of baseline. Rain is the most severe weather degradation for
  MWIR sensors.

Note that MWIR (3--5 micrometer) performs significantly better than visible-spectrum
sensors in all degraded conditions. The Koschmieder MWIR-to-visible ratio is 0.3,
meaning MWIR extinction from haze and fog is only 30% of what visible-band sensors
experience.

---

### 8.9 Time of Day

MWIR sensors operate in the thermal infrared band, detecting heat emission rather than
reflected sunlight. This gives them a characteristic time-of-day performance profile
that is the inverse of visible-band sensors:

| Time of Day | Background Radiance | Detection Performance | Explanation |
|---|---|---|---|
| Day | High (solar heating) | 100% (baseline) | Warm background reduces thermal contrast |
| Dawn / Dusk | Medium (transition) | ~85% | Mixed illumination, moderate contrast |
| Night | Low (radiative cooling) | ~110% (bonus) | Cold background maximizes target-to-background contrast |

**Why MWIR performs better at night:**

During the day, solar heating warms the ground, structures, and lower atmosphere,
raising the thermal background radiance in the 3--5 micrometer band. A hot target
against a warm background has reduced contrast. At night, the background cools
through radiative emission while aircraft engines, missile plumes, and exhaust systems
remain at their operational temperatures. The resulting increase in thermal contrast
yields approximately 10% longer detection range at night compared to daytime.

This effect is modeled in ELOC2 through the background radiance term in the clutter
NEP calculation (Section 8.5). The baseline value of 1.5 W/m^2/sr represents an
average daytime sky. At night, reduced background means less clutter noise, improving
the signal-to-noise ratio and extending detection range.

Dawn and dusk produce intermediate performance (~85%) due to rapidly changing thermal
gradients that increase atmospheric scintillation and clutter variability.
