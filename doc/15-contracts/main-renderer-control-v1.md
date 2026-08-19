# Main ⇄ Renderer Control Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.renderer-control`  
> 稳定程度：Evolving  
> 主要定义：Main 向 Renderer 复制 committed Runtime / Frame / Activation / InputTarget / DataAuthority 的只读控制状态  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[通信系统](../10-architecture/communication-system.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 后续依赖：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)、[User Input Protocol v1](./user-input-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 是 Runtime / Frame / Activation / InputTarget / DataAuthority 的唯一公共 authority；Renderer Control v1 只复制 Main 已提交的逻辑 authority。Input Interest 由 Subsystem 通过独立 Data Plane 发布，不进入本协议。**

---

## 1. Scope

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
version negotiation
Runtime state projection
live Frame Stack projection
current Activation projection
current InputTarget publication
logical DataAuthority publication
Session-local Authority Revision
full Authority Snapshot
reconnect/reload recovery
bounded latest-state publication
validation / limits / fail-closed
```

本协议不负责：

```text
Subsystem Runtime bootstrap/shutdown
Frame RPC / failure unwind execution
Renderer⇄Subsystem Data establishment details
Data bearer credential
User Input payload / Frame Input Interest Registry
Render Update / Render State
Content API
business state
DOM / Canvas / WebGL state
```

Renderer MUST NOT 通过本协议改变 Main authority。

## 2. Authority Model

Main 唯一拥有：

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
根据 Data Connection状态恢复Frame authority
根据 Render focus生成InputTarget
根据 Input Interest生成InputTarget
```

## 3. Frame / Call Causal Barrier

Renderer Control MUST服从 Frozen Frame / Call v1 ordering：

```text
frame.activate ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget

frame.resume ACK
→ Main commit active/fresh Activation
→ Renderer may publish corresponding InputTarget
```

Main MUST NOT 在对应 ACK 前发布新 ordinary InputTarget。

Activation 一旦 revoked，后续 Snapshot MUST NOT 再将其作为 current Activation / InputTarget。

`InputTarget=null` 是合法 committed authority，可出现在 initial/call/return/recovery/empty-stack gap，也可表示 active Frame 当前没有 ordinary input authority。

### 3.1 InputTarget One-Shot Lease

一个已经发布过的：

```text
InputTarget(frameId, activationId)
```

一旦被撤销、移除或替换，同一 `frameId + activationId` MUST NOT 再成为 InputTarget。

未来重新授予 ordinary input authority必须使用 fresh authority epoch，通常即 fresh `activationId`。

v1 不定义独立 `inputEpoch` / `inputLeaseId`。

## 4. Connection Ownership / Bootstrap Token

一个 Session v1 同时最多一个 current Renderer Control Connection。

一次 Connection Attempt 使用：

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

Renderer reload/reconnect MUST取得 fresh token；不得复用旧 token。

新 hello成功后该 Connection成为 current；Main MUST关闭或永久停止向旧 Connection publication。

Host如何交付 token 属于 Host Bootstrap Profile，不属于本协议 wire。

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
one complete text message = one JSON-RPC message
binary forbidden
```

PWA Profile：

```text
one postMessage plain JSON-compatible object
= one JSON-RPC message
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

`protocolVersions`：1..16 positive integer entries，no duplicate。

只协商 `loomrealm.renderer-control`；v1选择最高共同版本中的 `1`。

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

新 `sessionId` 表示新 authority universe。Renderer MUST丢弃旧 Session 的 Runtime mirror、Frame mirror、Activation/InputTarget 与 DataAuthority。

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

Revision 是 committed authority version，不是 event sequence / replay cursor。

Main MAY跳过未发送的中间 revisions；Renderer MUST接受 revision jump。

## 9. Full Snapshot Model

v1不定义 delta / patch。

每次：

```text
renderer.hello Result
renderer.state Notification
```

都携带完整自包含 Authority Snapshot。

Renderer验证成功后 MUST原子替换旧 Control Store，不得逐字段暴露半更新状态。

Reconnect不重放历史，只取得 Main current Snapshot。

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

这是 Main-observed projection；Renderer不得从 Runtime state自行修改 Stack。

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

`stack` 顺序：bottom → top，只包含 Main live Frames；`closed` 不进入 Snapshot。

约束：

```text
frameId unique
all subsystemKey refer to runtimes
at most one active Frame
active Frame if present = Stack Top
active Frame requires activationId
non-active Frame MUST NOT contain activationId
```

Renderer MAY观察 Frame 当前事实，但 User Input decisions MUST NOT 推导或依赖：

```text
push / pop
call / return
caller / child
failure unwind root
resume reason
```

## 13. InputTarget

```ts
interface RendererInputTargetV1 {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}
```

Snapshot 中：

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

## 14. Logical DataAuthority

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly connectionProfile: string;
}
```

含义：Main当前允许本 Renderer Session 为该 Subsystem 建立并持有该 generation 的 Data Connection。

它不表示：

```text
Data Connection已建立
endpoint已知
credential已取得
Subsystem有Render
Subsystem有active Frame
InputTarget指向该Subsystem
Frame Interest已发布
```

## 15. Data Generation

`generation`：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused
```

