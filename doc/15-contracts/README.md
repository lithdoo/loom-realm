# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-04

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明职责和所有权；契约冻结消息、状态、顺序、错误、failure recovery 和兼容性。

## 1. 当前已冻结边界

- Game Entry 一次性声明全部 required Subsystem Descriptor；Descriptor identity = stable `key`；
- Desktop v1 Launcher = `nodejs`，Game Package v2 / Node.js Launcher v1 已冻结 Entry/env/spawn/Supervisor/trust 边界；
- Subsystem Control Protocol v1 已冻结 `hello / status / shutdown`，Main 拥有 shutdown intent，`stopped` 只来自 Supervisor observation；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame / Call 是独立协议域，当前 Batch A / B / C / D / E 已 Frozen；
- Frame lifecycle = `starting / active / suspended / closing / closed`，`completed / cancelled / failed` 是 outcome；
- `frameId` / `activationId` Main-generated、Session unique、never reused；revoked Activation 永久失效；
- Frame / Call v1 wire surface exactly seven JSON-RPC Requests；
- Caller relationship 是 Main-owned，不进入 Subsystem Frame wire；
- ordinary `frame.call` 不通过反向 `frame.suspend` 建立 Caller suspension；
- `frame.call` / `frame.return` Success 是 Main acceptance barrier，不表示 Child active / closed / Caller resumed；
- `frame.activate` / `frame.resume` ACK happens-before 对应 InputTarget publication；
- pre-commit recoverable failure 可 abort，post-commit facts 不 rollback；
- Frame Request 必须 finite deadline；timeout/Response-loss ambiguous result 不猜测、不 retry，而进入 Runtime failure path；
- recoverable Frame errors 与 control divergence 分离；`FRAME_INITIALIZE_REJECTED` 不使目标 Runtime failed；
- Runtime failure unwind root = live Stack 中最下面的 failed-runtime Frame，root..top 全部 deterministic unwind；
- failed Runtime Frame 不再发送正常 Frame RPC，可无 `frame.close ACK` logical retire；healthy descendant只 best-effort cleanup；
- recovery cleanup 新失败会扩大 `failedRuntimeKeys` 并重新计算更低 root，直到 fixed point；
- accepted terminal outcome 永远保留；root 无 outcome时 Caller-visible code=`SUBSYSTEM_RUNTIME_FAILED`；
- surviving Caller 只用 fresh Activation resume，resume failure继续扩大 unwind；
- v1 不支持 caller-driven `frame.cancel`，也不新增 `frame.abort/frame.unwind` recovery wire；
- Render 生命周期完全属于 Subsystem；Renderer⇄Subsystem 数据面分为 Connection / Render Update / User Input；
- Content 使用独立只读 Content API。

## 2. Game Package v2 / Desktop Launcher

权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

Desktop v1：完整 Descriptor 集合先校验再产生 Process side effect；Entry 安全解析在 Installation Root；Host 选择 Node Runtime；`shell=false`、固定 cwd、显式 child environment；Bootstrap authentication state 在 spawn 前建立；unexpected exit 包括 code 0 均为 failure；v1 不自动 restart；Node executable code 当前属于 trusted code，不宣称 OS sandbox。

## 3. Subsystem Control Protocol v1

