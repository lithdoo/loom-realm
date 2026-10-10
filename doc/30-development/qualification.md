# Qualification 与 Subject 规则

## 核心模型

```text
behavior / qualification-input change
→ identify qualification subject
→ determine affected capabilities
→ run required package/contract/product gates
→ record exact environment/evidence
→ Qualified for that subject only
```

`Frozen != Implemented != Qualified`。docs-only editorial commit 通常不是新的 executable subject；测试、fixture、workflow、threshold 或其他 qualification input 改变则可能形成新 subject。

## Staleness

历史 PASS 不能自动迁移。后续 commit 若影响某 capability 的 executable behavior 或 qualification input，该 capability 必须重新判断 required gates；与该 capability 无关的 docs-only/provenance change 不应制造虚假 requalification。

## Current closed baseline

2026-10-09 项目级 qualification backlog 已收口；最终已记录的 Terrain/performance executable/qualification-input subject 为 `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`。该事实只描述当时的已测 subject，不承诺未来 HEAD 自动 Qualified。

长期规则而不是 milestone ledger 才是 Current SSOT。旧 M11/M14/M15、Realm State、Viewport、PWA ledger 仍作为 exact-subject evidence 保留在 `../30-implementation/`，但不再承担导航或项目路线图职责。

## Evidence 最低要求

按 capability 记录需要的：subject SHA、qualification-input identity、OS/runtime/browser/host baseline、sample count/threshold、raw/sanitized digest、hosted run 或本地 legal-only boundary。不得把 CI skip、静态 fixture 或 product E2E 冒充它们没有覆盖的外部原版/跨环境证据。
