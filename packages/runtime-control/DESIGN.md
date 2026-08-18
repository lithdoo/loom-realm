# `@loomrealm/runtime-control` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 目标：把 Subsystem Control v1、Frame / Call v1 与 Runtime Control Application Profile v1 落成可执行、可测试、与 transport 无关的协议实现层。  
> 原则：协议实现负责 wire、dispatch、correlation、deadline 与 conformance；Main / Subsystem 角色包负责真正的系统 authority；业务子系统默认只依赖 `@loomrealm/subsystem`，不直接接触本包。

---

## 1. 为什么存在这个包

LoomRealm 当前 Runtime Control 由三个已经独立定义的正式协议/组合层组成：

```text
Subsystem Control v1
        +
Frame / Call v1
        +
Runtime Control Application Profile v1
```

它们分别定义：

```text
Subsystem Control v1
    Runtime Container bootstrap
    descriptor.key identity binding
    initializing / ready / failed / shutdown lifecycle

Frame / Call v1
    Frame / Activation identity
    initialize / activate / suspend / resume / close
    call / return transaction
    commit barrier
    timeout / ambiguity / failure-unwind rules

Runtime Control Application Profile v1
    两个协议如何共享一条 Control Connection
    shared JSON-RPC dispatcher
    shared sender-side Request ID namespace
    shared message / JSON limits
```

如果这些机制直接散落在 `@loomrealm/main`、`@loomrealm/subsystem` 或具体 WebSocket / MessagePort adapter 中，会导致：

```text
同一协议出现多份 parser / validator
Main 与 Subsystem 对 request correlation 理解不同
WebSocket 与 MessagePort 对同一 Runtime trace 得到不同语义
Frame protocol detail 泄漏进业务 Subsystem
测试只能通过真实进程/网络跑，难以确定性验证 timeout/loss
```

因此 `@loomrealm/runtime-control` 的职责是：

> **把正式 Runtime Control 契约变成一套 transport-independent、role-neutral、typed、可 conformance-test 的协议机械层。**

---

## 2. 核心边界

### 2.1 本包负责

```text
Subsystem Control v1 schema / types / limits
Frame / Call v1 schema / types / limits
Runtime Control Profile v1 组合规则
JSON-RPC method surface 与方向约束
request / response correlation
connection-wide sender request-id namespace
protocol-level deadline machinery
protocol / semantic error envelope
connection-level dispatch
protocol state gating helper
reusable conformance harness / fixtures
```

### 2.2 本包不负责

```text
Main Runtime Registry
Main authoritative Frame Stack
Main InputTarget publication
Main Runtime Supervisor / process lifecycle
Subsystem 业务逻辑
Subsystem 业务 Frame object model
Renderer authority
Data Connection
User Input
Render Update
Content API
WebSocket / MessagePort 建连
Node child_process / Worker lifecycle
Desktop / PWA composition
```

核心判断：

> **本包实现“如何说 Runtime Control 协议”，但不拥有“系统最终应该做什么”的产品 authority。**

---

## 3. 对业务层的隔离要求

`@loomrealm/runtime-control` 不是业务 Subsystem SDK。

业务 Subsystem（例如 `@loomrealm/map`）默认依赖：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

而不是：

```text
@loomrealm/map
    → @loomrealm/runtime-control
    → @loomrealm/wire
    → @loomrealm/foundation
```

业务作者正常情况下不应看到：

```text
JSON-RPC
request id
MessageCarrier
bootstrapToken
protocolVersions
frame.initialize
frame.activate
frame.resume
frame.close
activationId 的手工传递
WebSocket
MessagePort
```

这些应由 `@loomrealm/subsystem` 吸收成更高层 API，例如：

```ts
const result = await frame.call("loom.battle", input);
await frame.return(result);

runtime.on("input", handler);
runtime.on("shutdown", handler);
```

底层的：

```text
frame.call
→ caller suspension
→ child initialize / activate
→ child return
→ child close
→ caller resume with fresh activation
```

可以被 SDK 折叠为业务代码中的：

```ts
const result = await frame.call(...);
```

因此本包的 Subsystem-side peer 主要服务 `@loomrealm/subsystem` 实现，而不是业务作者。

---

## 4. 与基础包的依赖关系

目标依赖：

