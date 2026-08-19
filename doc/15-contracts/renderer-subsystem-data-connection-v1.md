# Renderer ⇄ Subsystem Data Connection Contract v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> Contract 版本：1  
> Contract 标识：`loomrealm.renderer-subsystem-connection / 1`  
> 稳定程度：Evolving  
> 主要定义：Renderer 与单个 Subsystem Runtime 之间 Data Connection 的 identity、Main-owned generation authority、唯一性、替换、退役与 failure boundary  
> 上游 authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)  
> 后续协议：[User Input Protocol v1](./user-input-v1.md)、[Render Update Protocol v1](./render-update-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Connection v1 不定义业务消息，也不拥有业务状态。它只定义哪一条 Renderer ⇄ Subsystem Data Carrier 此刻有资格作为 current；Frame-scoped Input Interest 不改变 Connection 仍然是 per-Subsystem 的事实。**

---

## 1. Protocol Position

```text
Main
 │
 │ Renderer Control
 │ DataAuthority {
 │   subsystemKey,
 │   generation,
 │   connectionProfile
 │ }
 ▼
Renderer
 │
 │ authenticated Data Carrier
 ▼
Subsystem Runtime
```

建立后的 current Data Connection 承载独立 child protocols：

```text
User Input v1
    Subsystem → Renderer
        Frame Input Interest Registry Snapshot

    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
        Domain Registry / Snapshot / Patch / Event
```

Connection Contract 不解释这些 child payload。

## 2. Zero-Application-Message Contract

Renderer ⇄ Subsystem Data Connection v1：

```text
defines zero application methods
defines zero JSON-RPC methods
defines zero Connection handshake messages
defines zero heartbeat messages
```

Core v1 不存在：

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

carrier 在成为 `current` 前 MUST 已由 Host / Platform binding 安全建立并绑定正确 identity。

WebSocket / MessagePort establishment 不属于本 Contract wire surface。

## 3. Connection Identity

完整逻辑 identity：

```text
LoomRealm Session
+
current Renderer participant
+
subsystemKey
+
generation
```

概念结构：

```ts
interface DataConnectionIdentityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
}
```

`subsystemKey` MUST等于当前 Game Package Descriptor 的 `descriptor.key`。

PID、Worker ID、URL、port、Frame/Activation/Render identity 不得代替 Subsystem identity。

## 4. DataAuthority

Main 是 Data Connection authority 的唯一公共权威。

Renderer Control v1 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly connectionProfile: string;
}
```

matching DataAuthority：

```text
subsystemKey = S
generation = G
```

表示当前 Renderer participant 被 Main 允许为 Subsystem `S` 建立并持有 generation `G` 的 Data Connection。

不存在 matching DataAuthority 时，Renderer MUST NOT建立新连接，也 MUST NOT继续把既有连接视为 current。

`subsystemKey`、`generation`、`connectionProfile` 都不是 credential。

## 5. Connection Profile

v1：

```text
loomrealm.renderer-subsystem-connection/1
```

它只表示建立后的 identity / generation / lifecycle / failure semantics，不表示具体 carrier type。

```text
connectionProfile != websocket
connectionProfile != messageport
```

## 6. Generation

`generation` 是 Data authority epoch，不是 socket attempt、reconnect count、message sequence、Render revision 或 Frame Activation。

要求：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused within Session + subsystemKey
```

## 7. Generation vs Carrier Attempt

同一 generation MAY经历多个顺序发生的 carrier establishment attempts：

```text
generation=7
carrier A current
→ carrier A lost/retired
→ carrier B established
→ carrier B current
```

只要 generation 7 仍是 Main current DataAuthority，就不要求新的 generation 或 Renderer Control revision。

```text
generation replacement != transport reconnect
```

## 8. Host / Platform Binding Boundary

本 Contract 不冻结：

```text
WebSocket endpoint discovery
TCP port
HTTP Upgrade path
MessagePort creation / transfer
Bearer token / one-time ticket format
Host API / Worker API
```

Host / Platform binding MUST在安装 carrier 为 current 前确保它绑定到：

```text
current LoomRealm Session
current Renderer participant
target subsystemKey
current DataAuthority generation
```

不同平台 MAY 使用不同机制；建立后的 Connection semantics 必须一致。

## 9. Cardinality

一个 Session 中，对每个 Subsystem：

```text
(Session, current Renderer participant, subsystemKey)
    → 0..1 current Data Connection
```

一个 current Data Connection MAY同时承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

它不是 per-Frame / per-Activation / per-Render connection。

**User Input 的 Interest 改为 Frame-scoped，不改变这里的 cardinality。**

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

`retired` terminal；同一 carrier instance 永远不能重新成为 current。

`lost / closed / superseded / revoked / session-ended / renderer-replaced` 只是 retire reason，不是独立 lifecycle。

## 11. Current Gate

carrier 只有同时满足以下条件才是 current：

```text
carrier establishment succeeded
bound Session is current
bound Renderer participant is current
bound subsystemKey matches target Runtime
bound generation == Main current DataAuthority generation
not retired
```

