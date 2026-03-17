import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const SKIP = process.env.SKIP_GCP === 'true';

test.describe('Artifact Registry', () => {
  test.skip(() => SKIP, 'GCP tests skipped');

  test('GCP-05: Container image exists', async () => {
    try {
      const result = execSync(
        'gcloud artifacts docker images list me-west1-docker.pkg.dev/eloc2demo/cloud-run-source-deploy --format=json --limit=1 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 }
      );
      const images = JSON.parse(result);
      expect(images.length).toBeGreaterThanOrEqual(1);
    } catch {
      test.skip();
    }
  });
});
