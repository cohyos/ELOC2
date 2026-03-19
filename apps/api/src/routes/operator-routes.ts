import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';
import type { TargetClassification } from '@eloc2/domain';
import { requireRole } from '../auth/auth-middleware.js';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/** Returns operator-level preHandler (both roles allowed) when auth is enabled */
function operatorGuard() {
  return AUTH_ENABLED ? [requireRole('operator')] : [];
}

// ---------------------------------------------------------------------------
// Operator Override API — Manual EO sensor control
// ---------------------------------------------------------------------------

const VALID_CLASSIFICATIONS: TargetClassification[] = [
  'civilian_aircraft', 'passenger_aircraft', 'light_aircraft', 'fighter_aircraft',
  'ally', 'predator', 'neutral', 'unknown', 'bird', 'birds',
  'helicopter', 'uav', 'small_uav', 'drone',
];

const VALID_PRIORITIES = ['high', 'normal', 'low'] as const;

export function registerOperatorRoutes(app: FastifyInstance, engine: LiveEngine) {
  // POST /api/operator/lock-sensor — Lock a sensor on a target or position
  app.post<{
    Body: { sensorId: string; targetId?: string; position?: { lat: number; lon: number; alt: number } };
  }>('/api/operator/lock-sensor', { preHandler: operatorGuard() }, async (request, reply) => {
    const { sensorId, targetId, position } = request.body ?? {};
    if (!sensorId || typeof sensorId !== 'string') {
      return reply.code(400).send({ error: 'sensorId is required' });
    }
    if (!targetId && !position) {
      return reply.code(400).send({ error: 'Either targetId or position is required' });
    }
    if (position && (typeof position.lat !== 'number' || typeof position.lon !== 'number')) {
      return reply.code(400).send({ error: 'position must have numeric lat and lon' });
    }

    const ok = engine.lockSensor(sensorId, targetId, position);
    if (!ok) {
      return reply.code(404).send({ error: `Sensor '${sensorId}' not found` });
    }

    return { ok: true, sensorId, lockedTo: targetId ?? position };
  });

  // POST /api/operator/release-sensor — Release a locked sensor back to auto
  app.post<{
    Body: { sensorId: string };
  }>('/api/operator/release-sensor', { preHandler: operatorGuard() }, async (request, reply) => {
    const { sensorId } = request.body ?? {};
    if (!sensorId || typeof sensorId !== 'string') {
      return reply.code(400).send({ error: 'sensorId is required' });
    }

    const ok = engine.releaseSensor(sensorId);
    if (!ok) {
      return reply.code(404).send({ error: `Sensor '${sensorId}' is not locked` });
    }

    return { ok: true, sensorId };
  });

  // POST /api/operator/classify — Manually classify a target
  app.post<{
    Body: { trackId: string; classification: TargetClassification; confidence?: number };
  }>('/api/operator/classify', { preHandler: operatorGuard() }, async (request, reply) => {
    const { trackId, classification, confidence } = request.body ?? {};
    if (!trackId || typeof trackId !== 'string') {
      return reply.code(400).send({ error: 'trackId is required' });
    }
    if (!classification || !VALID_CLASSIFICATIONS.includes(classification)) {
      return reply.code(400).send({
        error: `classification must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`,
      });
    }
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      return reply.code(400).send({ error: 'confidence must be a number between 0 and 1' });
    }

    const track = engine.classifyTrack(trackId, classification, 'operator', confidence ?? 1.0);
    if (!track) {
      return reply.code(404).send({ error: `Track '${trackId}' not found` });
    }

    return { ok: true, trackId, classification };
  });

  // POST /api/operator/set-priority — Set priority level for a track
  app.post<{
    Body: { trackId: string; priority: 'high' | 'normal' | 'low' };
  }>('/api/operator/set-priority', { preHandler: operatorGuard() }, async (request, reply) => {
    const { trackId, priority } = request.body ?? {};
    if (!trackId || typeof trackId !== 'string') {
      return reply.code(400).send({ error: 'trackId is required' });
    }
    if (!priority || !VALID_PRIORITIES.includes(priority)) {
      return reply.code(400).send({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }

    const ok = engine.setTrackPriority(trackId, priority);
    if (!ok) {
      return reply.code(404).send({ error: `Track '${trackId}' not found` });
    }

    return { ok: true, trackId, priority };
  });

  // GET /api/operator/overrides — Get all active operator overrides
  app.get('/api/operator/overrides', { preHandler: operatorGuard() }, async () => {
    return engine.getOperatorOverrides();
  });
}