Transport 物理存在本身不产生 authority。

所有 child protocol MUST只在 current carrier 上发送/接受普通业务消息。

## 12. Serialized Installation

Host / Platform adapter MUST对：

```text
(Session, Renderer participant, subsystemKey)
```

的 current-carrier installation 串行化。

不得同时安装两条 current carrier。

同 generation replacement：

```text
old current
→ retire old
→ establish/install fresh carrier
→ fresh current
```

并发完成的多个 attempts 至多一个可成为 current；其余必须直接 retired/released。

## 13. Generation Replacement

Main authority 从 `G` 替换为 `G2 > G` 时，generation G 永久 stale。

Renderer MUST：

```text
retire generation G current carrier
stop User Input traffic on G
discard pending establishment material for G
only establish G2 through current Host binding
```

旧 generation 永远不能覆盖新 generation。

## 14. Authority Revocation

Renderer Control Snapshot 中某 `subsystemKey` 的 DataAuthority 消失时，对应 current carrier MUST立即 retired。

Renderer MUST：

```text
stop ordinary User Input
stop treating carrier as current
close/release carrier
discard pending establishment material
```

Subsystem 与 Renderer 都 MUST停止把 retired carrier 用作 User Input / Render Update current carrier。

## 15. Renderer Participant Replacement / Control Loss

Renderer Control Connection 是当前 Renderer DataAuthority 的父级 authority。

以下任一发生：

```text
current Renderer Control lost
current Renderer participant replaced
Session changed
```

旧 Renderer participant 的全部 Data Connections MUST立即 retired。

之后只能依据新的 current Renderer Control Snapshot 重新建立允许的 Data Connections。

## 16. Data Connection Loss

current carrier 意外丢失：

```text
current → retired
User Input application traffic stops
Render Update reception stops
```

Main DataAuthority MAY继续有效。

如果同 generation 仍被授权，Host / Platform binding MAY建立 fresh carrier 再安装为 current。

这属于 Data recovery，不是 Runtime / Frame recovery。

## 17. Child-Protocol Fresh Baseline

每条 fresh current carrier 都是新的 child-protocol publication boundary。

### User Input

fresh carrier 固定从：

```text
Frame Interest Registry = empty
retained Input State = empty
```

开始。

**Connection establishment 不要求 Subsystem 立即发布 Interest。**

即使 Main 当前已经发布：

```text
InputTarget = F/A
```

如果 fresh carrier 上 `Interest[F]` 尚不存在，ordinary input仍然 disabled。

Subsystem 若希望继续为 live Frames接收输入，必须在 fresh carrier 上重新发布 current full Frame Interest Registry Snapshot。

旧 carrier 的：

```text
Interest Registry
State
Event history
```

均不得继承。

### Render Update

Render child protocol按 Render Update v1 自己的 fresh-connection baseline 收敛；Connection Core不定义 Render Registry/Snapshot内容。

## 18. Runtime Failure Boundary

Subsystem Runtime terminal failure通常会导致 Main撤销对应 DataAuthority。

反方向不成立：

```text
Data Connection failure ↛ Runtime failure
```

WebSocket/MessagePort loss、Renderer reload、carrier establishment failure、same-generation reconnect 本身 MUST NOT导致 Runtime terminal failure或 Frame unwind。

Runtime failure只能由 Control / Supervisor authority决定。

## 19. Frame Independence

Connection v1 不拥有 Frame lifecycle、Stack、outcome、Activation、InputTarget、failedRuntimeKeys 或 unwind root。

因此：

```text
Frame suspend != Data Connection retire
Frame close != Data Connection retire
Activation replacement != generation replacement
Frame-scoped Interest != per-Frame Data Connection
Data reconnect != Frame authority recovery
```

Data reconnect不能恢复 revoked Activation、取消 Frame unwind 或证明 Frame RPC commit。

## 20. Render Independence

Connection retired MUST NOT imply Render destroy。

Renderer MAY保留最后合法 presentation state；fresh carrier 后由 Render Update v1 决定 snapshot/revision/state recovery。

## 21. User Input Independence

`current Data Connection` 只表示 carrier authority，不表示 ordinary input authority，也不表示任何 Channel Effective。

普通 State/Event 仍至少要求 User Input v1 的：

```text
Main current InputTarget
current Frame + Activation
Frame-scoped Interest[frameId]
Producer availability
```

以下都合法：

```text
Data Connection current
InputTarget = null
Interest Registry non-empty
```

```text
Data Connection current
InputTarget = F/A
Interest[F] absent
```

两种情况下都可能没有 ordinary input。

## 22. Child Protocol Boundary

current Data Connection 承载两个独立 child protocols：

```text
User Input v1
    Subsystem → Renderer
        full Frame Interest Registry Snapshot
    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
        Domain Registry / Snapshot / Patch / Event
```

两者共享 carrier，但 MUST独立定义 payload、ordering、backpressure、recovery 与 limits。

Frame Interest 是 User Input application-domain configuration，不是 Connection Core method，也不是第三套 connection protocol。

