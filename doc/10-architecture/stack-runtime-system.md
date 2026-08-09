# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交、错误边界、Runtime failure unwind 与 ordinary InputTarget  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)  
> 下层契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Frame v1 Suspend Clarification](../15-contracts/frame-call-v1-suspend-clarification.md)  
> 最近复核：2026-08-09

## 1. 设计目标

栈式运行系统为 Subsystem提供单一、可推理的 LIFO call / ordinary User Input模型。Frame只属于 Main控制的调用/输入域，不属于 Runtime lifecycle、Data Connection或 Render lifecycle。

当前 Runtime Control组合：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

## 2. Authority

Main是以下公共状态唯一权威：

```text
Frame identity / Frame→Subsystem
caller relationship
Frame lifecycle / terminal outcome
Stack
Activation
ordinary InputTarget
transaction commit
error classification
Runtime-failure unwind
```

Subsystem只维护本地 Frame/Input Context；Renderer只镜像 Main已 commit的 Stack/Activation/InputTarget。

## 3. Frame / Activation

```text
frameId
    Main-generated / Session unique / never reused

subsystemKey
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

currentActivationId
    non-null only when active
```

Activation是 one-shot ordinary-input epoch：never reused/resumed/rolled back。

Frame outcome=`completed/cancelled/failed`，与 lifecycle分离。

## 4. Stable Stack

稳定状态：

```text
Stack empty
OR
Top = active + current Activation
all lower live Frames = suspended + no Activation
```

transaction/recovery期间允许 starting/closing、zero active Frame、`InputTarget=null`，但禁止两个 active Frames/current Activations/ordinary InputTargets。

## 5. Frozen RPC Surface

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

七个方法全部为 JSON-RPC Request。无 Caller wire、close reason、`frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`。

Frame v1运行在 Runtime Control Profile v1中；`subsystem.hello.protocolVersions`只协商 Control version 1，Frame version 1静态绑定。

## 6. Mutation Serialization

Main对单一 Stack的 commit-sensitive mutation MUST串行执行。normal call/return与 Runtime failure unwind使用同一 serialization domain。

Subsystem outbound `frame.call / frame.return` pending时建立 mutation gate：Response前停止新的 ordinary input dispatch，并禁止第二个 call/return。

## 7. Normal Initial / Call / Return

Initial：

```text
allocate starting F0
→ initialize ACK
→ activate(fresh A0) ACK
→ commit active/A0
→ publish InputTarget F0/A0
```

Call：

```text
Caller active
→ Call Acceptance Commit
   Caller suspended / old Activation revoked
   Child starting / InputTarget=null
→ frame.call Success
→ Child initialize
→ Child activate(fresh Activation) ACK
→ publish Child InputTarget
```

Return：

```text
Child active
→ Return Acceptance Commit
   outcome stored / Activation revoked
   Child closing / InputTarget=null
→ frame.return Success
→ close ACK / pop Child
→ Caller resume(fresh Activation) ACK
→ publish Caller InputTarget
```

Response-before-dependent-RPC；activate/resume ACK-before-publication。

## 8. Suspend Clarification

`frame.suspend`有两种原因：

```text
child-call suspension
    recovery only by child outcome + frame.resume

administrative suspension
    v1 has no generic reactivation
    later closing/closed or failure cleanup only
```

不得伪造 child result把 `frame.resume`当 generic resume。

任何 suspend都会 revoke current Activation/InputTarget。

## 9. Error / Timeout

```text
Success Response
    → known committed

Explicit Error
    → known not committed

Timeout / response loss / pending connection loss
    → ambiguous
    → Runtime failure
```

Ambiguous不能猜测，也不能 state-changing retry/replay。

Recoverable Error只限 Frame v1明确分类；divergence/protocol error属于 Runtime-fatal control failure。

## 10. Runtime Failure Unwind

Main维护：

```text
failedRuntimeKeys
```

unwind root = live Stack中最下面的 `subsystemKey ∈ failedRuntimeKeys` Frame。

```text
root..top whole suffix doomed
→ establish failure barrier / InputTarget=null
→ cleanup Top→Bottom
→ failed Runtime Frames logical retire without normal Frame RPC
→ healthy doomed Frames best-effort close
→ cleanup failure may expand failed set/root
→ repeat to fixed point
```

同 Runtime多次出现时取最低 occurrence，不能只删最近 Frame。

## 11. Outcome / Surviving Caller

Return Acceptance已 commit的 outcome必须保留，即使之后 Runtime crash。

final root无 accepted outcome时：

```text
failed(SUBSYSTEM_RUNTIME_FAILED)
```

只对 final root下方 direct healthy Caller执行 fresh Activation `frame.resume`；ACK后才可再次发布 InputTarget。

resume failure会把 Caller Runtime加入 failed set并重新计算 root。

## 12. Runtime / Data / Render Independence

```text
Runtime ready != Frame exists
Runtime ready != Data Connection exists
Frame suspend != Data retire
Frame close != Data retire
Frame close/unwind != Render Domain destroy
Data reconnect != Frame recovery
```

Control v1 `ready`只表示 Runtime能够承担 Runtime Control Profile v1角色，不携 Renderer Data endpoint。

## 13. Control Carrier Integration

Control v1 + Frame v1共享 carrier时：

```text
one transport unit = one JSON-RPC message
no JSON-RPC Batch
shared sender-side Request ID namespace
```

Frame Request ID、JSON model、message/business payload limits与 deadline profile继续按 Frozen Frame v1。

Desktop/PWA platform binding可以不同，但建立后的 transaction/error/recovery semantics必须相同。

## 14. 核心不变量

1. Runtime Control=Control v1 + Frame v1；
2. Main拥有 Frame/Stack/Activation/InputTarget/recovery authority；
3. frameId/activationId不复用；
4. Stack mutation串行；
5. Response-before-dependent-RPC；
6. ACK-before-publication；
7. timeout/loss ambiguous→Runtime failure/no retry；
8. failure root取 lowest failed-runtime occurrence；
9. whole suffix fixed-point unwind；
10. accepted outcome不可覆盖；
11. surviving Caller使用 fresh Activation；
12. Runtime/Frame/Data/Render lifecycle互相独立。
