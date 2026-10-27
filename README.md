<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/omp-mnemopi-memory/main/assets/logo.svg" width="120" />
  <h1>omp-mnemopi-memory</h1>
  <p><b>Memory your coding agent keeps clean, and you can actually read.</b></p>
  <p>English · <a href="README_CN.md">中文</a></p>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/Asaki14/omp-mnemopi-memory/test.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/stargazers"><img src="https://img.shields.io/github/stars/Asaki14/omp-mnemopi-memory?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/tags"><img src="https://img.shields.io/github/v/tag/Asaki14/omp-mnemopi-memory?label=version&style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</div>

<br/>

<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/omp-mnemopi-memory/main/assets/flow.svg" width="1000" />
</div>

## Features

An extension for [oh-my-pi (OMP)](https://github.com/can1357/oh-my-pi) on top of its Mnemopi memory backend.

| Feature | When | What it does |
| :--- | :--- | :--- |
| `/memories` | You want to see or fix what the agent remembers | Browse global and current-project memories, edit them in place, or delete them. |
| Global memories | Every request | Injects your global memories, your own edits first, trimmed to the context window. Anything that looks like a credential is never injected. |
| Session distillation | A session ends | A background worker keeps only preferences you stated, decisions you confirmed, and project facts with evidence. Failed runs retry on the next start. |
| Transcript archiving | Always | Raw conversation copies are retired from recall, so old prompts never come back as instructions. History is kept. |

## Install

```bash
omp plugin install github:Asaki14/omp-mnemopi-memory
```

Then switch OMP to Mnemopi in `~/.omp/agent/config.yml` and run `/reload`:

```yaml
memory:
  backend: mnemopi
mnemopi:
  scoping: per-project-tagged   # one global bank plus one bank per project
  autoRetain: false             # distillation replaces full-transcript retain
modelRoles:
  memory: <provider>/<model>    # a remote model; local models are skipped
```

You can also tell your agent to install it:
> Install omp-mnemopi-memory for me by reading https://github.com/Asaki14/omp-mnemopi-memory/blob/main/llms.txt

> [!IMPORTANT]
> Once enabled, raw `coding-agent-transcript` memories in every bank, and anything summarized from them, stop being recalled. They are invalidated through Mnemopi's API, not deleted. Back up `~/.omp/agent/memories/mnemopi/` first if you rely on them.

Tested with OMP 18.13.1 and `@oh-my-pi/pi-mnemopi` 18.12.6.

## Usage

Run `/memories`, pick **Global** or **Project**, and select a memory to edit it. Clear the text and save to delete it. Escape goes back one level. Changes apply from the next request.

The interface is in English or Simplified Chinese. It follows `LC_ALL`, `LC_MESSAGES`, or `LANG`, and you can pin it in `~/.omp/agent/omp-mnemopi-memory.json`:

```json
{ "locale": "zh-CN" }
```

Prompts sent to models stay in English. Distilled memories are written in the language you mainly used.

Worker results are logged to `~/.omp/logs/memory-guidance.log`. The full pipeline, ranking rules, and retry behavior are in [How it works](docs/how-it-works.md).

## Why

Mnemopi's default retain copies whole conversations into memory. Recall then surfaces old prompts, one-off commands, and abandoned plans as if they were standing instructions, and you have no easy way to see or correct what got stored.

This extension takes the opposite stance: remember less, and make all of it visible. Only two kinds of memory are saved: preferences and decisions the user stated explicitly, and project facts backed by a verbatim quote from the session. Anything uncertain is dropped rather than guessed. Everything that does get saved can be read and edited in one place.

## Uninstall

```bash
omp plugin uninstall omp-mnemopi-memory
rm -rf ~/.omp/agent/memories/guidance-queue
rm -f ~/.omp/agent/omp-mnemopi-memory.json
```

Saved memories stay in Mnemopi. Archived transcripts stay invalidated.

## Contributing

Issues and pull requests are welcome. Run `bun install && bun test` before submitting, and note user-visible changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md). Agent-facing repository notes live in [AGENTS.md](AGENTS.md).

## License

MIT License. Feel free to use it and contribute.
