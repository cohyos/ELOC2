import type { FastifyInstance } from 'fastify';
import type { Timestamp } from '@eloc2/domain';
import { scenarioState } from '../mock-data.js';

export async function scenarioRoutes(app: FastifyInstance) {
  // POST /api/scenario/start — Start the scenario
  app.post('/api/scenario/start', async () => {
    scenarioState.running = true;
    scenarioState.startedAt = Date.now() as Timestamp;
    return { ok: true, running: true, speed: scenarioState.speed };
  });

  // POST /api/scenario/pause — Pause the scenario
  app.post('/api/scenario/pause', async () => {
    scenarioState.running = false;
    return { ok: true, running: false };
  });

  // POST /api/scenario/speed — Set scenario speed
  app.post<{ Body: { speed: number } }>('/api/scenario/speed', async (request, reply) => {
    const { speed } = request.body;
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return reply.code(400).send({ error: 'Speed must be a number between 0.1 and 100' });
    }
    scenarioState.speed = speed;
    return { ok: true, speed };
  });
}
