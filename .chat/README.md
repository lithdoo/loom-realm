# Chat Session Records

This directory contains the exported OpenCode session transcripts for all
sessions in this repository (`lithdoo/loom-realm`), captured at 2026-09-17.

## Files

| File | Session | Messages |
|---|---|---|
| `ses_f5674d5efffeDvBNhrLQZPI9Wu.json` | 主会话（拉取最新 → Core Viewport C0/C1 → PR0 → STOP A/B → Map Docs Freeze → PR1 → PR2 → PR3） | 632 |
| `ses_f7b271554ffeyjnRlu2eUqopxq.json` | 探索：渲染与数据管道系统 | 42 |
| `ses_f7b27154cffeN2MfIUs91fPBKp.json` | 探索：后端与数据分发链路 | 47 |
| `ses_f52ba8de7ffeGEGhza9DzXBSfS.json` | 子代理：Explore map-layering browser harness | 8 |
| `ses_f52ba8de6ffeAEOB9MNJ1E69uw.json` | 子代理：Explore hostra product harness | 27 |
| `ses_f52ba8ddeffeofXpfL0Wt4xUGN`* | 子代理：Explore map library current code | — |

\* 以及导出时存在的其他本仓库会话（见目录内全部 `ses_*.json`）。

## Format

Each `ses_*.json` contains:

```json
{
  "title": "...",
  "directory": "...",
  "messages": [
    { "id": "msg_...", "time": 1234567890123, "parts": [ ... ] }
  ]
}
```

`parts` 是 OpenCode 消息部件（text / tool-call / tool-result 等），数据
结构以导出时的内部 schema 为准（`role`、`text`、`tool`、`state` 等字段）。

## Export tooling

- `export-sessions.cjs`：从本地 OpenCode SQLite 数据库副本导出
  （只读副本，避免锁库）；按 `project_directory` 过滤本仓库。
- `.export-schema.cjs`：schema 勘察脚本（开发用途，可删）。

会话原始存储位于 `~/.local/share/opencode/opencode.db`；导出不含
credential/account 表。
