import { create } from 'zustand';
import type { SystemTrack, SystemTrackId } from '@eloc2/domain';

export interface RapSnapshot {
  tracks: SystemTrack[];
  timestamp: number;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
}

/** Max number of trail positions stored per track */
const MAX_TRAIL = 5;

interface TrackState {
  tracks: SystemTrack[];
  tracksById: Map<string, SystemTrack>;
  /** Ring buffer of last N positions per track for trail rendering */
  trailHistory: Map<string, Array<{ lon: number; lat: number }>>;
  timestamp: number;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
  loading: boolean;
  error: string | null;

  fetchRap: () => Promise<void>;
  fetchTrack: (id: string) => Promise<SystemTrack | null>;
  setTracks: (tracks: SystemTrack[]) => void;
  updateTrack: (track: SystemTrack) => void;
}

export const useTrackStore = create<TrackState>((set, get) => ({
  tracks: [],
  tracksById: new Map(),
  trailHistory: new Map(),
  timestamp: 0,
  trackCount: 0,
  confirmedCount: 0,
  tentativeCount: 0,
  loading: false,
  error: null,

  fetchRap: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/rap');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RapSnapshot = await res.json();
      const byId = new Map<string, SystemTrack>();
      for (const t of data.tracks) {
        byId.set(t.systemTrackId, t);
      }
      set({
        tracks: data.tracks,
        tracksById: byId,
        timestamp: data.timestamp,
        trackCount: data.trackCount,
        confirmedCount: data.confirmedCount,
        tentativeCount: data.tentativeCount,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchTrack: async (id: string) => {
    try {
      const res = await fetch(`/api/tracks/${id}`);
      if (!res.ok) return null;
      const track: SystemTrack = await res.json();
      get().updateTrack(track);
      return track;
    } catch {
      return null;
    }
  },

  setTracks: (tracks: SystemTrack[]) => {
    const byId = new Map<string, SystemTrack>();
    for (const t of tracks) {
      byId.set(t.systemTrackId, t);
    }
    // Update trail history: append current position, keep last MAX_TRAIL
    const prevTrail = get().trailHistory;
    const newTrail = new Map<string, Array<{ lon: number; lat: number }>>();
    const activeIds = new Set<string>();
    for (const t of tracks) {
      activeIds.add(t.systemTrackId);
      if (!t.state || !Number.isFinite(t.state.lat) || !Number.isFinite(t.state.lon)) continue;
      const prev = prevTrail.get(t.systemTrackId) ?? [];
      const last = prev[prev.length - 1];
      // Only append if position changed (>~10m threshold)
      if (!last || Math.abs(last.lat - t.state.lat) > 0.0001 || Math.abs(last.lon - t.state.lon) > 0.0001) {
        const updated = [...prev, { lon: t.state.lon, lat: t.state.lat }];
        newTrail.set(t.systemTrackId, updated.length > MAX_TRAIL ? updated.slice(-MAX_TRAIL) : updated);
      } else {
        newTrail.set(t.systemTrackId, prev);
      }
    }
    const confirmed = tracks.filter(t => t.status === 'confirmed').length;
    const tentative = tracks.filter(t => t.status === 'tentative').length;
    set({
      tracks,
      tracksById: byId,
      trailHistory: newTrail,
      trackCount: tracks.length,
      confirmedCount: confirmed,
      tentativeCount: tentative,
      timestamp: Date.now(),
    });
  },

  updateTrack: (track: SystemTrack) => {
    const { tracks, tracksById } = get();
    const newById = new Map(tracksById);
    newById.set(track.systemTrackId, track);
    const newTracks = tracks.map(t =>
      t.systemTrackId === track.systemTrackId ? track : t
    );
    if (!tracks.some(t => t.systemTrackId === track.systemTrackId)) {
      newTracks.push(track);
    }
    const confirmed = newTracks.filter(t => t.status === 'confirmed').length;
    const tentative = newTracks.filter(t => t.status === 'tentative').length;
    set({
      tracks: newTracks,
      tracksById: newById,
      trackCount: newTracks.length,
      confirmedCount: confirmed,
      tentativeCount: tentative,
    });
  },
}));
