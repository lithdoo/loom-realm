# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render Domain、Domain Tree、Renderer Store、全局合成和输入边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-09

## 1. 设计目标

渲染系统将各 Subsystem 发布的声明式 Render Domain State 呈现为 Web UI，同时保持业务状态、Frame/Input、物理 Transport 和本地表现状态之间的边界。

```text
Subsystem business state / Render Manager
→ Render Domain Registry / Domain Tree State
→ Render Update Protocol
→ Renderer Domain Store
→ Renderer Component reconciliation
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Renderer Store 是权威 Render state 的只读镜像；DOM/Canvas/WebGL Scene 和组件实例属于派生 presentation state。

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Domain Registry，Frame 不拥有 Domain，Renderer 不从 Frame Stack 推导 Domain lifecycle。

平台级不存在：

```text
frame.activate → show Domain
frame.suspend  → hide Domain
frame.resume   → restore Domain
frame.close    → destroy Domain
Frame failure unwind → destroy affected Domains
```

Subsystem 可以内部根据 Frame/Runtime 事件改变 Domain，但必须通过自身 Render Manager + Render Update显式表达。

## 3. Render Domain

每个 Subsystem Runtime MAY 同时拥有 `0..N` Render Domains。

```text
Subsystem
├── Domain world     zIndex=0
├── Domain hud       zIndex=100
└── Domain overlay   zIndex=200
```

Domain 是：

```text
Render lifecycle unit
atomic authoritative-state unit
Renderer global composition unit
```

Domain 不是 Render Node，不具有 `tag/attrs/data/key`。

Domain identity 由 enclosing Data Connection 的 Subsystem identity + `domainId` 共同确定：

```text
(subsystemKey, domainId)
```

不同 Subsystem MAY 重用相同 `domainId`。

同一 DataAuthority generation 下，`domainId` 是 one-shot lifecycle identity：

```text
absent → present → absent
```

移除后同一 generation 内不得复用；fresh generation 开启新的 authority universe。

## 4. Domain z-index / Global Composition

每个 Domain拥有 Subsystem-authoritative `zIndex`：

```text
lower zIndex  → below
higher zIndex → above
```

Frame Stack MUST NOT充当 Render z-order。

不同 Subsystem可能选择相同 zIndex；equal-z tie-break必须 deterministic 且不可被业务依赖，不能使用 connection/reconnect arrival order。若相对覆盖顺序具有业务意义，应使用不同 zIndex。

## 5. Domain Roots

一个 Domain拥有 `0..N` ordered top-level roots：

```text
Domain Host
├── Root A
├── Root B
└── Root C
```

Domain Host是 Renderer基础设施 composition boundary，不是 Render Node。

`roots=[]` 表示 Domain存在但 authoritative presentation tree为空。

roots/children顺序属于 authoritative state；具体 DOM/Canvas/SceneGraph呈现由 Component implementation决定。

需要共享布局/裁剪/坐标语义时，Subsystem应创建真实 container/component Node，而不是协议 fake root。

## 6. Render Node Tree

概念模型：

```ts
interface RenderNode {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNode[];
}
```

### `key`

`key` 在一个 Domain lifecycle 内：

```text
unique across all current roots + descendants
one-shot logical identity
```

Renderer可通过：

```text
(subsystemKey, domainId, key)
```

定位 current logical Node。

同 key 的连续存在表示同一 logical component lifetime；`tag` 在该 lifetime 内保持稳定。Node被移除后，如果 producer需要新的 logical lifetime，必须使用 fresh key。

### `children`

`children[]` 是 ordered child relation。协议冻结结构顺序，不替具体 tag规定布局语义。

## 7. Node Tag / Renderer Component

`tag` 是逻辑 Renderer Component 类型，不是 DOM tag。

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

Render Update只引用 tag，不传 JavaScript module、Component class、CSS bundle 或 executable code。

Component implementation loading属于 Renderer Component Bootstrap/Profile / Host/Package boundary。

未知 tag不得自动退化为任意 DOM element。tag声明/Component availability的精确错误分类由 Component Profile冻结；组件当前未加载不应自动被解释成 Render state continuity divergence。

## 8. `attrs` / `data`

```text
attrs : {[key:string]: string}
data  : JSON object
```

二者都是 plain declarative data，不是 executable behavior。

`attrs`不是 raw DOM attributes；`data`是 tag-specific structured component state。不得携 Function、DOM object、MessagePort、Blob、class instance、callback。

当前 Patch设计只对 attrs/data 做 top-level map delta，不引入 generic JSON Pointer / JSON Patch path language。

## 9. Renderer Domain Store

Renderer按 `(subsystemKey, domainId)`维护 authoritative replica，并可内部维护：

```text
revision
zIndex
recursive roots/tree
key → node index
key → parent index
```

Wire/业务模型保持递归 Tree；内部索引用于 O(1) Patch寻址和 reconciliation，不构成第二种协议数据模型。

Renderer必须在暴露新 Domain state前完成完整 candidate validation，并以 Domain为单位 atomic commit。

## 10. Render Update State Model

当前 closure candidate：

```text
render.domains
    full Domain Registry / lifecycle authority

render.snapshot(revision)
    full recursive tree baseline / full commit

render.patch(baseRevision, revision)
    exact R → R+1 incremental authoritative commit

render.event
    transient presentation impulse
