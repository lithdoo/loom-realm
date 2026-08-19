# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

当前权威目录：

```text
00-overview
10-architecture
15-contracts
20-modules
30-implementation
```

`decisions/` 保存 ADR；`fsdb/` 保存独立参考。被替代的协议/设计正文不继续留在当前树，历史通过 Git 追溯。

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
6. [运行承载系统](./10-architecture/runtime-hosting-system.md)
7. [栈式运行系统](./10-architecture/stack-runtime-system.md)
8. [通信系统](./10-architecture/communication-system.md)
9. [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
10. [渲染系统](./10-architecture/rendering-system.md)
11. [存储与内容系统](./10-architecture/storage-system.md)
12. [模块子系统模型](./10-architecture/subsystem-model.md)
13. [正式契约目录](./15-contracts/README.md)
14. [Game Package v1](./15-contracts/game-package-v1.md)
15. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
16. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-protocol-v1.md)
17. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
18. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
19. [Frame / Call v1 Conformance](./15-contracts/frame-call-conformance-v1.md)
20. [Main ⇄ Renderer Control Protocol v1](./15-contracts/main-renderer-control-v1.md)
21. [Renderer ⇄ Subsystem Data Connection Contract v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
22. [Renderer ⇄ Subsystem User Input Protocol v1](./15-contracts/user-input-v1.md)
23. [Render Update Protocol v1](./15-contracts/render-update-v1.md)
24. [只读 Content API v1](./15-contracts/content-api-v1.md)
25. [模块设计目录](./20-modules/README.md)
26. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
27. [PWA Composition](./20-modules/pwa-host/README.md)
28. [实施计划目录](./30-implementation/README.md)
29. [独立分包与发布架构](./30-implementation/package-architecture.md)
30. [仓库与目录方案](./30-implementation/repository-layout.md)
31. [测试策略](./30-implementation/testing-strategy.md)
32. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

---

## 当前系统图

```text
Game Package
    ↓
Main
├── Runtime/Frame/Activation authority
├── Renderer Control authority
└── DataAuthority

Subsystem
├── business state
├── Frame/Input Context
└── Render Domains

Renderer
├── Main authority mirror
├── User Input producer/gate
└── Render replica/presentation

Content
    readonly logical plane
```

这些是 platform-neutral logical roles。

```text
                   Platform Ports
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
 Hostra Desktop Composition       PWA Composition
```

Platform 负责 Process/Worker、Window、Control/Data carrier、Content physical binding 与 resource lifecycle，但不获得 Main/Subsystem/Renderer application authority。

详细见 [平台组合系统](./10-architecture/platform-composition-system.md)。

---

## Runtime / Frame

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

Control 负责 Runtime identity/lifecycle；`ready` 不携 Renderer Data endpoint。

Frame v1 exactly seven Requests，并冻结 Response-before-dependent-RPC、ACK-before-publication、timeout/loss ambiguous→Runtime failure、no retry、whole-suffix fixed-point unwind。

---

## Renderer / Data

Renderer Control 只复制 Main committed authority；actual Data carrier 由 system Platform Data Connection Broker 建立，不进入 Renderer Authority Snapshot。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != authoritative Render Domain destroy
```

Hostra Desktop 可使用 localhost carrier；PWA 可使用 MessageChannel/Port，但建立后的 Data Connection semantics 相同。

---

## User Input

当前模型：

```text
Effective(F,A,C)
=
current Data Connection
∩ Main InputTarget(S,F,A)
∩ current active Frame/Activation
∩ Interest[F]
∩ Producer availability
```

Interest 是 Subsystem-owned Frame-scoped configuration，以 full Frame Interest Registry snapshot 发布。

```text
Frame suspension/fresh Activation
    may retain Interest[F]

fresh Activation
    never reuses old Input State/Event

fresh Data Connection
    Interest Registry starts empty
    Subsystem republishes current registry
```

Renderer 不解释 push/pop/call/return/unwind；Control/Data 到达顺序可任意，靠 current-state conjunction 收敛。

---

## Render

Render Update：

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

`tag` 是 opaque string；continuity failure 通过 fresh Data carrier + Registry/Snapshots 恢复，无 ACK/replay/resync RPC。

Render lifecycle 由 Subsystem 控制，不从 Frame/Data carrier 推导。

---

## Content

Content API 负责 logical readonly access、MIME/cache/version、authorization、error/integrity。

```text
Hostra Desktop → filesystem + localhost HTTP
PWA            → Fetch + Service Worker / OPFS
```

这些 Platform bindings 不改变 Content logical semantics。

---

## Business Portability

业务 Subsystem 默认只依赖：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

同一个 business definition 由 Hostra Desktop / PWA composition 注入不同 physical infrastructure；业务代码不判断平台，也不创建 WebSocket/MessagePort。

---

## 分包与发布

实现层采用：

```text
能力一包
角色一包
技术 Adapter 一包
Platform 作为系统架构职责
apps/desktop + apps/pwa 作为当前 composition roots
可复用 platform helper 按真实需求抽取
```

并明确：

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
npm package semver != protocol version
Platform Architecture != platform npm package
```

---

## 当前状态

```text
Game Package v1                         Desktop bootstrap Frozen
Desktop Node.js Launcher v1             Frozen
Subsystem Control v1                    Stabilizing
Runtime Control Profile v1              Stabilizing
Frame / Call v1                         Frozen
Renderer Control v1                     Draft / near closure
Data Connection v1                      Draft / lifecycle closed
User Input v1                           Frame-scoped Interest model
Render Update v1                        Closure Candidate
Content API v1                          Evolving
Platform Composition                    Active Design / Evolving
```

协议已经足够支撑进入开发；跨平台实现以 Hostra Desktop → PWA 的相同 abstract application trace equivalence 为系统验收方向。

---

## 关键 ADR

- [ADR 0002：平台 Transport Binding](./decisions/0002-platform-transport-profiles.md)：application semantics 统一，physical carrier 平台化；
- [ADR 0016：协议边界清理](./decisions/0016-protocol-boundary-cleanup.md)：authority/lifecycle 最小化，Host glue 不污染 application contract；
- [ADR 0017：平台是系统级 Composition Boundary](./decisions/0017-system-level-platform-composition.md)：Platform 负责完整物理 Session，role-local bindings 只是 Platform ports 投影。
