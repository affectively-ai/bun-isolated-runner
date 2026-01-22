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
  --parallel=N           Number of parallel workers (default: ${getOptimalParallelCount()})
  --timeout=N            Per-test timeout in ms (default: 30000)
  --retries=N            Retry failed tests N times (default: 0)
  --verbose, -v          Verbose output
  --cwd=<dir>            Working directory
  --help, -h             Show this help

Examples:
  bun-isolated                          Run all tests
  bun-isolated --changed                Run changed tests only
  bun-isolated src/**/*.test.ts         Run matching tests
  bun-isolated --files a.test.ts b.test.ts
  bun-isolated --parallel=4             Limit parallelism

Environment Variables:
  JOBS=N                 Override parallel count
  BUN_ISOLATED_TIMEOUT   Override timeout
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const patterns: string[] = [];
  const excludePatterns: string[] = [];
  let preloadPath: string | undefined;
  let mode: 'all' | 'changed' | 'files' = 'all';
  let specificFiles: string[] = [];
  let parallel =
    parseInt(process.env['JOBS'] || '', 10) || getOptimalParallelCount();
  let timeout =
    parseInt(process.env['BUN_ISOLATED_TIMEOUT'] || '', 10) || 30000;
  let retries = 0;
  let verbose = false;
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--changed') {
      mode = 'changed';
    } else if (arg === '--preload') {
      if (i + 1 < args.length) {
        preloadPath = args[++i];
      }
    } else if (arg === '--exclude') {
      if (i + 1 < args.length) {
        excludePatterns.push(args[++i]);
      }
    } else if (arg === '--files') {
      mode = 'files';
      // Collect remaining args as files
      specificFiles = args.slice(i + 1).filter((a) => !a.startsWith('-'));
      break;
    } else if (arg.startsWith('--parallel=')) {
      parallel = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--timeout=')) {
      timeout = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--retries=')) {
      retries = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.split('=')[1];
    } else if (
      arg.endsWith('.test.ts') ||
      arg.endsWith('.test.tsx') ||
      arg.endsWith('.spec.ts') ||
      arg.endsWith('.spec.tsx')
    ) {
      // Specific test file passed
      mode = 'files';
      specificFiles.push(arg);
    } else if (!arg.startsWith('-')) {
      patterns.push(arg);
    }
  }

  // Determine files to run
  let files: string[];

  if (mode === 'changed') {
    console.log('🔍 Finding changed test files...');
    files = findChangedTestFiles(cwd);
    if (files.length === 0) {
      console.log('No changed test files found.');
      process.exit(0);
    }
  } else if (mode === 'files' && specificFiles.length > 0) {
    files = specificFiles;
  } else {
    console.log('🔍 Finding test files...');
    const exclude =
      excludePatterns.length > 0
        ? [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            ...excludePatterns,
          ]
        : undefined;
    files = await findTestFiles(patterns.length > 0 ? patterns : undefined, {
      cwd,
      exclude,
    });
  }

  if (files.length === 0) {
    console.log('No test files found.');
    process.exit(0);
  }

  // Run tests
  const config: IsolatedConfig = {
    parallel,
    timeout,
    retries,
    verbose,
    cwd,
    ...(preloadPath && { preloadPath }),
  };

  const results = await runIsolated(files, config);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
