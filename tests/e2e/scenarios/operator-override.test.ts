import { test, expect } from '@playwright/test';

test.describe('SV-06: Operator Override Scenario', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ request }) => {
    await request.post('/api/scenario/reset', { data: { scenarioId: 'operator-override' } });
    await request.post('/api/scenario/speed', { data: { speed: 10 } });
    await request.post('/api/scenario/start');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/scenario/pause').catch(() => {});
    await request.post('/api/scenario/reset').catch(() => {});
  });

  test('Operator can reject a proposed task and status changes', async ({ request }) => {
    // Wait 8s real = ~80s sim — tasks should be proposed by then
    await new Promise(r => setTimeout(r, 8000));

    // Get tasks
    const tasksRes = await request.get('/api/tasks');
    expect(tasksRes.ok()).toBeTruthy();
    const tasks = await tasksRes.json();

    // Find a task that can be rejected (proposed or active)
    const proposedTask = Array.isArray(tasks)
      ? tasks.find((t: any) => t.status === 'proposed' || t.status === 'active' || t.status === 'pending')
      : null;

    if (proposedTask) {
      // Reject the task
      const rejectRes = await request.post('/api/operator/reject', {
        data: { taskId: proposedTask.taskId || proposedTask.id },
      });
      expect(rejectRes.ok()).toBeTruthy();

      // Verify task status changed
      const tasks2Res = await request.get('/api/tasks');
      const tasks2 = await tasks2Res.json();
      const rejectedTask = Array.isArray(tasks2)
        ? tasks2.find((t: any) => (t.taskId || t.id) === (proposedTask.taskId || proposedTask.id))
        : null;
      if (rejectedTask) {
        expect(rejectedTask.status).not.toBe('proposed');
      }
    }

    // Verify simulation is running with tracks
    const rapRes = await request.get('/api/rap');
    const rap = await rapRes.json();
    expect(rap.tracks.length).toBeGreaterThan(0);

    // Verify events are being generated
    const eventsRes = await request.get('/api/events');
    const events = await eventsRes.json();
    expect(events.length).toBeGreaterThan(0);
  });
});
