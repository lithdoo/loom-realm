# Renderer ⇄ Subsystem Data Connection Contract v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> Contract 版本：1  
> Contract 标识：`loomrealm.renderer-subsystem-connection / 1`  
> 稳定程度：Evolving  
> 主要定义：Renderer 与单个 Subsystem Runtime 之间 Data Connection 的 identity、Main-owned generation authority、唯一性、替换、退役与 failure boundary  
> 上游 authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)  
> 架构边界：[Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 后续协议：[User Input Protocol v1](./user-input-v1.md)、Render Update Protocol v1  
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
User Input v1
    Subsystem → Renderer
        Input Interest

    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
```

Connection Contract 本身不定义第三套业务消息协议，也不解释这些 child protocol payload。

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

一条 carrier 在进入本 Contract 的 `current` 状态前，MUST 已由 Host / Platform binding 安全建立并绑定到正确 Connection identity。

WebSocket / MessagePort 如何建立不属于本 Contract wire surface。

## 3. Connection Identity

一条逻辑 Data Connection 的完整 identity 是：

```text
LoomRealm Session
+
current Renderer participant
+
subsystemKey
+
generation
```

其中 Renderer participant identity MAY 由 enclosing Renderer Control / Host context 隐式绑定，不进入 User Input / Render Update 每条消息。

概念结构：

```ts
interface DataConnectionIdentityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
}
```

`subsystemKey` MUST 等于当前 Game Package Descriptor 的 `descriptor.key`。

不得使用 PID、Worker ID、URL、port、Frame/Activation/Render identity 代替 Subsystem identity。

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

表示：

> 当前 Renderer participant 被 Main 允许为 Subsystem S 建立并持有 generation G 的 Data Connection。

不存在 matching DataAuthority 时，Renderer MUST NOT 建立新连接，也 MUST NOT 继续把既有连接当成 current。

`subsystemKey`、`generation`、`connectionProfile` 都不是 credential。

## 5. Connection Profile

v1 `connectionProfile`：

```text
loomrealm.renderer-subsystem-connection/1
```

它只表示建立后的 identity / generation / lifecycle / failure semantics，MUST NOT 被解释为具体 carrier type。

```text
connectionProfile != websocket
connectionProfile != messageport
```

## 6. Generation

`generation` 是 **Data authority epoch**，不是 socket attempt、reconnect count、message sequence、Render revision 或 Frame Activation。

要求：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing when Main replaces Data authority
never reused within Session + subsystemKey
```

例如：

```text
loom.map generation=5
→ authority replacement
loom.map generation=6
```

5 永远不能再次成为该 Session 中 `loom.map` 的 current generation。

## 7. Generation 与 Carrier Attempt 分离

同一 generation MAY 经历多个顺序发生的 carrier establishment attempts：

```text
generation=7

carrier A current
→ carrier A lost/retired
→ carrier B established
→ carrier B current
```

只要 generation 7 仍是 Main current DataAuthority，就不要求修改 generation，也不要求产生新的 Renderer Control authority revision。

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

但 Host / Platform binding MUST 在安装 carrier 为 current 前确保它绑定到：

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

一个 current Data Connection MAY 同时承载：

```text
0..N Frame/Input Context
0..N Render Context
```

它不是 per-Frame / per-Activation / per-Render connection。

## 10. Lifecycle

Connection Core v1 只定义两个逻辑 lifecycle 状态：

```text
current
retired
```

转换只有：

```text
current → retired
```

`retired` terminal；同一 carrier instance 永远不能重新成为 current。

以下词只描述 retire reason，不是独立 lifecycle：

```text
lost
closed
superseded
revoked
session-ended
renderer-replaced
```

## 11. Current Gate

一条 carrier 只有同时满足以下条件才是 `current`：

```text
carrier establishment succeeded
bound Session is current
bound Renderer participant is current
bound subsystemKey matches target Runtime
bound generation == Main current DataAuthority generation
not retired
```

Transport 物理存在本身不产生 authority。

所有 child protocol MUST 只在 `current` carrier 上发送/接受普通业务消息。

## 12. Serialized Installation

Host / Platform adapter MUST 对 `(Session, Renderer participant, subsystemKey)` 的 current-carrier installation 串行化。

不得同时安装两条 current carrier。

同 generation replacement 必须按：

```text
old current
→ retire old
→ establish/install fresh carrier
→ fresh current
```

执行。

如果多个 establishment attempt 并发完成，adapter 必须选择至多一个成为 current；其余 MUST 直接 retired/released，而不能与 current 重叠。

Connection Core v1 不为此增加 `connectionInstanceId` 或 handshake。

## 13. Generation Replacement

Main authority 从 `G` 替换为 `G2 > G` 时，generation G 永久 stale。

Renderer观察到新 Authority Snapshot后 MUST：

```text
retire generation G current carrier
stop User Input application traffic on G
discard pending establishment material for G
only establish G2 through current Host/Platform binding
```

旧 generation 永远不能覆盖新 generation。

## 14. Authority Revocation

Renderer Control Snapshot 中某 `subsystemKey` 的 DataAuthority 消失时，对应 current carrier MUST 立即 retired。

Renderer MUST：

```text
stop ordinary User Input
stop treating carrier as current
close/release carrier
discard pending establishment material
```

Subsystem 与 Renderer都 MUST停止把该 retired carrier 用作 User Input / Render Update current carrier。

```text
Transport existence != Data authority
```

## 15. Renderer Participant Replacement / Control Loss

