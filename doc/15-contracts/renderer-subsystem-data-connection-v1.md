# Renderer ⇄ Subsystem Data Connection Contract v1

> 层级：正式契约  
> 状态：Active / Normative / Frozen  
> Contract 版本：1  
> Contract 标识：`loomrealm.renderer-subsystem-connection / 1`  
> 稳定程度：Frozen  
> 主要定义：Renderer 与单个 Subsystem Runtime 之间 Data Connection 的 authority identity、candidate/install/current/retired 边界、唯一性、替换、重连、退役与 Platform Broker responsibility  
> 上游 authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)  
> 组合 Profile：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)  
> Child protocols：[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)  
> Conformance：[Data Connection v1 Conformance Profile](./renderer-subsystem-data-connection-conformance-v1.md)  
> 决策：[ADR 0024](../decisions/0024-renderer-subsystem-data-connection-v1-semantic-closure.md)  
> 最近复核：2026-08-21

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Connection v1 不定义任何 application message。Main 的 DataAuthority 决定“什么 S/G/P 被授权”；Platform Broker 决定“如何建立并绑定 physical carrier”；Connection v1 只决定“哪一个已经安全准备好的 paired carrier instance 此刻是唯一 current，以及它何时终止为 retired”。**

---

## 1. Position

```text
Main
 │
 │ Renderer Control
 │ DataAuthority {S,G,P}
 ▼
Platform DataConnectionBroker
 │
 │ physical establishment / peer binding
 ▼
Platform candidate pair
 │
 │ paired installation commit
 ▼
Data Connection v1
 │   current → retired
 ▼
Renderer Data Application Profile v1
     ├── User Input v1
     └── Render Update v1
```

必须保持：

```text
DataAuthority
!= physical carrier
!= Platform candidate
!= current Data Connection
!= Data Application Profile
```

Connection v1 不解释 child payload，也不拥有 Runtime/Frame/Input/Render authority。

---

## 2. Zero-Application-Message Contract

Connection v1 自身固定：

```text
zero application messages
zero JSON-RPC methods
zero handshake messages
zero heartbeat messages
zero ACK/NACK messages
```

不存在：

```text
data.hello
data.ready
data.connect
data.accept
data.resume
data.reconnect
data.ping
data.close
```

physical readiness / peer authentication / paired installation由 Platform realization完成，不通过 Data application carrier协商。

任何未来新增上述 application message都需要新的 Connection/Profile version；不得在 v1 中偷偷扩展。

---

## 3. Three Identities / Lifetimes

必须区分三个层次。

### 3.1 DataAuthority epoch

逻辑 authority tuple：

```text
(Session, current Renderer participant, subsystemKey, generation, dataProfile)
```

其中：

```text
S = subsystemKey
G = generation
P = dataProfile
```

`G/P` 描述 Main 当前授权的 Data application epoch，不是某次 socket attempt。

### 3.2 Platform carrier attempt / candidate

Platform MAY 为 current authority创建一个或多个 physical establishment attempts。

未完成 installation commit 的 carrier pair 只是：

```text
Platform candidate
```

candidate 不属于 Connection Core lifecycle。

### 3.3 Data Connection instance

只有 paired installation commit 成功后，candidate 才成为一个：

```text
current Data Connection instance
```

之后最终只会成为：

```text
retired Data Connection instance
```

因此：

```text
Authority lifetime
!= candidate/attempt lifetime
!= Connection instance lifetime
```

---

## 4. Connection Identity

一个 current Connection instance 的完整逻辑 identity：

```text
current Session
+ current Renderer participant
+ target Subsystem Runtime for subsystemKey
+ generation
```

并且 current gate MUST匹配该 generation 的 immutable：

```text
dataProfile
```

概念：

```ts
interface DataConnectionIdentityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
}
```

Session/Renderer participant/target Runtime由 surrounding authority/binding提供，不重复进 application payload。

以下不得代替逻辑 identity：

```text
PID / Worker ID
WebSocket URL / TCP port
MessagePort identity
Frame / Activation
Render Domain
provisioning ticket / nonce
```

---

## 5. DataAuthority

Main 是 Data Connection authority 的唯一公共权威。

Renderer Control 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

exact matching authority：

