import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';
import {
  generateReport,
  getReport,
  addSnapshot,
} from '../reports/report-generator.js';

/**
 * REQ-12: Report generation API routes.
 */
export function registerReportRoutes(app: FastifyInstance, engine: LiveEngine) {
  // POST /api/report/generate — Generate a scenario report
  app.post<{
    Body: { format?: 'md'; sections?: string[] };
  }>('/api/report/generate', async (request, reply) => {
    const { format = 'md', sections } = request.body ?? {};

    if (format !== 'md') {
      return reply.code(400).send({ error: 'Only "md" format is currently supported' });
    }

    try {
      const report = generateReport(engine, { format, sections });
      return {
        id: report.id,
        format: report.format,
        generatedAt: report.generatedAt,
        contentLength: report.content.length,
        downloadUrl: `/api/report/download/${report.id}`,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: 'Report generation failed', details: err.message });
    }
  });

  // POST /api/report/snapshot — Accept a map screenshot from the frontend
  app.post<{
    Body: { imageData: string; label: string; timestamp: number };
  }>('/api/report/snapshot', async (request, reply) => {
    const { imageData, label, timestamp } = request.body ?? {};

    if (!imageData || typeof imageData !== 'string') {
      return reply.code(400).send({ error: 'imageData (base64 string) is required' });
    }
    if (!label || typeof label !== 'string') {
      return reply.code(400).send({ error: 'label is required' });
    }

    addSnapshot({
      imageData,
      label,
      timestamp: timestamp ?? Date.now(),
    });

    return { ok: true };
  });

  // GET /api/report/download/:id — Download a generated report
  app.get<{
    Params: { id: string };
  }>('/api/report/download/:id', async (request, reply) => {
    const report = getReport(request.params.id);
    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    const filename = `eloc2-report-${new Date(report.generatedAt).toISOString().slice(0, 10)}.md`;
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return report.content;
  });
}