Renderer Control Connection 是当前 Renderer DataAuthority 的父级 authority。

以下任一事件发生：

```text
current Renderer Control lost
current Renderer participant replaced by a newer authenticated participant
Session changed
```

旧 Renderer participant 的全部 Data Connections MUST 立即 retired。

之后只能依据新的 current Renderer Control Snapshot 重新建立允许的 Data Connections。

旧 participant 的 carrier 不得因为仍物理可用而继续作为 current。

## 16. Data Connection Loss

current carrier 意外丢失时：

```text
current → retired
User Input application traffic stops
Render Update reception stops
```

Main DataAuthority MAY 继续有效。

如果同 generation 仍被授权，Host / Platform binding MAY 建立 fresh carrier，再安装为新的 current。

这属于 Data connection recovery，不是 Runtime / Frame recovery。

## 17. Runtime Failure Boundary

Subsystem Runtime terminal failure通常会导致 Main撤销对应 DataAuthority。

但反方向不成立：

```text
Data Connection failure ↛ Runtime failure
```

WebSocket/MessagePort loss、Renderer reload、carrier establishment failure、same-generation reconnect 本身 MUST NOT 导致 Runtime terminal failure或 Frame unwind。

Runtime failure只能由 Control / Supervisor authority决定。

## 18. Frame Independence

Connection v1 不拥有 Frame lifecycle、Stack、outcome、Activation、InputTarget、failedRuntimeKeys 或 unwind root。

因此：

```text
Frame suspend != Data Connection retire
Frame close != Data Connection retire
Activation replacement != generation replacement
Data reconnect != Frame authority recovery
```

Data reconnect不能恢复 revoked Activation、取消 Frame unwind 或证明 Frame RPC commit。

## 19. Render Independence

Connection retired MUST NOT imply Render destroy。

Renderer MAY 保留最后一个合法 presentation state；重新建立 connection 后由 Render Update Protocol 决定 snapshot/revision/state recovery。

## 20. User Input Independence

`current Data Connection` 只表示 carrier authority，不表示 ordinary input authority，也不表示任何 Input Channel当前 Effective。

普通 State/Event 仍必须满足 User Input v1 的：

```text
Main current InputTarget
current frameId + activationId
current Input Interest
Producer availability
```

因此以下状态合法：

```text
Data Connection = current
InputTarget = null
Interest = non-empty
```

此时普通 State/Event仍不得发送。

## 21. Child Protocol Boundary

第一阶段 current Data Connection 承载两个独立 child protocol：

```text
User Input v1
    Subsystem → Renderer
        Input Interest
    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
```

两者共享 carrier，但 MUST 独立定义 payload、sequence/order policy、backpressure、recovery 和 limits。

User Input 内部的反向 Interest是该 application domain 的 configuration/filtering state，不是 Connection Core method，也不是第三套 protocol。

Connection v1 不定义这些业务语义。

## 22. Carrier Requirements

Host / Platform binding 提供的 carrier MUST 至少具备：

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

具体 Data encoding / size / compression / queue policy 由 child protocol 或 Data Application Profile 冻结。

## 23. Explicit Non-Goals v1

v1 不定义：

```text
Connection application handshake
Connection JSON-RPC methods
heartbeat/liveness RPC
User Input payload / Interest schema details
Render Update payload
Render State
child-protocol sequence/backpressure
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

## 24. Minimum Conformance Scenarios

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

connection-current-with-null-inputtarget
connection-current-with-interest-but-no-inputtarget
frame-close-does-not-retire-healthy-data-connection
activation-change-does-not-replace-data-generation

user-input-bidirectional-domain-on-current-carrier
runtime-failure-revokes-data-authority
session-end-retires-all
platform-bindings-produce-equivalent-connection-identity
```

## 25. Final Invariants

1. Main 是 DataAuthority 唯一公共权威；
2. Data Connection identity = Session + current Renderer participant + subsystemKey + generation；
3. generation 是 authority epoch，不是 transport attempt；
4. lifecycle 只有 current / retired，retired terminal；
5. 每个 Subsystem 同时最多一个 current Data Connection；
6. current-carrier installation 必须 serialized；
7. 同 generation MAY 在旧 carrier retired 后重新建立；
8. generation replacement永久废弃旧 generation；
9. Renderer participant replacement / Control loss retire其全部 Data Connections；
10. Data Connection failure不等于 Runtime failure，也不触发 Frame unwind；
11. Data retire不等于 Render destroy；
12. current Data Connection不等于 InputTarget有效，也不等于 User Input Channel Effective；
13. Connection Core本身零 application methods；
14. Host/Platform establishment机制可不同，但建立后的 identity/lifecycle必须一致；
15. User Input 与 Render Update 是建立后的独立业务协议；User Input自身包含双向 Interest + input flow。

## 26. Summary

```text
Main publishes:
    DataAuthority(S, generation=7)

Host / Platform binding:
    establishes carrier bound to
    Session / current Renderer / S / generation 7

Connection Contract:
    installs at most one current carrier

Then:
    Subsystem ── Input Interest ──▶ Renderer
    Renderer  ── State/Event/Reset ▶ Subsystem
    Renderer  ◀─ Render Update ──── Subsystem

Carrier lost:
    current → retired

if generation 7 remains authorized:
    fresh carrier may become current

Main replaces authority:
    generation 8
    → generation 7 permanently stale
    → old carrier retired
```

最终原则：

> **Connection v1 不需要“说话”；它只定义哪一条 Data 管道此刻有资格作为 current。**
