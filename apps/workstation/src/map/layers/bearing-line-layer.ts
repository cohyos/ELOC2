import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState } from '@eloc2/domain';

const SOURCE_ID = 'bearing-lines';
const LAYER_ID = 'bearing-lines-layer';

/**
 * Draws bearing observation lines from EO sensors.
 * Each bearing is a line from the sensor position along the measured azimuth.
 * Distinct from the gimbal ray layer — these show actual measured bearings
 * stored in the task/cue data.
 */
export function initBearingLineLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.5,
      'line-opacity': 0.6,
    },
  });
}

export interface BearingLine {
  sensorId: string;
  azimuthDeg: number;
  sensorLon: number;
  sensorLat: number;
  color: string;
}

export function updateBearingLineLayer(map: MaplibreMap, bearings: BearingLine[]) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const rayLengthM = 50000; // 50km
  const features: GeoJSON.Feature[] = bearings.map(b => {
    const azRad = (b.azimuthDeg * Math.PI) / 180;
    const mPerDegLon = 111320 * Math.cos((b.sensorLat * Math.PI) / 180);
    const mPerDegLat = 110540;
    const endLon = b.sensorLon + (rayLengthM / mPerDegLon) * Math.sin(azRad);
    const endLat = b.sensorLat + (rayLengthM / mPerDegLat) * Math.cos(azRad);

    return {
      type: 'Feature',
      properties: { sensorId: b.sensorId, color: b.color },
      geometry: {
        type: 'LineString',
        coordinates: [[b.sensorLon, b.sensorLat], [endLon, endLat]],
      },
    };
  });

  (source as any).setData({ type: 'FeatureCollection', features });
}
