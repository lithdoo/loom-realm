# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；M10 Input Implemented / Qualified；**M11 Render Implementation Frozen / Ready**  
> 稳定程度：M8/M10 Implementation Closed / M11 implementation shape Frozen  
> 主要定义：Renderer Control holder、per-subsystem Data reconciliation、M10 Input gate/source、M11 internal Render Store placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> M11 实施：[M11 / 03](../../../M11_03_RENDERER_STORE.md) · [M11 / 05](../../../M11_05_QUALIFICATION_CLOSURE.md)  
> 最近复核：2026-09-07

Renderer 不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers 上执行 Input sender与 Render receiver role behavior。

---

## 1. Current Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current {peer,snapshot} | null
    ├── per-subsystem Data slot
    │   ├── desired identity = Control peer + subsystemKey + generation + profile
    │   ├── 0..1 current RendererDataPeer
    │   ├── 0..1 pending acquire
    │   ├── 0..1 failed desired identity
    │   ├── M10 carrier-local Input state
    │   └── M11 generation-aware internal Render Store
    └── optional construction-time RendererInputSource
```

M11 继续复用该 holder/Data-slot currentness；不创建第二套 Render connection/session/currentness layer。

---

## 2. Authority / Currentness

Main publishes committed：

```text
Runtime projection
Frame / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer不得 create/recover Frame/Activation、modify Stack、mint Data authority，或从 Render state 推导 InputTarget。

Old peer late state/terminal不得影响 replacement current。

---

## 3. M10 Input Boundary

Exact M10 construction仍是：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
): RendererControlHolder
```

Input gate、source lifetime、State/Event/Reset publisher语义保持 M10 frozen，不因 M11 修改。

---

## 4. Data Slot / Render Lifetime

Desired Data identity：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

M11 Store属于该 desired generation identity，而 current peer/baseline属于 carrier lifetime。

same-generation carrier replacement：

```text
old peer/current baseline retired
observed Domain/Node one-shot history retained
last committed state MAY remain stale presentation cache
fresh peer
→ render.domains
→ fresh Snapshot each current Domain
→ current replica rebuilt
```

fresh generation：fresh Render identity universe。该语义由 receiver-role fixture证明，不为测试新增 generation authority。

---

## 5. Internal Render Store

M11 Data handlers映射：

```text
onRenderDomains  → Registry validation / atomic replacement
onRenderSnapshot → complete candidate / atomic commit
onRenderPatch    → R→R+1 isolated candidate / atomic commit
onRenderEvent    → current applicability / internal transient delivery or drop
```

Store维护：

```text
current Registry
per-Domain unbaselined | baselined(revision)
current committed zIndex/tree
generation-scoped observed Domain/Node one-shot history
```

Failed Snapshot/Patch不得 partial mutate current replica。

---

## 6. Failure Disposition

```text
valid commit OR well-formed Event deliver/drop
→ DataInboundDisposition.accepted

schema/limit invalid OR authoritative continuity invalid
→ DataInboundDisposition.protocol-fatal
→ existing @loomrealm/data retires current Data peer
```

well-formed stale/missing-target Event只 drop，不 terminalize Data。

Render/Data failure：

```text
!= Runtime failure
!= Frame unwind
```

---

## 7. Public Boundary — Frozen M11

M11 **不新增 public Renderer Render/presentation API**。

禁止 root-export：

```text
RenderStore
RenderSession
RenderSubscription
subscribeRender
PresentationAdapter
RenderEventBus
```

Store和 Event trace都是 internal。Package tests/conformance MAY使用 internal/test-only normalized observation seam；它不形成 production API。

Physical presentation consumer在 M14 接入 internal current replica，不反向改变 M11 protocol/store semantics。

---

## 8. Presentation / Content

M11 不实现 DOM/Canvas/WebGL、component registry、resource resolver或 presentation scheduler。

M12 建立 Renderer readonly Content/Resource client；M14 presentation组合 M11 current replica + M12 Content。

Renderer MAY保留 stale presentation cache用于视觉连续性，但 cache 不是 current authority/Patch base/DataAuthority proof。

---

## 9. Input / Render Independence

Render Domain/Node存在不创建 Input authority。

M10 ordinary Input gate仍是：

```text
current matching Data
∧ Main InputTarget(S,F,A)
∧ mirrored F active with A
∧ Interest[F]
∧ Producer(C)
```

M11 不修改 Input publisher/source/currentness。

---

## 10. Abstraction Budget

允许：

```text
existing Control holder/Data slots
one internal Render Store per desired Data-slot identity
minimal Domain/node indexes
isolated candidate helpers
internal test observation seam
```

禁止：

```text
second Render connection/session manager
Generic Store / Observable / EventBus
public Render subscription API
virtual DOM / reconciler
component/resource registry
Renderer→Subsystem Render RPC
resync/retry/history
cross-Domain transaction
```

---

## 11. M11 Done

Renderer side必须证明：

```text
M10 public API unchanged
no new public Render exports
Registry/Snapshot/Patch atomic semantics
protocol-fatal vs stale-Event drop distinction
same-generation reconnect keeps identity history but resets baseline
old peer cannot mutate current replica
fresh-generation reset by receiver fixture
Render failure does not affect Runtime/Frame authority
```

Formal receiver qualification与 root gate见 [M11 / 05](../../../M11_05_QUALIFICATION_CLOSURE.md)。

---

## 12. Physical Realization

```text
M14 Hostra Desktop
    BrowserWindow
    Renderer Control WebSocket
    M9 Data Broker
    real DOM/Gamepad RendererInputSource
    M11 current Render replica → presentation
    M12 Content → resource resolution

M16 PWA
    Window/Worker + MessagePort
    same application semantics
    complete transport-equivalence claim
```
