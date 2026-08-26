# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> Profile 标识：`loomrealm.renderer-data/1`  
> 稳定程度：Frozen  
> 主要定义：Renderer ⇄ Subsystem current Data Connection 上 Data Connection v1、User Input v1 与 Render Update v1 的固定版本组合、application-unit mapping、单 reader/dispatcher、单 writer、方向约束、fresh-carrier 组合与 Data-local terminal boundary  
> 依赖：[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)  
> 上游 authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)  
> Conformance：[Renderer Data Profile v1 Conformance](./renderer-data-profile-conformance-v1.md)  
> 决策：[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)  
> 最近复核：2026-08-26

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **DataAuthority 选择一套完整 Data Application Profile；Profile v1 静态绑定 Connection 1 + User Input 1 + Render Update 1。一个 current carrier 只有一个 inbound reader/dispatcher 与一个 outbound serialized writer；共享 carrier 只共享 application-unit ordering 与 terminal boundary，不创建跨 child protocol authority、revision、transaction、ACK 或 replay。**

---

## 1. Composition / Identity

```text
Renderer Data Application Profile v1
├── Data Connection Contract v1
├── User Input Protocol v1
└── Render Update Protocol v1
```

固定版本：

```text
Data Connection = 1
User Input      = 1
Render Update   = 1
```

Profile 标识固定：

```text
loomrealm.renderer-data/1
```

任何实现声明支持本 Profile，MUST完整支持三个 frozen component；不得只支持其中一部分仍宣称 `loomrealm.renderer-data/1`。

```text
npm package semver
!=
Data Profile version
!=
child protocol version
```

---

## 2. Selection / Authority Boundary

Main 通过 Renderer Control 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: "loomrealm.renderer-data/1";
}
```

`dataProfile` 是 complete application-stack identity，不是 transport、endpoint 或 credential。

```text
dataProfile != websocket
dataProfile != messageport
dataProfile != endpoint/ticket/Port
```

Profile不 mint / mutate：

```text
Session
Renderer participant
subsystemKey
generation
dataProfile
InputTarget
Frame/Activation
Render Domain business authority
```

只有 Platform DataConnectionBroker 完成 paired installation、并且 exact current `S/G/P` authority 仍成立后，该 carrier 才能交给 Profile mechanics 作为 current application carrier。

如果当前 `dataProfile` 无法由两端实现：

```text
Data Connection remains absent
```

这本身不等于 Runtime failure，也不改变 Frame authority。

Profile replacement：

```text
P1 → P2
```

MUST 作为 DataAuthority replacement，并使用 fresh generation；不得同 generation 静默换 application semantics。

---

## 3. Application Unit / Common Preflight

每个 current carrier application unit 固定为：

```text
one carrier application unit
=
one UTF-8 JSON text string
=
one child-protocol message object
```

### Hostra / WebSocket

```text
one complete WebSocket text message
=
one application unit
```

binary message不得承载本 Profile application traffic。

### PWA / MessagePort

```text
postMessage(string)
=
one application unit
```

不得直接 `postMessage(object)` 扩大 application value model；Structured Clone / Transferable 只用于 Platform bootstrap/provisioning，例如转移 `MessagePort` 本身。

### Common hard gate

User Input v1 与 Render Update v1 已共同冻结：

```text
max application unit UTF-8 bytes      1,048,576
max JSON container nesting depth      64
```

因此 Profile receiver MUST在 child semantic handling 前统一执行：

```text
carrier unit is string
→ actual UTF-8 bytes <= 1 MiB
→ Wire parseJsonText
→ Wire representation validation
→ JSON container depth <= 64
→ top-level type discrimination
→ child exact validation
```

不得先无界 buffer/parse 后再拒绝。

其余 identifier/count/payload/structural limits继续由对应 frozen child protocol拥有；Profile不建立第二套相互冲突的业务 limits。

禁止 application model：

```text
undefined
BigInt
NaN / Infinity
ArrayBuffer / Blob
MessagePort / Host object
Function / Symbol
JSON-RPC Batch
multiple application messages in one carrier unit
```

source duplicate JSON members继续遵循 frozen Wire / ECMAScript `JSON.parse` observable semantics；Profile不得增加第二 tokenizer/parser。

---

## 4. Exact Namespace / Direction Surface

Profile v1 只有两个 application namespace：

```text
input.*   → User Input v1
render.*  → Render Update v1
```

exact message kinds：

```text
Subsystem → Renderer
    input.interest
    render.domains
    render.snapshot
    render.patch
    render.event