```text
@loomrealm/wire
        ↑
        │
@loomrealm/runtime-control
        ↑
        │
@loomrealm/main
@loomrealm/subsystem
```

同时，本包可以按真实需求使用：

```text
@loomrealm/foundation
    MessageCarrier
    injectable clock / timeout primitive
    small lifecycle primitive
```

职责必须保持：

```text
wire
    数据是否合法
    JSON / JSON-RPC / safe integer / closed schema / limits primitive

foundation
    已建立消息 carrier 与少量 async/lifecycle mechanism

runtime-control
    Runtime Control 协议消息意味着什么、如何 dispatch / correlate / enforce profile

main / subsystem
    收到合法协议动作后系统真正如何改变 authority / 业务状态
```

禁止：

```text
wire → runtime-control
foundation → runtime-control domain types
runtime-control → main implementation
runtime-control → subsystem business SDK implementation
runtime-control → transport-websocket / transport-messageport
```

---

## 5. 建议 package surface

目标 subpath：

```text
@loomrealm/runtime-control
@loomrealm/runtime-control/control
@loomrealm/runtime-control/frame
@loomrealm/runtime-control/profile
@loomrealm/runtime-control/testing
```

根入口只暴露稳定的高层公共类型/常量，不把所有内部 symbol 全量 re-export。

建议内部结构：

```text
packages/runtime-control/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── control/
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   ├── methods.ts
│   │   ├── errors.ts
│   │   └── state.ts
│   ├── frame/
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   ├── methods.ts
│   │   ├── errors.ts
│   │   └── state.ts
│   ├── profile/
│   │   ├── session.ts
│   │   ├── dispatcher.ts
│   │   ├── request-ids.ts
│   │   └── deadlines.ts
│   ├── main-peer/
│   │   └── index.ts
│   ├── subsystem-peer/
│   │   └── index.ts
│   └── testing/
│       ├── harness.ts
│       ├── trace.ts
│       └── fixtures.ts
└── test/
```

目录只是目标边界，不要求 Stage 1 一次全部创建。

---

## 6. Control 子域

`control/` 只实现 Subsystem Control v1。

### 6.1 精确 method surface

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

不得顺带加入：

```text
heartbeat
reconnect
resume
restart
Renderer Data endpoint
Content Grant
Frame method
```

### 6.2 类型 / schema

候选：

```ts
interface SubsystemHelloParamsV1 {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}

interface SubsystemHelloResultV1 {
  readonly protocolVersion: 1;
}
```

以及 status/shutdown/error 类型。

schema parser 应组合 `@loomrealm/wire` primitive：

```text
JSON object
closed keys
safe integer
UTF-8 limits
array count
```

本包负责字段的 Runtime Control 业务含义；`wire` 不得知道 `subsystem.hello`。

### 6.3 Control 状态 helper

允许提供协议状态约束 helper，例如：

```text
hello 必须为第一条 application message
hello 成功前无 authenticated operation
identified 后 connection identity 不可变化
ready→initializing 非法
failed terminal
shutdown intent 前 stopping 非法
```

但：

```text
stopped
process exited
kill escalation
restart policy
```

仍由 Supervisor / Main 角色层拥有。

---

## 7. Frame 子域

`frame/` 实现 Frozen Frame / Call v1 的 wire surface、错误分类、limits 与协议级 helper。

精确七个 Request：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

本包可以知道：

```text
frameId
activationId
FrameOutcome
FrameFailure
method direction
closed params/result schema
semantic error code
request deadline requirement
mutation gate requirement
commit evidence classification
```

本包不得自己拥有：

```text
Main authoritative Stack
Main Frame Registry
Frame ID allocation policy implementation across Session
InputTarget publication
failure unwind 的真实状态修改
Subsystem business frame context
```

可以提供纯 helper / transition validator，但真正 commit 必须发生在角色层。

---

## 8. Runtime Control Profile Session

整个包最核心的运行机制建议是一个 connection-scoped session：

```ts
createRuntimeControlSession({
  role: "main" | "subsystem",
  carrier,
  ...
});
```

精确 API 在实现期冻结；当前只冻结职责。

Session 负责：

```text
从 MessageCarrier 接收完整 application message
JSON / JSON-RPC parse
按 method surface 分流
校验 method direction
pending outbound request correlation
发送 Response / Error
connection-wide request-id allocation
hello 前/后 profile gating
carrier termination 事实传播
```

