# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨角色协议/Profile、Game logical topology、Platform launch profiles、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-20

契约层只保留**跨角色/跨实现必须一致的可观察语义**。Platform physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

```text
Game topology != Platform executable binding
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

---

## 1. Current Contract Map

```text
Game Package v1
    Game Entry
    Descriptor {key}
    initial target/input

    ├── Hostra Game Launcher / Node Runner Profile v1
    │       launch.hostra.json
    │       → exact key-set join
    │       → HostraLaunchPlan
    │       → Host-owned Node Runner
    │
    └── PWA Game Launcher / Worker Runner Profile v1
            launch.pwa.json
            → exact key-set join
            → PwaLaunchPlan
            → Host-owned Worker Runner

Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1

Frame / Call v1                         Active / Normative / Frozen
    + Conformance v1

Main ⇄ Renderer Control v1              Active Design / Draft
    ↓ DataAuthority {S,G,dataProfile}
Renderer Data Application Profile v1    Active Design / Draft
    = Data Connection v1
    + User Input v1
    + Render Update v1

Renderer ⇄ Subsystem Data Connection v1 Active Design / Draft
User Input v1                           Active Design / Core Closure Candidate
Render Update v1                        Active Design / Closure Candidate
Readonly Content API v1                 Active / Normative / Evolving
```

---

## 2. Game Package v1

[Game Package v1](./game-package-v1.md) 当前形状：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

Game Entry还包含：

```text
formatVersion
initial.subsystem
initial.input
complete required subsystem key set
```

Game Package只声明 logical topology/business initial input，不声明 executable module、Node/Worker、Transport、env或 provisioning。

`key` 是 Main/Runtime/Frame/Data 使用的 Subsystem application identity。

本次直接更新 current v1：没有 v2、legacy `{key,module}` parser或 compatibility alias。

---

## 3. Platform Launch Profiles

[Hostra Game Launcher / Node Runner Profile v1](./nodejs-launcher-profile-v1.md)：

```text
launch.hostra.json
→ key → Hostra Definition Module binding
→ exact Game key-set join
→ filesystem/install security resolution
→ immutable HostraLaunchPlan
→ Main launch(key)
→ plan-bound RuntimeHosting
→ Host-owned Node Runner
```

[PWA Game Launcher / Worker Runner Profile v1](./pwa-launcher-profile-v1.md)：

```text
launch.pwa.json
→ key → PWA Definition Module binding
→ exact Game key-set join
→ installation/same-origin resolution
→ immutable PwaLaunchPlan
→ Main launch(key)
→ plan-bound RuntimeHosting
→ Host-owned Worker Runner
```

两 profile独立拥有各自 platform config schema/validation/security policy；不建立 universal launcher schema/options bag。

共同 hard invariant：

> **Game validation + current Platform manifest validation + exact join + all required executable resolution + hosting/security preflight MUST complete before the first business Runtime side effect.**

```text
preflight failure
→ Process/Worker create count = 0
→ business module import count = 0
→ Runtime Control establish count = 0
```

Definition Module actual import/default-export ABI validation MAY在 Runner中发生，并按 required Runtime bootstrap failure处理。

---

## 4. Main / Runner Boundary

Main只消费 logical topology与 `subsystemKey`；普通 Runtime launch request不携：

```text
module
filesystem path / URL
Node executable/argv/env
Worker entry/options
Control endpoint/Port
```

Host-owned Runner是 Process/Worker physical entry，并按 frozen PlatformLaunchPlan加载 selected Definition Module。

Definition Module ABI统一为 `@loomrealm/subsystem` 的 `SubsystemDefinitionFactory`。

跨平台要求：

```text
same logical key
same author ABI
same formal protocol semantics
same logical scenario → equivalent business-observable result
```

不要求 same module path/bytes/build artifact。

---

## 5. Runtime Control

[Subsystem Control v1](./subsystem-control-protocol-v1.md)：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

只拥有 Runtime identity/lifecycle。

[Runtime Control Profile v1](./runtime-control-profile-v1.md)：

```text
Control 1 + Frame 1
one connection-wide dispatcher
shared sender Request ID namespace
one UTF-8 JSON text unit per JSON-RPC message
no Batch
```

`ready` 不携：

```text
Data endpoint/profile/ticket/Port
Platform LaunchPlan/module material
Renderer existence
```

same-attempt Control reconnect不存在。

---

## 6. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Frozen。

Exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main authority
one-shot Activation
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
Success = known commit
Explicit Error = protocol-defined known no-commit/fatal
timeout/loss ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole-suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
```

SDK ergonomics不得改变这些事实。

本次 Game/Launcher reset不改变 Frame wire/transaction/failure semantics。

---

