# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

当前权威目录只有：

```text
00-overview
10-architecture
15-contracts
20-modules
30-implementation
```

`decisions/` 保存 ADR；`fsdb/` 保存仍有独立价值的外部格式参考。已被替代的旧架构/协议/Phase 1 草稿不再保留在当前文档树，完整历史通过 Git 查询。

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
15. [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
16. [Frame v1 Suspend Semantics Clarification](./15-contracts/frame-call-v1-suspend-clarification.md)
17. [Main ⇄ Renderer Control Protocol v1](./15-contracts/main-renderer-control-v1.md)
18. [Renderer ⇄ Subsystem Data Connection Contract v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
19. [Renderer ⇄ Subsystem User Input Protocol v1](./15-contracts/user-input-v1.md)
20. [Render Update v1 Incremental Closure](./15-contracts/render-update-v1-incremental-design.md)
21. [只读 Content API v1](./15-contracts/content-api-v1.md)
22. [模块设计目录](./20-modules/README.md)
23. [实施计划目录](./30-implementation/README.md)

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

## Runtime Control

当前唯一组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

Control v1负责 Runtime identity/lifecycle：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

```text
spawn success != connected != identified != ready
ready != Data Connection exists
```

`subsystem.status({state:"ready"})` 不携 Renderer Data endpoint。

`subsystem.hello.protocolVersions`只协商 Control version 1；Frame v1由 Profile v1静态绑定。

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

## Renderer / Data

Renderer Control只复制 Main committed authority：

```text
Runtime projection
Frame Stack
Activation / InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

实际 Data carrier bootstrap 独立：

```text
Desktop → endpoint/ticket/WebSocket
PWA     → MessagePort creation/transfer
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != authoritative Render Domain destroy
```

## User Input v1

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Effective Channel：

```text
current Data Connection
∩ Main InputTarget / Activation
∩ Subsystem Interest
∩ Producer availability
```

## Render Update v1

当前 closure candidate：

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)  // R → R+1
render.event
```

Patch 使用 key-addressed `insert/remove/move/update`，整个 Domain candidate 原子验证/提交。continuity failure 通过 retire Data carrier + fresh Registry/Snapshot 收敛，不增加 ACK/replay/resync RPC。

增量模型冻结后应合并回正式 `render-update-v1.md`，并删除工作草案。

## Content API v1

Content API负责 logical readonly routes、MIME/cache/version、authorization semantics、errors/integrity；Content capability distribution属于独立 Access Bootstrap/Profile。

## 当前状态

```text
Game Package v1                         Desktop bootstrap Frozen
Desktop Node.js Launcher v1             Frozen
Subsystem Control v1                    Stabilizing
Runtime Control Profile v1              Stabilizing
Frame / Call v1                         Frozen
Renderer Control v1                     Draft / near closure
Data Connection v1                      Draft / lifecycle closed
User Input v1                           Core closure reviewed
Render Update v1                        Closure Candidate
Content API v1                          Evolving
```

## 文档治理

协议版本表示真实互操作边界，不表示设计稿次数。首次 conformant implementation 前的错误设计直接修订 first-version contract；形成真实兼容边界后，不兼容变化才升级协议/Profile version。

关键设计演变见 [ADR 目录](./decisions/README.md) 与 Git history。