Session 不负责：

```text
修改 Main Stack
创建业务 Frame
执行 Subsystem 游戏逻辑
决定 Renderer/Data 状态
决定 Runtime restart
```

---

## 9. Shared Dispatcher

Subsystem Control 与 Frame / Call 共享同一条 Control Connection，因此必须由 connection-wide dispatcher 统一处理：

```text
MessageCarrier
      ↓
RuntimeControlDispatcher
      ↓
  ┌───┴────┐
control   frame
```

不得让：

```text
ControlDispatcher
FrameDispatcher
```

各自独立消费同一个 inbound stream。

原因：Response 只携带 JSON-RPC `id`，其 domain 必须通过该 connection 的 pending request table 关联。

---

## 10. Request ID namespace

同一发送方、同一 Control Connection 生命周期内，Control 与 Frame Request 必须共享 request-id namespace。

要求：

```text
positive safe integer
sender-local
connection lifetime never reused
pending collision forbidden
exhaustion never wrap
Main 与 Subsystem 两个方向 namespace 独立
```

因此 request-id allocator 属于 `profile/session`，不属于 `control` 或 `frame` 单独子域。

示例：

```text
Subsystem sender:
    subsystem.hello  id=1
    frame.call       id=2
    frame.return     id=3

Main sender:
    frame.initialize id=1
    frame.activate   id=2
    subsystem.shutdown id=3
```

两个方向 MAY 使用相同数值；同一方向不得复用。

---

## 11. Message carrier 边界

本包只消费已经建立好的：

```text
MessageCarrier<string>
```

或实现阶段冻结的等价 abstraction。

它不负责：

```text
WebSocket connect/listen/accept
MessageChannel 创建/transfer
process spawn
Worker 创建
bootstrap endpoint 发现
```

这些由 Host / adapter / composition root 完成。

本包只要求 carrier 至少满足：

```text
duplex
message-oriented
ordered per direction
message boundary preserved
termination observable
no adapter-level duplicate / retry
```

Control/Frame 对 carrier loss 的领域后果由各自协议/角色层解释。

---

## 12. JSON text / cross-platform policy

Desktop WebSocket 与 PWA MessagePort 都必须保持相同 Runtime Control application semantics。

建议 `runtime-control` 的 carrier boundary 使用 canonical JSON-compatible application message，而不得利用 MessagePort Structured Clone 扩展数据模型。

必须保持：

```text
undefined rejected
bigint rejected
NaN / Infinity rejected
transferable object 不进入 Runtime Control payload
JSON-RPC Batch rejected
one application unit = one JSON-RPC message
```

PWA 能使用 MessagePort 不意味着协议可以接受 WebSocket 无法表示的数据。

---

## 13. Typed peer API

在 Session 之上可以提供 Main-side / Subsystem-side typed peer，减少上层重复处理协议机械细节。

概念示例：

```ts
const peer = createMainRuntimeControlPeer({
  carrier,
  handlers: {
    onHello,
    onStatus,
    onFrameCall,
    onFrameReturn,
  },
});

await peer.frame.initialize(...);
await peer.frame.activate(...);
await peer.shutdown(...);
```

Subsystem side：

```ts
const peer = createSubsystemRuntimeControlPeer({
  carrier,
  handlers: {
    onShutdown,
    onFrameInitialize,
    onFrameActivate,
    onFrameSuspend,
    onFrameResume,
    onFrameClose,
  },
});

await peer.hello(...);
peer.status({ state: "ready" });
await peer.frame.call(...);
```

这些 peer 是协议 API，不是业务 SDK API。

业务 SDK 应在 `@loomrealm/subsystem` 再向上封装成：

```text
events
capability objects
async frame.call continuation
render/content/input 高层接口
```

---

## 14. Handler 与 Error Boundary

Handler 必须区分至少三类失败：

```text
1. Wire / JSON-RPC invalid
2. Runtime Control semantic error
3. Local implementation exception / protocol-fatal condition
```

标准 JSON-RPC error 由 session/dispatcher 统一编码，例如：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
```

LoomRealm semantic error 使用正式协议定义的：

```text
error.code = -32000
error.data.code = stable semantic code
```

例如：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
PROTOCOL_STATE_ERROR
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
```

不得用 arbitrary thrown message 代替稳定 wire code。

