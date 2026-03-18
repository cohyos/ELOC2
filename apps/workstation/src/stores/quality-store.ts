import { create } from 'zustand';

export interface QualityMetrics {
  trackToTruthAssociation: number;
  positionErrorAvg: number;
  positionErrorMax: number;
  classificationAccuracy: number;
  coveragePercent: number;
  falseTrackRate: number;
  sensorUtilization: Record<string, number>;
  timeToFirstDetection: Record<string, number>;
  timeToConfirmed3D: Record<string, number>;
}

interface QualityStore {
  metrics: QualityMetrics | null;
  setMetrics: (m: QualityMetrics) => void;
}

export const useQualityStore = create<QualityStore>((set) => ({
  metrics: null,
  setMetrics: (m) => set({ metrics: m }),
}));
