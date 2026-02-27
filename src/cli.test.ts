import { describe, expect, it } from 'bun:test';
import { parseCliArgs } from './cli';

describe('cli parseCliArgs', () => {
  it('applies environment defaults', () => {
    const parsed = parseCliArgs(
      [],
      {
        JOBS: '7',
        BUN_ISOLATED_TIMEOUT: '45000',
        BUN_ISOLATED_STICKY: 'true',
      },
      '/tmp/workspace'
    );

    expect(parsed.parallel).toBe(7);
    expect(parsed.timeout).toBe(45000);
    expect(parsed.stickyPassEnabled).toBe(true);
    expect(parsed.cwd).toBe('/tmp/workspace');
    expect(parsed.mode).toBe('all');
  });

  it('parses mixed flags into structured args', () => {
    const parsed = parseCliArgs(
      [
        '--changed',
        '--exclude',
        'dist',
        '--testPathPattern',
        'shared-ui/services',
        '--testPathPattern=shared-utils/hooks',
        '--parallel=3',
        '--timeout',
        '40000',
        '--retries=2',
        '--bail',
        '--max-failures',
        '5',
        '--telemetry-log',
        'tmp/telemetry.jsonl',
        '--no-telemetry',
        '--sticky-pass-file=tmp/sticky.json',
        '--sticky-pass-reset',
        '--verbose',
        '--cwd=/tmp/override',
        'src/**',
      ],
      {},
      '/tmp/default'
    );

    expect(parsed.mode).toBe('changed');
    expect(parsed.excludePatterns).toEqual(['dist']);
    expect(parsed.testPathPatterns).toEqual([
      'shared-ui/services',
      'shared-utils/hooks',
    ]);
    expect(parsed.parallel).toBe(3);
    expect(parsed.timeout).toBe(40000);
    expect(parsed.retries).toBe(2);
    expect(parsed.bail).toBe(true);
    expect(parsed.maxFailures).toBe(5);
    expect(parsed.telemetryEnabled).toBe(false);
    expect(parsed.telemetryLogPath).toBe('tmp/telemetry.jsonl');
    expect(parsed.stickyPassEnabled).toBe(true);
    expect(parsed.stickyPassCachePath).toBe('tmp/sticky.json');
    expect(parsed.stickyPassReset).toBe(true);
    expect(parsed.verbose).toBe(true);
    expect(parsed.cwd).toBe('/tmp/override');
    expect(parsed.patterns).toEqual(['src/**']);
  });

  it('parses --files mode by collecting remaining non-flag args', () => {
    const parsed = parseCliArgs([
      '--files',
      'a.test.ts',
      '--flag-that-should-be-ignored-here',
      'b.spec.ts',
    ]);

    expect(parsed.mode).toBe('files');
    expect(parsed.specificFiles).toEqual(['a.test.ts', 'b.spec.ts']);
  });

  it('treats explicit test file args as files mode', () => {
    const parsed = parseCliArgs(['shared-ui/foo.test.ts', 'shared-utils/bar.spec.ts']);

    expect(parsed.mode).toBe('files');
    expect(parsed.specificFiles).toEqual([
      'shared-ui/foo.test.ts',
      'shared-utils/bar.spec.ts',
    ]);
  });

  it('keeps maxFailures undefined when value is missing', () => {
    const parsed = parseCliArgs(['--max-failures']);
    expect(parsed.maxFailures).toBeUndefined();
  });
});
