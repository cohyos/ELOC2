import { describe, it } from 'vitest';
import {
  computeIrDetectionRange,
  computeExtinctionCoeff,
  STARING_SENSOR_PROFILE,
  INVESTIGATOR_SENSOR_PROFILE,
  GOOD_WEATHER_ATMOSPHERE,
  STANDARD_ATMOSPHERE,
  HAZY_ATMOSPHERE,
  RAIN_ATMOSPHERE,
} from '../ir-detection.js';

describe('manual calc', () => {
  it('all targets', () => {
    const s = STARING_SENSOR_PROFILE.wideSpec;
    const z = INVESTIGATOR_SENSOR_PROFILE.narrowSpec!;
    const targets: [string, number, string, number][] = [
      ['Su-35', 20000, 'fighter_aircraft', 0],
      ['F-16C', 8000, 'fighter_aircraft', 0],
      ['Cruise Missile', 3000, 'uav', 0],
      ['Mohajer-6', 500, 'uav', 0],
    ];
    for (const [name, ir, cls, alt] of targets) {
      const r = computeIrDetectionRange(ir, cls, s, GOOD_WEATHER_ATMOSPHERE, alt);
      const rz = computeIrDetectionRange(ir, cls, z, GOOD_WEATHER_ATMOSPHERE, alt);
      console.log(`${name}: staring=${(r.detectionRangeM/1000).toFixed(1)}km, zoom_detect=${(rz.detectionRangeM/1000).toFixed(1)}km, zoom_id=${(rz.identificationRangeM/1000).toFixed(1)}km`);
    }
    // Helicopter zoom
    const hz = computeIrDetectionRange(5000, 'helicopter', z, GOOD_WEATHER_ATMOSPHERE, 0);
    console.log(`Helicopter zoom: detect=${(hz.detectionRangeM/1000).toFixed(1)}km, id=${(hz.identificationRangeM/1000).toFixed(1)}km`);

    // Standard weather
    const goodR = computeIrDetectionRange(15000, 'fighter_aircraft', s, GOOD_WEATHER_ATMOSPHERE);
    const stdR = computeIrDetectionRange(15000, 'fighter_aircraft', s, STANDARD_ATMOSPHERE);
    console.log(`Standard weather: ${(stdR.detectionRangeM/1000).toFixed(1)}km (${((stdR.detectionRangeM/goodR.detectionRangeM)*100).toFixed(0)}%)`);

    // Extinction coefficients
    console.log(`Ext good: ${computeExtinctionCoeff(GOOD_WEATHER_ATMOSPHERE).toFixed(4)}`);
    console.log(`Ext std: ${computeExtinctionCoeff(STANDARD_ATMOSPHERE).toFixed(4)}`);
    console.log(`Ext hazy: ${computeExtinctionCoeff(HAZY_ATMOSPHERE).toFixed(4)}`);
    console.log(`Ext rain: ${computeExtinctionCoeff(RAIN_ATMOSPHERE).toFixed(4)}`);

    // BM at 50km zoom
    const bmz = computeIrDetectionRange(65000, 'missile', z, GOOD_WEATHER_ATMOSPHERE, 50000);
    console.log(`BM 50km zoom: detect=${(bmz.detectionRangeM/1000).toFixed(1)}km, id=${(bmz.identificationRangeM/1000).toFixed(1)}km`);
  });
});
