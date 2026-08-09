# Renderer ⇐ Subsystem Render Update Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.render-update / 1`  
> 稳定程度：Evolving  
> 方向：Subsystem → Renderer only  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 相邻协议：[User Input Protocol v1](./user-input-v1.md)  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Render Update v1 是 Subsystem-owned Render Domain State 到 Renderer 的单向状态复制协议。Registry 决定 Domain lifecycle；Snapshot 决定当前 authoritative presentation state；Event 只表达可丢失、不可恢复的一次性 presentation impulse。Renderer 不通过本协议反向修改 Subsystem 状态。**

设计取向参考三类成熟模式，但不复制其复杂度：

- 借鉴 Wayland 的独立对象 identity / lifecycle 与 atomic committed state；
- 借鉴 List + Watch 类协议的“先建立 current baseline，再继续接收更新”；
- 借鉴远程图形协议对 surface/lifecycle 与 presentation command 的职责分层；
- v1 明确不引入 historical replay、tree patch、frame fence、cross-domain transaction、cache command stream。

---

## 1. 协议位置

```text
Subsystem Runtime
    authoritative Render Domain Registry
    authoritative Domain current state
    transient Render Events
              │
              │ Render Update v1
              ▼
Renderer
    Domain Store
    Component reconciliation
    Presentation-local state
              │
              ▼
    DOM / Canvas / WebGL / custom backend
```

Render Update v1 只存在于 current Renderer ⇄ Subsystem Data Connection 上。

它不是：

```text
Frame protocol
Input protocol
Renderer RPC
DOM remote-control protocol
component-code loading protocol
historical event stream
```

## 2. Roles / Direction

角色固定：

```text
Subsystem
    producer / authority

Renderer
    consumer / read-only mirror
```

协议方向固定：

```text
Subsystem → Renderer
```

v1 定义 **zero Renderer → Subsystem Render Update application messages**。

不存在：

```text
render.ack
render.error
render.resync
render.requestSnapshot
render.subscribe
render.resume
render.patchRequest
```

Renderer local diagnostics 不属于 wire。

## 3. Carrier / Scope

Render Update v1 运行在 [Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md) 的 `current` carrier 上。

Carrier 已绑定：

```text
current LoomRealm Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此 Render Update 每条消息 MUST NOT 重复：

```text
sessionId
rendererId
subsystemKey
generation
connectionProfile
```

Render Update 的 authority scope 是当前 Data Connection identity。

Data Connection `retired` 后，旧 carrier 上任何 Render Update message 都不再具有 current authority。

## 4. Application Model

v1 是 plain-data message protocol，不使用 JSON-RPC。

顶层 application message 必须是一个 closed-schema JSON-compatible object。

一个 carrier application-message boundary 对应一个 Render Update v1 message。

v1 定义三个 message kinds：

```text
render.domains
render.snapshot
render.event
```

没有 Batch message。

概念联合类型：

```ts
type RenderUpdateMessageV1 =
  | RenderDomainsV1
  | RenderDomainSnapshotV1
  | RenderEventV1;
