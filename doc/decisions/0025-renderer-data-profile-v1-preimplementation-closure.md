# ADR 0025：Renderer Data Profile v1 preimplementation closure

> 状态：Accepted  
> 日期：2026-08-26  
> 决策范围：`loomrealm.renderer-data/1` composition、shared carrier mechanics、role direction、terminal boundary 与 `@loomrealm/data` 首次实现接口  
> 依赖：[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[package architecture](../30-implementation/package-architecture.md)  
> 不改变：Main DataAuthority、Platform paired installation、User Input/Render child frozen semantics、Subsystem/Renderer business authority

## Context

Data Connection v1、User Input v1 与 Render Update v1 已全部 Frozen，但 `Renderer Data Application Profile v1` 仍处于 Draft。继续直接编码会迫使独立实现自行决定以下 shared mechanics：

```text
谁唯一读取 carrier.messages()
Input/Render outbound 是否允许并发 carrier.send
unknown type / wrong direction 如何失败
child stateful protocol-fatal 如何把 current Data 终止
fresh carrier 是否迁移 old unsent queue
@loomrealm/data 是 connection establisher 还是 already-current carrier consumer
role-facing package API 是否暴露 generic session/RPC abstraction
```

这些选择会改变跨实现 observable behavior，不能留到 M8 implementation 中临时决定。

同时，三个 child contract 已经关闭 message/schema/lifetime/recovery 大自由度；继续扩展 Input/Render 功能反而会扩大 freeze surface，而不是帮助实现。

---

## Decision 1：直接冻结 current Data Profile v1

当前没有第三方 deployed `loomrealm.renderer-data/1` compatibility obligation，因此直接关闭 current v1：

```text
Connection 1
+ User Input 1
+ Render Update 1
=
loomrealm.renderer-data/1
```

不制造 fake v2，也不保留 Draft compatibility alias。

---

## Decision 2：Profile only consumes already-current carrier

`@loomrealm/data` / Profile mechanics 的输入是 Platform 已完成 paired installation 的 current `MessageCarrier<string>` binding。

它不负责：

```text
candidate establishment
authentication / ticket
paired readiness
commit-time Main authority revalidation
current slot cutover
WebSocket / MessagePort creation
```

这些继续由 Data Connection Core + Platform DataConnectionBroker realization拥有。

因此 package API使用 `create*DataPeer` / bind current carrier semantics，而不提供网络意义上的 `connect(url)`。

---

## Decision 3：one reader / one dispatcher

每条 current carrier只有一个 inbound application stream。

冻结：

```text
exactly one carrier.messages() reader
→ common preflight
→ one dispatcher
→ input.* / render.* child handlers
```

Reject：InputManager 与 RenderManager各自读取 carrier。

理由：竞争 reader会使消息归属依赖 runtime scheduling，破坏 deterministic protocol routing。

---

## Decision 4：one serialized writer

Input 与 Render共享同一物理 ordered carrier，因此冻结：

```text
one connection-wide serialized writer
at most one carrier.send pending
```

所有 child outbound emission进入该 writer。

这只固定 physical application-unit order，不创建：

```text
shared revision
shared transaction
Input↔Render ACK
cross-child atomic commit
```

Child sender自己拥有 coalescing/barrier policy；Profile writer只保持已经 materialized 的 emission order。

---

## Decision 5：common preflight 只提升真实共有事实

User Input v1 与 Render Update v1 都已经冻结：

```text
max message = 1 MiB UTF-8
max JSON container depth = 64
Wire JSON representation semantics
```

因此 Profile可以统一拥有这三个 preflight fact。

其他 child-specific identifier/count/payload/structural limits仍由 child validator拥有，避免 Profile复制第二套 limits。

---

## Decision 6：exact role direction

冻结：

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

known type wrong direction与 unknown type都 Data-fatal；不得作为扩展忽略。

本地 consumer尝试发送 role-illegal message属于 trusted integration programming/local-fatal，不得写到 carrier。

---

## Decision 7：child semantic result 显式回流 terminal boundary

Profile/static validator负责 representation/schema/limits/direction。

需要 role state 才能判断的 child semantics继续由 role manager/store负责，例如：

```text
User Input stale Activation / Interest applicability
Render Registry/baseline/revision/one-shot continuity
```

Child handler可显式返回：

```text
accepted
protocol-fatal
```

其中 `accepted` 包括 child contract 明确规定的 well-formed stale/inapplicable drop。

`protocol-fatal` 使 Profile peer terminal并 retire current Data；不能继续后续 stream。

普通 business/presentation callback error不自动等于 peer protocol-invalid。

---

## Decision 8：terminal first-wins / no retry replay migration

冻结 connection-local Profile mechanics：

```text
terminal first-wins
pending writer settlement exactly once
no send/read after terminal
local protocol/local fatal → best-effort carrier.close()
no Profile-created retry
no Profile-created replay
no old unsent queue migration to fresh carrier
```

fresh carrier上的 baseline必须从 current desired child state重新 materialize，而不是 replay old bytes。

---

## Decision 9：`@loomrealm/data` 是 capability package，不是 author SDK

`@loomrealm/data` ownership：

```text
Profile identity/composition
frozen wire-model types
static child codecs/validators
single reader/dispatcher
single serialized writer
role-specific typed Data peers
Data-local terminal mechanics
```

它不拥有：

```text
InputListener
InputManager business/authority state
RenderDomain
RenderManager business Domain state
Main DataAuthority/InputTarget
DataConnectionBroker
WebSocket/MessagePort
```

Subsystem author继续只依赖 `@loomrealm/subsystem`；Renderer role通过自己的 integration layer消费 Data peer。

---

## Decision 10：首批 package root-only

首次发布：

```text
@loomrealm/data
```

不发布：

```text
/input
/render
/profile
/connection
/testing
/internal
/node
/browser
```

source 可以内部按模块拆分，但 protocol boundary != npm subpath boundary。

Runtime dependencies固定：

```text
@loomrealm/foundation
@loomrealm/wire
```

不依赖 Main/Subsystem/Renderer concrete role package或 Platform API。

---

## Decision 11：M8 / M10 / M11 ownership split

M8实现：

```text
@loomrealm/data package mechanics
Data Profile conformance fixtures
Subsystem DataPlane binding slice
Renderer Data binding slice
```

M10实现：

```text
Subsystem InputManager / InputListener
Renderer Input Producer/authority composition
full User Input role qualification
```

M11实现：

```text
Subsystem RenderManager / RenderDomain
Renderer Render Store/presentation qualification
full Render role qualification
```

M8不得通过 fake InputManager/RenderManager宣称 child role semantics complete；但 M10/M11也不得重新实现 shared reader/writer/static codec。

---

## Consequences

优点：

```text
M8可以直接实现，无需再发明 carrier mechanics
Input/Render不竞争 reader/write ordering
Hostra/PWA共享同一 application profile mechanics
Data fatal与 Runtime/Frame authority继续解耦
fresh-carrier recovery不依赖 replay
package boundary与现有 architecture 一致
```

代价：

```text
@loomrealm/data 需要同时承载两个 child protocol 的静态 wire model
role manager必须显式反馈 stateful protocol-fatal
single writer需要 bounded queue/terminal settlement实现
```

这些代价本来就存在于 shared Data carrier；集中在 capability package 比让 Renderer/Subsystem分别复制更可控。

---

## Rejected Alternatives

### Input/Render 各自直接读取 carrier

Rejected：竞争唯一 stream，消息归属不确定。

### Input/Render 各自直接并发 `carrier.send`

Rejected：shared ordering由 event-loop timing决定，难以稳定 barrier semantics。

### 新建 `@loomrealm/input` + `@loomrealm/render` 两个 npm package

Phase 1 rejected：它们仍需一个共同 reader/writer/profile orchestrator，会把当前一条稳定 capability边界拆成三四个 package。若未来出现独立 consumer，再按 package placement rule评估。

### Data package owns DataConnectionBroker

Rejected：把 Platform physical provisioning与 application protocol mechanics混合，违反 Frozen Connection v1 candidate/current boundary。

### Add Data handshake / ready / ACK

Rejected：Connection v1已冻结 zero-message；paired readiness是 Platform installation fact。

### Add shared Data revision

Rejected：Input 与 Render authority/state独立，没有跨 child atomicity需求。

---

## Compatibility Boundary

冻结后，下列 observable 改变需要新 Data Profile version或明确 compatibility review：

```text
component version binding
application unit model
common preflight
role direction
single-reader dispatcher
single-writer serialization
routing/fail-closed behavior
terminal semantics
fresh-carrier composition
no retry/replay/migration rule
```

package internal file layout、queue data structure、diagnostic wording可以演进，只要 conformance trace不变。
