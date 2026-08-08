# Main ⇄ Renderer Control Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.renderer-control`  
> 稳定程度：Evolving  
> 主要定义：Main 向 Renderer 发布 committed Runtime / Frame / Activation / InputTarget / Renderer Data Grant authority 的连接、快照、Revision、恢复与错误语义  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[通信系统](../10-architecture/communication-system.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> 后续依赖：Renderer ⇄ Subsystem Connection Protocol、User Input Protocol  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 是 Runtime / Frame / Activation / InputTarget authority；Renderer Control v1 只复制 Main 已提交的权威状态，不授予 Renderer 修改、恢复或推导该状态的能力。**

## 1. 适用范围

```text
LoomRealm Main
      ⇅
Main ⇄ Renderer Control Connection
      ⇅
Web Renderer
```

本协议负责：

```text
Renderer Control Connection authentication
Renderer Control protocol version negotiation
Main committed Runtime state projection
Main committed live Frame Stack projection
current Activation projection
current InputTarget publication
Renderer Data Grant publication
monotonic Authority Revision
full Authority Snapshot publication
Renderer reconnect / reload recovery
publication coalescing
protocol limits / validation / failure behavior
```

本协议不负责：

```text
Subsystem Runtime bootstrap / shutdown
Frame initialize / activate / suspend / resume / close
Frame call / return
Frame failure unwind
Renderer ⇄ Subsystem Data Connection handshake
User Input payload
Render Update
Render State
Content API
business state
DOM / Canvas / WebGL state
```

Renderer MUST NOT 通过本协议发送改变 Frame、Runtime、Activation 或 InputTarget 的命令。

## 2. Authority Model

Main 是以下状态的唯一公共 authority：

```text
Runtime observed state
live Frame Stack
Frame lifecycle
current Activation
InputTarget
Renderer Data Grant
Authority Revision
```

Renderer 是这些状态的只读 mirror。

Renderer MUST NOT：

```text
创建 frameId
创建 activationId
恢复 revoked Activation
改变 Frame lifecycle
改变 Stack
计算 Runtime failure unwind root
根据 failed subsystemKey 自行删除 Stack suffix
恢复 old InputTarget
把 Render focus 解释为 InputTarget
根据 Data Connection 状态修改 Main authority
```

Renderer 本地状态不能反向成为 Main authority。

## 3. 与 Frame / Call v1 的因果关系

本协议必须服从 Frame / Call v1 已冻结的 publication barrier。

### 3.1 Activation publication

```text
frame.activate Success ACK
    happens-before
Main commits active Activation
    happens-before
Renderer Control publishes that Activation/InputTarget
```

以及：

```text
frame.resume Success ACK
    happens-before
Main commits replacement Activation
    happens-before
Renderer Control publishes that Activation/InputTarget
```

Main MUST NOT 在对应 `activate` / `resume` ACK 前发布新的 InputTarget。

### 3.2 Revocation

Activation 一旦 revoked：

```text
revoked
→ MUST NOT reappear
```

任何后续 Authority Snapshot MUST NOT 再包含该 Activation 作为 current authority。

normal call、return、Frame close、Runtime failure、Renderer reconnect/reload 与 publication coalescing 都不能恢复 revoked Activation。

### 3.3 InputTarget gap

以下状态均允许：

```text
InputTarget = null
```

包括 initial Frame initialization、call transaction、return transaction、Activation replacement、Runtime failure barrier、failure unwind、recovery resume 与 Stack empty。

Renderer MUST 将 `null` 视为合法 authority，而不是同步错误。

## 4. Connection Model

一个 LoomRealm Session v1 最多存在一个逻辑 Renderer Control participant。

Main MAY 观察到旧 Transport 尚未完全关闭而新的 Renderer Control Connection 已经建立。认证成功的新 Connection 成为当前 Connection；旧 Connection MUST 被 Main 关闭或永久停止 authority publication。

```text
one Session
    → one current Renderer Control Connection
```

Renderer reload 属于新的物理 Connection，不属于新的 LoomRealm Session。

## 5. Transport

Renderer Control v1 的 application model 为：

```text
JSON-RPC 2.0
plain JSON-compatible values
one transport application unit
    =
one JSON-RPC Request / Response / Notification
```

JSON-RPC Batch MUST NOT 使用。

### 5.1 Desktop WebSocket Mapping

Desktop Profile：

```text
Transport     localhost WebSocket
Application   JSON-RPC 2.0
```

一条完整 WebSocket text message MUST 对应一条 JSON-RPC application message。Binary WebSocket message MUST NOT 作为 Renderer Control v1 carrier。

### 5.2 PWA MessagePort Mapping

在未来 PWA Main ⇄ Renderer Control Port 已安全建立后：

```text
one postMessage()
    =
one plain JSON-compatible JSON-RPC object
```

Renderer Control v1 MUST NOT 依赖 ArrayBuffer、Blob、MessagePort transfer、BigInt 或 Host object。

PWA Control Port 如何建立属于独立 Host / Bootstrap Profile。

## 6. Renderer Control Credential

Main MUST 为当前 LoomRealm Session 建立一个 `rendererControlToken`。

该 token：

- MUST 是 opaque non-empty string；
- MUST 绑定当前 LoomRealm Session；
- MUST 只由可信 Host / Bootstrap 路径交给 Renderer；
- MUST NOT 出现在 URL query、普通日志或用户可见 diagnostics；
- MUST NOT 被 Renderer 自行生成；
- Session 结束后 MUST 失效。

v1 允许同一个 Session token 用于 Renderer reload/reconnect。

未来若需要一次性 credential rotation，应通过新 Profile 或新协议版本定义。

## 7. `renderer.hello`

Renderer Control Connection 上的第一条 LoomRealm application message MUST 是 `renderer.hello`。

hello 成功前：

```text
Main MUST NOT publish renderer.state
Renderer MUST NOT 认为任何 cached authority 仍有效
```

### 7.1 Method

```text
Method:    renderer.hello
Type:      JSON-RPC Request
Direction: Renderer → Main
```

### 7.2 Request

```ts
interface RendererHelloParams {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}
```

示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "renderer.hello",
  "params": {
    "rendererControlToken": "<opaque-token>",
    "protocolVersions": [1]
  }
}
```

`protocolVersions`：

```text
1..16 entries
positive integer only
no duplicate
```

它只协商 `loomrealm.renderer-control`，不得被解释为 Frame / Call、Renderer Data Connection、User Input 或 Render Update 的版本协商。

## 8. Protocol Version Selection

Main 选择：

```text
selectedVersion = max(
  renderer.protocolVersions
  ∩
  main.supportedRendererControlVersions
)
```

无交集时 hello 失败。

v1：

```text
protocolVersion = 1
```

## 9. LoomRealm Session Identity

Main 为每个 LoomRealm Session 生成 `sessionId`。

约束：

```text
opaque string
Session lifetime unique
never reused
1..128 UTF-8 bytes
```

Renderer MUST 使用 `sessionId` 区分 same Session reconnect 与 new Session。

新 `sessionId` 出现时，Renderer MUST 丢弃旧 Session 的 Runtime mirror、Frame mirror、Activation、InputTarget 与 Data Grants。

Render State 的恢复由独立 Render Protocol 决定。

## 10. Authority Revision

Main 维护：

```ts
type AuthorityRevision = number;
```

要求：

```text
positive safe integer
1 .. 2^53 - 1
Session-local
strictly increasing
never reused
never wrap
```

当 Renderer-visible committed authority 发生变化时，Main MUST 分配新的 revision。

例如：

```text
R=10   A active / InputTarget=A

