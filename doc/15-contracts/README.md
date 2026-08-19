# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨角色协议入口、版本、兼容边界与设计成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-19

契约层只保留**跨角色/跨实现必须一致的可观察语义**。Hostra/PWA physical composition、Process/Worker、endpoint/ticket/Port creation、组件映射、DOM/device conversion 等默认不形成 application Protocol/Profile。

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

共享 Transport 不代表共享 identity/lifecycle/authority/ordering/recovery。

---

## 1. 当前协议地图

```text
Game Package v1
    ↓
Desktop Node.js Launcher Profile v1
    ↓
Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1

Frame / Call v1                         Active / Normative / Frozen
    + Conformance v1

Main ⇄ Renderer Control v1              Active Design / Draft
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection v1 Active Design / Draft
    ├── User Input v1                   Active Design / Core Closure Candidate
    └── Render Update v1                Active Design / Closure Candidate

Readonly Content API v1                 Active / Normative / Evolving
```

Platform Composition 负责 actual physical topology，但**不是新的 application protocol**。

---

## 2. Game Package / Launcher

[Game Package v1](./game-package-v1.md) 定义 required Subsystem Descriptor。

[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md) 是 Desktop Node executable bootstrap/supervision 的真实 interoperability boundary。

```text
physical launch success != connected != identified != ready
```

Launcher/Profile 只覆盖 Desktop Node realization；PWA Worker realization属于 Platform Composition，不要求复制一个 PWA Launcher application protocol，除非未来出现真实跨实现互操作需求。

---

## 3. Subsystem Control v1

[Subsystem Control v1](./subsystem-control-protocol-v1.md)：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

只负责 Runtime identity/lifecycle。

`ready` 不携带/暗示：

```text
Renderer Data endpoint
credential / MessagePort
DataAuthority generation
Frame / Render / InputTarget
```

---

## 4. Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md)：

```text
Subsystem Control v1
+
Frame / Call v1
```

组合规则：

```text
hello before Frame operation
Frame v1 statically bound
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
```

Data/User Input/Render 不进入 Runtime Control Profile。

---

## 5. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Active / Normative / Frozen。

Exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main owns Frame/Stack/Activation/InputTarget
frameId/activationId never reused
Response-before-dependent-RPC
activate/resume ACK-before-publication
post-commit no rollback
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole-suffix fixed-point unwind
accepted outcome preserved
```

Conformance：[Frame / Call v1 Conformance](./frame-call-conformance-v1.md)。

---

## 6. Main ⇄ Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed logical authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

不携 actual Data endpoint/MessagePort/bearer ticket/Render State/Content credential。

Renderer Control 与 Renderer⇄Subsystem Data 没有 cross-connection total order。User Input 必须使用各自当前状态的 conjunction 收敛，而不是依赖 arrival order。

InputTarget 是 one-shot lease；revoked/removed/replaced 后同一 `frameId + activationId` 不 re-grant。

---

## 7. Renderer ⇄ Subsystem Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md) 只定义建立后的 authority/lifecycle：

```text
identity
    Session + current Renderer + subsystemKey + generation

lifecycle
    current → retired
```

Core zero application methods/handshake/heartbeat。

actual carrier 由 System Platform Data Connection Broker 建立，并在安装前安全绑定 current Session/Renderer/subsystem/generation。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
```

同 generation仍授权时，old retired 后可以 fresh carrier。

---

## 8. User Input v1

[User Input v1](./user-input-v1.md) 当前核心模型：

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main current InputTarget == (S,F,A)
∧ current active Frame/Activation
∧ C ∈ Interest[F]
∧ Producer(C) available
```

### Frame Interest Registry

Subsystem-owned input configuration：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

wire publication 是整个 registry 的 full replacement snapshot。

```text
Interest has no activationId
Interest is not authority
no subscribe/unsubscribe patch
no ACK/revision/wildcard
fresh Data Connection registry = empty
```

Frame suspension / fresh Activation 可以保留 `Interest[F]` configuration；旧 Activation Input State/Event 不得跨 fresh Activation replay。

新 Frame 没有 `Interest[F]` 时没有 ordinary input；resume old Frame 可复用 same-carrier retained Interest。

Control authority 与 Interest snapshot 可以任意顺序到达；Renderer 不解释 push/pop/call/return/unwind。

`.state` 每次 Effective false→true 建 fresh self-contained baseline；`.event` future-only/no replay；Reset 清理 Activation-scoped state，不修改 Frame Interest。

standard keyboard/pointer/gamepad canonical payload 继续直接属于 User Input v1；DOM/OS/device mapping 属于 Renderer implementation。

---

## 9. Render Update v1

[Render Update v1](./render-update-v1.md)：

```text
Subsystem → Renderer only

