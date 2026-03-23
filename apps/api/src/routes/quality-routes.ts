import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';

/**
 * Quality assessment API routes (REQ-8).
 * Exposes quality metrics comparing system tracks against ground truth.
 */
export function registerQualityRoutes(app: FastifyInstance, engine: LiveEngine) {
  // GET /api/quality/metrics — Returns quality assessment metrics
  app.get('/api/quality/metrics', async () => {
    const metrics = engine.getQualityMetrics();
    if (!metrics) {
      return {
        trackToTruthAssociation: 0,
        positionErrorAvg: 0,
        positionErrorMax: 0,
        classificationAccuracy: 0,
        coveragePercent: 0,
        falseTrackRate: 0,
        sensorUtilization: {},
        timeToFirstDetection: {},
        timeToConfirmed3D: {},
      };
    }
    return metrics;
  });

  // GET /api/quality/allocation — Returns EO allocation quality metrics (REQ-10)
  app.get('/api/quality/allocation', async () => {
    const allocation = engine.getEoAllocationQuality();
    if (!allocation) {
      return {
        coverageEfficiency: 0,
        geometryOptimality: 0,
        dwellEfficiency: 0,
        revisitTimeliness: 100,
        triangulationSuccessRate: 0,
        sensorUtilization: 0,
        priorityAlignment: 100,
      };
    }
    return allocation;
  });

  // GET /api/quality/before-after — Returns before/after EO comparison (REQ-9)
  app.get('/api/quality/before-after', async () => {
    return engine.getBeforeAfterComparison();
  });

  // GET /api/quality/convergence — Returns convergence state for all tracked targets (REQ-5 Phase C)
  app.get('/api/quality/convergence', async () => {
    return engine.getConvergenceStates();
  });

  // GET /api/quality/pipeline-health — Returns pipeline health monitoring data
  app.get('/api/quality/pipeline-health', async () => {
    return engine.getPipelineHealth();
  });
}
