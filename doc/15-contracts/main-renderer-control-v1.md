# Main ⇄ Renderer Control Protocol v1

> 层级：正式契约  
> 状态：**Active / Normative / Frozen**  
> 协议版本：1  
> 协议标识：`loomrealm.renderer-control`  
> 稳定程度：Frozen current-v1  
> 主要定义：Main 向当前 Renderer participant 复制 committed Runtime / Frame / Activation / InputTarget / DataAuthority 的只读控制状态  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[通信系统](../10-architecture/communication-system.md)、[Frame / Call v1](./frame-call-protocol-v1.md)  
> 冻结决策：[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 后续依赖：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)  
> 最近复核：2026-09-03

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> **Main 是 Runtime / Frame / Activation / InputTarget / DataAuthority / Renderer currentness / AuthorityRevision 的唯一公共 authority。Renderer Control v1 只复制 Main 已提交的逻辑 authority；Control failure、transport failure或 representation limit不得反向改变 Frozen Frame / Runtime business authority。**

---

## 1. Scope

```text
LoomRealm Main
      ⇅
Renderer Control Connection
      ⇅
current Renderer participant
```

负责：

```text
Renderer Control hello/authentication
version negotiation
one-current-Renderer participant semantics
Runtime state projection
live Frame Stack / Activation projection
current InputTarget publication
logical DataAuthority publication
Session-local AuthorityRevision
full Authority Snapshot
reload/replacement recovery
bounded latest-state publication
validation / limits / fail-closed
```

不负责：

```text
Subsystem Runtime bootstrap/shutdown
Frame RPC / failure unwind execution
Renderer⇄Subsystem physical Data establishment
Data endpoint / bearer credential / MessagePort
User Input payload / Frame Interest Registry
Render Update / Render State
Content API
business state
DOM / Canvas / WebGL state
```

Renderer MUST NOT通过本协议改变 Main authority。

---

## 2. Authority Model

Main 唯一拥有：

```text
Session identity
current Renderer participant
Runtime observed state
live Frame Stack
Frame lifecycle
current Activation
InputTarget
DataAuthority generation/profile
AuthorityRevision
rendererControlToken issue/bind/invalidate/consume decision
```

Renderer 是 read-only committed mirror，不得：

```text
创建 frameId / activationId
恢复 revoked Activation
改变 Stack / Frame lifecycle
推导 failure unwind
根据 Data Connection/Render focus/Input Interest生成 InputTarget
```

---

## 3. Frame / Call Causal Barrier

必须服从 Frozen Frame / Call v1：

```text
frame.activate ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget

frame.resume ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget
```

Main MUST NOT在 ACK 前发布新 ordinary InputTarget。

`InputTarget = null` 合法。

一个已经发布的：

```text
InputTarget(frameId, activationId)
```

一旦撤销、移除或替换，同一 `frameId + activationId` MUST NOT再次成为 current InputTarget。新的 ordinary-input authority 必须使用 fresh `activationId`。

---

## 4. Connection Attempt / Current Renderer

一个 Main Session 同时最多：

```text
one current Renderer participant
+
one candidate/pending Renderer Control attempt
```

每个 attempt 使用 fresh：

```text
rendererControlToken
```

要求：

```text
opaque
high entropy
Session-bound
1..4096 UTF-8 bytes
not logged / not placed in URL
invalidated when its attempt terminates
consumed exactly once on successful hello acceptance
```

Platform physical token delivery / carrier establishment由 M7 Frozen `RendererControlBinding` realization负责；该 Platform capability不拥有 authentication/currentness。

### 4.1 Active Replacement

B 成功 hello acceptance 后：

```text
B immediately becomes the only current Renderer participant
A immediately ceases to be current
Main submits no new publication to A
A pending unsent latest Snapshot is discarded/settled
Main requests A Control carrier close/retirement
```

停止 publication 但长期保持 A carrier open 不足以完成 replacement。

