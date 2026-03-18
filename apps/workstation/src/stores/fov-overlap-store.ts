import { create } from 'zustand';

export interface FovOverlap {
  sensorIds: [string, string];
  overlapRegion: Array<{ lat: number; lon: number }>;
  tracksInOverlap: string[];
}

interface FovOverlapStoreState {
  fovOverlaps: FovOverlap[];
  setFovOverlaps: (overlaps: FovOverlap[]) => void;
}

export const useFovOverlapStore = create<FovOverlapStoreState>((set) => ({
  fovOverlaps: [],
  setFovOverlaps: (fovOverlaps) => set({ fovOverlaps }),
}));
