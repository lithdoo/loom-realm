# ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica

> 状态：Accepted / Current Design  
> 日期：2026-09-08  
> 层级：架构决策记录  
> 更新：M11 Render closure 之后的 Web presentation realization；Phase 1 milestone route；M13 Web presentation startup/config/projector closure  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)  

---

## 1. Context

M11 已关闭：

```text
Subsystem authoritative Render Domain/tree
→ Render Update v1
→ Renderer current authoritative replica
```

但 M11 明确没有关闭：

```text
Render replica
→ physical Web presentation
```

原 Phase 1 顺序把 `loom.map` 放在 M12 Content 之后，并把 DOM/Canvas/WebGL presentation 留给后续 Desktop full E2E。这样会要求首个真实业务模块先产生 `RenderNode.tag/data/children`，而 `RenderNode` 如何落成真实 Web presentation 尚未闭合，形成 sequencing hole。

Phase 1 的两个 Renderer physical environments 都是 Web execution environments（Desktop BrowserWindow / PWA Window）。当前没有真实 native Renderer consumer，因此本阶段不为假设中的非 Web backend 预建 graphics DSL、generic presentation framework、component layer system 或 plugin framework。

---

## 2. Decision

LoomRealm Web presentation 采用以下责任边界：

```text
Subsystem
    owns authoritative Render tree

Renderer Store
    owns current authoritative replica

LoomRealm Web Projector
    mechanically mutates the physical projection
    replica → HTMLElement / Custom Element instance tree

Business Web presentation implementation
    owns concrete Custom Element definitions and semantics

Business Custom Element
    owns Shadow DOM / Canvas / WebGL / private presentation state
```

核心原则：

> **LoomRealm 不创作或定义具体业务 Custom Elements 的语义；具体 Custom Elements 完全由业务方拥有。LoomRealm 只负责把 current Render replica 机械投影成这些业务元素的实例树。**

`tag` 在 Render Core 中继续是 opaque string。Web Projector 只将其用于 Web element construction，不建立 known-tag vocabulary。

M13 的 business Web implementation bootstrap采用独立、用户指定的 `WebPresentationConfigV1`：

```text
user-selected Web Presentation Config
→ Window-level ordered JS/CSS logical resource lists
→ current prepared Content/FSDB resolution
→ <link> / classic <script> bootstrap
→ business JS registers Custom Elements
→ window.onload
→ Web Projector starts
```

该配置不进入 Game Entry、Platform Launch Manifest、LogicalGameBootstrap、Subsystem Definition或 RenderNode；配置资源也不按 Subsystem切分。

---

## 3. RenderNode → Web Component Projection

Current `RenderNode` shape保持：

```ts
interface RenderNode {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNode[];
}
```

Web projection semantics：

```text
key
→ stable HTMLElement instance identity

tag
→ business-owned Custom Element name
→ Web element construction

attrs
→ Renderer-managed host attributes

data
→ Renderer-delivered complex readonly full snapshot
→ optional receiveRenderData(...) interface

children
→ Renderer-managed ordered light-DOM children
```

`key` 不自动暴露为 DOM `id`、attribute 或 business-readable protocol identity。Projector可以通过 internal mapping维护 RenderNode identity与 HTMLElement identity。

同一 live key 必须对应同一 HTMLElement instance。Render `move` 必须移动已有 instance，不得以 remove + recreate 替代，从而保持 Node identity 与 WC private presentation state。

---

## 4. Physical Mount Is `document.body`

M13不建立 generic Domain layer/container/stacking framework。

Top-level projected Render roots直接成为当前 Renderer Window `document.body` 下的 managed elements：

```text
Renderer Store roots
→ Web Projector
→ document.body
    ├─ business WC root
    ├─ business WC root
    └─ ...
```

Projector负责：

```text
create/remove/move projected elements
maintain keyed HTMLElement identity
project attrs
project managed light-DOM children
project data through receiveRenderData(...)
```

Projector **不负责**：

```text
generic domain wrapper/layer
CSS stacking-context framework
z-index style synthesis
layout engine
business positioning
business visual composition policy
```

业务 Custom Elements / business CSS自行决定实际 layout、position、stacking、Shadow DOM、Canvas/WebGL realization。

M11 的 Render Domain / zIndex facts保持 M11 contract；M13不把它们扩张成新的 LoomRealm CSS/layer abstraction。

---

## 5. Projection State Is Read-only to Business WC

业务 Custom Element 对 LoomRealm 投影出的 Render-managed state 只有读取权：

