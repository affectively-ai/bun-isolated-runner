/**
 * @affectively/bun-isolated-runner
 *
 * Run Bun tests in isolated subprocesses to prevent mock pollution.
 * Cross-platform (Windows, macOS, Linux) support.
 *
 * @license MIT
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface IsolatedConfig {
  /** Test file patterns to include */
  include?: string[];
  /** Patterns to exclude */
  exclude?: string[];
  /** Number of parallel workers (default: CPU count / 2, max 4) */
  parallel?: number;
  /** Per-test timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retries for failed tests (default: 0) */
  retries?: number;
  /** Environment variables */
  env?: Record<string, string>;
  /** Reporter type */
  reporter?: 'default' | 'json' | 'junit';
  /** Verbose output */
  verbose?: boolean;
  /** Path to bun.preload.ts (auto-detected if not specified) */
  preloadPath?: string;
  /** Working directory */
  cwd?: string;
}

export interface TestResult {
  file: string;
  passed: boolean;
  passCount: number;
  failCount: number;
  skipCount: number;
  duration: number;
  output: string;
  error?: string;
}

export interface RunResults {
  passed: number;
  failed: number;
  skipped: number;
  totalTests: number;
  duration: number;
  results: TestResult[];
}

// ============================================================================
// Cross-Platform Utilities
// ============================================================================

/**
 * Get platform-appropriate path separator
 */
function normalizePath(p: string): string {
  return p.replace(/[/\\]+/g, path.sep);
}

/**
 * Find files matching patterns (cross-platform)
 */
export async function findTestFiles(
  patterns: string | string[] = [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
  ],
  options: { exclude?: string[]; cwd?: string } = {},
): Promise<string[]> {
  const {
    exclude = ['**/node_modules/**', '**/dist/**', '**/build/**'],
    cwd = process.cwd(),
  } = options;
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];
  const files: string[] = [];

  // Walk directory and match patterns
  const walkDir = (dir: string): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(cwd, fullPath);

        // Check exclusions
        const isExcluded = exclude.some((pattern) => {
          if (pattern.includes('*')) {
            return relativePath.includes(
              pattern.replace(/\*\*/g, '').replace(/\*/g, ''),
            );
          }
          return relativePath.includes(pattern);
        });

        if (isExcluded) continue;

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          // Check if matches test patterns
          const isTestFile = patternArray.some((pattern) => {
            if (pattern.includes('*')) {
              const ext = pattern.split('*').pop() || '';
              return entry.name.endsWith(ext);
            }
            return entry.name === pattern;
          });

          if (isTestFile) {
            files.push(relativePath);
          }
        }
      }
    } catch {
      // Directory not accessible, skip
    }
  };

  walkDir(cwd);
  return files.sort();
}

/**
 * Find bun.preload.ts in common locations
 */
