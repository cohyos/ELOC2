export interface TourStepDef {
  id: number;
  title: string;
  narration: string;
  whyItMatters: string;
  targetSelector?: string; // CSS selector to highlight
  mapAction?: { type: 'flyTo'; center: [number, number]; zoom: number };
}

export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 1,
    title: 'System Overview',
    narration:
      'ELOC2 manages air defense using coordinated radar and EO sensors. The map shows the operational area with sensor positions and track symbols.',
    whyItMatters:
      'Provides a unified recognized air picture from heterogeneous sensors.',
    mapAction: { type: 'flyTo', center: [34.8, 32.5], zoom: 8 },
  },
  {
    id: 2,
    title: 'Radar Detection',
    narration:
      'Radar sensors detect targets and create tentative tracks shown as yellow circles. Each track represents a potential air target.',
    whyItMatters:
      'Radar provides wide-area surveillance but limited identification.',
    targetSelector: '[data-testid="track-badges"]',
  },
  {
    id: 3,
    title: 'Track Confirmation',
    narration:
      'After 3 observations, tracks promote to confirmed status (green). This prevents false alarms from single detections.',
    whyItMatters:
      'Confirmation reduces false alarm rate while maintaining detection sensitivity.',
  },
  {
    id: 4,
    title: 'EO Cueing',
    narration:
      'The system automatically cues EO sensors to investigate radar tracks. Orange bearing rays show the EO sensor pointing direction.',
    whyItMatters:
      'Automated cueing coordinates sensors without operator workload.',
  },
  {
    id: 5,
    title: 'Bearing Observation',
    narration:
      'EO sensors return bearing measurements toward targets. These passive measurements enable identification and 3D positioning.',
    whyItMatters:
      'Passive EO sensing is covert and provides visual confirmation.',
  },
  {
    id: 6,
    title: 'Triangulation',
    narration:
      'When two or more EO sensors observe the same target, their bearings intersect to estimate 3D position. Intersection angle determines quality.',
    whyItMatters:
      'Bearing-only triangulation provides 3D position without active radar emission.',
  },
  {
    id: 7,
    title: 'Identification',
    narration:
      'EO imagery provides identification support — aircraft type, confidence level, and visual features observed during the investigation.',
    whyItMatters:
      'Visual identification is critical for rules of engagement compliance.',
  },
  {
    id: 8,
    title: 'Ambiguity Handling',
    narration:
      'When multiple targets appear in the EO field of view, the system preserves competing hypotheses rather than forcing a premature decision.',
    whyItMatters:
      'Delayed association prevents incorrect track-to-target assignments.',
  },
  {
    id: 9,
    title: 'Sensor Degradation',
    narration:
      'When a sensor develops a fault, the system detects degradation and adapts fusion strategy. Conservative mode activates to prevent corrupted data from polluting tracks.',
    whyItMatters:
      'Resilient degradation handling maintains air picture integrity under adverse conditions.',
  },
  {
    id: 10,
    title: 'Operator Override',
    narration:
      'The operator can approve, reject, or modify automation decisions. Three policy modes control the level of automation.',
    whyItMatters:
      'Human-supervised automation balances efficiency with accountability.',
  },
  {
    id: 11,
    title: 'Recovery',
    narration:
      'When faults clear, the system automatically recovers to full fusion mode, restoring maximum capability.',
    whyItMatters:
      'Automatic recovery minimizes downtime and operator workload.',
  },
  {
    id: 12,
    title: 'Summary',
    narration:
      'ELOC2 demonstrated integrated sensor coordination, transparent decision-making, resilient degradation handling, and honest uncertainty reporting.',
    whyItMatters:
      'The system provides decision superiority through managed information fusion.',
  },
];