```text
subsystemKey = S
generation   = G
dataProfile  = P
```

表示 current Renderer participant 被允许为 target Subsystem `S` 持有 generation `G`、Profile `P` 的 Data Connection。

不存在 exact current DataAuthority 时：

```text
candidate MUST NOT install current
existing old current MUST retire
pending old candidate/provisioning material MUST be invalidated
```

`S/G/P` 都不是 credential。

---

## 6. Data Profile Boundary

`dataProfile` 是 complete application-stack identity。

Phase 1：

```text
loomrealm.renderer-data/1
```

固定组合由 Renderer Data Application Profile v1 定义。

```text
dataProfile != websocket
dataProfile != messageport
dataProfile != endpoint/ticket
```

同一 generation 内 `dataProfile` immutable。

```text
P → P2
```

MUST 是 fresh DataAuthority epoch，并使用 fresh generation。

---

## 7. Generation

`generation` 是 Subsystem-scoped Data authority epoch number。

要求：

```text
positive safe integer
1..Number.MAX_SAFE_INTEGER
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused within (Session, subsystemKey)
no wrap
```

不要求连续：

```text
G2 > G1
```

即可；`G1 + 1` 不是要求。

`generation` 不是：

```text
carrier attempt number
reconnect count
message sequence
Render revision
Frame Activation
Runtime Control attempt token
```

### 7.1 Exhaustion

若 current highest generation 已为 `Number.MAX_SAFE_INTEGER`，v1 MUST NOT wrap/reuse。

若仍需要新的 Data authority epoch，必须切换到新的更外层 authority universe（例如 fresh Session）；不得继续在同 `(Session, subsystemKey)` mint generation。

---

## 8. Runtime Instance Replacement

相同 `subsystemKey` 在一个 Session 中如果旧 Subsystem Runtime instance terminal 后创建 fresh Runtime instance：

```text
old DataAuthority MUST be revoked/obsolete
old current/pending Data material MUST be invalidated
future DataAuthority for the fresh Runtime MUST use generation > every prior generation for that subsystemKey in the Session
```

不增加 `runtimeInstanceId` 到 Connection wire identity；generation 已承担 Data authority epoch separation。

旧 carrier/ticket/Port 不得因 `subsystemKey` 相同而重新绑定到 fresh Runtime instance。

---

## 9. Platform Candidate Boundary

Platform establishment 可以有内部状态：

```text
creating
authenticating
binding
waiting-peer
prepared
failed
```

这些都不是 Connection v1 lifecycle state。

candidate 在 installation commit 前：

```text
MUST NOT be exposed as current
MUST NOT send child-protocol application traffic
MUST NOT accept received child traffic as current authority
MUST NOT establish Input/Render baseline
MUST NOT consume cardinality slot
```

失败 candidate 直接 dispose/release，不需要 Data application close message。

---

## 10. Platform Broker Binding Responsibilities

Broker/Platform realization MUST在 candidate 上建立可信的 exact binding：

```text
current Session
current Renderer participant
target Subsystem Runtime / subsystemKey
current generation
current dataProfile
```

并保证 Renderer endpoint 与 Subsystem endpoint属于**同一个 physical connection pair / logical candidate**。

Broker MAY 使用不同的 platform-private mechanism：

```text
Hostra WebSocket endpoint + ticket + Runner provisioning IPC
PWA MessageChannel + Port transfer
internal promise/ack/barrier
```

但这些 mechanism：

```text
are Platform infrastructure
are not Data application protocol
must not mint generation/profile
must not infer authority from endpoint/ticket/Port alone
```

---

## 11. Paired Installation

一个 Data Connection 不是“Renderer 单端 current”或“Subsystem 单端 current”。它是一个 logical paired installation。

在 application traffic 可见前，Platform MUST保证：

```text
Renderer endpoint prepared
AND Subsystem endpoint prepared
AND both endpoints bound to same Session/Renderer/S/G/P
AND target Runtime still valid
AND authority still current
```

只有满足后才能执行 installation commit。

v1 不要求 application-level `data.ready`；paired readiness 是 Platform installation property。

角色在 wall-clock 上观察 binding callback 的微小先后不是协议 observable，只要：

```text
no child traffic is treated as current before paired readiness
```

---

