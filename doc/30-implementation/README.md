# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

实施层描述当前仓库准备如何落地。包名、目录和交付顺序可以调整，但必须遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)；
- [测试策略](./testing-strategy.md)；
- [第一阶段交付计划](./phase-1-delivery-plan.md)。

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已 Legacy / Superseded。

## 当前已冻结实施前提

第一阶段实现可以直接依赖 Game Package v2、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call Batch A-E 和 Content API v1。

```text
Frame / Call v1
    Batch A  identity / lifecycle / Activation                  Frozen
    Batch B  exact seven RPC / Schema / local semantics         Frozen
    Batch C  transaction / commit barrier / rollback            Frozen
    Batch D  error / timeout / no-retry / cancellation          Frozen
    Batch E  Runtime failure deterministic unwind               Frozen
    Batch F  limits / fixtures / profile/version completion     Next
```

## Batch E 可直接实现

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame = unwind root
→ root..top whole suffix doomed
→ Top→Bottom cleanup
→ failed Runtime Frame logical retire without Frame RPC ACK
→ healthy descendant best-effort frame.close
→ cleanup failure may expand failed set and move root lower
→ repeat until fixed point
→ preserve accepted root outcome
   or synthesize failed(SUBSYSTEM_RUNTIME_FAILED)
→ fresh-resume direct healthy Caller
   or Stack empty
```

实现不得：

- 只删除 failed Runtime自己的 Frame；
- 只从最近 failed-runtime occurrence开始 unwind；
- failed Runtime上继续发送 normal close/resume；
- healthy doomed Frame cleanup前强制多发一个 suspend作为 recovery要求；
- cleanup timeout后 retry同一 RPC；
- Runtime crash覆盖已 accepted terminal outcome；
- 对 intermediate doomed Frame逐层 resume；
- 恢复旧 Activation；
- 增加 `frame.abort/frame.unwind`、operation replay或 Frame resync。

## 实施原则

1. Frozen Contract先写 conformance fixture，再写两端实现；
2. Batch F不得静默修改 A-E已冻结 semantics；
3. Launcher / Control / Frame / Render / Content能力边界不得因代码便利重新合并；
4. Main的 RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
5. Subsystem SDK不得本地恢复 lower Frame；
6. Renderer/Transport不得计算 root或修改 recovery；
7. 先完成 test-subsystems，再接复杂地图 Subsystem；
8. 实施发现架构问题时先更新上层文档；路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        Frozen
    ↓
Subsystem Control Protocol v1                Frozen
    ↓
Frame / Call Batch A-E                       Frozen
    ↓
Frame / Call Batch F                         ← next / final
    limits / fixtures / profile/version completion
    ↓
Frame / Call v1 overall Active/Frozen
    ↓
Main ⇄ Renderer Control
    ↓
Renderer ⇄ Subsystem Connection
    ↓
User Input + Render Update
    ↓
Render State
```

Main⇄Renderer Control已受 Batch C/E causal/recovery constraints约束：ACK-before-publish、revoked never republished、recovery可长期 `InputTarget=null`、只有 final resume ACK后才能发布新 target。
