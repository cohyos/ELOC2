import { create } from 'zustand';
import type { SystemTrack, SystemTrackId } from '@eloc2/domain';

export interface RapSnapshot {
  tracks: SystemTrack[];
  timestamp: number;
  trackCount: number;
  confirmedCount: number;
  tentativeCount: number;
}

interface TrackState {
  tracks: SystemTrack[];
  tracksById: Map<string, SystemTrack>;
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
    const confirmed = tracks.filter(t => t.status === 'confirmed').length;
    const tentative = tracks.filter(t => t.status === 'tentative').length;
    set({
      tracks,
      tracksById: byId,
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
