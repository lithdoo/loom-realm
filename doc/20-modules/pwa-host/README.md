# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA Platform Composition realization：PWA Launch Manifest/Plan、Window、Worker Runner、MessagePort/MessageChannel、Worker provisioning、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文描述完整 PWA Platform Composition realization，不是 `@loomrealm/platform-pwa` mega-package规范。`@loomrealm/game-launcher-pwa`只拥有 Subsystem Runtime launch planning/hosting/Runner integration。

---

## 1. Composition

```text
Game Entry {key...} + initial
        +
launch.pwa.json {key,module...}
        ↓
PWA Launch Planner
        ↓ exact key-set join / full executable preflight
PwaLaunchPlan
        ↓
PWA Platform
├── Worker RuntimeHosting / Supervision
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

## 2. PWA Launch Manifest / Preflight

Game Package只给 logical key；PWA executable binding来自：

```text
launch.pwa.json
```

当前 binding：

```ts
interface PwaSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}
```

在 first Worker creation前必须：

```text
validate Game Entry
→ validate PWA Launch Manifest
→ exact Game↔PWA key-set join
→ validate all module logical paths
→ resolve through selected Installation Registry
→ enforce same-origin/trusted-installation execution policy
→ validate Worker/MessageChannel/Runner capability
→ freeze immutable PwaLaunchPlan
```

任何 preflight failure：

```text
Worker create = 0
business module import = 0
Runtime Control establish = 0
```

PWA module不得是 arbitrary external/file/blob URL supplied by game config。

---

## 3. Worker Runner

PWA physical entry：

```text
Dedicated Worker entry = Host-owned Worker Runner
```

业务：

```text
PwaLaunchPlan[key].module
    = current installation executable .mjs
```

Runner：

```text
receive/validate Platform bootstrap
→ verify subsystemKey + planned module binding
→ resolve/import exact planned module target
→ validate default SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

业务 module不得创建 Worker、寻找 bootstrap MessagePort、读取 launch manifest或分支 PWA业务语义。

PWA/Hostra selected artifact可以不同，但必须实现同一 ABI和等价业务语义。

---

## 4. PWA Host Policy

`launch.pwa.json`可以选择 selected installation 内业务 artifact，但不得控制：

```text
Host-owned Worker Runner URL/entry
arbitrary Worker constructor options
bootstrap/Runtime Control/Data MessagePort
credential material
CSP/same-origin policy
Service Worker authority
resource/timeouts
```

这些属于 PWA Host deployment/security policy。

---

## 5. Runtime Bootstrap

```text
PwaLaunchPlan already frozen
→ Main creates Launch Attempt/bootstrap auth for key
→ RuntimeHosting looks up plan[key]
→ create Dedicated Worker running Host-owned Runner
→ establish Runner provisioning capability
→ Runner imports exact planned module
→ Runtime Control Port available
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
plan valid != Worker created != module loaded != connected != identified != ready
ready != Data Port/offer/current carrier
```

Module import/ABI failure使 required bootstrap失败并统一 cleanup。

---

## 6. Runtime Control MessagePort

Runtime Control application unit：

```text
postMessage(string)
= one UTF-8 JSON text JSON-RPC message
```

Structured Clone只用于 Platform bootstrap/Port transfer，不形成第二套 application value model。

Control loss / unexpected Worker termination仍属于 Runtime failure；same-attempt Control reconnect不存在。

---

## 7. Renderer Hosting / Control

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

不携：

```text
Data MessagePort
transfer object
platform credential
PwaLaunchPlan/module URL
Worker identity
```

Renderer Control application unit同样是 `postMessage(string)`。

---

## 8. DataConnectionBroker

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

Broker不拥有 G/P。Profile改变必须 fresh generation。

---

## 9. Worker Platform Provisioning Path

Worker Runner必须有独立于 Runtime Control/Data carrier 的 Platform provisioning path，用于 Runtime已经运行后接收新的 infrastructure capability。

典型：

```text
Host-owned bootstrap/provisioning MessagePort
```

它可以承载：

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
Game/PWA launch manifest update channel
```

具体 provisioning message shape属于 PWA composition internal implementation，不冻结成 LoomRealm application protocol。

---

## 10. Data Installation

Runner收到 current Data offer/Port：

```text
validate own subsystem + generation + dataProfile
→ accept transferred MessagePort
→ wrap MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