## 12. Commit-time Authority Revalidation

authority 不能只在 provisioning 开始时检查。

installation commit 之前 MUST重新验证：

```text
candidate bound tuple
==
current Main DataAuthority tuple
```

并重新确认：

```text
Session current
Renderer participant current
target Runtime current/valid
candidate not failed/disposed
```

典型 race：

```text
start candidate for G1
→ Main replaces authority with G2
→ G1 physical establishment later succeeds
```

结果固定：

```text
G1 candidate MUST NOT become current
→ dispose
```

---

## 13. Cardinality / Serialized Installation

每个 Session：

```text
(Session, current Renderer participant, subsystemKey)
    → 0..1 current Data Connection
```

Platform MUST对该 slot 的 installation/retirement serialized。

并发 candidates：

```text
may establish concurrently as Platform work
but at most one may win installation commit
all losers dispose/retire without becoming current
```

必须满足：

```text
never two current connections for same slot
```

一个 current Data Connection MAY同时承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

不是 per-Frame / per-Activation / per-Domain connection。

---

## 14. Installation Commit / Cutover

candidate MAY在 old current 仍可用时提前 physical prepare。

但 application-visible cutover必须在 serialized critical section 内满足：

```text
revalidate candidate authority
→ old current (if any) loses current status / retires
→ candidate becomes the sole current
```

实现 MAY短暂暴露：

```text
old current → no current → new current
```

但 MUST NOT暴露：

```text
old current AND new current
```

一旦 new current installed，old carrier的任何后续 traffic 都是 retired-carrier traffic。

---

## 15. Core Lifecycle

Connection Core v1 只有：

```text
current
retired
```

唯一转换：

```text
current → retired
```

`retired` terminal；同一 Connection/carrier instance永远不能再次 current。

以下不是 Core states：

```text
connecting
ready
reconnecting
disconnected
half-open
receive-only
send-only
```

这些要么是 candidate/platform state，要么直接归入 retired。

---

## 16. Retirement Causes

以下任一都使 current Connection终止为 retired：

```text
physical carrier close/loss
read-side terminal failure
write-side terminal failure
Main DataAuthority removed
Main DataAuthority generation/profile replaced
Renderer Control loss
Renderer participant replacement
Session end/replacement
target Runtime instance terminal/replaced
proactive same-generation supersede by newly installed current carrier
child-protocol Data-fatal violation requiring carrier retirement
explicit Platform shutdown of Data slot
```

协议效果统一：

```text
current → retired
stop trusting/sending/accepting child traffic on that instance
```

实现 MAY记录 first terminal cause用于 diagnostics，但不同 retire reason不得产生不同 application recovery semantics。

---

## 17. No Half-current

Data carrier requirements是 bidirectional。

任一方向确认 terminal unusable：

```text
whole Connection retires
```

v1 不存在：

```text
Renderer→Subsystem still current but reverse direction retired
```

或任何 half-current mode。

---

## 18. Same-generation Carrier Replacement / Reconnect

同一个 current authority：

```text
S/G/P
```

MAY经历多个 sequential Connection instances：

```text
Connection A current
→ A retired
→ candidate B paired/install
→ B current
```

不要求：

```text
fresh generation
Renderer Control revision
Data application resume token
```

因此：

```text
generation replacement != transport reconnect
```

same-generation proactive replacement 与 post-loss reconnect在 Connection Core 中使用同样的 fresh-current semantics。

---

## 19. Authority Replacement

Main 从：

```text
S/G/P
```

替换为：

```text
S/G2/P2
```

要求：

```text
G2 > G
old authority permanently stale
```

Platform/roles MUST：

```text
retire old current
invalidate/dispose old pending candidates
invalidate old provisioning material
only install exact current G2/P2
```

Profile change同样必须 fresh generation。

authority removal 后允许 0 current；不存在“继续临时用旧 connection” grace period。

---

## 20. Renderer Control / Participant / Session Parent Authority

Renderer Data authority从属于 current Renderer Control participant。

以下任一发生：

```text
Renderer Control lost/replaced
Renderer participant replaced
Session changed/ended
```

旧 participant 的全部：

```text
current Data Connections
pending candidates
provisioning material
```

MUST立即失效。

