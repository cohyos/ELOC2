#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';

const reportPath = path.join(process.cwd(), 'tests/e2e/output/qa-report.json');

if (!fs.existsSync(reportPath)) {
  console.error('No qa-report.json found. Run tests first.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

function generatePieChart(passed: number, failed: number, skipped: number): string {
  const total = passed + failed + skipped;
  if (total === 0) return '';
  const passAngle = (passed / total) * 360;
  const failAngle = (failed / total) * 360;
  return `
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="50" fill="none" stroke="#00cc44" stroke-width="20"
        stroke-dasharray="${passAngle * 0.873} ${360 * 0.873}"
        transform="rotate(-90 60 60)" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="#ff3333" stroke-width="20"
        stroke-dasharray="${failAngle * 0.873} ${360 * 0.873}"
        stroke-dashoffset="${-passAngle * 0.873}"
        transform="rotate(-90 60 60)" />
      ${skipped > 0 ? `<circle cx="60" cy="60" r="50" fill="none" stroke="#888" stroke-width="20"
        stroke-dasharray="${(skipped / total * 360) * 0.873} ${360 * 0.873}"
        stroke-dashoffset="${-(passAngle + failAngle) * 0.873}"
        transform="rotate(-90 60 60)" />` : ''}
      <text x="60" y="65" text-anchor="middle" fill="white" font-size="18" font-weight="bold">
        ${(report.summary.pass_rate * 100).toFixed(0)}%
      </text>
    </svg>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ELOC2 QA Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d0d1a; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; padding: 20px; }
    h1 { color: #4a9eff; margin-bottom: 10px; }
    .summary { display: flex; gap: 30px; align-items: center; margin: 20px 0; padding: 20px; background: #141425; border: 1px solid #2a2a3e; border-radius: 8px; }
    .stat { text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #888; text-transform: uppercase; }
    .suite { margin: 15px 0; border: 1px solid #2a2a3e; border-radius: 8px; overflow: hidden; }
    .suite-header { padding: 12px 16px; background: #1a1a2e; cursor: pointer; display: flex; justify-content: space-between; }
    .suite-header:hover { background: #222240; }
    .suite-body { display: none; }
    .suite-body.open { display: block; }
    .test-row { padding: 8px 16px; border-top: 1px solid #2a2a3e; display: flex; justify-content: space-between; align-items: center; }
    .test-row:hover { background: #1a1a2e; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .passed { background: #00cc44; color: #000; }
    .failed { background: #ff3333; color: #fff; }
    .skipped { background: #888; color: #fff; }
    .error-detail { padding: 8px 16px; background: #1a0000; color: #ff6666; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    .meta { color: #888; font-size: 13px; margin: 5px 0; }
    .screenshot { max-width: 400px; border: 1px solid #2a2a3e; border-radius: 4px; margin: 8px 16px; }
  </style>
</head>
<body>
  <h1>ELOC2 QA Report</h1>
  <div class="meta">Generated: ${report.timestamp} | Base URL: ${report.baseUrl} | Duration: ${(report.duration_ms / 1000).toFixed(1)}s</div>

  <div class="summary">
    ${generatePieChart(report.summary.passed, report.summary.failed, report.summary.skipped)}
    <div class="stat"><div class="stat-value" style="color: #e0e0e0">${report.summary.total}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-value" style="color: #00cc44">${report.summary.passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat"><div class="stat-value" style="color: #ff3333">${report.summary.failed}</div><div class="stat-label">Failed</div></div>
    <div class="stat"><div class="stat-value" style="color: #888">${report.summary.skipped}</div><div class="stat-label">Skipped</div></div>
  </div>

  ${Object.entries(report.suites).map(([name, suite]: [string, any]) => `
    <div class="suite">
      <div class="suite-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span>${escapeHtml(name)} (${suite.passed}/${suite.total})</span>
        <span class="badge ${suite.failed > 0 ? 'failed' : 'passed'}">${suite.failed > 0 ? 'FAIL' : 'PASS'}</span>
      </div>
      <div class="suite-body">
        ${report.tests.filter((t: any) => t.suite === name).map((t: any) => `
          <div class="test-row">
            <span>${escapeHtml(t.id)}: ${escapeHtml(t.name)}</span>
            <span><span class="badge ${t.status}">${t.status.toUpperCase()}</span> ${t.duration_ms}ms</span>
          </div>
          ${t.error ? `<div class="error-detail">${escapeHtml(t.error)}</div>` : ''}
          ${t.screenshot ? `<img class="screenshot" src="${escapeHtml(t.screenshot)}" alt="Screenshot" />` : ''}
        `).join('')}
      </div>
    </div>
  `).join('')}

  <script>
    // Auto-open suites with failures
    document.querySelectorAll('.suite').forEach(s => {
      if (s.querySelector('.badge.failed')) {
        s.querySelector('.suite-body')?.classList.add('open');
      }
    });
  </script>
</body>
</html>`;

const outPath = path.join(process.cwd(), 'tests/e2e/output/qa-report.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log(`HTML dashboard saved to ${outPath}`);
