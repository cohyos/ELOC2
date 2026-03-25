/**
 * IR Detection Range Calculator
 *
 * Physics-based detection range computation for MWIR (3-5 μm) EO sensors.
 * Replaces hardcoded maxDetectionRangeM with range derived from:
 *   - Target IR emission (W/sr)
 *   - Sensor specs (array size, pixel pitch, focal length, NETD)
 *   - Atmospheric transmission (Beer-Lambert, standard atmosphere)
 *   - Weather conditions (visibility, humidity)
 *
 * Reference: Johnson's DRI criteria applied to calculated detection range.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** MWIR sensor hardware specification */
export interface EoSensorSpec {
  /** Array width in pixels */
  arrayWidth: number;
  /** Array height in pixels */
  arrayHeight: number;
  /** Spectral band (microns) */
  bandMicrons: [number, number]; // e.g. [3, 5] for MWIR
  /** Focal length in mm */
  focalLengthMm: number;
  /** Pixel pitch in microns (derived from array + sensor size, or specified) */
  pixelPitchMicrons: number;
  /** Noise Equivalent Temperature Difference (mK) — lower = more sensitive */
  netdMk: number;
  /** Aperture diameter in mm (overrides f-number calculation). If omitted, uses f/2. */
  apertureDiameterMm?: number;
  /** Horizontal field of view in degrees (derived from array + focal length) */
  hfovDeg: number;
  /** Vertical field of view in degrees */
  vfovDeg: number;
  /** Tracking accuracy (mrad, absolute) — for investigators */
  trackingAccuracyMrad?: number;
}

/** Pre-computed sensor specs for common configurations */
export interface EoSensorProfile {
  /** Human-readable name */
  name: string;
  /** Sensor type: staring (wide FOV panoramic) or investigator (narrow zoom) */
  role: 'staring' | 'investigator';
  /** Wide FOV spec (search/scan mode) */
  wideSpec: EoSensorSpec;
  /** Narrow FOV spec (zoom/cue mode) — investigators only */
  narrowSpec?: EoSensorSpec;
}

/** Atmospheric conditions affecting IR transmission */
export interface AtmosphereCondition {
  /** Visibility in km (standard: 23 km for clear) */
  visibilityKm: number;
  /** Relative humidity (0-1, standard: 0.5) */
  relativeHumidity: number;
  /** Temperature in Celsius (standard: 15°C) */
  temperatureC: number;
  /** Altitude ASL in meters (affects air density) */
  altitudeM: number;
}

