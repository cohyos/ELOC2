import { create } from 'zustand';

export type DetailView = 'track' | 'sensor' | 'tasks' | 'investigation' | 'cue' | 'group' | 'geometry' | 'none';

export interface LayerVisibility {
  tracks: boolean;
  trackLabels: boolean;
  trackEllipses: boolean;
  sensors: boolean;
  sensorLabels: boolean;
  radarCoverage: boolean;
  eoFor: boolean;
  eoFov: boolean;
  eoRays: boolean;
  triangulation: boolean;
  bearingLines: boolean;
  ambiguityMarkers: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  tracks: true,
  trackLabels: true,
  trackEllipses: true,
  sensors: true,
  sensorLabels: true,
  radarCoverage: true,
  eoFor: true,
  eoFov: true,
  eoRays: true,
  triangulation: true,
  bearingLines: true,
  ambiguityMarkers: true,
};

interface UiState {
  // Selection
  selectedTrackId: string | null;
  selectedSensorId: string | null;
  selectedCueId: string | null;
  selectedGroupId: string | null;
  selectedGeometryTrackId: string | null;
  detailView: DetailView;

  // Panel visibility
  detailPanelOpen: boolean;
  timelinePanelOpen: boolean;

  // Layer visibility
  layerVisibility: LayerVisibility;

  // Track status filter (which statuses to show on map)
  trackStatusFilter: { confirmed: boolean; tentative: boolean; dropped: boolean };

  // Replay
  replayPlaying: boolean;
  replaySpeed: number;
  replayTime: number; // simulation elapsed seconds
  scenarioDurationSec: number;

  // WebSocket
  wsConnected: boolean;

  // Selection highlights
  highlightedSensorIds: string[];
  selectionBearingRays: SelectionBearingRay[];

  // Event log
  eventLog: EventLogEntry[];

  // Demo mode (synced from demo store for convenience)
  demoMode: boolean;

  // Injection
  injectionMode: boolean;
  injectionLog: InjectionLogEntry[];
  spawnTargetPosition: { lat: number; lon: number } | null;
  spawnTargetActive: boolean;

  // Actions
  selectTrack: (id: string | null) => void;
  selectSensor: (id: string | null) => void;
  selectCue: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  selectGeometry: (trackId: string | null) => void;
  toggleDetailPanel: () => void;
  toggleTimelinePanel: () => void;
  toggleLayer: (layer: keyof LayerVisibility) => void;
  toggleTrackStatus: (status: 'confirmed' | 'tentative' | 'dropped') => void;
  setDetailView: (view: DetailView) => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayTime: (time: number) => void;
  setScenarioDurationSec: (duration: number) => void;
  setWsConnected: (connected: boolean) => void;
  setHighlightedSensors: (ids: string[]) => void;
  setSelectionBearingRays: (rays: SelectionBearingRay[]) => void;
  clearSelectionHighlights: () => void;
  addEvent: (entry: EventLogEntry) => void;
  clearEvents: () => void;

  // Demo mode actions
  setDemoMode: (active: boolean) => void;

  // Injection actions
  toggleInjectionMode: () => void;
  addInjectionEntry: (entry: InjectionLogEntry) => void;
  setSpawnTargetPosition: (pos: { lat: number; lon: number } | null) => void;
  setSpawnTargetActive: (active: boolean) => void;
}

export interface SelectionBearingRay {
  sensorLat: number;
  sensorLon: number;
  azimuthDeg: number;
  color: string;
}

export interface EventLogEntry {
  id: string;
  eventType: string;
  timestamp: number;
  summary: string;
}

export interface InjectionLogEntry {
  id: string;
  type: 'fault' | 'action' | 'target';
  timestamp: number;
  description: string;
}

let eventCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  selectedTrackId: null,
  selectedSensorId: null,
  selectedCueId: null,
  selectedGroupId: null,
  selectedGeometryTrackId: null,
  detailView: 'none',
  detailPanelOpen: true,
  timelinePanelOpen: true,
  layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
  trackStatusFilter: { confirmed: true, tentative: true, dropped: false },
  replayPlaying: false,
  replaySpeed: 1,
  replayTime: 0,
  scenarioDurationSec: 900,
  wsConnected: false,
  highlightedSensorIds: [],
  selectionBearingRays: [],
  eventLog: [],
  demoMode: false,
  injectionMode: false,
  injectionLog: [],
  spawnTargetPosition: null,
  spawnTargetActive: false,

  selectTrack: (id) =>
    set({ selectedTrackId: id, selectedSensorId: null, selectedCueId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'track' : 'none', detailPanelOpen: !!id }),

  selectSensor: (id) =>
    set({ selectedSensorId: id, selectedTrackId: null, selectedCueId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'sensor' : 'none', detailPanelOpen: !!id }),

  selectCue: (id) =>
    set({ selectedCueId: id, selectedTrackId: null, selectedSensorId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'cue' : 'none', detailPanelOpen: !!id }),

  selectGroup: (id) =>
    set({ selectedGroupId: id, selectedTrackId: null, selectedSensorId: null, selectedCueId: null, selectedGeometryTrackId: null, detailView: id ? 'group' : 'none', detailPanelOpen: !!id }),

  selectGeometry: (trackId) =>
    set({ selectedGeometryTrackId: trackId, selectedTrackId: null, selectedSensorId: null, selectedCueId: null, selectedGroupId: null, detailView: trackId ? 'geometry' : 'none', detailPanelOpen: !!trackId }),

  toggleDetailPanel: () =>
    set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),

  toggleTimelinePanel: () =>
    set((s) => ({ timelinePanelOpen: !s.timelinePanelOpen })),

  toggleLayer: (layer) =>
    set((s) => ({
      layerVisibility: { ...s.layerVisibility, [layer]: !s.layerVisibility[layer] },
    })),

  toggleTrackStatus: (status) =>
    set((s) => ({
      trackStatusFilter: { ...s.trackStatusFilter, [status]: !s.trackStatusFilter[status] },
    })),

  setDetailView: (view) =>
    set({ detailView: view, detailPanelOpen: true }),

  setReplayPlaying: (playing) => set({ replayPlaying: playing }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  setReplayTime: (time) => set({ replayTime: time }),
  setScenarioDurationSec: (duration) => set({ scenarioDurationSec: duration }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  setHighlightedSensors: (ids) => set({ highlightedSensorIds: ids }),
  setSelectionBearingRays: (rays) => set({ selectionBearingRays: rays }),
  clearSelectionHighlights: () => set({ highlightedSensorIds: [], selectionBearingRays: [] }),

  addEvent: (entry) =>
    set((s) => ({
      eventLog: [entry, ...s.eventLog].slice(0, 200), // Keep last 200
    })),

  clearEvents: () => set({ eventLog: [] }),

  setDemoMode: (active) => set({ demoMode: active }),

  toggleInjectionMode: () =>
    set((s) => ({ injectionMode: !s.injectionMode, spawnTargetActive: false, spawnTargetPosition: null })),

  addInjectionEntry: (entry) =>
    set((s) => ({
      injectionLog: [entry, ...s.injectionLog].slice(0, 100),
    })),

  setSpawnTargetPosition: (pos) => set({ spawnTargetPosition: pos }),
  setSpawnTargetActive: (active) => set({ spawnTargetActive: active, spawnTargetPosition: active ? null : null }),
}));