call acceptance commit
R=11   A suspended / Child starting / InputTarget=null

Child initialize succeeds
(no Renderer-visible change MAY occur)

Child activate ACK
R=12   Child active / InputTarget=Child
```

## 11. Revision 与 Coalescing

Authority Revision 代表 Main committed authority 的版本。

Main MAY 不向 Renderer 发送每一个 revision。例如 Main 连续 commit revision 41、42、43 时，MAY 只发送 `renderer.state revision=43`。

因此 Renderer MUST 接受 revision jump，例如 `10 → 13`。

Revision gap MUST NOT 被解释为 message loss 或要求 replay，因为 v1 每次 publication 都是完整 Authority Snapshot。

## 12. Full Snapshot Model

Renderer Control v1 **不定义 delta / patch**。

每次 `renderer.hello` Result 与 `renderer.state` Notification 都携带一份完整 `RendererAuthoritySnapshotV1`。

Renderer 在成功验证新 Snapshot 后 MUST 原子地以新 Snapshot 替换旧 Control State Store，不得逐字段暴露半更新状态。

## 13. Authority Snapshot Schema

```ts
interface RendererAuthoritySnapshotV1 {
  readonly sessionId: string;
  readonly revision: number;
  readonly runtimes: readonly RendererRuntimeStateV1[];

