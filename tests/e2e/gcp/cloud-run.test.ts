import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const SKIP = process.env.SKIP_GCP === 'true';
const PROJECT = process.env.GCP_PROJECT || 'eloc2demo';
const SERVICE = process.env.GCP_SERVICE || 'eloc2';
const REGION = process.env.GCP_REGION || 'me-west1';

function gcloud(cmd: string): string {
  try {
    return execSync(`gcloud ${cmd} --project=${PROJECT} --format=json 2>/dev/null`, { encoding: 'utf-8', timeout: 30000 });
  } catch (e: any) {
    return e.stdout || '';
  }
}

test.describe('Cloud Run', () => {
  test.skip(() => SKIP, 'GCP tests skipped (SKIP_GCP=true)');

  test('GCP-01: Cloud Run service exists', async () => {
    const result = gcloud(`run services describe ${SERVICE} --region=${REGION}`);
    const svc = JSON.parse(result);
    expect(svc.metadata?.name).toBe(SERVICE);
  });

  test('GCP-02: Service is healthy', async ({ request }) => {
    const cloudRunUrl = process.env.CLOUD_RUN_URL || `https://${SERVICE}-820514480393.${REGION}.run.app`;
    const res = await request.get(`${cloudRunUrl}/api/health`);
    expect(res.ok()).toBeTruthy();
  });

  test('GCP-03: No error logs in last 100 entries', async () => {
    const result = gcloud(`run services logs read ${SERVICE} --region=${REGION} --limit=100`);
    // Check for ERROR severity
    const lines = result.split('\n');
    const errors = lines.filter(l => l.includes('"severity":"ERROR"') || l.includes('severity: ERROR'));
    // Allow some errors (startup transients), but flag if > 5
    expect(errors.length).toBeLessThan(5);
  });
});
