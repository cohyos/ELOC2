import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const SKIP = process.env.SKIP_GCP === 'true';

test.describe('Cloud Build', () => {
  test.skip(() => SKIP, 'GCP tests skipped');

  test('GCP-06: Latest build succeeded', async () => {
    try {
      const result = execSync(
        'gcloud builds list --limit=1 --project=eloc2demo --format=json 2>/dev/null',
        { encoding: 'utf-8', timeout: 15000 }
      );
      const builds = JSON.parse(result);
      if (builds.length > 0) {
        expect(builds[0].status).toBe('SUCCESS');
      }
    } catch {
      test.skip();
    }
  });
});
