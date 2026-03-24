import { create } from 'zustand';

export interface GroundTruthTarget {
  targetId: string;
  name: string;
  position: { lat: number; lon: number; alt: number };
  velocity?: { vx: number; vy: number; vz: number };
  classification?: string;
  active: boolean;
}

/** Max trail positions to keep per GT target */
const MAX_GT_TRAIL = 60;

interface GroundTruthState {
  targets: GroundTruthTarget[];
  showGroundTruth: boolean;
  /** Accumulated position history per GT target for trajectory display */
  trailHistory: Map<string, Array<{ lat: number; lon: number; alt: number }>>;
  setTargets: (targets: GroundTruthTarget[]) => void;
  toggleGroundTruth: () => void;
  setShowGroundTruth: (show: boolean) => void;
  clearTrails: () => void;
}

export const useGroundTruthStore = create<GroundTruthState>((set, get) => ({
  targets: [],
  showGroundTruth: false,
  trailHistory: new Map(),
  setTargets: (targets) => {
    const prev = get().trailHistory;
    const next = new Map(prev);
    for (const t of targets) {
      if (!t.active) continue;
      const id = t.targetId ?? t.name;
      const trail = next.get(id) ?? [];
      const last = trail[trail.length - 1];
      // Only add if position changed
      if (!last || last.lat !== t.position.lat || last.lon !== t.position.lon) {
        trail.push({ lat: t.position.lat, lon: t.position.lon, alt: t.position.alt });
        if (trail.length > MAX_GT_TRAIL) trail.shift();
        next.set(id, trail);
      }
    }
    set({ targets, trailHistory: next });
  },
  toggleGroundTruth: () => set((s) => ({ showGroundTruth: !s.showGroundTruth })),
  setShowGroundTruth: (show) => set({ showGroundTruth: show }),
  clearTrails: () => set({ trailHistory: new Map() }),
}));