Renderer → Subsystem
    input.state
    input.event
    input.reset
```

以下均为 protocol-invalid / Data-fatal：

```text
unknown top-level type
known type in wrong role direction
cross-namespace shape masquerading as another type
malformed JSON
child exact-schema/representation/limit invalid
```

不得猜测、downgrade、ignore 为“未知扩展”。

未来增加第三 namespace、第五 Render message、第五 Input message，或改变方向，都需要新的 child protocol/Profile combination。

---

## 5. One Connection-wide Reader / Dispatcher

每个 current Data carrier MUST恰有一个 logical inbound reader：

```text
carrier.messages()
        ↓
one reader
        ↓
common preflight / parse
        ↓
type discrimination
       / \
 input.* render.*
```

Input 与 Render 实现 MUST NOT各自调用 `carrier.messages()` 竞争消费同一 stream。

Dispatcher 固定：

```text
input.interest/state/event/reset
    → User Input role handler

render.domains/snapshot/patch/event
    → Render role handler
```

Response/RPC correlation 不存在；Data Profile不是 JSON-RPC profile。

child role handler可以维护自己的 authority/state machine，但不能绕过 shared reader 重新读取 carrier。

---

## 6. One Connection-wide Serialized Writer

每个 current Data carrier MUST恰有一个 logical outbound serialized writer。

所有 outbound Input/Render units：

```text
child message validated/materialized
→ shared writer queue
→ carrier.send(string)
```

要求：

```text
at most one carrier.send pending from Profile writer at a time
accepted send order == writer dequeue order
no adapter/profile-created retry
no duplicate send
no verbatim migration to a fresh carrier
```

此 single writer 的目的仅是稳定 shared carrier ordering 和 bounded terminal behavior；它 **不创建**：

```text
shared Input/Render revision
cross-child transaction
cross-child atomic commit
cross-child ACK
cross-child replay cursor
```

Child protocol自己的 barrier/coalescing规则仍由 child sender mechanics拥有，例如 Input State/Event/Reset barrier、Render Event/authoritative-state barrier。Profile writer不得打乱 child 已决定的 emission order。

---

## 7. Child Semantic Outcome Boundary

Profile负责 representation、namespace/direction、shared dispatch/writer 与 Data-local terminal mechanics。

Child protocol继续拥有自己的 stateful semantics：

```text
User Input
    Interest/Activation/current-gate applicability
    State/Event/Reset semantics
    stale input drop

Render Update
    Domain registry/baseline/revision continuity
    Patch atomicity/one-shot identity
    stale Event drop
```

因此 child handler对一个**已通过 Profile/static child validation**的 message有两类显式结果：

```text
accepted / handled
    includes well-formed stale/inapplicable drop when child contract says drop

protocol-fatal
    stateful child semantic violation that frozen child contract says must retire Data
```

普通 business/presentation handler exception不是“远端协议无效”的证据；不得自动伪造成 protocol-invalid peer input。Role implementation应在 child protocol boundary内按其本地 policy处理。

---

## 8. Ordering Boundary

Data carrier每方向保持 application-unit order。

同方向已 emitted Input/Render message具有物理顺序，但 Profile不赋予跨 child application meaning。

```text
User Input ordering/recovery
    → User Input v1 owns

Render ordering/recovery
    → Render Update v1 owns