render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

`tag` 是 opaque string；协议不定义 Component Registry/Factory/loading 或 per-tag schema。

fresh Data Connection：

```text
current Domain Registry
→ fresh Snapshot every current Domain
→ Patch/Event
```

无 ACK/NACK、Patch replay、resume cursor、Renderer resync RPC。

Frame/Data carrier lifecycle不拥有 Render Domain lifecycle。

---

## 10. Content API v1

[Readonly Content API v1](./content-api-v1.md) 定义 logical readonly routes、MIME/cache/version/integrity、authorization、status/error mapping。

```text
Hostra Desktop
    filesystem-backed service + localhost HTTP

PWA
    same-origin Fetch + Service Worker / OPFS
```

这些是 Platform/Adapter realization，不改变 Content logical semantics。

Host credential injection、Service Worker registration、Range/queue/deployment 参数默认不建立新的 LoomRealm Profile。

---

## 11. Platform Boundary

契约层当前不定义：

```text
Platform Protocol
Hostra Protocol
PWA Protocol
Data Bootstrap Protocol
Renderer Component Profile
Standard Input Mapping Profile
```

System Platform Composition 负责：

```text
Runtime Hosting
Runtime/Renderer Control physical bindings
Renderer Hosting
Data Connection Broker
Content physical binding
physical resource lifecycle
```

只有未来出现真实第三方 interoperability requirement，且没有共享规则会破坏 authority/identity/state/order/recovery/security 时，才新增 Contract/Profile。

---

## 12. 设计成熟度

以下是**协议设计成熟度**，不是代码实现完成度：

| 链路 / 协议 | 设计成熟度 | 当前实施含义 |
|---|---:|---|
| Game Package v1 | ≈95% | schema/topology 可实现 |
| Desktop Node.js Launcher v1 | 100% / Frozen | 进入实现/conformance |
| Subsystem Control v1 | ≈95% | lifecycle 基本稳定 |
| Runtime Control Profile v1 | ≈95% | 组合规则可直接落地 |
| Frame / Call v1 | 100% / Frozen | 不再等待设计 |
| Main ⇄ Renderer Control v1 | ≈95% | authority snapshot 可实现/freeze review |
| Data Connection v1 | ≈95% | identity/lifecycle 已闭合 |
| User Input v1 | ≈90% | Frame Interest/Activation/reconnect semantics 已闭合；剩 payload/limits/conformance |
| Render Update v1 | ≈85–90% | Registry/Snapshot/Patch/Event 可实现；剩 limits/conformance |
| Content API v1 | ≈85–90% | logical API 足够实现 |

整体 application protocol architecture 粗略 ≈90%+；当前工作重点应是实现、executable conformance 与少量 wire limits/payload 收尾。

---

## 13. 当前主要剩余工作

```text
P0  User Input canonical payload + hard limits + conformance
P0  Render Update hard limits + conformance
P1  Renderer Control / Data Connection Frozen review
P1  Control/Profile final conformance review
P2  Content implementation/conformance
P2  Hostra/PWA Platform Composition implementation + semantic equivalence
```

Platform implementation 发现的纯 bootstrap/Port/endpoint 差异默认回到 Architecture/Modules/Implementation，而不是自动增加协议。

---

## 14. 协议最小化规则

成为正式 Protocol/Profile 的内容必须满足：

> 两个独立实现若不共享该规则，就会无法互操作，或在 authority、identity、state、ordering、recovery、security 上产生分歧。

否则优先留在：

```text
10-architecture
20-modules
30-implementation
package DESIGN
app composition
```

当前主线的目标仍是：**单一 authority、闭合 lifecycle、最小 wire surface，只标准化真正需要互操作的事实。**
