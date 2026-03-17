import type maplibregl from 'maplibre-gl';

/**
 * Layer IDs that are hidden in "Basic Tracking" mode.
 * Basic mode shows only track circles + sensor positions — no EO overlays.
 */
const BASIC_MODE_HIDDEN_LAYERS: string[] = [
  'eo-rays-layer',
  'eo-fov-layer',
  'eo-for-layer',
  'bearing-lines-layer',
  'triangulation-rays-layer',
  'investigation-rings-layer',
  'ambiguity-markers-layer',
  'ambiguity-markers-pulse',
  'track-ellipses-layer',
  'sensors-degraded',
  'selection-rays-layer',
  'radar-coverage-layer',
];

/**
 * Panel views to hide in basic mode.
 */
const BASIC_MODE_HIDDEN_PANELS: string[] = ['tasks', 'investigation'];

/** Returns the list of MapLibre layer IDs to hide in basic mode. */
export function getBasicModeLayers(): string[] {
  return BASIC_MODE_HIDDEN_LAYERS;
}

/** Returns the panel view names to hide in basic mode. */
export function getBasicModeHiddenPanels(): string[] {
  return BASIC_MODE_HIDDEN_PANELS;
}

/** Hide all EO/advanced layers — leaves only track circles and sensor dots. */
export function applyBasicMode(map: maplibregl.Map): void {
  for (const layerId of BASIC_MODE_HIDDEN_LAYERS) {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    } catch {
      // Layer may not exist yet — safe to ignore
    }
  }
}

/** Restore all layers to visible — full ELOC2 view. */
export function applyFullMode(map: maplibregl.Map): void {
  for (const layerId of BASIC_MODE_HIDDEN_LAYERS) {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    } catch {
      // Layer may not exist yet — safe to ignore
    }
  }
}
