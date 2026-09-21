# Main 与 Runtime：当前实现

> 模块入口：`packages/main`、`packages/runtime-control`、`packages/subsystem`、`packages/platform-ports`。这里描述当前模块所有权，不维护旧 M5–M9 阶段签核表；当期验证与后续工作统一见[路线图](../../30-implementation/roadmap.md)。

## 所有权

Main 是唯一的 Session、Runtime、Frame/Stack、Activation、InputTarget、Renderer currentness、AuthorityRevision 和 DataAuthority 应用权威。它串行处理状态变更、运行时错误和终止收敛；平台、Renderer、Data Broker、Hostra 不能各自创建一份应用权威。

```text
Game Package + Platform PREPARE
→ LogicalGameBootstrap（仅 logical subsystem key 与 initial input）
→ Main Session / RuntimeHosting
→ Runner / Subsystem Frame
→ Renderer Control current participant
→ Main DataAuthority → Platform Data provisioning
```

`Main` 只消费平台的窄 capability；不消费 Game Entry 文件路径、模块 URL、Node/Worker 对象、浏览器 DOM 或 Hostra RPC 内容。`DataConnectionAuthoritySink` 仅向平台发布当前权威视图；Desktop Broker 负责物理候选连接，不接管 logical generation/profile 决策。Data carrier 丢失不自动制造新 Session 或 DataAuthority。

## 核心行为

- Runtime launch/auth/ready、Frame 激活与 InputTarget 由 Main 仲裁。`RendererControlBinding.acquire` 只建立物理候选，当前身份只能在合法 hello 事务后切换。
- 一次 mutation 依照已有 causal barrier 提交；失败遵照固定点 unwind/terminal，不能在平台层额外维护重试、回滚或并行 authority。
- `renderer-data/1` 的精确子项及当前兼容性见 [Renderer Data Profile](../../15-contracts/renderer-data-profile-v1.md) 和 [Viewport](../../15-contracts/viewport-state-v1.md)，不要引用旧三子项实现状态推断当前主线资格。

## 使用与验证

入口以源码的 public exports 为准。完整可观察语义： [Runtime Control](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control](../../15-contracts/main-renderer-control-v1.md)、[Data Connection](../../15-contracts/renderer-subsystem-data-connection-v1.md)。组织方式参阅[系统架构](../../10-architecture/system-overview.md)及[运行承载](../../10-architecture/runtime-hosting-system.md)。

验证使用对应 workspace 测试及当前提交的 M9–M12 集成/qualification；当前被测 SHA、缺口和正式状态仅见[路线图及资格记录](../../30-implementation/roadmap.md)。旧阶段设计与变更原因从 [ADR](../../decisions/README.md) 和 Git 历史追溯。
