<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/omp-mnemopi-memory/main/assets/logo.svg" width="120" />
  <h1>omp-mnemopi-memory</h1>
  <p><b>让编码 Agent 的记忆保持干净，也让你看得懂</b></p>
  <p><a href="README.md">English</a> · 中文</p>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/Asaki14/omp-mnemopi-memory/test.yml?branch=main&style=flat-square&label=tests" alt="Tests"></a>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/stargazers"><img src="https://img.shields.io/github/stars/Asaki14/omp-mnemopi-memory?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Asaki14/omp-mnemopi-memory/tags"><img src="https://img.shields.io/github/v/tag/Asaki14/omp-mnemopi-memory?label=version&style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
</div>

<br/>

<div align="center">
  <img src="https://raw.githubusercontent.com/Asaki14/omp-mnemopi-memory/main/assets/flow.svg" width="1000" />
</div>

## 功能

一个基于 Mnemopi 记忆后端的 [oh-my-pi（OMP）](https://github.com/can1357/oh-my-pi) 扩展。

| 功能 | 什么时候 | 做什么 |
| :--- | :--- | :--- |
| `/memories` | 想查看或修正 Agent 记住了什么 | 浏览全局和当前项目的记忆，直接编辑或删除。 |
| 全局记忆 | 每次请求 | 注入全局记忆，你亲手改过的排在最前，按上下文窗口裁剪；像凭据的内容一律不注入。 |
| 会话提炼 | 会话结束 | 后台进程只保留你说过的偏好、确认过的决定和有证据的项目事实；失败的任务下次启动时重试。 |
| 原文归档 | 始终 | 原始对话副本退出召回，旧提示词不会再被当成指令；历史记录保留。 |

## 安装

```bash
omp plugin install github:Asaki14/omp-mnemopi-memory
```

然后在 `~/.omp/agent/config.yml` 中把 OMP 切到 Mnemopi，执行 `/reload`：

```yaml
memory:
  backend: mnemopi
mnemopi:
  scoping: per-project-tagged   # 一个全局库，加每个项目一个库
  autoRetain: false             # 由提炼替代整段会话保存
modelRoles:
  memory: <provider>/<model>    # 远程模型；本地模型会被跳过
```

也可以直接让 Agent 帮你装：
> Install omp-mnemopi-memory for me by reading https://github.com/Asaki14/omp-mnemopi-memory/blob/main/llms.txt

> [!IMPORTANT]
> 启用后，所有库里的原始 `coding-agent-transcript` 记忆，以及由它们汇总出的内容，都不再参与召回。它们通过 Mnemopi 的 API 失效，并未删除。如果你依赖这些原文，请先备份 `~/.omp/agent/memories/mnemopi/`。

已在 OMP 18.13.1 和 `@oh-my-pi/pi-mnemopi` 18.12.6 上测试。

## 使用

执行 `/memories`，选择**全局**或**项目**，再选中一条记忆即可编辑。清空正文后保存就是删除。Escape 返回上一级。改动从下一次请求起生效。

界面支持英文和简体中文，默认跟随 `LC_ALL`、`LC_MESSAGES` 或 `LANG`，也可以在 `~/.omp/agent/omp-mnemopi-memory.json` 里固定：

```json
{ "locale": "zh-CN" }
```

发给模型的提示词始终是英文；提炼出的记忆跟随你主要使用的语言。

后台结果记录在 `~/.omp/logs/memory-guidance.log`。完整流程、排序规则和重试机制见 [How it works](docs/how-it-works.md)。

## 为什么

Mnemopi 默认会把整段对话存进记忆。召回时，旧提示词、一次性命令和半途放弃的计划都会被当成长期指令带回来，而你很难看到、也很难改掉里面存了什么。

这个扩展反过来做：少记，并且全部看得见。只保存两类内容：用户明确表达的偏好和决定，以及能在会话中找到原话作证的项目事实；拿不准的宁可丢掉，也不猜。存下来的每一条都能在同一个地方查看和修改。

## 卸载

```bash
omp plugin uninstall omp-mnemopi-memory
rm -rf ~/.omp/agent/memories/guidance-queue
rm -f ~/.omp/agent/omp-mnemopi-memory.json
```

已保存的记忆仍留在 Mnemopi 中，已归档的原文保持失效。

## 参与贡献

欢迎提 Issue 和 PR。提交前请运行 `bun install && bun test`，并把用户可感知的改动写进 [CHANGELOG.md](CHANGELOG.md) 的 `Unreleased`。面向 Agent 的仓库说明见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT License，欢迎使用和参与贡献。