```

不得引入：

```text
shared Data revision
Input↔Render ACK join
cross-domain transaction
resume-from-revision
Control/Data barrier RPC
```

Renderer Control Connection 与 Data Connection依旧没有 global total order。

---

## 9. Fresh Current Carrier Boundary

每个 newly installed current Connection instance都是 fresh Profile publication boundary。

旧 carrier retired 后：

```text
stop reader
stop trusting inbound traffic
stop accepting new outbound child sends
pending not-yet-emitted old-carrier units become obsolete
no replay / no migration onto fresh carrier
```

### User Input fresh baseline

```text
remote Frame Interest Registry = empty
retained Input State = empty
Event history = empty
```

Subsystem如仍有 Desired Interest，重新发布 current full Registry；重新 Effective 的 `.state` 建 fresh baseline；`.event` future-only。

### Render fresh baseline

```text
first Render message = current render.domains
→ fresh render.snapshot for each current Domain
→ ordinary Patch/Event
```

same-generation reconnect不得继承 old carrier publication cursor/revision base作为 fresh authority。

### Independence

```text
fresh Input publication != fresh Frame lifetime
fresh Render publication != business Domain recreation
same-generation reconnect != Runtime restart
fresh Data generation != automatic Activation replacement
```

---

## 10. Terminal / Failure Boundary

Profile application mechanics一旦发生以下任一事实，当前 Profile peer MUST进入 terminal，停止继续处理该 carrier：

```text
carrier closed/lost
common preflight/JSON/profile namespace violation
child static schema/representation/limit invalid
child explicit stateful protocol-fatal result
writer send terminal/failure
local profile mechanics fatal
```

实现 MUST：

```text
terminal first-wins
stop accepting ordinary child operations
settle pending writer work exactly once
best-effort close current carrier when locally detecting protocol/local fatal
never parse/send further current traffic after terminal
```

Profile terminal只说明：

```text
this Data application binding is unusable
```

它不得直接提交：

```text
Runtime terminal
Frame unwind
InputTarget mutation
DataAuthority replacement
Renderer participant failure
```

这些属于 Main/Supervisor/Platform更高层 authority/policy。

当前 Connection Core最终把当前 carrier视为 retired；如果 `S/G/P` authority仍 current，Platform可建立 same-generation fresh current carrier。

---

## 11. Bounded Backpressure

Profile writer queue与 child sender queues MUST bounded。

Profile不规定一个跨 child 的固定 queue capacity，但必须保证：

```text
no unbounded accumulation
terminal/authority teardown cannot be permanently blocked by backlog
no Profile-created retry/replay
child-prescribed priority/barrier remains enforceable
```

Input/Render child contract可以在 emitted 前按各自规则 coalesce/drop；一旦 `carrier.send()` accepted，该 unit属于当前 carrier history，不得 retract/reorder/migrate。

---

## 12. Version Evolution

以下任一改变都不能在 `loomrealm.renderer-data/1` 下静默发生：

```text
Data Connection version
User Input version
Render Update version
application-unit encoding/mapping
namespace ownership/direction
one-reader dispatcher requirement
one-writer serialization requirement
fresh-carrier composition
common terminal/fail-closed behavior
```

不同组合必须使用明确的新 Data Profile identity。

---

## 13. Conformance

Normative qualification由 [Renderer Data Profile v1 Conformance](./renderer-data-profile-conformance-v1.md) `fixtureSetRevision = 1` 固定。

至少证明：

```text
profile-exact-identity-and-version-binding
one-json-text-unit
common-1mib-depth64-preflight
single-reader-dispatcher
single-serialized-writer
exact-role-direction
input-render-type-routing
unknown-type-fail-closed
child-protocol-fatal-retires-profile-peer
fresh-carrier-child-baselines
old-unsent-not-migrated
terminal-first-wins
no-profile-retry-replay
control-data-no-total-order
hostra-pwa-same-data-profile-trace
```

Executable fixture materialization属于 M8 implementation qualification；不得改变本 Frozen observable contract。

---

## 14. Final Invariants

1. `loomrealm.renderer-data/1` = Connection1 + Input1 + Render1；
2. Profile不新增 Data handshake/RPC/ACK/revision；
3. `dataProfile` 是 complete application stack identity，不是 transport/credential；
4. Profile change必须 fresh Data generation；
5. one carrier unit = one UTF-8 JSON text string；
6. common preflight = 1 MiB + depth 64 + frozen Wire parse/representation；
7. exactly one connection-wide reader/dispatcher；
8. exactly one connection-wide serialized writer；
9. direction fixed：Subsystem 发 Interest+Render，Renderer 发 ordinary Input；
10. User Input 与 Render保持独立 authority/state/recovery；
11. fresh current carrier重建两个 child publication baseline，不 replay/migrate旧 carrier traffic；
12. Data/Profile terminal不等于 Runtime/Frame failure；
13. Platform Broker拥有 physical candidate/paired installation，Profile mechanics只消费 already-current carrier；
14. incompatible observable change需要新 Profile/child protocol version。