export function findPreloadPath(
  cwd: string = process.cwd(),
): string | undefined {
  const candidates = [
    path.join(cwd, 'bun.preload.ts'),
    path.join(cwd, '..', 'bun.preload.ts'),
    path.join(cwd, '..', '..', 'bun.preload.ts'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Get optimal parallel count
 */
export function getOptimalParallelCount(): number {
  const cpuCount = os.cpus().length;
  // Use half CPUs, min 1, max 4 to prevent memory exhaustion
  return Math.min(4, Math.max(1, Math.floor(cpuCount / 2)));
}

// ============================================================================
// Test Execution
// ============================================================================

/**
 * Parse test output to extract counts
 */
function parseTestOutput(output: string): {
  pass: number;
  fail: number;
  skip: number;
} {
  const passMatch = output.match(/(\d+)\s*pass/i);
  const failMatch = output.match(/(\d+)\s*fail/i);
  const skipMatch = output.match(/(\d+)\s*skip/i);

  return {
    pass: passMatch ? parseInt(passMatch[1], 10) : 0,
    fail: failMatch ? parseInt(failMatch[1], 10) : 0,
    skip: skipMatch ? parseInt(skipMatch[1], 10) : 0,
  };
}

/**
 * Run a single test file in an isolated subprocess
 */
export async function runTestFile(
  file: string,
  options: IsolatedConfig = {},
): Promise<TestResult> {
  const {
    timeout = 30000,
    env = {},
    verbose = false,
    preloadPath,
    cwd = process.cwd(),
  } = options;

  const startTime = Date.now();
  const absolutePath = path.isAbsolute(file) ? file : path.join(cwd, file);
  const relativePath = path.relative(cwd, absolutePath);

  // Ensure path starts with ./ for bun test
  const testPath = relativePath.startsWith('.')
    ? relativePath
    : `.${path.sep}${relativePath}`;

  return new Promise((resolve) => {
    const args = ['test'];

    // Add preload if available (Bun uses --preload for test, not -r)
    if (preloadPath) {
      args.push('--preload', preloadPath);
    }

    args.push('--timeout', String(timeout), testPath);

    // Use bun on all platforms
    const command = process.platform === 'win32' ? 'bun.exe' : 'bun';

    // FORCE_COLOR=1 and remove NO_COLOR to avoid Node.js warnings in child
    const spawnEnv = { ...process.env, ...env, FORCE_COLOR: '1' };
    delete (spawnEnv as Record<string, unknown>)['NO_COLOR'];

    const proc: ChildProcess = spawn(command, args, {
      env: spawnEnv,
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32', // Use shell on Windows
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Timeout handling
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout + 5000);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (verbose) process.stdout.write(data);
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (verbose) process.stderr.write(data);
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const { pass, fail, skip } = parseTestOutput(stdout);

      resolve({
        file,
        passed: code === 0 && !timedOut,
        passCount: pass,
        failCount: fail,
        skipCount: skip,
        duration,
        output: stdout,
        error: timedOut
          ? 'Test timed out'
          : code !== 0
            ? stderr || `Exit code: ${code}`
            : undefined,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      resolve({
        file,
        passed: false,
        passCount: 0,
        failCount: 1,
        skipCount: 0,
        duration,
        output: stdout,
        error: err.message,
      });
    });
  });
}

/**
 * Run tests in parallel with worker pool
 */
async function runParallel(
  files: string[],
  concurrency: number,
  options: IsolatedConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const queue = [...files];
  const total = files.length;
  let completed = 0;

  const runNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) break;

      const result = await runTestFile(file, options);
      results.push(result);
      completed++;

      // Print progress
      const status = result.passed ? '✓' : '✗';
      const color = result.passed ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log(
        `[${completed}/${total}] ${color}${status}${reset} ${result.file}: ` +
          `${result.passCount} pass, ${result.failCount} fail, ${result.skipCount} skip ` +
          `(${result.duration}ms)`,
      );
    }
  };

  // Start workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, files.length); i++) {
    workers.push(runNext());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Run all test files in isolated subprocesses
 */
export async function runIsolated(
  files: string[],
  options: IsolatedConfig = {},
): Promise<RunResults> {
  const {
    parallel = getOptimalParallelCount(),
    retries = 0,
    cwd = process.cwd(),
    preloadPath = findPreloadPath(cwd),
  } = options;

  const startTime = Date.now();

  console.log(`\n🧪 Running ${files.length} test files in isolation`);
  console.log(
    `   Workers: ${parallel} | Platform: ${process.platform} | Preload: ${
      preloadPath ? 'yes' : 'no'
    }\n`,
  );
  console.log('─'.repeat(60));

  const resolvedOptions = { ...options, parallel, preloadPath, cwd };
  let results = await runParallel(files, parallel, resolvedOptions);

  // Retry failed tests
  if (retries > 0) {
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.log(`\n🔄 Retrying ${failed.length} failed tests...\n`);
      const retryResults = await runParallel(
        failed.map((r) => r.file),
        parallel,
        resolvedOptions,
      );

      // Replace results for retried tests
      for (const retry of retryResults) {
        const idx = results.findIndex((r) => r.file === retry.file);
        if (idx >= 0) results[idx] = retry;
      }
    }
  }

  // Calculate totals
  const totalPass = results.reduce((sum, r) => sum + r.passCount, 0);
  const totalFail = results.reduce((sum, r) => sum + r.failCount, 0);
  const totalSkip = results.reduce((sum, r) => sum + r.skipCount, 0);
  const filesWithFailures = results.filter((r) => !r.passed).length;

  console.log('\n' + '─'.repeat(60));
  console.log('FINAL TOTALS:');
  console.log('─'.repeat(60));
  console.log(`\x1b[32m✓ ${totalPass} pass\x1b[0m`);
  if (totalFail > 0) {
    console.log(`\x1b[31m✗ ${totalFail} fail\x1b[0m`);
  }
  if (totalSkip > 0) {
    console.log(`\x1b[33m⊘ ${totalSkip} skip\x1b[0m`);
  }
  console.log(`Duration: ${Date.now() - startTime}ms`);
  console.log('─'.repeat(60));

  if (filesWithFailures > 0) {
    console.log('\n❌ Tests failed');
  } else {
    console.log('\n✅ All tests passed');
  }

  return {
    passed: totalPass,
    failed: totalFail,
    skipped: totalSkip,
    totalTests: totalPass + totalFail + totalSkip,
    duration: Date.now() - startTime,
    results,
  };
}

/**
 * Find changed test files using git
 */
export function findChangedTestFiles(cwd: string = process.cwd()): string[] {
  try {
    const { execSync } = require('child_process');
    const output = execSync('git diff --name-only HEAD', {
      encoding: 'utf8',
      cwd,
    });

    return output
      .split('\n')
      .filter((f: string) => /\.(test|spec)\.(ts|tsx)$/.test(f))
      .map((f: string) => normalizePath(f));
  } catch {
    return [];
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  findTestFiles,
  findPreloadPath,
  findChangedTestFiles,
  runTestFile,
  runIsolated,
  getOptimalParallelCount,
};
