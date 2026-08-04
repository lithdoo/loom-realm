# ADR 0014：冻结 Frame / Call Protocol v1 Batch E

> 状态：Accepted  
> 日期：2026-08-04  
> 影响范围：Frame / Call Protocol v1 Runtime Failure Unwind / Stack Recovery  
> 依赖：ADR 0010 / 0011 / 0012 / 0013

## Context

Batch A-D 已分别冻结 Frame identity/lifecycle/Activation、七方法 wire、call/return transaction 与 commit barrier，以及 error/timeout/no-retry/cancellation。Batch D 已把 timeout、control divergence、protocol error、Runtime crash/Control loss 等情况统一收敛为“相关 Runtime 已 terminal failed”，但没有定义 Runtime failure 后 Main 应如何清理可能跨多个 Subsystem、甚至同一 Runtime 多次出现的 Frame Stack。

由于一个 Runtime Container 可以承载 0..N Frame，同一个 `descriptor.key` 可能在 Stack 中出现多次。只删除当前 top Frame、只删除失败 Runtime 自己的 Frame、或直接恢复最近 Caller，都可能留下 caller chain 断裂、旧 Activation 复活或 same-Subsystem recursion 状态不一致。

此外 failure recovery 自身也会执行 `frame.suspend / frame.close / frame.resume`。这些 cleanup RPC 仍可能 timeout/diverge，从而使新的 Runtime 进入 failure。Recovery 因此需要一个能够扩大影响范围并确定性收敛的算法，而不是一次性局部 rollback。

## Decision

### 1. Runtime failure 以 `descriptor.key` 为单位

Batch E 的输入是一个 terminal failed Runtime key，不是单个 Frame failure。Main 在一次 recovery transaction 内维护：

```text
failedRuntimeKeys
```

Recovery 中新失败的 Runtime 加入同一集合。

### 2. Unwind root = 最下面的失败 Runtime Frame

Main 在当前 live Stack 中寻找满足：

```text
frame.subsystemKey ∈ failedRuntimeKeys
```

的最低（最老）Stack index。该 Frame 是 `unwindRoot`。

从 `unwindRoot` 到 Stack Top 的全部 Frame 构成 affected suffix，无论这些 descendant Frame 自身 Runtime 是否仍健康。

这样 same-Subsystem recursion 不需要特殊规则：同一 Runtime 在 Stack 中出现多次时，最老那个 live Frame 自动成为 root。

### 3. Affected suffix Top→Bottom unwind

Main 对 affected suffix 按 LIFO 从 Top 向 root 清理。Failure recovery 与正常 Batch C Stack mutation 使用同一个串行 commit domain；Failure Unwind Barrier 建立后，不再为 affected suffix 启动新的正常 call/return，不发布新的 affected InputTarget，当前 affected InputTarget 必须清空。

### 4. Failed Runtime Frame 不再发送正常 Frame RPC

如果 Frame 所属 Runtime 已在 `failedRuntimeKeys` 中，Main MUST NOT 再向它发送 `frame.suspend / close / activate / resume`。Main 直接 retire 该 Frame 的 Main-owned control authority，使其经 failure-path `closing → closed` 并移出 live Stack。

这里 `closed` 表示 Frame 已不再是 Main 的 live control object，不表示已获得远端 Context 物理释放 ACK。Runtime 内存/Process/Worker cleanup 由 Supervisor/termination 负责。

### 5. Healthy descendant best-effort cleanup

Affected suffix 中仍健康 Runtime 的 Frame SHOULD 使用现有七方法进行 cleanup：

- 明确从未成功 initialize 的 Frame 不需要 `frame.close`；
- 已建立 Context 的 Frame使用 `frame.close`；
- 当前 active healthy affected Frame SHOULD 先 `frame.suspend(currentActivation)`，ACK 后再 close。

这些 cleanup RPC 仍服从 Batch D finite deadline / no-retry / failure classification。

### 6. Cleanup 二次失败扩大 failed set

如果 healthy Runtime 的 suspend/close/resume cleanup 发生 timeout、connection loss、control divergence、protocol error或unexpected Runtime failure，则该 Runtime进入 terminal failed，并加入 `failedRuntimeKeys`。

Main MUST 重新从整个 live Stack 计算最低 failed-runtime Frame。若新失败 Runtime 在当前 root 下方还有更老 Frame，unwind root 必须向下移动。

Recovery 按此规则重复，直到 failed set / unwind root 达到 fixed point。

### 7. 只承认 Main 已 commit 的 transaction facts

Runtime failure 与 Batch C transaction race 时，Batch E 只使用 Main 已 commit 的事实：

- Call Acceptance 未 commit：不存在 committed Child，Caller 保持原 authority；
- Call Acceptance 已 commit：Caller suspended、旧 Activation revoked、Child starting/pushed 都是事实；
- Return Acceptance 未 commit：没有 terminal outcome；
- Return Acceptance 已 commit：terminal outcome 必须永久保留。

Pending/late RPC Response 不得越过 Batch D failure classification恢复 transaction。

### 8. Accepted terminal outcome 优先

