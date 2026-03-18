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

export interface EoAllocationQuality {
  coverageEfficiency: number;
  geometryOptimality: number;
  dwellEfficiency: number;
  revisitTimeliness: number;
  triangulationSuccessRate: number;
  sensorUtilization: number;
  priorityAlignment: number;
}

interface QualityStore {
  metrics: QualityMetrics | null;
  eoAllocationQuality: EoAllocationQuality | null;
  setMetrics: (m: QualityMetrics) => void;
  setEoAllocationQuality: (q: EoAllocationQuality) => void;
}

export const useQualityStore = create<QualityStore>((set) => ({
  metrics: null,
  eoAllocationQuality: null,
  setMetrics: (m) => set({ metrics: m }),
  setEoAllocationQuality: (q) => set({ eoAllocationQuality: q }),
}));
