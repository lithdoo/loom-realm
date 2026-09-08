# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Data / M10 Input / M11 Render / M12 ResourceClient **Implemented + Qualified**；M13 Web Presentation **Pending**  
> 稳定程度：closed lower slices / M13 Stabilizing  
> 主要定义：Renderer currentness、internal Render replica、trusted ResourceClient、M13 Window bootstrap、thin Web Projector placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

Renderer不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers上执行 Input/Render role behavior；M12增加 trusted logical resource → bytes responsibility；M13只增加 Window-local physical Web presentation，不创建新的 application authority。

---

## 1. Current / Target Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current Control peer/snapshot
    ├── per-subsystem Data slots
    │   ├── current RendererDataPeer
    │   ├── M10 Input Registry/gate/publisher
    │   └── M11 internal Render replica
    ├── optional RendererInputSource
    ├── M12 trusted/private ResourceClient
    └── M13 package-private post-commit seam
            ↓
        presentation eligibility/currentness gate
            ↓
        thin Web Projector
            ↓
        document.body / business-owned Custom Elements

Renderer Window bootstrap
└── product-private Config acquisition
    ↓
    WebPresentationConfigV1
    ├── ordered <link rel="stylesheet">
    ├── ordered classic <script>
    ├── business customElements registration
    └── window.onload → enable Projector
```

M13复用 existing currentness facts；DOM/WC existence不 mint Data/Render authority。

---

## 2. Existing Closed Slices

### M10 Input

Physical DOM/Gamepad input继续进入 frozen `RendererInputSource` seam，并受 Main InputTarget、Interest、Producer 与 current Data gate约束。业务 WC focus/event listener不能形成 Renderer→Data shortcut。

### M11 Render Replica

Store identity挂在 current Data slot：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

Store保持 current Registry、per-Domain baseline/revision、committed tree与 required one-shot identity history。same-generation carrier replacement重新建立 carrier-local baseline但不创建 fresh wire identity universe。M11仍没有 public Render Store/subscription/presentation API。

### M12 ResourceClient

trusted/private ResourceClient继续提供：

```text
namespace + hierarchical resourceKey + expectedContentVersion
→ bytes + MIME + actual contentVersion
```

M13不把它本体、origin、token、path或 physical URL交给 business WC。

---

## 3. M13 Projector Placement

```text
render.* wire
→ M11 Store validate + atomic commit
→ package-private post-commit notification/effect
→ presentation eligibility/currentness gate
→ Web Projector
```

要求：

```text
successful commit only
failed Store mutation → no projection notification
partial same-generation rebaseline → no DOM reconciliation
business cannot subscribe
Projector cannot write Store authority
```

Projector实现放在 Renderer trusted/package-private ownership 内；M13不为了 package symmetry新增 `@loomrealm/presentation` 或 public PresentationAdapter。

---

## 4. Element Identity / Currentness

`RenderNode.key` 不是 Window-global identity。Projector必须使用完整 current wire-node scope：

```text
(Session, subsystemKey, generation, domainId, key)
```

Renderer Window已经固定 Session/Renderer时，private implementation可只保存其余组成部分。

概念 private mapping可以是 composite/nested map，但 **不得** 简化成：

```ts
Map<RenderNodeKey, HTMLElement>
```

因为 different Domains/Subsystems可以合法拥有相同 key string。

Frozen rule：

```text
same live wire-node identity
→ same HTMLElement
```

move/reparent/root reorder只移动 existing instance。different subsystem/domain 或 fresh generation即使 key相同也建立不同 identity。

same-generation carrier loss冻结 presentation：

```text
keep last committed managed DOM mounted
freeze Projector mutation
no receiver callback caused by loss
no LoomRealm-caused detach/reinsert
```

replacement carrier只有在以下 predicate满足后才重新启用 reconciliation：

```text
registrySeen
AND
every Domain in current Registry is baselined
```

fresh Registry 后的 partial Domain baseline只更新 Store，不更新 DOM。complete baseline 后一次 reconcile，匹配相同 live wire-node identity 的节点复用 existing HTMLElement。

fresh generation结束旧 identity universe：旧 managed elements被 retire/remove；新 generation 的相同 textual key得到 fresh HTMLElement。

这些都是 package-private implementation state，不新增 public `RenderNodeIdentity`、`PresentationState` 或 reconnect coordinator API。

---

## 5. Projection / Physical Mount

精确 business-visible mapping由 [渲染系统](../../10-architecture/rendering-system.md) 与 [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md) 拥有。Renderer module只实现：

```text
tag      → create business-owned element
attrs    → managed host attrs
children → managed ordered light DOM
context  → optional one-shot API injection
data     → optional full current API delivery
```

Top-level roots直接进入 `document.body`，不创建 per-Domain wrapper、generic layer、CSS z-index synthesis 或 layout engine。

Managed root order：

```text
subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

