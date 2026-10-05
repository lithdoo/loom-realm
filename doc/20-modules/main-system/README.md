# Main 与 Runtime：当前实现

> 模块入口：`packages/main`、`packages/runtime-control`、`packages/subsystem`、`packages/platform-ports`。这里描述当前模块所有权，不维护旧 M5–M9 阶段签核表；当期验证与后续工作统一见[路线图](../../30-implementation/roadmap.md)。Realm State 当前仅同步 future authority boundary，尚未实现/qualified。

## 所有权

Main 是唯一的 **Control Authority**：拥有 Session/Runtime lifecycle、Frame/Stack、Activation、InputTarget、Renderer currentness、AuthorityRevision、DataAuthority 与 failure unwind。它串行提交这些 control facts；Platform、Renderer、Data Broker、Hostra 都不能复制第二份 control authority。

Realm State 是 Main 的 sibling authority，而不是 Main 内部业务字段：

```text
Main
    Session / Runtime / Frame / Activation
    InputTarget / DataAuthority / failure unwind

RealmStateAuthority
    Session shared mutable business Records
    initial/current values / Record versions / OCC / commit revision
```

RealmStateAuthority 当前仍是 pre-implementation architecture/contract target；本文不把它误写成现有 `packages/main` 已实现能力。

Prepared bootstrap boundary：

```text
Game Package document + Platform Launcher PREPARE
    ├─ LogicalGameBootstrap
    │     → Main only
    └─ PreparedRealmStateDefinition
          → Realm State bootstrap only

Realm State READY
→ Main Session / RuntimeHosting
→ Runner / Subsystem
→ Renderer Control current participant
→ Main DataAuthority → Platform Data provisioning
```

`Main` 只消费平台的窄 capability 与 `LogicalGameBootstrap`；不消费 Game Entry 文件/类型、Realm State prepared definition/values、模块 URL、Node/Worker 对象、浏览器 DOM 或 Hostra RPC 内容。

`DataConnectionAuthoritySink` 仅向平台发布当前 DataAuthority 视图；Desktop Broker 负责物理候选连接，不接管 logical generation/profile 决策。Data carrier 丢失不自动制造新 Session/DataAuthority，也不影响 Realm State authority。

Session/Platform composition MAY physically construct Main 与 RealmStateAuthority，但 composition本身不是第三 application authority。

## 核心行为

- Runtime launch/auth/ready、Frame 激活与 InputTarget 由 Main 仲裁；Realm State read/commit/subscription 不创建、消费或验证 Frame/Activation/InputTarget authority。
- `RendererControlBinding.acquire` 只建立物理候选，当前 Renderer identity 只能在合法 hello transaction 后切换。
- Main-owned control mutation 依照已有 causal barrier 提交；失败遵照固定点 unwind/terminal，Platform层不能额外维护重试、回滚或并行 control authority。
- Realm State ordinary invalid/limit/conflict、subscription listener failure或 State binding loss不得自动触发 Main Runtime/Frame/Session transition。
- 如果 RealmStateAuthority 无法继续维持自身 invariant，它只报告 Session-fatal condition；Main/Session lifecycle owner 才提交 Session terminal 与 Runtime/Frame unwind。
- `renderer-data/1` 的精确子项及当前兼容性见 [Renderer Data Profile](../../15-contracts/renderer-data-profile-v1.md) 和 [Viewport](../../15-contracts/viewport-state-v1.md)，不要引用旧三子项实现状态推断当前主线资格。

## 使用与验证

当前实现入口以源码的 public exports 为准。Main 已实现可观察语义见 [Runtime Control](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control](../../15-contracts/main-renderer-control-v1.md)、[Data Connection](../../15-contracts/renderer-subsystem-data-connection-v1.md)。Realm State future boundary见 [Realm State architecture](../../10-architecture/realm-state-system.md) 与 [Realm State v1 candidate](../../15-contracts/realm-state-v1.md)。

验证使用对应 workspace 测试及当前提交的 qualification；Realm State 必须拥有独立 implementation/qualification evidence，不能从历史 Main/M9–M15 evidence 推导为已实现。当前被测 SHA、缺口和正式状态见[路线图及资格记录](../../30-implementation/roadmap.md)。旧阶段设计与变更原因从 [ADR](../../decisions/README.md) 和 Git 历史追溯。
