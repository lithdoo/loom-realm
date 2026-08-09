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

协议版本表示真实 interoperability boundary，不作为设计稿迭代编号。首次 conformant implementation 前被修正的历史协议正文不保留在当前文档树；关键设计演变由 ADR 与 Git history 追溯。

## Runtime Control Profile v1

第一阶段同一 Main ⇄ Subsystem Control Connection静态组合：

```text
Subsystem Control v1
+
Frame / Call v1
```

`subsystem.hello.protocolVersions`只协商 Subsystem Control；Frame v1不增加独立 hello/version handshake。hello成功前无 Frame operation；Runtime在该 Profile下 `ready` 表示完整承担 Frame v1 Subsystem角色。

`ready` 不包含 Renderer Data endpoint。DataAuthority由 Main⇄Renderer Control发布，实际 Desktop WebSocket / PWA MessagePort Data carrier由 Host/Platform Binding独立建立。

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

Completion profile：

```text
protocol = loomrealm.frame-call / 1
no JSON-RPC Batch in Runtime Control Profile v1
Request ID = positive safe integer; shared sender Connection lifetime no reuse
max message = 1 MiB
max JSON depth = 64
max business JsonValue = 512 KiB
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
sender-role Frame deadlines = 1s..5min monotonic
Desktop WebSocket / PWA MessagePort use the same application semantics
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

Data reconnect不能修复 Runtime failure或 Frame unwind；Frame lifecycle也不能推导 Render Domain lifecycle。

## Desktop Runtime 边界

```text
spawn success != connected != identified != ready
```

Desktop v1 使用 `nodejs` Launcher、Host-selected Node、`shell=false`、token-before-spawn、Runtime Supervisor；Subsystem Control v1 管 hello/status/shutdown/failed，`stopped`只来自实际 Runtime termination observation。当前不定义 automatic restart、same-attempt reconnect 或 application heartbeat。

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
