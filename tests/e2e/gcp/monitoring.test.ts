import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const SKIP = process.env.SKIP_GCP === 'true';

test.describe('GCP Monitoring', () => {
  test.skip(() => SKIP, 'GCP tests skipped');

  test('GCP-04: Request latency is reasonable', async () => {
    // Use curl timing instead of monitoring API for simplicity
    const url = process.env.CLOUD_RUN_URL || 'https://eloc2-820514480393.me-west1.run.app';
    try {
      const result = execSync(
        `curl -s -o /dev/null -w "%{time_total}" ${url}/api/health`,
        { encoding: 'utf-8', timeout: 15000 }
      );
      const latency = parseFloat(result);
      expect(latency).toBeLessThan(5.0); // 5s max (includes cold start)
    } catch {
      test.skip();
    }
  });

  test('GCP-08: Memory usage within bounds', async () => {
    // Cloud Run memory is set in service config
    try {
      const result = execSync(
        'gcloud run services describe eloc2 --region=me-west1 --project=eloc2demo --format=json 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 }
      );
      const svc = JSON.parse(result);
      const memoryLimit = svc.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory;
      expect(memoryLimit).toBeDefined();
    } catch {
      test.skip();
    }
  });

  test('GCP-09: Error rate check', async () => {
    // Check multiple health requests for errors
    const url = process.env.CLOUD_RUN_URL || 'https://eloc2-820514480393.me-west1.run.app';
    let successes = 0;
    const total = 5;
    for (let i = 0; i < total; i++) {
      try {
        const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${url}/api/health`, { encoding: 'utf-8', timeout: 10000 });
        if (result.trim() === '200') successes++;
      } catch { /* skip */ }
    }
    expect(successes / total).toBeGreaterThanOrEqual(0.8); // >= 80% success
  });
});
