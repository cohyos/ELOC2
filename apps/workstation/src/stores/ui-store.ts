import { create } from 'zustand';

export type DetailView = 'track' | 'sensor' | 'tasks' | 'investigation' | 'eo-window' | 'cue' | 'group' | 'geometry' | 'quality' | 'ground-truth' | 'none';

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
  trackLabels: false,
  trackEllipses: true,
  sensors: true,
  sensorLabels: false,
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
  selectedGroundTruthId: string | null;
  investigationWindowTrackId: string | null;
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

  // Map style
  darkMode: boolean;

  // Injection
  injectionMode: boolean;
  injectionLog: InjectionLogEntry[];
  spawnTargetPosition: { lat: number; lon: number } | null;
  spawnTargetActive: boolean;

  // Panel sizing
  rightPanelWidth: number;
  timelinePanelHeight: number;

  // Simulation state
  simulationState: string;
  allowedActions: string[];

  // Actions
  selectTrack: (id: string | null) => void;
  selectSensor: (id: string | null) => void;
  selectCue: (id: string | null) => void;
  selectGroup: (id: string | null) => void;
  selectGeometry: (trackId: string | null) => void;
  selectGroundTruth: (id: string | null) => void;
  setInvestigationWindowTrackId: (trackId: string | null) => void;
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

  // Map style actions
  toggleDarkMode: () => void;

  // Injection actions
  toggleInjectionMode: () => void;
  addInjectionEntry: (entry: InjectionLogEntry) => void;
  setSpawnTargetPosition: (pos: { lat: number; lon: number } | null) => void;
  setSpawnTargetActive: (active: boolean) => void;

  // Panel sizing actions
  setRightPanelWidth: (w: number) => void;
  setTimelinePanelHeight: (h: number) => void;

  // Simulation state actions
  setSimulationState: (state: string, actions: string[]) => void;
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

const PANEL_DEFAULTS = { rightPanelWidth: 380, timelinePanelHeight: 150 };
const LS_RIGHT_WIDTH_KEY = 'eloc2_rightPanelWidth';
const LS_TIMELINE_HEIGHT_KEY = 'eloc2_timelinePanelHeight';

function loadPanelSize(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch { /* ignore */ }
  return fallback;
}

export const useUiStore = create<UiState>((set) => ({
  selectedTrackId: null,
  selectedSensorId: null,
  selectedCueId: null,
  selectedGroupId: null,
  selectedGeometryTrackId: null,
  selectedGroundTruthId: null,
  investigationWindowTrackId: null,
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
  darkMode: true,
  injectionMode: false,
  injectionLog: [],
  spawnTargetPosition: null,
  spawnTargetActive: false,
  rightPanelWidth: loadPanelSize(LS_RIGHT_WIDTH_KEY, PANEL_DEFAULTS.rightPanelWidth, 250, 600),
  timelinePanelHeight: loadPanelSize(LS_TIMELINE_HEIGHT_KEY, PANEL_DEFAULTS.timelinePanelHeight, 80, 400),
  simulationState: 'idle',
  allowedActions: ['start', 'reset'],

  selectTrack: (id) =>
    set({ selectedTrackId: id, selectedSensorId: null, selectedCueId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'track' : 'none', detailPanelOpen: !!id }),

  selectSensor: (id) =>
    set({ selectedSensorId: id, selectedTrackId: null, selectedCueId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'sensor' : 'none', detailPanelOpen: !!id }),

  selectCue: (id) =>
    set({ selectedCueId: id, selectedTrackId: null, selectedSensorId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'cue' : 'none', detailPanelOpen: !!id }),

  selectGroup: (id) =>
    set({ selectedGroupId: id, selectedTrackId: null, selectedSensorId: null, selectedCueId: null, selectedGeometryTrackId: null, detailView: id ? 'group' : 'none', detailPanelOpen: !!id }),

  selectGeometry: (trackId) =>
    set({ selectedGeometryTrackId: trackId, selectedTrackId: null, selectedSensorId: null, selectedCueId: null, selectedGroupId: null, selectedGroundTruthId: null, detailView: trackId ? 'geometry' : 'none', detailPanelOpen: !!trackId }),

  selectGroundTruth: (id) =>
    set({ selectedGroundTruthId: id, selectedTrackId: null, selectedSensorId: null, selectedCueId: null, selectedGroupId: null, selectedGeometryTrackId: null, detailView: id ? 'ground-truth' : 'none', detailPanelOpen: !!id }),

  setInvestigationWindowTrackId: (trackId) =>
    set({ investigationWindowTrackId: trackId, detailView: trackId ? 'eo-window' : 'investigation', detailPanelOpen: true }),

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

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  toggleInjectionMode: () =>
    set((s) => ({ injectionMode: !s.injectionMode, spawnTargetActive: false, spawnTargetPosition: null })),

  addInjectionEntry: (entry) =>
    set((s) => ({
      injectionLog: [entry, ...s.injectionLog].slice(0, 100),
    })),

  setSpawnTargetPosition: (pos) => set({ spawnTargetPosition: pos }),
  setSpawnTargetActive: (active) => set({ spawnTargetActive: active, spawnTargetPosition: active ? null : null }),

  setRightPanelWidth: (w) => {
    const clamped = Math.max(250, Math.min(600, w));
    try { localStorage.setItem(LS_RIGHT_WIDTH_KEY, String(clamped)); } catch { /* ignore */ }
    set({ rightPanelWidth: clamped });
  },
  setTimelinePanelHeight: (h) => {
    const clamped = Math.max(80, Math.min(400, h));
    try { localStorage.setItem(LS_TIMELINE_HEIGHT_KEY, String(clamped)); } catch { /* ignore */ }
    set({ timelinePanelHeight: clamped });
  },

  setSimulationState: (state, actions) => set({ simulationState: state, allowedActions: actions }),
}));
