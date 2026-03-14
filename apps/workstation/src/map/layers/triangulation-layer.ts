import type { Map as MaplibreMap } from 'maplibre-gl';
import type { SensorState, SystemTrack } from '@eloc2/domain';

const SOURCE_ID = 'triangulation-rays';
const LAYER_ID = 'triangulation-rays-layer';

/**
 * Quality to color mapping:
 * - strong = green
 * - acceptable = yellow
 * - weak = orange
 * - insufficient = red
 */
function qualityColor(quality: string): string {
  switch (quality) {
    case 'strong': return '#00cc44';
    case 'acceptable': return '#ffcc00';
    case 'weak': return '#ff8800';
    case 'insufficient': return '#ff3333';
    default: return '#888888';
  }
}

/**
 * For each track being investigated by EO, draw rays from the
 * contributing EO sensors to the track position.
 * Color-coded by geometry quality (approximated from number of contributors).
 */
export function initTriangulationLayer(map: MaplibreMap) {
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
    },
  });
}

export function updateTriangulationLayer(
  map: MaplibreMap,
  tracks: SystemTrack[],
  sensors: SensorState[],
) {
  const source = map.getSource(SOURCE_ID);
  if (!source) return;

  const sensorMap = new Map(sensors.map(s => [s.sensorId, s]));
  const features: GeoJSON.Feature[] = [];

  for (const track of tracks) {
    if (track.eoInvestigationStatus === 'none' || track.status === 'dropped') continue;

    const eoSources = track.sources.filter(sid => {
      const s = sensorMap.get(sid);
      return s && s.sensorType === 'eo';
    });

    if (eoSources.length === 0) continue;

    // Approximate quality from number of EO contributors
    let quality: string;
    if (eoSources.length >= 3) quality = 'strong';
    else if (eoSources.length === 2) quality = 'acceptable';
    else quality = 'weak';

    const color = qualityColor(quality);

    for (const sensorId of eoSources) {
      const sensor = sensorMap.get(sensorId);
      if (!sensor) continue;

      features.push({
        type: 'Feature',
        properties: {
          color,
          trackId: track.systemTrackId,
          sensorId: sensor.sensorId,
          quality,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [sensor.position.lon, sensor.position.lat],
            [track.state.lon, track.state.lat],
          ],
        },
      });
    }
  }

  (source as any).setData({ type: 'FeatureCollection', features });
}
