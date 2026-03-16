import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SystemTrack } from '@eloc2/domain';
import type { UnresolvedGroupWS } from '../../stores/task-store';

const SOURCE_ID = 'ambiguity-markers';
const LAYER_ID = 'ambiguity-markers-layer';
const PULSE_LAYER_ID = 'ambiguity-markers-pulse';

export function initAmbiguityMarkerLayer(map: MaplibreMap) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Outer pulsing ring
  map.addLayer({
    id: PULSE_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 20,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ff6699',
      'circle-stroke-opacity': 0.4,
    },
  });

  // Inner marker
  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 14,
      'circle-color': 'transparent',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ff6699',
      'circle-stroke-opacity': 0.8,
    },
  });
}

/**
 * Update ambiguity markers on map based on unresolved groups.
 * Places markers at the position of the associated system track.
 */
export function updateAmbiguityMarkerLayer(
  map: MaplibreMap,
  groups: UnresolvedGroupWS[],
  tracks: SystemTrack[],
) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const trackMap = new Map(tracks.map(t => [t.systemTrackId, t]));

  // For each active group, find the associated track via cue→track mapping
  // Since we don't have the cue-to-track mapping in frontend, we use eoTrackIds
  // to find the associated system track from the eoTracks store
  const features: GeoJSON.Feature[] = [];

  for (const group of groups) {
    if (group.status !== 'active') continue;

    // Find any track that has eoInvestigationStatus === 'split_detected'
    // This is a heuristic — the group is linked to tracks with split status
    for (const track of tracks) {
      if (track.eoInvestigationStatus === 'split_detected') {
        features.push({
          type: 'Feature',
          properties: {
            groupId: group.groupId,
            trackCount: group.eoTrackIds.length,
            reason: group.reason,
          },
          geometry: {
            type: 'Point',
            coordinates: [track.state.lon, track.state.lat],
          },
        });
        break; // One marker per group
      }
    }
  }

  (source as any).setData({ type: 'FeatureCollection', features });
}

export function getAmbiguityMarkerLayerIds(): string[] {
  return [LAYER_ID, PULSE_LAYER_ID];
}
