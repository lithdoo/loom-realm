# M7 / 02 — Main Renderer Authority Projection

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：02  
> 最近复核：2026-09-03  
> 前置：[M7 / 01 — Renderer Control Package](M7_01_RENDERER_CONTROL_PACKAGE.md)  
> 目标：在 `@loomrealm/main` 内建立 Renderer-visible committed authority、`AuthorityRevision`、Snapshot projection 与 publication seam，使 Main 能通过 `@loomrealm/renderer-control` 发布只读完整状态，同时保持既有 Runtime/Frame/Stack authority 语义不变。

核心原则：

> **M7 不把 Renderer Control 协议塞进 Main mutation logic；Main 先完成 authority commit，再从 committed state 派生完整 Snapshot。**

---

## 1. Scope

本步骤修改：

```text
@loomrealm/main
```

消费：

```text
@loomrealm/renderer-control
```

可能继续消费既有：

```text
@loomrealm/runtime-control
@loomrealm/platform-ports
@loomrealm/wire
```

本步骤不修改 Runtime Control wire semantics，也不把 Renderer Control authority 下放到 protocol package。

---

## 2. Main Ownership

M7 后 Main 明确拥有：

```text
sessionId
AuthorityRevision
Renderer-visible Runtime projection
Renderer-visible live Frame Stack projection
current Activation projection
current InputTarget
DataAuthority logical allocation/generation/profile
rendererControlToken authority
current Renderer Control connection replacement decision
```

`@loomrealm/renderer-control` 只验证/传输这些事实。

---

## 3. Committed Authority Model

建议在 Main 内形成一个单一 Renderer-visible projection seam：

```text
Main mutation lane
      │
      │ commit Runtime / Frame / Activation / InputTarget / DataAuthority
      ↓
committed authority
      │
      ├─ bump AuthorityRevision when Renderer-visible state changed
      ↓
captureRendererAuthoritySnapshot()
      │
      ↓
immutable RendererAuthoritySnapshotV1
```

禁止：

```text
Runtime object emits renderer event
Frame object emits renderer event
Activation object emits renderer event
Renderer locally reconstructs Main state
```

Renderer-visible state必须从 Main 已提交事实一次性投影。

---

## 4. AuthorityRevision

`AuthorityRevision` 属于 Main Session authority，不属于 connection writer。

要求：

```text
positive safe integer
Session-local
strictly increasing on Renderer-visible committed authority change
never reused
never wraps
```

不应因为以下行为递增：

```text
Snapshot 被重新发送
Renderer reconnect
connection replaced
write retry（v1 本身禁止 adapter retry/replay）
non-renderer-visible internal bookkeeping change
```

应因为 Renderer-visible committed authority 变化递增，例如：

```text
Runtime observed lifecycle projection changes
Frame enters/leaves/changes lifecycle
fresh Activation commits
InputTarget changes
DataAuthority generation/profile changes or revoke
```

如果一次 Main transaction 同时改变多个 Renderer-visible fields，应只暴露 transaction commit 后的一致 Snapshot；不要按字段拆成多个半状态 revisions。

---

## 5. Snapshot Projector

Main 需要一个纯 projection boundary，概念上：

```ts
captureRendererAuthoritySnapshot(): RendererAuthoritySnapshotV1
```

具体函数名不在本草案冻结。

Projector 应：

```text
read committed Main authority only
return detached immutable value
not expose Main mutable Registry/Frame objects
not include operation history
not include call/return/unwind cause graph
not include transport endpoint/credential
not include Render/Input Interest/business state
```

投影结果必须满足正式 Renderer Control v1 的完整关系约束。

---

## 6. Runtime Projection

Main 将内部 Runtime facts 映射为：

```text
declared
starting
connected
identified
ready
stopping
stopped
failed
```

Renderer 看到的是 Main-observed lifecycle projection。

MUST NOT让 Renderer 根据 process/socket/runtime-control facts自行提升 lifecycle。

M6 已有的物理：

```text
spawned
connected
```

仍只是 evidence；Main 的 logical observed state保持 authority。

---

## 7. Frame / Activation Projection

Snapshot stack：

```text
bottom → top
live Frames only
```

必须遵守现有 Main Frame authority：

```text
at most one active Frame
active Frame = stack top
active Frame has current activationId
non-active Frame has no activationId in Renderer projection
```

关键 causal barrier：

```text
frame.activate ACK accepted
→ Main commits active + fresh Activation
→ revision may advance
→ Snapshot may publish Activation/InputTarget
```

