# `@loomrealm/runtime-control` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 最近复核：2026-08-19  
> 目标：把 Subsystem Control v1、Frame / Call v1 与 Runtime Control Application Profile v1 落成可执行、可测试、transport-independent 的协议实现层。  
> Author 映射唯一来源：[packages/subsystem/DESIGN.md](../subsystem/DESIGN.md)

核心原则：

> **本包实现“如何正确说 Runtime Control 协议”；Main / Subsystem role拥有真正 application authority；业务作者不直接消费本包。**

---

## 1. Composition

```text
Runtime Control Application Profile v1
├── Subsystem Control Protocol v1
└── Frame / Call Protocol v1
```

分别负责：

```text
Subsystem Control
    hello / identity binding
    initializing / ready / failed
    shutdown intent/reporting

Frame / Call
    Frame/Activation identity
    seven Requests
    call/return transaction
    commit evidence
    deadline/ambiguity/failure classification

Runtime Control Profile
    same Control carrier
    one dispatcher
    shared sender-side Request ID namespace
    application-unit / JSON limits
```

---

## 2. 本包负责

```text
Control/Frame schema + parser/encoder
method direction
JSON-RPC dispatch/correlation
connection-wide sender request-id allocator
profile hello gating
protocol-specific deadline machinery
semantic error envelope
carrier termination observation
role-neutral typed peers
conformance fixtures/harness
```

可以提供纯 state/helper validator，但不自己拥有 Main public authority。

---

## 3. 本包不负责

```text
Main Runtime Registry / Supervisor
Main Frame Stack / Activation allocation
Main InputTarget / Renderer authority
Runtime failure unwind真实 commit
Subsystem business Frame object model
Subsystem author API
Data Connection / User Input / Render Update
Content
WebSocket / MessagePort establishment
Process / Worker lifecycle
Desktop / PWA composition
```

禁止在本设计文档重新定义 author API 示例。

业务作者唯一依赖方向：

```text
business Subsystem
    → @loomrealm/subsystem
```

`@loomrealm/subsystem` MAY在内部消费本包 typed peer，并把协议映射成 `Frame / FrameOutcome / InputListener / RenderDomain`；具体映射不属于 runtime-control package contract。

---

## 4. 基础依赖

```text
@loomrealm/wire
    JSON / JSON-RPC / safe integer / closed object / limits primitives

@loomrealm/foundation
    MessageCarrier<string>
    Clock / timeout / small lifecycle primitives when real demand exists
```

依赖方向：

```text
wire      foundation
  \        /
   runtime-control
      ↑
 main / subsystem
```

禁止：

```text
wire → runtime-control
foundation → Runtime/Frame domain types
runtime-control → main implementation
runtime-control → subsystem author implementation
runtime-control → transport adapter
```

---

## 5. Package Surface

候选：

```text
@loomrealm/runtime-control
@loomrealm/runtime-control/control
@loomrealm/runtime-control/frame
@loomrealm/runtime-control/profile
@loomrealm/runtime-control/testing
```

内部：

```text
src/
├── control/
├── frame/
├── profile/
│   ├── session.ts
│   ├── dispatcher.ts
│   ├── request-ids.ts
│   └── deadlines.ts
├── main-peer/
├── subsystem-peer/
└── testing/
```

根入口不全量 re-export internal symbol。

---

## 6. Control Surface

精确：

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

不得添加 heartbeat/reconnect/Data endpoint/Frame method。

Control helper MAY enforce：

```text
hello first
hello one-shot
connection-bound descriptor.key
ready/stopping/failed transition legality
```

但 `stopped` 只由 Supervisor/role层的 actual termination observation产生。

---

## 7. Frame Surface

Frozen Frame / Call v1 exactly seven Requests：

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

本包知道：

```text
frameId / activationId
FrameOutcome / FrameFailure wire shape
method direction
closed params/result schema
semantic error code
deadline profile
commit evidence classification
mutation-gate requirement
```

本包不拥有：

```text
Main Stack
Session-wide Frame allocation implementation
InputTarget publication
failure unwind state mutation
Subsystem author Frame capability
```

