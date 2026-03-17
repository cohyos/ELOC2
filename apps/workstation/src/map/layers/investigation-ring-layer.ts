import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SystemTrack } from '@eloc2/domain';

const SOURCE_ID = 'investigation-rings';
const LAYER_ID = 'investigation-rings-layer';
const OUTER_LAYER_ID = 'investigation-rings-outer';

/**
 * Draws a ring around tracks that are under EO investigation.
 * Uses two concentric circle layers to create a ring effect.
 */
export function initInvestigationRingLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Outer ring (larger, semi-transparent)
  map.addLayer({
    id: OUTER_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 16,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-opacity': 0.6,
    },
  });

  // Inner ring (bright)
  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 12,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-opacity': 0.9,
    },
  });
}

function investigationColor(status: string): string {
  switch (status) {
    case 'in_progress': return '#4a9eff';
    case 'confirmed': return '#00cc44';
    case 'split_detected': return '#ff3333';
    case 'no_support': return '#ff8800';
    default: return '#4a9eff';
  }
}

export function updateInvestigationRingLayer(map: MaplibreMap, tracks: SystemTrack[]) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const investigatedTracks = tracks.filter(
    t => t.eoInvestigationStatus && t.eoInvestigationStatus !== 'none' && t.status !== 'dropped'
  );

  const features: GeoJSON.Feature[] = investigatedTracks.map(track => ({
    type: 'Feature',
    properties: {
      id: track.systemTrackId,
      color: investigationColor(track.eoInvestigationStatus),
      status: track.eoInvestigationStatus,
    },
    geometry: {
      type: 'Point',
      coordinates: [track.state.lon, track.state.lat],
    },
  }));

  (source as any).setData({ type: 'FeatureCollection', features });
}
