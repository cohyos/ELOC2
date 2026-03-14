import type { FastifyInstance } from 'fastify';
import { mockSensors, mockRegistrationStates } from '../mock-data.js';

export async function sensorRoutes(app: FastifyInstance) {
  // GET /api/sensors — All sensor states
  app.get('/api/sensors', async () => {
    return mockSensors;
  });

  // GET /api/sensors/:id/registration — Registration state for a sensor
  app.get<{ Params: { id: string } }>('/api/sensors/:id/registration', async (request, reply) => {
    const { id } = request.params;
    const reg = mockRegistrationStates.find(r => r.sensorId === id);
    if (!reg) {
      return reply.code(404).send({ error: 'No registration state found', sensorId: id });
    }
    return reg;
  });
}
