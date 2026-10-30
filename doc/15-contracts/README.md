# 当前正式契约

跨角色、跨进程可观察的 identity、lifecycle、ordering、failure、limits 与 version 约束以相应 Contract 正文为准。本页只提供 Current navigation，不复制实现进度、历史 milestone 或 qualification PASS 状态。

## Runtime、控制与数据

- [Game Package v1](./game-package-v1.md)
- [Hostra Launcher / Node Runner](./nodejs-launcher-profile-v1.md)
- [PWA Launcher / Worker Runner](./pwa-launcher-profile-v1.md)
- [Shared State v1](./shared-state-v1.md)
- [Session Events v1](./session-events-v1.md) · [Runtime Integration Profile](./session-events-runtime-profile-v1.md) · [Conformance](./session-events-conformance-v1.md) — Session-scoped cross-Subsystem transient event protocol；exact-channel routing；logical contract允许与 Shared State 共进程/共 carrier，但 current Hostra/PWA v1 profile 冻结为每 Runtime dedicated Events carrier。
- [Subsystem Control v1](./subsystem-control-protocol-v1.md)
- [Runtime Control v1](./runtime-control-profile-v1.md)
- [Frame / Call v1](./frame-call-protocol-v1.md) · [Conformance](./frame-call-conformance-v1.md)
- [Main ⇄ Renderer Control v2](./main-renderer-control-v2.md) · [v1 historical contract](./main-renderer-control-v1.md)
- [Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)
- [Renderer Data Profile `/3`](./renderer-data-profile-v3.md) · [v2 historical contract](./renderer-data-profile-v2.md) · [v1 pre-release correction](./renderer-data-profile-v1.md) — `/3` identity and message set remain current; framework-defined common byte/depth/queue capacity caps are removed by the proposed pre-release correction. Profile v1's separate four-child correction remains under ADR0037; its conformance revision 4 is a candidate.
- [Viewport State v1](./viewport-state-v1.md) · [Conformance](./viewport-state-conformance-v1.md)
- [Game Common Controls Input v1](./game-common-controls-input-v1.md) · [Framework User Input v1 historical contract](./user-input-v1.md)
- [Render Update v1](./render-update-v1.md) · [Conformance](./render-update-conformance-v1.md) — pre-release removal of framework-imposed capacity caps under ADR0039; wire identity remains `/1` subject to the compatibility gate, conformance fixture revision 2 candidate
- [Readonly Content API v1](./content-api-v1.md)

## Web Presentation

- [Web Presentation Config v1](./web-presentation-config-v1.md) — Window bootstrap resources / scripts / styles。
- [Web Presentation API v3](./web-presentation-api-v3.md) · [Frame-targeted Presentation Event v1](./frame-targeted-presentation-event-v1.md) · [v2 historical contract](./web-presentation-api-v2.md) — boolean publication 兼容并新增 Top Frame 精确投递。

Renderer current Store 与 Main/DataAuthority topology 不因 DOM 或 business WebComponent 生成第二份 authority。平台可以有不同 physical composition，但不创建第二套公开 Presentation ABI。

## Contract、Implementation、Qualification

```text
Contract Frozen
→ observable semantics 已冻结
→ 不自动代表实现存在或测试通过

Implemented
→ 以当前源码与产品测试判断

Qualified
→ 必须有适用 executable subject、qualification input、环境与 evidence
```

Current Contract 不复制 historical PASS ledger。实现状态看[核心模块](../20-modules/core/README.md)；测试、qualification subject/staleness 与性能规则看[开发与资格](../30-development/README.md)。历史 evidence 只在 `30-implementation` 中作为 provenance，不覆盖 Current Contract。

为什么采用当前设计看 [ADR](../decisions/README.md)；正在进行的工作使用 GitHub Issue/PR；已完成且没有独立 evidence 价值的 plan/review/draft 由 Git 历史保存。
