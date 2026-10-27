# How it works

Details behind each part of omp-mnemopi-memory. For setup, see the [README](../README.md).

## Global injection

Before each request, the extension reads the global bank and injects `<global_memories>`:

| Rank | Source |
|---|---|
| 1 | Memories you edited (`user-memory-editor`) or corrected (`user-correction`) |
| 2 | Other memories, by importance, then recency |
| 3 | Mnemopi facts not already covered by a memory |

- If the context window cannot fit all of them, the lowest-ranked entries are dropped and the model is told how many were omitted.
- Memories containing credentials (passwords, API keys, tokens, auth URLs; English and Chinese keywords) are never injected.
- If the database cannot be read, the request proceeds without global memories and you get one warning. Requests are never blocked.
- Built-in Mnemopi recall can also return global memories. Those duplicates are removed from the `<memories>` block; project recalls stay. A truncated recall item counts as a duplicate only if it is a prefix of at least 20 characters of a global memory.

## Distillation

On session exit or switch, the current branch's user messages, completed assistant replies, and `ask` selections are passed through a credential filter and handed to a detached worker over a pipe. OMP's shutdown hook has a 2-second limit, so the worker outlives the host. The worker:

1. Asks the `memory` role for at most 8 candidates, each with a verbatim evidence quote.
2. Drops individual candidates that lack matching evidence, attribute a preference or decision to the assistant, copy raw messages, or contain sensitive fields. The rest of the batch is kept.
3. Runs one more model call to drop candidates already covered by existing global or project memories. New details, stricter conditions, and reversed decisions are kept.
4. Saves the remaining candidates to the session's project bank with source `omp-auto-guidance`.

Only the option the user actually selected in an `ask` counts as a decision; unselected options are context.

If extraction fails (no model, malformed output, worker failed to start), the job is written to `~/.omp/agent/memories/guidance-queue/` (mode 0600, credential-filtered conversation only) and retried on the next session start, 3 attempts in total. Sessions claim jobs by atomic rename, so a job never runs twice at once; a claim older than 30 minutes is treated as abandoned. A killed OMP process does not trigger extraction. Setting `mnemopi.llmMode: none` disables dispatch.

Worker results go to `~/.omp/logs/memory-guidance.log` as JSON lines: `memory_session_retained` (with `stored` and any `rejected` reasons), `memory_session_requeued`, `memory_session_abandoned`, `memory_queue_invalid`.

## Projects

A Git project is identified by its common repository: the main checkout, subdirectories, and registered worktrees share memories, and identical entries are shown once. Nested independent repositories stay separate. Outside Git, the nearest ancestor directory that already has memories defines the project.

## Saving and deleting

All writes go through the official Mnemopi API with models, embeddings, and automatic fact extraction disabled. Saving creates a new record and invalidates the old one; deleting invalidates it. Facts derived from an invalidated record are retired with it. Identical text across banks in the same scope is updated together. Each write checks that the record is still active and unchanged; if another session modified it, the write is refused.

Global injection and archiving read Mnemopi tables directly. Required columns are verified on each read, so a schema change surfaces as a clear read error instead of silently wrong data. After upgrading OMP or Mnemopi, run the tests.
