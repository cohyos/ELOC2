import path from 'node:path';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';
import { scenarios } from '@eloc2/scenario-library';
import { customScenarios } from './editor-routes.js';
import { requireRole } from '../auth/auth-middleware.js';
import { getElevation } from '@eloc2/terrain';

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

const configsDir = path.resolve(process.cwd(), 'configs');

function loadSensorLibrary(): SensorLibrary {
  const libPath = path.join(configsDir, 'sensor-library.json');
  if (!fs.existsSync(libPath)) return { sensors: [] };
  return JSON.parse(fs.readFileSync(libPath, 'utf-8')) as SensorLibrary;
}

function saveSensorLibrary(lib: SensorLibrary): void {
  fs.writeFileSync(path.join(configsDir, 'sensor-library.json'), JSON.stringify(lib, null, 2));
}

// ── Target Library ────────────────────────────────────────────────────────
interface TargetLibraryEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  rcs: number;
  irEmission: number;
  speedMs: number;
  altitudeM: number;
  classification?: string;
  symbol?: string;
  ballisticProperties?: {
    rangeKm: number;
    apogeeM: number;
    burnTimeSec: number;
    reentrySpeedMs: number;
    defaultLaunchBearingDeg: number;
    defaultImpactBearingDeg: number;
  };
}

interface TargetLibrary {
  version: string;
  targets: TargetLibraryEntry[];
}

function loadTargetLibrary(): TargetLibrary {
  const libPath = path.join(configsDir, 'target-library.json');
  if (!fs.existsSync(libPath)) return { version: '1.0', targets: [] };
  return JSON.parse(fs.readFileSync(libPath, 'utf-8')) as TargetLibrary;
}

function saveTargetLibrary(lib: TargetLibrary): void {
  fs.writeFileSync(path.join(configsDir, 'target-library.json'), JSON.stringify(lib, null, 2));
}

let sensorLibrary = loadSensorLibrary();
let targetLibrary = loadTargetLibrary();

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

  // POST /api/sensors/library — Add or update a sensor type
  app.post<{ Body: SensorLibraryEntry }>('/api/sensors/library', {
    preHandler: instructorGuard(),
  }, async (request, reply) => {
    const entry = request.body;
    if (!entry?.id || !entry?.name) {
      return reply.code(400).send({ error: 'id and name are required' });
    }
    const idx = sensorLibrary.sensors.findIndex((s) => s.id === entry.id);
    if (idx >= 0) {
      sensorLibrary.sensors[idx] = entry;
    } else {
      sensorLibrary.sensors.push(entry);
    }
    saveSensorLibrary(sensorLibrary);
    return { ok: true, count: sensorLibrary.sensors.length };
  });

  // DELETE /api/sensors/library/:id — Remove a sensor type
  app.delete<{ Params: { id: string } }>('/api/sensors/library/:id', {
    preHandler: instructorGuard(),
  }, async (request, reply) => {
    const idx = sensorLibrary.sensors.findIndex((s) => s.id === request.params.id);
    if (idx < 0) {
      return reply.code(404).send({ error: 'Sensor not found' });
    }
    sensorLibrary.sensors.splice(idx, 1);
    saveSensorLibrary(sensorLibrary);
    return { ok: true };
  });

  // ── Target Library ──────────────────────────────────────────────────────

  // GET /api/targets/library — Returns the full target library
  app.get('/api/targets/library', async () => {
    return targetLibrary;
  });

  // GET /api/targets/library/:id — Returns a specific target definition
  app.get<{ Params: { id: string } }>('/api/targets/library/:id', async (request, reply) => {
    const target = targetLibrary.targets.find((t) => t.id === request.params.id);
    if (!target) {
      return reply.code(404).send({ error: `Target '${request.params.id}' not found in library` });
    }
    return target;
  });

  // GET /api/targets/library/category/:category — Filter by category
  app.get<{ Params: { category: string } }>('/api/targets/library/category/:category', async (request) => {
    const cat = request.params.category;
    return { targets: targetLibrary.targets.filter((t) => t.category === cat) };
  });

  // POST /api/targets/library — Add or update a target type
  app.post<{ Body: TargetLibraryEntry }>('/api/targets/library', {
    preHandler: instructorGuard(),
  }, async (request, reply) => {
    const entry = request.body;
    if (!entry?.id || !entry?.name) {
      return reply.code(400).send({ error: 'id and name are required' });
    }
    const idx = targetLibrary.targets.findIndex((t) => t.id === entry.id);
    if (idx >= 0) {
      targetLibrary.targets[idx] = entry;
    } else {
      targetLibrary.targets.push(entry);
    }
    saveTargetLibrary(targetLibrary);
    return { ok: true, count: targetLibrary.targets.length };
  });

  // DELETE /api/targets/library/:id — Remove a target type
  app.delete<{ Params: { id: string } }>('/api/targets/library/:id', {
    preHandler: instructorGuard(),
  }, async (request, reply) => {
    const idx = targetLibrary.targets.findIndex((t) => t.id === request.params.id);
    if (idx < 0) {
      return reply.code(404).send({ error: 'Target not found' });
    }
    targetLibrary.targets.splice(idx, 1);
    saveTargetLibrary(targetLibrary);
    return { ok: true };
  });

  // ── Scenario Library CRUD ─────────────────────────────────────────────

  // GET /api/scenarios/:id — Get full scenario definition
  app.get<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    const { id } = request.params;
    const builtIn = scenarios.find(s => s.id === id);
    if (builtIn) return builtIn;
    const custom = customScenarios.get(id);
    if (custom) return custom;
    return reply.code(404).send({ error: 'Scenario not found' });
  });

  // POST /api/scenarios/:id/clone — Clone a scenario as a new custom scenario
  app.post<{ Params: { id: string }; Body: { newName?: string } }>('/api/scenarios/:id/clone', {
    preHandler: instructorGuard(),
  }, async (request, reply) => {
    const { id } = request.params;
    const { newName } = request.body ?? {};
    const source = scenarios.find(s => s.id === id) ?? customScenarios.get(id);
    if (!source) {
      return reply.code(404).send({ error: 'Source scenario not found' });
    }
    const cloned = structuredClone(source);
    cloned.id = `custom-${Date.now()}`;
    cloned.name = newName || `${source.name} (Copy)`;
    customScenarios.set(cloned.id, cloned);
    return { ok: true, id: cloned.id, name: cloned.name };
  });

  // ── Terrain Elevation ───────────────────────────────────────────────────

  // GET /api/terrain/elevation?lat=X&lon=Y — Get SRTM elevation at a point
  app.get<{ Querystring: { lat: string; lon: string } }>('/api/terrain/elevation', async (request, reply) => {
    const lat = parseFloat(request.query.lat);
    const lon = parseFloat(request.query.lon);
    if (isNaN(lat) || isNaN(lon)) {
      return reply.code(400).send({ error: 'lat and lon query params required (numbers)' });
    }
    const elevation = getElevation(lat, lon);
    return { lat, lon, elevationM: elevation ?? 0 };
  });
}