  /** Main live Frame Stack; order: bottom → top. */
  readonly stack: readonly RendererFrameStateV1[];

  readonly inputTarget: RendererInputTargetV1 | null;
  readonly dataGrants: readonly RendererDataGrantV1[];
}
```

Snapshot MUST 是自包含状态。Renderer 不得要求先前 Snapshot 才能解释当前 Snapshot。

## 14. Runtime Projection

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

`state` 是 Main-observed Runtime state 的 projection。

Renderer MUST NOT 从该 state 推导 Frame Stack 变化。例如观察到 Runtime failed 不意味着 Renderer 可以自行删除该 subsystemKey 对应 Frame。

## 15. Frame Stack Projection

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

  /** Required iff lifecycle == "active". */
  readonly activationId?: string;
}
```

`stack` 顺序为 bottom → top，只包含 Main 当前 live Frame。`closed` Frame MUST NOT 保留在 Snapshot 中。

### 15.1 Stack Constraints

Snapshot MUST 满足：

```text
frameId unique
all frame subsystemKey exist in runtimes
at most one active Frame
```

若存在 active Frame：

```text
active Frame MUST be Stack top
active Frame MUST contain activationId
```

非 active Frame MUST NOT contain `activationId`。

## 16. InputTarget

```ts
interface RendererInputTargetV1 {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}
```

Snapshot 中最多存在一个普通 InputTarget：

```text
inputTarget = null
OR
one RendererInputTargetV1
```

### 16.1 InputTarget Referential Integrity

如果 `inputTarget != null`，则 MUST 存在一个 Stack entry 满足：

```text
frame.frameId == inputTarget.frameId
frame.subsystemKey == inputTarget.subsystemKey
frame.lifecycle == "active"
frame.activationId == inputTarget.activationId
```

否则 Snapshot invalid。

### 16.2 Active but unpublished

以下状态合法：

```text
Stack Top
    lifecycle = active
    activationId = X

InputTarget = null
```

它表示 Main 尚未或不再公开普通输入 authority。Renderer MUST NOT 因为看到 active Frame 就自行构造 InputTarget。

## 17. Renderer Data Grant

Main 可以授权 Renderer 与某个 Subsystem Runtime 建立独立 Data Connection。

```ts
interface RendererDataGrantV1 {
  readonly subsystemKey: string;

  /** Main-generated, subsystem-scoped generation. */
  readonly generation: number;

  /** Identifies the separately defined Renderer ⇄ Subsystem Connection Profile. */
  readonly connectionProfile: string;

  /** Opaque bearer credential. */
  readonly grantToken: string;

  readonly endpoint: RendererDataEndpointRefV1;
}

interface RendererDataEndpointRefV1 {
  readonly transport: string;
  readonly locator: string;
}
```

### 17.1 Grant Authority

`RendererDataGrantV1` 只表示：Main 允许当前 Renderer Session 尝试建立指定 generation 的 Subsystem Data Connection。

它不表示 Data Connection 已经建立、Subsystem 已存在 Render、Subsystem 拥有 active Frame 或 InputTarget 指向该 Subsystem。

### 17.2 Grant Generation

`generation` MUST：

```text
positive safe integer
Subsystem-scoped
Session lifetime never reused
strictly increase on authority replacement
```

例如：

```text
loom.map grant generation=4
→ revoked
→ future loom.map grant generation=5
```

不得再次发布 generation 4。

### 17.3 Grant Token

`grantToken`：

```text
opaque
non-empty
1..4096 UTF-8 bytes
```

必须绑定至少 `sessionId + subsystemKey + generation`。

Renderer MUST NOT 修改或解析其内容。

Renderer ⇄ Subsystem Connection Protocol 定义 grantToken 如何提交、何时消费、connection replacement、reconnect 与 Data Connection authentication failure；这些语义不由 Renderer Control v1 定义。

