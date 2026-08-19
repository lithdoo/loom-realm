# Main ⇄ Renderer Control Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.renderer-control`  
> 稳定程度：Evolving  
> 主要定义：Main 向 Renderer 复制 committed Runtime / Frame / Activation / InputTarget / DataAuthority 的只读控制状态  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[通信系统](../10-architecture/communication-system.md)、[Frame / Call v1](./frame-call-protocol-v1.md)  
> 后续依赖：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 是 Runtime / Frame / Activation / InputTarget / DataAuthority 的唯一公共 authority；Renderer Control v1 只复制 Main 已提交的逻辑 authority。DataAuthority 选择完整 Data Application Profile，但不携带任何物理 endpoint/credential。**

---

## 1. Scope

```text
LoomRealm Main
      ⇅
Renderer Control Connection
      ⇅
Web Renderer
```

负责：

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
Runtime observed state
live Frame Stack
Frame lifecycle
current Activation
InputTarget
DataAuthority generation/profile
Authority Revision
```

Renderer 只是 read-only committed mirror。

Renderer MUST NOT：

```text
创建 frameId / activationId
恢复 revoked Activation
改变 Stack / Frame lifecycle
推导 failure unwind root
根据 Data Connection恢复 Frame authority
根据 Render focus生成 InputTarget
根据 Input Interest生成 InputTarget
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

Activation 一旦 revoked，后续 Snapshot MUST NOT再将其作为 current Activation / InputTarget。

`InputTarget = null` 是合法 committed authority。

### 3.1 InputTarget One-Shot Lease

一个已经发布过的：

```text
InputTarget(frameId, activationId)
```

一旦撤销、移除或替换，同一 `frameId + activationId` MUST NOT再次成为 InputTarget。

未来重新授予 ordinary input authority必须使用 fresh authority epoch，当前即 fresh `activationId`。

---

## 4. Renderer Control Connection / Bootstrap

一个 Session 同时最多一个 current Renderer Control Connection。

一次 Connection Attempt 使用：

```text
rendererControlToken
```

要求：

```text
opaque
high entropy
one successful hello consumption only
bound to current Session
1..4096 UTF-8 bytes
not logged / not placed in URL
```

reload/reconnect 必须取得 fresh token。

新 hello 成功后该 Connection 成为 current；Main MUST停止向旧 Connection publication。

Platform 如何把 token / carrier 交给 Renderer 属于 Platform bootstrap realization，不属于本协议 wire。

---

## 5. Application Unit / Transport Mapping

统一 application model：

```text
JSON-RPC 2.0
plain JSON-compatible values
one carrier application unit
= one UTF-8 JSON text string
= one JSON-RPC message object
JSON-RPC Batch forbidden
```

Desktop WebSocket：

```text
one complete text message = one JSON text application unit
binary forbidden
```

PWA MessagePort：

```text
postMessage(string) = one JSON text application unit
```

Structured Clone / Transferable 只可用于 Platform bootstrap，不得扩大 Renderer Control application payload。

---

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

只协商 `loomrealm.renderer-control`；当前选择 `1`。

认证/版本失败后 Main MUST返回 Error并关闭 Connection。

---

## 7. Session Identity

Main 为每个 Session 生成 `sessionId`：

```text
opaque
1..128 UTF-8 bytes
Session lifetime unique
never reused
```

新 `sessionId` 表示新的 authority universe。Renderer MUST丢弃旧 Session 的所有 Runtime/Frame/Activation/InputTarget/DataAuthority mirror。

---

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

Revision 是 committed authority version，不是 event sequence/replay cursor。

Main MAY跳过未发送的中间 revisions；Renderer MUST接受 revision jump。

---

## 9. Full Snapshot Model

v1 不定义 delta/patch。

```text
renderer.hello Result
renderer.state Notification
```

都携完整自包含 Authority Snapshot。

Renderer 验证成功后 MUST原子替换旧 Control Store；不得逐字段暴露半更新状态。

Reconnect 不重放历史，只取得 current Snapshot。

---

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

---

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

---

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

`stack` bottom → top，只包含 live Frames；`closed` 不进入 Snapshot。

