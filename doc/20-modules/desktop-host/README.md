# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Desktop Platform Composition realization：Node Runner、Hostra Window、WebSocket、Runner provisioning IPC、DataConnectionBroker、HTTP/filesystem 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher / Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

本文描述 Hostra Desktop Platform Composition realization，不是 `@loomrealm/platform-hostra` 包规范。

---

## 1. Composition

```text
Game Package {key,module}
        ↓
Hostra Desktop
├── Node Runtime Hosting / Supervisor
├── Host-owned Node Subsystem Runner
├── Runtime Control WebSocket
├── Runner Platform Provisioning IPC
├── Hostra Renderer Hosting
├── Renderer Control WebSocket
├── DataConnectionBroker / Data WebSocket
└── fs + localhost HTTP Content
        ↓
platform-neutral Main / Renderer / Subsystem
```

Hostra只拥有 physical topology，不拥有 Frame/Activation/InputTarget/DataAuthority/Render state。

---

## 2. Runner Model

Process entry：

```text
Host-owned Node Runner
```

业务：

```text
descriptor.module = package-local .mjs Definition Module
```

Runner：

```text
parse Platform bootstrap
→ import exact declared module
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

Game Package不选择 Node executable/argv/env/Runner/WebSocket。

---

## 3. Hostra Shell Separation

```text
Hostra Shell RPC
    window/platform shell operations

LoomRealm Runtime Control
    Control + Frame

LoomRealm Renderer Control
    Main committed authority

LoomRealm Renderer Data
    Data Profile: Connection + Input + Render

Platform Provisioning IPC
    physical infrastructure material for Runner
```

这些可以都由同一产品进程协调，但 protocol/authority domain完全不同。

---

## 4. Runtime Bootstrap

```text
validate descriptor/module
→ Launch Attempt/token
→ establish Runner provisioning capability
→ spawn Host-owned Runner Process
→ Runner loads module
→ Runtime Control WS
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
module valid != spawned != connected != identified != ready
ready != Data offer/carrier
```

`stopped` 只来自 process termination observation。

---

## 5. Runtime Control WebSocket

```text
one WebSocket text message
= one UTF-8 JSON text string
= one JSON-RPC message
```

no binary/no Batch/no adapter retry/duplicate。

Frame transaction ordering保持 Response-before-dependent-RPC / ACK-before-publication。

---

## 6. Renderer Hosting / Control

```text
Main Renderer intent
→ Hostra BrowserWindow/Web app
→ Renderer Control WebSocket
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot：

```text
Runtime/Stack/Activation/InputTarget
DataAuthority {S,G,dataProfile}
```

不携 Data endpoint/ticket/IPC/window identity。

---

## 7. DataConnectionBroker

当前 authority：

```text
DataAuthority(S,G,P)
```

Broker：

```text
bind current Session/Renderer/S/G/P
→ create/provision authenticated Data WebSocket material
→ supply Renderer side
→ supply target Runner side through Platform Provisioning IPC
→ at most one current Data carrier
```

当前 P：

```text
loomrealm.renderer-data/1
```

Broker不拥有 G/P。

---

## 8. Runner Provisioning IPC

Node Runner在 spawn 时获得 dedicated Host-owned provisioning channel；典型实现 child-process IPC。

它只传 Platform infrastructure material，例如：

```text
fresh Data endpoint/ticket for current S/G/P
revoke/supersede physical material
```

不传：

```text
Frame RPC
Runtime status
business command
Input/Render message
Main authority mutation
```

Runner收到 current Data offer后：

```text
validate own S/G/P
→ connect authenticated Data WebSocket
→ wrap MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
```

same S/G/P reconnect使用 fresh one-time material。

---

## 9. Provisioning Failure

```text
expired/stale ticket
Data WS connect failure
provisioning IPC loss
same-generation reconnect failure
```

本身：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

Data availability可暂时为 zero；Control/Frame可继续健康运行。

---

## 10. Data Application Mapping

Renderer Data Profile v1：

```text
one Data WebSocket text message
= one UTF-8 JSON text child-protocol object
```

one Data dispatcher demux：

```text
input.*
render.*
```

fresh carrier：

```text
Input registry/state empty → republish/baseline
Render registry → fresh snapshots
```

Data retire不销毁 authoritative Render Domain。

---

## 11. Content

```text
filesystem-backed Content Service
→ localhost HTTP
```

Content bearer与 Runtime token/Data ticket相互独立；credential不进入 Frame/Render/business payload。

---

## 12. Composition Root

当前：

```text
apps/desktop
```

组合可能包括：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/launcher-node
@loomrealm/transport-websocket
content adapters
Hostra integration/Runner glue
business modules
```

Node Runner若出现多个真实独立消费者，可再抽 technical integration package；不预建万能 platform package。

---

## 13. Cross-platform Equivalence

与 PWA共享：

```text
same Game Package {key,module}
same Definition Module
same Runtime/Frame/Data/Input/Render/Content logical trace
```

不要求：

```text
PID == Worker id
IPC == Port transfer
WS endpoint == MessagePort
HTTP == Service Worker
```

---

## 14. Tests

至少：

```text
Host-owned Runner is process entry
business module loaded exactly
Runtime Control JSON-text WS
provisioning IPC distinct from application protocols
Data offer S/G/P binding
stale/duplicate offer rejected
same-generation fresh offer
provision failure does not fail Runtime/Frame
Renderer Control has no physical Data material
Data Profile JSON-text demux
fresh input/render baseline
actual process exit → stopped
Hostra/PWA abstract-trace equivalence
```

---

## 15. Final Invariants

1. Hostra implements system Platform Composition，不拥有 Main authority；
2. business Definition Module != process entry；
3. Host-owned Node Runner是 process entry；
4. Runtime Control与 provisioning IPC独立；
5. ready不携/暗示 Data offer；
6. Renderer Control只发布 S/G/dataProfile；
7. Broker经 provisioning IPC给 Runner动态提供 Data material；
8. Broker/provisioning不拥有 generation/profile；
9. Data provisioning/loss不等于 Runtime failure/Frame unwind；
10. Control/Data都使用 UTF-8 JSON text application unit；
11. Frame/Data/Render lifecycles独立；
12. Hostra/PWA logical application semantics等价。