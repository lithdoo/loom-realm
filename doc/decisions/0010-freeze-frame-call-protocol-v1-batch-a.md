# ADR 0010：冻结 Frame / Call Protocol v1 Batch A

> 状态：Accepted  
> 日期：2026-08-03  
> 影响范围：Frame identity、Frame lifecycle、Activation、Stack authority、Main / Subsystem / Renderer Frame 边界  
> 对应契约：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)

## 背景

Subsystem Control Protocol v1 已经独立冻结 Runtime Container 级 Bootstrap、identity、ready、shutdown、failure 和 Supervisor 语义。Frame / Call 不再需要承担 Runtime lifecycle 职责。

此前 `system-lifecycle-protocol.md` 已经形成以下方向：

- Frame 是 Main 管理的 call / User Input Context；
- Main 是 Stack / Activation / Input Target 权威；
- Frame 不拥有 Render；
- 同一 Runtime Container 可以承载多个 Frame；
- Frame suspend / resume / close 不隐式改变 Render。

但仍存在三个基础歧义：

1. Frame 是否需要独立 `ready`；
2. `failed` 是 Frame lifecycle state 还是调用结果；
3. Activation 是否可以恢复、复用或回滚。

这些问题如果不先冻结，会直接污染后续 RPC Schema、Call transaction、error model 和 Runtime failure unwind。

## 决定

Frame / Call Protocol v1 采用分批冻结。

Batch A 现在冻结：

```text
Identity
Authority
Lifecycle
Activation
ordinary input eligibility
stable Stack invariants
Outcome vs lifecycle separation
```

后续 Batch B+ 不能静默改变 Batch A。

### Frame authority

Frame 是 Main-owned control object。

Main 唯一拥有：

```text
frameId
Frame → descriptor.key assignment
callerFrameId
Frame lifecycle
Frame Stack
activationId
ordinary Input eligibility
Input Target
```

Subsystem 负责维护与这些身份对应的内部 Frame/Input Context，但不能自行改变公共 Frame topology 或 Activation。

### Frame identity

`frameId`：

```text
Main-generated
Session-scoped unique
opaque
never reused
```

Frame 创建时永久绑定一个 `descriptor.key`，并永久确定 `callerFrameId`。

当前 Frame / Call v1 不使用旧 `systemId` 作为新的身份来源。旧 `systemId` 只在 Legacy 数据协议兼容上下文中保留。

### Lifecycle

Frame lifecycle 固定为：

```text
starting
active
suspended
closing
closed
```

不增加 Frame：

```text
ready
initialized
failed
completed
cancelled
```

作为公共 lifecycle state。

`closed` terminal，`frameId` 不复用。

### No Frame ready

Frame initialization success 只表示目标 Subsystem 已安装 Frame/Input Context，可以接受首次 Activation。

它不表示 active、Input Target、Render ready 或任何 Render lifecycle。

因此 v1 没有：

```text
frame.ready
frame.status
```

### Outcome 与 lifecycle 分离

```text
completed
cancelled
failed
```

属于 Frame / Call termination outcome，不是生命周期状态。

即使 Frame 因业务 failure 或 Runtime failure 终止，也仍需要通过 `closing → closed` 表达 Frame Context cleanup 生命周期。

### Activation

`activationId`：

```text
Main-generated
Session-scoped unique
opaque
never reused
```

只有 `active` Frame 才拥有有效 current Activation。

Frame 首次 active 以及每次从子调用恢复时都获得全新的 Activation。

冻结：

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

这使迟到 User Input 可以通过 `frameId + activationId` 被确定拒绝。

### Stack stable state

v1 使用 Main-owned 单一 LIFO Call Stack。

稳定状态：

```text
Stack Top = active
all other live Frames = suspended
```

事务切换期间可以短暂没有 active Frame，但不得向 Renderer 发布两个同时有效的 ordinary Input Target。

## 结果

后续 Frame / Call 设计必须基于：

```text
Frame identity is stable.
Frame lifecycle is not business outcome.
Activation is a one-shot input epoch.
Main owns all public Frame topology.
```

这会直接约束：

- Batch B 的 7 个 RPC Schema；
- Batch C 的 call / return transaction；
- Main ⇄ Renderer Control 的 Input Target commit barrier；
- User Input Protocol 的 stale Activation rejection；
- Batch E Runtime failure unwind。

## 文档命名调整

原 `system-lifecycle-protocol.md` 名称容易与已冻结的 Subsystem Runtime Lifecycle 混淆。

当前权威 Frame 文档迁移为：

```text
frame-call-protocol-v1.md
```

旧路径保留 Legacy / redirect 说明以维持历史链接，不再作为当前设计来源。

## 暂缓

Batch A 不冻结：

- 7 个 Frame / Call RPC 最终 JSON Schema；
- Call establishment / Return transaction；
- commit barrier / rollback；
- semantic error code；
- timeout / retry；
- caller cancellation；
- Runtime failure suffix-unwind；
- wire limits；
- Frame / Call 独立版本协商。

这些项目不得重新打开 Batch A 已冻结的 identity / lifecycle / Activation 决策。

## 重新评估条件

出现以下需求时必须通过新 ADR / 协议版本重新评估：

- 多个同时 ordinary-active Frame；
- Frame migration 到不同 Subsystem；
- activationId 复用或持久化恢复；
- 多主栈或一般 Frame Graph 成为 v1 必需能力；
- 需要把 Frame business outcome 暴露为长期生命周期状态。