---

## 8. Connection-scoped RuntimeControlSession

概念：

```ts
createRuntimeControlSession({
  role: "main" | "subsystem",
  carrier,
  ...
});
```

职责：

```text
one MessageCarrier inbound reader
JSON/JSON-RPC parse
method direction validation
pending request correlation
Response/Error send
connection-wide request-id allocation
hello-before-frame profile gating
carrier terminal fact propagation
```

不负责业务 state commit。

---

## 9. Shared Dispatcher

Control 与 Frame共享同一 carrier，必须：

```text
MessageCarrier
      ↓
RuntimeControlDispatcher
      ↓
  ┌───┴────┐
control   frame
```

不得由两个 reader竞争 `carrier.messages()`。

Response只有 `id`，pending table必须 connection-wide。

---

## 10. Request ID Namespace

同一 sender / same Control Connection：

```text
positive safe integer
never reused
no wrap
Control + Frame shared namespace
```

Main 与 Subsystem方向 namespace独立。

---

## 11. Carrier / Encoding

本包只消费 already-established：

```text
MessageCarrier<string>
```

Runtime Control Profile v1 固定：

```text
one carrier application unit
= one UTF-8 JSON text string
= one JSON-RPC message object
```

Desktop WebSocket 与 PWA MessagePort必须得到相同 string application model；PWA Structured Clone不得扩大协议 value model。

本包不负责：

```text
WebSocket connect/listen/accept
MessageChannel create/transfer
Process spawn
Worker create
endpoint/bootstrap discovery
```

---

## 12. Deadline / Commit Evidence

Frame Request统一分类：

```text
Success Response
    → known committed postcondition

Explicit recoverable Error
    → known not committed where protocol says so

Timeout / carrier loss
    → commit ambiguous
    → Runtime-fatal path
```

本包提供 deadline/late-response machinery；Main/Subsystem role决定 terminal state和 cleanup。

不得 retry/replay state-changing Frame request。

---

## 13. Typed Peer Boundary

可以提供 protocol-facing typed peers：

```text
Main peer
    hello/status handlers
    call/return handlers
    initialize/activate/suspend/resume/close senders
    shutdown sender

Subsystem peer
    hello/status senders
    call/return senders
    initialize/activate/suspend/resume/close handlers
    shutdown handler
```

这些 peer是**协议 API**，不是业务 SDK。

它们不得加入：

```text
InputListener
RenderDomain
ContentClient
business Frame continuation
runtime service locator
```

---

## 14. Error Boundary

至少区分：

```text
Wire / JSON-RPC invalid
Runtime Control semantic error
local implementation/protocol-fatal condition
```

标准 JSON-RPC：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
```

LoomRealm semantic error：

```text
error.code = -32000
error.data.code = stable code
```

role层不可把 protocol corruption伪装成普通 business Frame failure。

---

## 15. Testing

最低：

```text
hello-first
Control version selection
hello-before-frame
shared Control+Frame ID namespace
no JSON-RPC Batch
exact seven Frame methods
closed schemas/limits
response-before-dependent-RPC fixtures
success/error/ambiguous classification
timeout/loss late-response handling
no automatic retry
WebSocket/MessagePort same abstract trace
single carrier reader
```

`@loomrealm/subsystem` 的 author control-flow映射由其自己的 tests验证，不复制到本包。

---

## 16. Final Invariants

1. 本包实现 Runtime Control protocol mechanics，不拥有 product authority；
2. Control v1 与 Frame v1保持独立 protocol/version/state semantics；
3. Runtime Control Profile v1静态组合两者；
4. one Control carrier = one connection-wide dispatcher；
5. Control+Frame Request共享 sender-side ID namespace；
6. one application unit = one UTF-8 JSON text JSON-RPC object；
7. no Batch / no adapter retry；
8. timeout/loss ambiguity进入 role Runtime-fatal path；
9. Main/Subsystem role负责真实 authority commit；
10. author-facing API只由 `@loomrealm/subsystem` 定义。