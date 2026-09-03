# M7 / 01 — `@loomrealm/renderer-control` Package

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：01  
> 最近复核：2026-09-03  
> 目标：把 Main ⇄ Renderer Control Protocol v1 落成 transport-independent、bounded、可测试的具体协议 mechanics；不拥有 Main authority、Renderer role state 或 Platform transport establishment。  
> 正式协议：[Main ⇄ Renderer Control Protocol v1](doc/15-contracts/main-renderer-control-v1.md)  
> 分包边界：[独立分包与发布架构](doc/30-implementation/package-architecture.md)

核心原则：

> **本包只拥有 connection-local protocol mechanics。Main 创建 authority；Renderer role保存已接受 authority；本包不复制两侧业务状态机，也不抽取 generic RPC framework。**

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

v1 只有：

```text
renderer.hello   Renderer → Main Request
renderer.state   Main → Renderer Notification
```

后续：

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
current Renderer participant / replacement decision
authority Snapshot source
future DataAuthority policy
```

### `@loomrealm/renderer-control` owns

```text
JSON-RPC representation/profile mechanics
hello-first / hello-one-shot state
version negotiation
closed-schema validation
whole current-Snapshot structural/relational validation
connection-local session/revision monotonicity
hello Result before renderer.state ordering
bounded latest-state publication
terminal classification
transport-independent typed outcomes
```

### Renderer role owns

```text
which peer is current
current accepted Snapshot or no usable authority
future Data/Input/Render role composition
```

本包 MUST NOT拥有 Main Registry/Stack/Frame、AuthorityRevision allocation、historical authority log、Renderer Store、Data Connection、Input/Render state、WebSocket/MessagePort establishment 或 Platform lifecycle。

---

## 3. Dependency Boundary

M7 runtime dependencies：

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

不要抽取：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
MethodRegistry
RequestManager
```

---

## 4. Public Surface

只发布 root：

```text
@loomrealm/renderer-control
```

Main-side surface只需要：

```text
established MessageCarrier<string>
Main-owned hello acceptance/auth decision
immutable committed Snapshot submission
retire/close capability for replacement/terminal
terminal outcome
```

Renderer-side surface只需要：

```text
established MessageCarrier<string>
rendererControlToken
initial accepted Snapshot
later accepted Snapshot sequence/outcome
terminal outcome
```

不发布 transport URL、WebSocket/MessagePort、Main internals、Renderer Store、extension bag 或 arbitrary method registration。

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

Wire object closed schema；无 metadata/extensions/physical material。

---

## 6. Current-State Validation Only

Renderer peer暴露 Snapshot 前验证：

```text
sessionId / revision representation
Runtime key uniqueness
Frame key uniqueness / Runtime reference
active/top/activation relation
InputTarget current relation
DataAuthority key/generation/profile representation
wire message/depth/member limits
```

Invalid Snapshot → terminal/fail closed；不得 partial repair。

以下 lifetime facts 不由 receiver 保存历史 Set：

```text
revoked activationId never regranted
frameId never illegally reused
Data generation never reused
```

这些由 Main tests / cross-package traces证明。

---

## 7. Revision State Is Connection-local

Renderer peer只维护：

```text
hello pending/current/terminal
accepted sessionId
last accepted revision
```

同 Session：

```text
new revision > last → accept
gap                 → valid
new revision <= last → terminal
```

Main revision 初值/推进属于 Main；Renderer role不再第二次实现 revision protocol state machine。

---

## 8. Hello Stays Concrete

v1 只有一个 Renderer-originated Request，因此直接：

```text
send renderer.hello with id = 1
wait Response id = 1
```

不创建 RequestIdAllocator、PendingRequestMap、GenericDispatcher、RpcScheduler、CorrelationManager。

### Renderer-side hello handoff

Renderer peer必须把 initial hello Snapshot 与 later state暴露顺序固定为：

```text
validate hello Result Snapshot R
→ resolve/return initial Snapshot R to Renderer role
→ Renderer role atomically installs peer + R
→ only then role begins consuming later renderer.state
```

不得在 initial Snapshot 尚未被 role安装前通过 callback/event抢先暴露 R+1。

实现可让 later state使用 lazy `AsyncIterable` / explicit start，使 carrier 自身暂存消息；无需增加第二个 Store。

---

## 9. Main-side Hello Gate

Main peer不得自己决定 token/currentness；它调用 Main 提供的 **单次 hello acceptance decision**。

该 decision概念上返回：

```text
accepted + protocolVersion + immutable Snapshot R
or rejected semantic outcome
```

Main 负责在其 authority serialization 中原子完成：认证/consume token、capture R、install new current、retire old current。

Main peer随后：

```text
send hello Result(R)
→ only after local send acceptance may drain renderer.state
```

在 hello Result send pending 时，Main 后续提交的 latest Snapshot可进入 `pendingLatest`，但不能先发送。

如果 hello Result send失败，candidate peer terminal；不得回滚旧 peer为 current。

---

## 10. Active Connection Retirement

Main 决定某 peer 被 replacement 后，Main-side peer必须支持明确 retirement：

```text
stop accepting new publication
clear/settle pending latest
request carrier.close()
terminal first-wins
```

“只停止 publication、不关闭旧 carrier”不是 conformant replacement。

旧 peer retirement不需要 generic ConnectionManager；一个 peer-local `retire()/close()` 语义即可。

---

## 11. Bounded Publication

最小状态：

```text
inFlight: 0..1
pendingLatest: 0..1 replaceable Snapshot
```

```text
R in-flight
R+1 pending
R+2 arrives
→ pending = R+2
```

不创建 Publisher、StateReplicator、PublicationQueue framework、BackpressureManager。

M7 package closure只证明 queue structure bounded。真实 Hostra/PWA stalled write 的 finite close policy属于后续 concrete transport qualification。

---

## 12. Representation Failure

Renderer Control 的 1 MiB / JSON depth/member 等限制是 connection/wire safety，不是 Main/Frame business limit。

Main peer outbound Snapshot必须 preflight。

若 Snapshot不可表示：

```text
no truncation / dropping / normalization
no attempt to modify Main business authority
Renderer Control attempt/connection terminalizes
```

本包不定义 Runtime count、Frame stack depth、DataAuthority count 业务上限。

---

## 13. DataAuthority Boundary

协议仍表示：

```text
{subsystemKey, generation, dataProfile}
```

本包验证 representation/current-Snapshot relations；M7 Main vertical固定 `dataAuthorities=[]`。

非空 DataAuthority fixture只证明 wire/Renderer representation。真实 Main allocation/generation/profile policy在 M8关闭。

---

## 14. Source Shape

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

若代码足够小可继续合并文件；不要为目录对称增加类。

---

## 15. Package-local Qualification

至少覆盖：

```text
hello first / one-shot / id=1
version/auth mapping
hello Result before later state
Renderer initial-Snapshot handoff before later state exposure
connection-local revision monotonicity
closed schema / current Snapshot relations
replacement peer retirement closes carrier
retire while write pending settles bounded state
0..1 in-flight + 0..1 pendingLatest
unrepresentable outbound Snapshot terminalizes connection
oversize/depth/member validation
terminal first-wins
carrier close during hello/publication
no retry/replay/history
non-empty DataAuthority fixture validation
```

---

## 16. Step Closure

M7/01 complete when：

```text
exact v1 types exist
concrete asymmetric Main/Renderer peers exist
one-shot hello has no generic request machinery
hello ordering/handoff is race-free
peer retirement actively closes old connection
current-state validation is bounded
publication is concrete 1+1 bounded state
representation failure only kills Renderer Control
package has no generic RPC/public transport abstraction
```