### 17.4 Grant Revocation

Main 撤销 Data authority 时，下一 committed Snapshot MUST 不再包含对应 generation。

Renderer 观察到 Grant 消失或 generation 改变后 MUST 将旧 Grant 视为 revoked。Renderer MUST NOT 使用 cached 旧 Grant 建立新的 Data Connection。

## 18. `renderer.hello` Success Result

```ts
interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "snapshot": {
      "sessionId": "session-7",
      "revision": 27,
      "runtimes": [
        { "subsystemKey": "loom.map", "state": "ready" },
        { "subsystemKey": "loom.menu", "state": "ready" }
      ],
      "stack": [
        {
          "frameId": "frame-12",
          "subsystemKey": "loom.map",
          "lifecycle": "active",
          "activationId": "activation-19"
        }
      ],
      "inputTarget": {
        "subsystemKey": "loom.map",
        "frameId": "frame-12",
        "activationId": "activation-19"
      },
      "dataGrants": [
        {
          "subsystemKey": "loom.map",
          "generation": 2,
          "connectionProfile": "loomrealm.renderer-subsystem-connection/1",
          "grantToken": "<opaque-grant>",
          "endpoint": {
            "transport": "websocket",
            "locator": "ws://127.0.0.1:30123"
          }
        }
      ]
    }
  }
}
```

## 19. Hello Atomicity

Main 处理 hello 时 MUST 建立一个原子的基准点：

```text
authenticate
→ choose protocol version
→ capture committed revision R snapshot
→ activate Renderer Control Connection
→ return hello Result(snapshot R)
```

在 Snapshot R 之后发生的 authority changes（`revision > R`）必须在 hello Result 之后通过 `renderer.state` publication 发送。

不得出现：

```text
state revision=R+1
arrives before
hello Result revision=R
```

## 20. `renderer.state`

```text
Method:    renderer.state
Type:      JSON-RPC Notification
Direction: Main → Renderer
```

Params：

```ts
interface RendererStateParamsV1 {
  readonly snapshot: RendererAuthoritySnapshotV1;
}
```

## 21. State Publication Rules

Main MUST 只发送 committed authority，不得发布 tentative transaction state、unaccepted call、unaccepted return、predicted RPC success、cached Renderer state 或 uncommitted Activation。

Main 可以发送 transaction 中已经 commit 的中间状态。例如 call acceptance 后 Caller suspended、Child starting、InputTarget=null 已属于 Main committed authority，因此 MAY 被发布。

## 22. Renderer State Application

Renderer 维护：

```text
currentSessionId
appliedRevision
currentSnapshot
```

相同 Session 收到合法 `renderer.state` 时，如果 `new.revision > appliedRevision`，Renderer MUST 原子应用；revision 可以跳跃。

若在同一当前 Connection 收到 `new.revision <= appliedRevision`，属于 Renderer Control Protocol Error。Renderer MUST fail closed。Main MUST NOT 重复发送相同 revision。

## 23. Fail-Closed Behavior

如果 Renderer 发现 invalid JSON-RPC、invalid schema、invalid sessionId/revision/Stack、duplicate frameId、invalid lifecycle、invalid Activation relationship、invalid InputTarget reference、invalid Grant generation 或 oversize message，Renderer MUST：

```text
stop ordinary User Input immediately
invalidate cached InputTarget
invalidate cached Data Grants
close Renderer Control Connection
reconnect / re-hello if Host policy allows
```

Renderer MUST NOT 继续使用最后一份旧 InputTarget、局部修复 Snapshot 或猜测 Main 想表达的状态。

Render presentation MAY 继续显示最后合法 Render State；其恢复属于 Render Protocol。

## 24. Control Connection Loss

Renderer Control Connection 意外丢失时，current Main authority is no longer safely observable。

Renderer MUST 立即：

```text
InputTarget := null
stop ordinary User Input
invalidate cached Data Grants for new connections
```

Renderer MUST NOT 恢复 cached Activation。

Renderer 重新连接后：

```text
renderer.hello
→ receive full current Snapshot
→ replace old Control State Store
→ rebuild Data authority from new Snapshot
```

## 25. Renderer Reload

Renderer reload 使用同样的恢复模型：