/** Result of IR detection range calculation */
export interface IrDetectionResult {
  /** Maximum detection range in meters */
  detectionRangeM: number;
  /** Maximum recognition range in meters (Johnson: 6× pixels on target) */
  recognitionRangeM: number;
  /** Maximum identification range in meters (Johnson: 12× pixels on target) */
  identificationRangeM: number;
  /** Atmospheric transmission at detection range (0-1) */
  transmissionAtDetection: number;
  /** Signal-to-noise ratio at detection range */
  snrAtDetection: number;
  /** Effective MWIR extinction coefficient used (1/km) */
  extinctionCoeffKm: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard atmosphere MWIR (3-5 μm) extinction coefficient (1/km)
 *  The 3-5μm atmospheric window has LOW extinction compared to visible:
 *  - Visible extinction: ~0.2/km (Rayleigh + Mie scattering)
 *  - MWIR extinction: ~0.06/km (window avoids H2O/CO2 absorption bands)
 *  Standard: 0.06/km at sea level, clear day, moderate humidity.
 *  Range: 0.03 (very clear/dry) to 1.5 (heavy rain/fog). */
const STANDARD_EXTINCTION_KM = 0.06;

/** Minimum SNR for reliable detection (industry standard: 5-7 for MWIR) */
const MIN_DETECTION_SNR = 5.0;

/** Johnson's criteria — minimum resolvable cycles across target for each tier */
const JOHNSON_DETECTION_CYCLES = 1.0;   // N ≥ 1 cycle
const JOHNSON_RECOGNITION_CYCLES = 3.0; // N ≥ 3 cycles
const JOHNSON_IDENTIFICATION_CYCLES = 6.0; // N ≥ 6 cycles

/** Typical target critical dimensions (meters) — used for Johnson's DRI */
const TARGET_DIMENSIONS: Record<string, number> = {
  // Ballistic missiles: body diameter ~1m
  missile: 1.0,
  rocket: 0.8,
  // Aircraft: wingspan equivalent critical dimension
  fighter_aircraft: 3.0,
  civilian_aircraft: 5.0,
  passenger_aircraft: 6.0,
  light_aircraft: 2.5,
  predator: 2.0,
  ally: 3.0,
  // Helicopters
  helicopter: 3.5,
  // UAVs/drones
  uav: 1.5,
  small_uav: 0.5,
  drone: 1.0,
  // Other
  bird: 0.3,
  birds: 0.3,
  unknown: 2.0,
  neutral: 2.0,
};

// ─── Atmosphere Model ────────────────────────────────────────────────────────

/**
 * Compute MWIR atmospheric extinction coefficient (1/km).
 *
 * Models Beer-Lambert transmission: T(R) = exp(-σ × R)
 * where σ is the extinction coefficient and R is range in km.
 *
 * Factors:
 *   - Molecular absorption (H2O bands at 2.7μm, 4.3μm CO2)
 *   - Aerosol scattering (Mie scattering)
 *   - Rain/fog droplet absorption
 *   - Altitude correction (exponential density decrease)
 */
export function computeExtinctionCoeff(atm: AtmosphereCondition): number {
  // Base extinction at sea level, clear conditions
  let sigma = STANDARD_EXTINCTION_KM;

  // Humidity correction: H2O absorption in MWIR 3-5μm window
  // The 3-5μm window avoids major H2O bands, but continuum absorption
  // still increases with humidity. Effect is ~40% increase at 100% RH.
  const humidityFactor = 1.0 + atm.relativeHumidity * 0.4;
  sigma *= humidityFactor;

  // Visibility correction: Koschmieder's law relates visibility to extinction
  // V = 3.912 / σ_vis. For MWIR, empirical ratio is ~0.3 of visible extinction
  // (MWIR window penetrates fog/haze much better than visible).
  if (atm.visibilityKm < 15) {
    const visExtinction = 3.912 / atm.visibilityKm;
    const mwirVisExtinction = visExtinction * 0.3; // MWIR much better than visible in haze
    sigma = Math.max(sigma, mwirVisExtinction);
  }

  // Altitude correction: air density decreases exponentially with altitude
  // Scale height ~8.5 km for troposphere
  const altitudeFactor = Math.exp(-atm.altitudeM / 8500);
  sigma *= altitudeFactor;

  // Temperature correction: colder air holds less moisture → less absorption
  // Clausius-Clapeyron: saturation vapor pressure doubles per ~10°C
  if (atm.temperatureC < 15) {
    const tempFactor = 1.0 - (15 - atm.temperatureC) * 0.015;
    sigma *= Math.max(0.5, tempFactor);
  } else if (atm.temperatureC > 30) {
    const tempFactor = 1.0 + (atm.temperatureC - 30) * 0.02;
    sigma *= Math.min(2.0, tempFactor);
  }

  return Math.max(0.05, Math.min(5.0, sigma)); // Clamp to physical range
}

/**
 * Compute atmospheric transmission at a given range (horizontal path).
 * Beer-Lambert: T = exp(-σ × R_km)
 */
export function atmosphericTransmission(rangeM: number, extinctionCoeffKm: number): number {
  const rangeKm = rangeM / 1000;
  return Math.exp(-extinctionCoeffKm * rangeKm);
}

/** Atmospheric scale height in meters (troposphere). */
const SCALE_HEIGHT_M = 8500;

/**
 * Compute atmospheric transmission along a slant path from sensor to target,
 * accounting for exponential decrease of air density with altitude.
 *
 * The extinction coefficient at altitude z is:
 *   σ(z) = σ₀ × exp(-z / H)
 * where σ₀ is the sea-level extinction and H is the scale height (~8.5 km).
 *
 * For a slant path from altitude z₁ (sensor) to z₂ (target) over horizontal
 * range R, the optical depth is the integral of σ(z) along the path:
 *
 *   τ = ∫₀ˢ σ(z(s)) ds
 *
 * where s is the path parameter. For a straight-line path:
 *   z(s) = z₁ + (z₂ - z₁) × s / S, where S = slant range
 *
 * Analytical solution (for exponential atmosphere):
 *   τ = σ₀ × H × (exp(-z₁/H) - exp(-z₂/H)) / sin(θ)
 * where θ is the elevation angle.
 *
 * For near-horizontal paths (θ → 0), falls back to horizontal model.
 *
 * @param slantRangeM  Total slant range from sensor to target (meters)
 * @param sensorAltM   Sensor altitude ASL (meters)
 * @param targetAltM   Target altitude ASL (meters)
 * @param sigma0Km     Sea-level extinction coefficient (1/km)
 */
export function slantPathTransmission(
  slantRangeM: number,
  sensorAltM: number,
  targetAltM: number,
  sigma0Km: number,
): number {
  const sigma0M = sigma0Km / 1000; // convert to 1/m

  const dAlt = targetAltM - sensorAltM;
  const absDAlt = Math.abs(dAlt);

  // Near-horizontal path (altitude difference < 100m): use horizontal model
  if (absDAlt < 100) {
    const avgAlt = (sensorAltM + targetAltM) / 2;
    const sigmaAvg = sigma0M * Math.exp(-avgAlt / SCALE_HEIGHT_M);
    return Math.exp(-sigmaAvg * slantRangeM);
  }

  // Slant path: analytical integral of exponential atmosphere
  // τ = σ₀ × H × |exp(-z₁/H) - exp(-z₂/H)| × (slantRange / |dAlt|)
  //
  // The factor (slantRange / |dAlt|) = 1/sin(elevation) converts the
  // vertical integral to the actual slant path.
  const expSensor = Math.exp(-sensorAltM / SCALE_HEIGHT_M);
  const expTarget = Math.exp(-targetAltM / SCALE_HEIGHT_M);

  // Vertical optical depth between the two altitudes
  const verticalOpticalDepth = sigma0M * SCALE_HEIGHT_M * Math.abs(expSensor - expTarget);

  // Scale to slant path: slantRange / dAlt = 1/sin(elev)
  const slantFactor = slantRangeM / absDAlt;
  const totalOpticalDepth = verticalOpticalDepth * slantFactor;

  return Math.exp(-totalOpticalDepth);
}

// ─── Standard Atmosphere Profiles ────────────────────────────────────────────

/** Standard clear-day atmosphere (MIL-STD-2161 / LOWTRAN standard) */
export const STANDARD_ATMOSPHERE: AtmosphereCondition = {
  visibilityKm: 23,
  relativeHumidity: 0.5,
  temperatureC: 15,
  altitudeM: 0,
};

/** Good weather — clear, dry */
export const GOOD_WEATHER_ATMOSPHERE: AtmosphereCondition = {
  visibilityKm: 40,
  relativeHumidity: 0.3,
  temperatureC: 20,
  altitudeM: 0,
};

/** Hazy conditions */
export const HAZY_ATMOSPHERE: AtmosphereCondition = {
  visibilityKm: 8,
  relativeHumidity: 0.7,
  temperatureC: 25,
  altitudeM: 0,
};

/** Rain conditions */
export const RAIN_ATMOSPHERE: AtmosphereCondition = {
  visibilityKm: 3,
  relativeHumidity: 0.95,
  temperatureC: 18,
  altitudeM: 0,
};

// ─── Sensor Profiles ─────────────────────────────────────────────────────────

/** Staring MWIR panoramic sensor: 1280×1024, 3-5μm, 360°×20° or 90°×20° */
export const STARING_SENSOR_PROFILE: EoSensorProfile = {
  name: 'MWIR Staring Panoramic',
  role: 'staring',
  wideSpec: {
    arrayWidth: 1280,
    arrayHeight: 1024,
    bandMicrons: [3, 5],
    focalLengthMm: 50,         // short focal for wide FOV
    pixelPitchMicrons: 15,     // standard InSb/MCT MWIR pitch
    netdMk: 15,                // cooled InSb MWIR: 15 mK NETD (high-end production)
    apertureDiameterMm: 75,    // 75mm effective aperture per sector (panoramic MWIR systems)
    hfovDeg: 360,              // full panoramic (or 90° per quadrant)
    vfovDeg: 20,
  },
};

/** EO Investigator: 640×480, 3-5μm, 10° wide / 0.4° zoom, f=1400mm */
export const INVESTIGATOR_SENSOR_PROFILE: EoSensorProfile = {
  name: 'MWIR Investigator',
  role: 'investigator',
  wideSpec: {
    arrayWidth: 640,
    arrayHeight: 480,
    bandMicrons: [3, 5],
    focalLengthMm: 35,         // wide FOV for search/scan
    pixelPitchMicrons: 15,
    netdMk: 25,                // slightly less sensitive (uncooled or smaller aperture)
    hfovDeg: 10,               // 10° search FOV
    vfovDeg: 7.5,
    trackingAccuracyMrad: 1.0, // 1 mrad absolute tracking accuracy
  },
  narrowSpec: {
    arrayWidth: 640,
    arrayHeight: 480,
    bandMicrons: [3, 5],
    focalLengthMm: 1400,       // zoom lens for cue/identification
    pixelPitchMicrons: 15,
    netdMk: 25,
    hfovDeg: 0.4,              // 0.4° narrow FOV for DRI
    vfovDeg: 0.3,
    trackingAccuracyMrad: 1.0,
  },
};

// ─── Detection Range Calculator ──────────────────────────────────────────────

/**
 * Calculate the IFOV (Instantaneous Field of View) per pixel in milliradians.
 * IFOV = pixelPitch / focalLength
 */
export function computeIfovMrad(spec: EoSensorSpec): number {
  // Both in mm: pixelPitch (μm → mm), focalLength (mm)
  const pitchMm = spec.pixelPitchMicrons / 1000;
  return (pitchMm / spec.focalLengthMm) * 1000; // result in mrad
}

/**
 * Calculate the ground sample distance (GSD) at a given range.
 * GSD = IFOV_rad × range
 */
export function computeGsdM(spec: EoSensorSpec, rangeM: number): number {
  const ifovRad = computeIfovMrad(spec) / 1000;
  return ifovRad * rangeM;
}

/**
 * Calculate IR detection range based on physics.
 *
 * Two independent checks determine detection:
 *   1. **SNR check**: Is the target's IR signal above the sensor noise floor?
 *      Irradiance at sensor = (targetIrW / 4π) × atmosphericTransmission / range²
 *      SNR = irradiance / NEI (noise equivalent irradiance)
 *
 *   2. **Johnson DRI check**: Does the target subtend enough pixels?
 *      Pixels on target = targetDimension / GSD
 *      Detection: ≥2 pixels, Recognition: ≥6, Identification: ≥12
 *
 * The detection range is the MINIMUM of these two limits.
 */
export function computeIrDetectionRange(
  targetIrWsr: number,
  targetClassification: string,
  sensorSpec: EoSensorSpec,
  atmosphere: AtmosphereCondition = GOOD_WEATHER_ATMOSPHERE,
  /** Target altitude ASL in meters — enables path-integral atmosphere model.
   *  High-altitude targets (BMs at 50-100 km) benefit from reduced atmospheric path. */
  targetAltitudeM: number = 0,
): IrDetectionResult {
  const extinctionCoeff = computeExtinctionCoeff(atmosphere);
  const sensorAltM = atmosphere.altitudeM;
  const ifovMrad = computeIfovMrad(sensorSpec);

  // Target critical dimension for Johnson's criteria
  const targetDimM = TARGET_DIMENSIONS[targetClassification] ?? TARGET_DIMENSIONS.unknown;

  // ── SNR-based detection range ──────────────────────────────────────────
  // Point-source IR detection model for MWIR (3-5 μm) sensors.
  //
  // The sensor collects photons from the target's IR emission through its
  // aperture. The signal is compared against the detector noise floor (NETD).
  //
  // Key physics:
  //   Irradiance at sensor = (targetIrWsr × atmosphericTransmission) / range²
  //   NEI (noise equivalent irradiance) = NETD × blackbodyContrast × pixelSolidAngle / throughput
  //   SNR = irradiance / NEI × √(integrationFrames)  ← frame stacking
  //
  // Real-world MWIR sensor optics:
  //   - Aperture: f/2 to f/2.5 (cooled sensors have fast optics)
  //   - Frame rate: 24 Hz (MWIR standard)
  //   - Integration: √N frame stacking over update interval
  //   - Optical throughput: ~0.7 (lens + window transmission)

  // ── Point-source detection model ─────────────────────────────────────
  //
  // For point sources (sub-pixel targets), SNR depends on:
  //   Signal = targetIrWsr × atmosphericTransmission × apertureArea × opticsEfficiency / range²
  //   Noise  = NEP (detector noise equivalent power)
  //   SNR    = Signal / Noise × √(integrationFrames)
  //
  // NEP derived from D* (specific detectivity):
  //   NEP = √(detectorArea × bandwidth) / D*
  //
  // For cooled InSb MWIR (3-5μm):
  //   D* ≈ 3-5 × 10¹⁰ cm·√Hz/W (production grade)
  //   Bandwidth ≈ frame_rate / 2 (Nyquist)

  // Aperture: explicit diameter if provided, otherwise f/2
  const apertureDiameterM = sensorSpec.apertureDiameterMm
    ? sensorSpec.apertureDiameterMm * 0.001
    : sensorSpec.focalLengthMm * 0.001 / 2.0;
  const apertureAreaM2 = Math.PI * (apertureDiameterM / 2) ** 2;

  // Optics throughput (lens + window + filter transmission)
  const opticalThroughput = 0.65;

  // Detector parameters
  const pixelPitchM = sensorSpec.pixelPitchMicrons * 1e-6;
  const detectorAreaM2 = pixelPitchM * pixelPitchM;
  const dStar = 4e10; // D* in cm·√Hz/W — cooled InSb MWIR production grade
  const dStarSI = dStar * 1e-2; // convert to m·√Hz/W
  const FRAME_RATE_HZ = 24;
  const bandwidth = FRAME_RATE_HZ / 2; // Hz (Nyquist)
  // Detector NEP (noise equivalent power from detector thermal noise)
  const detectorNep = Math.sqrt(detectorAreaM2 * bandwidth) / dStarSI;

  // Background clutter NEP — in practice, thermal background from terrain/sky
  // dominates over detector noise for ground-based MWIR sensors looking upward.
  // Background radiance in MWIR: ~1-10 W/m²/sr depending on look angle.
  // Looking up (sky): ~1 W/m²/sr. Looking at horizon (ground): ~5 W/m²/sr.
  // Clutter noise = background × aperture × pixelSolidAngle × throughput
  const pixelSolidAngleSr = (pixelPitchM / (sensorSpec.focalLengthMm * 1e-3)) ** 2;
  // Sensor mode: staring (wide FOV panoramic) vs investigator (narrow FOV zoom)
  const isStaringMode = sensorSpec.hfovDeg > 30;

  // Background-limited noise: thermal background clutter through the pixel IFOV
  // For wide IFOV (staring: 0.3 mrad), each pixel sees a large patch of sky/ground,
  // collecting substantial background photon noise. For narrow IFOV (investigator:
  // 0.01 mrad), pixel sees minimal background — detector-noise dominated.
  const backgroundRadiance = 1.5; // W/m²/sr — average sky MWIR background
  const rawClutterPower = backgroundRadiance * apertureAreaM2 * pixelSolidAngleSr * opticalThroughput;
  // Temporal filtering (frame differencing) removes static background.
  // Residual is ~3% for narrow IFOV, ~8% for wide IFOV (more atmospheric scintillation).
  const clutterRejection = isStaringMode ? 0.08 : 0.03;
  const clutterNep = rawClutterPower * clutterRejection;

  // Total NEP: RSS of detector noise + clutter noise
  const nep = Math.sqrt(detectorNep ** 2 + clutterNep ** 2);

  // Frame integration: staring sensors integrate 24 Hz × ~2s = 48 frames
  const UPDATE_INTERVAL_SEC = 2;
  const integrationFrames = isStaringMode
    ? FRAME_RATE_HZ * UPDATE_INTERVAL_SEC
    : Math.min(12, FRAME_RATE_HZ * 0.5);
  const integrationGain = Math.sqrt(integrationFrames);

  // Binary search for max detection range where SNR ≥ threshold
  let lo = 100, hi = 500_000; // 100m to 500km (BMs detectable at >150km)
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    // Use slant-path model for elevated targets (BMs at 50+ km altitude)
    const transmission = targetAltitudeM > 500
      ? slantPathTransmission(mid, sensorAltM, targetAltitudeM, extinctionCoeff)
      : atmosphericTransmission(mid, extinctionCoeff);
    // Point-source signal power at detector: I × T × A_aperture × η / R²
    const signalPower = (targetIrWsr * transmission * apertureAreaM2 * opticalThroughput) / (mid * mid);
    const snr = (signalPower / Math.max(nep, 1e-30)) * integrationGain;
    if (snr >= MIN_DETECTION_SNR) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const snrRangeM = lo;

  // ── Johnson DRI range ─────────────────────────────────────────────────
  // Pixels on target at range R: N = targetDimM / GSD(R) = targetDimM / (IFOV_rad × R)
  // For detection: N ≥ 2 pixels (1 cycle), so R_det = targetDimM / (2 × IFOV_rad)
  const ifovRad = ifovMrad / 1000;
  const johnsonDetectionRangeM = targetDimM / (JOHNSON_DETECTION_CYCLES * 2 * ifovRad);
  const johnsonRecognitionRangeM = targetDimM / (JOHNSON_RECOGNITION_CYCLES * 2 * ifovRad);
  const johnsonIdentificationRangeM = targetDimM / (JOHNSON_IDENTIFICATION_CYCLES * 2 * ifovRad);

  // ── Combined result ────────────────────────────────────────────────────
  // For wide-FOV staring sensors (IFOV > 0.2 mrad), targets are detected as
  // point sources — Johnson's DRI spatial resolution criteria does NOT apply
  // to detection. Staring sensors detect via SNR only (IR blob detection).
  // Johnson DRI only limits recognition/identification (which requires
  // resolving the target shape — done by investigator zoom).
  //
  // For narrow-FOV investigators (IFOV < 0.05 mrad), Johnson DRI applies
  // to all tiers because the sensor CAN resolve target shape.
  const isPointSourceMode = ifovMrad > 0.1; // staring sensors: IFOV ~0.3 mrad

  const detectionRangeM = isPointSourceMode
    ? snrRangeM                                        // staring: SNR-limited only
    : Math.min(snrRangeM, johnsonDetectionRangeM);     // investigator: SNR + Johnson

  const recognitionRangeM = isPointSourceMode
    ? Math.min(snrRangeM * 0.5, johnsonRecognitionRangeM)  // staring: can't resolve, but SNR estimate
    : Math.min(snrRangeM * 0.6, johnsonRecognitionRangeM);

  const identificationRangeM = isPointSourceMode
    ? Math.min(snrRangeM * 0.25, johnsonIdentificationRangeM) // staring: very limited ID capability
    : Math.min(snrRangeM * 0.35, johnsonIdentificationRangeM);

  const transmissionAtDetection = targetAltitudeM > 500
    ? slantPathTransmission(detectionRangeM, sensorAltM, targetAltitudeM, extinctionCoeff)
    : atmosphericTransmission(detectionRangeM, extinctionCoeff);
  const signalAtDetection = (targetIrWsr * transmissionAtDetection * apertureAreaM2 * opticalThroughput) / (detectionRangeM ** 2);
  const snrAtDetection = (signalAtDetection / Math.max(nep, 1e-30)) * integrationGain;

  return {
    detectionRangeM: Math.round(detectionRangeM),
    recognitionRangeM: Math.round(recognitionRangeM),
    identificationRangeM: Math.round(identificationRangeM),
    transmissionAtDetection,
    snrAtDetection,
    extinctionCoeffKm: extinctionCoeff,
  };
}

/**
 * Quick detection check: can this sensor detect this target at this range?
 * Returns the DRI tier achieved, or null if not detectable.
 */
export function checkIrDetection(
  rangeM: number,
  targetIrWsr: number,
  targetClassification: string,
  sensorSpec: EoSensorSpec,
  atmosphere: AtmosphereCondition = GOOD_WEATHER_ATMOSPHERE,
  targetAltitudeM: number = 0,
): { tier: 'detection' | 'recognition' | 'identification' | null; snr: number } {
  const result = computeIrDetectionRange(targetIrWsr, targetClassification, sensorSpec, atmosphere, targetAltitudeM);

  if (rangeM <= result.identificationRangeM) {
    return { tier: 'identification', snr: result.snrAtDetection * (result.detectionRangeM / rangeM) ** 2 };
  }
  if (rangeM <= result.recognitionRangeM) {
    return { tier: 'recognition', snr: result.snrAtDetection * (result.detectionRangeM / rangeM) ** 2 };
  }
  if (rangeM <= result.detectionRangeM) {
    return { tier: 'detection', snr: result.snrAtDetection * (result.detectionRangeM / rangeM) ** 2 };
  }
  return { tier: null, snr: 0 };
}