```text
frame.resume ACK accepted
→ Main commits resumed active + fresh Activation
→ revision may advance
→ Snapshot may publish Activation/InputTarget
```

绝不能在 Runtime Control Response 被接受前预测成功并提前发布 InputTarget。

---

## 8. InputTarget Projection

Main 唯一生成 current `InputTarget`。

规则：

```text
null is valid
or exactly one {subsystemKey, frameId, activationId}
```

非空 target 必须引用 current active Frame 和同一 current Activation。

一个已撤销的：

```text
frameId + activationId
```

不得重新成为 InputTarget。重新授权必须使用 fresh Activation。

Renderer Interest、DOM focus、Data Connection 状态不得反向创建 Main InputTarget。

---

## 9. DataAuthority Projection

M7 只要求 Main 能表达 logical DataAuthority：

```text
{subsystemKey, generation, dataProfile}
```

M7 不要求真实 Data Connection 已经存在。

Main owns：

```text
whether authority exists
generation allocation
profile selection
replacement/revocation
```

Snapshot MUST NOT出现：

```text
WebSocket URL
MessagePort
bearer ticket
connection nonce
physical broker handle
```

M8 才关闭真实 Renderer Data consumer/provisioning。

---

## 10. Publication Seam

Main integration 应把协议 mechanics 隔离到一个窄 publication seam：

```text
committed authority changed
→ snapshot captured
→ renderer-control Main peer accepts latest committed Snapshot
```

Main mutation code不应知道：

```text
JSON-RPC method name
JSON serialization
carrier write
request ID
coalescing queue implementation
```

`@loomrealm/renderer-control` 不应知道：

```text
Frame Registry
Stack internal representation
Runtime Supervisor object
failure unwind implementation
```

---

## 11. Connection / Token Authority

Main owns `rendererControlToken` authentication decision。

要求：

```text
opaque
high entropy
Session-bound
one successful hello consumption
fresh token for new connection attempt/reload
```

Protocol package可以调用 Main-provided authentication callback/decision，但不得自己成为 token registry authority。

新 Renderer hello 成功并成为 current connection 后：

```text
old connection is no longer current
old connection receives no later publication
```

具体物理 carrier/token delivery 不在本步骤实现。

---

## 12. Runtime Failure / Unwind

M7 不改变 M5 已关闭的 failure/unwind authority。

顺序：

```text
Runtime failure observed
→ Main computes/commits failure cause + fixed-point unwind
→ final committed Runtime/Stack/Activation/InputTarget facts
→ Renderer Snapshot projection
```

Renderer MUST NOT收到足以让它重新计算 unwind 的命令式事件流。

---

## 13. Shutdown

Main shutdown/termination escalation 仍按现有 authority 执行。

Renderer Control publication只能反映已提交 shutdown-related state；不能成为 shutdown coordinator。

Renderer Control terminal 与 Main Session terminal 的精确组合必须 first-wins、bounded，不引入 reconnect/recovery policy。

---

## 14. Source Placement

精确文件名由现有 `packages/main` 结构决定，优先保持：

```text
role authority/state
projection
renderer-control integration
```

三个概念分离。

不要创建 universal：

```text
EventBus
StateReplicator
ProjectionFramework
AuthorityManager
```

除非已有第二个真实 consumer 证明抽象必要。

---

## 15. Tests

Main package tests至少覆盖：

```text
initial empty/declared Snapshot
Renderer-visible mutation bumps revision
non-visible mutation does not invent revision
multi-field commit exposes one coherent Snapshot
activate ACK before InputTarget
resume ACK before fresh InputTarget
call suspends caller / child transition projection
return removes child / resumes caller with fresh Activation
Runtime failure fixed-point unwind projection
revoked Activation never returns
DataAuthority generation replacement
connection replacement uses current committed Snapshot
```

测试应直接验证 Main committed state → Snapshot，而不是只测 JSON wire。

---

## 16. Step Closure

M7/02 complete when：

```text
Main owns sessionId + AuthorityRevision
Main can capture exact immutable RendererAuthoritySnapshotV1
all Renderer-visible authority changes are commit-driven
ACK causal barriers preserved
rendererControlToken authentication authority integrated
Main can feed committed Snapshots into renderer-control Main peer
existing Runtime/Frame tests remain green
```

完成后进入：

```text
M7_03_RENDERER_CONTROL_STORE.md
```
