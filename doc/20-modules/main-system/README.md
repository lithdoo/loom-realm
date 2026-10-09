# Main 与 Runtime：当前实现

> 模块入口：`packages/main`、`packages/runtime-control`、`packages/subsystem`、`packages/platform-ports`、`packages/realm-state`。本文描述 Current ownership/realization；精确协议见[正式契约](../../15-contracts/README.md)，qualification 规则见[30-development](../../30-development/qualification.md)。

## Authority ownership

Main 是唯一 **Control Authority**：拥有 Session/Runtime lifecycle、Frame/Stack、Activation、InputTarget、Renderer currentness、AuthorityRevision、DataAuthority 与 failure unwind。Platform、Renderer、Data Broker、Hostra/PWA physical host 都不能复制第二份 control authority。

Realm State 是 sibling authority：

```text
Main                           RealmStateAuthority
Session / Runtime / Frame      shared mutable Records
Activation / InputTarget       record versions / OCC
DataAuthority / unwind         commit revision / subscriptions
```

Realm State 不拥有 Frame/Activation/InputTarget；Main 不拥有 business record values/OCC。Realm State fatal 只报告无法维持自身 invariant 的 fact，**Main 唯一提交 Session terminal 与 Runtime/Frame unwind**。

## Bootstrap / runtime composition

```text
Game Entry + Platform Launcher PREPARE
    ├─ LogicalGameBootstrap → Main
    └─ PreparedRealmStateDefinition → Realm State

required authorities READY
→ RuntimeHosting
→ Runner / Subsystem
→ Renderer current participant
→ DataAuthority / platform Data provisioning
```

Main 不消费 raw installation document、Realm State values、Save/Load document、module URL/path、Node/Worker object、DOM 或 Hostra RPC payload。Save/Load 是 business workflow：Subsystem 在 Runtime 启动后通过普通 RealmStateClient read/commit 实现。

`DataConnectionAuthoritySink` 只发布 current DataAuthority view；platform broker 负责 physical candidate/carrier，不接管 logical generation/profile。Data carrier loss 不自动产生新 Session/authority，也不重置 Realm State。

## Core invariants

- Runtime launch/auth/ready、Frame activation、InputTarget 由 Main 仲裁；
- Renderer identity 只能通过合法 current hello/transaction 收敛，physical acquire 本身不创建 authority；
- Main-owned control mutation 遵守现有 causal barrier 与 fixed-point unwind；
- Realm State ordinary invalid/conflict/listener/binding failure 不自动触发 Main control transition；
- physical State binding lifetime != Runtime-scoped logical RealmStateClient lifetime；ambiguous commit 不自动 replay；
- `renderer-data/1` current children/compatibility 以 [Renderer Data Profile](../../15-contracts/renderer-data-profile-v1.md) 与 [Viewport State](../../15-contracts/viewport-state-v1.md) 为准。

## 使用与验证

Current semantics 入口：[Runtime Control](../../15-contracts/runtime-control-profile-v1.md) · [Frame / Call](../../15-contracts/frame-call-protocol-v1.md) · [Renderer Control](../../15-contracts/main-renderer-control-v1.md) · [Data Connection](../../15-contracts/renderer-subsystem-data-connection-v1.md) · [Realm State v1](../../15-contracts/realm-state-v1.md)。

验证由对应 workspace、integration 与 qualification suites 承担。现有 `test:mXX` 名称只是兼容 command alias；是否需要 requalification 由具体 behavior/qualification-input change 与 subject/staleness 决定，历史 ledger 只作 evidence。
