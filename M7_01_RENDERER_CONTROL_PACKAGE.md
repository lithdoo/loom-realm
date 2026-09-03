# M7 / 01 — `@loomrealm/renderer-control` Package

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：01  
> 最近复核：2026-09-03  
> 目标：把 Main ⇄ Renderer Control Protocol v1 落成 transport-independent、bounded、可测试的协议 mechanics；不拥有 Main authority、Renderer role state 或 Platform transport establishment。  
> 正式协议：[Main ⇄ Renderer Control Protocol v1](doc/15-contracts/main-renderer-control-v1.md)  
> 分包边界：[独立分包与发布架构](doc/30-implementation/package-architecture.md)

规范优先级：

```text
formal protocol contract
→ package/publish boundary
→ M7 root implementation documents
→ source layout
```

核心原则：

> **本包只拥有“如何正确说 Renderer Control v1”的 connection-local mechanics。Main 创建 authority；Renderer role 保存已接受 authority；本包不复制任何一方的业务状态机。**

---

## 1. Position

```text
Main committed RendererAuthoritySnapshotV1
        ↓
renderer-control Main peer
        ↕ MessageCarrier<string>
renderer-control Renderer peer
        ↓
accepted immutable RendererAuthoritySnapshotV1
        ↓
@loomrealm/renderer
```

v1 application surface exactly：

```text
renderer.hello   Renderer → Main Request
renderer.state   Main → Renderer Notification
```

后续顺序：

```text
M7_02_MAIN_AUTHORITY_PROJECTION.md
→ M7_03_RENDERER_CONTROL_STORE.md
→ M7_04_VERTICAL_INTEGRATION.md
→ M7_05_QUALIFICATION_CLOSURE.md
```

---

## 2. Ownership

### Main owns

```text
sessionId
Runtime / Frame / Activation / InputTarget authority
AuthorityRevision allocation
rendererControlToken authority
authority Snapshot source
future DataAuthority policy
current Renderer connection replacement decision
```

### `@loomrealm/renderer-control` owns

```text
JSON-RPC representation/profile mechanics
hello-first / hello-one-shot connection state
version negotiation
closed-schema validation
whole Snapshot structural/relational validation
connection-local session/revision monotonicity
hello Result before renderer.state ordering
bounded latest-state publication
terminal classification
transport-independent typed outcomes
```

### Renderer role owns

```text
which Renderer peer is current
current accepted Snapshot or no usable authority
future Data/Input/Render role composition
```

本包 MUST NOT拥有：

```text
Main Registry/Stack/Frame objects
AuthorityRevision allocation
historical authority log
Renderer Control Store
Data Connection objects
Input Interest / Render state
WebSocket / MessagePort establishment
Platform bootstrap / BrowserWindow / Worker lifecycle
```

---

## 3. Dependency Boundary

M7 runtime dependencies exactly target：

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed

@loomrealm/wire
    JSON text / JSON-RPC representation primitives
```

MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/renderer
@loomrealm/runtime-control
@loomrealm/data
@loomrealm/subsystem
@loomrealm/game-launcher-*
WebSocket / MessagePort / Worker
node:*
DOM APIs
```

Do not extract similarity with Runtime Control into：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
MethodRegistry
RequestManager
```

两个具体协议都实现以后若真的出现稳定 primitive，再单独评估。

---

## 4. Public / Publish Surface

只发布：

```text
@loomrealm/renderer-control
```

不发布 `/main`、`/renderer`、`/schema`、`/testing`、`/internal`、`/node`、`/browser` 等 subpath。

Public surface 只需要两类真实消费者：

```text
Main side
    established MessageCarrier<string>
    Main-owned hello authentication decision
    immutable committed Snapshot submission
    terminal outcome

Renderer side
    established MessageCarrier<string>
    rendererControlToken
    accepted immutable Snapshot stream/outcome
    terminal outcome