Foundation carrier不保证取消已经开始的 `send()`；因此已开始的 old-peer in-flight message MAY在 replacement 后才 physically arrive。该 late delivery、send completion或 stale terminal **没有 current-authority effect**，不得恢复 A currentness，也不得覆盖/清除 B 的 Renderer role current state。

---

## 5. Application Unit / Transport Mapping

统一 application model：

```text
JSON-RPC 2.0
plain JSON-compatible values
one carrier unit = one UTF-8 JSON text string = one JSON-RPC object
JSON-RPC Batch forbidden
```

Desktop WebSocket：one complete text message。  
PWA MessagePort：`postMessage(string)`。  
Structured Clone / Transferable 只可用于 Platform bootstrap，不扩大 application payload。

---

## 6. `renderer.hello`

第一条 LoomRealm application message MUST 是：

```text
Method: renderer.hello
Type:   JSON-RPC Request
Direction: Renderer → Main
Request id: 1
```

```ts
interface RendererHelloParamsV1 {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}
```

`protocolVersions`：1..16 positive integer entries，no duplicate。当前只选择 `1`。

v1 只有这一条 Renderer-originated Request；固定 `id = 1` 已满足 positive safe integer + connection-lifetime never reused，不需要 request-id allocator/pending-request framework。

认证/版本/状态失败后 Main 返回相应 Error（能安全发送时）并关闭 Connection；恢复只允许 fresh attempt/token。

---

## 7. Session Identity

Main 为每个 Session 生成：

```text
sessionId
opaque
1..128 UTF-8 bytes
Session lifetime unique
never reused
```

`sessionId` 不是 credential。新 `sessionId` 表示新的 authority universe；Renderer MUST丢弃旧 Session 的 Runtime/Frame/Activation/InputTarget/DataAuthority mirror。

---

## 8. AuthorityRevision

```ts
type AuthorityRevision = number;
```

要求：

```text
1..2^53-1 positive safe integer
Session-local
initial Renderer-visible authority revision = 1
strictly increases exactly when Renderer-visible committed authority payload changes
never reused / never wraps
```

即使当前没有 Renderer Connection，Renderer-visible committed change 仍推进 revision。

Revision 不是 event sequence、packet number、replay cursor 或 connection generation。

Change detection MUST比较 authority payload（`runtimes/stack/inputTarget/dataAuthorities` 等）而不包含 `revision` 字段本身。

Main MAY coalesce未发送的中间 revisions；Renderer MUST接受 revision jump。

---

## 9. Full Snapshot

v1 无 delta / patch / replay。

```ts
interface RendererAuthoritySnapshotV1 {
  readonly sessionId: string;
  readonly revision: number;
  readonly runtimes: readonly RendererRuntimeStateV1[];
  readonly stack: readonly RendererFrameStateV1[];
  readonly inputTarget: RendererInputTargetV1 | null;
  readonly dataAuthorities: readonly RendererDataAuthorityV1[];
}
```

`renderer.hello` Result 与 `renderer.state` 都携完整 self-contained Snapshot。

Renderer whole validation成功后 MUST原子替换当前 Control authority；不得逐字段暴露半更新状态。

---

## 10. Runtime Projection

```ts
type RendererRuntimeLifecycleV1 =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

interface RendererRuntimeStateV1 {
  readonly subsystemKey: string;
  readonly state: RendererRuntimeLifecycleV1;
}
```

M7 Main pure mapping固定：

```text
no RuntimeRecord                         → declared
failure != null                          → failed
physicallyTerminated && expected stop    → stopped
starting                                 → starting
connected                                → connected
identified / initializing                → identified
ready                                    → ready
stopping                                 → stopping
```

failure precedence高于 stopped。

Main Session terminal latch后 Renderer Control立即进入 retirement，因此 normal Session cleanup期间产生的 stopping/stopped transition不要求继续 publication。`stopped` 仍是合法 wire state及 future nonterminal lifecycle projection。

Renderer不得从 Runtime state自行修改 Stack。

---

## 11. Frame Stack Projection

