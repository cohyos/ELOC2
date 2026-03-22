import { create } from 'zustand';

export interface DecisionChainStep {
  stage: string;
  timestamp: number;
  simTimeSec: number;
  detail: string;
  decision?: string;
  alternatives?: string;
  score?: number;
  data?: Record<string, unknown>;
}

export interface QualityBreakdown {
  detectionLatency: number;
  positionAccuracy: number;
  correlationCorrectness: number;
  promotionSpeed: number;
  classificationAccuracy: number;
  geometryQuality: number;
  fusionEfficiency: number;
}

export interface DecisionChainEntry {
  id: string;
  targetId: string;
  targetName: string;
  trackId: string;
  simTimeSec: number;
  steps: DecisionChainStep[];
  chainQuality: number;
  qualityBreakdown: QualityBreakdown;
}

interface DecisionChainState {
  chains: DecisionChainEntry[];
  history: DecisionChainEntry[][]; // snapshots over time for trend analysis
  setChains: (chains: DecisionChainEntry[]) => void;
}

const MAX_HISTORY = 30;

export const useDecisionChainStore = create<DecisionChainState>((set) => ({
  chains: [],
  history: [],
  setChains: (chains) =>
    set((s) => ({
      chains,
      history: [...s.history.slice(-(MAX_HISTORY - 1)), chains],
    })),
}));