## 7. Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {
  subsystemKey,
  generation,
  dataProfile
}
```

不携：

```text
Data endpoint/ticket/MessagePort
Platform executable binding
Interest Registry
Render State
Content credential
```

Control/Data无跨连接 total order。

Control loss使 Renderer失去 current Main authority，并 retire旧 Data connections。

---

## 8. Renderer Data Application Profile v1

[Renderer Data Profile v1](./renderer-data-profile-v1.md)：

```text
Profile identity = loomrealm.renderer-data/1

Connection v1
+ User Input v1
+ Render Update v1
```

Profile负责：

```text
child protocol version binding
one UTF-8 JSON text string per carrier unit
one connection-wide Data dispatcher
input.* / render.* demux
fresh-carrier child baseline
```

Profile改变必须 fresh Data generation。

Connection/Input/Render仍保留各自 identity/lifecycle/authority；Profile只是静态 application-stack binding。

---

## 9. Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md)：

```text
identity = Session + current Renderer + subsystemKey + generation
attribute = immutable dataProfile for that authority epoch
lifecycle = current → retired
0..1 current per Subsystem
same S/G/profile sequential reconnect allowed
```

Connection Core zero application messages。

Platform DataConnectionBroker只实现 current logical authority的 physical carrier；不 mint generation/profile，也不能从 endpoint/ticket/Port推导 authority。

```text
Data loss/provisioning failure
    != Runtime failure
    != Frame unwind
    != DataAuthority mutation
```

---

## 10. User Input v1

[User Input v1](./user-input-v1.md)：

```text
Subsystem → Renderer
    full Frame Interest Registry Snapshot

Renderer → Subsystem
    State / Event / Reset
```

普通 input：

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Interest Frame-scoped、无 Activation；fresh Activation可复用 config但不可复用 old Input State/Event；fresh Data registry/state empty并需 republish/rebaseline。

标准 channel payload/hard limits仍是 Frozen前 closure work。

---

## 11. Render Update v1

[Render Update v1](./render-update-v1.md)：

```text
render.domains
render.snapshot
render.patch
render.event
```

Domain lifecycle independent from Frame/Data carrier。

fresh carrier：

```text
current Domain Registry
→ fresh Snapshot each current Domain
→ Patch/Event
```

Data loss只丢 Renderer replica transport baseline，不销毁 Subsystem authoritative Domain。

---

## 12. Content API v1

[Content API v1](./content-api-v1.md)：

```text
readonly GET/HEAD logical identity
Desktop HTTP bearer semantics
PWA same-origin Service Worker authority
```

Host credential distribution是 Platform implementation responsibility；不建立 Content Access Bootstrap Protocol。

Executable module capability现在由 Platform Launch Profile + trusted Runner拥有，更不能通过 Content API获得 arbitrary executable access。

必须相互独立：

```text
Runtime bootstrap token
Platform executable resolution/Runner capability
Data ticket/Port authority
Content credential
```

---

## 13. Platform Boundary

以下默认不是 application protocol：

```text
Hostra/PWA Launch Manifest physical location
Node child IPC provisioning payload
Worker bootstrap/provisioning Port transfer object
WebSocket endpoint discovery
Data bearer ticket format
Content credential injection
Hostra Shell RPC
```

Platform Launch Manifest本身是对应 Platform Profile 的 installation/launch contract；两个平台不因此共享 universal wire/schema。

只有未来出现独立第三方实现必须共享且影响 interoperability/security 的新 wire boundary时，才升级为正式 Contract/Profile。

---

## 14. Unified Carrier Policy

当前 message-oriented profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

因此 WebSocket/MessagePort/MemoryCarrier共享同一 application value model；Structured Clone不扩大协议 payload。

Transport Adapter不得创建 application retry/duplicate。

---

## 15. Authority Summary

```text
Game Package
    logical topology + initial business input

Main
    Runtime/Frame/Activation/InputTarget/DataAuthority

Subsystem
    business state / Interest[F] / Render Domains

Renderer
    read-only Main mirror / Producers / Render replica

Platform Launcher
    current-platform executable binding
    exact join / preflight LaunchPlan
    RuntimeHosting / Runner launch integration

Platform Composition
    complete physical topology/bootstrap/provisioning
```

共享 carrier/package不改变 authority owner。

---

## 16. Current Closure Priorities

Frozen：

```text
Frame / Call v1
```

Stabilizing / closure：

```text
Game Package v1 implementation validation
Hostra/PWA Launcher Profiles
Subsystem Control
Runtime Control Profile
Renderer Data Profile
User Input
Render Update
```

实施期间必须优先验证：

```text
Game Entry → Platform manifest → exact join → zero-side-effect LaunchPlan
Main launch(key) → plan-bound RuntimeHosting → Host-owned Runner
business Definition → Author SDK → Role Core/Ports
Frame protocol → SDK FrameOutcome/control-flow
DataAuthority → Broker → Renderer/Subsystem current carrier
Hostra/PWA same abstract trace across platform-specific executable bindings
```

这些闭合后再扩展 deferred capabilities。
