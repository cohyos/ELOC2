import { create } from 'zustand';

// TODO: Move CoverZone type to @eloc2/domain when backend broadcasts cover zones
export interface CoverZone {
  id: string;
  name: string;
  coverType: 'urban' | 'forest' | 'water' | 'open';
  polygon: Array<{ lat: number; lon: number }>;
}

export interface OperationalZone {
  id: string;
  name: string;
  zoneType: 'threat_corridor' | 'exclusion' | 'engagement' | 'safe_passage';
  polygon: Array<{ lat: number; lon: number }>;
  color?: string;
}

interface CoverZoneState {
  coverZones: CoverZone[];
  operationalZones: OperationalZone[];
  setCoverZones: (zones: CoverZone[]) => void;
  setOperationalZones: (zones: OperationalZone[]) => void;
}

export const useCoverZoneStore = create<CoverZoneState>((set) => ({
  coverZones: [],
  operationalZones: [],
  setCoverZones: (zones) => set({ coverZones: zones }),
  setOperationalZones: (zones) => set({ operationalZones: zones }),
}));
