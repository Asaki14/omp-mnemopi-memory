# omp-mnemopi-memory Agent Guide

This is the canonical agent guide for this repository. `CLAUDE.md` is a symlink to it; edit this file only.

## Project

An oh-my-pi (OMP) extension over the Mnemopi memory backend: a `/memories` editor, global memory injection, session-end distillation, and raw transcript archiving. OMP loads `index.ts`, declared in `package.json` under `omp.extensions`.

## Repository Map

- `index.ts`: entry point; sets the UI locale, then registers the three modules.
- `src/global.ts`, `src/snapshot.ts`: global memory injection, ranking, context budget, and removal of recalled duplicates.
- `src/extension.ts`, `src/store.ts`, `src/status.ts`: `/memories` editor, scoped reads and writes, status bar.
- `src/session.ts`, `src/worker.ts`, `src/guidance.ts`, `src/automatic.ts`, `src/queue.ts`: distillation in a detached worker, candidate validation, retry queue.
- `src/archive.ts`, `src/policy.ts`, `src/config.ts`: transcript archiving, shared rules (archive lineage, credential detection), database paths and read handles.
- `src/i18n.ts`: UI strings in English and Simplified Chinese.
- `test/`: Bun tests on temporary databases.
- `docs/how-it-works.md`: behavior reference linked from the README.

## Rules

- UI text goes through `t()` in `src/i18n.ts`, with both locales updated together. Model prompts, the injected memory policy, and log events stay English.
- Writes go through the official Mnemopi API (`@oh-my-pi/pi-mnemopi`, pinned). Direct SQL is read-only and must list its columns in `REQUIRED_COLUMNS` in `src/snapshot.ts` when it reads new ones.
- Never send credential-bearing text to a model or into the prompt; use `hasSecret()` from `src/policy.ts`.
- Requests must never be blocked by memory failures: report once and continue.
- Tests must not touch a real OMP agent directory. End-to-end runs against a real host need `mnemopi.dbPath` pointed at a temporary directory with `--config`.
- Keep `README.md` and `README_CN.md` in sync, and add user-visible changes to `CHANGELOG.md` under `Unreleased`.

## Commands

```bash
bun install
bun test
```
