import type { FastifyInstance } from 'fastify';
import { mockTracks, mockGeometryEstimates } from '../mock-data.js';

export async function rapRoutes(app: FastifyInstance) {
  // GET /api/rap — Recognized Air Picture
  app.get('/api/rap', async () => {
    const tracks = mockTracks;
    const confirmed = tracks.filter(t => t.status === 'confirmed').length;
    const tentative = tracks.filter(t => t.status === 'tentative').length;
    return {
      tracks,
      timestamp: Date.now(),
      trackCount: tracks.length,
      confirmedCount: confirmed,
      tentativeCount: tentative,
    };
  });

  // GET /api/tracks/:id — Single track with full lineage
  app.get<{ Params: { id: string } }>('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params;
    const track = mockTracks.find(t => t.systemTrackId === id);
    if (!track) {
      return reply.code(404).send({ error: 'Track not found', trackId: id });
    }
    return track;
  });

  // GET /api/geometry/:id — Geometry estimate for a track
  app.get<{ Params: { id: string } }>('/api/geometry/:id', async (request, reply) => {
    const { id } = request.params;
    const estimate = mockGeometryEstimates.get(id);
    if (!estimate) {
      return reply.code(404).send({ error: 'No geometry estimate found', trackId: id });
    }
    return estimate;
  });
}
