import type { FastifyInstance } from 'fastify';
import type { TaskId, SensorId, Timestamp } from '@eloc2/domain';
import { mockTasks } from '../mock-data.js';

export async function taskRoutes(app: FastifyInstance) {
  // GET /api/tasks — All tasks with score breakdowns
  app.get('/api/tasks', async () => {
    return mockTasks;
  });

  // POST /api/operator/approve — Approve a proposed task
  app.post<{ Body: { taskId: string } }>('/api/operator/approve', async (request, reply) => {
    const { taskId } = request.body;
    const task = mockTasks.find(t => t.taskId === taskId);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found', taskId });
    }
    task.status = 'approved';
    return task;
  });

  // POST /api/operator/reject — Reject a proposed task
  app.post<{ Body: { taskId: string } }>('/api/operator/reject', async (request, reply) => {
    const { taskId } = request.body;
    const task = mockTasks.find(t => t.taskId === taskId);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found', taskId });
    }
    task.status = 'rejected';
    task.operatorOverride = 'Operator rejected';
    task.completedAt = Date.now() as Timestamp;
    return task;
  });

  // POST /api/operator/reserve — Reserve a sensor for manual control
  app.post<{ Body: { sensorId: string } }>('/api/operator/reserve', async (request, reply) => {
    const { sensorId } = request.body;
    return { ok: true, sensorId, reserved: true };
  });
}
