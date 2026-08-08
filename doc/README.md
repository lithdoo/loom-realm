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
13. [Subsystem Control Protocol v2 Draft](./15-contracts/subsystem-control-protocol-v2.md)
14. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
15. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
16. [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
17. [Frame v1 Suspend Semantics Clarification](./15-contracts/frame-call-v1-suspend-clarification.md)
18. [Main ⇄ Renderer Control Protocol v1 Draft](./15-contracts/main-renderer-control-v1.md)
19. [只读 Content API v1](./15-contracts/content-api-v1.md)
20. [模块设计目录](./20-modules/README.md)
21. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
Game Package / Desktop Launcher         Frozen
Subsystem Control v1                    Frozen
Subsystem Control v2                    Draft / lifecycle-only direction
Runtime Control Application Profile v1  Frozen
Frame / Call v1                         Frozen
Frame Suspend Clarification             Frozen clarification
Main ⇄ Renderer Control v1              Draft / boundary refined
Content API v1                          Active / Normative / Evolving
```

协议边界清理决策见 [ADR 0016](./decisions/0016-protocol-boundary-cleanup.md)。

核心原则：

```text
Runtime != Frame != Renderer Control != Data Connection != Render != Content
```

## Runtime Control

Profile v1 继续冻结：

```text
Subsystem Control v1
+
Frame / Call v1
```

不静默加入 Data lease method。

Subsystem Control v2 Draft把 Runtime `ready` 收纯为 lifecycle readiness，不再携带 Renderer Data endpoint，从而允许 Desktop/PWA 使用不同 Data bootstrap Profile而共享同一 Runtime lifecycle semantics。

未来 Runtime Control Application Profile v2 只有在所需组成协议冻结后才定义。

## Frame / Call v1

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main owns Frame/Stack/Activation/InputTarget
Response-before-dependent-RPC
activate/resume ACK-before-publication
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime root → whole suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
Frame lifecycle != Render/Data lifecycle
```

显式 `frame.suspend` 的 v1 闭合语义见 [Suspend Clarification](./15-contracts/frame-call-v1-suspend-clarification.md)：

```text
child-call suspension
    → existing frame.resume(child outcome) may reactivate

administrative frame.suspend
    → one-way quiesce in v1
    → no generic reactivation
```

## Renderer Control v1 Draft

当前 Draft 使用：

```text
Main = authority
Renderer = read-only committed mirror
full Authority Snapshot
Session-local monotonic revision
revision gap/coalescing allowed
no patch/replay
reconnect = current Snapshot
```

Snapshot只包含逻辑 authority：

```text
Runtime projection
Frame Stack
Activation/InputTarget
DataAuthority {
    subsystemKey
    generation
    connectionProfile
}
```

不包含：

```text
Data endpoint
MessagePort
bearer Data token
Render State
Content Grant
```

Renderer Control loss会撤销 ordinary input 与全部 DataAuthority，并关闭当前 Data Connections；重新连接后从 fresh full Snapshot恢复。

## Content API v1

Content API负责：

```text
logical readonly routes
MIME/cache/version
request authorization semantics
errors/integrity
```

但不负责 Content capability distribution。

```text
Content API semantics
!=
Content Access Bootstrap/Profile
```

错误分类已收敛为：

```text
state/version/index conflict → 409
body schema/integrity failure → 422
```

## Runtime / Frame / Render / Data 边界

```text
spawn success != connected != identified != ready
shutdown Response != stopped
Frame outcome != Frame lifecycle
Frame lifecycle != Data Connection lifecycle
Frame lifecycle != Render lifecycle
Data Connection close != Render destroy
Renderer reconnect != Frame recovery
```

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
- [Subsystem Control Protocol v2 Draft](./15-contracts/subsystem-control-protocol-v2.md)
- [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
- [Frame v1 Suspend Semantics Clarification](./15-contracts/frame-call-v1-suspend-clarification.md)
- [Main ⇄ Renderer Control Protocol v1 Draft](./15-contracts/main-renderer-control-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)

Legacy入口仍保留历史追溯，但不得作为新实现依据：

- `game-package-v1.md`
- `system-lifecycle-protocol.md`
- `frame-data-channel-v1.md`
- `client-state-tree-v1.md`
- `resource-protocol.md`

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
- [ADR 0015 · Frame / Call Batch F / v1 Completion](./decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)
- [ADR 0016 · Protocol Boundary Cleanup](./decisions/0016-protocol-boundary-cleanup.md)

## 当前推进状态

```text
Protocol boundary cleanup                Accepted
Subsystem Control v2                     Draft
Renderer Control v1                      Draft / under review
Frame suspend semantics                  Clarified
    ↓
Renderer ⇄ Subsystem Connection v1       Next protocol target
    ↓
Runtime Control Profile v2               If required by frozen composition
    ↓
User Input v1
Render Update v1
Render State Contract v1
Content Access Profile
```

明确暂缓：第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame replay/resync、transparent partial-Runtime recovery、Frame runtime dynamic downgrade/capability negotiation。