# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-04

## 1. 测试目标

测试不仅验证实现正确，还必须防止下层实现破坏上层架构边界。

第一阶段重点验证：

- Game Entry / Launcher / Supervisor / Subsystem Control v1 已冻结语义；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame = Main-owned call/input context；Render = Subsystem-owned context；
- Frame / Call Batch A 的 identity/lifecycle/Activation；
- Frame / Call Batch B 的 exact seven RPC wire surface；
- Caller relationship 不下发给 Subsystem；
- `frame.resume` = outcome delivery + replacement Activation；
- `frame.call` 不等待 Child 最终 result；
- Frame close 不改变 Runtime / Render / Data Connection；
- User Input / Render Update 使用独立协议域。

## 2. 测试层次

```text
Schema / Contract Test
→ Launcher Filesystem / Process Conformance
→ State Machine Fixture
→ Module Unit Test
→ Transport Conformance Test
→ Runtime Container Interop
→ Component Integration
→ Content Golden Test
→ End-to-End Vertical Test
→ Performance / Backpressure Test
```

已 Frozen 的 Contract 必须先有机器可校验 fixture，再允许 Main/SDK 各自实现。

## 3. Game Package / Launcher / Subsystem Control

继续覆盖：

### Game Package / Launcher

- duplicate key / unsupported Launcher；
- Entry absolute/traversal/URL/backslash/missing/directory/unsupported extension；
- symlink/junction/reparse escape 与 canonical containment；
- reserved env / env size；
- Descriptor 集合失败零 Process side effect；
- Host-selected Node / shell interpretation impossible / fixed cwd；
- Token registered before spawn / new per attempt / revoke on early failure；
- spawn success public state still `starting`；
- unexpected exit including code 0 → failure；
- no automatic restart；
- bounded termination。

### Subsystem Control v1

- hello auth / identity / version / duplicate connection；
- `identified → ready` 与 optional initializing；
- invalid/duplicate status fatal；
- Main-owned shutdown intent；
- `subsystem.shutdown` accepted ≠ stopped；
- unsolicited stopping fatal；
- shutdown timeout → Supervisor escalation；
- connection loss behavior；
- semantic `-32000 + error.data.code`；
- wire limits；
- no heartbeat / same-attempt reconnect / resume / automatic restart。

## 4. Frame / Call Batch A Conformance

至少覆盖：

```text
frame-id-unique
frame-id-no-reuse
permanent-subsystem-assignment
caller-immutable
lifecycle-starting-active-suspended-closing-closed
no-frame-ready
no-frame-status
no-frame-failed-lifecycle
outcome-failed-still-closes
activation-first
activation-resume-new-id
activation-revoked-rejected
activation-never-restored
stack-top-active
lower-frame-suspended
no-two-input-targets
runtime-not-ready-reject-frame
runtime-stopping-reject-frame
frame-close-does-not-destroy-render
frame-close-does-not-close-data-connection
```

## 5. Frame / Call Batch B Schema Conformance

### 5.1 Exact method surface

唯一合法方法：

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

必须显式拒绝：

```text
system.call
system.return
frame.ready
frame.status
frame.result
frame.cancel
frame.close-with-reason extension
```

### 5.2 JSON-RPC form

- 七个方法全部是 Request，不是 Notification；
- params 必须是 Object；
- params/result `additionalProperties=false`；
- missing/wrong-type/extra-field/invalid discriminant → `-32602 Invalid params`；
- Batch B Schema Test 不提前冻结 Batch D semantic error code。

### 5.3 `frame.initialize`

合法：

```json
{
  "frameId": "F1",
  "input": null
}
```

验证：

- required exactly `frameId + input`；
- no `callerFrameId`；
- no source `subsystemKey/systemId`；
- result `{}`；
- success 后仍是 `starting`、无 Activation。

### 5.4 `frame.activate`

验证：

- `frameId + activationId`；
- activationId 是 Main 新值；
- 只用于首次 activation，不作为 resume 的替代；
- result `{}`。

### 5.5 `frame.suspend`

验证：

- `frameId + current activationId`；
- success 后该 Activation 永久 revoke；
- result `{}`；
- 不隐式改变 Render/Data Connection。

### 5.6 `frame.resume`

验证 exact fields：

```text
frameId
activationId        // new replacement
returnedFrameId
result              // FrameOutcome
```

必须验证：

- no callerFrameId；
- Child outcome 和 replacement Activation 在 Subsystem-side 一个操作完成；
- 不允许 `frame.resume` 后再公共 `frame.activate` 才完成恢复。

### 5.7 `frame.close`

合法 params 只有：

```json
{ "frameId": "F1" }
```

以下必须 rejected as invalid params：

```text
reason
outcome
callerFrameId
activationId
subsystemKey
```

并验证 close 只删除 Frame/Input Context，不停止 Runtime、不 destroy Render、不关闭 Data Connection。

