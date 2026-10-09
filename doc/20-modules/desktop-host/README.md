# Hostra Desktop：当前产品组合

> 代码：`apps/desktop`、`packages/game-launcher-hostra`；system decision：[ADR0034](../../decisions/0034-hostra-owned-desktop-composition.md)。本文描述 Current physical composition，不维护 live PASS dashboard。

## Physical ownership

```text
Hostra shell
  Electron / BrowserWindow / host RPC
  └─ HOSTRA_SUBCMD
      LoomRealm Desktop plain Node process
        ├─ Main / RealmStateAuthority / RuntimeHosting → Runner
        ├─ Desktop Data Broker
        ├─ Content Service + trusted shell
        ├─ Renderer Control carrier
        └─ Data settlement carrier
             ↔ Hostra-owned BrowserWindow trusted Renderer
```

Hostra shell 唯一拥有 Electron、BrowserWindow、preload 与 direct child lifecycle；`apps/desktop` 不能重新创建独立 Electron main 或复制 Main authority。`@loomrealm/game-launcher-hostra` 负责 Game Entry + launch manifest PREPARE 与 Node Runner realization；Hostra outer shell 不是 logical Game Launcher。

Hostra JSON-RPC 仅用于 bounded host control（例如 window open/close/event），不承载 Renderer Control/Data application/Content/Input/Render protocol。

## Identity / lifetime / security

- trusted top-level navigation 才建立新的 document/Renderer lifetime；subresource/iframe 不得冒充 Renderer；
- reload：same Hostra window、fresh Renderer logical identity；
- same-generation Data replacement：preserve Renderer identity、replace physical Data pair；
- window close、signal、RPC/start failure 汇入单一幂等 termination funnel；
- product requires non-empty `HOSTRA_RPC_TOKEN`；Hostra 自身更宽松的部署能力不放宽 LoomRealm product policy。

## Validation

Existing aliases `build:m15` / `test:m15:*` / `test:m15` 继续作为 CI/release interface；它们不再代表 Current 文档阶段。冻结 Hostra baseline 与 historical exact-subject evidence 仍可从 legacy M15 ledger 追溯；新的 behavior/input subject 是否需要重测由[qualification 规则](../../30-development/qualification.md)决定。

实现细节：[Hostra composition](./hostra-composition.md)；跨角色逻辑 API：[契约索引](../../15-contracts/README.md)。
