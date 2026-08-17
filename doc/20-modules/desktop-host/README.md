# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Window、Desktop Runtime 拓扑、Node/WebSocket/HTTP/filesystem 技术绑定与安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 分包：[独立分包与发布架构](../../30-implementation/package-architecture.md)  
> 最近复核：2026-08-17

本文描述 **Desktop 运行拓扑/composition**，不是 `@loomrealm/host-desktop` 公共包规范。Desktop 默认由多个独立 capability/adapter package 在 `apps/desktop` 中组合。

## 1. Composition Boundary

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle 与受控平台 binding。它不拥有 LoomRealm Frame Stack、Activation、failure unwind、Subsystem business state 或 Render authority。

可能的实现组合：

```text
apps/desktop
├── @loomrealm/main
├── @loomrealm/renderer
├── @loomrealm/launcher-node
├── @loomrealm/transport-websocket
├── @loomrealm/content-service
├── @loomrealm/content-fs
└── @loomrealm/content-http
```

实际 package 创建以实现需要为准，但职责必须保持分离。

```text
Main⇄Subsystem Control      WebSocket adapter
Main⇄Renderer Control       WebSocket adapter
Renderer⇄Subsystem Data     WebSocket/other carrier adapter
Content                     filesystem + HTTP adapters
```

Composition root 可以参与 carrier/bootstrap material 的安全交付，但不得成为协议 authority。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Frame Stack / Transaction Coordinator
├── Activation / InputTarget
├── Renderer Control Authority
└── DataAuthority

per-Subsystem Process
├── Main Control carrier
├── 0..N Frame/Input Context
└── 0..N Render Domains

Web Renderer
├── Main Renderer Control carrier
└── 0..1 current Data carrier per Subsystem
```

进程隔离粒度 = Subsystem，不是 Frame。

## 3. Node Launcher

Node executable bootstrap/supervision 由独立 `launcher-node` capability 实现，遵守 Desktop Node.js Launcher Profile v1：

```text
validated entry
Host-selected Node
shell=false
fixed cwd
bootstrap token registered before spawn
explicit child env
Supervisor
no automatic restart
```

Launcher 不拥有 Runtime/Frame authority；Runtime terminal failure后的 Process cleanup 由 Supervisor 负责，不通过 Frame close 模拟 Runtime termination。

## 4. Runtime Control Carrier

同一 authenticated Main⇄Subsystem Control carrier 复用：

```text
Subsystem Control v1
Frame / Call v1
```

由 Runtime Control Application Profile v1 静态组合。

WebSocket 只是技术 Adapter：

```text
one complete WebSocket text message
=
one JSON-RPC application message
```

JSON-RPC Batch 禁止。Adapter MUST 保持 per-direction 顺序，不得 duplicate/retry/replay state-changing Frame operation。

`subsystem.status({state:"ready"})` 不携带 Renderer Data URL、ticket、credential 或 DataAuthority generation。

## 5. Ordering / Failure

必须保持：

```text
call acceptance → call Response → Child initialize/activate
return acceptance → return Response → close/resume
activate/resume ACK → InputTarget publication
```

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

failure unwind authority 只在 Main；WebSocket/Hostra/Launcher adapter 不得选择 root、重发 recovery RPC 或根据 PID 修改 Frame authority。

## 6. Renderer ⇄ Subsystem Data Binding

Data Connection Core 不定义 endpoint discovery/handshake method。

Desktop composition 通过 carrier adapter 建立实际连接，在安装为 current 前必须绑定：

```text
current Session
current Renderer participant
subsystemKey
current DataAuthority generation
```

实现 MAY 使用 localhost WebSocket endpoint + one-shot ticket，但这些 material：

```text
MUST NOT 进入 Subsystem Control ready
MUST NOT 进入 Renderer Authority Snapshot
MUST NOT 成为 DataAuthority identity
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Data retire != Render Domain destroy
```

## 7. Content Binding

Desktop Content 默认由能力组合：

```text
@loomrealm/content
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
```

filesystem、HTTP server、bearer injection 是技术实现；Content API logical route/cache/version/integrity/authorization semantics 仍由正式契约定义。

Credential injection 不形成独立 Content Access Profile。

## 8. User Input / Render

current Data Connection 承载 User Input 与 Render Update。

User Input 受 Main InputTarget/Activation + Interest + Producer availability gate。

Render lifecycle 由 Subsystem 控制；Render Update 使用 Domain Registry + Snapshot + Patch + transient Event。

Hostra/transport adapter 不得把 Frame Stack 当作 Render z-order 或 Domain lifecycle。

## 9. Package Boundary

Desktop 平台差异优先拆为单一技术能力：

```text
launcher-node
transport-websocket
content-fs
content-http
```

不默认建立：

```text
@loomrealm/host-desktop
```

如果未来某段 Desktop glue 被多个产品独立复用，应按“独立消费者 + 独立职责 + 独立发布价值”重新评估后再抽包。

## 10. Conformance / Invariants

Desktop 至少验证：

```text
Control v1 version selection
ready has no Data endpoint
Runtime Control Profile shared-ID/no-Batch rules
Frame / Call transport fixtures
Data carrier bound to current generation
one current Data carrier per Subsystem
same-generation reconnect only after old retired
Data loss does not fail Runtime/unwind Frame
Content logical semantics unaffected by adapter choice
```

核心不变量：

- Desktop composition 不拥有 Main authority；
- one Subsystem = one Runtime Process；
- Runtime Control = Control v1 + Frame v1；
- Control `ready` 不携 Data endpoint；
- no Batch / no application Frame retry；
- failure unwind 只在 Main；
- DataAuthority 是逻辑 authority，不是 endpoint/credential；
- adapter 负责技术 binding，不拥有 application authority；
- Data loss 不等于 Runtime/Frame failure；
- Frame lifecycle 不控制 Data carrier/Render Domain lifecycle。
