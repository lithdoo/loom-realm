# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Desktop 对系统级 Platform Composition 的 realization：Node Process、Hostra Window、WebSocket、HTTP/filesystem、Data Connection Broker 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 分包：[独立分包与发布架构](../../30-implementation/package-architecture.md)  
> 最近复核：2026-08-19

本文描述 **Hostra Desktop Platform Composition realization**，不是 `@loomrealm/platform-hostra` 公共包规范。

Hostra 是独立 Electron local shell；LoomRealm 使用它提供的 BrowserWindow / desktop lifecycle / local integration 能力，但 Hostra 不拥有 LoomRealm Frame Stack、Activation、failure unwind、Subsystem business state、DataAuthority 或 Render authority。

---

## 1. Composition Boundary

```text
                LoomRealm logical roles
        Main / Renderer / Subsystem / Content
                         │
                    Platform Ports
                         │
                         ▼
                  Hostra Desktop
```

Desktop composition 负责：

```text
Runtime Hosting / Supervision
Runtime Control physical binding
Renderer Hosting
Renderer Control physical binding
Renderer⇄Subsystem Data Connection Broker
Content physical binding
product startup / shutdown
```

它不得成为 application authority。

---

## 2. Desktop Platform Mapping

```text
RuntimeHosting
    → Host-selected Node.js child process

RuntimeSupervisor
    → process exit / termination observation

RuntimeControlBinding
    → localhost WebSocket

RendererHosting
    → Hostra / Electron BrowserWindow

RendererControlBinding
    → localhost WebSocket

DataConnectionBroker
    → authenticated localhost carrier

ContentBinding
    → filesystem-backed service + localhost HTTP
```

这些实现系统级 Platform ports；上层 role packages 不需要知道 Hostra/WebSocket/process 细节。

---

## 3. Hostra Shell 与 LoomRealm Protocol 分离

Hostra 自身的 WebSocket JSON-RPC 用于 shell/platform 操作，例如 window/platform capability。

它不得与 LoomRealm application protocols 混成同一 method namespace：

```text
Hostra Shell RPC
    window/platform lifecycle operations

LoomRealm Runtime Control
    Subsystem Control v1 + Frame / Call v1

LoomRealm Renderer Control
    Main committed authority

LoomRealm Data
    User Input + Render Update
```

即使多条链路都使用 WebSocket，`shared technology != shared protocol domain`。

---

## 4. Runtime Hosting

Node executable bootstrap/supervision 由 Desktop Runtime Hosting realization 承担。当前 launcher interoperability boundary 仍遵守 Desktop Node.js Launcher Profile v1：

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

Launcher/Platform 不拥有 Runtime/Frame authority。

```text
spawn success != connected != identified != ready
```

`stopped` 只来自实际 child termination observation。

---

## 5. Runtime Control Binding

同一 authenticated Main⇄Subsystem Control carrier 承载：

```text
Subsystem Control v1
Frame / Call v1
```

WebSocket adapter 必须保持：

```text
one complete WebSocket text message
=
one JSON-RPC application message
```

no Batch；per-direction order；no adapter-created application retry/duplicate。

必须保持：

```text
call acceptance → call Response → Child initialize/activate
return acceptance → return Response → close/resume
activate/resume ACK → InputTarget publication
```

Runtime `ready` 不携 Renderer Data URL/ticket/credential/generation。

---

## 6. Renderer Hosting / Control

Hostra/Electron BrowserWindow 是 Renderer participant 的物理宿主，不拥有 Renderer Control authority。

逻辑流程：

```text
Main Renderer intent
→ Desktop composition opens/loads Renderer window
→ establish Renderer Control WebSocket
→ renderer.hello
→ current full Authority Snapshot
```

Renderer Control Snapshot 不携 Data endpoint/ticket，也不携 Hostra Window identity 作为 application authority。

---

## 7. Data Connection Broker

Desktop Data carrier 不能由 Renderer 或 Subsystem 单边自行发现/建立；由 composition/broker 协调两端。

```text
Main commits DataAuthority(S,G)
→ Desktop DataConnectionBroker
→ provision endpoint/auth material
→ bind Renderer endpoint + Subsystem endpoint to Session/current Renderer/S/G
→ install at most one current Data Connection
```

实现 MAY 使用 localhost WebSocket endpoint + one-shot ticket，但这些 material：

```text
MUST NOT enter Runtime ready
MUST NOT enter Renderer Authority Snapshot
MUST NOT become DataAuthority identity
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Data retire != Render Domain destroy
```

same generation 仍授权时，old carrier retired 后可建立 fresh carrier。

---

## 8. User Input / Render Recovery

fresh Data carrier：

```text
User Input
    Interest Registry = empty
    Subsystem republishes current full Frame Interest Registry
    State establishes fresh baselines
    Event no replay

Render Update
    current Domain Registry
    fresh Snapshot every current Domain
    then Patch/Event
```

Frame suspension/resume 不创建/销毁 Data carrier；fresh Activation 可复用同 carrier 上 retained Frame Interest config，但不复用 old Activation input state/event。

---

## 9. Content Binding

Desktop Content 默认组合：

```text
@loomrealm/content
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
```

filesystem、HTTP server、request credential injection 是技术实现；Content API logical route/cache/version/integrity/error semantics 保持一致。

Hostra/Desktop credential plumbing 不进入 Frame/Render/Renderer authority payload。

---

## 10. Composition Root / Package Boundary

当前推荐实现位置：

```text
apps/desktop
```

可能组合：

```text
@loomrealm/main
@loomrealm/renderer
@loomrealm/subsystem consumers
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
```

Platform Architecture 不要求立即建立：

```text
@loomrealm/platform-hostra
```

如果未来相同 Hostra composition glue 被多个独立产品复用，再按独立消费者/public API/release value 评估抽包。

---

## 11. Cross-platform Equivalence

Hostra Desktop 必须与 PWA 对同一个 abstract application trace 保持等价：

```text
Runtime lifecycle
Frame/Activation outcome
failure unwind
Renderer Control authority
Data Connection identity/lifecycle
Frame-scoped User Input semantics
Render authoritative recovery
Content logical results
```

PID、WebSocket URL、Hostra Window、HTTP port 等物理事实不需要与 PWA 对齐。

---

## 12. Conformance / Invariants

Desktop 至少验证：

```text
Control v1 version selection
ready has no Data endpoint
Runtime Control Profile shared-ID/no-Batch rules
Frame transport fixtures
Data broker binds current Session/Renderer/S/G
one current Data carrier per Subsystem
same-generation reconnect only after old retired
fresh Data Input registry empty
Data loss does not fail Runtime/unwind Frame
Content logical semantics unaffected by adapter choice
Hostra/PWA abstract-trace equivalence
```

核心不变量：

- Hostra Desktop implements Platform Composition，不拥有 Main authority；
- Hostra Shell RPC 与 LoomRealm application protocol 分离；
- one Subsystem = one Runtime Process；
- Runtime Control = Control v1 + Frame v1；
- Control ready 不携 Data endpoint；
- no Batch / no application Frame retry；
- failure unwind 只在 Main；
- DataAuthority 是逻辑 authority，不是 endpoint/credential；
- Data Connection Broker只实现 authority，不拥有 generation；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Data carrier/Render Domain lifecycle。
