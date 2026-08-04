# ADR 0012：冻结 Frame / Call Protocol v1 Batch C

> 状态：Accepted  
> 日期：2026-08-04  
> 影响范围：Frame / Call transaction、Stack mutation、Activation commit、Input Target publication、same-Subsystem recursion

## 背景

ADR 0010 已冻结 Frame identity / lifecycle / Activation，ADR 0011 已冻结七个 Frame / Call RPC 的 wire surface。剩余关键问题是这些 RPC 如何组成可恢复、可实现且不要求 Transport handler 重入的调用事务。

特别需要解决：

- `frame.call` 何时算逻辑 Child call 已建立；
- Caller old Activation 在何时永久失效；
- Child activate / Caller resume 与 Renderer Input Target publication 的因果关系；
- `frame.return` success 是否等于 Child 已 closed / Caller 已 resumed；
- partial failure 是 rollback 还是 forward recovery；
- same-Subsystem recursive call 共用一条 Control Connection 时，如何避免入站 Request handler 等待反向 Request 造成死锁。

## 决定

### 1. Batch C 成为 Normative / Frozen

Frame / Call v1 继续整体保持 Draft，但 Batch A / B / C 均成为后续批次不得静默改变的 Normative 基线。

### 2. Main 串行提交 Stack mutation

一个 Main-owned Frame Stack 同一时刻最多存在一个 commit-sensitive mutation transaction。事务可暂时没有 active Frame / Input Target，但不得产生两个 ordinary active/Input Targets。

### 3. `frame.call` Response 是 acceptance barrier

ordinary caller-initiated `frame.call` 不通过反向 `frame.suspend` RPC 建立 Caller suspension。

Main 验证成功后原子 commit：

```text
Caller active → suspended
old Activation revoke
Child identity allocated / starting / pushed
InputTarget → null
```

然后返回 `{ childFrameId }`。

因此 `frame.call` success 表示 logical Child call 已接受、Caller suspension 已 commit、Child identity 已 commit；不表示 Child 已 initialize / active。

Caller 收到 success 后必须本地视为 suspended，并永久 revoke old Activation。

### 4. Response-before-dependent-reverse-RPC

Main 必须完成 `frame.call` Response 后，才依赖后续 `frame.initialize / frame.activate`。

Main 必须完成 `frame.return` Response 后，才依赖后续 `frame.close / frame.resume`。

因此协议不要求 JSON-RPC handler 支持“处理一个入站 Request 时同时等待反向 Request”的重入模型，same-Subsystem recursive call 也可安全复用同一 Control Connection。

### 5. Activation publish barrier

```text
frame.activate ACK
    happens-before
对应 Child InputTarget publication

frame.resume ACK
    happens-before
对应 Caller replacement InputTarget publication
```

Main 不得发布尚未被目标 Subsystem ACK 的 Activation。Activation 一旦 commit revoked，后续 revision 不得再次把它发布为 current。

### 6. Return Acceptance 不可回滚

合法 `frame.return` 被 Main 接受时原子 commit：

```text
terminal outcome accepted
old Activation revoked
Frame → closing
InputTarget → null
```

随后 Main 返回 success。该 success 不表示 Child closed / popped 或 Caller resumed。

之后 `frame.close` ACK 才允许 Main commit Child `closed` / pop；Caller 只有在 Child closed/pop 后才能通过 `frame.resume` 获得 fresh Activation。

### 7. Pre-commit abort；Post-commit forward recovery

冻结：

```text
Pre-commit failure
    may abort without changing prior valid Activation

Post-commit failure
    must recover forward
    must not restore revoked Activation
    must not erase accepted terminal outcome
```

例如 `frame.call` 已 success 后 Child initialize/activate 失败，Caller 的 old Activation 不得恢复；该 Child 必须最终以平台 failed outcome 收敛，并用 fresh Activation resume Caller。

### 8. `frame.suspend` 的 v1 角色

`frame.suspend` 保留为 Main 主动 quiesce / terminal preparation 的控制原语，但不是 ordinary `frame.call` 建立步骤。其使用不得产生 Activation reuse 或绕过 Batch C transaction rules。

## 后果

优点：

- same-Subsystem / recursive call 不依赖 bidirectional nested-request reentrancy；
- Main、Subsystem、Renderer 对 commit point 有单一可测试定义；
- stale Input Target 不会在新 Activation 尚未安装时提前发布；
- partial failure 明确区分 abort 与 forward recovery；
- Activation never rolls back 从抽象不变量落实为事务规则。

代价：

- `frame.call` success 只表示 logical call accepted，而非 Child 已 active；
- call/return transaction 中会存在合法的 `InputTarget=null` gap；
- Subsystem SDK 需要为 outbound `frame.call / frame.return` 实现 mutation gate；
- Post-commit failure 需要 Batch D/E 提供一致的 failure recovery，而不能简单恢复旧状态。

## 明确未决定

本 ADR 不冻结：

- semantic error code registry；
- timeout 与 ambiguous delivery policy；
- retry / idempotency；
- caller-driven cancellation；
- Runtime crash multi-Frame unwind；
- wire numeric limits；
- Main ⇄ Renderer Control 的具体 wire Schema。

这些由 Batch D/E/F 与后续 Renderer Control Contract 继续冻结。
