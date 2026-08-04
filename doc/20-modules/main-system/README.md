# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部模块边界、Frame transaction/error coordinator 与 Runtime supervision  
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
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Runtime Bootstrap / Control

Game Package Bootstrap 在产生 Process side effect 前完成全部 Descriptor/Entry/env 校验。Launcher 只接受安全解析后的 target，使用 Host-selected Node、`shell=false`、固定 cwd、显式 child environment。

Runtime Supervisor 负责真实 Process existence/termination；Control Connection Registry 实现 Frozen Subsystem Control v1：hello/status/shutdown、connection-bound `descriptor.key`、Main shutdown intent、semantic error envelope 与 wire limits。

`spawn success ≠ connected ≠ identified ≠ ready`；`stopped` 只来自 Supervisor observation；v1 无 automatic restart / same-attempt reconnect / application heartbeat。

## 3. Frame Registry

Frame / Call Batch A/B/C/D 已 Frozen。

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

Registry 保证 frameId never reused、subsystemKey permanent、callerFrameId Main-owned immutable、只有 active Frame 有 current Activation、outcome 与 lifecycle 分离。

## 4. Activation Registry

Main 是 Activation 唯一签发方：first active/resume 使用 fresh Activation；leave active 时 revoke；revoked never valid again。Activation never rolls back/resumes/reuses。

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
    frame.call({ frameId, activationId, targetSubsystemKey, input }) → { childFrameId }
    frame.return({ frameId, activationId, result }) → {}
```

全部 JSON-RPC Request / closed schema。Adapter MUST NOT 接受 `system.call/system.return`、`frame.result/frame.cancel`、close reason、Caller wire field 或 source system identity 变体。

## 6. Stack Mutation Coordinator

单一 Frame Stack 的 commit-sensitive mutation MUST 串行执行。建议内部 transaction record：

```ts
interface FrameMutationTransaction {
  readonly kind: "initial" | "call" | "return" | "suspend" | "recovery";
  readonly frameId: string;
  readonly childFrameId?: string;
  phase: string; // Host-private, not protocol lifecycle
}
```

内部 phase 不是公共 Frame lifecycle。

## 7. Normal Transaction Rules

Initial：initialize ACK → activate(fresh A0) ACK → commit active/A0 → publish InputTarget。

Call：validate → Call Acceptance Commit (Caller suspended/A1 revoked/Child starting+push/InputTarget null) → `frame.call` Success → Child initialize/activate → activate ACK → commit/publish Child。

Return：Return Acceptance Commit (outcome accepted/A2 revoked/Child closing/InputTarget null) → `frame.return` Success → close ACK → closed/pop → resume Caller(fresh A3) ACK → commit/publish Caller。

ordinary call 不发送 reverse `frame.suspend`；call/return Response 必须先于 dependent reverse RPC；activate/resume ACK 必须先于 InputTarget publication。

## 8. Frame RPC Deadline Manager

每个七方法 Request 必须有 finite deadline。Deadline Manager 维护 Host/Profile policy 的实际时间值，但不得把它暴露成新的 Frame wire field。

结果分类：

```text
Success Response
    → known committed

Explicit Error Response
    → known not committed

Timeout / Response loss / pending-request connection loss
    → commit unknown / ambiguous
