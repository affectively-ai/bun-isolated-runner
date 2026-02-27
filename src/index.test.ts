import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  filterTestsByPathPattern,
  getOptimalParallelCount,
  runIsolated,
} from './index';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bun-isolated-runner-'));
  tempDirs.push(dir);
  return dir;
}

function writePassingTestFile(cwd: string, fileName: string): void {
  writeFileSync(
    join(cwd, fileName),
    `
      import { expect, test } from 'bun:test';

      test('passes', () => {
        expect(1).toBe(1);
      });
    `,
    { encoding: 'utf8' }
  );
}

function writeFailingTestFile(cwd: string, fileName: string): void {
  writeFileSync(
    join(cwd, fileName),
    `
      import { expect, test } from 'bun:test';

      test('fails', () => {
        expect(1).toBe(2);
      });
    `,
    { encoding: 'utf8' }
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { force: true, recursive: true });
  }
});

describe('bun-isolated-runner', () => {
  it('returns a safe positive parallel default', () => {
    expect(getOptimalParallelCount()).toBeGreaterThan(0);
  });

  it('stops early when max failures is reached', async () => {
    const cwd = createTempDir();
    writeFailingTestFile(cwd, 'a-fail.test.ts');
    writePassingTestFile(cwd, 'b-pass.test.ts');

    const results = await runIsolated(['a-fail.test.ts', 'b-pass.test.ts'], {
      cwd,
      maxFailures: 1,
      parallel: 1,
      telemetryEnabled: false,
      timeout: 20_000,
    });

    expect(results.stoppedEarly).toBeTrue();
    expect(results.results.length).toBe(1);
    expect(results.results[0]?.file).toBe('a-fail.test.ts');
  });

  it('writes telemetry when enabled', async () => {
    const cwd = createTempDir();
    writePassingTestFile(cwd, 'pass.test.ts');
    const telemetryPath = join(cwd, '.build-logs', 'metrics.jsonl');

    const results = await runIsolated(['pass.test.ts'], {
      cwd,
      parallel: 1,
      telemetryEnabled: true,
      telemetryLogPath: telemetryPath,
      timeout: 20_000,
    });

    expect(results.failed).toBe(0);
    expect(existsSync(telemetryPath)).toBeTrue();

    const telemetryLine = readFileSync(telemetryPath, 'utf8').trim();
    expect(telemetryLine.length).toBeGreaterThan(0);

    const telemetry = JSON.parse(telemetryLine) as {
      discoveredFiles: number;
      executedFiles: number;
      stickyHits: number;
      durationMs: number;
      p50Ms: number;
      p95Ms: number;
      filesPerSecond: number;
    };

    expect(telemetry.discoveredFiles).toBe(1);
    expect(telemetry.executedFiles).toBe(1);
    expect(telemetry.stickyHits).toBe(0);
    expect(telemetry.durationMs).toBeGreaterThan(0);
    expect(telemetry.p50Ms).toBeGreaterThanOrEqual(0);
    expect(telemetry.p95Ms).toBeGreaterThanOrEqual(0);
    expect(telemetry.filesPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('reuses sticky-pass cache for unchanged passing files', async () => {
    const cwd = createTempDir();
    writePassingTestFile(cwd, 'pass.test.ts');
    const stickyPath = join(cwd, '.build-logs', 'sticky-pass.json');

    const first = await runIsolated(['pass.test.ts'], {
      cwd,
      parallel: 1,
      telemetryEnabled: false,
      stickyPassEnabled: true,
      stickyPassCachePath: stickyPath,
      timeout: 20_000,
    });
    expect(first.failed).toBe(0);

    const second = await runIsolated(['pass.test.ts'], {
      cwd,
      parallel: 1,
      telemetryEnabled: false,
      stickyPassEnabled: true,
      stickyPassCachePath: stickyPath,
      timeout: 20_000,
    });

    expect(second.failed).toBe(0);
    expect(second.results.length).toBe(1);
    expect(second.results[0]?.cached).toBeTrue();
    expect(existsSync(stickyPath)).toBeTrue();
  });

  it('filters file paths with substring and regex testPathPatterns', () => {
    const files = [
      'shared-ui/src/services/authService.test.ts',
      'shared-ui/src/hooks/useTranslation.test.ts',
      'shared-utils/src/logger.test.ts',
    ];

    const filtered = filterTestsByPathPattern(files, [
      'shared-ui/src/services',
      '^shared-utils/src/.*\\.test\\.ts$',
    ]);

    expect(filtered).toEqual([
      'shared-ui/src/services/authService.test.ts',
      'shared-utils/src/logger.test.ts',
    ]);
  });

  it('applies testPathPatterns during isolated execution', async () => {
    const cwd = createTempDir();
    writePassingTestFile(cwd, 'service-pass.test.ts');
    writeFailingTestFile(cwd, 'hook-fail.test.ts');

    const results = await runIsolated(
      ['service-pass.test.ts', 'hook-fail.test.ts'],
      {
        cwd,
        parallel: 1,
        telemetryEnabled: false,
        timeout: 20_000,
        testPathPatterns: ['service-pass'],
      }
    );

    expect(results.failed).toBe(0);
    expect(results.results.length).toBe(1);
    expect(results.results[0]?.file).toBe('service-pass.test.ts');
  });
});
