/**
 * Weather condition types for environmental effects on sensor performance.
 */

/** Weather conditions affecting radar and EO sensor detection ranges. */
export interface WeatherCondition {
  visibilityKm: number;      // 0.1-50 km
  rainMmHr: number;           // 0-100 mm/hr
  cloudCeilingFt: number;     // 0-50000 ft
  windSpeedKts: number;       // 0-100 kts
}

/** Default clear weather — no degradation to sensor performance. */
export const CLEAR_WEATHER: WeatherCondition = {
  visibilityKm: 50,
  rainMmHr: 0,
  cloudCeilingFt: 50000,
  windSpeedKts: 5,
};

/** Radar clutter zone — generates false alarms within its radius. */
export interface ClutterZone {
  id: string;
  center: { lat: number; lon: number };
  radiusM: number;
  density: number; // 0-1, probability of false alarm per scan cycle
}