```

## 5. Render Domain Model

每个 Subsystem 在一个 current DataAuthority generation 内拥有：

```text
0..N Render Domains
```

Domain 是：

```text
Render lifecycle unit
atomic authoritative state unit
Renderer global composition unit
```

Domain 不是 Render Node。

Domain logical identity：

```text
(current Data Connection authority scope, domainId)
```

因为 carrier 已绑定 `subsystemKey + generation`，wire 只携 `domainId`。

Renderer实现 MAY 使用：

```text
(subsystemKey, generation, domainId)
```

作为内部完整 replication identity。

## 6. `domainId` Lifecycle / One-Shot Rule

`domainId` 是 Subsystem-owned opaque string。

在同一：

```text
Session
+ subsystemKey
+ DataAuthority generation
```

内：

```text
domainId once removed from authoritative Domain Registry
→ MUST NOT become present again
```

即：

```text
absent → present → absent
```

是 terminal lifecycle。

禁止：

```text
absent → present → absent → present(same domainId)
```

原因：Registry publication MAY coalesce；如果允许同 ID revoke→recreate，Renderer可能看不到中间 absent，从而错误保留旧 component instance、animation state、resource state 或 custom input producer state。

新 lifecycle MUST 使用 fresh `domainId`。

DataAuthority generation replacement开启新的 Render replication authority universe；旧 generation 的 Domain lifecycles不延续为新 generation 的 authoritative identity。

## 7. Render Domain Registry

Domain Registry 是 Subsystem 当前 authoritative Domain membership set。

Wire：

```ts
interface RenderDomainsV1 {
  readonly type: "render.domains";
  readonly domains: readonly string[];
}
```

`domains`：

```text
full replacement
set semantics
no duplicates
array order has no presentation meaning
```

收到并验证后，Renderer MUST 原子替换该 Subsystem/current generation 的 current Domain membership。

### 7.1 Add

如果新 Registry 首次包含 `domainId = D`：

```text
D becomes present
D presentation state = pending until first fresh Snapshot(D)
```

Renderer MUST NOT 为 D 猜测 tree、zIndex 或 component state。

### 7.2 Remove

如果上一已应用 Registry 包含 D，而新 Registry 不再包含 D：

```text
D lifecycle terminates
```

Renderer MUST：

```text
remove D authoritative Domain Store
terminate D authoritative Node identities
unmount/release D presentation components according to Renderer policy
invalidate pending Render Events for D
invalidate pending unsent/apply work for D
```

通过 User Input 注册的 custom Producer teardown 仍按 User Input v1 收敛；Render Update本身不发送 Input Reset。

### 7.3 Registry Is Lifecycle Authority

不存在独立：

```text
render.create
render.destroy
render.close
```

Registry membership 本身就是 Domain lifecycle authority。

## 8. Registry Publication Rules

fresh Data Connection 上的 **第一条 Render Update v1 message** MUST 是 `render.domains`。

注意：它不要求成为整个 Data carrier 的第一条 application message；同 carrier 上的 User Input domain MAY 有自己的合法消息。

在同一 current connection 上：

```text
Snapshot/Event(D)
MUST be preceded by an applied/processable Registry publication containing D
```

Registry removal D 一旦被发送：

```text
MUST NOT send later Snapshot/Event for removed D
```

Registry 是全局 Render lifecycle barrier。

## 9. Registry Coalescing

Registry 是 full current state，多个尚未发送的 Registry publications MAY latest-state coalesce。

例如内部 current membership经历：

```text
[A]
[A, B]
[A, B, C]
```

若尚未发送，可只发送：

```text
[A, B, C]
```

因为 `domainId` one-shot，Renderer不需要观察所有中间 membership states 才能判断已发布 Domain 的终止。

Registry coalescing MUST 保持以下约束：

```text
no Snapshot/Event may be emitted for a Domain
unless an earlier emitted Registry includes that Domain