如果 final unwind root 已有 Batch C accepted terminal outcome，则 Runtime failure MUST NOT 覆盖它。`completed / cancelled / failed` 都按原 outcome交给 surviving Caller。

只有 root 没有 accepted outcome 时，Main 才生成平台失败：

```ts
{
  type: "failed",
  error: {
    code: "SUBSYSTEM_RUNTIME_FAILED"
  }
}
```

Batch E 冻结 Caller-visible Runtime failure code：

```text
SUBSYSTEM_RUNTIME_FAILED
```

具体 `FRAME_CONTROL_TIMEOUT / DIVERGENCE / PROTOCOL_ERROR`、Process exit 等保留为 Runtime diagnostics，不要求复制到 Caller-visible `FrameFailure.data`。

### 9. Intermediate doomed Frame 不逐层 resume

Affected suffix 中间 Frame 已经 doomed，不需要按正常 return chain 逐层 resume。Main 清理完整 suffix 后，只向 final root 下方的直接 surviving Caller交付 root outcome。

### 10. Surviving Caller fresh resume

如果 root 下方存在 direct Caller，且其 Runtime 仍 ready/healthy、无 shutdown intent，并且 Session intends to continue，Main生成全新 Activation并发送：

```text
frame.resume(
  survivingCaller,
  freshActivation,
  returnedFrameId = root.frameId,
  result = rootOutcome
)
```

resume ACK 后才 commit active/current Activation 并发布 InputTarget。旧 Activation 永不恢复。

### 11. Resume failure 继续扩大 unwind

Recovery `frame.resume` 若 timeout/diverge/protocol-fail，使 surviving Caller Runtime也失败，则该 Runtime加入 failed set并重新计算 root。不得 retry resume、恢复旧 Activation或手动选择另一个 Frame active。

### 12. Recovery 最终状态

一次 failure recovery 最终只能收敛为：

```text
healthy surviving Caller successfully resumed with fresh Activation
```

或：

```text
Stack empty
InputTarget = null
```

不得留下永久 half-unwound Stack、两个 active Frame或复活 Activation。

### 13. Initial Frame / zero-Frame failure

若 final unwind root 是 initial Frame，则没有 Caller resume；suffix清理后 Stack empty，initial outcome交给更高层 Session lifecycle。

若 initial Frame已有 accepted terminal outcome，Runtime crash不能覆盖该 outcome。

如果 failed Runtime在当前 Stack中没有 live Frame，则 Frame / Call Batch E 不修改现有 Stack/InputTarget。required Runtime failure是否导致整个 Session结束属于更高层 Session policy。

### 14. Session termination 优先

若 Main 已建立 Session termination / bootstrap-abort 等全局终止意图，则 Batch E 不要求为了继续游戏而 resume surviving Caller。仍必须遵守 revoked Activation不恢复、accepted outcome不撤销、failed Runtime不恢复。

### 15. 不新增 recovery wire

Batch E 不新增：

```text
frame.abort
frame.unwind
frame.cancel
operation replay
recovery retry
```

仍使用 Batch B 的七方法 surface。极端 recovery race 无法安全完成时采用 fail-closed：让相关 Runtime进入 failed set并继续 fixed-point unwind，而不是引入新的 resync/replay协议。

## Consequences

优点：

- Runtime 多 Frame、same-Subsystem recursion 与跨 Subsystem 调用使用同一个算法；
- caller chain 一旦被失败 Runtime切断，affected suffix 范围唯一；
- recovery自身二次失败也能确定性扩大并最终收敛；
- accepted outcome、one-shot Activation、no-retry 等 A-D 冻结语义全部保持；
- Caller只依赖统一 `SUBSYSTEM_RUNTIME_FAILED`，不耦合基础设施诊断。

代价：

- 一个深层 Runtime failure 可能使多个仍健康的 descendant Frame被一起关闭；
- cleanup时新的 Runtime failure可能让 unwind root进一步向下移动，极端情况下整个 Stack被清空；
- v1 选择 fail-closed，不提供局部 Frame state resync 或 transparent recovery。

## Rejected Alternatives

### 只删除失败 Runtime 自己的 Frame

拒绝。会留下 caller chain 断裂的 descendant Frame，并在同 Runtime多次出现时产生无法解释的 Stack。

### 只从当前 Top unwind 到最近失败 Frame

拒绝。如果同一 failed Runtime在更低层还有 Frame，最近 occurrence 不是正确 root。

### Recovery RPC 失败后继续假设 Runtime healthy

拒绝。违反 Batch D ambiguous/divergence Runtime-fatal 规则。

### Runtime crash 覆盖已 accepted outcome

拒绝。违反 Batch C accepted terminal outcome不可撤销规则。

### 为 recovery 新增 abort/unwind/replay RPC

拒绝。会扩大 v1 wire surface并重新引入 idempotency/reentrancy/resync复杂度。

## Follow-up

Batch F 冻结 wire numeric limits、完整 conformance fixtures、finite-deadline Profile configuration、Desktop/PWA transport-independent conformance 与 Frame / Call profile/version completion，并把整个 Frame / Call Protocol v1 转为 Active / Normative / Frozen。
