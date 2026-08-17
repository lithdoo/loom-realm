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
4. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v1](./15-contracts/game-package-v1.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-protocol-v1.md)
13. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
14. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
15. [Frame / Call v1 Conformance](./15-contracts/frame-call-conformance-v1.md)
16. [Main ⇄ Renderer Control Protocol v1](./15-contracts/main-renderer-control-v1.md)
17. [Renderer ⇄ Subsystem Data Connection Contract v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
18. [Renderer ⇄ Subsystem User Input Protocol v1](./15-contracts/user-input-v1.md)
19. [Render Update Protocol v1](./15-contracts/render-update-v1.md)
20. [只读 Content API v1](./15-contracts/content-api-v1.md)
21. [模块设计目录](./20-modules/README.md)
22. [实施计划目录](./30-implementation/README.md)
23. [独立分包与发布架构](./30-implementation/package-architecture.md)
24. [仓库与目录方案](./30-implementation/repository-layout.md)
25. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## 当前核心协议图

```text
Game Package v1
    ↓
Desktop Node.js Launcher v1
    ↓
Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1

Frame / Call v1
    Main-owned Stack / Frame / Activation / InputTarget

Main ⇄ Renderer Control v1
    Runtime / Stack / Activation / InputTarget / DataAuthority

Renderer ⇄ Subsystem Data Connection v1
    Session + Renderer + subsystemKey + generation
    ├── User Input v1
    └── Render Update v1

Content API v1
    independent readonly content plane
```

核心原则：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## Runtime / Frame

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

Control负责 Runtime identity/lifecycle；`ready` 不携 Renderer Data endpoint。

Frame v1 exactly seven Requests，并冻结 Response-before-dependent-RPC、ACK-before-publication、timeout/loss ambiguous→Runtime failure、no retry、whole-suffix fixed-point unwind。

## Renderer / Data

Renderer Control只复制 Main committed authority；实际 WebSocket/MessagePort carrier 由技术 Adapter + composition root 建立，不进入 Renderer Authority Snapshot。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != authoritative Render Domain destroy
```

## User Input / Render

User Input：

```text
Effective Channel
=
current Data Connection
∩ Main InputTarget/Activation
∩ Subsystem Interest
∩ Producer availability
```

standard canonical payload 直接属于 User Input v1；DOM/OS/device mapping 属于 Renderer implementation。

Render Update 唯一正式 v1：

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

`tag` 只是 opaque string；continuity failure 通过 fresh Data carrier + Registry/Snapshots 恢复，无 ACK/replay/resync RPC。

## Content API

Content API负责 logical readonly GET/HEAD、MIME/cache/version、request authorization、error/integrity。

filesystem/HTTP/Service Worker/OPFS 是技术 Adapter；credential delivery 留在 composition root/adapter，不另建 Content Access Profile。

## 分包与发布

实现层采用：

```text
能力一包
角色一包
技术 Adapter 一包
平台只组合
```

并明确：

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
npm package semver != protocol version
```

因此 Desktop/PWA 保留为运行拓扑与产品形态，但默认不是 `host-desktop` / `host-pwa` 万能公共包。详细规则见 [独立分包与发布架构](./30-implementation/package-architecture.md)。

## 当前状态

```text
Game Package v1                         Desktop bootstrap Frozen
Desktop Node.js Launcher v1             Frozen
Subsystem Control v1                    Stabilizing
Runtime Control Profile v1              Stabilizing
Frame / Call v1                         Frozen
Renderer Control v1                     Draft / near closure
Data Connection v1                      Draft / lifecycle closed
User Input v1                           Core Closure Candidate
Render Update v1                        Closure Candidate
Content API v1                          Evolving
```

协议已经足够支撑进入开发；剩余 payload/limits/conformance 允许在真实实现中继续细化。

## 文档治理

正式 Protocol/Profile 只用于独立实现必须共享、否则会破坏互操作/authority/identity/state/order/recovery/security 的规则。

Package 则只为有明确能力、消费者和独立发布价值的边界创建；不会因为协议有独立文档或代码运行在某个平台就自动拆包。

协议版本表示真实互操作边界，不表示设计稿次数。关键设计演变见 [ADR 目录](./decisions/README.md) 与 Git history。
