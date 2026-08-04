# ADR 0011：冻结 Frame / Call Protocol v1 Batch B

> 状态：Accepted  
> 日期：2026-08-04  
> 决策范围：Frame / Call Protocol v1 RPC wire surface

## 背景

ADR 0010 已冻结 Frame / Call v1 Batch A：Frame identity、Main authority、lifecycle、Activation、Stack stable-state 与 outcome/lifecycle 分离。

下一步需要冻结 Main ⇄ Subsystem Frame / Call 的实际 wire surface，否则 Main、Subsystem SDK 与测试实现仍可能分别选择不同方法名、字段、Caller identity 复制方式和结果交付模型。

## 决策

Frame / Call Protocol v1 的完整 RPC surface 固定为七个 JSON-RPC Request：

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

v1 不定义 `system.call / system.return`、`frame.ready / frame.status / frame.result / frame.cancel`。

### Identity

所有 Frame RPC 显式携带 `frameId`。

- `frame.activate` / `frame.resume` 携带 Main 新生成的 Activation；
- `frame.suspend` / `frame.call` / `frame.return` 携带当前 Activation；
- source Subsystem identity 来自已经由 `subsystem.hello` 认证并绑定 `descriptor.key` 的 Control Connection；
- Main→Subsystem RPC 不重复携带 `sourceSubsystemKey / systemId`；
- `frame.call` 只携带目标 `targetSubsystemKey`。

### Caller relationship

`callerFrameId` 继续是 Main-owned Frame relationship，但不进入 Main ⇄ Subsystem Frame RPC wire。

特别：

```text
frame.initialize
    不携带 callerFrameId

frame.return
    不携带 callerFrameId
```

Subsystem 只能提交当前 Frame 的 call/outcome，不能自行选择 Caller 或 Result receiver。Main 根据 Frame Registry 决定 direct Caller。

### Frame Outcome

最终 wire union：

```ts
type FrameOutcome =
  | { type: "completed"; value: JsonValue }
  | { type: "cancelled" }
  | { type: "failed"; error: FrameFailure };
```

`completed.value` 必填；无返回值使用 `null`。

`FrameOutcome.failed` 是调用终止结果，不等于 JSON-RPC Error。

### Resume

`frame.resume` 在一个 RPC 中同时：

```text
deliver returned child outcome
+
install replacement activationId
```

不拆成 `frame.resume` 后再 `frame.activate`。

### Close

`frame.close` v1 只携带 `frameId`，不携带 `reason / outcome / callerFrameId / activationId`。

关闭原因属于 Main transaction/failure policy，不改变“删除目标 Frame/Input Context”这一基础 contract。

### Result delivery

`frame.call` 只建立 Child call，不作为等待最终业务结果的 long-running RPC。

Child 的最终结果固定沿：

```text
Child → Main
    frame.return(result)

Main → Caller
    frame.resume(result + new activationId)
```

交付，不定义独立 `frame.result`。

### Schema policy

RPC params/result、`FrameOutcome` 与 `FrameFailure` 使用 closed schema，不提供开放式 metadata bag。

结构错误使用 JSON-RPC `-32602 Invalid params`；稳定 semantic error code 与 fatal/local policy 留给 Batch D。

## 不在本 ADR 中冻结

- Call / Return 的跨 RPC 精确事务顺序；
- `frame.call` success Response commit point；
- Main ⇄ Renderer Input Target publish barrier；
- partial transaction rollback；
- timeout / retry / idempotency；
- caller cancellation；
- Runtime failure suffix unwind；
- wire numeric limits；
- Frame / Call 独立 version/profile completion。

这些分别由 Batch C-F 冻结，并不得静默改变 Batch A/B 已确定的 identity、lifecycle 或 wire fields。

## 结果

Main、Subsystem SDK 与 conformance fixture 可以从现在开始实现稳定的七方法 Schema，而不需要等待事务、错误和故障展开全部设计完成。

Frame / Call Protocol v1 整体仍保持 Draft，只有 Batch A / B 为 Normative / Frozen。
