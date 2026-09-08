# ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica

> 状态：Accepted / Current Design  
> 日期：2026-09-08  
> 层级：架构决策记录  
> 决策范围：M13 Web Presentation bootstrap、thin Web projection、local WC ABI、runtime resource capability、presentation currentness  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  

---

## 1. Context

M11 已关闭：

```text
Subsystem authoritative Render Domain/tree
→ Render Update v1
→ Renderer current authoritative replica
```

但 M11 有意没有关闭：

```text
Render replica → physical Web presentation
```

如果直接进入 `loom.map`，首个真实业务 consumer 会在 Web projection、Custom Element bootstrap、data/context ABI 尚未闭合时被迫自行补缝。Phase 1 的 Desktop/PWA Renderer 都是 Web execution environment，因此 M13 先关闭一个最薄的 Web presentation seam，而不预建 native graphics DSL、UI framework、layer system 或 component plugin framework。

---

## 2. Decision / Authority

责任边界：

```text
Subsystem
    authoritative Render writer

Renderer Store
    current authoritative replica

Web Projector
    exclusive LoomRealm-managed DOM projection mutator
    presentation context injector

Business Web presentation
    owns concrete Custom Element definitions
    owns Shadow DOM / Canvas / WebGL / private presentation state
    read-only consumer of LoomRealm projected state
```

核心原则：

> **LoomRealm 不拥有具体业务组件语义；它只把 current Render replica 机械投影成 business-owned Custom Elements，并通过一个窄的 local API 交付 context/data。**

`RenderNode.tag` 在 Render Core 中继续是 opaque string。Renderer 不维护 business tag vocabulary、component library 或第二个 registry。

DOM 永远不是 Render authority source；Renderer 不从 DOM 反向同步 Store。

---

## 3. Window Bootstrap

M13 使用独立的 Window-level `WebPresentationConfigV1`：

```text
product/platform-private config acquisition
→ parse candidate JSON
→ WebPresentationConfigV1 validation
→ current prepared Content resolution
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business customElements.define(...)
→ window.onload
→ Web Projector starts
```

Config 只有：

```text
formatVersion
scripts[]
styles[]
```

配置 source 如何取得不是 Config v1 contract。Desktop 可以使用用户选择的 filesystem path；PWA 可以使用 picker/persisted handle/app-owned source；这些 acquisition mechanics 不进入 `WebPresentationConfigV1` 或跨平台 ABI。

资源使用 M12 logical `namespace + hierarchical key`，不按 Subsystem 切分，也不进入 Game Entry、Platform Launch Manifest、LogicalGameBootstrap 或 RenderNode。

在 `scripts` 与 `styles` 各自列表内，`(namespace,key)` 必须唯一。Duplicate logical ref 是 invalid config，必须在 bootstrap 前拒绝；Desktop/PWA 不得通过 implementation-defined dedupe 或重复执行产生不同可观察语义。

M13 不建立 ESM/Blob module graph、dynamic component loader、PluginManager 或第二个 Custom Element registry。

trusted prepared resource → browser `href/src` 的具体 physical binding 保持 implementation-private，不向 business config/WC 暴露 bearer、path、FSDB 或 privileged resolver。

`window.onload` 只关闭 bootstrap phase。Config 不声明 expected tag set，因此 bootstrap 不猜测某 script 应注册哪些 Custom Elements；如果 Projector 实际 materialize `RenderNode.tag` 时该 tag 仍未注册，这是 projection-time presentation structural failure，而不是 bootstrap/config failure。

---

## 4. RenderNode → HTMLElement Identity

`RenderNode.key` 只在一个 wire Domain 内唯一，因此 **裸 `key` 不是 Renderer Window-global identity**。

Frozen Render v1 的完整 live node scope 是：

```text
(Session, subsystemKey, DataAuthority generation, domainId, key)
```

M13 冻结：

```text
same live wire-node identity
→ same HTMLElement instance
```

因此：

- move/reparent/reorder 必须移动 existing HTMLElement，不得用 remove + recreate 替代；
- different Domain / different Subsystem / fresh generation 即使 `key` 字符串相同，也不是同一 element identity；
- same-generation carrier replacement不改变仍 live 的 wire-node identity；
- `key` 默认保持 Projector-private，不自动映射为 DOM `id` / attribute。

Implementation MAY 使用 composite/nested private map；M13 **不** 为此新增 public `RenderNodeIdentity` DTO、identity service 或 reusable framework。

---

## 5. Physical Mount / Deterministic Ordering

Top-level projected roots直接成为 `document.body` 的 LoomRealm-managed child elements；不创建 per-Domain wrapper、generic CSS layer、automatic `z-index` 或 layout engine。

M11 的 `zIndex/domainId` ordering只在一个 Subsystem 的 Render Update scope内成立。M13 不把 `zIndex` 偷偷升级为跨 Subsystem global stacking semantics。

