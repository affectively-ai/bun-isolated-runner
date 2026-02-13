# @affectively/bun-isolated-runner

Run Bun tests in **isolated subprocesses** to prevent mock pollution and global state leakage.

[![npm version](https://img.shields.io/npm/v/@affectively/bun-isolated-runner.svg)](https://www.npmjs.com/package/@affectively/bun-isolated-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem

Bun's test runner is **blazing fast** because it reuses the same process for all tests. But this speed comes with a cost: **mock pollution**.

```typescript
// test-a.test.ts
import { mock } from 'bun:test';
mock.module('firebase/firestore', () => ({ getDoc: mock(() => 'mocked') }));

// test-b.test.ts - THIS STILL SEES THE MOCK FROM TEST A! 
import { getDoc } from 'firebase/firestore';
// getDoc is still mocked, even though we didn't mock it here
```text

Unlike Jest, which runs each test file in isolation by default, Bun shares the module registry across all tests. This leads to:

- **Flaky tests** that pass individually but fail together
- **Mock leakage** where one test's mocks affect others
- **Global state pollution** from singletons

## The Solution

Run each test file in its own subprocess:

```bash
npx bun-isolated
# or
bun-isolated src/**/*.test.ts
```text

Each test file gets a **fresh Bun process** with clean module registry. No mock pollution. No shared state. Tests run deterministically.

## Installation

```bash
npm install -D @affectively/bun-isolated-runner
# or
bun add -D @affectively/bun-isolated-runner
```text

## Quick Start

### CLI Usage

```bash
# Run all tests in isolation
npx bun-isolated

# Run specific test files
npx bun-isolated src/my-test.test.ts src/other.test.ts

# Run with glob pattern
npx bun-isolated "src/**/*.test.ts"

# Parallel execution (default: CPU count)
npx bun-isolated --parallel=4

# Sequential (for debugging)
npx bun-isolated --parallel=1

# Preload script (overrides auto-detect of bun.preload.ts)
npx bun-isolated --preload ./bun.preload.ts

# Exclude paths (repeatable)
npx bun-isolated --exclude src/app --exclude e2e

# Fail fast after first failed file
npx bun-isolated --bail

# Stop after 3 failed files
npx bun-isolated --max-failures=3

# Write telemetry to a custom JSONL path
npx bun-isolated --telemetry-log=.build-logs/isolated.jsonl

# Disable telemetry logging
npx bun-isolated --no-telemetry
```text

### package.json Integration

```json
{
 "scripts": {
 "test": "bun-isolated",
 "test:changed": "bun-isolated --changed",
 "test:ci": "bun-isolated --parallel=4 --bail"
 }
}
```text

### Programmatic API

```typescript
import { runIsolated, findTestFiles } from '@affectively/bun-isolated-runner';

// Find all test files
const files = await findTestFiles('src/**/*.test.ts');

// Run them in isolation
const results = await runIsolated(files, {
 parallel: 4,
 timeout: 30000,
 env: { NODE_ENV: 'test' }
});

console.log(`Passed: ${results.passed}, Failed: ${results.failed}`);
```text

## How It Works

1. **Discovery**: Find all test files matching the pattern
2. **Spawning**: Run each file with `bun test <file>` in a subprocess
3. **Isolation**: Each subprocess has a fresh module registry
4. **Aggregation**: Collect results and report

```text
┌─────────────────────────────────────┐
│ bun-isolated │
├─────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ │
│ │ bun test│ │ bun test│ ... │
│ │ file1.ts│ │ file2.ts│ │
│ └─────────┘ └─────────┘ │
│ │ │ │
│ Clean VM Clean VM │
│ No leaks No leaks │
└─────────────────────────────────────┘
```text

## Configuration

### bun-isolated.config.ts

```typescript
import type { IsolatedConfig } from '@affectively/bun-isolated-runner';

export default {
 // Test file patterns
 include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
 exclude: ['**/node_modules/**'],
 
 // Execution
 parallel: 4, // Number of parallel workers
 timeout: 30000, // Per-test timeout (ms)
 retries: 0, // Retry failed tests
 bail: false, // Stop after first failed file
 maxFailures: Infinity, // Or set a number, e.g. 3
 telemetryEnabled: true, // Disable with false
 telemetryLogPath: '.build-logs/bun-isolated-runner.jsonl',
 
 // Environment
 env: {
 NODE_ENV: 'test',
 TZ: 'UTC'
 },
 
 // Reporting
 reporter: 'default', // 'default' | 'json' | 'junit'
 verbose: false,
} satisfies IsolatedConfig;
```

## When to Use This

 **Use bun-isolated when:**
- Tests use `mock.module()` extensively
- You have singleton services (Firebase, DB connections)
- Tests are flaky when run together but pass individually
- You need Jest-like isolation guarantees

 **Don't use when:**
- Tests are already fast and isolated
- You don't use mocks
- You need the absolute fastest test execution

## Performance

| Approach | 100 test files | Isolation |
|----------|---------------|-----------|
| `bun test` | ~2s | Shared |
| `bun-isolated --parallel=8` | ~8s | Full |
| `bun-isolated --parallel=1` | ~30s | Full |

The overhead is ~3-5x, but **deterministic tests are worth it**.

## New Normal Defaults

- `--bail` and `--max-failures=N` let CI fail fast and avoid spending time on known-bad runs.
- JSONL telemetry (`--telemetry-log=<path>`) captures p50/p95/file-throughput trends for real performance tuning.
- `--no-telemetry` keeps local runs quiet when metrics are not needed.

## API Reference

### `runIsolated(files, options)`

Run test files in isolated subprocesses.

### `findTestFiles(pattern)`

Find test files matching a glob pattern.

### `IsolatedConfig`

Configuration type for the runner.

## Related Packages

- [`@affectively/devops-scripts`](https://www.npmjs.com/package/@affectively/devops-scripts) - Changed-file testing
- [`@affectively/utils`](https://www.npmjs.com/package/@affectively/utils) - Utility functions

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

Made with ️ by [AFFECTIVELY](https://affectively.ai)
