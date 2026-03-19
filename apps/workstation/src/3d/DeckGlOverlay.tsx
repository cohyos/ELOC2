/**
 * DeckGlOverlay — Deck.gl 3D track path visualization.
 *
 * Renders track trails as 3D paths with altitude using Deck.gl's PathLayer
 * overlaid on top of the MapLibre map via MapboxOverlay interop.
 *
 * This uses a separate WebGL context from MapLibre, so it should work
 * even in environments where MapLibre's data layers fail.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer } from '@deck.gl/layers';
import type maplibregl from 'maplibre-gl';
import type { SystemTrack } from '@eloc2/domain';
import { getStatusColor, PATH_WIDTH_PX, ALTITUDE_SCALE, MIN_TRAIL_POINTS } from './deck-config';

interface TrailPath {
  id: string;
  path: [number, number, number][]; // [lon, lat, alt]
  color: [number, number, number, number];
}

interface DeckGlOverlayProps {
  map: maplibregl.Map | null;
  tracks: SystemTrack[];
  trailHistory: Map<string, Array<{ lon: number; lat: number }>>;
}

export function DeckGlOverlay({ map, tracks, trailHistory }: DeckGlOverlayProps) {
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Create and attach the Deck.gl overlay to the map
  useEffect(() => {
    if (!map) return;

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
    });

    // MapboxOverlay works with MapLibre GL JS via the addControl API
    try {
      map.addControl(overlay as any);
      overlayRef.current = overlay;
    } catch (e) {
      console.warn('[DeckGlOverlay] Failed to add Deck.gl overlay:', e);
    }

    return () => {
      try {
        if (overlayRef.current) {
          map.removeControl(overlayRef.current as any);
          overlayRef.current = null;
        }
      } catch {
        // Map may already be destroyed
      }
    };
  }, [map]);

  // Build path data from trail history + current positions
  const pathData = useMemo((): TrailPath[] => {
    const paths: TrailPath[] = [];
    const trackMap = new Map(tracks.map(t => [t.systemTrackId as string, t]));

    for (const [trackId, positions] of trailHistory) {
      const track = trackMap.get(trackId);
      if (!track) continue;

      // Build the full path: trail + current position
      const pathCoords: [number, number, number][] = [];

      for (const pos of positions) {
        if (!Number.isFinite(pos.lon) || !Number.isFinite(pos.lat)) continue;
        // Trail points don't have altitude, use track's current alt as approximation
        const alt = (track.state?.alt ?? 0) * ALTITUDE_SCALE;
        pathCoords.push([pos.lon, pos.lat, alt]);
      }

      // Add current position
      if (track.state && Number.isFinite(track.state.lon) && Number.isFinite(track.state.lat)) {
        const alt = (track.state.alt ?? 0) * ALTITUDE_SCALE;
        pathCoords.push([track.state.lon, track.state.lat, alt]);
      }

      if (pathCoords.length < MIN_TRAIL_POINTS) continue;

      paths.push({
        id: trackId,
        path: pathCoords,
        color: getStatusColor(track.status),
      });
    }

    return paths;
  }, [tracks, trailHistory]);

  // Update layers when data changes
  useEffect(() => {
    if (!overlayRef.current) return;

    const pathLayer = new PathLayer<TrailPath>({
      id: 'track-3d-paths',
      data: pathData,
      getPath: (d: TrailPath) => d.path,
      getColor: (d: TrailPath) => d.color,
      getWidth: PATH_WIDTH_PX,
      widthUnits: 'pixels' as const,
      jointRounded: true,
      capRounded: true,
      pickable: false,
    });

    overlayRef.current.setProps({ layers: [pathLayer] });
  }, [pathData]);

  // This component doesn't render any DOM — it's purely imperative
  return null;
}
