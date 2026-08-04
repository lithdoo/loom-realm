# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v2](./15-contracts/game-package-v2.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
13. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
14. [只读 Content API v1](./15-contracts/content-api-v1.md)
15. [模块设计目录](./20-modules/README.md)
16. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
Game Package / Desktop Launcher    Frozen
Subsystem Control v1               Frozen

Frame / Call v1
    overall Draft
    Batch A Frozen
    Batch B Frozen
    Batch C Frozen
    Batch D Frozen
    Batch E Frozen
    Batch F Next / Final
```

### Batch A/B

Frame 是 Main-owned call/input Context：frameId Session unique/never reused，永久绑定 descriptor.key，caller Main-owned immutable；lifecycle只有 `starting/active/suspended/closing/closed`；Activation one-shot；outcome 与 lifecycle分离。

Wire exactly seven Requests：Main→Subsystem `initialize/activate/suspend/resume/close`，Subsystem→Main `call/return`。无 Caller wire、close reason、`system.call/system.return/frame.result/frame.cancel/frame.abort/frame.unwind`。

### Batch C

```text
Call Acceptance Commit
    Caller suspended / old Activation revoked
    Child starting / pushed / InputTarget=null
→ call Success
→ Child initialize/activate ACK
→ Child InputTarget publish

Return Acceptance Commit
    outcome accepted / old Activation revoked
    Child closing / InputTarget=null
→ return Success
→ close ACK/pop
→ Caller resume(fresh Activation) ACK
→ Caller InputTarget publish
```

ordinary call无 reverse suspend；Response-before-dependent-RPC；activate/resume ACK-before-publication；accepted outcome/revoked Activation不可回滚。

### Batch D

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

全部 Request finite deadline；no retry/replay/idempotency journal。Recoverable仅 target-not-found/unavailable 与 `FRAME_INITIALIZE_REJECTED`；divergence/protocol error Runtime-fatal；无 caller-driven cancel。

### Batch E

Runtime failure不按“当前 Frame”局部处理，而按 Runtime key + caller chain确定性收敛：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame = unwind root
→ root..top whole suffix doomed
→ Top→Bottom cleanup
→ failed Runtime Frame logical retire without Frame RPC ACK
→ healthy descendants best-effort close
→ cleanup failure expands failed set/root
→ repeat to fixed point
→ accepted root outcome preserved
   or failed(SUBSYSTEM_RUNTIME_FAILED)
→ fresh-resume direct healthy Caller
   or Stack empty
```

同一 Runtime在 Stack出现多次时取最低 occurrence；intermediate doomed Frame不逐层 resume；recovery不新增 abort/unwind/replay/resync wire；旧 Activation永不恢复。

### Batch F

最后冻结 wire limits、完整 A-E conformance fixtures、finite-deadline Profile配置、Desktop/PWA transport-independent conformance 与 version/profile binding。完成后 Frame / Call v1整体转 Active / Normative / Frozen。

## Runtime / Frame / Render 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
Frame outcome ≠ Frame lifecycle
Frame lifecycle ≠ Render lifecycle
```

Renderer只使用 Main已 commit current Activation/InputTarget；normal/recovery gap都可 `InputTarget=null`。Runtime failure unwind不通过 Renderer reconnect/Data resync修复。Render完全由 Subsystem独立管理。

## 文档目录

### 00 · 产品总览
- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

### 10 · 系统架构
- [系统架构总览](./10-architecture/system-overview.md)
- [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [运行承载系统](./10-architecture/runtime-hosting-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

### 15 · 正式契约
- [正式契约目录](./15-contracts/README.md)
- [Game Package v2](./15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
- [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [旧 Frame 生命周期草案路径（Legacy）](./15-contracts/system-lifecycle-protocol.md)

### 20 · 模块设计
- [模块设计目录](./20-modules/README.md)
- [程序主系统](./20-modules/main-system/README.md)
- [Web Renderer](./20-modules/web-renderer/README.md)
- [`loom.map`](./20-modules/loom-map/README.md)
- [Hostra Desktop](./20-modules/desktop-host/README.md)
- [PWA Host](./20-modules/pwa-host/README.md)

### 30 · 实施计划
- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## ADR

- [ADR 0008 · Desktop Node.js Launcher v1](./decisions/0008-desktop-nodejs-launcher-profile-v1.md)
- [ADR 0009 · Subsystem Control v1](./decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0010 · Frame / Call Batch A](./decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)
- [ADR 0011 · Frame / Call Batch B](./decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)
- [ADR 0012 · Frame / Call Batch C](./decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)
- [ADR 0013 · Frame / Call Batch D](./decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)
- [ADR 0014 · Frame / Call Batch E](./decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)

当前有效结论以 `00-overview`、`10-architecture`、`15-contracts` 为准；ADR保存历史决策过程。

## 当前推进状态

```text
Game Package v2 / Launcher v1       Frozen
Subsystem Control v1                Frozen
Frame / Call Batch A                Frozen
Frame / Call Batch B                Frozen
Frame / Call Batch C                Frozen
Frame / Call Batch D                Frozen
Frame / Call Batch E                Frozen
Frame / Call Batch F                Next / Final
Main ⇄ Renderer Control             Draft target
Renderer ⇄ Subsystem Connection     Draft target
User Input / Render Update          Draft target
Render State                        Draft target
```

明确暂缓：PWA Launcher/Credential/Control Transport Profile、第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume、Control heartbeat/same-attempt reconnect、lazy/idle recycle、多 Runtime per key、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery。