恢复只能依据新的 current Renderer Control Snapshot/authority重新 provision；不得复用 cached old authority。

---

## 21. In-flight / Cutover Traffic

每个 carrier instance拥有自己的 ordered send/receive history。

### 21.1 Old emitted traffic

已经被 old carrier ordered send boundary 接受的 application unit：

```text
belongs to old carrier history
MUST NOT be replayed/migrated onto new carrier
```

remote 是否已收到在 loss时可能未知；child protocols依赖 fresh carrier baseline恢复，而不是重放。

### 21.2 Old unsent traffic

old Connection retired 时尚未 emitted 的 pending application traffic：

```text
becomes obsolete for that carrier
MUST NOT migrate verbatim to fresh carrier
MUST NOT retain old publication sequence semantics
```

上层 MAY根据 current desired state重新 materialize fresh-carrier baseline/traffic。

### 21.3 Late inbound from retired carrier

本地一旦已认定 carrier retired，来自该 instance 的 late application unit：

```text
MUST drop as stale-carrier traffic
MUST NOT enter current new carrier child state machine
MUST NOT by itself retire the fresh current connection
```

---

## 22. Fresh Child-protocol Publication Boundary

每条 newly installed current Connection instance都是 fresh application publication boundary。

Connection v1只定义这个 boundary；child具体 baseline由 Renderer Data Profile v1拥有。

当前 Profile v1：

### User Input

```text
remote Interest Registry = empty
retained Input State = empty
Event history = empty
```

如仍需要 Input，Subsystem重新发布 current desired Interest；State重新 baseline；Event future-only。

### Render Update

```text
first Render message = current render.domains
→ fresh Snapshot for each current Domain
→ Patch/Event
```

same-generation reconnect不允许继承 old carrier publication cursor作为 fresh authority。

注意：fresh carrier publication state不等于 business lifetime reset。Frame/Desired Interest/Render business Domain可按其各自 contract继续存在。

---

## 23. Current Gate

child application traffic只有在 exact current Connection 上才有效。

current gate同时要求：

```text
paired installation committed
bound Session current
bound Renderer participant current
bound target Runtime valid
bound subsystemKey matches slot
bound generation == Main current generation
bound dataProfile == Main current dataProfile
Connection not retired
```

physical socket/Port存在本身不产生 current authority。

---

## 24. Carrier Requirements

Platform binding提供的 current carrier至少满足：

```text
bidirectional
message-oriented
ordered per direction
application-message boundary preserved
observable close/loss
bounded/finite physical buffering policy
no adapter-created application retry
no adapter-created application duplicate
```

当前 Renderer Data Profile 将 application unit固定为 UTF-8 JSON text string；Connection Core本身不拥有 payload schema。

---

## 25. Failure Boundary

以下本身不产生 Runtime terminal failure或 Frame unwind：

```text
candidate establishment failure
candidate authority race loss
Data carrier loss
same-generation reconnect failure
same-generation proactive replacement
Renderer reload
unsupported dataProfile
child Data protocol carrier retirement
```

它们最多导致：

```text
current Data unavailable / retired
```

Runtime failure authority仍属于 Runtime Control / Supervisor。

反过来 Runtime terminal通常使 Main撤销 DataAuthority并因此 retire Data。

---

## 26. Frame / Input / Render Independence

Connection v1 不拥有：

```text
Frame lifecycle / Stack / Activation
InputTarget
Frame Interest
Input Producer
Render Domain lifecycle / revision
business state
```

因此：

```text
Frame suspend              != Data retire
Frame close                != Data retire
Activation replacement     != generation replacement
Interest change            != Data connection replacement
Data current               != ordinary input authority
Data retire                != authoritative Render Domain destroy
same-generation reconnect  != Frame/Runtime recovery
```

共享 carrier不合并 child authority。

---

## 27. Cross-plane Ordering

Renderer Control Connection 与 Data Connection没有 global total order。

Connection Core不提供：

```text
cross-plane ACK
Control/Data revision join
barrier RPC
resume-from-Control-revision
```

正确性依赖 current authority revalidation + child contracts自己的 skew handling。

---

## 28. Platform Realization Equivalence

Hostra 与 PWA physical mechanism可以不同：

