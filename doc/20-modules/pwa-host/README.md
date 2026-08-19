# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA Platform Composition realization：Window、Main/Subsystem Worker、Worker Runner、MessagePort/MessageChannel、Worker provisioning、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

本文描述 PWA Platform Composition realization，不是 `@loomrealm/platform-pwa` 包规范。

---

## 1. Composition

```text
Game Package {key,module}
        ↓
PWA Platform
├── Worker Runtime Hosting / Supervision
├── Host-owned Worker Subsystem Runner
├── Runtime Control MessagePort
├── Worker Platform Provisioning path
├── browser Window Renderer
├── Renderer Control MessagePort
├── DataConnectionBroker / MessageChannel transfer
└── Fetch + Service Worker / OPFS Content
        ↓
platform-neutral Main / Renderer / Subsystem
```

Window/Worker/Port/Service Worker只负责物理承载，不拥有 Frame/Activation/InputTarget/DataAuthority/Render authority。

---

## 2. Worker Runner

Game Package：

```text
descriptor.module = package-local platform-neutral .mjs
```

PWA Platform：

```text
Dedicated Worker entry = Host-owned Worker Runner
```

Runner：

```text
receive/validate Platform bootstrap
→ resolve/import exact descriptor.module
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

业务 module不得创建 Worker、寻找 MessagePort或分支 PWA业务逻辑。

---

## 3. Runtime Bootstrap

```text
validate Descriptor/module
→ Launch Attempt/bootstrap auth
→ create Dedicated Worker running Runner
→ establish Runner provisioning capability
→ Runner imports module
→ Runtime Control Port available
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
module valid != Worker created != connected != identified != ready
ready != Data Port/offer/current carrier
```

Runtime Control application unit：

```text
postMessage(string)
= one UTF-8 JSON text JSON-RPC message
```

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## 4. Renderer Hosting / Control

```text
Main Renderer intent
→ current browser Window/Web application
→ Renderer Control MessagePort
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot只含 logical：

```text
Runtime / Stack / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 Data MessagePort、transfer object或 platform credential。

Renderer Control application unit同样是 `postMessage(string)`。

---

## 5. DataConnectionBroker

Current authority：

```text
DataAuthority(S,G,P)
```

当前：

```text
P = loomrealm.renderer-data/1
```

Broker：

```text
verify current Session/Renderer/S/G/P
→ create MessageChannel
→ bind both endpoints to S/G/P
→ transfer Renderer endpoint
→ transfer Subsystem endpoint through Worker provisioning path
→ RendererDataBinding yields Renderer side
→ SubsystemDataBinding yields Subsystem side
→ at most one current Data Connection
```

Broker不拥有 G/P。

Profile改变必须 fresh generation。

---

## 6. Worker Platform Provisioning Path

Worker Runner必须有独立于 Runtime Control/Data carrier 的 Platform provisioning path，用于 Runtime已经运行后接收新的 infrastructure capability。

典型：

```text
Host-owned bootstrap/provisioning MessagePort
```

它可以承载 Platform-internal通知与 transferred Port，例如：

```text
fresh Data endpoint for current S/G/P
revoke/supersede old physical material
```

它不是：

```text
Subsystem Control
Frame / Call
Renderer Control
Renderer Data application carrier
business RPC
```

具体 provisioning message shape属于 PWA composition internal implementation，不冻结成 LoomRealm application protocol。

---

## 7. Data Installation

Runner收到 current Data offer/Port：

```text
validate own subsystem + generation + dataProfile
→ accept transferred MessagePort
→ wrap MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

Renderer side同理由 `RendererDataBinding`安装 matching carrier。

Data carrier application unit：

```text
postMessage(string)
= one UTF-8 JSON text child-protocol object
```

不得直接 post structured application objects。

---

## 8. Same-generation Reconnect / Revocation

同一 `S/G/P`仍授权：

