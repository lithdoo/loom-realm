# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨角色协议/Profile入口、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-19

契约层只保留**跨角色/跨实现必须一致的可观察语义**。Platform physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

---

## 1. Current Contract Map

```text
Game Package v1
    platform-neutral {key,module}
    ↓
Desktop Node.js Launcher / Subsystem Runner Profile v1
    ↓
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

## 2. Game Package / Runner

[Game Package v1](./game-package-v1.md) 当前形状：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

Game Package只声明 logical Subsystem + platform-neutral Definition Module，不声明 Node/Worker/Transport/env。

[Desktop Node.js Launcher / Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md) 定义 Host-owned Node Runner realization，并提供独立 Platform Provisioning Channel给已运行 Runner后续获得 Data material。

```text
business module != process entry
ready != Data provisioning
```

PWA Worker Runner是同一系统架构的另一 Platform realization，不要求复制 Desktop-specific process profile。

---

## 3. Runtime Control

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

`ready` 不携 Data endpoint/profile/ticket/Port。

---

## 4. Frame / Call v1

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
timeout/loss ambiguous → Runtime failure
lowest-root whole-suffix fixed-point unwind
```

SDK ergonomics不得改变这些事实。

---

## 5. Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 committed authority：

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

不携 endpoint/ticket/MessagePort/Interest/Render State。

Control/Data无跨连接 total order。

---

## 6. Renderer Data Application Profile v1

[Renderer Data Profile v1](./renderer-data-profile-v1.md)：

```text
Profile identity = loomrealm.renderer-data/1

Connection v1
+ User Input v1
+ Render Update v1
```

冻结：

```text
child protocol version binding
one UTF-8 JSON text string per carrier unit
one connection-wide Data dispatcher
input.* / render.* demux
fresh-carrier child baseline
```

Profile改变必须 fresh Data generation。

---

## 7. Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md)：

```text
identity = Session + current Renderer + subsystemKey + generation
attribute = current dataProfile
lifecycle = current → retired
0..1 current per Subsystem
same S/G/profile sequential reconnect allowed
```

Connection Core zero application messages。

Data loss/provisioning failure不等于 Runtime failure/Frame unwind。

---

## 8. User Input v1

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

Interest Frame-scoped、无 Activation；fresh Activation可复用 config但不可复用 Input State/Event；fresh Data registry/state empty。

标准 channel payload/hard limits仍是 Frozen前 closure work。

---

## 9. Render Update v1

[Render Update v1](./render-update-v1.md)：

```text
render.domains
render.snapshot
render.patch
render.event
```

Domain lifecycle independent from Frame/Data carrier；fresh carrier以 Registry + fresh Snapshots恢复 replica baseline。

---

## 10. Content API v1

[Content API v1](./content-api-v1.md)：

```text
readonly GET/HEAD logical identity
Desktop HTTP bearer semantics
PWA same-origin Service Worker authority
```

Host credential distribution是 Platform implementation responsibility；不建立 Content Access Bootstrap Protocol。

---

## 11. Platform Boundary

以下默认不是 application protocol：

```text
Node child IPC provisioning payload
WebSocket endpoint discovery
Data bearer ticket format
MessageChannel/Port transfer object
Worker startup object
Content credential injection
Hostra Shell RPC
```

只有未来出现独立第三方实现必须共享且影响 interoperability/security 的新 wire boundary时，才升级为正式 Contract/Profile。

---

## 12. Unified Carrier Policy

当前 message-oriented profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

因此 WebSocket/MessagePort共享同一 application value model；Structured Clone不扩大协议 payload。

---

## 13. Authority Summary

```text
Main
    Runtime/Frame/Activation/InputTarget/DataAuthority

Subsystem
    business state / Interest[F] / Render Domains

Renderer
    read-only Main mirror / Producers / Render replica

Platform
    physical topology/bootstrap/provisioning
```

共享 carrier/package不改变 authority owner。

---

## 14. Current Closure Priorities

Frozen：

```text
Frame / Call v1
```

Stabilizing / closure：

```text
Subsystem Control
Runtime Control Profile
Renderer Data Profile
User Input
Render Update
```

实施期间必须优先验证：

```text
business Definition Module → Runner → role ports
Frame protocol → SDK FrameOutcome/control-flow
DataAuthority → Broker → Renderer/Subsystem current carrier
Hostra/PWA same abstract trace
```

这些闭合后再扩展 deferred capabilities。