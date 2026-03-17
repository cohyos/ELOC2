import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestigationParameters {
  weights: {
    threat: number;
    uncertaintyReduction: number;
    geometryGain: number;
    operatorIntent: number;
    slewCost: number;
    occupancyCost: number;
  };
  thresholds: {
    splitAngleDeg: number;
    confidenceGate: number;
    cueValidityWindowSec: number;
    convergenceThreshold: number;
  };
  policyMode: 'recommended_only' | 'auto_with_veto' | 'manual';
}

export interface InvestigationSummary {
  trackId: string;
  trackStatus: string;
  investigationStatus: string; // in_progress, split_detected, confirmed
  assignedSensors: string[];
  cuePriority: number;
  bearingCount: number;
  geometryStatus: string; // bearing_only, candidate_3d, confirmed_3d
  hypotheses: Array<{ label: string; probability: number }>;
  scoreBreakdown: {
    threat: number;
    uncertainty: number;
    geometry: number;
    intent: number;
  };
}

export const DEFAULT_INVESTIGATION_PARAMETERS: InvestigationParameters = {
  weights: {
    threat: 1.0,
    uncertaintyReduction: 1.0,
    geometryGain: 0.5,
    operatorIntent: 2.0,
    slewCost: 0.3,
    occupancyCost: 0.5,
  },
  thresholds: {
    splitAngleDeg: 0.5,
    confidenceGate: 0.7,
    cueValidityWindowSec: 30,
    convergenceThreshold: 0.85,
  },
  policyMode: 'auto_with_veto',
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface InvestigationStoreState {
  parameters: InvestigationParameters;
  activeInvestigations: InvestigationSummary[];
  resolvedInvestigations: InvestigationSummary[];
  loading: boolean;
  error: string | null;

  fetchParameters: () => Promise<void>;
  updateParameters: (params: Partial<InvestigationParameters>) => Promise<void>;
  resetParameters: () => Promise<void>;
  fetchActive: () => Promise<void>;
  setActiveInvestigations: (investigations: InvestigationSummary[]) => void;
}

export const useInvestigationStore = create<InvestigationStoreState>((set, get) => ({
  parameters: { ...DEFAULT_INVESTIGATION_PARAMETERS },
  activeInvestigations: [],
  resolvedInvestigations: [],
  loading: false,
  error: null,

  fetchParameters: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/investigation/parameters');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const params: InvestigationParameters = await res.json();
      set({ parameters: params, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  updateParameters: async (params: Partial<InvestigationParameters>) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/investigation/parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      set({ parameters: result.parameters, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  resetParameters: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/investigation/parameters/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      set({ parameters: result.parameters, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  fetchActive: async () => {
    try {
      const res = await fetch('/api/investigation/active');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const investigations: InvestigationSummary[] = await res.json();
      set({ activeInvestigations: investigations });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  setActiveInvestigations: (investigations: InvestigationSummary[]) => {
    const prev = get().activeInvestigations;
    // Move previously active but now absent investigations to resolved
    const activeIds = new Set(investigations.map(i => i.trackId));
    const newlyResolved = prev.filter(p => !activeIds.has(p.trackId));
    if (newlyResolved.length > 0) {
      const resolved = [...newlyResolved, ...get().resolvedInvestigations].slice(0, 10);
      set({ activeInvestigations: investigations, resolvedInvestigations: resolved });
    } else {
      set({ activeInvestigations: investigations });
    }
  },
}));