为了得到确定的 managed body sequence，M13 只冻结一个物理 concatenation rule：

```text
1. subsystemKey encoded UTF-8 lexical ascending
2. within one subsystem: zIndex ascending
3. same zIndex: domainId encoded UTF-8 lexical ascending
4. within one Domain: authoritative roots order
5. within one node: authoritative children order
```

等价地：

```text
managedBodyRoots
=
concat(
  subsystems sorted by subsystemKey
    .flatMap(subsystem =>
      subsystem.currentBaselinedDomains
        sorted by M11 logical Domain order
        .flatMap(domain => domain.roots)
    )
)
```

这里的 `subsystemKey` ordering **只**是 M13 deterministic physical concatenation，不定义 cross-Subsystem business stacking authority。

Domain/subsystem/root order变化时，仍 live 的 wire-node必须移动 existing HTMLElement，不得 recreate。

Business WC/CSS继续拥有实际 layout/position/stacking realization。M13不建立 cross-Subsystem visual layer manager。

Projector只拥有 managed roots之间的相对顺序；host/bootstrap 非业务 presentation节点不属于该 sequence，也不得被业务依赖为 LoomRealm stacking contract。

---

## 6. Projection Mapping / Read-only Boundary

投影概念模型：

```text
wire-node identity → stable HTMLElement
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → Renderer-managed host attrs
RenderNode.children → Renderer-managed ordered light DOM
context             → optional receiveRenderContext(...)
RenderNode.data     → optional receiveRenderData(full readonly snapshot)
```

Business WC contract上不得修改：

```text
Render-managed host attrs
managed light-DOM children/order
delivered Render data
Renderer Store / RenderDomain / protocol state
```

Business WC可以拥有 private fields、Shadow DOM、Canvas/WebGL、decoded resources、cache/animation/timers 与 business layout state。

M13 不使用 MutationObserver policing hostile/invalid business mutation；违规 mutation不会被 adopt 回 Store，后续 presentation-local behavior不保证。

第一版 children不增加 TextNode/CommentNode/HTML fragment protocol；文本等 primitive由业务 WC表达。

---

## 7. One Web Presentation API, Two Receivers

M13 使用一个 formal `Web Presentation API v1`，其中两个 receiver保持独立：

```ts
interface RenderContextReceiver {
  receiveRenderContext(context: WebPresentationContext): void;
}

interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

原因是 lifetime不同：

```text
context = Window-lifetime capability/environment
          at most once per HTMLElement

data    = retained authoritative presentation state
          initial + repeated committed updates
```

新 element observable order：

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / possible connectedCallback
→ managed structure/children
→ attrs
→ receiveRenderData(...), if implemented
```

已有 element update：

```text
structure/reorder → attrs → receiveRenderData when required
```

Browser-native lifecycle callbacks不是 LoomRealm atomic-commit ABI。`connectedCallback()` 只可依赖“若实现 context receiver，则 context 已注入”；不得假设 initial managed attrs、children 或 Render data 已 ready，retained data必须以 `receiveRenderData(...)` 为准。

---

## 8. Runtime Presentation Resource Capability

