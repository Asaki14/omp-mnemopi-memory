# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Install as an OMP plugin with `omp plugin install github:Asaki14/omp-mnemopi-memory`.
- Simplified Chinese interface, selected by `locale` in `omp-mnemopi-memory.json` or the POSIX locale.
- GitHub Actions workflow running the test suite.
- Chinese README, `llms.txt` for agent-driven installs, and an agent guide in `AGENTS.md`.

### Changed
- Sources moved to `src/` and tests to `test/`; detailed behavior moved to `docs/how-it-works.md`.
- The worker log is written to `logs/memory-guidance.log` next to the OMP agent directory, regardless of where the extension is installed.

### Fixed
- On a fresh install, reading memories before Mnemopi created its database no longer raises `unable to open database file`.

## [0.1.0] - 2026-10-27

### Added
- `/memories` editor for global and current-project Mnemopi memories.
- Global memory injection ranked by source and importance, trimmed to the context budget, with credential filtering.
- Removal of global memories duplicated by built-in Mnemopi recall.
- Session-end distillation in a detached worker, with evidence checks, per-candidate rejection, semantic deduplication, and a retry queue.
- Archiving of raw `coding-agent-transcript` memories and everything derived from them.

[Unreleased]: https://github.com/Asaki14/omp-mnemopi-memory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Asaki14/omp-mnemopi-memory/releases/tag/v0.1.0