约束：

```text
frameId unique
all subsystemKey refer to runtimes
at most one active Frame
active Frame if present = Stack Top
active Frame requires activationId
non-active Frame MUST NOT contain activationId
```

Renderer MAY观察 Frame 当前事实，但 User Input decisions MUST NOT推导/依赖 push/pop/call/return/caller/child/unwind root/resume reason。

---

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

非空 target MUST精确引用 existing active Stack Frame、同 subsystemKey、同 current activationId。

`active Frame + InputTarget=null` 合法；Renderer不得自行构造 target。

---

## 14. Logical DataAuthority

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

当前 Phase 1 profile：

```text
loomrealm.renderer-data/1
```

含义：Main 当前允许本 Renderer participant 为 `subsystemKey` 建立并持有 `generation` 的 Data Connection，并要求该 carrier 运行 `dataProfile` 指定的完整 Data application stack。

`dataProfile`：

```text
is logical application profile identity
is immutable for one generation
is not transport
is not credential
```

DataAuthority 不表示：

```text
Data Connection已建立
endpoint/ticket/Port已知
Subsystem有 Render
Subsystem有 active Frame
InputTarget指向该 Subsystem
Interest已发布
```

---

## 15. Data Generation / Profile Replacement

`generation`：

```text
positive safe integer
Subsystem-scoped within Session
strictly increasing on authority replacement
never reused
```

同一 Snapshot 中一个 `subsystemKey` 最多一个 DataAuthority。

以下都属于 authority replacement，MUST使用 fresh generation：

```text
revoke then re-authorize after replacement
change dataProfile
replace authority epoch for any policy reason
```

同 generation 的 sequential transport reconnect 不需要新 generation，且 MUST保持同一 `dataProfile`。

---

## 16. Data Bootstrap Boundary

Authority Snapshot MUST NOT包含：

```text
WebSocket URL
MessagePort
bearer token / ticket
connection nonce
transport-specific locator
Platform provisioning handle
```

Renderer Data Application Profile / Data Connection Contract 定义建立后的 application identity/lifecycle；Platform Data Connection Broker 负责 actual carrier provisioning。

---

## 17. DataAuthority Revocation

某 Subsystem 的 DataAuthority 消失，或 generation/profile被新 authority替换时，Renderer MUST立即停止使用旧 authority并 retire/close旧 Data Connection。

旧 generation 永远不得重新成为 current authority。

---

## 18. `renderer.hello` Success

