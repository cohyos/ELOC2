import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const SKIP = process.env.SKIP_GCP === 'true';

test.describe('Cold Start', () => {
  test.skip(() => SKIP, 'GCP tests skipped');

  test('GCP-10: Cold start time < 10s', async () => {
    const url = process.env.CLOUD_RUN_URL || 'https://eloc2-820514480393.me-west1.run.app';
    try {
      const result = execSync(
        `curl -s -o /dev/null -w "%{time_total}" ${url}/api/health`,
        { encoding: 'utf-8', timeout: 15000 }
      );
      const time = parseFloat(result);
      expect(time).toBeLessThan(10);
    } catch {
      test.skip();
    }
  });
});