```text
Element identity / tag
Render-managed attrs
Render data
managed light-DOM children/order
```

责任关系：

```text
Subsystem       = authoritative Render writer
Renderer Store  = authoritative replica
Web Projector   = physical projection mutator
Business WC     = projection reader
```

业务 WC contract上不得：

```text
mutate Render-managed host attrs
append/remove/reorder managed light-DOM children
mutate delivered Render data
mutate Render Store / RenderDomain / protocol state
```

业务 WC 可以完全拥有和修改：

```text
private fields
Shadow DOM
Canvas / WebGL objects
decoded resources
animation/cache/timers
presentation-local derived state
```

DOM 永远不是 Render authority/source of truth。Renderer 不从实际 DOM 反向推导 Store state。

### 5.1 No Mutation Policing

M13 **不** 使用 MutationObserver 或其他 policing mechanism 去检测、阻止、修复业务 WC 对 managed host attrs/light DOM 的违规 mutation。

如果业务 WC违反上述 contract：

```text
Renderer Store remains authoritative
DOM mutation is never adopted back into Store
LoomRealm does not guarantee presentation behavior after the violation
LoomRealm does not take responsibility for business-local accidental behavior caused by the violation
```

M13也不建立 hostile-code sandbox。Phase 1 presentation scripts是按产品配置加载的 trusted executable business material；read-only是 authority/contract boundary，不是同 Realm hostile-code security boundary。

---

## 6. `children` — Managed Light DOM

`RenderNode.children` 直接投影成 ordered light DOM：

```text
RenderNode.children
→ HTMLElement light-DOM child list
```

Web Projector拥有这份 composition的 mutation。业务组件通过标准 Web Component composition读取和消费这些 children；LoomRealm 不新增 slot/projection protocol。

业务 WC 自身实现细节放在 Shadow DOM / Canvas / WebGL 等 private presentation state 中，不写入或重排 Render-managed light DOM。

第一版 children 只包含 keyed RenderNode / Custom Element；不额外引入 raw TextNode / CommentNode / HTML fragment model。文本等 presentation primitive 由业务自己的 Custom Elements 表达。

---

## 7. `data` — `receiveRenderData(...)`

`data` 与 `attrs` 是两个独立 channel：

```text
attrs = browser-native string attributes

data  = complex structured retained component state
```

Core 不自动在二者间做映射，也不判断业务字段是否重复；具体 element contract 由业务方负责。

M11 wire/Store 可以继续增量维护 data，但 Web Component v1 **只接收全量 current snapshot**：

```text
Render snapshot / data delta
→ Renderer Store atomic commit
→ complete current JsonObject
→ readonly full snapshot delivery
→ receiveRenderData(...)
```

M13冻结 WC data receiver method：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

语义：

```text
method is optional
only elements implementing receiveRenderData receive data
initial materialization delivers current full data
subsequent committed data change delivers current full data
wire partial patch is never exposed
object identity has no semantic meaning
```

未实现 `receiveRenderData` 的 element不是 presentation failure；它只是不会收到 `data` channel。

第一版不提供：

```text
partial data patch callback
JSON Patch callback
Observable/Proxy/Signal store as LoomRealm contract
WC → Render data mutation API
```

M13必须保证业务拿到的 data value不能被用来反向修改 Renderer Store。detached value + runtime deep-freeze仍是可接受的 implementation mechanics；正式 authority语义是不提供任何 reverse-write capability。

---

## 8. Store → Projector Commit Seam

Web Projector不得直接消费 raw Render wire，也不得自己建立第二套 protocol receiver。

内部方向固定为：

```text
Render wire
→ Renderer Store validate
→ atomic Store commit
→ package-private post-commit notification/effect
→ Web Projector
```

exact private type/name属于 implementation detail，但必须满足：

```text
notification only after successful Store commit
failed Store mutation produces no projection notification
business code cannot subscribe to it
it carries no new authority
```

Snapshot replacement时允许 Projector基于 authoritative key identity进行必要的 keyed mechanical reconciliation，以保持：

```text
same live key
→ same HTMLElement instance
```

这不是第二份 desired-tree authority。

---

## 9. Projection Commit Ordering

一次 committed Render state变化的 Web projection observable order固定为：

```text
1. structural projection
   create / insert / remove / move / managed children

2. attrs projection
   set / remove managed host attributes

3. data delivery
   receiveRenderData(complete current data)
```

因此当 `receiveRenderData(...)` 被调用时，该 element对应的 managed structure/children与 attrs已经反映同一次 committed Store state。

