# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-02-13

### Fixed

- Avoid recursive npm lifecycle publishing by renaming the script to `release:publish`.
- Normalize `bin.bun-isolated` path for npm publish compatibility.

## [1.2.0] - 2026-02-13

### Added

- **`--bail`** and **`--max-failures <n>`** – Stop scheduling new files once the failure threshold is reached.
- **`--telemetry-log <path>`** – Persist JSONL run telemetry (duration, pass/fail/skip totals, p50/p95, files/sec).
- **`--no-telemetry`** – Disable telemetry output for local runs.

### Changed

- **Final summary output** now includes `p50`, `p95`, and `files/sec` metrics.
- **Run results** now include `stoppedEarly` to signal fail-fast short-circuiting.

## [1.1.0] - 2025-01-19

### Added

- **`--preload <path>`** – Override auto-detected preload script (e.g. `bun.preload.ts`). When set, this path is passed to `bun test --preload` for each subprocess.
- **`--exclude <pattern>`** – Exclude paths containing the given pattern. Repeatable. Example: `bun-isolated --exclude src/app --exclude e2e`.

### Changed

- **Bun preload flag** – Use `--preload` instead of `-r` when invoking `bun test`. Bun expects `--preload` for test preload scripts; `-r` is for `bun run` and was incorrect.
- **Child process env** – Set `FORCE_COLOR=1` and remove `NO_COLOR` in spawned subprocesses to avoid Node.js/Bun color warnings and ensure consistent TTY output.

### Fixed

- Preload scripts were not applied correctly due to using `-r`; they now use `--preload` as required by `bun test`.

[1.1.0]: https://github.com/affectively-ai/bun-isolated-runner/compare/v1.0.0...v1.1.0
[1.2.1]: https://github.com/affectively-ai/bun-isolated-runner/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/affectively-ai/bun-isolated-runner/compare/v1.1.0...v1.2.0
