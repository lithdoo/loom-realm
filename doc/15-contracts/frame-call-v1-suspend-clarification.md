# Frame / Call v1 Suspend Semantics Clarification

> 层级：正式契约 / Normative Clarification  
> 状态：Active / Normative  
> 适用协议：`loomrealm.frame-call / 1`  
> 稳定程度：Frozen Clarification  
> 依赖：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-08

本文不新增或修改 Frame / Call v1 wire method、params、result、error code 或 lifecycle state。本文只澄清 `frame.suspend` 与 `frame.resume` 的既有 v1 语义，使七方法 surface 闭合且不会被实现扩展成未冻结的 generic pause/resume。

## 1. 背景

Frame / Call v1 已冻结：

```text
lifecycle = starting / active / suspended / closing / closed
```

并包含：

```text
frame.suspend({frameId, activationId})
frame.resume({frameId, activationId, returnedFrameId, result})
```

同时 ordinary `frame.call` 的 Caller suspension 是 Main acceptance commit，不依赖 reverse `frame.suspend`。

`frame.resume` 的 frozen schema 明确承担：

```text
deliver returned child outcome
+
install fresh replacement Activation
```

因此 v1 不存在一个“不带 child outcome 的 generic resume” wire operation。

## 2. 两种 suspended 来源

公共 lifecycle仍只有一个 `suspended` 状态，但 Main内部必须区分 suspension provenance。

概念上：

```ts
type SuspensionCauseV1 =
  | "child-call"
  | "administrative";
```

该字段是 Main-private state，不进入 Frame v1 wire。

### 2.1 Child-call suspension

ordinary call acceptance：

```text
Caller active/A1
→ accept frame.call
→ revoke A1
→ Caller suspended (cause=child-call)
→ Child starting/pushed
```

Child terminal cleanup后，Caller可以使用既有 frozen `frame.resume` 恢复：

```text
frame.resume({
  frameId: Caller,
  activationId: fresh,
  returnedFrameId: Child,
  result: ChildOutcome
})
→ ACK
→ Caller active/fresh Activation
```

只有此类 suspension 具有 v1 normal resume path。

### 2.2 Administrative suspension

Main显式发送：

```text
frame.suspend({frameId, activationId})
```

成功后：

```text
old Activation permanently revoked
Frame suspended (cause=administrative)
ordinary input disabled
```

v1 **不提供 generic reactivation operation**。

该 Frame 后续合法公共方向是：

```text
suspended → closing → closed
```

或进入既有 Runtime failure cleanup path。

实现 MUST NOT 为 administrative suspension伪造 Child、`returnedFrameId` 或 `FrameOutcome` 来调用 `frame.resume`。

## 3. `active ↔ suspended` 的精确解释

主协议中生命周期图的：

```text
active ↔ suspended
```

不得解释为“任何 suspended Frame 都可以任意 resume”。

精确含义是：

```text
active → suspended
    child-call acceptance
    OR explicit frame.suspend ACK

suspended → active
    only child-call suspension
    AND only through valid frame.resume carrying the corresponding returned child outcome
```

administrative suspension没有 `suspended → active` v1 path。

## 4. `frame.suspend` 不参与 ordinary call

继续保持 Frozen invariant：

```text
ordinary frame.call
MUST NOT depend on
Main → same Subsystem frame.suspend
```

Main直接在 Call Acceptance Commit中撤销 Caller Activation并把Caller设为 suspended。

这避免 Subsystem→Main `frame.call` pending时要求 nested reverse Request handler。

## 5. Input / Activation

任意 suspension发生后：

```text
currentActivationId = null
old activationId permanently revoked
InputTarget MUST NOT reference that Frame/old Activation
```

administrative suspended Frame不得接收 ordinary User Input。

如果未来需要让其重新 active，必须使用新协议版本显式定义新的 reactivation wire，不得复用旧 Activation。

## 6. Failure behavior

`frame.suspend`仍是 state-changing Frame Request，因此继续服从 Frame / Call v1 Batch D：

```text
Success        → revoke/suspend known committed
Explicit Error → suspend known not committed, then classify error
Timeout/loss   → ambiguous → Runtime failure
```

不得 retry/replay `frame.suspend`。

Runtime failure后按既有 Batch E unwind执行，不新增 suspend-specific recovery RPC。

## 7. Conformance additions

Frame / Call v1 fixture corpus SHOULD增加：

```text
explicit-suspend-revokes-activation
explicit-suspend-disables-input
explicit-suspend-no-generic-resume
explicit-suspend-may-close
explicit-suspend-timeout-runtime-fatal
call-suspension-does-not-send-frame-suspend
child-call-suspension-resumes-only-with-returned-child
administrative-suspend-cannot-forge-returned-child
```

这些 fixture只验证已经由 v1 wire与本文 clarification确定的行为，不改变 `protocolVersion=1`。

## 8. Future version boundary

如果未来确实需要：

```text
pause Frame without Child
→ later resume same logical Frame
```

应在 Frame / Call v2 中选择明确设计，例如：

```text
frame.reactivate({frameId, freshActivationId})
```

或删除显式 `frame.suspend` 并采用新的控制模型。

不得通过以下方式扩展 v1：

```text
returnedFrameId = null
fake returnedFrameId
result = null
private resume mode
reuse old activationId
```

## 9. Final clarification

Frame / Call v1 中：

```text
child-call suspension     = resumable through existing child-return frame.resume
administrative suspension = one-way quiesce toward close/failure cleanup
```

该区分是内部 provenance，不增加公共 lifecycle state，也不改变七方法 Frozen wire。