浏览器 native lifecycle callback（例如 `connectedCallback` / `attributeChangedCallback`）不是 LoomRealm atomic-commit ABI；业务若需要观察一份完整 current Render data，应以 `receiveRenderData(...)` 为准。

---

## 10. No RenderEvent → WC ABI in M13

M11 `RenderEvent`保持 M11 已冻结语义：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

M13 **不** 新增：

```text
onRenderEvent(...)
receiveRenderEvent(...)
DOM dispatchEvent mapping
RenderEvent → WC delivery contract
```

当前没有真实 Web presentation consumer证明需要这一层 ABI，因此 M13只投影 retained Render state：

```text
tag
attrs
data
children
```

未来真实 consumer若证明需要 RenderEvent进入 physical presentation，再按 demand-driven rule单独设计；不得为了协议对称性提前增加 WC event surface。

---

## 11. Business Presentation Ownership / Startup Boundary

业务逻辑与 Web presentation implementation必须保持 execution/authority boundary：

```text
Business Definition side
→ platform-neutral
→ @loomrealm/subsystem author surface
→ no Browser/DOM/Renderer/Platform/protocol authority imports

Business Web presentation side
→ concrete Custom Element definitions
→ may use Web APIs / Shadow DOM / Canvas / WebGL
→ no Render authority write capability
```

二者 ownership可以同属同一业务模块；本 ADR不要求固定 npm package/subpath/build topology。运行时 presentation implementation 的 current source是 current installation Content/FSDB 中由 `WebPresentationConfigV1` 声明的 JS/CSS resources。

`WebPresentationConfigV1` 是 Renderer Window-level configuration：

```text
formatVersion
scripts[]
styles[]
```

没有：

```text
subsystems[]
subsystemKey → presentation resource binding
RenderNode.tag → module URL
```

业务 JS执行后通过浏览器原生 `customElements.define(...)` 注册具体元素。LoomRealm Renderer不提供业务 component library，不维护第二个 business component registry，也不定义 `loom-map` / `loom-sprite` / `loom-text` 等 vocabulary。

---

## 12. Presentation Resource / Content Boundary

M13 bootstrap config复用 M12 logical Content identity：

```text
namespace
+
hierarchical resource key
```

Current Desktop source继续是 successful Hostra PREPARE后的 prepared installation内 exactly one `[FSDB]*` readonly snapshot。用户不单独配置 `fsdbRoot`。

Web Presentation Config resource ref不携：

```text
filesystem path
absolute/local/external URL
bearer/credential
FSDB handle
loader capability
```

trusted composition在 Window启动前把 resource ref解析到 current prepared Content entry，并获得当前 `contentVersion` / MIME等 immutable facts；业务配置不手工填写 physical path、URL或 Content credential。

trusted Window bootstrap可以私下把这些 prepared resources绑定成 `<link href>` / `<script src>` 所需的 browser-loadable location；该 physical binding不得成为 business config/WC capability。

业务 Web Component运行后需要普通 runtime resource时仍不得绕过 M12 Content credential/version boundary。

---

## 13. Presentation Bootstrap / Registration Ordering

M13 normal startup path冻结：

```text
validated + resolved WebPresentationConfigV1
↓
Renderer bootstrap document
↓
ordered <link rel="stylesheet">
↓
ordered classic <script>
↓
business scripts call customElements.define(...)
↓
window.onload
────────────────────────────────────────
Web Projector starts
```

`window.onload` 是 V1 presentation-ready barrier。

因此 Phase 1 normal path不依赖：

```text
ESM loader framework
Blob module graph
create unknown element → arbitrary future module load → late upgrade
dynamic component loader
```

projection使用某个 `RenderNode.tag` 时若对应 Custom Element仍未注册，属于 presentation-local failure。

---

## 14. Window Lifetime

Presentation bootstrap resources与 browser Custom Element registry按 Renderer Window lifetime管理：

```text
Renderer Window lifetime
=
presentation bootstrap lifetime
=
Custom Element registry lifetime
```

V1不按 Subsystem/Frame/Activation/RenderDomain/Data carrier动态装卸 presentation scripts/styles。

若下一次启动选择不同 Web Presentation Config 或需要 incompatible Custom Element definitions，Phase 1通过 fresh Renderer Window获得新的 browser registry/environment，而不是在同一 Window中尝试卸载/重定义已注册 Custom Elements。

---

## 15. Failure Boundary

合法 Render Store state 与 presentation realization failure 分离。

### Bootstrap failure

