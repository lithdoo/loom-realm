# Main ⇄ Subsystem Runtime Control Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Active / Normative  
> Profile 版本：1  
> 稳定程度：Frozen  
> 主要定义：同一 Main ⇄ Subsystem Control Connection 上 Subsystem Control v1 与 Frame / Call v1 的组合、版本绑定和共享 JSON-RPC dispatcher 约束  
> 依赖：[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 决策记录：[ADR 0015：Frame / Call v1 Completion](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-05

本文不新增 Runtime/Frame method。它只冻结第一阶段 Main ⇄ Subsystem Control application profile 如何组合两个已经独立冻结的协议。

## 1. Profile Composition

```text
Runtime Control Application Profile v1
├── Subsystem Control Protocol v1
└── Frame / Call Protocol v1
```

组合版本固定为：

```text
Subsystem Control Protocol = 1
Frame / Call Protocol       = 1
```

Profile 自身不是新的 wire handshake，也不改变任何已有 method schema。

## 2. Profile Selection

Profile由 Host/runtime deployment在 Launch Attempt / Runtime实现配置中静态选择，不由 Game Package business input、Frame RPC或 Renderer协商。

当前 v1没有：

```text
runtime.profile.hello
frame.hello
frame.version
frame.capabilities
```

`subsystem.hello.protocolVersions` 继续只协商 **Subsystem Control Protocol**。它选中 Control v1，不表示该字段同时协商 Frame版本。

如果部署声明使用 Runtime Control Application Profile v1，则 Main与Runtime在连接建立前已经约定 Frame / Call v1 是后续 Frame application protocol。

## 3. Bootstrap / Ready Meaning

Connection仍严格按 Subsystem Control v1 bootstrap：

```text
connect
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

hello成功前不得执行 Frame / Call。

在本 Profile 下，Runtime报告 `ready` 除 Subsystem Control v1 已冻结含义外，还表示：

> Runtime implementation 声明自己能够接受本 Profile允许的后续 Frame / Call v1 operation，并完整承担 Subsystem角色的 v1行为。

这不是新增 ready wire字段，而是 enclosing Profile 对“后续允许的 Control operation”的静态绑定。

Main实现同样必须完整承担 Frame / Call v1 Main角色。

“只实现 initialize/activate、不实现 recovery”不属于本 Profile conformant implementation。

## 4. Shared Physical Connection

Subsystem Control与Frame / Call复用同一条 authenticated Main ⇄ Subsystem Control Connection。

```text
one Control Connection
├── Subsystem Control domain
│   ├── subsystem.hello
│   ├── subsystem.status
│   └── subsystem.shutdown
└── Frame / Call domain
    ├── frame.initialize
    ├── frame.activate
    ├── frame.suspend
    ├── frame.resume
    ├── frame.close
    ├── frame.call
    └── frame.return
```

Frame method只在 hello成功、Connection已绑定 `descriptor.key` 后合法。

## 5. JSON-RPC Application Unit

在本 Profile 的 Control Connection上，每个 transport application unit承载 exactly one JSON-RPC message object：Request、Response或 Subsystem Control Notification。

JSON-RPC Batch Array不在本 Profile中使用。

这是一条组合 Profile约束，不改变 Subsystem Control v1 三方法本身的 schema/type。

## 6. Shared Sender-side Request ID Namespace

由于 JSON-RPC Response只携带 `id`、不携带原 Request method，同一发送方在同一物理 Control Connection上的所有 outbound Request必须使用一个不会冲突/复用的 sender-local namespace。

因此本 Profile冻结：

```text
ID type = positive safe integer 1..2^53-1
sender-side Control Connection lifetime never reused
```

适用 Request：

```text
Subsystem → Main
    subsystem.hello
    frame.call
    frame.return

Main → Subsystem
    subsystem.shutdown
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
```

`subsystem.status` 是 Notification，没有 Request ID。

Main与Subsystem是两个独立 sender，因此两个方向 MAY 同时使用相同数值 ID。

实现 SHOULD 对每个 sender/Connection使用一个 connection-wide monotonic allocator。Allocator耗尽不得 wrap/reuse。

此组合约束不会把 JSON-RPC ID变成 operationId或 retry identity。

## 7. Message / JSON Limits

两个协议已经都把 Control application message限制在 `<=1 MiB`、JSON nesting `<=64` 的量级。本 Profile采用更严格者作为共享 carrier入口限制。

Frame message还必须满足 Frame / Call v1 的 business payload、identity、number、Unicode与字段 limits；Subsystem Control message还必须满足其 token/version/endpoint/error limits。

Desktop text carrier：实际完整 UTF-8 WebSocket text bytes `<=1 MiB`；Frame message同时满足 Frame reference compact semantic limits。

PWA MessagePort在未来 PWA Control Bootstrap Profile安全建立后，对 plain JSON object使用相应协议的 reference/semantic validation；Structured Clone不得绕过 Frame JSON model。

## 8. Deadlines Remain Protocol-domain Specific

共享 Connection不意味着共享 timeout语义。

Subsystem Control v1 的 connect/hello/ready/shutdown/termination deadline仍由其协议/Host policy定义。

Frame / Call v1 的七方法按发送角色使用 `1,000..300,000ms` sender-local monotonic deadline：Main发五个 lifecycle方法，Subsystem发 call/return。

不得用某个 Frame deadline覆盖 `subsystem.shutdown` deadline，也不得把 shutdown escalation套到普通 Frame timeout。

## 9. Failure Boundary

Subsystem Control failure与Frame Control failure最终都可以使同一 Runtime进入 terminal `failed`，但触发规则仍由各自协议定义。

Frame / Call v1 的 `FRAME_CONTROL_TIMEOUT / DIVERGENCE / PROTOCOL_ERROR` 汇入 Runtime failure后，Stack recovery按 Frame Batch E语义执行。

Profile不增加新的 reconnect/retry/resync行为。

## 10. Version Compatibility

Profile v1固定组合 Control v1 + Frame v1，不进行 Frame runtime downgrade。

未来若要组合：

```text
Subsystem Control 1 + Frame 2
```

或引入动态 capability/version negotiation，应发布新的明确 Runtime Control Application Profile版本，或新的 Subsystem Control handshake版本；不得静默改变本 Profile v1。

## 11. Transport Bindings

Desktop：本 Profile运行在 Subsystem Control v1 已冻结的 localhost WebSocket上。

PWA：未来 PWA Bootstrap/Control Profile负责安全建立对应 MessagePort；Port建立后，本 Profile的协议组合、Request ID namespace与 Frame application semantics保持不变。

PWA bootstrap尚未冻结不意味着 Runtime Control Application Profile v1 或 Frame / Call v1 application semantics仍是 Draft。

## 12. Conformance

Main/Subsystem对 Frame角色的兼容性由 [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md)验证。

Runtime Control Profile integration还必须验证：

```text
hello-before-frame-operation
hello-versions-control-only
shared-sender-id-namespace-across-control-and-frame
no-jsonrpc-batch-on-control-connection
ready-under-profile-requires-complete-frame-role
frame-failure-enters-runtime-failed-path
subsystem-shutdown-deadline-remains-distinct-from-frame-deadline
```

## 13. Frozen Invariants

1. Profile v1 = Subsystem Control v1 + Frame / Call v1；
2. 不新增 wire handshake/method/field；
3. `subsystem.hello.protocolVersions`只协商 Subsystem Control；
4. Frame version由 Profile静态绑定；
5. hello成功前无 Frame operation；
6. ready under Profile意味着完整 Frame v1角色支持；
7. 同一 sender/Connection的 Control + Frame Request共享 one-shot ID namespace；
8. JSON-RPC Batch不在本 Profile使用；
9. 各协议继续拥有自己的 schema/error/deadline semantics；
10. PWA bootstrap/profile establishment与 application semantics分层；
11. Future incompatible composition使用新 Profile/version，不静默改变 v1。
