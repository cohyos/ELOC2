import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SelectionBearingRay } from '../../stores/ui-store';

const SOURCE_ID = 'selection-rays-source';
const LAYER_ID = 'selection-rays-layer';

/**
 * Initializes the selection bearing ray layer.
 * These rays highlight EO bearing lines for the currently selected track.
 */
export function initSelectionRayLayer(map: MaplibreMap) {
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
      'line-width': 2,
      'line-opacity': 0.8,
      'line-dasharray': [4, 3],
    },
  });
}

/**
 * Update the selection ray layer with bearing rays for the selected track.
 */
export function updateSelectionRayLayer(map: MaplibreMap, rays: SelectionBearingRay[]) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const rayLengthKm = 50;
  const features: GeoJSON.Feature[] = rays.filter(ray => Number.isFinite(ray.azimuthDeg)).map((ray) => {
    const azRad = (ray.azimuthDeg * Math.PI) / 180;
    const latRad = (ray.sensorLat * Math.PI) / 180;
    const endLat = ray.sensorLat + (rayLengthKm / 111.32) * Math.cos(azRad);
    const endLon = ray.sensorLon + (rayLengthKm / (111.32 * Math.cos(latRad))) * Math.sin(azRad);

    return {
      type: 'Feature',
      properties: { color: ray.color },
      geometry: {
        type: 'LineString',
        coordinates: [
          [ray.sensorLon, ray.sensorLat],
          [endLon, endLat],
        ],
      },
    };
  });

  (source as any).setData({ type: 'FeatureCollection', features });
}

/**
 * Clear all selection rays from the map.
 */
export function clearSelectionRayLayer(map: MaplibreMap) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;
  (source as any).setData({ type: 'FeatureCollection', features: [] });
}

export function getSelectionRayLayerId(): string {
  return LAYER_ID;
}
