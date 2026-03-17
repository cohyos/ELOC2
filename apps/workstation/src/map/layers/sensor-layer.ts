import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState } from '@eloc2/domain';
import type { RegistrationStateWS } from '../../stores/task-store';

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

const DEGRADED_LAYER_ID = 'sensors-degraded';
const HIGHLIGHT_RING_LAYER_ID = 'sensors-highlight-ring';

export function initSensorLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Degraded indicator ring (drawn below sensor circle)
  map.addLayer({
    id: DEGRADED_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'degraded'], true],
    paint: {
      'circle-radius': 12,
      'circle-color': 'transparent',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': ['case',
        ['==', ['get', 'fusionSafe'], false], '#ff3333',
        '#ffcc00',
      ],
      'circle-stroke-opacity': 0.8,
    },
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
      'circle-stroke-color': ['case',
        ['==', ['get', 'online'], false], '#ff3333',
        '#000000',
      ],
    },
  });

  // Sensor labels — separate try/catch so font issues don't break circles
  try {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });
  } catch (e) {
    console.warn('[sensor-layer] Label layer failed:', e);
  }

  // Selection highlight ring — bright white border on highlighted sensors
  map.addLayer({
    id: HIGHLIGHT_RING_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'highlighted'], true],
    paint: {
      'circle-radius': 14,
      'circle-color': 'transparent',
      'circle-stroke-width': 4,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.9,
    },
  });
}

export function updateSensorLayer(
  map: MaplibreMap,
  sensors: SensorState[],
  registrationStates?: RegistrationStateWS[],
  highlightedSensorIds?: string[],
) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const regMap = new Map(
    (registrationStates ?? []).map(r => [r.sensorId, r]),
  );

  const highlightSet = new Set(highlightedSensorIds ?? []);
  const hasSelection = highlightSet.size > 0;

  const features: GeoJSON.Feature[] = sensors.map(sensor => {
    const reg = regMap.get(sensor.sensorId as string);
    const degraded = reg
      ? (reg.spatialQuality === 'degraded' || reg.spatialQuality === 'unsafe' ||
         reg.timingQuality === 'degraded' || reg.timingQuality === 'unsafe')
      : false;
    // Short label: type prefix + number, e.g. "R1", "E2", "C1"
    const typePrefix = sensor.sensorType === 'radar' ? 'R' : sensor.sensorType === 'eo' ? 'E' : 'C';
    const idNum = (sensor.sensorId as string).match(/(\d+)/)?.[1] ?? '?';
    return {
      type: 'Feature',
      properties: {
        id: sensor.sensorId,
        label: `${typePrefix}${idNum}`,
        color: sensor.online ? sensorColor(sensor.sensorType) : '#555555',
        shape: sensorShape(sensor.sensorType),
        sensorType: sensor.sensorType,
        online: sensor.online,
        degraded,
        fusionSafe: reg?.fusionSafe ?? true,
        highlighted: highlightSet.has(sensor.sensorId as string),
      },
      geometry: {
        type: 'Point',
        coordinates: [sensor.position.lon, sensor.position.lat],
      },
    };
  });

  (source as any).setData({ type: 'FeatureCollection', features });

  // Apply selection-based opacity: dim non-highlighted sensors when a track is selected
  try {
    if (hasSelection) {
      const opacityExpr: any = ['case', ['==', ['get', 'highlighted'], true], 1.0, 0.5];
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'circle-opacity', opacityExpr);
      }
      if (map.getLayer(LABEL_LAYER_ID)) {
        map.setPaintProperty(LABEL_LAYER_ID, 'text-opacity', opacityExpr);
      }
      if (map.getLayer(DEGRADED_LAYER_ID)) {
        map.setPaintProperty(DEGRADED_LAYER_ID, 'circle-stroke-opacity', opacityExpr);
      }
    } else {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'circle-opacity', 1.0);
      }
      if (map.getLayer(LABEL_LAYER_ID)) {
        map.setPaintProperty(LABEL_LAYER_ID, 'text-opacity', 1.0);
      }
      if (map.getLayer(DEGRADED_LAYER_ID)) {
        map.setPaintProperty(DEGRADED_LAYER_ID, 'circle-stroke-opacity', 0.8);
      }
    }
  } catch (e) {
    console.warn('[sensor-layer] Failed to apply highlight styling:', e);
  }
}

export function getSensorLayerId(): string {
  return LAYER_ID;
}