同一 Snapshot 中一个 `subsystemKey` 最多一个 DataAuthority。

## 16. Data Bootstrap Boundary

Authority Snapshot MUST NOT包含：

```text
WebSocket URL
MessagePort
bearer token
connection nonce
transport-specific locator
```

Renderer⇄Subsystem Data Connection Contract负责 establishment / replacement / retirement identity semantics；Desktop/PWA可采用不同 Host binding。

## 17. DataAuthority Revocation

某 `subsystemKey` 的 DataAuthority 消失或 generation改变时，Renderer MUST按 Data Connection Contract立即停止使用旧 generation，并关闭/替换旧 Data Connection。

旧 generation不得重新成为 current authority。

## 18. `renderer.hello` Success

```ts
interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

Main必须：

```text
authenticate
→ select version
→ capture committed Snapshot revision R
→ mark Connection current
→ return hello Result(R)
```

所有 `revision > R` publication MUST在 hello Result之后发送。

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

Main MUST只发送 committed authority，不得发布 tentative call/return、predicted RPC success 或 uncommitted Activation。

已 commit 的 transaction中间状态 MAY发布，例如：

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

同一 current Connection 若 `new.revision <= appliedRevision`，属于 Protocol Error；Renderer MUST fail closed。

## 21. Publication Coalescing

Main MAY合并未发送的中间 Snapshots，只保留最新 committed Snapshot。

例如：

```text
30 A/InputTarget
31 null
32 transitional
33 B/InputTarget

Renderer may receive 30 → 33
```

因此任何 InputTarget identity变化 MUST被 User Input实现视为旧 target Input State的终止边界；不得依赖一定观察到显式 `null` revision。

同一 `frameId + activationId` revoke→regrant 非法，见 §3.1。

## 22. Backpressure

Full Snapshot publication MUST bounded。

Main SHOULD维持：

```text
0..1 in-flight write
+
at most one replaceable latest unsent Snapshot
```

持续无法 drain 时 Host MUST在有限 policy/watchdog 下关闭 Control Connection；恢复统一 fresh hello + current Snapshot。

## 23. Snapshot Representability / Topology Limits

任何合法 v1 authority state MUST可由一条合法 full Snapshot表示。

Phase-1 limits：

```text
max Runtime entries          256
max live Frame Stack entries 64
max DataAuthority entries    256
```

Main/Game Bootstrap MUST在可能超出这些 limits 前拒绝进入 Renderer Control v1 Session。

## 24. Control Connection Loss

Renderer Control Connection 丢失后 Renderer不再拥有可证明的 current Main authority。

Renderer MUST立即：

```text
InputTarget := null locally
stop ordinary User Input
invalidate all DataAuthority
close all Renderer⇄Subsystem Data Connections
```

Renderer MUST NOT继续使用 cached old Activation / generation。

Render presentation MAY暂时保留最后合法 Render Store；恢复由 Render协议独立完成。

恢复：

```text
fresh control token
→ new Connection
→ renderer.hello
→ current full Snapshot
→ replace Control Store
→ establish current Data Connections
```

## 25. Renderer Reload

Reload与 Control loss使用同一模型；不定义 historical revision replay、old Activation replay、Frame RPC replay 或 failure unwind replay。

## 26. Runtime Failure Visibility

Runtime failure unwind authority只在 Main。

Renderer可以观察最终 committed facts，但不得自行计算 failedRuntimeKeys、lowest root、whole suffix 或 fixed-point expansion。

## 27. Render Independence

Snapshot MUST NOT包含 Render Registry / Domain State / Render revision / DOM/Canvas/WebGL state。

```text
Frame removed != Render removed
Data Connection closed != Render authority destroyed
```

## 28. User Input Composition

User Input Protocol MUST以 current Snapshot `InputTarget` 为 ordinary input sender-side authority，并与 Subsystem-owned **Frame Input Interest Registry**、Renderer Producer availability 做交集。

概念 gate：

```text
raw/custom producer fact
→ current InputTarget == (S,F,A)?
→ matching current Data Connection for S?
→ mirrored F active with A?
→ C ∈ Interest[F]?
→ Producer(C) available?
→ send Input(F,A,C)
```

其中：

```text
InputTarget        = Main-owned authority
Interest[F]        = Subsystem-owned configuration
Producer(C)        = Renderer-local availability
```

Renderer MUST NOT因为 Interest 存在而创建 / 扩大 InputTarget。

Subsystem 会重新验证 local Frame / Activation / Interest；User Input wire本身不提供 Main-signed InputTarget proof。

### 28.1 No Interest in Control Snapshot

Renderer Authority Snapshot MUST NOT包含：

```text
Input Interest
Frame Interest Registry
Input subscription
Producer availability
```

Main不是这些状态的 authority，也不充当 Subsystem→Renderer Interest relay。

### 28.2 Cross-Plane Ordering

Renderer Control Connection 与 Renderer⇄Subsystem Data Connection 独立，不存在跨连接 total order。

以下都 MUST合法：

```text
Interest[F] arrives before Control knows F
Control/InputTarget F/A arrives before Interest[F]
```

规则固定：

```text
Interest without authority → inert
Authority without Interest → no ordinary input
both present               → recompute Effective
```

不得增加 cross-plane ACK、revision join、barrier 或 handshake。

Renderer MUST在 Control Snapshot 或 Interest Registry 任一变化后重新计算 User Input Effective set。

### 28.3 No Push/Pop Interpretation

Renderer/User Input implementation MUST NOT以 push/pop/call/return/unwind 作为输入切换条件。

新 Frame 通常等待自己的 Interest；旧 caller 以 fresh Activation resume 时可立即复用该 Frame 仍存在的 Interest。这是 current facts 的交集结果，不是 Stack transition special case。

### 28.4 Activation Boundary

InputTarget identity变化 MUST终止旧 target Input State；旧 State/Event不得迁移/重放到 fresh Activation。

Frame Interest MAY跨 suspension/fresh Activation继续存在，具体规则由 User Input v1 定义。

## 29. Ordering

同一 Renderer Control Connection：

```text
hello Result
before
all renderer.state Notifications
```

emitted `renderer.state` revision严格递增。

Transport MUST保持 per-direction application message order，不得 duplicate/retry/replay。

本节 ordering 不建立 Renderer Control 与任意 Data Connection 之间的 total order。

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

恢复只有：new connection → hello → current full Snapshot。

## 31. JSON Model / Closed Schema

允许 plain JSON-compatible：null / boolean / string / finite number / array / object。

禁止：undefined、NaN/Infinity、BigInt、Function/Symbol、ArrayBuffer/Blob/MessagePort、Host object、invalid Unicode scalar sequence、duplicate JSON object member。

整数语义字段必须 safe integer；所有 v1 wire object closed schema，未知字段 MUST rejected。

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

Desktop receiver对完整 WebSocket text UTF-8 bytes执行 `<=1 MiB` hard cap；PWA object按 Reference Compact JSON UTF-8 equivalent计算 whole-message size。

## 33. Request ID

只有 `renderer.hello` 使用 Request ID：positive safe integer，Connection-lifetime sender-side never reused；不得 null/string/zero/negative/fractional。

## 34. Error Model

标准 JSON-RPC：`-32700 / -32600 / -32601 / -32602`。

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

Renderer发现 invalid JSON-RPC/schema、invalid session/revision、revision regression/duplicate、invalid Stack、invalid Activation/InputTarget relation、invalid/duplicate DataAuthority 或 oversize message 时 MUST：

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
- Snapshot不携 Data bearer credentials 或物理 filesystem path；
- Runtime business state不进入 Control Snapshot；
- Renderer Core是 ordinary User Input `InputTarget` 的 trusted sender-side enforcement point；
- Input Interest 不是 credential / authority；
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
inputtarget-revoked-same-activation-never-regrant
coalescing-cannot-hide-same-lease-regrant

runtime-failure-main-only-unwind
recovery-final-resume-publication

data-generation-replacement
data-authority-has-no-endpoint-or-token
control-loss-revokes-all-data-authority
control-loss-closes-data-connections

interest-not-in-control-snapshot
interest-first-authority-later-allowed
authority-first-interest-later-allowed
control-data-no-total-order
renderer-does-not-interpret-push-pop
interest-alone-cannot-create-inputtarget

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
Data connection credential/handshake
Render State
User Input payload / Frame Interest wire
Main-signed input capability
Content Grant
telemetry/diagnostic stream
heartbeat
```