M13 在现有 Renderer-private M12 ResourceClient 外提供 narrow readonly `PresentationResourceClient` façade，通过 `WebPresentationContext.resources` 注入 business WC。

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual contentVersion
```

Business WC 不获得：

```text
Content origin / installationId / token
filesystem path / FSDB
privileged URL / raw Response
Renderer-private ResourceClient
arbitrary resolver / loader
```

`expectedContentVersion` 必须继续遵守 M12 semantics；version mismatch reject as conflict，不能 silent读取其他版本。

RenderNode.data 的 resource-ref schema仍由业务拥有。M13不建立 AssetManager、decoder registry、prefetch graph 或 dynamic loader。

Resource/callback failure是 presentation-local，不回滚 Store、不修改 Main/Subsystem authority、不自动 fail Runtime/Frame。

---

## 9. Store → Projector Seam / RenderEvent

Web Projector只消费：

```text
Render wire
→ Renderer Store validate
→ atomic successful commit
→ package-private post-commit notification/effect
→ presentation eligibility/currentness gate
→ Projector
```

failed Store mutation不得产生 projection notification。Business不能订阅这一 package-private seam。

Snapshot/current state可以做 keyed mechanical reconciliation，但只为保持 Frozen wire identity对应的 HTMLElement identity，不形成第二份 desired-tree authority。

M13 不定义 RenderEvent → WC/DOM ABI；不新增 `receiveRenderEvent`、`onRenderEvent` 或 `dispatchEvent` mapping。真实 consumer需要时再 demand-driven reopen。

---

## 10. Presentation Currentness

M11 已冻结 same-generation Data carrier replacement不创建新的 wire identity universe。M13 因此冻结对应的 browser-observable behavior：

```text
same-generation carrier loss
→ keep last committed managed DOM mounted
→ freeze Projector mutation
→ no receiver callback caused by loss itself
→ no LoomRealm-caused detach/reinsert of preserved elements
```

replacement carrier必须先重新建立 complete presentation baseline：

```text
fresh Registry committed
AND
every Domain in current Registry has a fresh baseline
```

partial Domain rebaseline不得泄漏到 DOM；只有 complete baseline后才进行一次 mechanical reconciliation。匹配相同 live wire-node identity 的节点复用 existing HTMLElement。

fresh generation结束旧 wire-node identity universe，因此 old generation managed elements被 retire/remove；新 generation 中相同 textual key仍得到 fresh HTMLElement，并重新执行 one-shot context injection。

该规则只冻结 projection eligibility/lifecycle，不增加 public PresentationState、stale callback、DOM stale attribute或第二份 Store。

---

## 11. Presentation Failure Closure

普通 callback/resource failure仍按 Web Presentation API v1 best-effort、presentation-local boundary处理。

未注册 tag 属于更窄的 structural failure：当 Projector 需要 materialize `RenderNode.tag` 且 `customElements.get(tag) === undefined` 时，不创建 unknown HTMLElement、不等待 arbitrary future registration/native upgrade，并停止该 Renderer Window 后续 LoomRealm-managed DOM mutation，保留最后成功 reconcile 的 managed DOM。恢复使用 fresh Renderer Window/bootstrap。

这一 Window-local failed presentation state 不公开成 `PresentationState` authority，并且始终：

```text
no Store rollback
no Main/Subsystem authority mutation
no Runtime/Frame failure
not Render protocol-fatal
```

---

## 12. Qualification

M13 必须使用真实 headless Chromium，至少证明：

```text
duplicate scripts/styles logical ref rejected before bootstrap
ordered <link> / classic <script> + load failure detection
window.onload projection-start barrier
business customElements registration
Store successful commit → Projector only
same live wire-node identity → same HTMLElement
same key string across Domains/Subsystems does not collide
same-generation carrier loss keeps DOM mounted and fires no receiver/disconnect/reconnect
partial same-generation rebaseline does not mutate DOM
complete same-generation rebaseline preserves matching HTMLElement identity
fresh generation does not inherit old HTMLElement identity
subsystemKey → M11 domain order → roots deterministic body sequence
reorder moves existing HTMLElement
receiveRenderContext before first managed insertion; at most once
connectedCallback does not assume initial attrs/children/data ready
receiveRenderData initial/update full snapshots
context/data receiver independence
unregistered RenderNode.tag causes Window-local presentation structural failure
unregistered tag never creates unknown element or waits for future upgrade
real M12 resource read through PresentationResourceClient
version conflict / cancellation / returned-bytes ownership
no credential/path/private-client exposure
WC/resource failure never rolls back authority
DOM violation never becomes Store state
RenderEvent not delivered to WC/DOM
```

M13不复制 M11 protocol conformance，也不重测 M12 Content internals；只验证它真实依赖的 integration boundary。

---

## 13. Milestone Route / Renumbering Provenance

ADR 0031 在 `loom.map` 前插入一个独立 Web Presentation milestone。

历史路线：

```text
M13 loom.map
M14 Desktop full E2E
M15 PWA Runtime
M16 PWA full E2E/equivalence
```

Current route：

```text
M11 Render Replication                 ✅
M12 Content                            ✅
M13 Web Presentation Projection        pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

Current navigation/plans/modules MUST 使用新编号。已经关闭的历史 milestone/qualification 文档 MAY 保留创建时编号作为 provenance，但如果其中的旧编号仍被作为 current forward reference 使用，必须标注 historical numbering 或更新到 current number。

M13关闭 presentation infrastructure；M14 `loom.map` 成为首个真实 business + map-owned WC consumer。

---

## 14. Consequences / Explicit Non-goals

保留：

- M11 Render protocol/authority不重开；
- M12 resource/version/credential boundary不复制；
- concrete Web Components、layout、Canvas/WebGL语义由业务拥有；
- Config acquisition、Config value、runtime API分离；
- duplicate bootstrap ref直接拒绝，不留下 platform-specific dedupe semantics；
- bootstrap failure与 projection-time structural failure严格分 phase；
- Projector只有 mechanical projection authority；
- same-generation reconnect保持同一 live element universe，fresh generation才切换 element identity universe。

M13明确不增加：

```text
Presentation DSL / graphics scene graph
LoomRealm component library
AssetManager / Repository
ESM/dynamic component loader
per-Domain wrappers / global layer manager
public Render Store/subscription
public RenderNodeIdentity framework
global Window service locator
public PresentationState/currentness API
MutationObserver policing
RenderEvent WC ABI
```

允许 reopen 的条件只来自真实 consumer的 correctness需求，而不是 API symmetry 或未来猜测。
