import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SystemTrack } from '@eloc2/domain';

const SOURCE_ID = 'system-tracks';
const LAYER_ID = 'system-tracks-layer';
const LABEL_LAYER_ID = 'system-tracks-labels';
const ELLIPSE_SOURCE_ID = 'track-ellipses';
const ELLIPSE_LAYER_ID = 'track-ellipses-layer';

/**
 * Status to color mapping (military C2 conventions):
 * - confirmed = green
 * - tentative = yellow
 * - dropped = red
 */
function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#00cc44';
    case 'tentative': return '#ffcc00';
    case 'dropped': return '#ff3333';
    default: return '#888888';
  }
}

export function initTrackLayer(map: MaplibreMap) {
  // Track points source
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Uncertainty ellipses source
  map.addSource(ELLIPSE_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Uncertainty ellipses (drawn first, below icons)
  map.addLayer({
    id: ELLIPSE_LAYER_ID,
    type: 'fill',
    source: ELLIPSE_SOURCE_ID,
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.1,
    },
  });

  // Track icons as circles
  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  // Track labels
  map.addLayer({
    id: LABEL_LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-font': ['Noto Sans Bold'],
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });
}

/**
 * Generate a rough ellipse polygon from covariance values.
 * Uses the diagonal of covariance as semi-axes in meters,
 * converted to approximate degrees.
 */
function covarianceToEllipse(
  lon: number,
  lat: number,
  cov: number[][],
  color: string,
  trackId: string,
): GeoJSON.Feature {
  const semiAxisXm = Math.sqrt(Math.abs(cov[0]?.[0] ?? 100));
  const semiAxisYm = Math.sqrt(Math.abs(cov[1]?.[1] ?? 100));
  // Convert meters to degrees (rough approximation)
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const mPerDegLat = 110540;
  const semiAxisXdeg = (semiAxisXm / mPerDegLon) * 3; // Scale for visibility
  const semiAxisYdeg = (semiAxisYm / mPerDegLat) * 3;

  const segments = 32;
  const coords: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    coords.push([
      lon + semiAxisXdeg * Math.cos(angle),
      lat + semiAxisYdeg * Math.sin(angle),
    ]);
  }

  return {
    type: 'Feature',
    properties: { color, trackId },
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

export function updateTrackLayer(map: MaplibreMap, tracks: SystemTrack[]) {
  const source = map.getSource(SOURCE_ID);
  const ellipseSource = map.getSource(ELLIPSE_SOURCE_ID);
  if (!source || !ellipseSource) return;

  const features: GeoJSON.Feature[] = tracks.map(track => ({
    type: 'Feature',
    properties: {
      id: track.systemTrackId,
      label: track.systemTrackId,
      color: statusColor(track.status),
      status: track.status,
      confidence: track.confidence,
    },
    geometry: {
      type: 'Point',
      coordinates: [track.state.lon, track.state.lat],
    },
  }));

  const ellipseFeatures: GeoJSON.Feature[] = tracks
    .filter(t => t.status !== 'dropped')
    .map(track =>
      covarianceToEllipse(
        track.state.lon,
        track.state.lat,
        track.covariance,
        statusColor(track.status),
        track.systemTrackId,
      )
    );

  (source as any).setData({ type: 'FeatureCollection', features });
  (ellipseSource as any).setData({ type: 'FeatureCollection', features: ellipseFeatures });
}

export function getTrackLayerId(): string {
  return LAYER_ID;
}
