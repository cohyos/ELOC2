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
 *  This accounts for molecular absorption (H2O, CO2) + aerosol scattering.
 *  Standard: 0.2/km at sea level, clear day, 50% RH.
 *  Range: 0.1 (very clear) to 2.0 (heavy rain/fog). */
const STANDARD_EXTINCTION_KM = 0.2;

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

  // Humidity correction: H2O absorption increases with humidity
  // At 100% RH, extinction doubles vs 0% RH in MWIR band
  const humidityFactor = 1.0 + atm.relativeHumidity * 0.8;
  sigma *= humidityFactor;

  // Visibility correction: Koschmieder's law relates visibility to extinction
  // V = 3.912 / σ_vis. For MWIR, empirical ratio is ~0.6 of visible extinction.
  if (atm.visibilityKm < 23) {
    const visExtinction = 3.912 / atm.visibilityKm;
    const mwirVisExtinction = visExtinction * 0.6; // MWIR penetrates better than visible
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
 * Compute atmospheric transmission at a given range.
 * Beer-Lambert: T = exp(-σ × R_km)
 */
export function atmosphericTransmission(rangeM: number, extinctionCoeffKm: number): number {
  const rangeKm = rangeM / 1000;
  return Math.exp(-extinctionCoeffKm * rangeKm);
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
    netdMk: 20,                // cooled MWIR: 20 mK NETD (high sensitivity)
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
): IrDetectionResult {
  const extinctionCoeff = computeExtinctionCoeff(atmosphere);
  const ifovMrad = computeIfovMrad(sensorSpec);

  // Target critical dimension for Johnson's criteria
  const targetDimM = TARGET_DIMENSIONS[targetClassification] ?? TARGET_DIMENSIONS.unknown;

  // ── SNR-based detection range ──────────────────────────────────────────
  // Use iterative search: find max range where SNR ≥ MIN_DETECTION_SNR
  // SNR model: simplified as proportional to irradiance / NETD
  // The NETD is expressed in mK but represents the minimum detectable
  // temperature difference. For a point source, we use the relationship:
  //   SNR ≈ (targetIrWsr × transmission) / (range² × K_noise)
  // where K_noise encapsulates NETD, pixel size, optics throughput.

  // Noise equivalent power: proportional to NETD × pixel area × bandwidth
  // For MWIR (3-5μm), blackbody contrast ~4 W/m²/sr/K at 300K
  const blackbodyContrast = 4.0; // W/m²/sr/K for MWIR at ~300K
  const pixelAreaM2 = (sensorSpec.pixelPitchMicrons * 1e-6) ** 2;
  const apertureAreaM2 = Math.PI * (sensorSpec.focalLengthMm * 0.001 * 0.25) ** 2; // f/4 assumption
  const nep = (sensorSpec.netdMk * 0.001) * blackbodyContrast * pixelAreaM2 / apertureAreaM2;

  // Binary search for max detection range
  let snrRangeM = 1000; // start at 1 km
  let lo = 100, hi = 200_000; // 100m to 200km
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const transmission = atmosphericTransmission(mid, extinctionCoeff);
    const irradiance = (targetIrWsr * transmission) / (mid * mid);
    const snr = irradiance / Math.max(nep, 1e-20);
    if (snr >= MIN_DETECTION_SNR) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  snrRangeM = lo;

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

  const transmissionAtDetection = atmosphericTransmission(detectionRangeM, extinctionCoeff);
  const irradianceAtDetection = (targetIrWsr * transmissionAtDetection) / (detectionRangeM ** 2);
  const snrAtDetection = irradianceAtDetection / Math.max(nep, 1e-20);

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
): { tier: 'detection' | 'recognition' | 'identification' | null; snr: number } {
  const result = computeIrDetectionRange(targetIrWsr, targetClassification, sensorSpec, atmosphere);

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