```text
new Renderer process/page context
→ connect Main
→ renderer.hello
→ current full Snapshot
→ rebuild Control State Store
→ rebuild Data Connections
→ Render Protocol independently restores Render State
```

Main MUST NOT 向 reload Renderer 发送 historical revision replay、old Activation replay、Frame RPC replay 或 failure unwind replay；只需要当前 committed Snapshot。

## 26. Runtime Failure Visibility

Runtime failure 发生时，Renderer 不得自己执行 Frame recovery。

Main 负责：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ fixed-point unwind
```

Renderer 只观察其结果。

Main MAY coalesce recovery 中间状态；如果发布 recovery 中间 revision，其内容必须是真实 committed authority。

## 27. Accepted Outcome Boundary

Frame terminal outcome 属于 Frame / Call 语义。

Renderer Control v1 不使用 FrameOutcome、`SUBSYSTEM_RUNTIME_FAILED`、completed value 或 cancelled value 来计算 Stack 或 InputTarget。

未来 Diagnostics/UI 若需要显示这些信息，应建立独立 non-authority projection，而不能成为 recovery command。

## 28. Render Independence

Authority Snapshot MUST NOT 包含：

```text
Render Registry
renderId
Render State
Render revision
DOM state
Canvas state
WebGL state
```

Renderer Control revision 与 Render revision 是两个完全独立的 revision domain。

不得假设 `Authority Revision N == Render Revision N`，也不得假设 `Frame removed → Render removed`。

## 29. User Input Dependency

未来 User Input Protocol MUST 使用本协议当前 `InputTarget` 作为普通输入 authority。

Renderer ordinary input routing：

```text
read current Snapshot
→ inputTarget == null
    → do not send

→ inputTarget != null
    → verify matching active Frame
    → select subsystem Data Connection
    → attach frameId + activationId
    → User Input Protocol
```

InputTarget 改变时，旧持续输入意图 MUST 停止。旧 Activation 上的输入 MUST NOT 自动重放到新 Activation。

## 30. Renderer Data Connection Dependency

Data Connection 不能成为 Main authority source。

以下关系单向成立：

```text
Main Renderer Control Grant
    → permits
Renderer ⇄ Subsystem Data Connection
```

反方向不成立：

```text
Data Connection connected
    ↛ Runtime ready
    ↛ Frame active
    ↛ InputTarget
```

Data reconnect 不得恢复 Frame authority。

## 31. Ordering

同一 Renderer Control Connection 上：

```text
hello Result
before
all renderer.state Notifications
```

并且 `renderer.state` revisions strictly increasing。

Transport MUST 保持 per-direction application-message order。

Transport adapter MUST NOT reorder、duplicate、application retry 或 merge two JSON-RPC messages into one protocol message。Main 层 MAY 进行 Snapshot publication coalescing。

## 32. Retry / Replay

Renderer Control v1：

```text
no state mutation Request after hello
no renderer.state ACK
no application retry
no historical revision replay
no delta replay
```

连接恢复统一使用：

```text
new Connection
→ renderer.hello
→ full current Snapshot
```

因此 v1 不定义 `renderer.resync`、`renderer.ack`、`renderer.getState`、`renderer.replay` 或 `renderer.subscribeFromRevision`。

## 33. JSON Model

允许：

```text
null
boolean
string
finite JSON number
array
object
```

禁止：

```text
undefined
NaN
Infinity
-Infinity
BigInt
Function
Symbol
ArrayBuffer
Blob
MessagePort
Host object
duplicate JSON object member
invalid Unicode scalar sequence
```

整数语义字段 MUST 是 safe integer。

## 34. Limits

Renderer Control v1：

```text
max application message                1 MiB
max JSON nesting depth                 64
max array/object members               16,384

sessionId                              1..128 UTF-8 bytes
subsystemKey                           1..256 UTF-8 bytes
frameId                                1..128 UTF-8 bytes
activationId                           1..128 UTF-8 bytes

rendererControlToken                   1..4096 UTF-8 bytes
grantToken                             1..4096 UTF-8 bytes
connectionProfile                      1..256 ASCII bytes
endpoint.transport                     1..64 ASCII bytes
endpoint.locator                       1..2048 UTF-8 bytes

