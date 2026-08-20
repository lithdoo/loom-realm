# Renderer ⇄ Subsystem Data Connection Contract v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> Contract 版本：1  
> Contract 标识：`loomrealm.renderer-subsystem-connection / 1`  
> 稳定程度：Evolving  
> 主要定义：Renderer 与单个 Subsystem Runtime 之间 Data Connection 的 identity、Main-owned generation/profile authority、唯一性、替换、退役与 failure boundary  
> 上游 authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)  
> 组合 Profile：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)  
> Child protocols：[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Connection v1 不定义业务消息，也不拥有业务状态。它只定义哪一条 Renderer ⇄ Subsystem Data Carrier 此刻有资格作为 current；完整 child-protocol stack 由 `dataProfile` 选择。**

---

## 1. Position

```text
Main
 │
 │ Renderer Control
 │ DataAuthority {
 │   subsystemKey,
 │   generation,
 │   dataProfile
 │ }
 ▼
Renderer
 │
 │ current Data Carrier
 ▼
Subsystem Runtime
```

当前 Phase 1：

```text
dataProfile = loomrealm.renderer-data/1
```

对应：

```text
Data Connection v1
+ User Input v1
+ Render Update v1
```

Connection Contract 不解释 Input/Render payload。

---

## 2. Zero-Application-Message Contract

Connection v1 自身：

```text
defines zero application methods
defines zero JSON-RPC methods
defines zero handshake messages
defines zero heartbeat messages
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

carrier 成为 `current` 前必须已由 Platform Data Connection Broker 安全建立并绑定正确 authority facts。

WebSocket / MessagePort establishment 不属于本 Contract wire surface。

---

## 3. Connection Identity

完整逻辑 identity：

```text
current LoomRealm Session
+ current Renderer participant
+ subsystemKey
+ generation
```

概念：

```ts
interface DataConnectionIdentityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
}
```

另外 current gate 必须匹配该 generation 的 immutable `dataProfile`。

PID、Worker ID、URL、port、Frame/Activation/Render identity不得代替 Subsystem/Data identity。

---

## 4. DataAuthority

Main 是 Data Connection authority 的唯一公共权威。

Renderer Control 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

matching authority 要求：

```text
subsystemKey = S
generation   = G
dataProfile  = P
```

表示 current Renderer participant 被 Main 允许为 Subsystem `S` 持有 generation `G`、Profile `P` 的 Data Connection。

不存在 matching DataAuthority 时，Renderer/Subsystem/Platform MUST NOT把 carrier 安装或继续视为 current。

`subsystemKey` / `generation` / `dataProfile` 都不是 credential。

---

## 5. Data Profile Boundary

`dataProfile` 选择完整 Data application stack。

当前：

```text
loomrealm.renderer-data/1
```

其组合/encoding/demux/fresh-child-baseline 由 Renderer Data Application Profile v1 定义。

```text
dataProfile != websocket
dataProfile != messageport
dataProfile != bearer ticket
```

同一 generation 中 `dataProfile` immutable。Profile change MUST伴随 fresh generation。

---

## 6. Generation

`generation` 是 Data authority epoch，不是 socket attempt/reconnect count/message sequence/Render revision/Frame Activation。

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused within Session + subsystemKey
```

---

## 7. Generation vs Carrier Attempt

同一 generation/profile MAY经历多个顺序 carrier attempts：

```text
G/P
carrier A current
→ A lost/retired
→ carrier B established
→ B current
```

只要 Main current DataAuthority仍是同一 `S/G/P`，不要求新 generation或 Renderer Control revision。

```text
generation replacement != transport reconnect
```

---

## 8. Platform Data Connection Broker Boundary

本 Contract 不冻结：

```text
WebSocket endpoint discovery
TCP port / Upgrade path
MessageChannel creation/transfer
Bearer ticket format
Node child IPC provisioning payload
Worker bootstrap object
```

Platform Data Connection Broker MUST在安装 carrier 为 current 前保证：