no Snapshot/Event may remain pending after
an emitted Registry removes that Domain
```

如果 replacement Registry 使某些 pending Domain messages 不再合法，sender MUST 丢弃这些 pending messages。

## 10. Domain Snapshot

Domain Snapshot 是一个 Domain 当前 authoritative presentation state 的完整替换。

Wire：

```ts
interface RenderDomainSnapshotV1 {
  readonly type: "render.snapshot";
  readonly domainId: string;
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}
```

`render.snapshot` 的语义：

> **验证成功后，以该消息中的 `zIndex + roots` 原子替换该 Domain 当前 authoritative Domain Store。**

不存在 field-level merge。

## 11. Snapshot Atomicity

Renderer MUST 在暴露新 Domain Store前完整验证 Snapshot。

验证成功：

```text
old Domain Store
→ atomic replace
→ new Domain Store
```

不得暴露：

```text
new zIndex + old roots
old zIndex + partially replaced roots
half-validated Node Tree
```

验证失败：

```text
MUST NOT partially apply
MUST preserve previous last legal Domain Store if one exists
```

`zIndex` 与 Tree State 属于同一个 Domain atomic commit。

## 12. Render Node Value Model

v1 Snapshot 使用声明式 Node Tree。

```ts
interface RenderNodeV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObjectV1;
  readonly children: readonly RenderNodeV1[];
}
```

其中：

```text
roots[]      ordered top-level Node list
children[]   ordered child Node list
```

Domain MAY 有：

```text
roots = []
```

表示 Domain存在但当前没有 presentation nodes。

Domain Host 不是隐式 Render Node，因此 v1 不强迫轻量 Domain创建 fake root/container。

## 13. Node `key`

`key` 是当前 Domain Tree 内的 reconciliation identity。

每个合法 Snapshot：

```text
all Node keys across all roots + descendants MUST be unique
```

因此 Renderer可通过：

```text
(domainId, key)
```

在当前 Data Connection authority scope 内唯一定位 Node。

连续应用的 Snapshot 中，相同 key 表示同一 logical Node identity，Renderer MAY 保留合法的 component-local presentation resources/state。

如果 producer 需要强制一个 Node 成为新的 logical component instance，SHOULD 使用 fresh key，而不是依赖某个可能被 coalesce 掉的中间 absence。

同一 Domain lifecycle 中，相同 key 的 `tag` MUST保持稳定；需要改变 component type 时 MUST使用 fresh key。

## 14. Node `tag`

`tag` 是逻辑 Renderer Component type，不是 DOM tag。

概念解析：

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

不同 Subsystem MAY 使用相同 tag 字符串并解析到不同组件实现。

Renderer MUST NOT 将未知 tag 自动解释为任意 DOM element。

Render Update只引用 `tag`；它不传输：

```text
JavaScript module
Component class
Function
CSS bundle
executable code
```

Component implementation如何进入 Renderer属于 Renderer Component Bootstrap/Profile / Host/Package loading边界。

## 15. `attrs` / `data`

`attrs`：

```text
string → string declarative attributes
```

`data`：

```text
tag-specific structured JSON object
```

两者都属于声明式数据，不是 executable behavior。

`attrs` MUST NOT 被 Core 自动解释成任意 DOM attributes；例如 `onclick` / `style` 字符串不能绕过 Component自己的解释边界。

`data` MUST 是 plain JSON object，不得携带：

```text
Function
Symbol
BigInt
DOM object
MessagePort
Blob
ArrayBuffer
class instance
callback
```

具体 tag 对 attrs/data 的业务 schema由对应 Renderer Component contract/profile定义。

## 16. Snapshot Reconciliation

Render Update wire 只发送 full Snapshot。

Renderer MAY 使用 stable Node key 本地计算：

```text
old Domain Tree
vs
new Domain Tree
→ mount / update / move / unmount reconciliation
```

这属于 Renderer implementation，不改变协议 state model。

v1 不定义：

```text
insertNode
removeNode
moveNode
setAttr
patchData
replaceChildren
JSON Patch
operation log
```

## 17. Snapshot Coalescing

同一 Domain 的多个尚未发送 Snapshot MAY latest-state coalesce。

例如：

```text
Snapshot A1
Snapshot A2
Snapshot A3
```

可以只发送：

```text
Snapshot A3
```

但 Snapshot MUST NOT跨同 Domain Render Event barrier合并。

例如：

```text
Snapshot A1
Snapshot A2
Event E
Snapshot A3
Snapshot A4
```

可收敛为：

```text
Snapshot A2
Event E
Snapshot A4
```

不得变成：

```text
Event E
Snapshot A4
```

如果 E 的目标/语义依赖 Event 前的 current Domain state，Renderer必须能在 E 前观察到该 Domain最新可用 baseline。

## 18. Render Event

Render Event 表达一次性的、非 authoritative、不可恢复的 presentation impulse。

Wire：

```ts
interface RenderEventV1 {
  readonly type: "render.event";
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObjectV1;
}
```

Event 必须指向当前 Domain Tree 中一个现存 Node。

Domain Host 不是 Component，因此 v1 不定义无 `targetKey` 的 domain-level custom Event。

需要 domain-wide visual effect 时，Subsystem应让一个真实 Render Node/Component承担该 effect target。

## 19. Event Semantics

Render Event：

```text
ordered within its Domain stream
transient
MUST NOT coalesce
MUST NOT replay
MUST NOT create authoritative Render Store state
MUST NOT require a future Event to restore protocol correctness
```

Event MAY 触发 component-local presentation state，例如：

```text
flash animation
particle burst
camera shake on a scene component
one-shot transition cue
```

但以下事实必须进入 Snapshot，而不能只依赖 Event：

```text
Node exists / does not exist
current zIndex
current component business data
persistent visibility
persistent position
persistent selected state
anything whose loss would leave Renderer permanently divergent
```

Renderer处理 Event时 MUST NOT 因 Event直接修改 authoritative Domain Store；Event只能影响 presentation-local ephemeral state。

## 20. Event Target Gate

收到 `render.event` 时 Renderer MUST确认：

```text
domainId is currently present
fresh Snapshot for this Domain has been applied on this current connection
targetKey exists in current applied Domain Tree
```

否则：

```text
MUST drop Event
```

不得：

```text
cache until target appears
replay after reconnect
retarget to another Node
```

Event target的解释由 target Node当前 `tag` 对应 Component完成。

## 21. Per-Domain Ordered Stream

对每个 current Domain，逻辑上存在一个有序 publication stream：

```text
Snapshot
Event
Snapshot
Event
...
```

Data carrier提供 Subsystem → Renderer application-message order。

v1 不增加：

```text
domainSequence
eventSequence
snapshotRevision
```

不同 Domain之间不提供 atomic transaction，也不得依赖中间 Snapshot必然可见。

如果多个 UI部分必须作为一个原子 authoritative presentation state提交，应将它们建模在同一个 Domain。

## 22. Cross-Domain Independence

Domain A 的 Render Event只对 Domain A 的 Snapshot coalescing形成 barrier。

v1 不要求 Domain B 的待发送 Snapshot因为 Domain A Event而停止 latest-state coalescing。

不存在：

```text
cross-domain transactionId
render frame fence
commit group
multi-domain revision
```

不同 Subsystem之间更不存在 Render atomic transaction。

## 23. zIndex / Global Composition

每个 Snapshot包含：

```text
zIndex
```

`zIndex` 是该 Domain当前 Subsystem-authoritative global composition layer。

规则：

```text
lower zIndex → below
higher zIndex → above
```

Frame Stack / Activation MUST NOT 自动转换为 Domain zIndex。

多个 independent Subsystem MAY 发布相同 zIndex。

相同 zIndex 的相对顺序：

```text
MUST be implementation-stable / deterministic for one Renderer implementation
MUST NOT be treated as portable business semantics
```

如果两个 Domain 的覆盖先后具有业务意义，producer必须使用不同 zIndex。

## 24. Fresh Connection Baseline

每条 fresh current Data Connection 上，Render Update恢复固定为：

```text
1. render.domains(current full Registry)
2. fresh render.snapshot for every current Domain
3. then ordinary render.event may flow for each Domain
```

每个 Domain在该 fresh connection上必须先完成 fresh Snapshot baseline，才能接收其 Event。

这条规则适用于：

```text
Renderer reload
same-generation carrier reconnect
new Renderer participant with fresh Data connection
```

不定义 historical replay。

## 25. Same-Generation Reconnect

current carrier丢失时：

```text
Data Connection current → retired
Render Update transmission stops
```

如果同一 DataAuthority generation仍有效，可以建立 fresh carrier。

Renderer MAY暂时保留旧 carrier最后合法的 presentation Store，以避免无必要黑屏，但必须视为：

```text
presentation cache
!= newly proven current remote state
```

fresh connection上：

- `render.domains` 决定哪些 cached Domains仍存在；
- 新 Registry不包含的 cached Domain MUST移除；
- 仍存在的 Domain MAY继续显示旧 presentation，直到 fresh Snapshot原子替换；
- fresh Snapshot到达前 MUST NOT把新的 Render Event应用到旧 cached baseline；
- Event outage期间全部丢失，不 replay。

## 26. Generation Replacement

如果 Main将 DataAuthority：

```text
G → G2
```

旧 generation G 的全部 Render Update authority终止。

旧 generation的 Domain/Node identity MUST NOT被认为自动延续到 G2。

Renderer MAY出于视觉连续性暂时保留旧 presentation cache，但 G2 的 Registry/Snapshot建立的是新的 replication authority universe。

G2 中相同 `domainId` / Node `key` 字符串不证明与 G 的 component instance存在 authority-level identity continuity。

这避免 Runtime replacement / Data authority replacement时错误复用 stale presentation-local state。

## 27. Frame / Activation Independence

Render Update message MUST NOT包含：

```text
frameId
activationId
callerFrameId
Frame lifecycle
InputTarget
```

因此：

```text
Frame active != Domain visible
Frame suspended != Domain hidden
Frame close != Domain destroy
Activation replacement != Domain epoch
Frame unwind != Domain Registry mutation
```

Subsystem业务 MAY在内部根据 Frame事件修改 Domain state，但公共语义只能通过 Render Update显式表达。

## 28. User Input Independence

Render Node / tag / Domain 不产生 User Input authority。

Component存在 MAY使对应 custom Input Producer available，但 ordinary User Input仍必须满足 User Input v1：

```text
current Data Connection
∩ Main InputTarget/Activation
∩ Input Interest
∩ Producer availability
```

Render Event不得代替 User Input，也不得直接调用 Frame RPC。

## 29. Backpressure

所有 Render Update queues MUST bounded。

推荐 Core队列模型：

```text
Registry
    at most latest replaceable unsent full Registry

