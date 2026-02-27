#!/usr/bin/env node
/**
 * CLI for bun-isolated-runner
 * Cross-platform (Windows, macOS, Linux)
 *
 * @license MIT
 */

import {
  findTestFiles,
  findChangedTestFiles,
  runIsolated,
  getOptimalParallelCount,
  type IsolatedConfig,
} from './index.js';
import { parseTestPathPatternFlag } from './test-path-patterns.js';

type CliMode = 'all' | 'changed' | 'files';

interface ParsedCliArgs {
  help: boolean;
  patterns: string[];
  excludePatterns: string[];
  preloadPath?: string;
  mode: CliMode;
  specificFiles: string[];
  testPathPatterns: string[];
  parallel: number;
  timeout: number;
  retries: number;
  bail: boolean;
  maxFailures?: number;
  telemetryEnabled: boolean;
  telemetryLogPath?: string;
  stickyPassEnabled: boolean;
  stickyPassCachePath?: string;
  stickyPassReset: boolean;
  verbose: boolean;
  cwd: string;
}

function parseNumberWithFallback(
  current: number,
  rawValue: string | undefined
): number {
  if (!rawValue) return current;
  const parsed = parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : current;
}

function parseOptionalNumberWithFallback(
  current: number | undefined,
  rawValue: string | undefined
): number | undefined {
  if (!rawValue) return current;
  const parsed = parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : current;
}

function isExplicitTestFileArg(arg: string): boolean {
  return (
    arg.endsWith('.test.ts') ||
    arg.endsWith('.test.tsx') ||
    arg.endsWith('.spec.ts') ||
    arg.endsWith('.spec.tsx')
  );
}