该顺序只用于 deterministic physical concatenation；不创建 cross-Subsystem global zIndex semantics。Business WC/CSS拥有实际 layout/stacking。

Host/bootstrap non-business DOM不属于 LoomRealm-managed root sequence。

---

## 6. WC Authority Boundary

Business WC 对以下 state只有 read access：

```text
Element identity/tag
Render-managed host attrs
Render data
managed light-DOM children/order
```

它拥有 private fields、Shadow DOM、Canvas/WebGL、decoded resource/cache、animation/timers 与业务 layout state。

Renderer不从 DOM反向同步 Store，也不使用 MutationObserver policing业务违规 mutation。Contract violation只产生 presentation-local consequences。

---

## 7. Config / API Ownership

不要在 module README 重复 formal shape；以两份 contract为唯一精确 source：

```text
Web Presentation Config v1
→ parsed Config value / startup JS/CSS / prepared Content / ordered browser bootstrap

Web Presentation API v1
→ receiveRenderContext / receiveRenderData / PresentationResourceClient / reconnect-observable behavior
```

Config source/path/handle acquisition属于 concrete product/platform，不属于 Renderer public API或 Config v1。

实现必须保持：

```text
context before first managed insertion
same HTMLElement context at most once
existing element commit: structure/reorder → attrs → data
same-generation carrier loss: no detach/reinsert or receiver
complete rebaseline before reconnect reconciliation
```

Business WC runtime resource只能使用 API façade；不能取得 M12 private client/credential/path。

---

## 8. RenderEvent / Failure

M13不定义 RenderEvent → WC/DOM ABI。

Bootstrap failure阻止 Projector进入 running state。Runtime callback/resource/DOM failure是 presentation-local：

```text
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
best-effort continuation where possible
```

不预建 generic recovery framework。

---

## 9. M13 Qualification

真实 headless Chromium至少证明：

```text
Config ordered bootstrap + load failure detection
window.onload start barrier
Custom Element registration
Store commit → Projector only after success
same wire-node identity → same HTMLElement
same key across Domains/Subsystems does not collide
same-generation carrier loss keeps DOM mounted and fires no receiver/disconnect/reconnect
partial same-generation rebaseline does not mutate DOM
complete same-generation rebaseline preserves matching HTMLElement identity
fresh generation gets fresh HTMLElement identity
subsystemKey → M11 Domain order → roots deterministic sequence
reorder moves existing elements
context before first insertion; at most once
context/data receivers independent
data initial/update full snapshot
real PresentationResourceClient → M12 bytes
version conflict/cancel/value ownership
no credential/path/private-client exposure
DOM/callback/resource failure never mutates authority
RenderEvent not delivered to WC/DOM
```

M13不复制 M11 protocol conformance或 M12 Content internals。

---

## 10. Phase Placement / PWA

```text
M11 Render Replication      closed
M12 Content                 closed
M13 Web Presentation        pending
M14 loom.map                pending
M15 Desktop full E2E        pending
M16 PWA Runtime             pending
M17 PWA full E2E            pending
```

Hostra/PWA共享 Config/API/identity/currentness/body-order logical semantics；Config acquisition、physical storage、transport和 trusted `href/src` binding可以不同。Node-only `@loomrealm/fsdb` 不成为 PWA abstraction。

---

## 11. Final Invariants

1. Renderer不拥有 business/Frame/Render authority；
2. M11 Store internal-only；M13只消费 successful且 presentation-eligible 的 commit seam；
3. bare key不是 Window-global identity；same live wire-node identity保持 same HTMLElement；
4. same-generation carrier loss保留最后 committed DOM且冻结 projection，complete rebaseline后才 reconcile；fresh generation建立 fresh HTMLElement universe；
5. managed body order = subsystemKey lexical → M11 per-subsystem Domain order → roots；
6. Projector不创建第二份 desired-tree authority或 generic layer system；
7. business WC对 LoomRealm-managed projection只读；DOM不反向同步 Store；
8. Config/API formal contracts拥有精确 browser/receiver/resource/currentness semantics；
9. M13不增加 public presentation package、AssetManager、dynamic loader、RenderEvent WC bridge或 global service locator。