per Domain Snapshot
    latest replaceable unsent Snapshot within current Event/lifecycle segment

per Domain Event
    bounded ordered FIFO
```

Snapshot：

```text
latest wins
MAY coalesce
```

Event：

```text
MUST NOT coalesce
MAY be dropped under bounded overflow policy
surviving Events MUST preserve original relative order
never replay dropped Events
```

Event overflow本身：

```text
MUST NOT imply Runtime failure
MUST NOT imply Frame unwind
MUST NOT imply DataAuthority replacement
```

具体 queue numeric limits / overflow preference由 Phase-1 Completion/Profile冻结。

## 30. Registry / Snapshot / Event Barrier Summary

```text
Registry
    global Domain lifecycle barrier

Snapshot
    full current Domain authoritative state
    atomic replacement
    latest-state coalescible

Event
    same-Domain Snapshot coalescing barrier
    transient presentation impulse
    no replay
```

一旦 Registry移除 Domain：

```text
all pending Snapshot/Event for Domain become invalid
```

新 Domain第一次 Event前：

```text
Registry includes Domain
→ fresh Snapshot applied
→ Event allowed
```

## 31. No Revision / ACK / Replay

v1 Core明确不定义：

```text
revision
resourceVersion
snapshot sequence
ACK
checkpoint
resume cursor
history replay
resync request
```

理由：

```text
ordered current carrier
+ full Registry
+ full Domain Snapshot
+ one-shot domainId lifecycle
+ fresh reconnect baseline
```

已经足以恢复 current state。

Revision只有在未来引入：

```text
Tree Patch
historical replay
out-of-order update transport
partial snapshot recovery
```

时才具有新的 correctness价值；届时应进入新版本/Profile，而不是静默加入 v1 closed schema。

## 32. JSON / Plain-Data Model

允许：

```text
null
boolean
string
finite JSON number
array
object
```

整数语义字段 MUST 是 safe integer。

禁止：

```text
undefined
NaN / ±Infinity
BigInt
Function / Symbol
ArrayBuffer
Blob
MessagePort
DOM / Host object
class instance
invalid Unicode scalar sequence
duplicate JSON object member
```

所有 v1 protocol objects为 closed schema；未知 protocol字段 MUST rejected。

Tag-specific `data` 内的业务 object可由对应 Component contract定义自身字段，但其值仍必须属于本 plain JSON model。

## 33. Structural Validation

Renderer至少验证：

```text
known Render Update message type
closed schema
domainId valid
Registry no duplicate domainId
Snapshot domain currently present
zIndex valid integer
roots is array
Node tree finite / acyclic serialized tree
Node key unique Domain-wide
tag valid / resolvable under active Component profile
attrs string→string
data plain JSON object
children array
Event target Node currently exists
message/tree within active limits
```

Snapshot任何 Node validation失败：

```text
MUST reject whole Snapshot
MUST NOT partially mutate Domain Store
```

## 34. Error / Failure Boundary

Render Update是单向协议，没有 wire Error Response。

### 34.1 Soft/Stale Render Message

以下可安全局部丢弃：

```text
Event targetKey no longer exists
Event arrives before fresh current-connection baseline
Event for already removed Domain
```

Renderer MUST drop，并 MAY记录 bounded diagnostics。

### 34.2 Invalid Snapshot

例如：

```text
duplicate Node key
invalid attrs/data
unknown/unavailable required tag
invalid tree shape
```

Renderer MUST reject整个 Snapshot并保留旧合法 Store。

实现 MAY根据 Host policy退休 Data Connection，但不得局部修复 malformed authoritative tree。

### 34.3 Hard Wire Violation

例如：

```text
invalid message discriminator
invalid closed schema
non-JSON value
hard size/depth overflow
```

Renderer SHOULD fail closed并 retire current Data Connection。

无论上述哪一类，都不得由 Renderer自行宣布：

```text
Subsystem Runtime terminal failed
Frame unwind
Frame outcome failed
```

Runtime failure仍由 Control/Supervisor authority决定。

## 35. Component Availability Boundary

一个 Snapshot引用的 `tag` 应在 active Renderer Component Profile 下可解析。

Component bootstrap/loading SHOULD在对应 Domain state需要使用该 tag前完成。

Render Update v1 不定义：

```text
component download
module import
script execution
CSS installation
component capability negotiation
```

未知 tag不能 fallback为任意 DOM tag。

## 36. Security Boundary

- Render data视为不可信输入，必须在创建 DOM/Canvas/WebGL presentation前校验；
- `tag` 不得直接成为任意 executable module locator；
- `attrs` 不得自动映射为不受控 DOM event handler / script / arbitrary style execution；
- `data` 不得携带 executable object；
- logical resource references应通过 Content API/Profile解析，不应把任意 filesystem path当 Render authority；
- Render Event只影响 presentation-local state，不能扩大 Frame/Input/Data authority；
- Renderer不得从 Render Tree推断 Main Stack/InputTarget。

## 37. Minimum Conformance Scenarios

至少覆盖：

```text
fresh-connection-first-render-message-is-registry
empty-registry
registry-full-replacement
registry-add-domain-pending-until-snapshot
registry-remove-domain-destroys-authoritative-store
registry-order-non-semantic
registry-duplicate-domain-rejected
registry-coalescing-safe

