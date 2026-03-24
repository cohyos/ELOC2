import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';
import type { ScenarioDefinition } from '@eloc2/scenario-library';
import { generateId } from '@eloc2/shared-utils';
import { requireRole } from '../auth/auth-middleware.js';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/** Returns instructor-only preHandler array when auth is enabled, empty otherwise */
function instructorGuard() {
  return AUTH_ENABLED ? [requireRole('instructor')] : [];
}

// ---------------------------------------------------------------------------
// In-memory custom scenario storage (lost on restart — acceptable for demo)
// ---------------------------------------------------------------------------
export const customScenarios = new Map<string, ScenarioDefinition>();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateScenario(def: ScenarioDefinition): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!def.sensors || def.sensors.length === 0) errors.push('At least one sensor required');
  if (!def.targets || def.targets.length === 0) warnings.push('No targets defined — scenario will run without ground truth');
  if (!def.durationSec || def.durationSec <= 0) errors.push('Duration must be positive');

  // Check for duplicate sensor IDs
  const sensorIds = new Set<string>();
  for (const s of def.sensors || []) {
    if (sensorIds.has(s.sensorId)) errors.push(`Duplicate sensor ID: ${s.sensorId}`);
    sensorIds.add(s.sensorId);
  }

  // Check for duplicate target IDs
  const targetIds = new Set<string>();
  for (const t of def.targets || []) {
    if (targetIds.has(t.targetId)) errors.push(`Duplicate target ID: ${t.targetId}`);
    targetIds.add(t.targetId);
  }

  // Check fault references
  for (const f of def.faults || []) {
    if (!sensorIds.has(f.sensorId)) errors.push(`Fault references unknown sensor: ${f.sensorId}`);
  }

  // Warnings
  const eoCount = (def.sensors || []).filter(s => s.type === 'eo').length;
  if (eoCount === 1) warnings.push('Only 1 EO sensor — triangulation not possible');
  if (eoCount === 0) warnings.push('No EO sensors — EO investigation features will not work');
  if (!def.faults || def.faults.length === 0) warnings.push('No faults defined');

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function editorRoutes(app: FastifyInstance, engine: LiveEngine) {
  // ── Custom Scenario CRUD ───────────────────────────────────────────────

  // POST /api/scenarios/custom — Save a custom scenario (Instructor only)
  app.post<{ Body: ScenarioDefinition }>('/api/scenarios/custom', { preHandler: instructorGuard() }, async (request, reply) => {
    const def = request.body;
    if (!def || typeof def !== 'object') {
      return reply.code(400).send({ error: 'Request body must be a ScenarioDefinition' });
    }

    // Validate
    const { errors } = validateScenario(def);
    if (errors.length > 0) {
      return reply.code(400).send({ error: 'Validation failed', errors });
    }

    // Assign an ID if missing
    const scenarioId = def.id || `custom-${generateId().slice(0, 8)}`;
    const stored: ScenarioDefinition = { ...def, id: scenarioId };
    customScenarios.set(scenarioId, stored);

    return { ok: true, scenarioId };
  });

  // GET /api/scenarios/custom — List custom scenarios (Instructor only)
  app.get('/api/scenarios/custom', { preHandler: instructorGuard() }, async () => {
    const scenarios = [...customScenarios.values()].map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      sensorCount: s.sensors.length,
      targetCount: s.targets.length,
      duration: s.durationSec,
    }));
    return { scenarios };
  });

  // DELETE /api/scenarios/custom/:id — Delete a custom scenario (Instructor only)
  app.delete<{ Params: { id: string } }>('/api/scenarios/custom/:id', { preHandler: instructorGuard() }, async (request, reply) => {
    const { id } = request.params;
    if (!customScenarios.has(id)) {
      return reply.code(404).send({ error: 'Custom scenario not found', scenarioId: id });
    }
    customScenarios.delete(id);
    return { ok: true };
  });

  // POST /api/scenarios/validate — Validate a ScenarioDefinition (Instructor only)
  app.post<{ Body: ScenarioDefinition }>('/api/scenarios/validate', { preHandler: instructorGuard() }, async (request, reply) => {
    const def = request.body;
    if (!def || typeof def !== 'object') {
      return reply.code(400).send({ error: 'Request body must be a ScenarioDefinition' });
    }

    const { errors, warnings } = validateScenario(def);
    return { valid: errors.length === 0, errors, warnings };
  });

  // ── Live Injection ─────────────────────────────────────────────────────

  // POST /api/scenario/inject-fault — Live inject fault during running scenario (Instructor only)
  app.post<{
    Body: {
      type: 'azimuth_bias' | 'clock_drift' | 'sensor_outage';
      sensorId: string;
      magnitude?: number;
      durationSec: number;
    };
  }>('/api/scenario/inject-fault', { preHandler: instructorGuard() }, async (request, reply) => {
    const { type, sensorId, magnitude, durationSec } = request.body;

    if (!type || !sensorId || !durationSec || durationSec <= 0) {
      return reply.code(400).send({ error: 'type, sensorId, and durationSec (>0) are required' });
    }

    const state = engine.getState();
    if (!state.running) {
      return reply.code(409).send({ error: 'No scenario is currently running' });
    }

    const sensorExists = state.sensors.some(s => s.sensorId === sensorId);
    if (!sensorExists) {
      return reply.code(404).send({ error: `Sensor not found: ${sensorId}` });
    }

    const injectionId = engine.injectFault({ type, sensorId, magnitude, durationSec });
    return { ok: true, injectionId };
  });

  // POST /api/scenario/inject-target — Live inject pop-up target
  app.post<{
    Body: {
      lat: number;
      lon: number;
      alt: number;
      speed: number;
      headingDeg: number;
      label?: string;
    };
  }>('/api/scenario/inject-target', { preHandler: instructorGuard() }, async (request, reply) => {
    const { lat, lon, alt, speed, headingDeg, label } = request.body;

    if (lat == null || lon == null || alt == null || speed == null || headingDeg == null) {
      return reply.code(400).send({ error: 'lat, lon, alt, speed, and headingDeg are required' });
    }

    const simState = engine.getSimulationState().state;
    if (simState === 'idle' || simState === 'resetting') {
      return reply.code(409).send({ error: 'No scenario is currently running' });
    }

    const targetId = engine.injectTarget({ lat, lon, alt, speed, headingDeg, label });
    return { ok: true, targetId };
  });

  // POST /api/scenario/inject-action — Live inject operator action
  app.post<{
    Body: {
      type: 'reserve_sensor' | 'veto_assignment';
      sensorId?: string;
      targetId?: string;
      durationSec?: number;
    };
  }>('/api/scenario/inject-action', { preHandler: instructorGuard() }, async (request, reply) => {
    const { type, sensorId, targetId, durationSec } = request.body;

    if (!type) {
      return reply.code(400).send({ error: 'type is required' });
    }

    const state = engine.getState();
    if (!state.running) {
      return reply.code(409).send({ error: 'No scenario is currently running' });
    }

    engine.injectOperatorAction({ type, sensorId, targetId, durationSec });
    return { ok: true };
  });

  // GET /api/scenario/injection-log — View injection history (Instructor only)
  app.get('/api/scenario/injection-log', { preHandler: instructorGuard() }, async () => {
    return { log: engine.getInjectionLog() };
  });

  // POST /api/simulation/auto-inject — Toggle random target auto-injection (Instructor only)
  app.post<{ Body: { enabled: boolean } }>('/api/simulation/auto-inject', { preHandler: instructorGuard() }, async (request, reply) => {
    const { enabled } = request.body;
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled (boolean) is required' });
    }
    if (enabled) {
      engine.enableAutoInject();
    } else {
      engine.disableAutoInject();
    }
    return { ok: true, autoInjectEnabled: enabled };
  });
}

// ---------------------------------------------------------------------------
// Registration helper — Fastify plugin pattern
// ---------------------------------------------------------------------------

export function registerEditorRoutes(app: FastifyInstance, engine: LiveEngine) {
  app.register(async (instance) => {
    await editorRoutes(instance, engine);
  });
}
