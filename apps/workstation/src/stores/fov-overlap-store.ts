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

export interface MultiSensorResolution {
  trackId: string;
  sensorCount: number;
  sensorIds: string[];
  qualityScore: number;
  positionEstimate: { lat: number; lon: number; alt: number } | null;
  method: '2-sensor' | 'multi-sensor';
}

interface FovOverlapStoreState {
  fovOverlaps: FovOverlap[];
  bearingAssociations: BearingAssociation[];
  multiSensorResolutions: MultiSensorResolution[];
  setFovOverlaps: (overlaps: FovOverlap[]) => void;
  setBearingAssociations: (associations: BearingAssociation[]) => void;
  setMultiSensorResolutions: (resolutions: MultiSensorResolution[]) => void;
}

export const useFovOverlapStore = create<FovOverlapStoreState>((set) => ({
  fovOverlaps: [],
  bearingAssociations: [],
  multiSensorResolutions: [],
  setFovOverlaps: (fovOverlaps) => set({ fovOverlaps }),
  setBearingAssociations: (bearingAssociations) => set({ bearingAssociations }),
  setMultiSensorResolutions: (multiSensorResolutions) => set({ multiSensorResolutions }),
}));
