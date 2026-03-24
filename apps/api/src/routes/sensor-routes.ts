import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function sensorRoutes(app: FastifyInstance) {
  // GET /api/sensors — All sensor states
  app.get('/api/sensors', async () => {
    return engine.getState().sensors;
  });

  // GET /api/sensors/:id/registration — Registration state for a sensor
  app.get<{ Params: { id: string } }>('/api/sensors/:id/registration', async (request, reply) => {
    const { id } = request.params;
    const reg = engine.getState().registrationStates.find(r => r.sensorId === id);
    if (!reg) {
      return reply.code(404).send({ error: 'No registration state found', sensorId: id });
    }
    return reg;
  });

  // GET /api/eo/search-status — Search mode state for all EO sensors
  app.get('/api/eo/search-status', async () => {
    return engine.getSearchModeStatus();
  });

  // POST /api/eo/search-control — Enable/disable search mode for a sensor
  app.post<{
    Body: {
      sensorId: string;
      enabled: boolean;
      pattern?: 'sector' | 'raster';
      scanStart?: number;
      scanEnd?: number;
    };
  }>('/api/eo/search-control', async (request, reply) => {
    const { sensorId, enabled, pattern, scanStart, scanEnd } = request.body;

    if (!sensorId || typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'sensorId (string) and enabled (boolean) are required' });
    }

    const success = engine.setSearchModeControl(sensorId, {
      enabled,
      pattern,
      scanStart,
      scanEnd,
    });

    if (!success) {
      return reply.code(404).send({ error: 'EO sensor not found', sensorId });
    }

    return { ok: true, sensorId, enabled };
  });

  // ── Sector Scan ─────────────────────────────────────────────────────

  // POST /api/eo/sector-scan/start — Start a sector threat scan
  app.post<{
    Body: {
      azimuthStartDeg: number;
      azimuthEndDeg: number;
      sensorIds: string[];
    };
  }>('/api/eo/sector-scan/start', async (request, reply) => {
    const { azimuthStartDeg, azimuthEndDeg, sensorIds } = request.body ?? {};

    if (azimuthStartDeg == null || azimuthEndDeg == null || !Array.isArray(sensorIds)) {
      return reply.code(400).send({
        error: 'azimuthStartDeg, azimuthEndDeg (numbers) and sensorIds (string[]) required',
      });
    }
    if (sensorIds.length < 1 || sensorIds.length > 3) {
      return reply.code(400).send({ error: 'Assign 1-3 EO investigators' });
    }

    const result = engine.startSectorScan(
      { azimuthStartDeg, azimuthEndDeg },
      sensorIds,
    );

    if ('error' in result) {
      return reply.code(400).send(result);
    }
    return { ok: true, ...result };
  });

  // POST /api/eo/sector-scan/stop — Stop the active sector scan
  app.post('/api/eo/sector-scan/stop', async (_request, reply) => {
    const stopped = engine.stopSectorScan();
    if (!stopped) {
      return reply.code(404).send({ error: 'No active sector scan' });
    }
    return { ok: true };
  });

  // GET /api/eo/sector-scan/status — Get current sector scan state
  app.get('/api/eo/sector-scan/status', async () => {
    return engine.getSectorScanState() ?? { active: false };
  });

  // GET /api/eo/available-investigators — EO sensors available for sector scan
  app.get('/api/eo/available-investigators', async () => {
    const sensors = engine.getState().sensors;
    return sensors
      .filter((s) => s.sensorType === 'eo' && s.online)
      .map((s) => ({
        sensorId: s.sensorId,
        position: s.position,
        slewRateDegPerSec: s.gimbal?.slewRateDegPerSec ?? 0,
        online: s.online,
      }));
  });

  // GET /api/eo/fov-overlaps — Current FOV overlap data between EO sensors
  app.get('/api/eo/fov-overlaps', async () => {
    return engine.getFovOverlaps();
  });

  // GET /api/eo/associations — Bearing-to-track associations with confidence scores
  app.get('/api/eo/associations', async () => {
    return engine.getBearingAssociations();
  });
}
