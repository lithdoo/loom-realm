# ADR 0024: Renderer ⇄ Subsystem Data Connection v1 semantic closure

> 状态：Accepted  
> 日期：2026-08-21  
> 决策范围：Renderer ⇄ Subsystem Data Connection v1 authority / installation / lifecycle / recovery boundary

## Context

Renderer ⇄ Subsystem Data Connection v1 已经明确了 Main-owned `DataAuthority {subsystemKey,generation,dataProfile}`、per-Subsystem single-current cardinality、same-generation reconnect、`current → retired` 与 Data failure != Runtime failure。

冻结前仍有若干会导致跨实现 observable divergence 的 race：

```text
physical candidate 在何时成为 current
Renderer/Subsystem 两端是否允许单端先 current
provisioning 中 authority 被替换时如何处理
old/new carrier cutover是否允许重叠
old carrier queued/in-flight traffic是否迁移/replay
单向 transport failure是否形成 half-current
Runtime instance replacement是否允许复用旧 generation
```

如果通过 `data.hello/data.ready/data.resume` 解决这些问题，会把 Platform provisioning responsibility错误提升成 application protocol，并重复 Main authority。

## Decision

### 1. Keep Connection v1 zero-message

Connection v1 继续定义 zero application messages / handshake / heartbeat / ACK。

physical readiness、peer binding 与 paired install属于 Platform DataConnectionBroker realization。

### 2. Separate three lifetimes

```text
DataAuthority epoch
!= Platform carrier attempt/candidate
!= current Data Connection instance
```

candidate 在 installation commit 前位于 Connection Core之外，不承载 current child traffic。

### 3. Paired installation

一个 Data Connection 是 Renderer endpoint + Subsystem endpoint 的 logical paired installation。

child traffic可见前，Platform必须确认两端都 prepared 且绑定同一个 current Session / Renderer participant / target Runtime / S/G/P。

### 4. Commit-time authority revalidation

candidate 在 installation commit 时必须重新验证 current Main DataAuthority，而不是只在 provisioning start 时验证。

stale candidate成功建立 physical carrier也不得成为 current。

### 5. Single-current cutover

每个 `(Session,current Renderer,subsystemKey)` 只有 0..1 current。

candidate可并行 physical prepare，但 installation/retirement serialized；cutover不得出现 old/new 同时 current。

### 6. Minimal Core lifecycle

Connection Core继续只有：

```text
current → retired
```

`connecting/ready/reconnecting/half-open` 不进入 Core。

任何方向 terminal unusable都 retire whole Connection；v1无 half-current。

### 7. Same-generation reconnect stays transport recovery

同 `S/G/P` 可依次存在多个 fresh Connection instances。

fresh carrier重新建立 child publication baseline；不 replay old emitted traffic、不迁移 old unsent traffic。

### 8. Generation closes authority epochs

`generation` strictly increasing, non-contiguous allowed, never reuse/wrap。

same Session/subsystemKey 下 fresh Runtime instance 必须使用高于历史值的 fresh generation；不增加 `runtimeInstanceId` 到 Connection wire identity。

### 9. Unified retirement semantics

loss、revocation、supersede、Renderer/Session/Runtime replacement、child Data-fatal error最终都产生同一个 protocol effect：`retired`。

first terminal cause可用于 diagnostics，但不改变 recovery model。

## Consequences

优点：

```text
Connection Core state machine保持极小
Main authority与Platform provisioning不重复
Hostra WebSocket / PWA MessagePort可共享同一 abstract trace
all race resolution集中在 installation boundary
child protocols只需要 fresh-carrier baseline
```

代价：

```text
Platform Broker必须实现可靠 paired endpoint readiness
必须在 commit point重新验证 authority
role bindings不得过早暴露 candidate为 current
```

这些代价属于 Platform composition，本来就不能通过 application payload安全替代。

## Rejected alternatives

### Add `data.hello/data.ready`

Rejected：重复 Platform binding/authentication，扩大 application protocol surface，并不能替代 Main authority revalidation。

### Add connection revision / resume token

Rejected：same-generation reconnect只需要 fresh child baseline；没有需要恢复的 Connection application state。

### Add `connecting/reconnecting` Core states

Rejected：这些是 Platform attempt state，不是跨实现 application-observable Connection semantics。

### Add `runtimeInstanceId`

Rejected：fresh generation已提供 Data authority epoch separation；增加字段会重复 identity。

## Compatibility boundary

冻结后，改变以下任一语义需要新的 Connection version或新的 Data Profile combination：

```text
identity/current gate
candidate/current boundary
paired install
commit-time revalidation
single-current cutover
current→retired lifecycle
same-generation reconnect
in-flight migration/replay rules
generation semantics
zero-message rule
failure/retirement boundary
```