# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和 Main committed control state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer–Subsystem 协议分层](../../10-architecture/renderer-subsystem-protocol-layers.md)  
> 最近复核：2026-08-04

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Connection Protocol Adapter
├── Render Registry / Store / Scheduler
├── Frame Input Registry / Input Router
├── Resource Client
└── Presentation State
```

Render 与 User Input 是独立协议域。

## 2. Renderer 不是 Frame RPC Participant

Frame / Call 七个 RPC 只存在于 Main⇄Subsystem Control Connection。Renderer不直接发送或处理 initialize/activate/suspend/resume/close/call/return，也不参与 Frame timeout/retry 判定。

Renderer 只接收 Main 已 commit 后的 Runtime/Frame Stack/lifecycle/current Activation/InputTarget 投影。

## 3. Control State Store

稳定状态：Stack Top=active+current Activation，lower live Frames=suspended。

合法 transaction gap可以是 `InputTarget=null`、Top starting/closing。Renderer必须接受该状态，不得自行恢复 old target。

## 4. Publication Barrier

```text
frame.activate ACK
    happens-before Child Activation/InputTarget publication

frame.resume ACK
    happens-before Caller replacement Activation/InputTarget publication

old Activation revoke commit
    happens-before later revisions stop advertising it
```

Main MAY coalesce intermediate revisions，但不得提前发布 Activation、revive revoked Activation 或暴露两个 ordinary InputTargets。

## 5. Batch D Failure Visibility

Frame Control timeout/divergence/protocol error发生在 Main⇄Subsystem Control Plane。

Renderer MUST NOT：

```text
把 Frame RPC timeout 解释为 Renderer reconnect issue
通过本地 cached Activation 恢复输入
通过 Data Connection resync 恢复 Frame authority
根据迟到 Frame Response改变 Main failed state
```

Main 最终把 Runtime/Frame failure状态发布给 Renderer后，Renderer只按新的 committed authority停止输入并更新 UI/diagnostics。具体 Runtime failed后的 Stack unwind由 Batch E决定。

## 6. Frame Input Registry / Router

```text
raw input
→ read Main current InputTarget
→ if null: do not route ordinary input
→ require mirrored Frame active
→ require activationId == current Activation
→ choose Subsystem Data Connection
→ User Input Protocol
```

Renderer不得为 suspended/closing/closed Frame发送 ordinary input，不使用 historical Activation，不根据 Render focus/z-index改变公共 InputTarget。

## 7. Call / Return 可见性

Renderer MAY只观察 F1/A1→F2/A2，而不观察全部内部 transaction phase；前提是 F2/A2只有 Child activate ACK后发布，F1/A1 revoke后不再出现。Return同理，Caller replacement Activation只有 resume ACK后可见。

## 8. System Data / Render

每 Subsystem最多一条有效 Data Transport。Data Connection failure停止 ordinary input，但不修改 Main Frame lifecycle；Frame Control failure也不通过 Data reconnect恢复。

Render Record不包含 Frame ownership。Frame suspended/closing/closed不自动删除 Render Store；Scheduler不读取 Stack决定 Render visibility/order/destroy。

## 9. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/lifecycle
→ restore current Activation/InputTarget
→ rebuild Data Connections
→ independently restore Render State
```

不得恢复 cached old Activation、未 commit transaction state或已被 Main判定 failed 的 Frame Control authority。

## 10. Cancellation Boundary

Renderer不能代表 Caller发送 `frame.cancel`。如果 UI操作需要“返回/取消”，它通过当前 active Frame的 User Input到 Subsystem，由 active Frame决定是否 `frame.return({type:"cancelled"})`。

## 11. Core Invariants

- Renderer不参与 Frame RPC/error retry；
- Renderer只镜像 Main committed authority；
- transaction gap `InputTarget=null` 合法；
- activate/resume ACK precedes publication；
- revoked Activation never reappears；
- Frame Control timeout/divergence不由 Renderer resync修复；
- no two ordinary InputTargets；
- no caller-driven Frame cancellation from Renderer；
- Frame/Render/Data lifecycle独立；
- DOM/Canvas/WebGL not authority。
