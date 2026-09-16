# Renderer ⇄ Subsystem Data Application Profile v2

> 层级：正式契约 / Application Profile  
> 状态：Draft / Normative Candidate / Not Frozen  
> Profile 版本：2  
> Profile 标识：`loomrealm.renderer-data/2`  
> 主要定义：Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1 的固定组合、single reader/writer、direction、fresh-carrier child baselines、terminal boundary  
> 依赖：[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)、[Viewport State v1](./viewport-state-v1.md)  
> Compatibility predecessor：[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> Conformance：[Renderer Data Profile v2 Conformance](./renderer-data-profile-conformance-v2.md)  
> 决策：[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达候选规范强度。

核心原则：

> **Profile v2 是一个新的完整 application-stack identity，不是 v1 上的 optional extension。它复用 Frozen Connection/Input/Render v1，并新增独立 Viewport State v1。共享 carrier只共享 application-unit ordering、reader/writer与 terminal boundary，不合并 child authority、revision、transaction、ACK 或 replay。**

---

## 1. Composition

```text
loomrealm.renderer-data/2
├── Data Connection v1
├── User Input v1
├── Render Update v1
└── Viewport State v1
```

固定版本：

```text
Data Connection = 1
User Input      = 1
Render Update   = 1
Viewport State  = 1
```

实现声明支持 Profile v2 时 MUST 支持全部四个 component；不得只增加 `viewport.state` parser 仍宣称 v2。

Profile v1 保持：

```text
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1
```

v1 与 v2 是不同 compatibility identity。

---

## 2. Selection / DataAuthority

Main 继续通过 Renderer Control 的 `RendererDataAuthorityV1` 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

Target implementation subject 的 canonical product policy MUST 为该 subject current Renderer⇄Subsystem DataAuthorities选择：

```text
loomrealm.renderer-data/2
```

Platform broker只实现已选择的 `(S,G,P)`，不得自行 upgrade/downgrade。

Profile replacement：

```text
loomrealm.renderer-data/1 → loomrealm.renderer-data/2
```

MUST 是 DataAuthority replacement + fresh generation。不得 same-generation静默改变 profile semantics。

当前 slice不定义：

```text
carrier negotiation
feature bits
Game Entry requested profile
per-Subsystem profile preference
fallback/downgrade handshake
```

---

## 3. Application Unit / Common Preflight

沿用 Profile v1：

```text
one carrier application unit
= one UTF-8 JSON text string
= one child-protocol message object
```

Hostra/WebSocket 与 PWA/MessagePort 的 exact physical application-unit mapping继续由现有 Data Connection/Profile mechanics定义。

Profile v2 common preflight继续固定：

```text
carrier unit is string
→ actual UTF-8 bytes <= 1 MiB
→ Wire parseJsonText
→ Wire representation validation
→ JSON container depth <= 64
→ exact top-level type discrimination
→ child exact validation
```

不得先无界 parse/buffer后拒绝。

---

## 4. Exact Namespace / Direction

Profile v2 有三个 application namespace：

```text
input.*
render.*
viewport.*
```

Subsystem → Renderer：

```text
input.interest
render.domains
render.snapshot
render.patch
render.event
```

Renderer → Subsystem：

```text
input.state
input.event
input.reset
viewport.state
```

Unknown top-level type、known type wrong direction、cross-namespace masquerade、malformed child shape均 protocol-invalid / Data-fatal。

不得把 v2 unknown namespace作为“未来 extension”忽略。

---

## 5. Single Reader / Dispatcher

每个 current carrier只有一个 inbound reader/ordered dispatcher。

Subsystem side：

```text
input.*    → Input child receiver
viewport.* → Viewport child receiver
```

Renderer side：

```text
input.interest → Input child receiver
render.*       → Render child receiver
```

任何 child handler不得竞争 raw carrier reader。

Child exact validation发生在 common preflight后、semantic state mutation前。

---

## 6. Single Serialized Writer

每端只有一个 connection-wide serialized writer。不同 child messages共享 emission order；child sender不得绕开 writer直接写 raw carrier。

共享 writer只建立：

```text
application-unit total send order on one carrier
```

不建立：

```text
cross-child transaction
cross-child revision
cross-child ACK
atomic Input+Viewport+Render snapshot
```

Viewport resize与 Render update如果业务上需要因果一致，必须由 author/application状态设计实现，而不是假设 Profile 提供跨方向事务。

---

## 7. Fresh Carrier Composition

Fresh carrier child baseline彼此独立。

### User Input

沿用 Frozen v1：

```text
remote Interest baseline fresh
retained State baseline fresh
Event future-only
```

### Render

沿用 Frozen v1：

```text
current Registry
→ current Domain Snapshots
→ ordinary Patch/Event
```

### Viewport

```text
if Renderer has legal current sample
→ promptly enqueue fresh viewport.state baseline
else
→ no synthetic default/null/0 message
→ first legal sample publishes later
```

Profile不要求三个 child baseline组成 atomic super-snapshot，也不要求固定 child-first ordering beyond actual serialized writer order。

---

## 8. Terminal Boundary

Connection terminal is first-wins according to existing Data Connection/Profile rules。

Protocol-invalid message in any child：

```text
→ current Data carrier terminal/retired
→ stop further application publication on that carrier
```

这不自动意味着：

```text
Runtime failure
Frame unwind
RenderDomain destroy
Main DataAuthority mutation
```

Those authorities recover/retire through their existing owners.

Viewport listener/application callback failure is not a child protocol failure and MUST NOT terminalize Data。

---

## 9. Compatibility

Profile v1 receiver encountering `viewport.state` MUST treat it as invalid for that profile；v1不得 silently accept v2 semantics。

Profile v2 inherits v1 Input/Render exact semantics unchanged。Implementation不得为了 v2重新解释：

```text
Input Effective gate
Render revision/baseline
Data Connection identity/currentness
1 MiB/depth-64 common limits
```

npm package semver != Profile version != child protocol version。

---

## 10. Implementation Surface

Expected package-level effect：

```text
@loomrealm/data
    profile-v2 discriminator/types/peer dispatch
    viewport send/receive role surface

@loomrealm/renderer
    trusted viewport source integration
    current viewport publication

@loomrealm/subsystem
    retained viewport receiver
    SubsystemScope.viewport author projection

@loomrealm/main
    canonical target profile policy selects /2
    no viewport width/height storage
```

Exact private class/helper names are not contract。

---

## 11. Final Invariants

1. Profile v2 is a complete explicit compatibility identity.
2. Profile v1 remains Frozen and unchanged.
3. Main chooses profile as DataAuthority; broker only realizes it.
4. Profile change requires fresh generation.
5. Input/Render/Viewport share reader/writer/order/terminal only.
6. No cross-child transaction/revision/ACK/replay exists.
7. Viewport is Renderer→Subsystem only and independent of InputTarget.
8. Malformed any child retires Data; ordinary child-local/application failures do not mutate Main authority.