```

Main outbound lifecycle RPC 一旦 ambiguous：

1. 不 retry / replay；
2. 停止向该 Runtime 发新的正常 Frame Control；
3. Runtime failure reason=`FRAME_CONTROL_TIMEOUT`；
4. 忽略迟到 Response 对状态的恢复作用；
5. 交给 Batch E Runtime Failure Coordinator unwind。

## 9. Semantic Error Classifier

Frame semantic error envelope 复用：

```text
error.code = -32000
error.data.code = stable semantic code
```

### Recoverable

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个只在 Call Acceptance Commit 前返回，Caller/old Activation保持不变。

`FRAME_INITIALIZE_REJECTED` 携带 `FrameFailure`；target Runtime remains healthy。若 Child 已 accepted，则把该 failure 作为 Child `FrameOutcome.failed` forward-resolve，并 fresh-resume Caller。

### Runtime-fatal divergence

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

Main 收到/产生上述错误后把涉及 Runtime 标记为 `FRAME_CONTROL_DIVERGENCE` failure，不尝试 reinitialize/resync/retry。

Frozen Frame method/schema 出现标准 JSON-RPC protocol error 则 Runtime failure reason=`FRAME_CONTROL_PROTOCOL_ERROR`。

## 10. Main-issued Lifecycle Strictness

合法 `frame.activate / frame.suspend / frame.resume / frame.close` 在 Runtime healthy 且 state一致时应成功。Subsystem 对合法请求返回 identity/lifecycle/Activation semantic error即 control divergence。

`frame.initialize` 是唯一允许合法业务 rejection 的 Main-issued Frame lifecycle RPC，通过 `FRAME_INITIALIZE_REJECTED` 表达。

## 11. Outbound `frame.call` Handling

收到合法 call 后先做 precommit target validation。`FRAME_CALL_TARGET_NOT_FOUND/UNAVAILABLE` 在 commit 前返回，Caller保持 active/current Activation。

验证通过才 acceptance-commit Caller suspension/Activation revoke/Child identity/push。Response 完成后才发 Child initialize/activate。

Call success 后 initialize rejection/other failure都不能恢复 old Activation；按 Frozen forward-recovery处理。

## 12. Outbound `frame.return` Handling

合法 return acceptance commit后 outcome terminal、old Activation revoked、Child closing。Response 完成后才 close/pop/resume。

Return acceptance 不可 rollback。若后续 Frame RPC timeout/divergence，则不是恢复 Child 的理由，而是相关 Runtime failure，交 Batch E。

## 13. Subsystem→Main Pending Request Failure

Main 必须理解 Subsystem SDK 对 outbound `frame.call / frame.return` 有 mutation gate。

如果 Main 能明确返回 recoverable precommit Error，SDK可释放 gate。

如果 Response 在 Main已 commit 后丢失，Subsystem无法知道 acceptance state并会进入 Runtime failure。Main随后可能收到 `subsystem.status(failed)` 或 Control loss；必须按 Runtime failure处理，而不是认为原 Frame transaction仍可继续正常推进。

## 14. No Retry / Idempotency / Cancel

Main Frame Coordinator不得自动重发七方法 Request，也不实现 operationId/idempotencyKey/dedup journal/replay cache。

v1 不提供 caller-driven `frame.cancel`。`FrameOutcome.cancelled` 只是 active Frame 自行 return cancelled；Session end走更高层 shutdown。

## 15. Renderer Control Publisher

Publisher 只发布已 commit Main state。activate/resume ACK precedes publication；revoked Activation 后续 revision必须消失；可 coalesce transitional `InputTarget=null`，但不得越过 causal barrier。

Frame timeout/divergence 不通过 Renderer reconnect/resync修复。

## 16. System Data / Render Boundary

每 Subsystem 最多一条有效 Renderer Data Connection；Data Grant 不绑定 Frame/Activation/Render；Frame lifecycle 不隐式控制 Data Connection/Render；Main 不读取 User Input/Render Update payload。

## 17. Runtime Failure Coordination

Batch D 只确定何时 Runtime 不再可信：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

Batch E 冻结 Runtime failed 后的 deterministic suffix unwind、transaction 中 crash、best-effort cleanup 与 surviving Caller resume。Runtime failure不得通过 `Frame.state=failed` 表示。

## 18. 核心不变量

- Frame Stack mutation serial；
- ordinary call 不依赖反向 `frame.suspend`；
- call/return Response precedes dependent reverse RPC；
- activate/resume ACK precedes corresponding InputTarget publication；
- revoked Activation 永久失效；accepted outcome 不可撤销；
- Explicit Error 与 ambiguous timeout不得混淆；
- ambiguous Frame RPC 不 retry/replay，相关 Runtime failed；
- recoverable initialize rejection不使 target Runtime failed；
- control divergence/protocol error Runtime-fatal；
- no caller-driven Frame cancellation；
- Frame 不拥有 Runtime/Render/Data Connection lifecycle。

## 19. 测试入口

除 Batch A/B/C fixtures 外，Batch D 至少验证：

```text
finite-deadline-required
success-known-commit
explicit-error-known-no-commit
timeout-is-ambiguous
no-frame-rpc-retry-after-timeout
late-response-does-not-recover-runtime
call-target-not-found-recoverable
call-target-unavailable-recoverable
initialize-rejected-runtime-stays-healthy
initialize-rejected-forward-failed-outcome
frame-not-found-divergence-fatal
frame-state-mismatch-divergence-fatal
activation-mismatch-divergence-fatal
stack-mismatch-divergence-fatal
ownership-mismatch-divergence-fatal
invalid-params-protocol-fatal
method-not-found-protocol-fatal
call-timeout-keeps-sdk-gate-and-fails-runtime
return-timeout-keeps-sdk-gate-and-fails-runtime
no-operation-id-or-replay
no-caller-driven-frame-cancel
callee-return-cancelled-remains-valid
```
