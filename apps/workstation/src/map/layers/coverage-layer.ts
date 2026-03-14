import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState } from '@eloc2/domain';

const RADAR_COV_SOURCE = 'radar-coverage';
const RADAR_COV_LAYER = 'radar-coverage-layer';
const EO_FOR_SOURCE = 'eo-for';
const EO_FOR_LAYER = 'eo-for-layer';
const EO_FOV_SOURCE = 'eo-fov';
const EO_FOV_LAYER = 'eo-fov-layer';

/**
 * Generate a coverage arc polygon given sensor position and coverage params.
 * For 360-degree coverage (radar), creates a circle.
 */
function coverageArcPolygon(
  lon: number,
  lat: number,
  minAzDeg: number,
  maxAzDeg: number,
  maxRangeM: number,
): [number, number][] {
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const mPerDegLat = 110540;
  const rangeDegLon = maxRangeM / mPerDegLon;
  const rangeDegLat = maxRangeM / mPerDegLat;

  const coords: [number, number][] = [[lon, lat]]; // center
  const isFullCircle = (maxAzDeg - minAzDeg) >= 359;
  const startDeg = isFullCircle ? 0 : minAzDeg;
  const endDeg = isFullCircle ? 360 : maxAzDeg;
  const segments = 64;

  for (let i = 0; i <= segments; i++) {
    const azDeg = startDeg + ((endDeg - startDeg) * i) / segments;
    const azRad = (azDeg * Math.PI) / 180;
    // Azimuth: 0=North, 90=East (geographic convention)
    coords.push([
      lon + rangeDegLon * Math.sin(azRad),
      lat + rangeDegLat * Math.cos(azRad),
    ]);
  }
  coords.push([lon, lat]); // close
  return coords;
}

/**
 * Generate FOV footprint as a narrow cone polygon.
 */
function fovPolygon(
  lon: number,
  lat: number,
  azDeg: number,
  halfAngleHDeg: number,
  rangeM: number,
): [number, number][] {
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const mPerDegLat = 110540;
  const rangeDegLon = rangeM / mPerDegLon;
  const rangeDegLat = rangeM / mPerDegLat;

  const coords: [number, number][] = [[lon, lat]];
  const startAz = azDeg - halfAngleHDeg;
  const endAz = azDeg + halfAngleHDeg;
  const segments = 16;

  for (let i = 0; i <= segments; i++) {
    const az = startAz + ((endAz - startAz) * i) / segments;
    const azRad = (az * Math.PI) / 180;
    coords.push([
      lon + rangeDegLon * Math.sin(azRad),
      lat + rangeDegLat * Math.cos(azRad),
    ]);
  }
  coords.push([lon, lat]);
  return coords;
}

export function initCoverageLayer(map: MaplibreMap) {
  // Radar coverage arcs
  map.addSource(RADAR_COV_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: RADAR_COV_LAYER,
    type: 'fill',
    source: RADAR_COV_SOURCE,
    paint: {
      'fill-color': '#4488ff',
      'fill-opacity': 0.06,
    },
  });

  // EO FOR (field of regard)
  map.addSource(EO_FOR_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: EO_FOR_LAYER,
    type: 'line',
    source: EO_FOR_SOURCE,
    paint: {
      'line-color': '#ff8800',
      'line-opacity': 0.3,
      'line-width': 1,
      'line-dasharray': [4, 4],
    },
  });

  // EO FOV (field of view — instantaneous)
  map.addSource(EO_FOV_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: EO_FOV_LAYER,
    type: 'fill',
    source: EO_FOV_SOURCE,
    paint: {
      'fill-color': '#ff8800',
      'fill-opacity': 0.15,
    },
  });
}

export function updateCoverageLayer(map: MaplibreMap, sensors: SensorState[]) {
  const radarSource = map.getSource(RADAR_COV_SOURCE);
  const eoForSource = map.getSource(EO_FOR_SOURCE);
  const eoFovSource = map.getSource(EO_FOV_SOURCE);
  if (!radarSource || !eoForSource || !eoFovSource) return;

  const radarFeatures: GeoJSON.Feature[] = [];
  const eoForFeatures: GeoJSON.Feature[] = [];
  const eoFovFeatures: GeoJSON.Feature[] = [];

  for (const sensor of sensors) {
    if (!sensor.online) continue;
    const { lon, lat } = sensor.position;
    const cov = sensor.coverage;

    if (sensor.sensorType === 'radar') {
      radarFeatures.push({
        type: 'Feature',
        properties: { id: sensor.sensorId },
        geometry: {
          type: 'Polygon',
          coordinates: [coverageArcPolygon(lon, lat, cov.minAzDeg, cov.maxAzDeg, cov.maxRangeM)],
        },
      });
    }

    if (sensor.sensorType === 'eo') {
      // FOR
      eoForFeatures.push({
        type: 'Feature',
        properties: { id: sensor.sensorId },
        geometry: {
          type: 'Polygon',
          coordinates: [coverageArcPolygon(lon, lat, cov.minAzDeg, cov.maxAzDeg, cov.maxRangeM)],
        },
      });
      // FOV
      if (sensor.gimbal && sensor.fov) {
        eoFovFeatures.push({
          type: 'Feature',
          properties: { id: sensor.sensorId },
          geometry: {
            type: 'Polygon',
            coordinates: [fovPolygon(lon, lat, sensor.gimbal.azimuthDeg, sensor.fov.halfAngleHDeg, cov.maxRangeM)],
          },
        });
      }
    }
  }

  (radarSource as any).setData({ type: 'FeatureCollection', features: radarFeatures });
  (eoForSource as any).setData({ type: 'FeatureCollection', features: eoForFeatures });
  (eoFovSource as any).setData({ type: 'FeatureCollection', features: eoFovFeatures });
}