```ts
interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

Main：

```text
authenticate
→ select version
→ capture committed Snapshot revision R
→ mark Connection current
→ return hello Result(R)
```

所有 `revision > R` publication MUST在 hello Result之后发送。

---

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

Main MUST只发送 committed authority，不得发布 tentative call/return、predicted RPC success 或 unacknowledged Activation。

已 commit 的 transitional state MAY发布，例如 Caller suspended / Child starting / InputTarget=null。

---

## 20. Renderer Application Rules

Renderer 维护：

```text
currentSessionId
appliedRevision
currentSnapshot
```

相同 Session：

```text
new.revision > appliedRevision
→ validate whole Snapshot
→ atomic replace
```

revision gap 合法。

同 current Connection 若 `new.revision <= appliedRevision`，属于 Protocol Error；Renderer MUST fail closed。

---

## 21. Publication Coalescing

Main MAY合并尚未发送的中间 Snapshots，只保留 latest committed Snapshot。

因此 Renderer/User Input MUST把任何 observed InputTarget identity change 视为旧 target Input State终止边界，不得依赖一定观察到中间 `null` revision。

同一 `frameId + activationId` revoke→regrant 永远非法。

---

## 22. Backpressure

Full Snapshot publication MUST bounded。

Main SHOULD维持：

```text
0..1 in-flight write
+
at most one replaceable latest unsent Snapshot
```

持续无法 drain 时 Platform/Host implementation MUST在 finite policy下关闭 Control Connection；恢复统一 fresh hello + current Snapshot。

---

## 23. Topology Limits

任何合法 v1 authority state MUST能由一条合法 full Snapshot 表示。

```text
max Runtime entries          256
max live Frame Stack entries 64
max DataAuthority entries    256
```

Main/Game Bootstrap MUST在可能超出 limits 前拒绝进入 Renderer Control v1 Session。

---

## 24. Control Connection Loss / Renderer Reload

Control loss 后 Renderer不再拥有可证明的 current Main authority。

Renderer MUST立即：

```text
InputTarget := null locally
stop ordinary User Input
invalidate all DataAuthority
retire/close all Renderer⇄Subsystem Data Connections
```

不得继续使用 cached old Activation/generation/profile。

恢复：

```text
fresh Platform bootstrap/token
→ new Renderer Control carrier
→ renderer.hello
→ current full Snapshot
→ atomic replace Control Store
→ establish current Data Connections
```

不定义 historical revision replay、old Activation replay、Frame RPC replay 或 unwind replay。

Render presentation MAY暂时保留最后合法 Render Store；authoritative恢复由 Render Update独立完成。

---

## 25. Runtime Failure Visibility

Runtime failure unwind authority只在 Main。

Renderer可以观察 committed结果，但不得自行计算 failedRuntimeKeys、lowest root、whole suffix、fixed-point expansion。

---

## 26. Render Independence

Snapshot MUST NOT包含 Render Registry/Domain State/Render revision/DOM/Canvas/WebGL state。

```text
Frame removed != Render removed
Data Connection retired != authoritative Render Domain destroyed
```

---

## 27. User Input Composition

User Input ordinary sender-side gate：

```text
raw/custom Producer(C)
→ current InputTarget == (S,F,A)?
→ matching current Data Connection for S/G/profile?
→ mirrored F active/current A?
→ C ∈ Interest[F]?
→ Producer(C) available?
→ send Input(F,A,C)
```

其中：

```text
InputTarget = Main-owned authority
Interest[F] = Subsystem-owned Frame-scoped configuration
Producer(C) = Renderer-local availability
```

Interest/Producer只能缩小，不能创建/扩大 InputTarget。

### 27.1 Interest 不进入 Control Snapshot

Authority Snapshot MUST NOT包含：

```text
Input Interest
Frame Interest Registry
Input subscription
Producer availability
```

Main不是这些状态的 authority，也不做 Interest relay。

### 27.2 Cross-Plane Ordering

Renderer Control 与 Renderer Data Connection独立，无跨连接 total order。

以下都合法：

```text
Interest[F] first, authority later
Authority/InputTarget first, Interest[F] later
```

规则：

```text
Interest without authority → inert
Authority without Interest → no ordinary input
both present               → recompute Effective
```

不得加入 cross-plane ACK/revision join/barrier/handshake。

### 27.3 No Stack-op Interpretation

Renderer/User Input implementation MUST NOT把 push/pop/call/return/unwind 当作输入切换条件，只组合 current facts。

### 27.4 Activation Boundary

InputTarget identity改变 MUST终止旧 target Input State；旧 State/Event不得迁移/重放到 fresh Activation。Interest[F] MAY跨 suspension/fresh Activation存在。

---

## 28. Ordering / Retry

同一 Renderer Control Connection：

```text
hello Result
before
all renderer.state Notifications
```

emitted revision strictly increasing。

Carrier per-direction ordered；不得 adapter-created duplicate/retry/replay。

v1 无：

```text
renderer.state ACK
state mutation request
revision replay/resync request
subscribe-from-revision
JSON Patch
```

恢复只有 new connection → hello → current full Snapshot。

---

## 29. JSON Model / Closed Schema

允许 plain JSON-compatible：null / boolean / string / finite number / array / object。

禁止：undefined、NaN/Infinity、BigInt、Function/Symbol、ArrayBuffer/Blob/MessagePort、Host object。

整数语义字段必须 safe integer；所有 v1 wire object closed schema，unknown field MUST rejected。

---

## 30. Limits

```text
max application message          1 MiB
max JSON nesting depth           64
max array/object members         16,384