```text
bound Session is current
bound Renderer participant is current
bound subsystemKey = current authority subsystemKey
bound generation = current authority generation
bound dataProfile = current authority dataProfile
```

不同 Platform MAY用不同 provisioning mechanism；建立后的 Connection semantics必须一致。

Broker不拥有 generation/profile，不得从 endpoint/Port/ticket 推导 authority。

---

## 9. Cardinality

每个 Session：

```text
(Session, current Renderer participant, subsystemKey)
    → 0..1 current Data Connection
```

一个 current Data Connection MAY同时承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

不是 per-Frame / per-Activation / per-Render connection。

---

## 10. Lifecycle

Connection Core v1 只有：

```text
current
retired
```

唯一转换：

```text
current → retired
```

`retired` terminal；同一 carrier instance永远不能再次 current。

`lost / closed / superseded / revoked / session-ended / renderer-replaced / profile-mismatch` 都只是 retire reason。

---

## 11. Current Gate

carrier 只有同时满足以下条件才是 current：

```text
establishment succeeded
bound Session current
bound Renderer participant current
bound subsystemKey matches target Runtime
bound generation == Main current generation
bound dataProfile == Main current dataProfile
not retired
```

Transport物理存在本身不产生 authority。

所有 child protocol ordinary message只允许在 current carrier 上发送/接受。

---

## 12. Serialized Installation

Platform MUST对：

```text
(Session, Renderer participant, subsystemKey)
```

的 current-carrier installation串行化。

同 generation/profile replacement：

```text
old current
→ retire old
→ establish/install fresh carrier
→ fresh current
```

并发 attempts最多一个成为 current，其余立即 retired/released。

---

## 13. Authority Replacement / Revocation

Main从 `G/P` 替换为 `G2/P2`：

```text
G2 > G
old authority permanently stale
```

Renderer/Platform MUST：

```text
retire old current carrier
stop child-protocol traffic on old authority
discard pending old provisioning material
only establish current G2/P2
```

如果仅 `dataProfile` 改变，也必须使用 fresh generation。

DataAuthority消失时，对应 current/pending Data connection material全部立即失效。

---

## 14. Renderer Participant Replacement / Control Loss

Renderer Control 是 current Renderer DataAuthority 的父级 authority。

以下任一发生：

```text
current Renderer Control lost
Renderer participant replaced
Session changed
```

旧 Renderer participant 的全部 Data Connections MUST立即 retired。

之后只依据新 current Renderer Control Snapshot重新建立。

---

## 15. Data Connection Loss

current carrier意外丢失：

```text
current → retired
User Input traffic stops
Render Update traffic stops
```

Main DataAuthority MAY继续有效。

如果同一 `S/G/P` 仍授权，Platform MAY建立 fresh carrier再安装为 current。

这是 Data recovery，不是 Runtime/Frame recovery。

---

## 16. Fresh Child-Protocol Baseline

每条 fresh current carrier都是新的 child-protocol publication boundary。

具体组合由 Renderer Data Application Profile v1 定义。

当前 Profile v1 至少要求：

### User Input

```text
remote Frame Interest Registry = empty
retained Input State = empty
Event history = empty
```

Connection establishment不要求立即 Interest。Subsystem如仍希望 live Frames接收输入，重新发布 current full Frame Interest Registry。

### Render Update

```text
first Render message = current Domain Registry
→ fresh Snapshot for each current Domain
→ Patch/Event
```

旧 carrier publication state不得继承为 fresh carrier authority。

---

## 17. Runtime Failure Boundary

Subsystem Runtime terminal failure通常导致 Main撤销对应 DataAuthority。

反方向不成立：

```text
Data failure ↛ Runtime failure
```

WebSocket/MessagePort loss、Renderer reload、carrier establishment failure、unsupported profile、same-generation reconnect失败，本身 MUST NOT导致 Runtime terminal failure或 Frame unwind。

Runtime failure只由 Runtime Control / Supervisor authority决定。

---

## 18. Frame Independence

Connection v1 不拥有 Frame lifecycle、Stack、Outcome、Activation、InputTarget、failedRuntimeKeys、unwind root。

