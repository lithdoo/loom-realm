# LoomRealm 设计文档

文档按定义依赖组织：

```text
产品目标
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

横向“相关”引用不应形成主要定义依赖环；被替代正文通过 Git 历史追溯。

---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [Subsystem 模型](./10-architecture/subsystem-model.md)
10. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
11. [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
12. [存储与内容系统](./10-architecture/storage-system.md)
13. [正式契约目录](./15-contracts/README.md)
14. [Game Package v1](./15-contracts/game-package-v1.md)
15. [Desktop Node.js Launcher / Subsystem Runner Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
16. [Subsystem Control v1](./15-contracts/subsystem-control-protocol-v1.md)
17. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
18. [Frame / Call v1](./15-contracts/frame-call-protocol-v1.md)
19. [Frame / Call v1 Conformance](./15-contracts/frame-call-conformance-v1.md)
20. [Main ⇄ Renderer Control v1](./15-contracts/main-renderer-control-v1.md)
21. [Renderer Data Application Profile v1](./15-contracts/renderer-data-profile-v1.md)
22. [Renderer ⇄ Subsystem Data Connection v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
23. [User Input v1](./15-contracts/user-input-v1.md)
24. [Render Update v1](./15-contracts/render-update-v1.md)
25. [Readonly Content API v1](./15-contracts/content-api-v1.md)
26. [模块设计目录](./20-modules/README.md)
27. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
28. [PWA Composition](./20-modules/pwa-host/README.md)
29. [实施计划目录](./30-implementation/README.md)
30. [独立分包与发布架构](./30-implementation/package-architecture.md)
31. [仓库与目录方案](./30-implementation/repository-layout.md)
32. [测试策略](./30-implementation/testing-strategy.md)
33. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

---

## 当前闭环

```text
Game Package {key,module}
        ↓
platform-neutral Subsystem Definition Module
        ↓
Host-owned Platform Runner
    ┌───────────────┐
    │               │
Node Runner     Worker Runner
    │               │
    └──── role-local Platform Ports ────┐
                                        ▼
                             @loomrealm/subsystem
                                        │
                                  business logic
```

业务 module不是 Process/Worker entry；Runner负责加载 module、构造 role-local ports、进入 Subsystem role core。

---

## Runtime / Frame

```text
Runtime Control Profile v1
= Subsystem Control v1 + Frame / Call v1
```

Frame v1：

```text
exact seven Requests
Main-owned Stack/Activation/InputTarget
Response-before-dependent-RPC
ACK-before-publication
timeout/loss ambiguous → Runtime failure
no retry / post-commit no rollback
```

`@loomrealm/subsystem` author projection进一步保证：

```text
FrameOutcome = completed / cancelled / failed
child Outcome resolves frame.call()
only pre-commit recoverable rejection may reject
Runtime-fatal/ambiguous never re-enters business continuation
```

---

## Renderer / Data

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Profile改变必须 fresh generation。

Platform DataConnectionBroker只实现 current authority的物理 carrier；不拥有 generation/profile。

### Late provisioning

```text
Hostra
    Broker → Runner provisioning IPC → Data WebSocket

PWA
    Broker → Worker provisioning path → transferred MessagePort
```

Provisioning不是 Runtime Control/Renderer Control/Data application protocol；失败不自动失败 Runtime或 unwind Frame。

---

## Unified Message Carrier

当前 message-oriented Control/Data Profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## User Input

```text
Effective(F,A,C)
=
current matching Data
∩ Main InputTarget(S,F,A)
∩ active/current Activation
∩ Interest[F]
∩ Producer(C)
```

Interest是 Subsystem-owned Frame-scoped config，不是 authority。

```text
fresh Activation → may reuse Interest config, never old Input State/Event
fresh Data       → remote Interest/State empty, republish/baseline
```

Control/Data无跨连接 total order。

---

## Render

```text
render.domains
render.snapshot
render.patch
render.event
```

Render Domain authority在 Subsystem；Frame/Data carrier不拥有 Domain lifecycle。

fresh carrier使用 current Registry + fresh Snapshots恢复 replica baseline。

---

## Business Portability

```text
@loomrealm/map → @loomrealm/subsystem
```

业务不得依赖：

```text
@loomrealm/subsystem/host
WebSocket/MessagePort
Node/Worker Runner
Platform provisioning
```

Hostra/PWA运行同一个 Definition Module。

---

## Package / Platform Boundary

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

```text
foundation/wire          low-level primitives
contract/capability      protocol mechanics
role packages             platform-neutral role APIs
technical adapters        transport/runner/content mechanisms
apps/desktop|pwa          final Platform composition roots
```

Platform Architecture不自动产生 `platform-*` 大包。

---

## 当前状态

```text
Game Package v1                         Active / Normative / Stabilizing
Desktop Node Runner Profile v1          Active / Normative / Stabilizing
Subsystem Control v1                    Stabilizing
Runtime Control Profile v1              Stabilizing
Frame / Call v1                         Active / Normative / Frozen
Renderer Control v1                     Active Design / Draft
Renderer Data Profile v1                Active Design / Draft / Stabilizing
Data Connection v1                      Active Design / Draft
User Input v1                           Core Closure Candidate / Stabilizing
Render Update v1                        Closure Candidate / Stabilizing
Content API v1                          Active / Normative / Evolving
Platform Composition                    Active Design / Evolving
```

当前设计重点已从扩大协议面转为 implementation/conformance：证明 Definition Module→Runner→Role Ports→Physical Platform 和 Protocol→SDK control-flow 两个方向都不能绕过 authority/failure invariants。

---

## 关键 ADR

- [ADR 0002：平台 Transport Binding](./decisions/0002-platform-transport-profiles.md)
- [ADR 0016：协议边界清理](./decisions/0016-protocol-boundary-cleanup.md)
- [ADR 0017：平台是系统级 Composition Boundary](./decisions/0017-system-level-platform-composition.md)