Authority Revision                     1..2^53-1
Data Grant generation                  1..2^53-1
protocolVersions entries               1..16
```

Desktop receiver MUST 同时对实际完整 WebSocket text UTF-8 bytes 执行 `<=1 MiB` hard cap。

PWA MessagePort 使用 Reference Compact JSON UTF-8 equivalent 执行 whole-message limit。

## 35. Closed Schema

v1 所有 wire object 均为 closed schema。未知字段 MUST be rejected。

不得通过添加未协商字段形成隐式 minor version。需要新增 wire 字段或改变字段语义时，应使用新 Renderer Control protocol version 或 explicit separately-versioned nested Profile。

## 36. JSON-RPC Request ID

Renderer Control v1 只有 `renderer.hello` 使用 Request ID。

ID MUST 是 positive safe integer；同一 Connection 中不得重用。JSON-RPC `null` / string / negative / fractional ID 均不允许作为 Renderer Control Request ID。

## 37. Error Model

标准 JSON-RPC 错误：

```text
-32700 Parse Error
-32600 Invalid Request
-32601 Method Not Found
-32602 Invalid Params
```

LoomRealm semantic error：

```text
error.code = -32000
error.data.code = stable machine code
```

```ts
interface RendererControlRpcErrorDataV1 {
  readonly code: string;
}
```

v1 semantic codes：

```text
RENDERER_AUTHENTICATION_FAILED
RENDERER_CONTROL_PROTOCOL_UNSUPPORTED
PROTOCOL_STATE_ERROR
```

## 38. Authentication Failure

无论 unknown token、expired token、wrong Session token 或 malformed token，hello 统一返回 `RENDERER_AUTHENTICATION_FAILED`，不得通过 error 区别 token 存在性。

错误后 Main MUST 关闭 Connection。

## 39. Unsupported Version

无协议版本交集：

```text
RENDERER_CONTROL_PROTOCOL_UNSUPPORTED
```

Main MUST 返回 Error 并关闭 Connection。

## 40. Illegal Messages

hello 成功前收到任何非 `renderer.hello` LoomRealm application message：fatal Protocol Error。

hello 成功后 Renderer 再次发送 `renderer.hello`：

```text
PROTOCOL_STATE_ERROR
→ close Connection
```

Renderer Control v1 不存在其他 Renderer → Main method。

## 41. Security Requirements

Renderer Control Connection 携带 Main authority、Input authority 与 Data bearer credentials。因此：

- Renderer Control transport MUST 被限制在 Host 认可的本地/受控通信边界；
- `rendererControlToken` 与 `grantToken` MUST 按 secret 处理；
- logs MUST redact tokens；
- error MUST NOT echo token；
- Snapshot MUST NOT 包含任意 Subsystem business state；
- Snapshot MUST NOT 包含 Game Package filesystem physical path；
- Renderer 不能使用 endpoint/grant 信息访问未授权 Subsystem；
- Main MUST 在 Runtime terminal failure / Data authority 撤销后停止发布旧 Grant。

## 42. Core Invariants

任何合法 Snapshot MUST 满足：

1. `sessionId` 属于当前 Session；
2. revision 单调、never reused；
3. Runtime `subsystemKey` 唯一；
4. Frame `frameId` 唯一；
5. Stack bottom → top；
6. Stack 中最多一个 active Frame；
7. active Frame 若存在必须位于 Top；
8. active Frame 必须有 current `activationId`；
9. 非 active Frame 无 current `activationId`；
10. revoked Activation 永不重新出现；
11. `InputTarget=null` 始终允许；
12. 非空 InputTarget 必须精确引用 active/current Activation；
13. Snapshot 中最多一个 ordinary InputTarget；
14. activate/resume ACK-before-publication；
15. Data Grant 不产生 Frame/Input authority；
16. Runtime state 不允许 Renderer 自行推导 Stack；
17. Render State 不属于本协议；
18. Control reconnect 只恢复 Main 当前 committed authority。

## 43. Normal Call Trace

初始：

```text
revision 20

Stack
    A active / activation-a1

InputTarget
    A / activation-a1
```

Subsystem A 发起 call B。

Main acceptance commit：

```text
revision 21

Stack
    A suspended
    B starting

InputTarget
    null
```

Main MAY 发布 revision 21。

B initialize 成功后，如果 Renderer-visible authority 未变化，可以不产生新 revision。

B activate ACK：

```text
revision 22