### 5.8 `frame.call`

合法 shape：

```text
frameId
activationId
targetSubsystemKey
input
```

success result：

```text
childFrameId
```

验证：

- source identity 来自 Control Connection；
- no source subsystem identity field；
- same-Subsystem call 合法且仍创建新 childFrameId；
- Request 只建立 Child call，不持续等待 Child outcome。

### 5.9 `frame.return`

合法 shape：

```text
frameId
activationId
result
```

验证：

- no `callerFrameId` / target receiver；
- Main Registry 决定 receiver；
- result 是 FrameOutcome；
- success result `{}`。

### 5.10 `FrameOutcome`

```text
completed
    { type:"completed", value: JsonValue }

cancelled
    { type:"cancelled" }

failed
    { type:"failed", error:{ code, message?, data? } }
```

必须测试：

- `completed.value` 缺失 → invalid params；
- 无业务返回值必须 `value:null`；
- cancelled 带额外 Payload → invalid params；
- failed 缺 error/code → invalid params；
- `FrameOutcome.failed` 不走 JSON-RPC Error envelope。

## 6. Batch C-F 的测试边界

Batch B fixture **不得提前编码**以下尚未冻结行为：

```text
call establishment exact ordering
frame.call response commit point
InputTarget publish barrier
partial rollback
semantic error codes
request timeout
retry / idempotency
caller cancellation
Runtime failure suffix unwind
wire numeric limits
```

这些分别在 Batch C-F 增加 fixture。这样 Schema Test 不会反向把未冻结实现偶然行为变成协议。

## 7. Renderer–Subsystem / User Input / Render

### Connection

- one active Data Connection per Subsystem；
- Main Grant auth / replace / revoke；
- zero-Frame Subsystem 可保持连接；
- Runtime stopping/failed 后不发新 Grant。

### User Input

- current active `frameId + activationId` only；
- revoked Activation rejection；
- Frame A/B isolation；
- Input Target change / blur reset；
- UI interaction 不假设 Render identity = frameId。

### Render

- independent Render identity；
- create/update/destroy/recovery；
- Frame suspend/close 不改变 Render epoch；
- zero-frame Render；
- shared Render across multiple Frames；
- Renderer reload 不按 Frame resync Render。

## 8. Main System Tests

- Descriptor / Launcher / Runtime Supervisor；
- Subsystem Control hello/status/shutdown；
- Frame Registry lifecycle/outcome separation；
- Activation uniqueness/revocation；
- exact Batch B RPC dispatcher；
- connection-bound source Subsystem identity；
- caller relationship only in Main Registry；
- call target resolution from `targetSubsystemKey`；
- same-Subsystem call produces new childFrameId；
- no `system.call / frame.result / close reason` compatibility shortcut；
- Main 不发布两个 ordinary Input Target；
- Main 不维护 Render Registry。

## 9. Subsystem SDK / Test Subsystems

SDK contract test：

```text
onInitialize(frameId, input)
onActivate(frameId, activationId)
onSuspend(frameId, activationId)
onResume(frameId, activationId, returnedFrameId, outcome)
onClose(frameId)
call(frameId, activationId, targetSubsystemKey, input)
return(frameId, activationId, outcome)
```

推荐 test-subsystems：

```text
frame-schema-valid
frame-schema-extra-field
frame-no-caller-wire
same-subsystem-call
nested-call
completed-null
failed-outcome
stale-activation
multi-frame-input
render-without-frame
shared-render-multi-frame
```

## 10. Content / Map / E2E

Content API 继续验证 path/grant/cache/ETag/read-only 与 Launcher capability 隔离。

`loom.map` 至少验证：

- Frame Control Adapter 符合 Batch B exact method fields；
- initialize 不依赖 callerFrameId；
- resume 同时收到 Child result + new Activation；
- no-value return 使用 `completed(value:null)`；
- Frame close 不隐式 destroy world/hud Render；
- 一个 Process 服务多个 Frame/Input Context；
- old Activation input rejected。

Desktop E2E：

```text
bootstrap all required Runtime
→ hello / ready
→ establish initial Frame
→ Frame initialize / activate
→ nested frame.call
→ child frame.return
→ caller frame.resume with new Activation
→ close child Context
→ Renderer reload
→ Render/Data recover independently
→ normal subsystem.shutdown
```

Batch C 冻结前，E2E 不把 call/suspend/push/activate 的某个具体中间顺序写成跨实现兼容要求。

## 11. Golden / Fixture 规则

适合 Golden：Game Package Descriptor、Launcher errors、Bootstrap Context、Subsystem Control messages、Frame/Call Batch B messages、Connection auth、User Input sequences、Render State/Event、Content Responses。

Golden 更新必须说明是协议设计变化还是回归修复。已 Frozen Batch 的 fixture 发生不兼容改变时必须先更新 ADR / compatibility decision。