export function parseCliArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  defaultCwd: string = process.cwd()
): ParsedCliArgs {
  const stickyEnvValue = env['BUN_ISOLATED_STICKY'];
  const parsed: ParsedCliArgs = {
    help: false,
    patterns: [],
    excludePatterns: [],
    mode: 'all',
    specificFiles: [],
    testPathPatterns: [],
    parallel: parseNumberWithFallback(
      getOptimalParallelCount(),
      env['JOBS']
    ),
    timeout: parseNumberWithFallback(30000, env['BUN_ISOLATED_TIMEOUT']),
    retries: 0,
    bail: false,
    telemetryEnabled: true,
    stickyPassEnabled: stickyEnvValue === '1' || stickyEnvValue === 'true',
    stickyPassReset: false,
    verbose: false,
    cwd: defaultCwd,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--changed') {
      parsed.mode = 'changed';
      continue;
    }

    if (arg === '--preload') {
      if (i + 1 < args.length) {
        parsed.preloadPath = args[++i];
      }
      continue;
    }

    if (arg === '--exclude') {
      if (i + 1 < args.length) {
        parsed.excludePatterns.push(args[++i]);
      }
      continue;
    }

    const parsedTestPathPatternFlag = parseTestPathPatternFlag(args, i);
    if (parsedTestPathPatternFlag) {
      parsed.testPathPatterns.push(...parsedTestPathPatternFlag.patterns);
      i += parsedTestPathPatternFlag.consumedArgs - 1;
      continue;
    }

    if (arg === '--files') {
      parsed.mode = 'files';
      parsed.specificFiles = args.slice(i + 1).filter((a) => !a.startsWith('-'));
      break;
    }

    if (arg.startsWith('--parallel=')) {
      parsed.parallel = parseNumberWithFallback(
        parsed.parallel,
        arg.split('=').slice(1).join('=')
      );
      continue;
    }

    if (arg === '--parallel' || arg === '--workers') {
      parsed.parallel = parseNumberWithFallback(parsed.parallel, args[i + 1]);
      i++;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      parsed.timeout = parseNumberWithFallback(
        parsed.timeout,
        arg.split('=').slice(1).join('=')
      );
      continue;
    }

    if (arg === '--timeout') {
      parsed.timeout = parseNumberWithFallback(parsed.timeout, args[i + 1]);
      i++;
      continue;
    }

    if (arg.startsWith('--retries=')) {
      parsed.retries = parseNumberWithFallback(
        parsed.retries,
        arg.split('=').slice(1).join('=')
      );
      continue;
    }

    if (arg === '--retries') {
      parsed.retries = parseNumberWithFallback(parsed.retries, args[i + 1]);
      i++;
      continue;
    }

    if (arg === '--bail') {
      parsed.bail = true;
      continue;
    }

    if (arg.startsWith('--max-failures=')) {
      parsed.maxFailures = parseOptionalNumberWithFallback(
        parsed.maxFailures,
        arg.split('=').slice(1).join('=')
      );
      continue;
    }

    if (arg === '--max-failures') {
      parsed.maxFailures = parseOptionalNumberWithFallback(
        parsed.maxFailures,
        args[i + 1]
      );
      i++;
      continue;
    }

    if (arg.startsWith('--telemetry-log=')) {
      parsed.telemetryLogPath = arg.split('=').slice(1).join('=');
      continue;
    }

    if (arg === '--telemetry-log') {
      if (i + 1 < args.length) {
        parsed.telemetryLogPath = args[++i];
      }
      continue;
    }

    if (arg === '--no-telemetry') {
      parsed.telemetryEnabled = false;
      continue;
    }

    if (arg === '--sticky-pass') {
      parsed.stickyPassEnabled = true;
      continue;
    }

    if (arg === '--no-sticky-pass') {
      parsed.stickyPassEnabled = false;
      continue;
    }

    if (arg === '--sticky-pass-reset') {
      parsed.stickyPassEnabled = true;
      parsed.stickyPassReset = true;
      continue;
    }

    if (arg.startsWith('--sticky-pass-file=')) {
      parsed.stickyPassCachePath = arg.split('=').slice(1).join('=');
      continue;
    }

    if (arg === '--sticky-pass-file') {
      if (i + 1 < args.length) {
        parsed.stickyPassCachePath = args[++i];
      }
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      const parsedCwd = arg.split('=').slice(1).join('=');
      if (parsedCwd.length > 0) {
        parsed.cwd = parsedCwd;
      }
      continue;
    }

    if (isExplicitTestFileArg(arg)) {
      parsed.mode = 'files';
      parsed.specificFiles.push(arg);
      continue;
    }

    if (!arg.startsWith('-')) {
      parsed.patterns.push(arg);
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
bun-isolated - Run Bun tests in isolated subprocesses

Usage:
  bun-isolated [options] [patterns...]

Options:
  --changed              Run only changed test files (git diff)
  --files <files...>     Run specific test files
  --preload <path>       Preload script (e.g. bun.preload.ts); overrides auto-detect
  --exclude <pattern>    Exclude paths containing this (repeatable)
  --testPathPattern=<p>  Only run files whose path matches expression (repeatable)
  --parallel=N           Number of parallel workers (default: ${getOptimalParallelCount()})
  --timeout=N            Per-test timeout in ms (default: 30000)
  --retries=N            Retry failed tests N times (default: 0)
  --bail                 Stop scheduling after first failed file
  --max-failures=N       Stop scheduling after N failed files
  --telemetry-log=<path> Write JSONL telemetry (default: .build-logs/bun-isolated-runner.jsonl)
  --no-telemetry         Disable telemetry logging
  --sticky-pass          Skip unchanged files that previously passed
  --no-sticky-pass       Disable sticky-pass caching
  --sticky-pass-file=<p> Sticky-pass JSON cache path (default: .build-logs/bun-isolated-sticky.json)
  --sticky-pass-reset    Delete sticky-pass cache before running
  --verbose, -v          Verbose output
  --cwd=<dir>            Working directory
  --help, -h             Show this help

Examples:
  bun-isolated                          Run all tests
  bun-isolated --changed                Run changed tests only
  bun-isolated src/**/*.test.ts         Run matching tests
  bun-isolated --files a.test.ts b.test.ts
  bun-isolated --testPathPattern=shared-ui/services
  bun-isolated --parallel=4             Limit parallelism
  bun-isolated --bail                   Fail fast after first failed file
  bun-isolated --sticky-pass            Enable sticky pass caching
  bun-isolated --telemetry-log=.build-logs/isolated.jsonl

Environment Variables:
  JOBS=N                 Override parallel count
  BUN_ISOLATED_TIMEOUT   Override timeout
  BUN_ISOLATED_STICKY=1  Enable sticky pass caching by default
`);
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  // Determine files to run
  let files: string[];

  if (parsed.mode === 'changed') {
    console.log('🔍 Finding changed test files...');
    files = findChangedTestFiles(parsed.cwd);
    if (files.length === 0) {
      console.log('No changed test files found.');
      process.exit(0);
    }
  } else if (parsed.mode === 'files' && parsed.specificFiles.length > 0) {
    files = parsed.specificFiles;
  } else {
    console.log('🔍 Finding test files...');
    const exclude =
      parsed.excludePatterns.length > 0
        ? [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            ...parsed.excludePatterns,
          ]
        : undefined;
    files = await findTestFiles(
      parsed.patterns.length > 0 ? parsed.patterns : undefined,
      {
        cwd: parsed.cwd,
        exclude,
      }
    );
  }

  if (files.length === 0) {
    console.log('No test files found.');
    process.exit(0);
  }

  // Run tests
  const config: IsolatedConfig = {
    parallel: parsed.parallel,
    timeout: parsed.timeout,
    retries: parsed.retries,
    bail: parsed.bail,
    maxFailures: parsed.maxFailures,
    telemetryEnabled: parsed.telemetryEnabled,
    telemetryLogPath: parsed.telemetryLogPath,
    stickyPassEnabled: parsed.stickyPassEnabled,
    stickyPassCachePath: parsed.stickyPassCachePath,
    stickyPassReset: parsed.stickyPassReset,
    testPathPatterns: parsed.testPathPatterns,
    verbose: parsed.verbose,
    cwd: parsed.cwd,
    ...(parsed.preloadPath && { preloadPath: parsed.preloadPath }),
  };

  const results = await runIsolated(files, config);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main, printHelp };
