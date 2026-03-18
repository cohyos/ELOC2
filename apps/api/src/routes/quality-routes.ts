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
}
