/**
 * MapAdapter — Thin abstraction over MapLibre GL JS and Leaflet.
 *
 * Consumers (DebugOverlay, ctrl-box-zoom, etc.) depend on this interface
 * instead of a specific map library. Allows switching between MapLibre
 * and Leaflet via a feature flag without touching rendering code.
 */
import type maplibregl from 'maplibre-gl';
import type L from 'leaflet';

// ── Public types ────────────────────────────────────────────────────────────

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}

export interface BoundsLike {
  sw: LngLat;
  ne: LngLat;
}

export interface FitBoundsOptions {
  padding?: number;
  maxZoom?: number;
  duration?: number;
}

export interface FlyToOptions {
  center: [number, number]; // [lng, lat]
  zoom?: number;
  duration?: number;
}

// ── MapAdapter interface ────────────────────────────────────────────────────

export interface MapAdapter {
  /** Convert geographic coordinates to screen pixels. */
  project(lngLat: [number, number]): ScreenPoint;

  /** Convert screen pixels to geographic coordinates. */
  unproject(point: [number, number]): LngLat;

  /** Subscribe to map events (move, zoom, click, etc.). */
  on(event: string, handler: (...args: any[]) => void): void;

  /** Unsubscribe from map events. */
  off(event: string, handler: (...args: any[]) => void): void;

  /** Subscribe to a one-time map event. */
  once(event: string, handler: (...args: any[]) => void): void;

  /** Fit the map view to the given bounds. */
  fitBounds(bounds: [[number, number], [number, number]], options?: FitBoundsOptions): void;

  /** Smoothly fly to a location. */
  flyTo(options: FlyToOptions): void;

  /** Get the current zoom level. */
  getZoom(): number;

  /** Get the map container element. */
  getContainer(): HTMLElement;

  /** Get the canvas/rendering element (for cursor changes). */
  getCanvas(): HTMLElement;

  /** Trigger a resize recalculation. */
  resize(): void;

  /** Destroy the map instance. */
  remove(): void;

  /** Enable map panning. */
  enableDragPan(): void;

  /** Disable map panning (used during box-zoom). */
  disableDragPan(): void;

  /** Get the underlying library type for conditional logic. */
  readonly type: 'maplibre' | 'leaflet';
}

// ── MapLibre adapter ────────────────────────────────────────────────────────

export class MapLibreAdapter implements MapAdapter {
  readonly type = 'maplibre' as const;

  constructor(public readonly raw: maplibregl.Map) {}

  project(lngLat: [number, number]): ScreenPoint {
    const p = this.raw.project(lngLat as [number, number]);
    return { x: p.x, y: p.y };
  }

  unproject(point: [number, number]): LngLat {
    const ll = this.raw.unproject(point as [number, number]);
    return { lng: ll.lng, lat: ll.lat };
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.raw.on(event as any, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.raw.off(event as any, handler);
  }

  once(event: string, handler: (...args: any[]) => void): void {
    this.raw.once(event as any, handler);
  }

  fitBounds(bounds: [[number, number], [number, number]], options?: FitBoundsOptions): void {
    this.raw.fitBounds(bounds as any, options);
  }

  flyTo(options: FlyToOptions): void {
    this.raw.flyTo({
      center: options.center,
      zoom: options.zoom,
      duration: options.duration,
    });
  }

  getZoom(): number {
    return this.raw.getZoom();
  }

  getContainer(): HTMLElement {
    return this.raw.getContainer();
  }

  getCanvas(): HTMLElement {
    return this.raw.getCanvas();
  }

  resize(): void {
    this.raw.resize();
  }

  remove(): void {
    this.raw.remove();
  }

  enableDragPan(): void {
    this.raw.dragPan.enable();
  }

  disableDragPan(): void {
    this.raw.dragPan.disable();
  }
}

// ── Leaflet adapter ─────────────────────────────────────────────────────────

export class LeafletAdapter implements MapAdapter {
  readonly type = 'leaflet' as const;

  constructor(public readonly raw: L.Map) {}

  project(lngLat: [number, number]): ScreenPoint {
    // Leaflet uses [lat, lng], MapLibre uses [lng, lat]
    const p = this.raw.latLngToContainerPoint([lngLat[1], lngLat[0]]);
    return { x: p.x, y: p.y };
  }

  unproject(point: [number, number]): LngLat {
    const ll = this.raw.containerPointToLatLng([point[0], point[1]]);
    return { lng: ll.lng, lat: ll.lat };
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.raw.on(event as any, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.raw.off(event as any, handler);
  }

  once(event: string, handler: (...args: any[]) => void): void {
    this.raw.once(event as any, handler);
  }

  fitBounds(bounds: [[number, number], [number, number]], options?: FitBoundsOptions): void {
    // bounds: [[sw_lng, sw_lat], [ne_lng, ne_lat]] → Leaflet LatLngBounds
    const sw: [number, number] = [bounds[0][1], bounds[0][0]];
    const ne: [number, number] = [bounds[1][1], bounds[1][0]];
    this.raw.fitBounds([sw, ne], {
      padding: options?.padding ? [options.padding, options.padding] as any : undefined,
      maxZoom: options?.maxZoom,
      animate: (options?.duration ?? 0) > 0,
    });
  }

  flyTo(options: FlyToOptions): void {
    const [lng, lat] = options.center;
    this.raw.flyTo([lat, lng], options.zoom, {
      duration: (options.duration ?? 1000) / 1000, // Leaflet uses seconds
    });
  }

  getZoom(): number {
    return this.raw.getZoom();
  }

  getContainer(): HTMLElement {
    return this.raw.getContainer();
  }

  getCanvas(): HTMLElement {
    // Leaflet doesn't have a canvas element; return the container
    return this.raw.getContainer();
  }

  resize(): void {
    this.raw.invalidateSize();
  }

  remove(): void {
    this.raw.remove();
  }

  enableDragPan(): void {
    this.raw.dragging.enable();
  }

  disableDragPan(): void {
    this.raw.dragging.disable();
  }
}