Renderer side同理由 `RendererDataBinding`安装 matching carrier。

Data carrier：

```text
postMessage(string)
= one UTF-8 JSON text child-protocol object
```

不得直接 post structured application objects。

---

## 11. Same-generation Reconnect / Revocation

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

## 12. Provisioning Failure Domain

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

## 13. Data Profile / Input / Render

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

## 14. Content

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

只实现 Content API logical semantics。

Definition Module executable loading属于 trusted Launcher/Runner/installation capability，不通过 ordinary Content API给业务 arbitrary executable access。

---

## 15. Browser / Worker Freedom

PWA implementation可以调整：

```text
Host-owned Worker constructor options
bootstrap/provisioning message shape
MessageChannel creation order
Port transfer mechanics
module URL materialization
Service Worker registration
OPFS/cache details
```

但不能改变：

```text
Game logical subsystem key
PwaLaunchPlan binding after preflight
Definition Module ABI
Runtime Control semantics
Frame transaction/recovery
Data S/G/Profile authority
User Input/Render semantics
Content logical API
```

Platform-selected artifact可不同于 Hostra，但不得改变 observable business contract。

---

## 16. Composition Root

当前：

```text
apps/pwa
```

可能组合：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/game-launcher-pwa
@loomrealm/transport-messageport
@loomrealm/content-service-worker
PWA Renderer/Data Broker integration
business artifacts
```

`game-launcher-pwa`不扩成万能 `platform-pwa` package。

---

## 17. Cross-platform Equivalence

Hostra/PWA共享：

```text
same Game Entry logical topology
same subsystem keys
same Subsystem Definition ABI
same logical scenario/business expectations
same formal application semantics
```

允许各自 launch manifest与 Definition artifact不同。

比较：

```text
Runtime lifecycle
Frame outcome/unwind
Renderer authority
Data S/G/P current-retired lifecycle
Input delivered semantics
Render authoritative replica
Content logical results
business observable state
```

不比较：

```text
module path/bytes
Worker id vs PID
Port transfer vs IPC ticket
MessagePort vs WebSocket
Service Worker vs HTTP server
```

---

## 18. Tests

至少：

```text
valid/invalid PWA manifest
exact Game↔PWA key-set join
all modules resolved/security-checked before first Worker creation
preflight failure zero Worker/import/Control side effect
Host-owned Worker Runner is constructor entry
Runner imports exact planned Definition Module
Main launch has no module
manifest cannot override Runner/Port/CSP/credential policy
Runtime Control postMessage(string)
created != loaded != connected != identified != ready
ready independent from Data offer
provisioning path distinct from Runtime/Data application protocols
Data transfer binds S/G/P
stale/duplicate transferred endpoint rejected
same-generation fresh MessageChannel
profile change requires fresh generation
provision failure does not fail Runtime/Frame
single Data dispatcher
fresh Input/Render baseline
actual Worker termination → stopped
unexpected termination → Runtime failure
no auto restart
PWA/Hostra abstract-trace equivalence
```

---

## 19. Final Invariants

1. Game Package只声明 logical key；PWA manifest拥有 key→PWA module binding；
2. Game/PWA key set Phase 1严格相等；
3. immutable PwaLaunchPlan在 first Worker side effect前冻结；
4. Main launch只使用 key，不携 module URL/Worker options；
5. business module != Worker entry；
6. Host-owned Worker Runner是 Runtime physical entry；
7. PWA manifest不能覆盖 Host Runner/security/credential policy；
8. Runtime Control与 provisioning path独立；
9. ready不携/暗示 Data Port/offer；
10. Renderer Control只发布 S/G/dataProfile；
11. Broker通过 Worker provisioning path动态交付 Data endpoint；
12. RendererDataBinding / SubsystemDataBinding是同一 Broker两端投影；
13. Broker/provisioning不拥有 generation/profile；
14. Data provisioning/loss不等于 Runtime failure/Frame unwind；
15. Control/Data MessagePort application unit统一 JSON text string；
16. Frame/Data/Render lifecycle独立；
17. PWA/Hostra artifact/physical mechanism可不同，但 logical application semantics等价。
