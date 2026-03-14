import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState } from '@eloc2/domain';

const SOURCE_ID = 'sensors';
const LAYER_ID = 'sensors-layer';
const LABEL_LAYER_ID = 'sensors-labels';

/**
 * Sensor type to color/shape:
 * - radar = blue circle
 * - eo = orange triangle (approximated as circle with distinct color)
 * - c4isr = purple diamond
 */
function sensorColor(type: string): string {
  switch (type) {
    case 'radar': return '#4488ff';
    case 'eo': return '#ff8800';
    case 'c4isr': return '#aa44ff';
    default: return '#888888';
  }
}

function sensorShape(type: string): string {
  switch (type) {
    case 'radar': return 'circle';
    case 'eo': return 'triangle';
    case 'c4isr': return 'diamond';
    default: return 'circle';
  }
}

export function initSensorLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Sensor markers
  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 7,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#000000',
    },
  });

  // Sensor labels
  map.addLayer({
    id: LABEL_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-offset': [0, -1.5],
      'text-anchor': 'bottom',
      'text-font': ['Open Sans Regular'],
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });
}

export function updateSensorLayer(map: MaplibreMap, sensors: SensorState[]) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const features: GeoJSON.Feature[] = sensors.map(sensor => ({
    type: 'Feature',
    properties: {
      id: sensor.sensorId,
      label: sensor.sensorId,
      color: sensorColor(sensor.sensorType),
      shape: sensorShape(sensor.sensorType),
      sensorType: sensor.sensorType,
      online: sensor.online,
    },
    geometry: {
      type: 'Point',
      coordinates: [sensor.position.lon, sensor.position.lat],
    },
  }));

  (source as any).setData({ type: 'FeatureCollection', features });
}

export function getSensorLayerId(): string {
  return LAYER_ID;
}
