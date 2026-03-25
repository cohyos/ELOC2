import { describe, it, expect } from 'vitest';
import {
  computeIrDetectionRange,
  checkIrDetection,
  computeExtinctionCoeff,
  atmosphericTransmission,
  computeIfovMrad,
  STARING_SENSOR_PROFILE,
  INVESTIGATOR_SENSOR_PROFILE,
  STANDARD_ATMOSPHERE,
  GOOD_WEATHER_ATMOSPHERE,
  HAZY_ATMOSPHERE,
  RAIN_ATMOSPHERE,
} from '../ir-detection.js';

describe('IR Detection Range Calculator', () => {
  describe('atmospheric model', () => {
    it('standard MWIR atmosphere extinction ~0.06-0.1/km', () => {
      const sigma = computeExtinctionCoeff(STANDARD_ATMOSPHERE);
      expect(sigma).toBeGreaterThan(0.04);
      expect(sigma).toBeLessThan(0.15);
    });

    it('good weather has lower extinction than standard', () => {
      const good = computeExtinctionCoeff(GOOD_WEATHER_ATMOSPHERE);
      const std = computeExtinctionCoeff(STANDARD_ATMOSPHERE);
      expect(good).toBeLessThan(std);
    });

    it('rain has much higher extinction', () => {
      const rain = computeExtinctionCoeff(RAIN_ATMOSPHERE);
      const std = computeExtinctionCoeff(STANDARD_ATMOSPHERE);
      expect(rain).toBeGreaterThan(std * 2);
    });

    it('transmission decreases with range', () => {
      const t10 = atmosphericTransmission(10_000, 0.2);
      const t20 = atmosphericTransmission(20_000, 0.2);
      const t40 = atmosphericTransmission(40_000, 0.2);
      expect(t10).toBeGreaterThan(t20);
      expect(t20).toBeGreaterThan(t40);
      expect(t10).toBeCloseTo(0.135, 1); // exp(-0.2 × 10) ≈ 0.135
    });
  });

  describe('sensor specs', () => {
    it('staring sensor IFOV is reasonable', () => {
      const ifov = computeIfovMrad(STARING_SENSOR_PROFILE.wideSpec);
      // 15μm / 50mm = 0.3 mrad
      expect(ifov).toBeCloseTo(0.3, 1);
    });

    it('investigator zoom IFOV is much smaller (higher resolution)', () => {
      const wide = computeIfovMrad(INVESTIGATOR_SENSOR_PROFILE.wideSpec);
      const narrow = computeIfovMrad(INVESTIGATOR_SENSOR_PROFILE.narrowSpec!);
      expect(narrow).toBeLessThan(wide / 10); // 40× zoom ratio
      // 15μm / 1400mm ≈ 0.0107 mrad
      expect(narrow).toBeCloseTo(0.0107, 2);
    });
  });

  describe('detection ranges — staring sensor', () => {
    const staringSpec = STARING_SENSOR_PROFILE.wideSpec;

    it('fighter aircraft (high IR) detected at 60-120 km', () => {
      const result = computeIrDetectionRange(15_000, 'fighter_aircraft', staringSpec, GOOD_WEATHER_ATMOSPHERE);
      expect(result.detectionRangeM).toBeGreaterThan(60_000);
      expect(result.detectionRangeM).toBeLessThan(120_000);
      console.log(`Staring → Fighter (15kW/sr): detect=${(result.detectionRangeM/1000).toFixed(1)}km, recog=${(result.recognitionRangeM/1000).toFixed(1)}km, id=${(result.identificationRangeM/1000).toFixed(1)}km`);
    });

    it('Shahed-136 drone (low IR) detected at 20-60 km', () => {
      const result = computeIrDetectionRange(200, 'uav', staringSpec, GOOD_WEATHER_ATMOSPHERE);
      expect(result.detectionRangeM).toBeGreaterThan(20_000);
      expect(result.detectionRangeM).toBeLessThan(60_000);
      console.log(`Staring → Shahed-136 (200W/sr): detect=${(result.detectionRangeM/1000).toFixed(1)}km, recog=${(result.recognitionRangeM/1000).toFixed(1)}km, id=${(result.identificationRangeM/1000).toFixed(1)}km`);
    });

    it('ballistic missile (very high IR) detected at 80-150 km', () => {
      const result = computeIrDetectionRange(65_000, 'missile', staringSpec, GOOD_WEATHER_ATMOSPHERE);
      expect(result.detectionRangeM).toBeGreaterThan(80_000);
      expect(result.detectionRangeM).toBeLessThan(150_000);
      console.log(`Staring → BM (65kW/sr): detect=${(result.detectionRangeM/1000).toFixed(1)}km, recog=${(result.recognitionRangeM/1000).toFixed(1)}km, id=${(result.identificationRangeM/1000).toFixed(1)}km`);
    });

    it('helicopter (medium IR) detected at 50-100 km', () => {
      const result = computeIrDetectionRange(5_000, 'helicopter', staringSpec, GOOD_WEATHER_ATMOSPHERE);
      expect(result.detectionRangeM).toBeGreaterThan(50_000);
      expect(result.detectionRangeM).toBeLessThan(100_000);
      console.log(`Staring → Helicopter (5kW/sr): detect=${(result.detectionRangeM/1000).toFixed(1)}km, recog=${(result.recognitionRangeM/1000).toFixed(1)}km, id=${(result.identificationRangeM/1000).toFixed(1)}km`);
    });
  });

  describe('detection ranges — investigator (zoom)', () => {
    const zoomSpec = INVESTIGATOR_SENSOR_PROFILE.narrowSpec!;

    it('fighter at zoom: much longer DRI ranges than staring', () => {
      const staring = computeIrDetectionRange(15_000, 'fighter_aircraft', STARING_SENSOR_PROFILE.wideSpec, GOOD_WEATHER_ATMOSPHERE);
      const zoom = computeIrDetectionRange(15_000, 'fighter_aircraft', zoomSpec, GOOD_WEATHER_ATMOSPHERE);
      // Zoom has 28× better IFOV → much longer Johnson DRI ranges
      expect(zoom.identificationRangeM).toBeGreaterThan(staring.identificationRangeM * 2);
      console.log(`Investigator zoom → Fighter: detect=${(zoom.detectionRangeM/1000).toFixed(1)}km, id=${(zoom.identificationRangeM/1000).toFixed(1)}km (vs staring id=${(staring.identificationRangeM/1000).toFixed(1)}km)`);
    });

    it('drone at zoom: identification possible at reasonable range', () => {
      const result = computeIrDetectionRange(200, 'uav', zoomSpec, GOOD_WEATHER_ATMOSPHERE);
      expect(result.identificationRangeM).toBeGreaterThan(1_000);
      console.log(`Investigator zoom → Shahed-136: detect=${(result.detectionRangeM/1000).toFixed(1)}km, id=${(result.identificationRangeM/1000).toFixed(1)}km`);
    });
  });

  describe('path-integral atmosphere (high-altitude targets)', () => {
    const staringSpec = STARING_SENSOR_PROFILE.wideSpec;

    it('BM at 50 km altitude detected at 150+ km (reduced atmospheric path)', () => {
      const seaLevel = computeIrDetectionRange(65_000, 'missile', staringSpec, GOOD_WEATHER_ATMOSPHERE, 0);
      const highAlt = computeIrDetectionRange(65_000, 'missile', staringSpec, GOOD_WEATHER_ATMOSPHERE, 50_000);
      expect(highAlt.detectionRangeM).toBeGreaterThan(150_000); // 150+ km
      expect(highAlt.detectionRangeM).toBeGreaterThan(seaLevel.detectionRangeM * 1.3); // significantly longer
      console.log(`BM: sea-level=${(seaLevel.detectionRangeM/1000).toFixed(1)}km vs 50km-alt=${(highAlt.detectionRangeM/1000).toFixed(1)}km (${((highAlt.detectionRangeM/seaLevel.detectionRangeM)*100).toFixed(0)}%)`);
    });

    it('fighter at 10 km altitude has longer range than at sea level', () => {
      const low = computeIrDetectionRange(15_000, 'fighter_aircraft', staringSpec, GOOD_WEATHER_ATMOSPHERE, 0);
      const high = computeIrDetectionRange(15_000, 'fighter_aircraft', staringSpec, GOOD_WEATHER_ATMOSPHERE, 10_000);
      expect(high.detectionRangeM).toBeGreaterThan(low.detectionRangeM);
      console.log(`Fighter: sea-level=${(low.detectionRangeM/1000).toFixed(1)}km vs 10km-alt=${(high.detectionRangeM/1000).toFixed(1)}km`);
    });

    it('low-altitude drone (300m) has minimal benefit from path integral', () => {
      const ground = computeIrDetectionRange(200, 'uav', staringSpec, GOOD_WEATHER_ATMOSPHERE, 0);
      const low = computeIrDetectionRange(200, 'uav', staringSpec, GOOD_WEATHER_ATMOSPHERE, 300);
      // Less than 5% improvement at 300m altitude
      expect(low.detectionRangeM).toBeLessThan(ground.detectionRangeM * 1.1);
      console.log(`Drone: ground=${(ground.detectionRangeM/1000).toFixed(1)}km vs 300m-alt=${(low.detectionRangeM/1000).toFixed(1)}km`);
    });
  });

  describe('weather effects', () => {
    it('rain reduces detection range significantly', () => {
      const clear = computeIrDetectionRange(15_000, 'fighter_aircraft', STARING_SENSOR_PROFILE.wideSpec, GOOD_WEATHER_ATMOSPHERE);
      const rain = computeIrDetectionRange(15_000, 'fighter_aircraft', STARING_SENSOR_PROFILE.wideSpec, RAIN_ATMOSPHERE);
      expect(rain.detectionRangeM).toBeLessThan(clear.detectionRangeM * 0.7);
      console.log(`Weather: clear=${(clear.detectionRangeM/1000).toFixed(1)}km vs rain=${(rain.detectionRangeM/1000).toFixed(1)}km (${((rain.detectionRangeM/clear.detectionRangeM)*100).toFixed(0)}%)`);
    });

    it('haze reduces detection range moderately', () => {
      const clear = computeIrDetectionRange(15_000, 'fighter_aircraft', STARING_SENSOR_PROFILE.wideSpec, GOOD_WEATHER_ATMOSPHERE);
      const hazy = computeIrDetectionRange(15_000, 'fighter_aircraft', STARING_SENSOR_PROFILE.wideSpec, HAZY_ATMOSPHERE);
      expect(hazy.detectionRangeM).toBeLessThan(clear.detectionRangeM);
      expect(hazy.detectionRangeM).toBeGreaterThan(clear.detectionRangeM * 0.4);
      console.log(`Weather: clear=${(clear.detectionRangeM/1000).toFixed(1)}km vs hazy=${(hazy.detectionRangeM/1000).toFixed(1)}km (${((hazy.detectionRangeM/clear.detectionRangeM)*100).toFixed(0)}%)`);
    });
  });

  describe('checkIrDetection', () => {
    it('returns correct tier at different ranges', () => {
      const spec = STARING_SENSOR_PROFILE.wideSpec;
      const result = computeIrDetectionRange(15_000, 'fighter_aircraft', spec, GOOD_WEATHER_ATMOSPHERE);

      const atClose = checkIrDetection(5_000, 15_000, 'fighter_aircraft', spec, GOOD_WEATHER_ATMOSPHERE);
      expect(atClose.tier).not.toBeNull();
      expect(atClose.snr).toBeGreaterThan(MIN_SNR_CHECK);

      const beyondRange = checkIrDetection(result.detectionRangeM + 10_000, 15_000, 'fighter_aircraft', spec, GOOD_WEATHER_ATMOSPHERE);
      expect(beyondRange.tier).toBeNull();
    });
  });
});

// Helper constant for test assertions
const MIN_SNR_CHECK = 1.0;
