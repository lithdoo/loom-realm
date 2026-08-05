# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

推荐入口：

- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-lifecycle-protocol.md)
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
→ Frame / Call manages Main-owned call/input Context
→ Main publishes committed InputTarget
→ Renderer routes current Frame/Activation input
→ Render uses independent Subsystem-owned identity
```

## 当前协议状态

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control Protocol v1               Frozen
Frame / Call Protocol v1                    Active / Normative / Frozen
```

Frame / Call v1 的 A-F 设计批次现已全部完成：

```text
A  identity / lifecycle / Activation
B  exact seven RPC wire
C  transaction / commit / publication barriers
D  error / timeout / no-retry / cancellation boundary
E  Runtime failure fixed-point Stack unwind
F  limits / conformance / transport mapping / version completion
```

Batch 标签只保留为设计历史，不再是兼容等级。

### Frame v1 completion profile

```text
protocol = loomrealm.frame-call / 1
no JSON-RPC Batch
Request ID = positive safe integer; sender Connection lifetime no reuse
max message = 1 MiB
max JSON depth = 64
max business JsonValue = 512 KiB
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
seven method deadlines = 1s..5min sender-local monotonic profile
Desktop WebSocket / PWA MessagePort use the same application semantics
```

Frame v1 没有独立 `frame.hello/version/capabilities`；`subsystem.hello.protocolVersions`仍只协商 Subsystem Control。

正式兼容要求见 [Frame / Call v1 Conformance Profile](./doc/15-contracts/frame-call-conformance-v1.md)。协议已 Frozen 不等于实现/CI 已通过 conformance fixtures。

## 下一协议目标

Frame / Call v1 不再有 Batch G。下一主要设计目标是：

```text
Main ⇄ Renderer Control
→ Renderer ⇄ Subsystem Connection
→ User Input
→ Render Update
→ Render State
```

## Desktop Runtime 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Desktop v1 使用 `nodejs` Launcher、Host-selected Node、`shell=false`、token-before-spawn、Runtime Supervisor；Subsystem Control v1 管 hello/status/shutdown/failed，`stopped`只来自实际 Runtime termination observation。当前不定义 automatic restart/same-attempt reconnect/application heartbeat。

Frame不是 Process、业务状态 ownership或 Render ownership单元。Render lifecycle不从 Frame suspend/close/unwind推导。业务内容通过独立 Readonly Content API获取。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
