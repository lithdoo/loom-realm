# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部模块边界、Frame transaction/error/recovery coordinator 与 Runtime supervision  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launcher Target Resolver / Dispatcher
├── Launch Attempt Registry
├── Runtime Container Registry
├── Runtime Supervisor
├── Control Connection Registry
├── Frame Registry
├── Activation Registry
├── Frame Stack Controller
├── Frame / Call Coordinator
├── Frame RPC Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Runtime Bootstrap / Control

Game Package Bootstrap 在产生 Process side effect 前完成 Descriptor/Entry/env 校验。Launcher 使用 Host-selected Node、`shell=false`、固定 cwd、显式 child environment。

Runtime Supervisor / Control Registry 实现 Frozen Subsystem Control v1：hello/status/shutdown、connection-bound `descriptor.key`、Main shutdown intent、semantic error envelope 与 Runtime terminal failure。

`spawn success ≠ connected ≠ identified ≠ ready`；`stopped` 只来自 Supervisor observation；v1 无 automatic restart/same-attempt reconnect/application heartbeat。

## 3. Frame Registry

Frame / Call Batch A-E 已 Frozen。

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

Registry 保证 frameId never reused、subsystemKey permanent、caller immutable、只有 active Frame有 current Activation、outcome 与 lifecycle分离。

实现 MAY 额外保存 Host-private：

```text
remoteContextState = absent / established / unknown
pendingFrameRpc
recoveryGeneration
```

这些不是 wire/public lifecycle。

## 4. Activation Registry

Main 是 Activation唯一签发方。首次 active/resume使用 fresh Activation；离开 active 时 revoke；revoked never valid again。

Failure barrier之后确认远端 late activate/resume Success时，对应 Activation视为已消耗/不可复用，但如果 Frame已 doomed则绝不发布为 InputTarget。

## 5. Frame / Call RPC Adapter

Frozen exact wire：

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

全部 JSON-RPC Request / closed schema。Adapter MUST NOT 增加 `system.call/system.return/frame.result/frame.cancel/frame.abort/frame.unwind`、close reason、Caller wire field 或 operation replay identity。

## 6. Stack Mutation Coordinator

normal transaction 与 Runtime failure recovery共用单一 serial coordinator。

建议内部：

```ts
interface FrameMutationTransaction {
  readonly kind: "initial" | "call" | "return" | "suspend" | "failure-unwind";
  phase: string; // Host-private
}
```

内部 phase不是公共 Frame lifecycle。

## 7. Healthy Transaction Rules

```text
Initial:
initialize ACK → activate(fresh A0) ACK → commit/publish

Call:
validate
→ Call Acceptance Commit
→ call Success
→ Child initialize/activate
→ activate ACK → commit/publish

Return:
Return Acceptance Commit
→ return Success
→ close ACK/pop
→ resume Caller(fresh A3) ACK → commit/publish
```

ordinary call无 reverse suspend；call/return Response先于 dependent reverse RPC；activate/resume ACK先于 InputTarget publication。

这些只描述 Runtime仍可信的 healthy path。

## 8. Deadline / Failure Classifier

七方法全部 finite deadline。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
```

Explicit Error仍需继续分类：recoverable / divergence / protocol-fatal。

Recoverable：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Runtime-fatal divergence：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

Frozen method/schema protocol error→`FRAME_CONTROL_PROTOCOL_ERROR`；ambiguous timeout→`FRAME_CONTROL_TIMEOUT`；divergence→`FRAME_CONTROL_DIVERGENCE`。

No retry/replay/idempotency journal。Late Response不恢复 terminal failure。

## 9. Initial / Post-call Failure Classification

Initial `FRAME_INITIALIZE_REJECTED`：Runtime healthy、Context absent、higher-level bootstrap处理业务失败。

Initial activate timeout/divergence/protocol error：Runtime failed；不得尝试普通 close“修好”Runtime，交 failure unwind。

Accepted Child initialize：

```text
FRAME_INITIALIZE_REJECTED
    → healthy Child failed outcome + fresh Caller resume

fatal/ambiguous
    → target Runtime failed + failure unwind
```

所有 post-accept分支都不得恢复 Caller old Activation。

## 10. Runtime Failure Unwind Coordinator

Batch E Coordinator输入：

```text
failedRuntimeKeys: Set<descriptor.key>
```

核心算法：

```text
while true:
    root = lowest live Frame owned by failedRuntimeKeys

    if no root:
        finish without Stack mutation

    establish Failure Unwind Barrier
    affected = root..top

    cleanup affected Top→Bottom

    if cleanup creates new failed Runtime:
        add key
        recompute root from whole Stack
        continue

    if direct surviving Caller exists and Session continues:
        fresh resume Caller
        if resume fails:
            add Caller Runtime
            recompute root
            continue

    finish with healthy Caller active or Stack empty
