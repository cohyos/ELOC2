import type { FastifyInstance } from 'fastify';
import { engine } from '../simulation/live-engine.js';

export async function taskRoutes(app: FastifyInstance) {
  // GET /api/tasks — All tasks with score breakdowns
  app.get('/api/tasks', async () => {
    return engine.getState().tasks;
  });

  // POST /api/operator/approve — Approve a proposed task
  app.post<{ Body: { taskId: string } }>('/api/operator/approve', async (request, reply) => {
    const { taskId } = request.body;
    const task = engine.getState().tasks.find(t => t.taskId === taskId);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found', taskId });
    }
    task.status = 'approved';
    return task;
  });

  // POST /api/operator/reject — Reject a proposed task
  app.post<{ Body: { taskId: string } }>('/api/operator/reject', async (request, reply) => {
    const { taskId } = request.body;
    const task = engine.getState().tasks.find(t => t.taskId === taskId);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found', taskId });
    }
    task.status = 'rejected';
    return task;
  });

  // POST /api/operator/reserve — Reserve a sensor for manual control
  app.post<{ Body: { sensorId: string } }>('/api/operator/reserve', async (_request) => {
    return { ok: true, reserved: true };
  });
}
