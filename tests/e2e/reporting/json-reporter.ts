import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

interface TestEntry {
  id: string;
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  screenshot: string | null;
  error: string | null;
}

interface QaReport {
  timestamp: string;
  baseUrl: string;
  duration_ms: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pass_rate: number;
  };
  suites: Record<string, { total: number; passed: number; failed: number }>;
  tests: TestEntry[];
  screenshots: Record<string, string>;
}

class QaReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime: number = 0;
  private screenshots: Record<string, string> = {};

  onBegin() {
    this.startTime = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const suiteName = test.parent?.title || 'unknown';
    const testId = test.title.match(/^([A-Z]+-\d+)/)?.[1] || test.title;

    let screenshot: string | null = null;
    for (const attachment of result.attachments) {
      if (attachment.contentType?.startsWith('image/') && attachment.path) {
        screenshot = attachment.path;
        this.screenshots[testId] = attachment.path;
      }
    }

    this.tests.push({
      id: testId,
      name: test.title,
      suite: suiteName,
      status: result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed',
      duration_ms: result.duration,
      screenshot,
      error: result.error ? result.error.message || String(result.error) : null,
    });
  }

  onEnd(_result: FullResult) {
    const suites: Record<string, { total: number; passed: number; failed: number }> = {};

    for (const t of this.tests) {
      if (!suites[t.suite]) suites[t.suite] = { total: 0, passed: 0, failed: 0 };
      suites[t.suite].total++;
      if (t.status === 'passed') suites[t.suite].passed++;
      if (t.status === 'failed') suites[t.suite].failed++;
    }

    const passed = this.tests.filter(t => t.status === 'passed').length;
    const failed = this.tests.filter(t => t.status === 'failed').length;
    const skipped = this.tests.filter(t => t.status === 'skipped').length;

    const report: QaReport = {
      timestamp: new Date().toISOString(),
      baseUrl: process.env.BASE_URL || 'http://localhost:3001',
      duration_ms: Date.now() - this.startTime,
      summary: {
        total: this.tests.length,
        passed,
        failed,
        skipped,
        pass_rate: this.tests.length > 0 ? passed / this.tests.length : 0,
      },
      suites,
      tests: this.tests,
      screenshots: this.screenshots,
    };

    const outDir = path.join(process.cwd(), 'tests/e2e/output');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'qa-report.json'), JSON.stringify(report, null, 2));

    console.log(`\nQA Report: ${passed}/${this.tests.length} passed (${(report.summary.pass_rate * 100).toFixed(1)}%)`);
    console.log(`Report saved to tests/e2e/output/qa-report.json`);
  }
}

export default QaReporter;