---

## 15. Deadline / timeout

机制统一，policy 分域。

Session 可以提供统一 sender-side request deadline machinery：

```text
start monotonic deadline
pending request table
on response resolve/reject
on timeout produce typed timeout fact
late response 不重新匹配新 operation
```

但不得建立一个跨协议万能 timeout 常量。

Frame / Call v1 继续 enforce 其 Frozen deadline profile；Control hello/ready/shutdown deadline 由 Control/Host policy 提供。

Frame state-changing request timeout/loss 的关键语义：

```text
success response      = known committed
explicit error        = known not committed / 按 error 分类
 timeout / loss        = ambiguous
```

对于协议规定为 fatal/ambiguous 的操作：

```text
no retry
no replay
no same-attempt resync
```

可注入 monotonic clock，以便 deterministic conformance。

---

## 16. Mutation gate

`frame.call` / `frame.return` 之类 sender-side state-changing operation 在 pending 期间需要阻止第二次 conflicting mutation。

`runtime-control` 可以提供：

```text
request pending / terminal observation
mutation gate primitive/helper
late response classification
```

但业务/authority 层决定：

```text
哪些普通输入暂停
Stack 如何 commit
Runtime failure 后如何 unwind
```

不得让 generic dispatcher 暗中修改 Frame authority。

---

## 17. `@loomrealm/subsystem` 对 Frame 的更高层封装

这是本包设计必须主动支持、但不直接实现的目标。

底层协议：

```text
frame.call Request
caller activation revoked
child frame lifecycle
frame.return Request
child close
frame.resume with fresh activation
```

业务 SDK 应可以折叠成：

```ts
const result = await frame.call("loom.menu", input);
// resume 后 continuation 从这里继续
```

因此 Subsystem-side peer 必须允许 SDK：

```text
将 outgoing call 与后续 resume 关联
隐藏 activationId 的手工管理
在 resume 时安装 fresh local authority/context
resolve 对应业务 Promise
```

普通业务作者不应被迫监听 `frame.resume` wire event。

---

## 18. Testing / Conformance 是一等 public capability

目标提供：

```text
@loomrealm/runtime-control/testing
```

用于验证：

```text
@loomrealm/main
@loomrealm/subsystem
transport adapters
future alternate implementations
```

测试层至少需要支持：

```text
MemoryCarrierPair
injectable monotonic clock
ordered trace
fault injection
timeout
response loss
connection loss
late response
semantic error
protocol error
normalized final state
```

不得要求所有协议测试都启动真实 WebSocket server / Node process。

真实 adapter 再单独验证其 carrier mapping 与同一 abstract trace 的 cross-transport equivalence。

---

## 19. Stage 0 — Boundary Draft

关闭条件：

- [x] package responsibility 明确；
- [x] Control / Frame / Profile 三层关系明确；
- [x] 与 wire / foundation / main / subsystem 边界明确；
- [x] 明确本包不是业务 SDK；
- [x] 明确 transport-independent；
- [x] 明确 conformance 为一等目标。

当前阶段完成后，不立即追求全部 Frozen Frame surface。

---

## 20. Stage 1 — Minimal Package Skeleton

只建立：

```text
package.json
tsconfig.json
src/control/
src/profile/
src/testing/
test/
```

第一阶段暂不要求完整 `frame/`。

关闭条件：

```text
workspace build PASS
exports 明确
只依赖 wire / foundation 中实际需要的最小 surface
无 WebSocket / MessagePort import
无 Main / Subsystem role implementation import
```

---

## 21. Stage 2 — Subsystem Control v1 vertical slice

实现：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

以及：

```text
JSON-RPC dispatch
request correlation
request-id allocation
hello-first-message gate
identity binding session state
Control semantic errors
```

使用 MemoryCarrier 完成：

```text
connect
→ subsystem.hello
→ identified
→ status(initializing)
→ status(ready)
→ subsystem.shutdown
→ ACK
→ carrier close
```

Stage 2 关闭条件：

```text
valid trace PASS
invalid first message fail-closed
invalid token/key 不泄漏具体原因
status closed schema PASS
illegal state transition rejected
request-id lifetime non-reuse PASS
unexpected carrier loss 可被上层观察为 protocol termination fact
```

---

## 22. Stage 3 — Runtime Control Profile closure

验证同一 physical Control Connection 上：