权威入口：[Main ⇄ Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

核心规则：hello 成功后 Connection 永久绑定 `descriptor.key`；`ready` 是 Runtime status；`stopping` 只在 Main-requested shutdown 下合法；shutdown Response / `status(stopping)` 都不等于 `stopped`；没有 shutdown intent 的 Control loss / Process exit 是 Runtime failure；v1 无 application heartbeat、same-attempt reconnect/resume、automatic restart；semantic RPC error 使用 `-32000 + error.data.code`。

## 4. Frame / Call Protocol v1

权威入口：[Main ⇄ Subsystem Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

```text
Batch A  Identity / Authority / Lifecycle / Activation       ← Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        ← Frozen
Batch C  Transaction / Commit Barrier / Rollback              ← Frozen
Batch D  Error / timeout / retry / cancellation               ← Frozen
Batch E  Runtime failure unwind                                ← Frozen
Batch F  Limits / fixtures / profile/version completion       ← Next
```

### Batch A/B

Frame 是 Main-owned call/input control object；identity/lifecycle/Activation/Caller/Stack authority由 Main持有。Wire exactly seven Requests；closed schema；Caller不下发；close无 reason；resume=Child outcome+replacement Activation；call不等待最终业务结果；无 `system.call/system.return/frame.result/frame.cancel`。

### Batch C

```text
ordinary call
    Call Acceptance Commit
    → call Success
    → Child initialize / activate
    → activate ACK
    → publish Child InputTarget

return
    Return Acceptance Commit
    → return Success
    → close ACK / pop
    → Caller resume(new Activation) ACK
    → publish Caller InputTarget
```

Response-before-dependent-RPC；activate/resume ACK-before-publication；`InputTarget=null` transaction gap合法；revoked Activation/accepted outcome不可回滚。

### Batch D

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

v1 no automatic retry/replay/idempotency journal。Recoverable：`FRAME_CALL_TARGET_NOT_FOUND / FRAME_CALL_TARGET_UNAVAILABLE / FRAME_INITIALIZE_REJECTED`。Divergence：`FRAME_NOT_FOUND / FRAME_STATE_MISMATCH / ACTIVATION_MISMATCH / FRAME_STACK_MISMATCH / FRAME_OWNERSHIP_MISMATCH`。Runtime diagnostics至少：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

### Batch E

Runtime 已 terminal failed 后：

```text
failedRuntimeKeys
    ↓
find lowest live Frame whose subsystemKey is failed
    ↓
unwind whole suffix root..top, Top→Bottom
    ↓
healthy descendants best-effort frame.close
failed-runtime Frames logical retire without ACK
    ↓
cleanup failure may add new failed Runtime
    ↓
recompute lower root until fixed point
    ↓
preserve accepted root outcome
or synthesize failed(SUBSYSTEM_RUNTIME_FAILED)
    ↓
fresh-resume healthy surviving Caller
or Stack empty
```

Recovery 不新增 abort/unwind/cancel/replay/resync wire。Normal close 的 ACK-before-pop 仍适用于 healthy Runtime；failed Runtime logical retire 是明确 failure-path exception。

旧 [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) 仅为 Legacy redirect。

## 5. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Draft overall；Batch A-E Normative / Frozen；Batch F Next |
| Main ⇄ Renderer Control | 尚待新文档 | Draft target |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| 旧 Frame lifecycle path | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |

## 6. Identity / Transaction / Failure 分层

```text
Subsystem Descriptor
    key

Runtime Control
    hello / ready / shutdown / failed

Frame
    frameId / caller / lifecycle / outcome

Activation
    one-shot ordinary input epoch

Stack Transaction
    acceptance / commit / publication barrier

Frame RPC Failure
    recoverable explicit rejection
    or Runtime-fatal ambiguous/divergence/protocol failure

Runtime Failure Recovery
    failed-runtime set
    lowest-root suffix unwind
    fixed-point expansion
    outcome preservation / fresh Caller resume

System Data Connection
    independent per-Subsystem transport

Render Context
    independent Subsystem-owned identity
```

## 7. 版本与 Profile 规则

- 改变字段含义、identity ownership、RPC surface、commit point、error classification、unwind root、outcome preservation 或 ordering guarantee 属于不兼容变更；
- Transport Profile 不得改变应用协议语义；
- Batch F 不得静默改变 A-E 已 Frozen semantics；
- Main⇄Renderer Control 的未来 wire 可选择如何编码 intermediate revision，但必须服从 Batch C/E causal barriers；
- Profile 可以选择具体 finite deadline 数值，但不得把 timeout 重新解释为 retryable normal Error。

## 8. 推荐冻结顺序

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control v1                        Frozen
Frame / Call Batch A                        Frozen
Frame / Call Batch B                        Frozen
Frame / Call Batch C                        Frozen
Frame / Call Batch D                        Frozen
Frame / Call Batch E                        Frozen
Frame / Call Batch F                        ← Next / Final
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

## 9. 当前明确暂缓

PWA Launcher/credential/Control Transport Profile、第二 Launcher、Sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、same-attempt reconnect、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery。

实现不得以“优化”为由隐式加入这些语义。

## 10. 完整冻结要求

Frame / Call 只剩 Batch F 的 limits/fixtures/profile/version completion；完成后整体转为 Active / Normative / Frozen。
