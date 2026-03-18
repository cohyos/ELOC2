import type {
  SystemTrack,
  SensorState,
  GeometryEstimate,
  TargetClassification,
} from '@eloc2/domain';

// ---------------------------------------------------------------------------
// EO Module Output — returned by tick()
// ---------------------------------------------------------------------------

/** Summary of a single EO enrichment applied to a track. */
export interface TrackEnrichment {
  trackId: string;
  /** Whether the EO module contributed geometric improvement. */
  geometryImproved: boolean;
  /** Whether a classification was produced or refined by EO. */
  classificationProduced: boolean;
  /** Active pipeline that produced this enrichment. */
  pipeline: 'sub-pixel' | 'image' | 'none';
}

/** Search-mode state for a single EO sensor. */
export interface SearchState {
  sensorId: string;
  active: boolean;
  pattern: 'sector' | 'raster';
  currentAzimuth: number;
}

/** Convergence state for a track being monitored for quality improvement. */
export interface ConvergenceEntry {
  trackId: string;
  measurementCount: number;
  convergenceRate: number;
  converged: boolean;
}

/** The full output of an EoManagementModule.tick(). */
export interface EoModuleOutput {
  /** Tracks enriched by EO processing this tick. */
  enrichments: TrackEnrichment[];
  /** Updated geometry estimates produced by triangulation. */
  geometryEstimates: Map<string, GeometryEstimate>;
  /** Current search-mode states for all EO sensors. */
  searchStates: SearchState[];
  /** Convergence monitoring per track. */
  convergenceStates: ConvergenceEntry[];
  /** Number of active dwells this tick. */
  activeDwells: number;
  /** Number of tasks proposed/assigned this tick. */
  tasksAssigned: number;
}

// ---------------------------------------------------------------------------
// EO Module Status — reported via getStatus()
// ---------------------------------------------------------------------------

/** High-level operating mode of the EO module. */
export type EoModuleMode = 'idle' | 'tracking' | 'searching' | 'mixed';

/** Status of a single pipeline instance. */
export interface PipelineStatus {
  trackId: string;
  pipeline: 'sub-pixel' | 'image';
  angularSizeMrad: number;
  snr: number;
}

/** Sensor allocation entry. */
export interface SensorAllocation {
  sensorId: string;
  targetTrackId: string | null;
  mode: 'dwell' | 'search' | 'idle';
  dwellRemainingSec: number;
}

/** Full status snapshot of the EO module. */
export interface EoModuleStatus {
  mode: EoModuleMode;
  activePipelines: PipelineStatus[];
  sensorAllocations: SensorAllocation[];
  enrichedTrackCount: number;
  totalTracksIngested: number;
  tickCount: number;
}

// ---------------------------------------------------------------------------
// Operator Commands
// ---------------------------------------------------------------------------

export type OperatorCommandType = 'lock' | 'release' | 'classify' | 'priority' | 'set_dwell';

export interface OperatorCommand {
  type: OperatorCommandType;
  sensorId?: string;
  trackId?: string;
  classification?: TargetClassification;
  priority?: 'high' | 'normal' | 'low';
  dwellDurationSec?: number;
}

// ---------------------------------------------------------------------------
// Ingest filter config
// ---------------------------------------------------------------------------

export interface IngestConfig {
  /** Minimum track confidence to consider for EO processing. */
  minConfidence: number;
  /** Whether to include tentative tracks. */
  includeTentative: boolean;
  /** Track statuses to exclude. */
  excludeStatuses: string[];
}

export const DEFAULT_INGEST_CONFIG: IngestConfig = {
  minConfidence: 0.1,
  includeTentative: true,
  excludeStatuses: ['dropped'],
};

// ---------------------------------------------------------------------------
// Mode controller thresholds
// ---------------------------------------------------------------------------

/** IFOV threshold in milliradians: below this, use sub-pixel; above, use image. */
export const IFOV_THRESHOLD_MRAD = 0.5;

/** Default EO sensor IFOV in milliradians. */
export const DEFAULT_SENSOR_IFOV_MRAD = 0.3;