```

Coordinator MUST NOT只删除 failed Runtime自己的 Frame，也不得只选择最近 failed-runtime occurrence。

## 11. Failure Unwind Barrier

Barrier commit 后：

```text
no new normal call/return for doomed suffix
clear affected InputTarget
no new affected Activation publication
failed Runtime gets no normal Frame RPC
```

只承认 Main已经 commit的 Call/Return Acceptance、Activation revoke、terminal outcome等事实。

## 12. Failed-runtime Frame Retirement

Frame所属 Runtime已 failed：

```text
DO NOT send suspend/close/resume/activate
```

Main直接：

```text
revoke public authority
→ closing
→ closed
→ remove from live Stack
```

这是 normal close ACK-before-pop 的 failure-path exception。`closed` 只表示 Main不再持有 live Frame authority；远端资源最终由 Supervisor/Runtime termination清理。

## 13. Healthy Doomed Frame Cleanup

健康 Runtime上的 doomed Frame尽量只清 Frame Context、保留 Runtime：

- initialize明确未 commit → Context absent，无 close；
- Context established → commit Main-side closing/revoke authority，然后 `frame.close` 一次；
- close已 pending → 使用原 Request，不 duplicate；
- 不先额外 `frame.suspend`；active→closing合法，terminal `frame.close` 足够，减少一个 timeout surface。

close ACK后正常 pop。

## 14. Fixed-point Expansion

healthy cleanup/pending RPC如果 timeout/loss/diverge/protocol-fail/Runtime exit：

```text
failedRuntimeKeys += key
→ recompute lowest root across entire current live Stack
```

新 Runtime如果在旧 root下方还有 Frame，root必须向下移动。Coordinator不能继续假设原 suffix边界有效。

## 15. Pending RPC During Recovery

目标 Runtime已 failed：late Response diagnostics-only。

目标 Runtime healthy但 Frame doomed：原 Request不重发，只按原 deadline处理一次。

Success只更新 cleanup knowledge；不得重新发布 doomed Activation。`FRAME_INITIALIZE_REJECTED` 表示 Context absent。fatal/ambiguous使 Runtime加入 failed set。

## 16. Outcome Preservation / Root Outcome

已 Return Acceptance 的 outcome永远不可覆盖，即使之后 Runtime crash。

final root：

```text
if outcome != null:
    rootOutcome = accepted outcome
else:
    rootOutcome = failed("SUBSYSTEM_RUNTIME_FAILED")
```

`SUBSYSTEM_RUNTIME_FAILED` 是 Caller-visible platform code。Runtime diagnostic细节留在 diagnostics，不要求暴露给业务 Caller。

## 17. Intermediate Frames / Surviving Caller

Intermediate doomed Frame不执行逐层 normal resume；完整 suffix直接清理。

final root下方的 direct Caller如果 Runtime healthy且 Session继续：

```text
Anew = fresh activation
frame.resume(Caller,Anew,root.frameId,rootOutcome)
→ ACK
→ commit active/Anew
→ publish InputTarget
```

resume failure→Caller Runtime加入 failed set→recompute root。

## 18. Initial / Zero-frame / Session Termination

root是 initial Frame：清 suffix后 Stack empty，不 resume；accepted initial outcome保持，否则记录 `SUBSYSTEM_RUNTIME_FAILED` 供 Session层处理。

failed Runtime无 live Frame：Frame Stack不自动变化。

Session termination/bootstrap-abort已建立时，不为继续游戏而 resume surviving Caller；仍保持 revoked/outcome/failure terminal语义。

## 19. Renderer Control Publisher

Publisher只发布 Main已 commit state。Failure recovery开始后 affected InputTarget清空；Renderer不能恢复 cached old Activation。

只有 recovery `frame.resume` ACK后才发布 surviving Caller新 Activation。Recovery可以长期 `InputTarget=null`。

## 20. System Data / Render Boundary

Frame failure unwind不拥有 Render/Data lifecycle。healthy doomed Frame close不删除 Render；failed Runtime Data/Render authority失效与 cleanup由 Runtime/Data/Render层负责。

## 21. No Recovery Wire / Fail Closed

Main不实现：

```text
frame.abort
frame.unwind
recovery retry/replay
Frame snapshot/resync
```

极端 recovery race导致其他 Runtime失去可信状态时，扩大 failed set，而不是创建第二套 recovery协议。

## 22. 核心不变量

- Batch A-E Frozen；
- Frame Stack mutation serial；
- exact seven Frame Requests；
- Response-before-dependent-RPC；ACK-before-publication；
- revoked Activation永久失效；accepted outcome不可撤销；
- Explicit Error=no-commit evidence，不等于 recoverable；
- ambiguous/divergence/protocol error Runtime-fatal/no retry；
- Runtime failure以 subsystem key为单位；
- lowest failed-runtime Frame决定 unwind root；
- whole suffix Top→Bottom cleanup；
- failed-runtime Frame logical retire无 close ACK；
- healthy Frame best-effort close，无额外 suspend requirement；
- cleanup failure fixed-point扩大 root；
- root无 outcome→`SUBSYSTEM_RUNTIME_FAILED`；
- only final surviving Caller fresh-resume；
- resume ACK-before-publish；
- final state=healthy Caller active or Stack empty；
- no caller cancel / no recovery abort-unwind wire；
- Frame不拥有 Runtime/Render/Data lifecycle。

## 23. 测试入口

除 A-D fixtures 外，Batch E至少验证：

```text
lowest-failed-runtime-occurrence-is-root
same-runtime-multiple-frames-whole-suffix
healthy-descendant-close-top-down
failed-runtime-frame-no-close-rpc
failed-runtime-logical-retire
active-doomed-frame-close-without-extra-suspend
cleanup-timeout-expands-failed-set
new-failed-runtime-lower-frame-moves-root
fixed-point-resumes-or-empty
accepted-outcome-preserved
root-without-outcome-subsystem-runtime-failed
intermediate-doomed-no-resume
recovery-resume-fresh-activation
recovery-resume-ack-before-publish
recovery-resume-failure-expands-root
initial-failure-stack-empty
zero-frame-runtime-failure-no-stack-change
no-retry-during-recovery
```
