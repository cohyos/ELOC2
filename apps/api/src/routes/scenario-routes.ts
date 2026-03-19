import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';
import { scenarios } from '@eloc2/scenario-library';
import { customScenarios } from './editor-routes.js';
import { requireRole } from '../auth/auth-middleware.js';

// ── Sensor Library ────────────────────────────────────────────────────────
interface SensorLibraryEntry {
  id: string;
  name: string;
  type: string;
  coverage: Record<string, number>;
  fov?: Record<string, number>;
  description: string;
}

interface SensorLibrary {
  sensors: SensorLibraryEntry[];
}

function loadSensorLibrary(): SensorLibrary {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Resolve from api src dir -> project root: src/routes -> src -> api -> apps -> root
  const libPath = path.resolve(__dirname, '../../../../configs/sensor-library.json');
  if (!fs.existsSync(libPath)) {
    return { sensors: [] };
  }
  return JSON.parse(fs.readFileSync(libPath, 'utf-8')) as SensorLibrary;
}

const sensorLibrary = loadSensorLibrary();

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/** Returns instructor-only preHandler array when auth is enabled, empty otherwise */
function instructorGuard() {
  return AUTH_ENABLED ? [requireRole('instructor')] : [];
}

export async function scenarioRoutes(app: FastifyInstance) {
  // GET /api/scenario/state — Current state machine state + allowed actions
  app.get('/api/scenario/state', async () => {
    return engine.getSimulationState();
  });

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

  // POST /api/scenario/start — Start the scenario (Instructor only)
  app.post('/api/scenario/start', { preHandler: instructorGuard() }, async (_request, reply) => {
    try {
      engine.start();
      const s = engine.getState();
      return { ok: true, running: s.running, speed: s.speed, scenarioId: s.scenarioId };
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // POST /api/scenario/pause — Pause the scenario (Instructor only)
  app.post('/api/scenario/pause', { preHandler: instructorGuard() }, async (_request, reply) => {
    try {
      engine.pause();
      return { ok: true, running: false };
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // POST /api/scenario/speed — Set scenario speed (Instructor only)
  app.post<{ Body: { speed: number } }>('/api/scenario/speed', { preHandler: instructorGuard() }, async (request, reply) => {
    const { speed } = request.body;
    if (typeof speed !== 'number' || speed < 0.1 || speed > 100) {
      return reply.code(400).send({ error: 'Speed must be between 0.1 and 100' });
    }
    engine.setSpeed(speed);
    return { ok: true, speed };
  });

  // POST /api/scenario/reset — Reset and optionally switch scenario (Instructor only)
  app.post<{ Body: { scenarioId?: string } }>('/api/scenario/reset', { preHandler: instructorGuard() }, async (request, reply) => {
    const scenarioId = request.body?.scenarioId;

    try {
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
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // POST /api/replay/seek — Seek to a specific simulation time (Instructor only)
  app.post<{ Body: { timeSec: number } }>('/api/replay/seek', { preHandler: instructorGuard() }, async (request, reply) => {
    const { timeSec } = request.body;
    if (typeof timeSec !== 'number' || timeSec < 0) {
      return reply.code(400).send({ error: 'timeSec must be a non-negative number' });
    }
    try {
      engine.seek(timeSec);
      const s = engine.getState();
      return { ok: true, elapsedSec: s.elapsedSec, running: s.running };
    } catch (err: any) {
      return reply.code(409).send({ error: err.message });
    }
  });

  // ── Sensor Library ──────────────────────────────────────────────────────

  // GET /api/sensors/library — Returns the full sensor library
  app.get('/api/sensors/library', async () => {
    return sensorLibrary;
  });

  // GET /api/sensors/library/:id — Returns a specific sensor definition
  app.get<{ Params: { id: string } }>('/api/sensors/library/:id', async (request, reply) => {
    const sensor = sensorLibrary.sensors.find((s) => s.id === request.params.id);
    if (!sensor) {
      return reply.code(404).send({ error: `Sensor '${request.params.id}' not found in library` });
    }
    return sensor;
  });
}