```text
old carrier retired/lost
→ Broker MAY create fresh MessageChannel
→ transfer fresh endpoints
→ install fresh current carrier
```

Authority replacement：

```text
old pending/transferred provisioning material becomes stale
old current carrier retires
fresh G2/P2 uses fresh endpoints
```

stale/duplicate endpoint不得重新成为 current。

---

## 9. Provisioning Failure Domain

```text
MessageChannel creation failure
Port transfer/installation failure
provisioning Port loss
same-generation reconnect failure
```

本身：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

结果只是 Data temporarily unavailable。

Runtime Control loss/Worker unexpected termination仍属于 Runtime failure domain。

---

## 10. Data Profile / Input / Render

Renderer Data Profile v1：

```text
Connection v1 + User Input v1 + Render Update v1
```

一个 Data dispatcher demux：

```text
input.*
render.*
```

fresh carrier：

```text
User Input
    remote Interest Registry empty
    retained Input State empty
    Subsystem republishes full desired registry

Render
    current Domain Registry
    fresh Snapshot each Domain
    then Patch/Event
```

Frame suspension可保留 Interest config；fresh Activation不复用 old Input State/Event。

Frame/Data/Render lifecycles独立。

---

## 11. Content

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

只实现 Content API logical semantics。

Definition Module executable loading属于 trusted Runner/installation capability，不通过 ordinary Content API给业务任意 executable access。

---

## 12. Browser / Worker Freedom

PWA implementation可以调整：

```text
Worker constructor options
bootstrap/provisioning message shape
MessageChannel creation order
Port transfer mechanics
module URL materialization
Service Worker registration
OPFS/cache details
```

但不能改变：

```text
same descriptor.module identity
Definition Module ABI
Runtime Control semantics
Frame transaction/recovery
Data S/G/Profile authority
User Input/Render semantics
Content logical API
```

---

## 13. Composition Root

当前：

```text
apps/pwa
```

可能组合：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/transport-messageport
@loomrealm/content-service-worker
Worker Runner/provisioning glue
business modules
```

Worker Runner若出现多个独立消费者，可再抽 technical integration package；不预建万能 `platform-pwa` 包。

---

## 14. Cross-platform Equivalence

Hostra/PWA使用相同：

```text
Game Package {key,module}
Subsystem Definition Module
logical application trace
```

并比较：

```text
Runtime lifecycle
Frame outcome/unwind
Renderer authority
Data S/G/P current-retired lifecycle
Input delivered semantics
Render authoritative replica
Content logical results
```

不比较：

```text
Worker id vs PID
Port transfer vs IPC ticket
MessagePort vs WebSocket
Service Worker vs HTTP server
```

---

## 15. Tests

至少：

```text
Worker Runner imports exact Definition Module
Runtime Control postMessage(string)
provisioning path distinct from Runtime/Data application protocols
Data transfer binds S/G/P
stale/duplicate transferred endpoint rejected
same-generation fresh MessageChannel
profile change requires fresh generation
provision failure does not fail Runtime/Frame
single Data dispatcher
fresh Input/Render baseline
PWA/Hostra abstract-trace equivalence
```

---

## 16. Final Invariants

1. Game Package只声明 key/module；
2. business module != Worker entry；
3. Host-owned Worker Runner是 Runtime entry；
4. Runtime Control与 provisioning path独立；
5. ready不携/暗示 Data Port/offer；
6. Renderer Control只发布 S/G/dataProfile；
7. Broker通过 Worker provisioning path动态交付 Data endpoint；
8. RendererDataBinding / SubsystemDataBinding是同一 Broker两端投影；
9. Broker/provisioning不拥有 generation/profile；
10. Data provisioning/loss不等于 Runtime failure/Frame unwind；
11. Control/Data MessagePort application unit统一 JSON text string；
12. Frame/Data/Render lifecycle独立；
13. PWA/Hostra logical semantics等价。