sessionId                        1..128 UTF-8 bytes
subsystemKey                     1..256 UTF-8 bytes
frameId                          1..128 UTF-8 bytes
activationId                     1..128 UTF-8 bytes
rendererControlToken             1..4096 UTF-8 bytes
dataProfile                      1..256 ASCII bytes
Authority Revision               1..2^53-1
Data generation                  1..2^53-1
protocolVersions entries         1..16
```

所有平台都对实际 UTF-8 JSON text application unit执行 whole-message hard cap；PWA不再使用“structured object 的 Reference JSON equivalent”双重模型。

---

## 31. Request ID / Error

只有 `renderer.hello` 使用 Request ID：positive safe integer，Connection-lifetime sender-side never reused。

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

authentication error不得泄露 unknown/expired/wrong/consumed token细节。

---

## 32. Fail-Closed Validation

Renderer发现 invalid JSON/schema、invalid session/revision、revision regression/duplicate、invalid Stack、invalid Activation/InputTarget relation、invalid/duplicate DataAuthority、invalid dataProfile shape 或 oversize message时 MUST：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
retire all Data Connections
close Control Connection
```

不得局部修复 Snapshot后继续运行。

---

## 33. Security

- rendererControlToken 是 secret，一次成功 hello后 consumed；
- Snapshot不携 Data credential/endpoint/physical path；
- Runtime business state不进入 Snapshot；
- Renderer Core是 ordinary User Input Main-authority sender-side enforcement point；
- Interest不是 credential/authority；
- Platform应限制 Control carrier在认可的本地/受控 boundary。

---

## 34. Minimum Conformance

至少覆盖：

```text
hello-first-message
hello-auth/token-one-shot/version
atomic-full-snapshot
revision-monotonic-gap-accepted-regression-rejected

empty/active/transitional-stack
activate-ack-before-target
resume-fresh-activation
revoked-activation-never-reappears
inputtarget-one-shot-no-regrant

runtime-failure-unwind-main-only

data-authority-uses-data-profile
data-profile-is-not-endpoint-or-credential
data-profile-change-requires-fresh-generation
data-generation-replacement
control-loss-revokes-all-data-authority
control-loss-retires-data-connections

interest-not-in-control-snapshot
interest-first-authority-later
authority-first-interest-later
control-data-no-total-order
renderer-does-not-interpret-stack-ops
interest-alone-cannot-create-inputtarget

bounded-latest-snapshot
snapshot-topology-limits
oversize-message-rejected
websocket-json-text
messageport-json-text-equivalent
```

---

## 35. Explicit Non-goals

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
Main-signed input capability
Content Grant
telemetry
heartbeat
```

---

## 36. Wire Surface Summary

| Method | 类型 | 方向 | 职责 |
|---|---|---|---|
| `renderer.hello` | Request | Renderer → Main | one-shot auth、version negotiation、initial full Snapshot |
| `renderer.state` | Notification | Main → Renderer | current complete committed Authority Snapshot |

v1 只有这两个 application methods。

---

## 37. Final Invariants

1. Main是唯一 Renderer Control authority；
2. Renderer是 read-only committed mirror；
3. full Snapshot自包含、原子替换；
4. revision严格单调、允许 publication gap；
5. reconnect只取 current Snapshot，不 replay；
6. ACK-before-InputTarget publication；
7. revoked Activation never reappears；
8. `InputTarget=null`合法；
9. InputTarget lease撤销后同一 `frameId + activationId` 不得 regrant；
10. DataAuthority = `subsystemKey + generation + dataProfile`；
11. `dataProfile` 选择完整 Data application stack，不是 transport/credential；
12. profile改变必须使用 fresh generation；
13. endpoint/token/Port/provisioning material不进入 Snapshot；
14. Control loss立即撤销 ordinary input与全部 DataAuthority，并 retire Data Connections；
15. Input Interest不进入 Control Snapshot；
16. Control/Data无跨连接 total order；
17. Renderer不解释 stack operation决定 ordinary input；
18. bounded latest-state publication，无历史 Snapshot无界排队；
19. Render lifecycle/revision独立；
20. Renderer Core执行 Main Authority × Frame Interest × Producer gate；
21. Renderer不参与 Frame failure unwind；
22. WebSocket/MessagePort application unit统一为 UTF-8 JSON text string。