因此：

```text
Frame suspend != Data retire
Frame close != Data retire
Activation replacement != generation replacement
Frame Interest != per-Frame Data Connection
Data reconnect != Frame authority recovery
```

Data reconnect不能恢复 revoked Activation、取消 unwind或证明 Frame RPC commit。

---

## 19. Render Independence

Connection retired MUST NOT imply authoritative Render Domain destroy。

Renderer MAY暂存最后合法 presentation；fresh carrier后由 Render Update重新建立 authoritative replica baseline。

---

## 20. User Input Independence

`current Data Connection` 只表示 carrier authority，不表示 ordinary input authority。

普通 State/Event至少还要求：

```text
Main current InputTarget
current Frame + Activation
Interest[frameId]
Producer availability
```

以下都合法且可无 ordinary input：

```text
Data current + InputTarget=null + Interest non-empty
Data current + InputTarget=F/A + Interest[F] absent
Data current + Interest[F] exists + target elsewhere
```

---

## 21. Ordering Boundary

Data carrier MUST保持 per-direction application-unit order。

但：

```text
Renderer Control Connection
≠ total ordered with
Renderer Data Connection
```

因此 Connection Core不提供 cross-plane barrier/ACK/revision join。

User Input必须安全处理 Interest-first 与 Authority-first。

---

## 22. Carrier Requirements

Platform binding提供的 carrier至少：

```text
bidirectional
message-oriented
ordered per direction
application-message boundary preserved
observable close/loss
production adapter avoids unbounded physical buffering
no adapter-created retry
no adapter-created duplicate
```

本 Contract不定义 payload encoding；当前 encoding由 Renderer Data Application Profile v1 冻结为 UTF-8 JSON text string。

---

## 23. Explicit Non-goals

v1 不定义：

```text
Connection application handshake/RPC
heartbeat
Frame lifecycle/InputTarget
User Input payload details
Render payload details
child-protocol ACK/replay
cross-plane ordering protocol
encryption protocol
historical replay/checkpoint
remote Subsystem networking
multiple Renderer participants
multiple simultaneous current Data Connections per Subsystem
Desktop/PWA provisioning wire format
```

---

## 24. Minimum Conformance

至少覆盖：

```text
current-authority-establish
no-authority-not-current
wrong-subsystem/session/renderer-not-current
stale-generation-not-current
wrong-data-profile-not-current

one-current-connection
serialized-same-generation-replacement
concurrent-attempt-only-one-current
retired-never-current-again

generation-replacement-retires-old
profile-change-requires-new-generation
authority-removal-retires-current
renderer-control-loss-retires-all
renderer-replacement-retires-old

data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
same-generation-reestablish-after-loss

fresh-connection-input-empty
fresh-connection-render-baseline
connection-establish-does-not-require-interest
same-generation-reconnect-does-not-inherit-input-state

frame-close-does-not-retire-data
activation-change-does-not-replace-generation
frame-interest-does-not-create-per-frame-connection
control-data-no-total-order
platform-bindings-produce-equivalent-identity
```

---

## 25. Final Invariants

1. Main是 DataAuthority 唯一公共 authority；
2. Data Connection identity = Session + current Renderer + subsystemKey + generation；
3. `dataProfile` 是 generation 的 immutable complete application-stack attribute；
4. profile改变必须 fresh generation；
5. lifecycle只有 current→retired，retired terminal；
6. 每个 Subsystem最多一个 current Data Connection；
7. current installation必须 serialized；
8. same generation/profile MAY sequential reconnect；
9. Renderer replacement/Control loss retire全部旧 Data Connections；
10. Data failure不等于 Runtime failure/Frame unwind；
11. Frame-scoped Interest不改变 per-Subsystem cardinality；
12. fresh carrier child-protocol state重新 baseline；
13. Connection current不等于 ordinary input authority；
14. Control/Data无跨连接 total order；
15. Platform Broker负责 physical provisioning，但不拥有 generation/profile；
16. Connection v1自身定义 zero application messages。