Stack
    A suspended
    B active / activation-b1

InputTarget
    B / activation-b1
```

此时才允许 Renderer 把普通输入发送给 B。

## 44. Normal Return Trace

起点：

```text
revision 30

A suspended
B active / activation-b1

InputTarget=B
```

Return acceptance：

```text
revision 31

A suspended
B closing

InputTarget=null
```

B close ACK 并 pop：

```text
revision 32

A suspended

InputTarget=null
```

Main 发送 `frame.resume(A, activation-a2)`；resume ACK 后：

```text
revision 33

A active / activation-a2

InputTarget=A / activation-a2
```

`activation-a1` MUST NOT 再次出现。

Main MAY coalesce `30 → 33`。

## 45. Runtime Failure Trace

初始：

```text
A suspended
B suspended
C active
InputTarget=C
```

B Runtime 失败。Main 建立 failure barrier 后 `InputTarget=null`，随后执行 Frame / Call v1 whole-suffix unwind。

Renderer 不得根据 `B failed` 自行删除 B/C，只应用 Main Snapshot。

最终可能为：

```text
A active / fresh activation
InputTarget=A
```

或者：

```text
Stack=[]
InputTarget=null
```

## 46. Renderer Reload Trace

```text
Renderer old connection lost
→ local InputTarget=null
→ stop ordinary input

new Control Connection
→ renderer.hello

Main returns current complete Snapshot revision=87

Renderer atomically replaces old Control mirror
→ reconnect Data according current grants
→ Render recovery independently
```

没有 revision 1..86 replay。

## 47. Minimum Conformance Scenarios

Renderer Control v1 conformance 至少应覆盖：

```text
hello-auth-success
hello-auth-failure
unsupported-version
hello-first-message-required

initial-empty-stack-snapshot
initial-active-frame-snapshot

revision-monotonic
revision-gap-accepted
revision-regression-rejected
duplicate-revision-rejected

call-null-target-gap
activate-ack-before-target
return-null-target-gap
resume-fresh-activation
revoked-activation-never-reappears

runtime-failure-null-target
whole-suffix-only-from-main
recovery-final-resume-publication

renderer-reconnect-current-snapshot
renderer-reload-no-history-replay
new-session-invalidates-old-control-state

data-grant-generation-replacement
revoked-data-grant-not-reused
input-target-does-not-require-render

invalid-inputtarget-reference-rejected
multiple-active-frame-rejected
duplicate-frame-id-rejected
oversize-message-rejected

desktop-websocket-order
pwa-messageport-equivalent-state
```

## 48. Explicit Non-Goals v1

v1 不定义：

```text
delta / JSON Patch
revision ACK
historical state replay
Renderer offline queue
Renderer-generated mutations
multiple simultaneous Renderer participants
Renderer leader election
Frame RPC proxy
Frame cancellation
Runtime failure recovery commands
Render State
Render composition
User Input payload
Data Connection handshake
diagnostic event stream
telemetry
heartbeat
```

这些能力不得通过实现私有字段隐式加入 v1 wire。

## 49. Wire Surface Summary

| Method | 类型 | 方向 | 职责 |
|---|---|---|---|
| `renderer.hello` | JSON-RPC Request | Renderer → Main | Authentication、Renderer Control version negotiation、initial full Snapshot |
| `renderer.state` | JSON-RPC Notification | Main → Renderer | Publish complete current committed Authority Snapshot |

Renderer Control v1 仅有以上两个 application methods。

## 50. Protocol Summary

```text
Renderer connects
→ renderer.hello
→ authenticate
→ negotiate loomrealm.renderer-control/1
→ full Snapshot revision R

Main authority changes
→ commit revision R+n
→ optionally coalesce intermediate revisions
→ renderer.state(full Snapshot)

Renderer
→ validate complete Snapshot
→ atomically replace Control Store
→ route ordinary input only from current InputTarget

Connection lost
→ InputTarget locally invalid immediately
→ reconnect
→ hello
→ current full Snapshot
```

v1 的核心恢复策略为：

> **不要同步历史；重新取得 Main 当前完整 authority。**

这保证 Renderer 始终只是 Main committed state 的 mirror，而不是第二套 Runtime / Frame recovery authority。
