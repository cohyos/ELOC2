import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function groupRoutes(app: FastifyInstance) {
  // GET /api/groups — All active unresolved groups
  app.get('/api/groups', async () => {
    return engine.getState().unresolvedGroups;
  });

  // GET /api/groups/:id — Single unresolved group
  app.get<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const { id } = request.params;
    const group = engine.getState().unresolvedGroups.find(g => g.groupId === id);
    if (!group) {
      return reply.code(404).send({ error: 'Group not found', groupId: id });
    }
    return group;
  });

  // GET /api/eo-cues — Active EO cues
  app.get('/api/eo-cues', async () => {
    return engine.getState().activeCues;
  });

  // GET /api/eo-tracks — Recent EO tracks
  app.get('/api/eo-tracks', async () => {
    return engine.getState().eoTracks;
  });
}
