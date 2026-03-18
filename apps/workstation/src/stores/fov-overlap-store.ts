import { create } from 'zustand';

export interface FovOverlap {
  sensorIds: [string, string];
  overlapRegion: Array<{ lat: number; lon: number }>;
  tracksInOverlap: string[];
}

export interface BearingAssociation {
  trackId: string;
  sensorId: string;
  bearing: number;
  confidence: number;
  ambiguous: boolean;
  alternateTrackIds: string[];
}

interface FovOverlapStoreState {
  fovOverlaps: FovOverlap[];
  bearingAssociations: BearingAssociation[];
  setFovOverlaps: (overlaps: FovOverlap[]) => void;
  setBearingAssociations: (associations: BearingAssociation[]) => void;
}

export const useFovOverlapStore = create<FovOverlapStoreState>((set) => ({
  fovOverlaps: [],
  bearingAssociations: [],
  setFovOverlaps: (fovOverlaps) => set({ fovOverlaps }),
  setBearingAssociations: (bearingAssociations) => set({ bearingAssociations }),
}));
