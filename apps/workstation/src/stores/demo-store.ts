import { create } from 'zustand';

export interface DemoState {
  active: boolean;
  audience: 'military' | 'technical' | 'mixed';
  narrativeMode: 'guided' | 'interactive' | 'guided_interactive';
  viewMode: 'full' | 'basic';
  showAnnotations: boolean;
  showNarrationPanel: boolean;
  tourStep: number;
  tourAutoAdvance: boolean;
  totalSteps: number;

  // Actions
  setActive: (active: boolean) => void;
  setAudience: (audience: DemoState['audience']) => void;
  setNarrativeMode: (mode: DemoState['narrativeMode']) => void;
  setViewMode: (mode: DemoState['viewMode']) => void;
  toggleAnnotations: () => void;
  toggleNarrationPanel: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setStep: (step: number) => void;
  toggleAutoAdvance: () => void;
  toggleViewMode: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  active: false,
  audience: 'mixed',
  narrativeMode: 'guided_interactive',
  viewMode: 'full',
  showAnnotations: true,
  showNarrationPanel: true,
  tourStep: 1,
  tourAutoAdvance: false,
  totalSteps: 12,

  setActive: (active) => set({ active }),
  setAudience: (audience) => set({ audience }),
  setNarrativeMode: (mode) => set({ narrativeMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
  toggleNarrationPanel: () => set((s) => ({ showNarrationPanel: !s.showNarrationPanel })),
  nextStep: () => set((s) => ({ tourStep: Math.min(s.tourStep + 1, s.totalSteps) })),
  prevStep: () => set((s) => ({ tourStep: Math.max(s.tourStep - 1, 1) })),
  setStep: (step) => set((s) => ({ tourStep: Math.max(1, Math.min(step, s.totalSteps)) })),
  toggleAutoAdvance: () => set((s) => ({ tourAutoAdvance: !s.tourAutoAdvance })),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === 'full' ? 'basic' : 'full' })),
}));