```text
config invalid
required JS/CSS unresolved/unavailable
stylesheet/script load failure
script evaluation/registration failure
```

结果：

```text
presentation bootstrap fails
→ Web Projector does not enter running state
```

### Runtime projection/WC failure

例如：

```text
projected tag not registered
receiveRenderData(...) throws
DOM operation fails
business WC violates projection contract
business presentation local exception
```

结果：

```text
report presentation-local error
→ no Store rollback
→ no Main/Subsystem authority mutation
→ continue best-effort where continuation is possible
```

M13不需要预建复杂 node/domain recovery framework。只有真实 implementation证明需要更细 recovery时再增加。

---

## 16. Qualification

M13必须包含真实 browser qualification，而不能只靠 Node/fake DOM。

Current target是 headless Chromium，至少证明：

```text
WebPresentationConfigV1 validation/resolution
<link> / classic <script> loading
window.onload ready barrier
business customElements registration
Store commit → Projector notification
roots projected into document.body
snapshot / insert / remove / move
move preserves same HTMLElement identity
attrs projection
receiveRenderData initial + update full snapshots
receiveRenderData runs after structure/attrs projection
WC mutation cannot mutate Renderer Store authority
WC callback failure does not roll back Store/Main/Subsystem
RenderEvent is not delivered as WC/DOM event
```

Node tests仍可覆盖纯 Store/projector algorithm，但 browser lifecycle语义必须由真实 Chromium gate覆盖。

---

## 17. Milestone Route Change

Phase 1 从：

```text
M11 Render
→ M12 Content
→ M13 loom.map
→ M14 Desktop full E2E
→ M15 PWA Runtime
→ M16 PWA full E2E/equivalence
```

调整为：

```text
M11 Render Replication                 ✅
M12 Content                            ✅
M13 Web Presentation Projection        pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

新的 M13 关闭 LoomRealm-owned thin Web projection infrastructure以及 Window-level presentation bootstrap/config ready barrier，不创作真实产品业务 component vocabulary。使用 fixture Custom Elements证明 projection + startup contract。

M14 `loom.map` 才成为第一个完整真实 business consumer：业务 Definition 与 map-owned Web presentation implementation共同验证 Frame/Input/Render/Content + Web projection，但保持 execution/authority boundary。

---

## 18. Consequences

正向：

- 修复 `loom.map` 在 Web projection closure 之前实现的 milestone sequencing hole；
- 保留 M11 Render protocol/authority closure，不重开 Frozen v1；
- 保留业务对具体 visual implementation 的 ownership；
- LoomRealm 不承担 component vocabulary / graphics engine / UI framework responsibility；
- Web Projector只消费 committed Store，不建立第二份 desired presentation authority；
- top-level roots直接进入 `document.body`，不增加 generic layer/stacking abstraction；
- `receiveRenderData(...)` 成为唯一需要 LoomRealm额外定义的 WC retained-data ABI；
- M13不为 RenderEvent创建无真实需求的 WC event ABI；
- startup config不污染 Game Entry、Platform Launch Manifest、LogicalGameBootstrap或 RenderNode；
- Window-level `<link>/<script>` 与 browser `customElements` registry自然对齐；
- Desktop继续复用 M12 prepared installation/FSDB/Content identity，不新增第二个 FSDB配置入口；
- read-only contract不引入 MutationObserver policing或 hostile-code sandbox。

代价：

- Phase 1增加一个明确 milestone，原 M13–M16顺延；
- M13需要新增 `WebPresentationConfigV1` validator/prepared representation与真实 Chromium bootstrap/projection qualification；
- business WC如果违反 managed projection contract，LoomRealm不保证其 presentation-local结果；
- layout/stacking完全由 business WC/CSS负责，LoomRealm不提供通用 layer framework。

---

## 19. Reopen Conditions

以下不是 reopen 理由：

```text
业务 WC内部选择某个 UI framework
为了 component library 对称性建立通用 Presentation DSL
某业务希望按 Subsystem动态装卸 scripts/styles
某业务希望 LoomRealm替它管理 CSS layer/stacking
未来可能存在 native renderer
```

允许 reopen：

```text
真实 Web business consumer 无法由 keyed Custom Element projection 表达
Window-level presentation resource list无法表达真实必要 bootstrap ordering
receiveRenderData full snapshot无法满足真实 correctness requirement
只读 projection 与浏览器生命周期产生 correctness contradiction
真实 consumer证明 RenderEvent必须进入 physical presentation才能表达必要语义
真实非 Web Renderer consumer证明当前 Web-only projection placement无法保持 logical semantics
```
