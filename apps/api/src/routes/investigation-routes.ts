import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';

// ---------------------------------------------------------------------------
// Investigation Parameters API
// ---------------------------------------------------------------------------

export function registerInvestigationRoutes(app: FastifyInstance, engine: LiveEngine) {
  // GET /api/investigation/parameters — Current investigation parameters
  app.get('/api/investigation/parameters', async () => {
    return engine.getInvestigationParameters();
  });

  // POST /api/investigation/parameters — Update investigation parameters
  app.post<{ Body: Partial<import('../simulation/live-engine.js').InvestigationParameters> }>(
    '/api/investigation/parameters',
    async (request, reply) => {
      const params = request.body;
      if (!params || typeof params !== 'object') {
        return reply.code(400).send({ error: 'Request body must be an object' });
      }

      // Validate weights ranges (0-5)
      if (params.weights) {
        for (const [key, value] of Object.entries(params.weights)) {
          if (typeof value !== 'number' || value < 0 || value > 5) {
            return reply.code(400).send({ error: `Weight '${key}' must be a number between 0 and 5` });
          }
        }
      }

      // Validate thresholds
      if (params.thresholds) {
        const t = params.thresholds;
        if (t.splitAngleDeg !== undefined && (t.splitAngleDeg < 0.1 || t.splitAngleDeg > 5.0)) {
          return reply.code(400).send({ error: 'splitAngleDeg must be between 0.1 and 5.0' });
        }
        if (t.confidenceGate !== undefined && (t.confidenceGate < 0.3 || t.confidenceGate > 1.0)) {
          return reply.code(400).send({ error: 'confidenceGate must be between 0.3 and 1.0' });
        }
        if (t.cueValidityWindowSec !== undefined && (t.cueValidityWindowSec < 10 || t.cueValidityWindowSec > 120)) {
          return reply.code(400).send({ error: 'cueValidityWindowSec must be between 10 and 120' });
        }
        if (t.convergenceThreshold !== undefined && (t.convergenceThreshold < 0.5 || t.convergenceThreshold > 1.0)) {
          return reply.code(400).send({ error: 'convergenceThreshold must be between 0.5 and 1.0' });
        }
      }

      // Validate policyMode
      if (params.policyMode !== undefined) {
        const validModes = ['recommended_only', 'auto_with_veto', 'manual'];
        if (!validModes.includes(params.policyMode)) {
          return reply.code(400).send({ error: `policyMode must be one of: ${validModes.join(', ')}` });
        }
      }

      engine.setInvestigationParameters(params);
      return { ok: true, parameters: engine.getInvestigationParameters() };
    },
  );

  // POST /api/investigation/parameters/reset — Reset to defaults
  app.post('/api/investigation/parameters/reset', async () => {
    engine.resetInvestigationParameters();
    return { ok: true, parameters: engine.getInvestigationParameters() };
  });

  // GET /api/investigation/active — Active investigation summaries
  app.get('/api/investigation/active', async () => {
    return engine.getActiveInvestigations();
  });

  // POST /api/investigation/force-resolve — Force resolve an unresolved group
  app.post<{ Body: { groupId: string } }>(
    '/api/investigation/force-resolve',
    async (request, reply) => {
      const { groupId } = request.body;
      if (!groupId || typeof groupId !== 'string') {
        return reply.code(400).send({ error: 'groupId is required' });
      }
      const result = engine.forceResolveGroup(groupId);
      if (!result) {
        return reply.code(404).send({ error: `Group '${groupId}' not found` });
      }
      return { ok: true, groupId };
    },
  );

  // GET /api/investigation/:trackId/log — Investigation event log for a track (pyrite mode)
  app.get<{ Params: { trackId: string } }>(
    '/api/investigation/:trackId/log',
    async (request) => {
      const { trackId } = request.params;
      return engine.getInvestigationLog(trackId);
    },
  );
}
