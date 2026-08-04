# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部模块边界、Frame transaction coordinator 与 Runtime supervision  
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
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Runtime Bootstrap / Control

Game Package Bootstrap 在产生 Process side effect 前完成全部 Descriptor/Entry/env 校验。Launcher 只接受安全解析后的 target，使用 Host-selected Node、`shell=false`、固定 cwd、显式 child environment。

Runtime Supervisor 负责真实 Process existence/termination；Control Connection Registry 实现 Frozen Subsystem Control v1：hello/status/shutdown、connection-bound `descriptor.key`、Main shutdown intent、semantic error envelope 与 wire limits。

`spawn success ≠ connected ≠ identified ≠ ready`；`stopped` 只来自 Supervisor observation；v1 无 automatic restart / same-attempt reconnect / application heartbeat。

## 3. Frame Registry

Frame / Call Batch A/B/C 已 Frozen。

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | {
      readonly type: "failed";
      readonly error: {
        readonly code: string;
        readonly message?: string;
        readonly data?: JsonValue;
      };
    };

interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

Registry 必须保证：frameId Session unique/never reused；subsystemKey permanent；callerFrameId Main-owned immutable；只有 active Frame 有 current Activation；outcome 与 lifecycle 分离。

不得保存 Render/Data Transport 作为 Frame-owned state，不得使用 `status=failed` 代替 `closing→closed`。

## 4. Activation Registry

Main 是 Activation 唯一签发方。

```text
first active        → fresh Activation
resume              → fresh Activation
leave active        → revoke old Activation
revoked             → never valid again
```

Activation never rolls back / resumes / reuses。

## 5. Frame / Call RPC Adapter

Frozen exact wire：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

全部是 JSON-RPC Request，closed schema。

Adapter MUST NOT 接受 `system.call/system.return`、`frame.result`、close reason、Caller wire field 或 source system identity 变体。

## 6. Stack Mutation Coordinator

单一 Frame Stack 的 commit-sensitive mutation MUST 串行执行。

Coordinator 建议显式维护内部 transaction record，例如：

```ts
interface FrameMutationTransaction {
  readonly kind: "initial" | "call" | "return" | "suspend" | "recovery";
  readonly frameId: string;
  readonly childFrameId?: string;
  phase: string; // Host-private, not protocol lifecycle
}
```

内部 phase 不是公共 Frame lifecycle，不得发布成新 wire state。

## 7. Initial Frame Transaction

```text
allocate F0 / starting / Stack=[F0]
→ frame.initialize(F0)
→ ACK
→ generate A0
→ frame.activate(F0,A0)
→ ACK
→ commit active+A0
→ RendererControlPublisher publishes F0/A0
```

activate ACK 前不得发布 A0。

initialize ACK 后 activate 失败时，Coordinator 必须 close 已建立 Context，不得把 F0 发布为 active。

## 8. Outbound `frame.call` Handling

收到合法 `frame.call(F1,A1,target,input)` 后：

1. 校验 connection ownership、F1 active/Stack Top/current A1、target declared+ready+no-shutdown；
2. 分配 F2；
3. 原子 Call Acceptance Commit：

```text
F1 → suspended
A1 revoke
F2 starting / caller=F1 / push
InputTarget = null
```

4. 返回 `{childFrameId:F2}`；
5. **Response 完成后**才发送目标 `frame.initialize(F2)` / `frame.activate(F2,A2)`；
6. activate ACK 后 commit F2 active+A2，再允许 Renderer 发布 F2/A2。

ordinary call MUST NOT 额外发送 `frame.suspend(F1,A1)`。`frame.call` success 就是 Caller suspension acceptance barrier。

这样 same-Subsystem recursive call 共用一个 Control Connection 也不要求 handler reentrancy。

## 9. Call Post-commit Failure

`frame.call` success 后 Child initialize/activate 失败属于 post-commit failure：

```text
MUST NOT restore F1/A1
MUST NOT erase F2 identity
```

