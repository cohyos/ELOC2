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

  // POST /api/operator/priority — Add/remove track from operator priority set
  app.post<{ Body: { trackId: string; priority: boolean } }>('/api/operator/priority', async (request, reply) => {
    const { trackId, priority } = request.body;
    if (!trackId) return reply.code(400).send({ error: 'trackId is required' });
    if (priority) {
      engine.addPriorityTrack(trackId);
    } else {
      engine.removePriorityTrack(trackId);
    }
    return { ok: true, trackId, priority, priorityTracks: engine.getPriorityTracks() };
  });

  // POST /api/operator/reserve — Reserve a sensor for manual control
  app.post<{ Body: { sensorId: string } }>('/api/operator/reserve', async (request) => {
    const { sensorId } = request.body;
    const sensor = engine.getState().sensors.find(s => s.sensorId === sensorId);
    if (!sensor) {
      return { ok: false, error: 'Sensor not found' };
    }
    // Cancel any executing tasks for this sensor
    const cancelledTasks = engine.getState().tasks
      .filter(t => t.sensorId === sensorId && t.status === 'executing');
    for (const task of cancelledTasks) {
      task.status = 'rejected' as any;
    }
    return { ok: true, reserved: true, sensorId, cancelledTaskCount: cancelledTasks.length };
  });
}
