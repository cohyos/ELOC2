import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';
import { scenarios } from '@eloc2/scenario-library';
import { customScenarios } from './editor-routes.js';

export async function scenarioRoutes(app: FastifyInstance) {
  // GET /api/scenarios — List all available scenarios (built-in + custom)
  app.get('/api/scenarios', async () => {
    const builtIn = scenarios.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationSec: s.durationSec,
      sensorCount: s.sensors.length,
      targetCount: s.targets.length,
      custom: false,
    }));

    const custom = [...customScenarios.values()].map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationSec: s.durationSec,
      sensorCount: s.sensors.length,
      targetCount: s.targets.length,
      custom: true,
    }));

    return [...builtIn, ...custom];
  });

  // GET /api/scenario/status — Current scenario state
  app.get('/api/scenario/status', async () => {
    const s = engine.getState();
    return {
      scenarioId: s.scenarioId,
      running: s.running,
      speed: s.speed,
      elapsedSec: s.elapsedSec,
      durationSec: s.durationSec,
      trackCount: s.tracks.length,
      eventCount: s.eventLog.length,
    };
  });

  // POST /api/scenario/start — Start the scenario
  app.post('/api/scenario/start', async () => {
    engine.start();
    const s = engine.getState();
    return { ok: true, running: s.running, speed: s.speed, scenarioId: s.scenarioId };
  });

  // POST /api/scenario/pause — Pause the scenario
  app.post('/api/scenario/pause', async () => {
    engine.pause();
    return { ok: true, running: false };
  });

  // POST /api/scenario/speed — Set scenario speed
  app.post<{ Body: { speed: number } }>('/api/scenario/speed', async (request, reply) => {
    const { speed } = request.body;
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return reply.code(400).send({ error: 'Speed must be between 0.1 and 100' });
    }
    engine.setSpeed(speed);
    return { ok: true, speed };
  });

  // POST /api/scenario/reset — Reset and optionally switch scenario
  app.post<{ Body: { scenarioId?: string } }>('/api/scenario/reset', async (request) => {
    const scenarioId = request.body?.scenarioId;

    // Check if it's a custom scenario
    if (scenarioId && customScenarios.has(scenarioId)) {
      const customDef = customScenarios.get(scenarioId)!;
      engine.loadCustomScenario(customDef);
      const s = engine.getState();
      return { ok: true, scenarioId: s.scenarioId };
    }

    engine.reset(scenarioId);
    const s = engine.getState();
    return { ok: true, scenarioId: s.scenarioId };
  });

  // POST /api/replay/seek — Seek to a specific simulation time
  app.post<{ Body: { timeSec: number } }>('/api/replay/seek', async (request, reply) => {
    const { timeSec } = request.body;
    if (typeof timeSec !== 'number' || timeSec < 0) {
      return reply.code(400).send({ error: 'timeSec must be a non-negative number' });
    }
    engine.seek(timeSec);
    const s = engine.getState();
    return { ok: true, elapsedSec: s.elapsedSec, running: s.running };
  });
}
