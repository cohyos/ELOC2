import { create } from 'zustand';

export interface GroundTruthTarget {
  targetId: string;
  name: string;
  position: { lat: number; lon: number; alt: number };
  velocity?: { vx: number; vy: number; vz: number };
  classification?: string;
  active: boolean;
}

interface GroundTruthState {
  targets: GroundTruthTarget[];
  showGroundTruth: boolean;
  setTargets: (targets: GroundTruthTarget[]) => void;
  toggleGroundTruth: () => void;
  setShowGroundTruth: (show: boolean) => void;
}

export const useGroundTruthStore = create<GroundTruthState>((set) => ({
  targets: [],
  showGroundTruth: false,
  setTargets: (targets) => set({ targets }),
  toggleGroundTruth: () => set((s) => ({ showGroundTruth: !s.showGroundTruth })),
  setShowGroundTruth: (show) => set({ showGroundTruth: show }),
}));
