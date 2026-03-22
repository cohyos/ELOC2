import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';

/**
 * Decision chain log API routes.
 * Exposes decision chain data for viewing and exporting.
 */
export function registerLogRoutes(app: FastifyInstance, engine: LiveEngine) {
  // GET /api/logs/decision-chains — Returns current decision chain entries
  app.get('/api/logs/decision-chains', async () => {
    return engine.getDecisionChains();
  });

  // GET /api/logs/decision-chains/export — Returns decision chains as downloadable JSON
  app.get('/api/logs/decision-chains/export', async (_req, reply) => {
    const chains = engine.getDecisionChains();
    const exportData = {
      exportedAt: new Date().toISOString(),
      scenarioId: engine.getState().scenarioId,
      simTimeSec: engine.getState().elapsedSec,
      chainCount: chains.length,
      averageQuality: chains.length > 0
        ? chains.reduce((sum, c) => sum + c.chainQuality, 0) / chains.length
        : 0,
      chains,
    };
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="decision-chains-${Date.now()}.json"`);
    return exportData;
  });

  // GET /api/logs/events — Returns the event log
  app.get('/api/logs/events', async () => {
    return engine.getState().eventLog;
  });
}