domain-id-one-shot-within-generation
removed-domain-id-not-regranted
same-domain-id-new-generation-is-new-authority-universe

snapshot-only-for-present-domain
snapshot-atomic-zindex-and-tree-replace
snapshot-full-replacement
snapshot-latest-coalescing
snapshot-no-tree-patch
snapshot-invalid-tree-no-partial-apply

zero-root-domain
multiple-ordered-roots
domain-wide-unique-node-key
same-key-stable-tag
fresh-key-for-component-type-replacement
ordered-children

subsystem-scoped-tag-resolution
unknown-tag-no-dom-fallback
attrs-data-plain-declarative

render-event-current-target
render-event-transient
render-event-no-authoritative-store-mutation
render-event-no-replay
render-event-not-coalesced
render-event-before-fresh-baseline-dropped
render-event-missing-target-dropped
render-event-is-same-domain-snapshot-barrier

same-generation-reconnect-full-registry
same-generation-reconnect-fresh-snapshot-per-domain
same-generation-reconnect-no-event-replay
cached-presentation-is-not-current-proof

generation-replacement-retires-old-render-authority
frame-close-does-not-remove-domain
activation-change-does-not-change-domain-lifecycle
data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame

bounded-registry-queue
bounded-domain-snapshot-queue
bounded-event-fifo
event-overflow-does-not-fail-runtime
```

## 38. Explicit Non-Goals v1

v1 不定义：

```text
Renderer → Subsystem Render RPC
ACK / Result
revision / sequence
history replay
resume cursor
Tree Patch / JSON Patch
node mutation commands
cross-Domain transaction
cross-Subsystem transaction
render frame fence
vsync protocol
animation clock synchronization
damage rectangles
raster command stream
graphics codec negotiation
binary texture streaming
component module loading
DOM tag protocol
CSS protocol
Frame binding
Input authority
business state mutation
```

这些能力如果未来确有必要，应通过新协议版本或独立 Profile引入。

## 39. Wire Surface Summary

| `type` | 方向 | 职责 |
|---|---|---|
| `render.domains` | Subsystem → Renderer | full current Domain Registry / lifecycle authority |
| `render.snapshot` | Subsystem → Renderer | atomic full current state of one Domain |
| `render.event` | Subsystem → Renderer | ordered transient presentation impulse to one current Node |

v1 Core只有这三种 application message kinds。

## 40. Final Invariants

1. Render Update v1只有 Subsystem → Renderer 单向数据流；
2. Subsystem是 Domain Registry / Domain State唯一 authority；
3. Data Connection identity隐式提供 Session / Renderer / subsystemKey / generation scope；
4. Domain Registry使用 full replacement；
5. Registry membership定义 Domain lifecycle；
6. `domainId` 在同 generation removal后不得复用；
7. Domain Snapshot完整替换 `zIndex + roots` 并原子提交；
8. Domain允许 `0..N` ordered roots，不存在协议强制 fake root；
9. Node key在当前 Domain Tree中全局唯一；
10. 同 key 的 tag在同 Domain lifecycle中稳定；
11. tag是 Subsystem-scoped Renderer Component type，不是 DOM tag；
12. attrs/data只包含声明式 plain data；
13. wire只发送 full Snapshot，不发送 Tree Patch；
14. Renderer MAY按 key本地 reconciliation；
15. Snapshot可 latest-state coalesce，但不得跨同 Domain Event barrier；
16. Render Event只表达 transient presentation impulse；
17. Event不得创建 authoritative persistent state；
18. Event必须 target当前 fresh-baseline Tree中的 Node；
19. Event不 replay、不 coalesce；
20. fresh connection = current full Registry + fresh Snapshot per current Domain；
21. same-generation reconnect不恢复历史 Event；
22. generation replacement开启新的 Render replication authority universe；
23. Data loss不等于 Domain destroy，也不等于 Runtime failure；
24. Frame/Activation/InputTarget不拥有 Domain lifecycle；
25. v1无 revision / ACK / replay / resync / cross-Domain transaction。

## 41. Summary

```text
Subsystem current Render state

Domain Registry
    full replacement
    lifecycle authority

per current Domain
    Snapshot
        full current zIndex + roots
        atomic / coalescible

    Event
        target current Node
        transient / ordered
        no replay / no coalescing

fresh Data Connection
    Registry
    → fresh Snapshot for every current Domain
    → Events may resume

Renderer
    validate
    → atomic Domain Store
    → key-based local reconciliation
    → zIndex global composition
    → presentation backend
```

最终原则：

> **恢复依赖“当前完整状态”，不是依赖“历史更新日志”；性能优化优先留在 sender coalescing 与 Renderer local reconciliation，而不是扩大 v1 wire surface。**