Coordinator 必须把 F2 forward-resolve 为平台 failed outcome，并使用 fresh Activation `frame.resume(F1,...)`。

如果 Child initialize 未 commit，不需要 target `frame.close`；如果 initialize ACK 后 activate 失败，则必须 close target Context 后 pop，再 resume Caller。

稳定 error code 留给 Batch D/E。

## 10. `frame.suspend` Role

`frame.suspend` 不是 ordinary call establishment step。

它仅保留为 Main 主动 quiesce / terminal preparation 控制原语。ACK 后才可 commit active→suspended、old Activation revoke、InputTarget clear。

任何重新 active 都必须使用 fresh Activation。

## 11. Outbound `frame.return` Handling

收到合法 `frame.return(F2,A2,result)` 后原子 Return Acceptance Commit：

```text
F2.outcome = result
A2 revoke
F2 → closing
InputTarget = null
```

然后返回 `{}`。

`frame.return` success **不等于** Child closed / popped / Caller resumed。

Main MUST 在 Response 完成后才发送：

```text
frame.close(F2)
→ ACK
→ commit closed / pop
```

之后才允许：

```text
A3 = fresh Activation
frame.resume(F1,A3,F2,result)
→ ACK
→ commit F1 active+A3
→ publish F1/A3
```

Return acceptance 不可 rollback；后续 failure不得恢复 A2 或抹掉 accepted outcome。

## 12. Renderer Control Publisher

Publisher 只发布已 commit Main state。

Batch C causal rules：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication

Activation revoke commit
    happens-before all later revisions omit it as current
```

Publisher MAY coalesce transitional Stack states / `InputTarget=null` gap，但不得越过 causal barrier，也不得发布两个 ordinary InputTargets。

## 13. Subsystem SDK Coordination Contract

Main 假设 SDK 对 outbound `frame.call / frame.return` 实现 mutation gate：Request pending 时停止新的 ordinary input dispatch，并禁止第二个 call/return。

Main 不依赖 SDK 在入站 call/return handler 尚 pending 时处理反向 Frame Request；Response-before-dependent-RPC 是协议保证。

## 14. System Data / Render Boundary

- 每 Subsystem 最多一条有效 Renderer Data Connection；
- Data Grant 不绑定 Frame/Activation/Render；
- Frame create/suspend/resume/close 不隐式创建/关闭 Data Connection；
- Main 不维护 Render Registry，也不读取 User Input/Render Update payload。

## 15. Failure Coordination

Batch C 已冻结：

```text
pre-commit failure  → abort allowed
post-commit failure → forward recovery only
```

Batch D 冻结 semantic error / timeout / retry / ambiguous delivery；Batch E 冻结 Runtime crash multi-Frame unwind。

Runtime failure仍不得通过 `Frame.state=failed` 表示。

## 16. 核心不变量

- Frame Stack mutation serial；
- ordinary call 不依赖反向 `frame.suspend`；
- call success precedes dependent child initialize/activate；
- return success precedes dependent close/resume；
- activate/resume ACK precedes corresponding InputTarget publication；
- revoked Activation 永久失效；
- accepted terminal outcome 不可撤销；
- same-Subsystem recursion 不依赖 nested Request handling；
- Frame 不拥有 Runtime/Render/Data Connection lifecycle。

## 17. 测试入口

除 Batch A/B fixtures 外至少增加：

```text
initial-activate-before-publish
call-accept-suspends-caller
call-success-before-child-initialize
call-no-frame-suspend-rpc
call-gap-no-input-target
child-activate-before-publish
same-subsystem-no-nested-request
recursive-same-subsystem-call
call-postcommit-init-failure-fresh-resume
call-postcommit-activate-failure-close-then-fresh-resume
return-accept-closing-before-response
return-success-before-close
close-ack-before-pop
resume-ack-before-publish
return-postcommit-no-rollback
revoked-activation-never-restored
no-two-input-targets-during-transaction
```