```text
Control + Frame domain 可以共享 dispatcher
Control + Frame outbound Request 共享 sender-local ID namespace
one application unit = one JSON-RPC object
JSON-RPC Batch rejected
message/depth/JSON limits 一致
```

此阶段可先使用一个最小 fake Frame method 验证 cross-domain correlation，再进入完整 Frozen Frame 实现。

---

## 23. Stage 4 — Frozen Frame v1 incremental implementation

按纵向事务增长，而不是七方法平铺：

```text
A. frame.initialize
B. frame.activate
   → initial Frame closure

C. frame.call
   → child initialize / activate

D. frame.return
E. frame.close
F. frame.resume
   → nested call / return / fresh resume closure

G. frame.suspend
   → administrative suspension closure
```

每增加一个事务立即补 conformance，而不是最后统一补测试。

---

## 24. Stage 5 — Failure / ambiguity / conformance closure

完成 Frozen Frame v1 中最关键的：

```text
commit evidence
mutation gate
timeout ambiguity
no retry
late response
protocol divergence
runtime failure propagation hooks
failure-unwind trace support
hard limits
cross-transport abstract trace
```

注意：

> 本包验证/表达 failure-unwind 规则，但真正修改 Main authoritative Stack 的实现仍属于 `@loomrealm/main`。

---

## 25. Stage 6 — SDK boundary validation

由 `@loomrealm/subsystem` 成为真实消费者，验证底层协议没有泄漏到业务 API。

至少跑通：

```ts
runtime.on("shutdown", ...);

const result = await frame.call("test.child", input);
await frame.return(result);
```

并证明业务测试代码中无需出现：

```text
JSON-RPC
request IDs
MessageCarrier
frame.resume
activationId 手工管理
WebSocket / MessagePort
```

如果业务 SDK 为实现常见场景不得不大面积暴露上述概念，应回到本包 boundary 重新评估。

---

## 26. v0.1 闭环定义

`@loomrealm/runtime-control` v0.1 不以“所有未来 feature 都实现”为关闭条件。

一个可优雅关闭的 v0.1 应至少证明：

```text
1. Control v1 hello / ready / shutdown 可执行；
2. Runtime Control Profile shared dispatcher / ID namespace 可执行；
3. Frozen Frame v1 initial frame 可执行；
4. nested call → child return → close → fresh caller resume 可执行；
5. timeout / loss 不产生 retry / rollback；
6. Main 与 Subsystem conformance harness 可以独立跑；
7. MemoryCarrier 与至少一个真实 transport adapter 得到等价 protocol trace；
8. @loomrealm/subsystem 能把协议折叠成业务事件 + capability call；
9. 业务 Subsystem 无需直接依赖 runtime-control；
10. wire / foundation / runtime-control / role package 的依赖方向保持干净。
```

达到以上条件后，应该停止扩展本包的抽象范围，继续推进 Main / Subsystem / launcher / transport vertical slice。

---

## 27. 明确禁止的演化方向

不得把本包演化为：

```text
万能 RPC framework
WebSocket manager
MessagePort manager
process supervisor
Main runtime implementation
Subsystem business SDK
Renderer/Data protocol aggregator
retry/reconnect framework
cross-platform host abstraction
```

以下信号意味着边界开始失效：

```text
runtime-control import child_process
runtime-control import DOM / Worker API
业务 map package 直接 import runtime-control/frame
session 自动修改 Main Stack
session 自动决定 Runtime restart
Control/Frame/Data/Render 全塞进一个 dispatcher domain
为方便而加入非正式协议 method
```

---

## 28. 最终原则

`@loomrealm/runtime-control` 的价值不在于隐藏所有 LoomRealm 语义，而在于把协议机械细节集中到正确的一层：

```text
wire
    JSON / JSON-RPC 数据事实

foundation
    portable async / message mechanism

runtime-control
    Runtime Control 协议事实与 connection machinery

main / subsystem
    authoritative role implementation

subsystem SDK surface
    业务事件 + capability API

map / battle / menu / other business subsystem
    只写游戏逻辑
```

最终目标：

> **协议保持严格、跨平台 carrier 可替换、角色 authority 不混乱，同时业务 Subsystem 作者只需要处理领域事件与高层调用，不需要思考消息格式、请求编号、transport 或 Frame wire choreography。**
