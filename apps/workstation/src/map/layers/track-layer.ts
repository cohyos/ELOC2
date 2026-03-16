import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SystemTrack } from '@eloc2/domain';

const SOURCE_ID = 'system-tracks';
const LAYER_ID = 'system-tracks-layer';
const LABEL_LAYER_ID = 'system-tracks-labels';
const EO_BADGE_LAYER_ID = 'track-eo-badge';
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

function eoStatusColor(status: string): string {
  switch (status) {
    case 'in_progress': return '#4a9eff';
    case 'confirmed': return '#00cc44';
    case 'split_detected': return '#ff3333';
    case 'no_support': return '#ff8800';
    default: return 'transparent';
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

  // Track labels — add in a separate try/catch so font issues don't break circles
  try {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-font': ['Open Sans Bold', 'Noto Sans Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });
  } catch (e) {
    console.warn('[track-layer] Label layer failed (font issue?):', e);
  }

  // EO investigation status badge — small dot offset to top-right of track circle
  map.addLayer({
    id: EO_BADGE_LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['!=', ['get', 'eoStatus'], 'none'],
    paint: {
      'circle-radius': 4,
      'circle-color': ['get', 'eoColor'],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000',
      'circle-translate': [7, -7],
    },
  });

  console.log('[track-layer] Initialized successfully');
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

function isValidCoord(track: SystemTrack): boolean {
  const { lat, lon } = track.state;
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

export function updateTrackLayer(map: MaplibreMap, tracks: SystemTrack[]) {
  const source = map.getSource(SOURCE_ID);
  const ellipseSource = map.getSource(ELLIPSE_SOURCE_ID);
  if (!source || !ellipseSource) {
    console.warn('[track-layer] Source not found — initTrackLayer may have failed. source:', !!source, 'ellipseSource:', !!ellipseSource);
    return;
  }

  const validTracks = tracks.filter(isValidCoord);

  // Log rendering info periodically
  if (tracks.length > 0 && validTracks.length === 0) {
    console.error(
      '[track-layer] ALL tracks filtered as invalid!',
      'Sample track:',
      JSON.stringify({ id: tracks[0].systemTrackId, state: tracks[0].state }),
    );
  } else if (validTracks.length > 0 && validTracks.length % 10 === 0) {
    console.log(`[track-layer] Rendering ${validTracks.length}/${tracks.length} tracks`);
  }

  if (validTracks.length !== tracks.length) {
    console.warn(
      `[track-layer] Filtered out ${tracks.length - validTracks.length} tracks with invalid coordinates`,
      tracks.filter(t => !isValidCoord(t)).map(t => ({ id: t.systemTrackId, state: t.state })),
    );
  }

  const features: GeoJSON.Feature[] = validTracks.map(track => ({
    type: 'Feature',
    properties: {
      id: track.systemTrackId,
      label: track.systemTrackId,
      color: statusColor(track.status),
      status: track.status,
      confidence: track.confidence,
      eoStatus: track.eoInvestigationStatus ?? 'none',
      eoColor: eoStatusColor(track.eoInvestigationStatus ?? 'none'),
    },
    geometry: {
      type: 'Point',
      coordinates: [track.state.lon, track.state.lat],
    },
  }));

  const ellipseFeatures: GeoJSON.Feature[] = validTracks
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