```

精确函数名在 Main + Renderer real consumer qualification 时冻结。

---

## 5. Wire Model

Field-level schema 只以正式协议为事实源。本包精确表示：

```text
RendererHelloParamsV1
RendererHelloResultV1
RendererStateParamsV1
RendererAuthoritySnapshotV1
RendererRuntimeStateV1
RendererFrameStateV1
RendererInputTargetV1
RendererDataAuthorityV1
```

不得加入：

```text
metadata
extensions
transport endpoint
credential
physical handle
```

---

## 6. Snapshot Validation: Current State Only

Renderer peer 在暴露 Snapshot 前验证完整当前状态：

```text
sessionId / revision representation
Runtime key uniqueness
Frame key uniqueness
Frame → Runtime references
at most one active Frame
active Frame = Stack top
active Frame has activationId
non-active Frame has no activationId
InputTarget exactly matches current active Frame/Activation or null
DataAuthority key uniqueness / generation / profile representation
topology/profile limits
```

Invalid Snapshot MUST fail closed；不得 drop/repair/normalize entries 后继续。

### Historical invariants are not receiver state

以下事实由 Main sender authority证明，不要求 Renderer peer 保存 Session 历史集合：

```text
revoked activationId never regranted
frameId never illegally reused
DataAuthority generation never reused
```

这些 invariant 在 Main tests / cross-package traces 中验证。Renderer peer MUST NOT为了验证 lifetime history 建立无界 `Set` 或 authority log。

---

## 7. Session / Revision Mechanics

Renderer peer 只维护**当前 connection 所需**的最小协议状态：

```text
hello pending/current/terminal
accepted sessionId after hello
last accepted revision for that current connection/session
```

同 Session：

```text
new revision > last accepted → accept after whole Snapshot validation
revision gap                 → valid
new revision <= last accepted → protocol terminal
```

新 connection 通过 fresh hello 获得 current full Snapshot；不 replay 历史。

Renderer role **不再第二次实现 revision protocol state machine**。它只接收 peer 已接受的 Snapshot，并决定哪个 peer 是 current。

---

## 8. Hello Request Mechanics Stay Concrete

v1 只有一个 Renderer-originated Request：`renderer.hello`。

因此 Renderer peer SHOULD保持最简单实现：

```text
send hello once with Request ID = 1
wait for Response ID = 1
on success enter current state
then receive renderer.state notifications
```

不要为了一个 one-shot Request 创建：

```text
RequestIdAllocator
PendingRequestMap
GenericDispatcher
RpcScheduler
CorrelationManager
```

`id = 1` 已满足 positive safe integer + connection-lifetime never reused。

---

## 9. Main-side Publication

Main peer只接收 Main 已提交的完整 Snapshot。

最小 bounded publication state：

```text
inFlight: 0..1
pendingLatest: 0..1 replaceable Snapshot
```

行为：

```text
R in-flight
R+1 pending
R+2 arrives
→ replace pending R+1 with R+2
```

不要创建 generic：

```text
Publisher
StateReplicator
PublicationQueue abstraction
BackpressureManager
```

一个具体 `inFlight + pendingLatest + pump()` 足够。

成功 hello Result(R) 必须先于该 connection 的任何 `renderer.state`。

---

## 10. DataAuthority Boundary

协议 v1 保留：

```text
{subsystemKey, generation, dataProfile}
```

本包负责其 schema/current-Snapshot relation validation；不负责 Main 的真实 allocation/policy，也不建立 Data Connection。

M7 package tests MAY使用非空 DataAuthority fixture 验证协议模型。M7 Main vertical 默认 `dataAuthorities = []`；真实 Main DataAuthority policy 在 M8 随真实 Data consumer 关闭。

---

## 11. Transport Boundary

本包只消费 established `MessageCarrier<string>`：

```text
one carrier unit
= one UTF-8 JSON text
= one JSON-RPC object
```

WebSocket / MessagePort mapping、token delivery、connection establishment、BrowserWindow/Worker lifecycle 均不属于本包。

M7 qualification 先使用 deterministic MemoryCarrier。

---

## 12. Source Shape

保持小而具体：

```text
packages/renderer-control/
├─ src/
│  ├─ index.ts
│  ├─ model.ts
│  ├─ validation.ts
│  ├─ main-peer.ts
│  └─ renderer-peer.ts
└─ test/
```

这是 working layout，不是 npm subpath contract。

禁止仅为未来复杂度增加 Manager / Registry / EventBus / generic RPC core。

---

## 13. Package-local Qualification

至少覆盖：

```text
hello must be first
one-shot hello / auth mapping / version selection
hello id = 1 correlation
hello Result before renderer.state
closed schema + whole Snapshot relation validation
current-connection revision monotonicity
gap accepted / duplicate-regression rejected
non-empty DataAuthority fixture validation
bounded inFlight + pendingLatest
slow writer does not grow queue
oversize/depth/topology limits
terminal first-wins
carrier close during hello/publication
no retry/replay/history
```

不在 package receiver 侧验证需要 Session 历史集合的 lifetime invariants。

---

## 14. Step Closure

M7/01 complete when：

```text
exact v1 types exist
Main peer exists
Renderer peer exists
current-state Snapshot validation exists
one-shot hello is concrete/minimal
bounded latest publication is concrete/minimal
connection-local revision/session semantics pass
package has no generic RPC/public transport abstraction
```

M7/01 只关闭协议 mechanics，不代表整个 M7 complete。