```text
Hostra
    endpoint/ticket
    WebSocket
    Runner provisioning IPC

PWA
    MessageChannel
    Port transfer
    Worker provisioning path
```

但抽象 Connection trace必须等价：

```text
current authority
→ candidate preparation
→ paired readiness
→ commit-time authority revalidation
→ sole current
→ retirement
→ optional same-generation fresh current
```

Platform-private provisioning payload不是 interoperability surface。

---

## 29. Explicit Non-goals

Frozen v1 不定义：

```text
Data application handshake/RPC
heartbeat
ACK/NACK
connection revision
application reconnect/resume token
endpoint/ticket/Port wire format
historical replay/checkpoint
cross-plane ordering protocol
Frame-aware/Data-per-Frame connection
Input-aware connection state
Render-aware connection state
multiple simultaneous current Data Connections per Subsystem
remote arbitrary Subsystem networking
transport encryption protocol
```

---

## 30. Frozen Conformance Matrix

Normative conformance obligations由 [Data Connection v1 Conformance Profile](./renderer-subsystem-data-connection-conformance-v1.md) `fixtureSetRevision = 1` 固定。

至少证明：

```text
candidate-is-not-current
candidate-carries-no-child-traffic
paired-install-before-application-exposure
commit-time-authority-revalidation
authority-change-during-establish-rejects-candidate

exactly-one-current-per-slot
concurrent-candidates-only-one-wins
retired-never-current-again
no-half-current

same-generation-sequential-reconnect
same-generation-proactive-replacement
replacement-has-no-current-overlap

old-emitted-traffic-not-replayed
old-unsent-traffic-not-migrated
late-retired-carrier-traffic-dropped
fresh-current-resets-child-publication-state

generation-change-retires-old
profile-change-requires-fresh-generation
runtime-instance-replacement-requires-fresh-generation
generation-gap-allowed
generation-exhaustion-no-wrap

authority-removal-invalidates-current-and-candidates
control-loss-retires-all
renderer-replacement-retires-old
session-replacement-retires-old
one-direction-loss-retires-whole-connection

data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
hostra-pwa-same-abstract-connection-trace
```

Executable test harness/materialization属于 implementation qualification；不得改变 Frozen observable semantics。

---

## 31. Frozen Compatibility Boundary

以下不兼容改变需要新的 Connection Contract version或新的 Data Profile combination：

```text
logical identity/current gate
DataAuthority/generation semantics
profile immutability
candidate/current boundary
paired installation semantics
commit-time authority revalidation
cardinality/serialized installation
current→retired lifecycle
retirement/failure boundary
same-generation reconnect semantics
cutover/in-flight rules
fresh carrier publication boundary
carrier ordering/retry/duplicate requirements
zero-application-message rule
```

Frozen v1 不通过新增 optional `data.*` messages偷偷演进。

---

## 32. Final Invariants

1. Main 是 DataAuthority 唯一公共 authority；
2. Authority epoch、Platform candidate、Connection instance 是三个不同 lifetime；
3. Connection identity = Session + current Renderer + target Subsystem + generation，且必须匹配 immutable dataProfile；
4. candidate 在 installation commit 前不属于 Connection Core、不得承载 current child traffic；
5. installation 是 paired endpoint operation，并在 commit 时重新验证 current authority；
6. `(Session, current Renderer, subsystemKey)` 同时最多一个 current Connection；
7. candidate可并发 physical prepare，但 installation/retirement必须 serialized；
8. Core lifecycle只有 `current → retired`，retired terminal；
9. 任一方向 terminal usability loss都 retire whole Connection；无 half-current；
10. same S/G/P MAY sequential fresh Connection；generation replacement不等于 reconnect；
11. generation strictly increases但不要求连续，never reuse/wrap；fresh Runtime instance必须 fresh generation；
12. authority/profile/Renderer/Session/Runtime replacement都会使 old current/pending material失效；
13. old emitted traffic不 replay，old unsent traffic不 migrate，late retired-carrier traffic只 drop；
14. every fresh current Connection重新建立 child publication baseline；
15. Data failure不等于 Runtime failure/Frame unwind；
16. Platform Broker实现 physical establishment/binding/paired install，但不拥有 generation/profile/application semantics；
17. Connection v1自身定义 zero application messages。