```

Snapshot保留自然的 recursive `roots[] / children[]` Tree。

Patch用 stable key寻址，operation algebra只包含：

```text
insert subtree
remove subtree
move subtree
update attrs/data
```

不增加 JSON Patch、path identity、appendChild/removeChild 等等价操作族。

## 11. Patch Atomicity / Revision

Domain `revision` 表示已发布 authoritative commit 序号，不是业务 mutation count、transport sequence 或 replay cursor。

fresh Data Connection首个 Snapshot建立当前 baseline `R`；之后每个 authoritative commit严格：

```text
R → R+1
```

Patch只有：

```text
baseRevision == current revision
revision == baseRevision + 1
```

时可应用。

一个 Patch：

```text
current Domain Store
→ isolated candidate
→ apply ordered ops
→ validate complete candidate
→ atomic commit
```

任何 authoritative continuity/validation failure都不能跳过继续；Renderer retire当前 Data carrier，以 fresh connection + Registry + Snapshots重新建立基线。

## 12. Event / Presentation Ordering

`render.event` 是 transient presentation impulse，不是 authoritative state。

Event与同 Domain Snapshot/Patch共享 publication order并形成 coalescing barrier：

```text
Patch
→ Event
→ Patch
```

Renderer保证 logical component commit/event顺序，但不要求每个 Event前等待浏览器 physical paint。

stale/missing target Event可以 soft drop，不排队等待 target重现、不 replay、不 retarget。

## 13. Backpressure / Recovery

Subsystem sender维护 per-Domain publication cursor（例如 `lastEmittedRevision`），不是 ACK cursor。

未 emitted 的 authoritative变化可以重新 diff或 materialize为 fresh full Snapshot；已 emitted message不能撤销/reorder。

```text
small diff          → Patch
large/backpressured → Snapshot
Event backlog        → bounded; may drop
```

Authoritative state progress优先于 transient Event backlog。

fresh Data Connection：

```text
render.domains(current Registry)
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

不 replay历史 Patch/Event，不要求 ACK/NACK/resync RPC。

## 14. Render Scheduler / Presentation

```text
Render message
→ Domain Store atomic commit / Event dispatch
→ dirty Domain scheduling
→ global zIndex composition
→ requestAnimationFrame
→ Component / DOM / Canvas / WebGL reconciliation
```

Scheduler只决定何时呈现 current Store，不改变 authoritative state。

v1无 cross-Domain transaction；强原子 presentation应优先建模在同一 Domain。

## 15. User Input / Component 边界

普通输入仍只发送到 Main授权的 Frame/Activation，不以 Domain/Node为 ordinary input authority。

```text
Render Component
→ optional Input Channel Producer
→ User Input Core
→ Main authority ∩ Interest ∩ Producer availability
```

Domain/Node/component existence本身不授予 InputTarget。

Custom Component MAY提供 `x.*` Input Channel Producer；Producer loss继续服从 User Input v1 teardown，而不是由 Render协议修改 Frame authority。

## 16. Data / Frame / Domain Independence

```text
Frame active != Domain visible
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle change
Data Connection retire != Domain destroy
Domain destroy != Frame close
```

Data loss期间 Renderer MAY保留最后合法 presentation cache，但 cache不是 fresh authority proof。fresh Data Connection后的 authoritative recovery只能由 Registry + fresh Snapshots重建。

## 17. Runtime Failure Boundary

Runtime terminal failure通常最终导致 Main撤销对应 DataAuthority，但 Frame unwind与 Render Domain cleanup仍是不同协议域。

healthy Runtime的 doomed Frame被 close后 MAY继续拥有/更新 Domains。

failed Runtime旧 Data carrier退休不等于已收到 authoritative Domain destroy；stale presentation保留/清理策略由 Render/runtime teardown policy明确。

## 18. 本地表现状态

DOM Element、Component instance、Canvas/WebGL资源、CSS动画、图片缓存、焦点/滚动/Hover、设备瞬时状态、纯视觉插值等可以只留 Renderer，但不得改变业务规则、Frame Stack或 recovery authority。

stable Node key可用于连续 lifetime内保留合法 component-local presentation state；authoritative state始终来自最新合法 Domain commit。

## 19. 当前渲染不变量

1. 每个 Subsystem Runtime拥有 `0..N` Render Domains；
2. Domain identity=`subsystemKey + domainId`，同 generation内 domainId one-shot；
3. Domain是 Render lifecycle、atomic state、global composition unit；
4. Domain拥有 zIndex + `0..N` ordered roots；
5. Domain Host不是 Render Node；
6. Node=`key/tag/attrs/data/children` recursive declarative model；
7. Node key Domain-lifecycle one-shot且 current tree全局唯一；
8. roots/children保持 authoritative order；
9. tag是 logical Renderer Component，不等于 DOM tag；
10. attrs/data是 plain data；
11. Main不维护 Domain Registry；Frame不拥有 Domain；
12. Snapshot是 full recovery baseline；Patch是 normal incremental authoritative commit；Event是 transient impulse；
13. Domain revision在 baseline后严格 `R→R+1`；
14. Patch按 key寻址、whole-candidate atomic validation/commit；
15. invalid authoritative chain → retire Data carrier → fresh Registry/Snapshots；
16. no ACK/NACK/Patch replay/resync RPC；
17. Frame/Data/Domain lifecycle相互独立；
18. Render Update的最终 limits/conformance仍在 closure阶段。
