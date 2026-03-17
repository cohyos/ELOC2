import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function rapRoutes(app: FastifyInstance) {
  // GET /api/rap — Recognized Air Picture
  app.get('/api/rap', async () => {
    const s = engine.getState();
    const tracks = s.tracks;
    const confirmed = tracks.filter(t => t.status === 'confirmed').length;
    const tentative = tracks.filter(t => t.status === 'tentative').length;
    return {
      tracks,
      timestamp: Date.now(),
      simTimeSec: s.elapsedSec,
      trackCount: tracks.length,
      confirmedCount: confirmed,
      tentativeCount: tentative,
    };
  });

  // GET /api/tracks/:id — Single track with full lineage
  app.get<{ Params: { id: string } }>('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params;
    const track = engine.getState().tracks.find(t => t.systemTrackId === id);
    if (!track) {
      return reply.code(404).send({ error: 'Track not found', trackId: id });
    }
    const evidence = engine.getTrackEvidence(id);
    const investigationHistory = engine.getTrackInvestigation(id);
    const threatAssessment = engine.getTrackThreat(id);
    return { ...track, evidence, investigationHistory, threatAssessment };
  });

  // GET /api/geometry/:id — Geometry estimate for a track
  app.get<{ Params: { id: string } }>('/api/geometry/:id', async (request, reply) => {
    const { id } = request.params;
    const estimate = engine.getState().geometryEstimates.get(id);
    if (!estimate) {
      return reply.code(404).send({ error: 'No geometry estimate found', trackId: id });
    }
    return estimate;
  });

  // GET /api/events — Recent event log
  app.get('/api/events', async () => {
    return engine.getState().eventLog.slice(-100);
  });
}
