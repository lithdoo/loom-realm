# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Desktop 对系统级 Platform Composition 的 realization：Node Runtime/Subsystem Runner、Hostra Window、WebSocket、HTTP/filesystem、Data Connection Broker 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher / Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 最近复核：2026-08-19

本文描述 Hostra Desktop Platform Composition realization，不是 `@loomrealm/platform-hostra` 包规范。

---

## 1. Composition Boundary

```text
Game Package {key,module}
        ↓
Hostra Desktop Platform
├── Runtime Hosting / Supervision
├── Node Subsystem Runner
├── Runtime / Renderer Control binding
├── Renderer Hosting
├── Data Connection Broker
└── Content Binding
        ↓
platform-neutral LoomRealm roles
```

Hostra只拥有物理 topology，不拥有 Frame/Activation/InputTarget/DataAuthority/Render application authority。

---

## 2. Desktop Mapping

```text
Subsystem Definition Module
    → same package-local .mjs declared by Game Package

RuntimeHosting
    → Host-selected Node child process

SubsystemRunner
    → Host-owned Node Runner process entry
    → imports descriptor.module

RuntimeControlBinding
    → localhost WebSocket

RendererHosting
    → Hostra/Electron BrowserWindow

RendererControlBinding
    → localhost WebSocket

DataConnectionBroker
    → authenticated localhost carrier

ContentBinding
    → filesystem-backed service + localhost HTTP
```

Game Package不选择 Node executable、process argv/env或 WebSocket。

---

## 3. Host-owned Runner

Desktop process entry永远是 Host-owned Runner，而不是业务 `descriptor.module`。

```text
Node process
    Host-owned Runner
        ↓ import
    game-owned Definition Module
        ↓
    @loomrealm/subsystem host integration
```

Runner负责：

```text
parse Host bootstrap context
load/validate exact declared .mjs module
construct Subsystem-facing Platform Ports
start Subsystem role
```

业务 module不得自己读取 Hostra bootstrap、建立 Control/Data WebSocket或选择平台实现。

---

## 4. Hostra Shell / LoomRealm Protocol Separation

Hostra Shell RPC 与 LoomRealm protocols保持独立：

```text
Hostra Shell RPC
    window/platform operations

Runtime Control
    Subsystem Control + Frame/Call

Renderer Control
    Main committed authority

Data
    User Input + Render Update
```

共享 WebSocket技术不等于共享 protocol namespace/authority。

---

## 5. Runtime Bootstrap

```text
validate Game Package Descriptor set
→ resolve descriptor.module inside current installation
→ create Launch Attempt/bootstrap auth
→ spawn Host-owned Node Runner
→ Runner imports module
→ establish Runtime Control Binding
→ subsystem.hello
→ identified
→ ready
```

```text
module valid != process spawned != connected != identified != ready
```

`ready` 不携 Renderer Data endpoint/ticket/generation。

`stopped` 只来自实际 child process termination observation。

---

## 6. Runtime Control

同一 authenticated Control carrier承载：

```text
Subsystem Control v1
Frame / Call v1
```

WebSocket adapter保持 one text message = one JSON-RPC application message、per-direction order、no Batch、no adapter retry/duplicate。

Frame transaction ordering不由 Platform改变。

---

## 7. Renderer Hosting / Control

Hostra BrowserWindow是 Renderer participant物理宿主。

```text
Main Renderer intent
→ Platform opens/loads Renderer
→ Renderer Control WebSocket
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot不携 Data endpoint/ticket或 Hostra Window identity作为 application authority。

---

## 8. Data Connection Broker

```text
Main current DataAuthority(S,G)
→ Desktop DataConnectionBroker
→ provision authenticated localhost endpoints/material
→ bind Session/current Renderer/S/G
→ deliver role-local connection capability to Renderer + target Subsystem Runner
→ install at most one current Data Connection
```

Broker不拥有 generation。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Data retire != Render Domain destroy
```

same generation仍授权时，old carrier retired后可建立 fresh carrier。

---

## 9. Input / Render Recovery

fresh Data carrier：

```text
User Input
    Frame Interest Registry = empty remotely
    retained Input State = empty
    Subsystem republishes current desired full registry

Render Update
    current Domain Registry
    fresh Snapshot for current Domains
    then Patch/Event
```

业务 InputListener/RenderDomain对象不因 carrier replacement重建。

---

## 10. Content

Desktop Content composition可以使用 filesystem + localhost HTTP；Content logical route/cache/version/integrity/error semantics遵守 Content API。

Content credential与 Runtime bootstrap credential分离；Definition Module executable capability不通过普通 Content API暴露。

---

## 11. Composition Root / Package Boundary

当前 realization root：

```text
apps/desktop
```

可能组合：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/launcher-node
@loomrealm/transport-websocket
content adapters
Hostra integration glue
business Subsystem modules
```

如果 Node Subsystem Runner形成稳定复用边界，可按真实消费者抽成独立 technical integration package；Platform Architecture本身不要求大而全 `platform-hostra` 包。

---

## 12. Cross-platform Equivalence

Hostra Desktop 与 PWA 对相同：

```text
Game Package Descriptor {key,module}
Subsystem Definition Module
application trace
```

必须得到等价：

```text
Runtime lifecycle
Frame/Activation outcome/unwind
Renderer authority
Data identity/lifecycle
User Input semantics
Render authoritative state
Content logical results
```

PID/WS URL/Hostra Window/HTTP port不需要相同。

---

## 13. Core Invariants

- Game Package只声明 `key + module`；
- Node process entry是 Host-owned Runner，不是 business module；
- same business `.mjs` module可供 PWA Runner加载；
- Runner负责 Platform ports/bootstrap，business module只负责业务；
- Hostra Shell RPC 与 LoomRealm protocols分离；
- Runtime Control = Control v1 + Frame v1；
- ready不携 Data endpoint；
- Data Broker不拥有 generation；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Data/Render lifecycle。
