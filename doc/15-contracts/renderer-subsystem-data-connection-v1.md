# Renderer ⇄ Subsystem Data Connection Contract v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> Contract 版本：1  
> Contract 标识：`loomrealm.renderer-subsystem-connection / 1`  
> 稳定程度：Evolving  
> 主要定义：Renderer 与单个 Subsystem Runtime 之间 Data Connection 的 identity、Main-owned generation authority、唯一性、替换、关闭与 failure boundary  
> 上游 authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)  
> 架构边界：[Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 后续协议：User Input Protocol v1、Render Update Protocol v1  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Connection v1 不定义业务消息，也不拥有业务状态。它只定义一条 Renderer ⇄ Subsystem Data Carrier 在什么条件下属于当前合法连接。**

---

## 1. 协议位置

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

建立后的 Data Connection 承载独立业务协议：

```text
Renderer → Subsystem
    User Input Protocol

Subsystem → Renderer
    Render Update Protocol
```

Connection Contract 本身不定义第三套业务消息协议。

---

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

一条 carrier 在进入本 Contract 的 `current Data Connection` 状态前，MUST 已由 Host / Platform binding 安全建立，并绑定到本文要求的 Connection identity。

Host / Platform 如何建立 WebSocket、MessagePort 或其他 carrier，不属于本 Contract wire surface。

---

## 3. Connection Identity

一条逻辑 Data Connection 的完整 identity 是：

```text
LoomRealm Session
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

Session identity MAY 由 enclosing Host / Runtime context 隐式绑定，不要求 User Input 或 Render Update 每条消息重复携带 `sessionId`。

`subsystemKey` MUST 等于当前 Game Package Descriptor 的 `descriptor.key`。

不得使用以下值代替 Subsystem identity：

```text
PID
Worker ID
WebSocket URL
TCP port
Connection Attempt ID
frameId
activationId
renderId
```

---

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

存在 matching DataAuthority：

```text
subsystemKey = S
generation = G
```

表示：

> Renderer 当前被 Main 允许为 Subsystem S 建立并持有 generation G 的 Data Connection。

不存在 matching DataAuthority 时：

```text
Renderer MUST NOT establish a new Data Connection.
Renderer MUST NOT continue treating an existing Data Connection as authorized.
```

DataAuthority 本身不是 credential。

因此以下字段都不是 secret：

```text
subsystemKey
generation
connectionProfile
```

---

## 5. Connection Profile

Renderer Control 的 `connectionProfile` 标识 Data Connection 所遵循的建立后 Contract。

v1 标识：

```text
loomrealm.renderer-subsystem-connection/1
```

它表示：

> 该 DataAuthority 要求建立符合本文 identity / generation / lifecycle / failure semantics 的 Data Connection。

它不表示具体 carrier：

```text
connectionProfile != websocket
connectionProfile != messageport
```

Desktop/PWA carrier 选择属于 Host / Platform binding。

---

## 6. Generation

`generation` 是：

> **Data authority epoch**

而不是：

```text
socket sequence
Connection Attempt counter
reconnect counter
message sequence
Render revision
Frame Activation
```

要求：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing when Main replaces Data authority
never reused within that Session/subsystemKey
```

例如：

```text
loom.map generation=5
→ authority replacement
loom.map generation=6
```

generation 5 永远不能再次成为该 Session 中 `loom.map` 的 current DataAuthority。

---

## 7. Generation 与 Transport Attempt 分离

同一个 generation MAY 存在多个顺序发生的 carrier establishment attempts。

例如：

```text
generation=7

attempt A
    establish
    carrier lost

attempt B
    establish again
```

只要：

```text
generation 7 remains Main current DataAuthority
+
Host/Platform binding establishes a fresh authenticated carrier
```

attempt B MAY 继续属于 generation 7。

因此：

```text
generation replacement
!=
transport reconnect
```

普通 Data Transport 抖动不要求 Main 修改 generation，也不要求产生新的 Renderer Control authority revision。

---

## 8. Host / Platform Binding Boundary

本 Contract 不冻结：

```text
WebSocket endpoint discovery
TCP port
HTTP Upgrade path
MessagePort creation / transfer
Bearer token format
one-time ticket format
Host API
Worker API
```

但 Host / Platform binding MUST 在把 carrier 交给 Data Connection Contract 前确保它已经绑定到：

```text
current LoomRealm Session
current Renderer participant
target subsystemKey
current DataAuthority generation
```

不同平台 MAY 使用不同安全机制。

本文只要求建立后的 Connection identity / lifecycle 语义一致。

---

## 9. Cardinality

一个 Session 中，对每个 Subsystem：

```text
(Session, subsystemKey)
    → 0..1 current Data Connection
```

不是：

```text
one connection per Frame
one connection per Activation
one connection per Render
```

一个 current Data Connection MAY 同时承载：

```text
0..N Frame/Input Context
0..N Render Context
```

---

## 10. Current Connection

一条 carrier 只有同时满足以下条件才属于 current Data Connection：

```text
carrier establishment succeeded
identity bound to current Session
identity bound to target subsystemKey
identity generation == Main current DataAuthority generation
not superseded
not revoked
not closed/lost
```

Transport physical existence 本身不产生 authority。

---

## 11. Same-Generation Replacement

如果新的合法 carrier 针对：

```text
same Session
same subsystemKey
same current generation
```

并成功成为 current，则旧 carrier MUST 永久进入：

```text
superseded
```

Renderer 与 Subsystem MUST：

```text
stop sending new child-protocol messages on old carrier
stop accepting old carrier as current
close/release old carrier when practical
```

最终只能保留一个 current connection。

旧 carrier 后续迟到消息不能使其重新成为 current。

---

## 12. Generation Replacement

如果 Main authority 从：

```text
generation = G
```

替换为：

```text
generation = G2
where G2 > G
```

则 G 立即成为 stale authority。

Renderer观察到新 Renderer Control Snapshot后 MUST：

```text
stop using generation G Data Connection
stop User Input on generation G
close/release generation G carrier
discard pending establishment material for G
establish generation G2 only through current Host/Platform binding
```

旧 generation 永远不能覆盖新 generation。

---

## 13. Authority Revocation

如果 Renderer Control Snapshot 中某 `subsystemKey` 的 DataAuthority 消失，则该 Subsystem 的 Data authority 已撤销。

Renderer MUST：

```text
stop User Input immediately
stop treating the Data Connection as authorized
close/release current carrier
discard pending establishment material
```

不得继续因为以下事实而保留 authority：

```text
WebSocket仍然open
MessagePort仍可postMessage
最后Render仍然可显示
```

```text
Transport existence != Data authority
```

---

## 14. Renderer Control Loss

Renderer Control Connection 是当前 Renderer DataAuthority 的父级 authority。

Renderer失去 current Renderer Control Connection 时 MUST：

```text
invalidate InputTarget
invalidate all cached DataAuthority
stop ordinary User Input
close/release all Renderer⇄Subsystem Data Connections
```

之后只能：

```text
reconnect Main
→ renderer.hello
→ obtain fresh current Authority Snapshot
→ re-establish only Data Connections allowed by fresh DataAuthority
```

旧 Data Connection不得跨 Renderer Control loss继续作为 current authority 使用。

---

## 15. Data Connection Loss

Current Data Connection 意外丢失时：

```text
connection becomes unusable immediately
User Input transmission stops
Render Update reception stops
```

但：

```text
Main DataAuthority MAY remain current
```

如果同 generation仍被 Main授权，Host / Platform binding MAY建立 fresh carrier，使同 generation重新出现 current Data Connection。

这属于：

```text
Data connection recovery
```

而不是：

```text
Frame recovery
Runtime recovery
```

---

## 16. Runtime Failure Boundary

Subsystem Runtime terminal failure通常会导致 Main撤销对应 DataAuthority。

但反方向不成立：

```text
Data Connection failure
    ↛ Runtime failure
```

以下事件本身 MUST NOT 导致 Runtime terminal failure 或 Frame unwind：

```text
Data WebSocket loss
MessagePort loss
Renderer reload
Data carrier establishment failure
same-generation Data reconnect
```

Runtime failure只能由其所属 Control / Supervisor authority决定。

---

## 17. Frame Independence

Connection v1 不拥有：

```text
Frame lifecycle
Frame Stack
Frame outcome
Activation creation/revocation
InputTarget authority
failedRuntimeKeys
failure unwind root
```

因此：

```text
Frame suspend != Data Connection close
Frame close != Data Connection close
Activation replacement != generation replacement
Data reconnect != Frame authority recovery
```

Data reconnect不能恢复 revoked Activation、取消 Frame unwind 或证明 Frame RPC 是否 commit。

---

## 18. Render Independence

Data Connection close：

```text
MUST NOT imply Render destroy
```

Renderer MAY保留最后一个合法 presentation state。

重新建立 Data Connection后，Render Update Protocol负责其自己的：

```text
snapshot
revision recovery
state replacement
```

Connection v1 不参与 Render recovery。

---

## 19. User Input Independence

Connection Established 只表示：

```text
Data carrier is currently authorized
```

不表示：

```text
ordinary input is currently authorized
```

普通 User Input仍必须满足 Main当前：

```text
InputTarget
frameId
activationId
```

因此以下状态完全合法：

```text
Data Connection = current
InputTarget = null
```

---

## 20. Child Protocol Boundary

第一阶段 current Data Connection 承载两个独立 child protocol：

```text
Renderer → Subsystem
    User Input v1

Subsystem → Renderer
    Render Update v1
```

Connection v1 MUST NOT定义：

```text
User Input sequence
input coalescing
Render revision
Render snapshot
Render coalescing
Frame Activation validation algorithm
child-protocol backpressure policy
```

这些语义分别属于 User Input / Render Update。

共享 carrier 不表示两个 child protocol共享 identity、sequence、backpressure 或 recovery domain。

---

## 21. Carrier Requirements

Host / Platform binding提供的 carrier MUST 至少具备：

```text
bidirectional communication
ordered delivery per direction
preserved application-message boundaries
observable close/loss
bounded implementation buffering
no adapter-created application retry
no adapter-created duplicate
```

不要求两个方向存在 global total order。

Data message encoding、size、compression与backpressure的具体规则由后续 Data Application Profile / child protocol冻结，不从 Frame / Call v1 自动继承。

---

## 22. No Connection-level Heartbeat

Connection v1 不定义：

```text
ping
pong
health
heartbeat
keepalive RPC
```

Host/Transport MAY使用自身 lifecycle/health机制，但不得借此产生新的 Main DataAuthority。

未来若确实需要 application-level Data health，应作为独立版本化能力设计。

---

## 23. No Application Reconnect / Replay

Connection v1 不定义：

```text
data.resume
data.reconnect
resumeToken
lastSequence
connection replay
connection checkpoint
```

重新建立 carrier 只是：

```text
fresh carrier establishment
→ validate/bind current Session + subsystemKey + generation
→ become current Data Connection
```

Render/User Input各自的恢复语义由对应协议定义。

---

## 24. No Connection-level ACK

Connection v1 不定义：

```text
connection ACK
generation ACK
authority ACK
```

Main Renderer Control authority 不依赖 Data Connection establishment ACK 才能 commit。

因此：

```text
DataAuthority published
!=
Data Connection established
```

DataAuthority存在但当前 Data Connection暂时不存在，是合法状态。

---

## 25. Establishment Failure

Host / Platform binding建立 carrier 失败时，结果只是：

```text
Data Connection establishment failed
```

它不自动改变：

```text
Runtime state
Frame state
DataAuthority generation
Render state
```

如果 current DataAuthority仍有效，Host / Renderer MAY按平台策略再次建立 fresh carrier。

这不属于 application operation replay。

---

## 26. Session Boundary

Session终止后：

```text
all DataAuthority revoked
all Data Connections cease to be current
all carriers close/release
all platform establishment capabilities expire
```

旧 Session 的 generation/carrier/capability不得进入新 Session继续使用。

`generation` 只要求在原 Session + subsystemKey 范围内 never reused。

---

## 27. Security Invariants

Connection v1 冻结：

```text
DataAuthority is not a credential.
generation is not a credential.
subsystemKey is not a credential.
Transport possession alone is not authority.
```

Host / Platform binding MUST 保证建立的 carrier不能被绑定到错误 Session、错误 Subsystem 或 stale generation。

具体 credential/capability encoding与分发机制不属于本 Contract。

---

## 28. Minimum Conformance Scenarios

至少覆盖：

```text
current-generation-establish
no-authority-not-current
wrong-subsystem-not-current
stale-generation-not-current

one-current-connection
same-generation-new-carrier-supersedes-old
superseded-carrier-never-current-again

generation-replacement-closes-old
authority-removal-closes-connection
renderer-control-loss-closes-all

data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
same-generation-reestablish-after-loss

connection-current-with-null-inputtarget
frame-close-does-not-close-healthy-data-connection
activation-change-does-not-replace-data-generation

runtime-failure-revokes-data-authority
session-end-closes-all

platform-bindings-produce-equivalent-connection-identity
```

---

## 29. Explicit Non-Goals v1

v1 不定义：

```text
Connection application handshake
Connection JSON-RPC methods
heartbeat/liveness RPC
User Input payload
Render Update payload
Render State
Render revision
input sequence
child-protocol backpressure algorithm
compression
binary encoding
encryption protocol
historical replay
checkpoint
connection migration
remote Subsystem networking
multiple Renderer participants
multiple simultaneous current Data Connections per Subsystem
Desktop WebSocket establishment details
PWA MessagePort establishment details
```

---

## 30. Final Invariants

Renderer ⇄ Subsystem Data Connection Contract v1：

1. Main 是 DataAuthority 唯一公共权威；
2. Data Connection identity = Session + subsystemKey + generation；
3. generation 是 authority epoch，不是 transport attempt；
4. 每个 Subsystem 同时最多一个 current Data Connection；
5. 同 generation MAY 通过 fresh carrier重新建立；
6. 新 current carrier永久 supersede旧 carrier；
7. generation replacement永久废弃旧 generation；
8. Renderer Control loss撤销 Renderer当前全部 Data authority；
9. Data Connection failure不等于 Runtime failure；
10. Data failure不触发 Frame unwind；
11. Data close不等于 Render destroy；
12. current Data Connection不等于 InputTarget有效；
13. Connection Core本身零 application methods；
14. Host/Platform establishment机制可不同，但建立后的 identity/lifecycle必须一致；
15. User Input 与 Render Update 是建立后的独立业务消息协议。

---

## 31. Summary

```text
Main publishes:
    DataAuthority(S, generation=7)

Host / Platform binding:
    establishes authenticated carrier
    bound to Session / S / generation 7

Connection Contract:
    carrier becomes current Data Connection

Then:

Renderer ── User Input ───────▶ Subsystem
Renderer ◀─ Render Update ───── Subsystem

Carrier lost:
    child messaging stops

if generation 7 remains authorized:
    fresh carrier may be established
    → same generation 7

Main replaces authority:
    generation 8
    → generation 7 permanently stale
    → old carrier ceases to be current
    → generation 8 may establish a new current connection
```

最终原则：

> **Connection v1 不需要“说话”；它只定义谁有资格让这条 Data 管道成为当前合法连接。**
