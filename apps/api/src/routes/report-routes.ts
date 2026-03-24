import type { FastifyInstance } from 'fastify';
import type { LiveEngine } from '../simulation/live-engine.js';
import {
  generateReport,
  getReport,
  addSnapshot,
} from '../reports/report-generator.js';
import { markdownToPdf } from '../reports/pdf-generator.js';

/**
 * REQ-12 / REQ-19: Report generation API routes.
 * Always generates PDF. Supports operator and instructor report types with optional time-range filtering.
 */
export function registerReportRoutes(app: FastifyInstance, engine: LiveEngine) {
  // POST /api/report/generate — Generate a scenario report as PDF download
  app.post<{
    Body: {
      type?: 'operator' | 'instructor';
      timeRange?: { from: number; to: number };
      sections?: string[];
    };
  }>('/api/report/generate', async (request, reply) => {
    const { type = 'operator', timeRange, sections } = request.body ?? {};

    if (type !== 'operator' && type !== 'instructor') {
      return reply.code(400).send({ error: 'Supported types: "operator", "instructor"' });
    }

    try {
      const report = generateReport(engine, { type, timeRange, sections });
      const pdfBuffer = await markdownToPdf(report.content);

      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `ELOC2_Report_${ts}.pdf`;

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return pdfBuffer;
    } catch (err: any) {
      app.log.error(err, 'Report generation failed');
      return reply.code(500).send({ error: 'Report generation failed' });
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
    // Cap snapshot size at 5MB to prevent memory exhaustion
    if (imageData.length > 5 * 1024 * 1024) {
      return reply.code(413).send({ error: 'imageData exceeds 5MB limit' });
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

  // GET /api/report/download/:id — Download a previously generated report as PDF (fallback)
  app.get<{
    Params: { id: string };
  }>('/api/report/download/:id', async (request, reply) => {
    const report = getReport(request.params.id);
    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    try {
      const pdfBuffer = await markdownToPdf(report.content);
      const filename = `eloc2-report-${new Date(report.generatedAt).toISOString().slice(0, 10)}.pdf`;
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return pdfBuffer;
    } catch (err: any) {
      return reply.code(500).send({ error: 'PDF generation failed', details: err.message });
    }
  });
}