## 23. Ordering Boundary

Data carrier MUST保持 per-direction application-message order。

但以下之间 **不存在 global total order**：

```text
Main ⇄ Renderer Control Connection
Renderer ⇄ Subsystem Data Connection
```

因此 Connection Core不提供 cross-plane barrier / ACK / revision join。

User Input v1 必须能安全处理：

```text
Interest before Frame/InputTarget authority
Frame/InputTarget authority before Interest
```

Connection Core只提供 current carrier identity，不解决 child protocol 与 Main Control 的跨连接因果排序。

## 24. Carrier Requirements

Host / Platform binding 提供的 carrier MUST至少具备：

```text
bidirectional communication
ordered delivery per direction
preserved application-message boundaries
observable close/loss
bounded implementation buffering
no adapter-created application retry
no adapter-created duplicate
```

不要求两个方向存在 global total order，也不要求与 Renderer Control Connection 存在 total order。

具体 Data encoding / size / compression / queue policy 由 child protocol 或 Data Application Profile 冻结。

## 25. Explicit Non-Goals v1

v1不定义：

```text
Connection application handshake
Connection JSON-RPC methods
heartbeat/liveness RPC
User Input payload / Interest schema details
Frame lifecycle / InputTarget
Render Update payload
Render State
child-protocol sequence/backpressure
cross-plane ordering protocol
compression/binary encoding
encryption protocol
historical replay/checkpoint
connection migration
remote Subsystem networking
multiple Renderer participants
multiple simultaneous current Data Connections per Subsystem
Desktop WebSocket establishment details
PWA MessagePort establishment details
```

## 26. Minimum Conformance Scenarios

至少覆盖：

```text
current-generation-establish
no-authority-not-current
wrong-subsystem-not-current
stale-generation-not-current

one-current-connection
serialized-same-generation-replacement
concurrent-attempt-only-one-current
retired-carrier-never-current-again

generation-replacement-retires-old
authority-removal-retires-connection
renderer-control-loss-retires-all
renderer-participant-replacement-retires-old

data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
same-generation-reestablish-after-loss

fresh-connection-input-registry-empty
connection-establish-does-not-require-interest
same-generation-reconnect-does-not-inherit-interest
same-generation-reconnect-does-not-inherit-input-state

connection-current-with-null-inputtarget
connection-current-with-target-but-no-frame-interest
connection-current-with-interest-but-no-inputtarget
frame-close-does-not-retire-healthy-data-connection
activation-change-does-not-replace-data-generation
frame-interest-does-not-create-per-frame-connection

control-data-no-total-order
interest-before-authority-supported
authority-before-interest-supported

user-input-bidirectional-domain-on-current-carrier
runtime-failure-revokes-data-authority
session-end-retires-all
platform-bindings-produce-equivalent-connection-identity
```

## 27. Final Invariants

1. Main 是 DataAuthority 唯一公共 authority；
2. Data Connection identity = Session + current Renderer participant + subsystemKey + generation；
3. generation 是 authority epoch，不是 transport attempt；
4. lifecycle 只有 current / retired，retired terminal；
5. 每个 Subsystem 同时最多一个 current Data Connection；
6. current-carrier installation 必须 serialized；
7. 同 generation MAY在旧 carrier retired 后建立 fresh carrier；
8. generation replacement永久废弃旧 generation；
9. Renderer participant replacement / Control loss retire其全部 Data Connections；
10. Data Connection failure不等于 Runtime failure，也不触发 Frame unwind；
11. Frame-scoped Interest 不改变 Connection 的 per-Subsystem cardinality；
12. fresh carrier 的 User Input Interest Registry 与 retained Input State 都从 empty 开始；
13. Connection establishment 不要求立即发布 Input Interest；
14. current Data Connection不等于 InputTarget有效，也不等于任何 User Input Channel Effective；
15. Control Connection 与 Data Connection 无 global total order；
16. Connection Core本身零 application methods；
17. Host/Platform establishment机制可不同，但建立后的 identity/lifecycle必须一致；
18. User Input 与 Render Update 是建立后的独立 child protocols。

## 28. Summary

```text
Main publishes:
    DataAuthority(S, generation=7)

Host / Platform binding:
    establishes carrier bound to
    Session / current Renderer / S / generation 7

Connection Contract:
    installs at most one current carrier

fresh carrier:
    User Input Interest Registry = empty
    retained Input State = empty

Then, when needed:
    Subsystem ── Frame Interest Registry ─▶ Renderer
    Renderer  ── State/Event/Reset ───────▶ Subsystem
    Subsystem ── Render Update ───────────▶ Renderer

Carrier lost:
    current → retired

if generation 7 remains authorized:
    fresh carrier may become current
    child protocol state starts fresh

Main replaces authority:
    generation 8
    → generation 7 permanently stale
    → old carrier retired
```

最终原则：

> **Connection v1 不需要“说话”；它只定义哪一条 Data 管道此刻有资格作为 current。Frame-scoped Input Interest 是管道上的 child state，不是管道 identity。**
