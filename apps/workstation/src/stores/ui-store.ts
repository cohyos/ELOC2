import { create } from 'zustand';

export type DetailView = 'track' | 'sensor' | 'tasks' | 'none';

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

  // Event log
  eventLog: EventLogEntry[];

  // Actions
  selectTrack: (id: string | null) => void;
  selectSensor: (id: string | null) => void;
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
  addEvent: (entry: EventLogEntry) => void;
  clearEvents: () => void;
}

export interface EventLogEntry {
  id: string;
  eventType: string;
  timestamp: number;
  summary: string;
}

let eventCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  selectedTrackId: null,
  selectedSensorId: null,
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
  eventLog: [],

  selectTrack: (id) =>
    set({ selectedTrackId: id, selectedSensorId: null, detailView: id ? 'track' : 'none', detailPanelOpen: !!id }),

  selectSensor: (id) =>
    set({ selectedSensorId: id, selectedTrackId: null, detailView: id ? 'sensor' : 'none', detailPanelOpen: !!id }),

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

  addEvent: (entry) =>
    set((s) => ({
      eventLog: [entry, ...s.eventLog].slice(0, 200), // Keep last 200
    })),

  clearEvents: () => set({ eventLog: [] }),
}));
