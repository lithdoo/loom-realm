# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

推荐入口：

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Game Package v1](./doc/15-contracts/game-package-v1.md)
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-protocol-v1.md)
- [Runtime Control Application Profile v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [Frame / Call v1 Conformance Profile](./doc/15-contracts/frame-call-conformance-v1.md)
- [独立分包与发布架构](./doc/30-implementation/package-architecture.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
Game Entry
→ declare required Subsystems
→ Main validates / launches Runtime Containers
→ Subsystem Control binds identity / ready / shutdown / failed
→ Runtime Control Profile binds Control v1 + Frame / Call v1
→ Frame / Call manages Main-owned call/input Context
→ Main publishes committed Renderer authority
→ Renderer establishes authorized Data Connections
→ User Input and Render Update run on independent Data protocol domains
→ Content uses an independent readonly plane
```

核心边界：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## 当前协议状态

```text
Game Package v1 / Desktop Launcher v1       Active / Normative; Desktop bootstrap Frozen
Subsystem Control Protocol v1               Active / Normative; Stabilizing
Runtime Control Application Profile v1      Active / Normative; Stabilizing
Frame / Call Protocol v1                    Active / Normative / Frozen
Main ⇄ Renderer Control v1                  Draft / near closure
Renderer ⇄ Subsystem Data Connection v1     Draft / lifecycle closed
User Input v1                               Core semantic closure reviewed
Render Update v1                            Closure candidate
Content API v1                              Active / Normative / Evolving
```

协议已足够支撑开发；剩余 payload/limits/conformance 在实现与 executable fixtures 中继续细化。

## Runtime Control Profile v1

第一阶段同一 Main ⇄ Subsystem Control Connection 静态组合：

```text
Subsystem Control v1
+
Frame / Call v1
```

`subsystem.hello.protocolVersions`只协商 Subsystem Control；Frame v1 不增加独立 hello/version handshake。`ready` 不包含 Renderer Data endpoint。

实际 Desktop WebSocket / PWA MessagePort carrier 由技术 Adapter + composition root 建立，不进入 Runtime/Renderer authority snapshot。

## Frame / Call v1

Frame v1 已冻结：

```text
exact seven RPC
Response-before-dependent-RPC
activate/resume ACK-before-publication
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime root → whole suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
```

正式兼容要求见 [Frame / Call v1 Conformance Profile](./doc/15-contracts/frame-call-conformance-v1.md)。

## Data / Input / Render

```text
Main ⇄ Renderer Control
    committed Runtime / Stack / Activation / InputTarget / DataAuthority

Renderer ⇄ Subsystem Data Connection
    Session + Renderer + subsystemKey + generation

User Input
    Subsystem → Renderer: Interest
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer: Registry / Snapshot / Patch / Event
```

Data reconnect 不能修复 Runtime failure 或 Frame unwind；Frame lifecycle 也不能推导 Render Domain lifecycle。

## 分包与发布

实现采用 monorepo + 独立能力包：

```text
能力一包
角色一包
技术 Adapter 一包
平台只组合
```

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
npm package semver != protocol version
```

Desktop/PWA 作为 composition root，不默认发布 `host-desktop` / `host-pwa` 万能 library。WebSocket、MessagePort、Node launcher、filesystem/HTTP/Service Worker 等按技术能力独立拆分。

详细规则见 [独立分包与发布架构](./doc/30-implementation/package-architecture.md)。

## Desktop Runtime 边界

```text
spawn success != connected != identified != ready
```

Desktop v1 使用 `nodejs` Launcher、Host-selected Node、`shell=false`、token-before-spawn、Runtime Supervisor；Subsystem Control v1 管 hello/status/shutdown/failed，`stopped` 只来自实际 Runtime termination observation。

业务内容通过独立 Readonly Content API 获取。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