```ts
type RendererFrameLifecycleV1 =
  | "starting"
  | "active"
  | "suspended"
  | "closing";

interface RendererFrameStateV1 {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly lifecycle: RendererFrameLifecycleV1;
  readonly activationId?: string;
}
```

`stack` bottom → top，只包含 live Frames；closed 不进入 Snapshot。

约束：

```text
frameId unique
all frame subsystemKey refer to runtimes
at most one active Frame
active Frame, if present, is Stack top
active Frame requires activationId
non-active Frame MUST NOT contain activationId
```

---

## 12. InputTarget

```ts
interface RendererInputTargetV1 {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}
```

Snapshot：

```text
inputTarget = null
OR exactly references existing active Stack top + same subsystemKey + same activationId
```

`active Frame + inputTarget=null` 合法；Renderer不得自行构造 target。

---

## 13. Logical DataAuthority

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

Phase 1 profile：`loomrealm.renderer-data/1`。

`generation`：positive safe integer，Subsystem-scoped，authority replacement时严格增加且 never reused。同一 Snapshot 每个 subsystemKey 最多一个 DataAuthority。

DataAuthority只表示 logical authorization/profile，不表示：

```text
Data carrier 已建立
endpoint/ticket/Port
Render exists
Frame active
InputTarget/Interest
```

Snapshot MUST NOT包含 WebSocket URL、MessagePort、ticket/token、nonce、transport locator或 Platform provisioning handle。

M7 Main implementation固定 `dataAuthorities = []`；非空 DataAuthority model仍属于 v1 formal wire，真实 Main policy在 M8实现。

---

## 14. `renderer.hello` Success / Atomic Acceptance

```ts
interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

成功 acceptance MUST相对于 Main Renderer-visible authority mutation serialization构成一个原子点。

在 Main serialized lane 内固定顺序：

```text
require Session live + exact candidate attempt
validate typed token/version
capture current committed Snapshot R
prepare/preflight the exact hello Result(id=1, version=1, R) application text

if preflight fails:
    invalidate candidate attempt/token
    leave old current Renderer unchanged
    candidate fails closed

if preflight succeeds:
    consume token
    install candidate as only current Renderer participant
    detach/retire previous current peer from future publication
    commit accepted R + exact prepared hello text
