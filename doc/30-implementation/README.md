# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-05

实施层描述当前仓库准备如何落地。包名、目录和交付顺序可以调整，但必须遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)；
- [测试策略](./testing-strategy.md)；
- [第一阶段交付计划](./phase-1-delivery-plan.md)。

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已 Legacy / Superseded。

## 当前已冻结实施前提

第一阶段实现可以直接依赖：

```text
Game Package v2 / Desktop Launcher v1
Subsystem Control Protocol v1
Runtime Control Application Profile v1
Frame / Call Protocol v1
Content API v1
```

```text
Runtime Control Application Profile v1
    Subsystem Control v1 + Frame / Call v1
    shared sender/Connection Request-ID namespace
    static Frame version binding

Frame / Call Protocol v1
    Protocol identity  loomrealm.frame-call
    Version            1
    Status             Active / Normative
    Stability          Frozen
```

设计批次 A-F 已全部冻结；Batch 标签只保留为决策历史。

## Frame v1 可直接实现

### Authority / Transaction

```text
Main-owned identity/lifecycle/Stack/Activation/InputTarget
exact seven RPC
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
```

### Error / Recovery

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure

failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ fixed-point expansion
→ accepted outcome or SUBSYSTEM_RUNTIME_FAILED
→ fresh final Caller resume or empty Stack
```

### Completion / Runtime Control Profile

```text
plain JSON application model
no JSON-RPC Batch on Runtime Control Profile v1 Connection
Request ID positive safe integer / shared sender Connection lifetime no reuse
message <=1 MiB / depth <=64 / business JsonValue <=512 KiB
Desktop actual WebSocket text bytes also <=1 MiB
frameId/activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
Main five Frame deadlines 1000..300000ms monotonic
Subsystem call/return deadlines 1000..300000ms monotonic
Desktop WebSocket / PWA MessagePort same Frame application semantics
no Frame hello/version downgrade
```

## Conformance 实施状态

[Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md) 已 Frozen，定义 A-F fixture catalog。

当前实施任务是把它落成：

```text
manifest / harness
normalized authority trace
fault injection
JSON/limit boundary fixtures
Request ID / shared Control-domain allocator fixtures
deadline virtual-clock fixtures
Desktop/PWA transport equivalence fixtures
Runtime Control Profile integration fixtures
```

在 executable fixtures实际通过之前，只能说“协议/Profile已 Frozen”，不能声称具体实现已经 v1 conformant。正式 report必须记录 tested fixtureSetRevision。

## 实施原则

1. Frozen Contract先写 conformance fixture，再写/接入两端实现；
2. Launcher / Control / Frame / Render / Content能力边界不得因代码便利重新合并；
3. Runtime Control Profile只组合协议，不改变 Subsystem Control/Frame各自方法语义；
4. Main RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
5. Subsystem SDK不得本地恢复 lower Frame；
6. Renderer/Transport不得计算 unwind root或修改 Frame recovery；
7. Desktop/PWA必须共享 Frame JSON/limit/ID/deadline validator语义；
8. 实施发现协议问题时先更新正式 Contract/新 ADR，不增加 Batch G；
9. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        Frozen
    ↓
Subsystem Control Protocol v1                Frozen
    ↓
Runtime Control Application Profile v1       Frozen
    ↓
Frame / Call Protocol v1                     Frozen
    ↓
Frame v1 executable conformance harness      ← implementation work
    ↓
Main ⇄ Renderer Control                      ← next protocol design
    ↓
Renderer ⇄ Subsystem Connection
    ↓
User Input + Render Update
    ↓
Render State
```

Main⇄Renderer Control已经受 Frame v1 causal/recovery constraints约束：ACK-before-publish、revoked never republished、recovery可长期 `InputTarget=null`、只有 final resume ACK后才能发布新 target。
