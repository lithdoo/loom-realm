# M7 / 02 — Main Renderer Authority Projection

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：02  
> 最近复核：2026-09-03  
> 前置：[M7 / 01 — Renderer Control Package](M7_01_RENDERER_CONTROL_PACKAGE.md)  
> 目标：让 `@loomrealm/main` 从既有 Runtime/Frame/Stack authority 纯投影出完整 Renderer Snapshot，并维护最小 Renderer Control authority 元数据；不建立第二套 Renderer shadow authority。

核心原则：

> **Main 现有 Runtime/Frame/Stack 状态就是事实源。M7 只增加纯 projection + revision/publication bookkeeping，不复制 Runtime、Frame、Activation 或 InputTarget 状态。**

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

不改变 Runtime Control / Frame application semantics。

---

## 2. New State Must Stay Minimal

M7 允许 Main 新增的长期状态应尽量限制为：

```text
sessionId
rendererRevision
minimal rendererControlToken / current-connection attempt state
optional detached last committed renderer projection for change detection
```

MUST NOT新增平行 authority：

```text
RendererRuntimeRegistry
RendererFrameRegistry
rendererStack shadow copy
stored rendererInputTarget independent of currentInputTarget()
RendererAuthorityManager
ProjectionFramework
```

现有 `runtimes`、`frames`、`stack`、`currentActivationId` 与 derived `currentInputTarget()` 继续是唯一逻辑事实源。

---

## 3. Pure Snapshot Projection

概念上只需要：

```ts
captureRendererAuthoritySnapshot(): RendererAuthoritySnapshotV1
```

精确函数名不冻结。

Projector：

```text
reads committed Main authority only
returns detached immutable value
never mutates Main state
never exposes mutable RuntimeRecord / FrameRecord
contains no operation history
contains no transport/credential material
```

Renderer-visible Runtime/Frame/InputTarget 状态必须每次从现有 Main state 推导；不能为了 publication convenience 维护 shadow records。

---

## 4. AuthorityRevision

`AuthorityRevision` 是 Main Session authority version，不是 connection sequence。

要求：

```text
positive safe integer
Session-local
strictly increases when a Renderer-visible committed projection changes
never reused / never wraps
```

不因以下行为递增：

```text
same Snapshot re-send
Renderer reconnect
connection replacement
non-renderer-visible bookkeeping
```

不要引入 `RevisionManager`。实现只需要一个 Main-owned integer + 一个明确的 renderer-visible commit observation helper。

---

## 5. Renderer-visible Commit Observation

当前 Main 已经有 serialized mutation discipline。M7 应复用它，而不是新建 transaction/event framework。

所有 Renderer-visible authority mutation 必须有明确 observation point：

```text
authoritative state mutation commits
→ capture current projection
→ if projection changed:
     rendererRevision++
     freeze Snapshot with new revision
     submit latest committed Snapshot to current Main peer
```

现有直接发生在 bootstrap flow 中、但对 Renderer 可见的 phase assignment（例如 connected / identified）也必须进入同一明确 commit discipline；不得绕过 publication observation。

允许通过窄 helper 收口这些点，但禁止 EventBus / StateReplicator / generic transaction layer。

---

## 6. Runtime Lifecycle Is a Pure Mapping

Main 内部 RuntimePhase 与 Renderer lifecycle 不完全同构。M7 必须冻结一个纯 mapping，而不是增加第二套 lifecycle state。

建议 v1 mapping：

```text
bootstrap key 尚未创建 RuntimeRecord → declared
starting                         → starting
connected                        → connected
identified                       → identified
initializing                     → identified
ready                            → ready
stopping                         → stopping
failed                           → failed
expected physical termination observed, no failure → stopped
```

如果正式协议对 `stopped` 的精确可观察窗口与现有 Main shutdown lifetime 冲突，先 reopen contract；不得增加 shadow `rendererPhase` 来掩盖差异。

---

