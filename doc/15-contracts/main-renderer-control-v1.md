# Main ⇄ Renderer Control Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.renderer-control`  
> 稳定程度：Evolving  
> 主要定义：Main 向 Renderer 复制 committed Runtime / Frame / Activation / InputTarget / Data Authority 的只读控制状态  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[通信系统](../10-architecture/communication-system.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 后续依赖：Renderer ⇄ Subsystem Connection Protocol、User Input Protocol  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 是 Runtime / Frame / Activation / InputTarget / Data Connection authority；Renderer Control v1 只复制 Main 已提交的逻辑 authority，不携带 Render State，也不承担 Data Transport bootstrap。**

---

## 1. 适用范围

```text
LoomRealm Main
      ⇅
Renderer Control Connection
      ⇅
Web Renderer
```

本协议负责：

```text
Renderer Control bootstrap/authentication
Renderer Control version negotiation
Runtime state projection
live Frame Stack projection
current Activation projection
current InputTarget publication
logical DataAuthority publication
Session-local Authority Revision
full Authority Snapshot
reconnect/reload recovery
bounded publication coalescing
validation / limits / fail-closed behavior
```

本协议不负责：

```text
Subsystem Runtime bootstrap/shutdown
Frame RPC
Frame failure unwind
Renderer⇄Subsystem Data endpoint/MessagePort discovery
Data bearer credential
Data Connection handshake
User Input payload
Render Update / Render State
Content API / Content Grant
business state
DOM / Canvas / WebGL state
```

Renderer MUST NOT 通过本协议改变 Main authority。

## 2. Authority Model

Main 是以下公共状态的唯一 authority：

```text
Runtime observed state
live Frame Stack
Frame lifecycle
current Activation
InputTarget
DataAuthority generation
Authority Revision
```

Renderer 是 read-only committed mirror。

Renderer MUST NOT：

```text
创建 frameId / activationId
恢复 revoked Activation
改变 Stack / Frame lifecycle
推导 failure unwind root
根据 failed subsystemKey自行修改Stack
根据 Data Connection状态恢复Frame authority
根据 Render focus生成InputTarget
```

## 3. Frame / Call Causal Barrier

Renderer Control MUST服从 Frame / Call v1 已冻结 ordering。

```text
frame.activate ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget

frame.resume ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget
```

Main MUST NOT 在对应 ACK 前发布新 ordinary InputTarget。

Activation 一旦 revoked，任何后续 Snapshot都 MUST NOT再将其作为 current Activation/InputTarget。

`InputTarget=null` 是合法 committed authority，可出现在 initial/call/return/recovery/empty-stack gap。

## 4. Connection Ownership

一个 Session v1 同时最多一个 current Renderer Control Connection。

Renderer Control credential由 Host/Renderer bootstrap path为**一次 Connection Attempt**提供：

```text
rendererControlToken
```

要求：

```text
opaque
high entropy
one successful hello consumption only
bound to current LoomRealm Session
1..4096 UTF-8 bytes
not logged / not placed in URL
```

Renderer reload/reconnect MUST获取新的 Connection Attempt token；不得复用旧 token。

新 hello成功后，该 Connection成为 current。Main MUST关闭或永久停止向旧 Connection publication。

Host如何把一次性 token交给Renderer属于 Host Bootstrap Profile，不属于本协议 wire。

## 5. Transport Mapping

Application model：

```text
JSON-RPC 2.0
plain JSON-compatible values
one transport application unit = one JSON-RPC message
JSON-RPC Batch forbidden
```

Desktop Profile：

```text
localhost WebSocket
one complete text message = one JSON-RPC application message
binary message forbidden
```

PWA Profile：在安全 Control MessagePort建立后：

```text
one postMessage plain JSON-compatible object
= one JSON-RPC application message
```

不得依赖 Transferable / ArrayBuffer / Blob / BigInt / Host object。

## 6. `renderer.hello`

第一条 LoomRealm application message MUST 是：

```text
renderer.hello
```

```text
Method:    renderer.hello
Type:      JSON-RPC Request
Direction: Renderer → Main
```

```ts
interface RendererHelloParamsV1 {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}
```

`protocolVersions`：

```text
1..16 positive integer entries
no duplicate
```

只协商 `loomrealm.renderer-control`。

Main选择双方交集中最高版本；v1选择 `1`。

认证/版本失败后 Main MUST返回 Error并关闭 Connection。

## 7. Session Identity

Main为每个 LoomRealm Session生成：

```text
sessionId
```

要求：

```text
opaque
1..128 UTF-8 bytes
Session lifetime unique
never reused
```

新 `sessionId` 表示新 authority universe。

Renderer MUST丢弃旧 Session 的：

```text
Runtime mirror
Frame mirror
Activation/InputTarget
DataAuthority
```

Render recovery由 Render Protocol独立决定。

## 8. Authority Revision

```ts
type AuthorityRevision = number;
```

要求：

```text
positive safe integer
1..2^53-1
Session-local
strictly increasing on Renderer-visible committed authority change
never reused / never wrap
```

Revision 是 committed authority version，不是 event sequence，也不是 replay cursor。

Main MAY不发布每一个 committed revision。

例如：

```text
41 → 42 → 43 committed
```

可以只向Renderer发布 `43`。

Renderer MUST接受 revision jump。

## 9. Full Snapshot Model

v1不定义 delta / patch。

每次：

```text
renderer.hello Result
renderer.state Notification
```

都携带完整自包含 Authority Snapshot。

Renderer成功验证后 MUST原子替换旧 Control State Store，不得逐字段暴露半更新状态。

连接恢复不重放历史；只重新取得 Main当前 Snapshot。

## 10. Snapshot Schema

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

Snapshot MUST完全自包含。

## 11. Runtime Projection

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

这是 Main-observed state projection。

Renderer不得从 Runtime state自行推导 Frame Stack mutation。

## 12. Frame Stack Projection

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

`stack` 顺序固定：

```text
bottom → top
```

只包含 Main live Frames；`closed` Frame不进入 Snapshot。

约束：

```text
frameId unique
all subsystemKey refer to runtimes
at most one active Frame
active Frame if present = Stack Top
active Frame requires activationId
non-active Frame MUST NOT contain activationId
```

## 13. InputTarget

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
OR exactly one target
```

非空 target MUST精确引用：

```text
existing Stack Frame
same subsystemKey
lifecycle = active
same current activationId
```

`active Frame + InputTarget=null` 合法；Renderer不得自行构造 target。

## 14. Logical Data Authority

Renderer Control只发布逻辑 Data authority：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly connectionProfile: string;
}
```

含义：

> Main当前允许本 Renderer Session建立并持有该 Subsystem `generation` 的 Data Connection。

它不表示：

```text
Data Connection已建立
endpoint已知
credential已取得
Subsystem有Render
Subsystem有active Frame
InputTarget指向该Subsystem
```

## 15. Data Generation

`generation`：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused
```

例如：

```text
loom.map generation=4
→ authority revoked
→ future authority generation=5
```

不得重新使用 4。

同一 Snapshot中一个 `subsystemKey` 最多一个 DataAuthority。

## 16. Data Bootstrap Boundary

Authority Snapshot MUST NOT包含：

```text
WebSocket URL
MessagePort
bearer token
connection nonce
transport-specific locator
```

Renderer⇄Subsystem Connection Protocol/Profile负责：

```text
如何取得 endpoint/Port
如何证明 matching generation authority
如何建立/替换/关闭 connection
如何处理 authentication failure
```

Desktop/PWA可以采用不同 bootstrap carrier，但建立后的 `subsystemKey + generation` authority语义必须一致。

## 17. Data Authority Revocation

当 Main撤销 Data authority时，后续 committed Snapshot不再包含该 generation，或包含更高 generation。

Renderer观察到：

```text
authority disappears
OR generation changes
```

MUST停止使用旧 generation，并按 Connection Protocol关闭/替换旧 Data Connection。

旧 generation不得重新建立。

## 18. `renderer.hello` Success

```ts
interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

Main必须建立 atomic baseline：

```text
authenticate
→ select version
→ capture committed Snapshot revision R
→ mark this Connection current
→ return hello Result(R)
```

任何 `revision > R` publication MUST在 hello Result之后发送。

## 19. `renderer.state`

```text
Method:    renderer.state
Type:      JSON-RPC Notification
Direction: Main → Renderer
```

```ts
interface RendererStateParamsV1 {
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

Main MUST只发送 committed authority。

不得发布：

```text
tentative call/return
predicted RPC success
uncommitted Activation
cached Renderer-local state
```

已经 commit 的 transaction中间状态 MAY发布，例如：

```text
Caller suspended
Child starting
InputTarget=null
```

## 20. Renderer Application Rules

Renderer维护：

```text
currentSessionId
appliedRevision
currentSnapshot
```

相同 Session：

```text
new.revision > appliedRevision
    → validate + atomic replace
```

revision gap允许。

同一 current Connection若：

```text
new.revision <= appliedRevision
```

属于 Protocol Error；Renderer MUST fail closed。

Main MUST NOT重复发送同 revision。

## 21. Publication Coalescing

Main MAY合并未发送的中间 snapshots，只保留最新 committed Snapshot。

允许：

```text
revision 30 A/InputTarget
revision 31 null
revision 32 transitional
revision 33 B/InputTarget

Renderer receives 30 → 33
```

因此 Renderer/User Input实现 MUST把任何 InputTarget identity变化视为旧 Activation continuous-input intent的终止边界；不依赖一定观察到显式 `null` revision。

该规则不改变 Frame v1 stale Activation rejection。

## 22. Backpressure

Full Snapshot publication MUST使用 bounded queue。

Main SHOULD维持：

```text
0..1 in-flight transport write
+
at most one replaceable latest unsent Snapshot
```

如果新 revision产生时存在尚未发送的旧 unsent Snapshot，Main MAY用最新 Snapshot替换它。

Main MUST NOT为每个历史 revision无界排队完整 Snapshot。

如果 Renderer持续无法 drain，Host MUST在有限 watchdog/policy下关闭 Renderer Control Connection；恢复统一通过 fresh hello + current full Snapshot。

具体 watchdog时间属于 Host policy，不进入 wire。

## 23. Snapshot Representability / Topology Limits

因为 v1恢复只依赖单条 full Snapshot，任何合法 v1 authority state MUST可编码进合法 message。

v1 Phase-1 limits：

```text
max Runtime entries          256
max live Frame Stack entries 64
max DataAuthority entries    256
```

Main/Game Bootstrap MUST在可能超过这些 Profile limits前拒绝进入 Renderer Control v1 Session，而不能产生无法snapshot的合法 authority state。

这些是 Renderer Control v1 deployment/profile限制，不修改 Game Package v2通用 descriptor schema 或 Frame / Call v1 wire。

## 24. Control Connection Loss

Renderer Control Connection一旦丢失，Renderer不再拥有可证明的 current Main authority。

Renderer MUST立即：

```text
InputTarget := null locally
stop ordinary User Input
invalidate all DataAuthority
close all Renderer⇄Subsystem Data Connections
```

Renderer MUST NOT继续使用 cached old Activation或旧 generation。

Render presentation MAY暂时保留最后合法 Render Store，但 Render恢复必须由独立 Render Protocol完成。

恢复：

```text
obtain fresh Renderer Control bootstrap token
→ new Connection
→ renderer.hello
→ current full Snapshot
→ atomically replace Control Store
→ re-establish Data Connections for current generations
→ Render recovery independently
```

## 25. Renderer Reload

Reload与 Control loss使用同一模型。

不定义：

```text
historical revision replay
old Activation replay
Frame RPC replay
failure unwind replay
```

## 26. Runtime Failure Visibility

Runtime failure recovery authority只在 Main。

Renderer可以观察：

```text
Runtime failed
InputTarget=null
Stack suffix shrink
final fresh Caller Activation
```

但不得自行计算：

```text
failedRuntimeKeys
lowest root
whole suffix
fixed-point expansion
```

Main MAY coalesce recovery中间 revisions，只要任何已发布 Snapshot都是真实 committed state。

## 27. Render Independence

Snapshot MUST NOT包含：

```text
Render Registry
renderId
Render State
Render revision
DOM/Canvas/WebGL state
```

Renderer Control revision和Render revision完全独立。

```text
Frame removed != Render removed
Data Connection closed != Render authority destroyed
```

## 28. User Input Dependency

未来 User Input Protocol MUST以当前 Snapshot `InputTarget` 为普通输入 authority。

```text
raw input
→ read current InputTarget
→ null: do not send
→ non-null: verify active/current Activation
→ require matching current Data generation connection
→ send User Input(frameId, activationId,...)
```

InputTarget identity变化 MUST终止旧 Activation的持续输入意图；旧输入不得自动迁移/重放到新 Activation。

## 29. Ordering

同一 Renderer Control Connection：

```text
hello Result
before
all renderer.state Notifications
```

并且 emitted `renderer.state` revision严格递增。

Transport MUST保持 per-direction application message order，不得 duplicate/retry/replay。

## 30. Retry / Replay

v1无：

```text
renderer.state ACK
state mutation request
revision replay
resync request
subscribe-from-revision
JSON patch
```

恢复只有：

```text
new connection → hello → current full Snapshot
```

## 31. JSON Model / Closed Schema

允许：

```text
null / boolean / string / finite number / array / object
```

禁止：

```text
undefined
NaN / ±Infinity
BigInt
Function / Symbol
ArrayBuffer / Blob / MessagePort
Host object
invalid Unicode scalar sequence
duplicate JSON object member
```

整数语义字段必须是 safe integer。

所有 v1 wire object是 closed schema；未知字段 MUST rejected。

## 32. Limits

```text
max application message          1 MiB
max JSON nesting depth           64
max array/object members         16,384

sessionId                        1..128 UTF-8 bytes
subsystemKey                     1..256 UTF-8 bytes
frameId                          1..128 UTF-8 bytes
activationId                     1..128 UTF-8 bytes
rendererControlToken             1..4096 UTF-8 bytes
connectionProfile                1..256 ASCII bytes
Authority Revision               1..2^53-1
Data generation                  1..2^53-1
protocolVersions entries         1..16
```

Desktop receiver同时对实际完整 WebSocket text UTF-8 bytes执行 `<=1 MiB` hard cap。

PWA object按 Reference Compact JSON UTF-8 equivalent计算 whole-message size。

使用本协议的 deployment MUST保证 projected `descriptor.key` 可表示为 `subsystemKey` (`1..256 UTF-8 bytes`)。

## 33. Request ID

只有 `renderer.hello` 使用 Request ID。

```text
positive safe integer
Connection-lifetime sender-side never reused
```

不得使用 null/string/zero/negative/fractional ID。

## 34. Error Model

标准 JSON-RPC：

```text
-32700 / -32600 / -32601 / -32602
```

semantic：

```text
error.code = -32000
error.data.code = stable machine code
```

v1：

```text
RENDERER_AUTHENTICATION_FAILED
RENDERER_CONTROL_PROTOCOL_UNSUPPORTED
PROTOCOL_STATE_ERROR
```

authentication error不得区分 unknown/expired/wrong/consumed token。

## 35. Fail-Closed Validation

Renderer发现以下任一问题：

```text
invalid JSON-RPC/schema
invalid session/revision
revision regression/duplicate
invalid Stack
invalid Activation/InputTarget relation
invalid/duplicate DataAuthority
oversize message
```

MUST：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
close all Data Connections
close Control Connection
```

Renderer不得局部修复 Snapshot或继续使用最后一次 control authority。

## 36. Security

- Renderer Control bootstrap token按 secret处理；
- token一次成功 hello即 consumed；
- Snapshot不携带 Data bearer credentials；
- Snapshot不携带物理 filesystem path；
- Runtime business state不进入 Control Snapshot；
- Connection/Data bootstrap secrets属于其独立 Profile；
- Host应限制 Control carrier在认可的本地/受控 boundary。

## 37. Minimum Conformance

至少覆盖：

```text
hello-first-message
hello-auth-success
hello-token-one-shot
hello-auth-failure
unsupported-version

empty-stack-snapshot
active-frame-snapshot
revision-monotonic
revision-gap-accepted
revision-regression-rejected
atomic-snapshot-replace

call-null-gap
activate-ack-before-target
return-null-gap
resume-fresh-activation
revoked-activation-never-reappears
inputtarget-switch-implies-old-intent-reset

runtime-failure-main-only-unwind
recovery-final-resume-publication

data-generation-replacement
data-authority-has-no-endpoint-or-token
control-loss-revokes-all-data-authority
control-loss-closes-data-connections

bounded-latest-snapshot-coalescing
slow-renderer-no-unbounded-history
snapshot-within-topology-limits
oversize-message-rejected

desktop-websocket-order
pwa-messageport-equivalent-authority
```

## 38. Explicit Non-goals

v1不定义：

```text
delta / JSON Patch
revision ACK/replay
multiple active Renderer participants
Renderer leader election
Frame RPC proxy/cancel
Runtime recovery commands
Data endpoint discovery
Data connection credential
Data handshake
Render State
User Input payload
Content Grant
telemetry/diagnostic stream
heartbeat
```

## 39. Wire Surface Summary

| Method | 类型 | 方向 | 职责 |
|---|---|---|---|
| `renderer.hello` | Request | Renderer → Main | one-shot connection auth、version negotiation、initial full Snapshot |
| `renderer.state` | Notification | Main → Renderer | current complete committed Authority Snapshot |

v1只有这两个 application methods。

## 40. Final Invariants

1. Main是唯一 control authority；
2. Renderer是 read-only committed mirror；
3. full Snapshot自包含、原子替换；
4. revision严格单调但允许 publication gap；
5. reconnect只取 current Snapshot，不 replay；
6. ACK-before-InputTarget publication；
7. revoked Activation never reappears；
8. `InputTarget=null`合法；
9. DataAuthority只有 `subsystemKey + generation + connectionProfile`；
10. endpoint/token/Port不进入 Authority Snapshot；
11. Control loss立即撤销 ordinary input和全部 Data lease，并关闭 Data Connections；
12. InputTarget replacement本身终止旧 continuous-input intent；
13. bounded latest-state coalescing，无历史 Snapshot无界排队；
14. topology有界，任何合法 authority state均可单条 full Snapshot恢复；
15. Render lifecycle/revision独立；
16. Renderer不参与 Frame failure unwind。