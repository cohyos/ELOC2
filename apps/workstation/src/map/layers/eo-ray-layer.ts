import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState } from '@eloc2/domain';

const SOURCE_ID = 'eo-rays';
const LAYER_ID = 'eo-rays-layer';

/**
 * Draws a line-of-sight ray from each EO sensor along its current gimbal azimuth.
 */
export function initEoRayLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': '#ff8800',
      'line-width': 2,
      'line-opacity': 0.7,
      'line-dasharray': [6, 3],
    },
  });
}

export function updateEoRayLayer(map: MaplibreMap, sensors: SensorState[]) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const features: GeoJSON.Feature[] = [];
  const rayLengthM = 40000; // 40km ray

  for (const sensor of sensors) {
    if (sensor.sensorType !== 'eo' || !sensor.gimbal || !sensor.online) continue;
    if (!Number.isFinite(sensor.gimbal.azimuthDeg)) continue;

    const { lon, lat } = sensor.position;
    const azRad = (sensor.gimbal.azimuthDeg * Math.PI) / 180;
    const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
    const mPerDegLat = 110540;

    const endLon = lon + (rayLengthM / mPerDegLon) * Math.sin(azRad);
    const endLat = lat + (rayLengthM / mPerDegLat) * Math.cos(azRad);

    features.push({
      type: 'Feature',
      properties: { id: sensor.sensorId },
      geometry: {
        type: 'LineString',
        coordinates: [[lon, lat], [endLon, endLat]],
      },
    });
  }

  (source as any).setData({ type: 'FeatureCollection', features });
}