## 7. Frame / Activation / InputTarget Projection

Snapshot stack：

```text
bottom → top
live Frames only
```

直接从现有 Frame records 投影：

```text
starting   → starting
active     → active + current activationId
suspended  → suspended, no activationId
closing    → closing, no activationId
closed     → omitted
```

InputTarget 继续由现有 Main authority派生：

```text
top active Frame + currentActivationId
→ {subsystemKey, frameId, activationId}
otherwise null
```

禁止新增独立 stored renderer InputTarget。

ACK causal barrier 保持：

```text
activate/resume Response accepted
→ Main commits fresh Activation
→ only then projection may expose Activation/InputTarget
```

---

## 8. Historical Identity Invariants Belong Here

以下 lifetime facts 由 Main generation/authority logic证明：

```text
revoked activationId never regranted
frame identity not illegally reused
fresh resume gets fresh activationId
```

这些必须由 Main tests + M7 vertical traces 验证，不要求 renderer-control receiver 保存历史集合。

---

## 9. DataAuthority in M7 Stays Empty

正式 Snapshot model包含：

```text
dataAuthorities: RendererDataAuthorityV1[]
```

但 M7 **不实现真实 Main DataAuthority allocation / generation / profile policy**。

M7 Main projection：

```text
dataAuthorities = []
```

始终合法。

非空 DataAuthority schema/profile mechanics 在 `@loomrealm/renderer-control` package fixture 中验证。真实 Main DataAuthority policy 等 M8 出现 Renderer + Subsystem Data real consumers 后关闭。

因此 M7 不新增：

```text
DataAuthorityRegistry
GenerationAllocator
ProfileManager
fake Data Broker
```

---

## 10. Renderer Control Token / Connection Authority

Main 仍拥有：

```text
rendererControlToken mint/register/consume decision
which Renderer connection is current
connection replacement decision
```

协议包只调用 Main-provided authentication decision。

M7 不提前冻结 physical carrier/token delivery port shape。该 shape 必须由真实 integration 需求证明。

---

## 11. Integration Ingress Rule

M7/04 必须走**真实 Main production integration path**：

```text
live Main authority
→ real captureRendererAuthoritySnapshot()
→ real renderer-control Main peer
```

禁止 test harness：

```text
read Main private stack directly
manually construct a Snapshot
manually increment fake revision
bypass Main authentication/current-connection decision
```

如果无法在不暴露 Main internals、且不增加 test-only public API 的情况下把 established carrier 接入真实 Main integration，则停止 vertical implementation，并以此作为证据关闭一个最窄的 Core↔Platform ingress port。不得预先猜测 `RendererControlHost` / universal hosting API 的形状。

---

## 12. Failure / Shutdown

M7 不改变既有 failure/unwind/shutdown authority。

Renderer 只看 committed result：

```text
Runtime failure
→ Main failure/unwind commit
→ pure projection
→ optional publication
```

Renderer Control terminal 不成为 Session shutdown coordinator。

---

## 13. Tests

Main tests重点验证 projection/ownership，而非 JSON wire：

```text
initial declared/empty Frame projection
runtime lifecycle pure mapping including initializing collapse
Renderer-visible commit bumps revision
non-visible change does not bump revision
no shadow Runtime/Frame/InputTarget state
activate ACK before fresh InputTarget
resume ACK before fresh InputTarget
call/return committed projection
failure fixed-point unwind projection
revoked Activation never reappears
M7 dataAuthorities stays empty
```

---

## 14. Step Closure

M7/02 complete when：

```text
Main has one sessionId + one rendererRevision
Snapshot is pure projection of existing authority
all visible mutations have explicit commit observation
Runtime lifecycle mapping is closed
InputTarget remains derived, not duplicated
historical identity invariants stay Main-owned
M7 does not implement DataAuthority policy
real renderer-control Main integration path does not require authority bypass
existing M5/M6 semantics remain green
```
