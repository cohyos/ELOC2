import { create } from 'zustand';

export type DetailView = 'track' | 'sensor' | 'none';

interface UiState {
  // Selection
  selectedTrackId: string | null;
  selectedSensorId: string | null;
  detailView: DetailView;

  // Panel visibility
  detailPanelOpen: boolean;
  timelinePanelOpen: boolean;

  // Replay
  replayPlaying: boolean;
  replaySpeed: number;
  replayTime: number; // ms since epoch, 0 = live

  // WebSocket
  wsConnected: boolean;

  // Event log
  eventLog: EventLogEntry[];

  // Actions
  selectTrack: (id: string | null) => void;
  selectSensor: (id: string | null) => void;
  toggleDetailPanel: () => void;
  toggleTimelinePanel: () => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayTime: (time: number) => void;
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
  replayPlaying: false,
  replaySpeed: 1,
  replayTime: 0,
  wsConnected: false,
  eventLog: [],

  selectTrack: (id) =>
    set({ selectedTrackId: id, selectedSensorId: null, detailView: id ? 'track' : 'none', detailPanelOpen: id ? true : undefined }),

  selectSensor: (id) =>
    set({ selectedSensorId: id, selectedTrackId: null, detailView: id ? 'sensor' : 'none', detailPanelOpen: id ? true : undefined }),

  toggleDetailPanel: () =>
    set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),

  toggleTimelinePanel: () =>
    set((s) => ({ timelinePanelOpen: !s.timelinePanelOpen })),

  setReplayPlaying: (playing) => set({ replayPlaying: playing }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  setReplayTime: (time) => set({ replayTime: time }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  addEvent: (entry) =>
    set((s) => ({
      eventLog: [entry, ...s.eventLog].slice(0, 200), // Keep last 200
    })),

  clearEvents: () => set({ eventLog: [] }),
}));