```

随后在 transaction 外发送**同一 prepared text**。

因此禁止：

```text
capture R
→ allow visible commit R+1 while candidate still non-current
→ later install candidate
```

atomic acceptance之后发生的 `revision > R` MAY进入该 peer 的 bounded `pendingLatest`，但 MUST NOT先于 hello Result发送。

Hello Result send失败：new candidate terminal；old current不复活；恢复 fresh attempt/token。

---

## 15. `renderer.state`

```ts
interface RendererStateParamsV1 {
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

```text
Method: renderer.state
Type: Notification
Direction: Main → Renderer
```

Main MUST只发送 committed authority，不得发布 tentative call/return、predicted RPC success 或 unacknowledged Activation。

已 commit transitional state MAY发布，例如 caller suspended / child starting / InputTarget=null。

---

## 16. Renderer Hello Handoff / Application Rules

Renderer peer必须：

```text
validate hello Result Snapshot R
→ return/resolve initial accepted R
```

Renderer role必须先原子安装：

```text
currentPeer = new peer
currentSnapshot = R
```

然后才开始消费该 peer 的 later `renderer.state` sequence。Later-state delivery surface MUST lazy/explicit-start或等价保证 initial install先发生；不得在安装 R 前 callback 出 R+1。

同 current connection：

```text
new.revision > last accepted → whole validate → accept
revision gap                 → valid
new.revision <= last accepted → Protocol Error / fail closed
```

Connection-local revision/session legality由 Renderer protocol peer维护；Renderer role不得建立第二套 protocol state machine。

Old peer late Snapshot / terminal不得覆盖或清除 new current peer state；role以 peer identity判 currentness。

---

## 17. Bounded Publication

Main-side protocol mechanics SHOULD且 M7 implementation MUST维持：

```text
0..1 in-flight send
+
0..1 replaceable pendingLatest Snapshot
```

若：

```text
R in-flight
R+1 pending
R+2 arrives
```

则 `pendingLatest = R+2`；不保留历史 queue/replay log。

Replacement/retirement commit后 old peer不得启动任何新 send，`pendingLatest`必须丢弃/settle；already-started in-flight send MAY完成或 physically arrive，但无 authority effect。

Concrete Hostra/PWA transport持续无法 drain时必须在各自 finite policy下关闭 connection；M7 core只 qualification structural boundedness，不把 MemoryCarrier当作 physical stalled-write timeout evidence。

---

## 18. Representation Limits Are Not Business Limits

Renderer Control limits是 wire/connection safety，不定义额外 Runtime count、Frame Stack depth或 DataAuthority count业务上限。

合法 Main/Frozen Frame authority不得仅为了适配 Renderer Control而：

```text
拒绝本来合法的 frame.call
rollback committed authority
引入 Renderer-specific Frame error
truncate/drop Snapshot entries
```

Sender MUST对完整实际 outbound JSON text application unit做 exact preflight。

如果 current committed authority不可在 v1 limits内表示：

```text
Main authority unchanged
candidate/current Renderer Control fails closed
no partial Snapshot
fresh hello only after current Snapshot再次 representable
```

Initial hello representability failure发生在 current switch之前，因此不得驱逐现有 healthy current Renderer。

---

## 19. Control Loss / Session Terminal

### Current Control loss

Renderer current peer terminal后：

```text
currentPeer = null
currentSnapshot = null
InputTarget locally unavailable
all DataAuthority locally invalid
ordinary input stops
future real Data Connections retire/close
```

Main 收到 peer terminal：

```text
if peer === currentRendererPeer:
    currentRendererPeer = null
else:
    stale terminal ignored for currentness
```

transport terminal本身不改变 Runtime/Frame authority，也不推进 AuthorityRevision。

### Main Session terminal

Main 一旦 latch root outcome / external shutdown / fatal terminal：

```text
reject/stop issuing new Renderer attempts/tokens
abort pending RendererControlBinding.acquire
retire/close candidate peer
retire/close current peer
stop/discard future Renderer publication
```

Renderer Control cleanup不是 Runtime shutdown coordinator；Main Session result不等待 physical Renderer close。

v1 不增加 final `session.ended` notification。恢复不存在；新 Session必须 fresh `sessionId`。

---

## 20. Runtime Failure / Render / Input Boundaries

Runtime failure unwind authority只在 Main；Renderer只观察 committed结果，不计算 failed keys/root/suffix/fixed-point。

Snapshot MUST NOT包含 Render Registry/Domain State/Render revision/DOM/Canvas/WebGL。

Ordinary input sender-side gate未来仍组合：

```text
Main InputTarget
× matching current Data Connection
× mirrored active Frame/Activation
× Subsystem Interest[F]
× Renderer Producer availability
```

Interest/Producer只能缩小，不能创建 Main InputTarget。Control/Data connection之间无 total order，不增加 cross-plane ACK/revision join/barrier。

---

## 21. JSON / Limits / Errors

Plain JSON values only；禁止 undefined、NaN/Infinity、BigInt、Function/Symbol、ArrayBuffer/Blob/MessagePort、Host object。Wire object closed schema，unknown field MUST rejected。

Limits：

```text
max application message          1 MiB actual UTF-8 JSON text
max JSON nesting depth           64
max array/object members         16,384
sessionId                        1..128 UTF-8 bytes
subsystemKey                     1..256 UTF-8 bytes
frameId                          1..128 UTF-8 bytes
activationId                     1..128 UTF-8 bytes
rendererControlToken             1..4096 UTF-8 bytes
dataProfile                      1..256 ASCII bytes
AuthorityRevision               1..2^53-1
Data generation                  1..2^53-1
protocolVersions entries         1..16
```

标准 JSON-RPC error：`-32700 / -32600 / -32601 / -32602`。

Semantic envelope：

```text
error.code = -32000
error.data.code =
    RENDERER_AUTHENTICATION_FAILED
    RENDERER_CONTROL_PROTOCOL_UNSUPPORTED
    PROTOCOL_STATE_ERROR
```

Authentication error不得泄露 token unknown/expired/wrong/consumed 细节。

Invalid JSON/schema/session/revision/stack/Activation/InputTarget/DataAuthority/representation → fail closed；不得 partial repair。

---

## 22. Security

- rendererControlToken 是 Session-bound secret；attempt terminal即失效，成功 hello exactly-once consume；
- token不得日志化/放 URL；
- Snapshot不携 Data credential/endpoint/executable path；
- Platform Binding只物理交付 token/carrier，不解释 credential authority；
- current Renderer participant decision始终由 Main hello acceptance拥有；
- stale/old Renderer本地缓存不构成继续授权依据。

---

## 23. Minimum Conformance

至少覆盖：

```text
hello-first / id=1 / auth / version
initial revision=1 / gap accepted / regression rejected
exact hello preflight before current switch
hello concurrent visible mutation no revision loss
hello Result before later state
Renderer initial Snapshot install before later-state consumption
active replacement / old carrier close
old in-flight completion has no current-authority effect
old terminal cannot clear new current
current terminal clears current only
Session terminal aborts attempts + retires current
atomic full Snapshot
Runtime lifecycle pure mapping
activate/resume ACK-before-target
revoked Activation no regrant
runtime failure unwind Main-only
M7 dataAuthorities=[] + non-empty protocol fixture
bounded 1 in-flight + 1 pendingLatest
representation failure isolated from Frame/Runtime authority
oversize/depth/member rejection
no retry/replay/history
```

Physical Hostra WebSocket / PWA MessagePort stalled-write policy不属于 M7 core conformance。

---

## 24. Explicit Non-goals

v1 不定义：

```text
delta / JSON Patch
revision ACK/replay
multiple current Renderer participants
Renderer leader election
Frame RPC proxy/cancel
Runtime recovery commands
Data endpoint discovery/credential wire
Render State
User Input payload/Interest wire
Content Grant
telemetry
heartbeat
generic RPC framework
```

---

## 25. Wire Surface Summary

| Method | 类型 | 方向 | 职责 |
|---|---|---|---|
| `renderer.hello` | Request `id=1` | Renderer → Main | one-shot auth、version、initial full Snapshot |
| `renderer.state` | Notification | Main → Renderer | latest complete committed Authority Snapshot |

---

## 26. Freeze / Reopen Rule

本协议 current-v1 已在 ADR 0027 完成 preimplementation closure。

只有 implementation evidence 证明 correctness/security contradiction、与其他 Frozen contract无法同时满足、或 Frozen Platform port无法表达真实必要 capability 时才可 reopen。不得因 generic abstraction、代码复用、未来 M8+、目录对称或 concrete transport偏好重新设计 v1。

---

## 27. Final Invariants

1. Main 是唯一 Renderer Control authority/currentness owner。  
2. Full Snapshot自包含、whole-validate、atomic replace。  
3. Revision初值1，只随 committed visible payload变化，允许 publication gap。  
4. Hello exact representability preflight先于 current switch。  
5. Hello capture/preflight/current install与 Main visible mutation共享 serialization。  
6. Replacement主动撤销 old current；old peer不再启动新 send；already-in-flight late delivery无 authority effect。  
7. Renderer先安装 initial Snapshot再消费 later state。  
8. ACK-before-InputTarget publication；revoked Activation never regrant。  
9. Control loss与 Session terminal撤销 Renderer本地 authority proof。  
10. Representation failure只终止 Renderer Control，不改变 Frozen Frame / Runtime business semantics。  
11. DataAuthority只携 logical `S/G/profile`；M7 Main policy保持空，M8再实现。  
12. Publication结构为 0..1 in-flight + 0..1 pendingLatest，无 replay/history queue。  
13. v1不引入 generic RPC、transport-specific application model或 universal Platform service。