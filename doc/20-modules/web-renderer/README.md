# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input 上行和 Main committed control/recovery state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Render Registry / Store / Scheduler
├── Frame Input Registry / Input Router
├── Resource Client
└── Presentation State
```

## 2. Renderer 不是 Frame RPC Participant

Frame / Call 七个 RPC只存在于 Main⇄Subsystem Control。Renderer不发送/处理 initialize/activate/suspend/resume/close/call/return，也不决定 timeout、error classification 或 Runtime failure unwind root。

Renderer只镜像 Main已 commit的 Runtime/Frame Stack/lifecycle/current Activation/InputTarget。

## 3. Normal Publication Barrier

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

Main MAY coalesce intermediate revision，但不得提前发布 Activation、revive revoked Activation或暴露两个 ordinary InputTargets。

`InputTarget=null` 是合法 normal transaction gap。

## 4. Batch E Failure Visibility

Runtime failure recovery开始后，Renderer只服从 Main的 Failure Unwind Barrier 投影：

```text
old affected InputTarget disappears
→ recovery may remain InputTarget=null
→ Stack/lifecycle revisions may shrink as suffix unwinds
→ only final healthy Caller resume ACK can publish a new InputTarget
```

Renderer MUST NOT：

```text
根据 failed subsystemKey 自己计算/修改 Stack
只隐藏 failed Runtime自己的 Frame而保留 descendants
根据 cached Caller恢复 old Activation
根据 Data reconnect恢复 Frame authority
根据迟到 Frame RPC Response撤销 Main failure
```

Unwind root、whole suffix、fixed-point expansion都由 Main决定。

## 5. Control State Store

稳定状态：Stack Top=active+current Activation，lower live Frames=suspended。

Recovery合法状态包括：

```text
Top closing
zero active Frame
InputTarget=null
多个 Frame 连续从 suffix移除
```

Renderer必须接受这些状态，不把它们当成需要本地修复的异常。

## 6. Frame Input Router

```text
raw input
→ read Main current InputTarget
→ if null: do not route ordinary input
→ require mirrored Frame active/current Activation
→ choose Subsystem Data Connection
→ User Input Protocol
```

revoked/removed Frame的历史输入不得发送。Recovery gap期间 Renderer停止 ordinary input，不缓存后在新 Activation下重放旧动作，除非未来 User Input Protocol明确允许某类输入语义。

## 7. Runtime Failure Outcome 对 Renderer 的含义

`SUBSYSTEM_RUNTIME_FAILED` 是 Caller-visible Frame outcome code，不是 Renderer用来决定 Stack的命令。Renderer只展示 Main/业务层最终状态；基础设施 diagnostics如 `FRAME_CONTROL_TIMEOUT/DIVERGENCE/PROTOCOL_ERROR` 可另行展示，但不改变 input authority。

## 8. Data / Render Independence

Runtime failure可能使对应 Data Connection authority失效；这不等于 Renderer可以删除所有相关 Render state并推导 Frame lifecycle。

Frame close/unwind不自动删除 Render Record。Render recovery、snapshot、visibility/order仍属于 Render Protocol。

## 9. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/lifecycle
→ restore current Activation/InputTarget
→ rebuild Data Connections
→ independently restore Render State
```

Reload不得恢复 cached old Activation、未 commit transaction state、已被 Main logical-retire 的 Frame或已 failed Runtime的旧 input authority。

如果 reload发生在 Batch E unwind中，Renderer只接受 Main当时的 recovery snapshot/revision，不能终止或重启 recovery。

## 10. Cancellation Boundary

Renderer不能代表 suspended Caller发送 `frame.cancel`。UI取消通过当前 active Frame的 User Input交给 Subsystem，由 active Frame自行决定是否 return cancelled。

## 11. Core Invariants

- Renderer不参与 Frame RPC/retry/unwind；
- Renderer只镜像 Main committed authority；
- normal/recovery `InputTarget=null` 合法；
- ACK-before-publication；
- revoked Activation never reappears；
- Runtime failure root/suffix由 Main决定；
- recovery期间不恢复 cached target；
- only final resume ACK publishes new target；
- no two ordinary InputTargets；
- no caller-driven Frame cancellation；
- Frame/Render/Data lifecycle独立。
