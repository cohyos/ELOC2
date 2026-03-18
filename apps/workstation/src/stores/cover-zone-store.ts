import { create } from 'zustand';

// TODO: Move CoverZone type to @eloc2/domain when backend broadcasts cover zones
export interface CoverZone {
  id: string;
  name: string;
  coverType: 'urban' | 'forest' | 'water' | 'open';
  polygon: Array<{ lat: number; lon: number }>;
}

interface CoverZoneState {
  coverZones: CoverZone[];
  setCoverZones: (zones: CoverZone[]) => void;
}

export const useCoverZoneStore = create<CoverZoneState>((set) => ({
  coverZones: [],
  setCoverZones: (zones) => set({ coverZones: zones }),
}));