## 39. Wire Surface Summary

| Method | 类型 | 方向 | 职责 |
|---|---|---|---|
| `renderer.hello` | Request | Renderer → Main | one-shot auth、version negotiation、initial full Snapshot |
| `renderer.state` | Notification | Main → Renderer | current complete committed Authority Snapshot |

v1只有这两个 application methods。

## 40. Final Invariants

1. Main是唯一 Control authority；
2. Renderer是 read-only committed mirror；
3. full Snapshot自包含、原子替换；
4. revision严格单调但允许 publication gap；
5. reconnect只取 current Snapshot，不 replay；
6. ACK-before-InputTarget publication；
7. revoked Activation never reappears；
8. `InputTarget=null`合法；
9. 已发布 InputTarget lease一旦撤销，同一 `frameId + activationId` 不得 re-grant；
10. DataAuthority只有 `subsystemKey + generation + connectionProfile`；
11. endpoint/token/Port不进入 Authority Snapshot；
12. Control loss立即撤销 ordinary input和全部 DataAuthority，并关闭 Data Connections；
13. InputTarget replacement终止旧 User Input State；
14. Input Interest 不进入 Control Snapshot，Main不转发 Interest；
15. Control/Data 无跨连接 total order，Interest-first / Authority-first 均安全；
16. Renderer不解释 push/pop/call/return来决定 ordinary input；
17. bounded latest-state coalescing，无历史 Snapshot无界排队；
18. topology有界，任何合法 authority state均可单条 full Snapshot恢复；
19. Render lifecycle/revision独立；
20. Renderer Core执行 sender-side Main Authority × Frame Interest × Producer gate；
21. Renderer不参与 Frame failure unwind。
