# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-04

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明职责和所有权；契约冻结消息、状态、顺序、错误和兼容性。

## 1. 当前已冻结边界

- Game Entry 一次性声明全部 required Subsystem Descriptor；Descriptor identity = stable `key`；
- Desktop v1 Launcher = `nodejs`，Game Package v2 / Node.js Launcher v1 已冻结 Entry/env/spawn/Supervisor/trust 边界；
- Subsystem Control Protocol v1 已冻结 `hello / status / shutdown`，Main 拥有 shutdown intent，`stopped` 只来自 Supervisor observation；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Frame / Call 是独立协议域，当前 Batch A / B / C 已 Frozen；
- Frame lifecycle = `starting / active / suspended / closing / closed`，`completed / cancelled / failed` 是 outcome；
- `frameId` / `activationId` Main-generated、Session unique、never reused；revoked Activation 永久失效；
- Frame / Call v1 wire surface exactly seven JSON-RPC Requests；
- Caller relationship 是 Main-owned，不进入 Subsystem Frame wire；
- ordinary `frame.call` 不通过反向 `frame.suspend` 建立 Caller suspension；
- `frame.call` / `frame.return` Success 是 Main acceptance barrier，不表示 Child active / closed / Caller resumed；
- `frame.activate` / `frame.resume` ACK happens-before 对应 InputTarget publication；
- pre-commit failure 可 abort，post-commit failure只能 forward recovery，不能恢复旧 Activation；
- Render 生命周期完全属于 Subsystem；Renderer⇄Subsystem 数据面分为 Connection / Render Update / User Input；
- Content 使用独立只读 Content API。

## 2. Game Package v2 / Desktop Launcher

权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

Desktop v1：

- Descriptor `key + launcher.type=nodejs + launcher.entry + env`；
- 完整 Descriptor 集合先校验再产生 Process side effect；
- `launcher.entry` 是 Installation Root 相对 logical path，禁止 traversal / absolute / URL / redirect escape；
- Entry 仅接受 `.mjs / .cjs` regular file；
- Host 选择 Node Runtime，Game Package 不提供 Node executable / flags / argv；
- `shell=false`、固定 `cwd`、显式 child environment；
- Bootstrap authentication state 在 spawn 前建立；
- unexpected exit 包括 code 0 均为 failure；
- Desktop v1 不自动 restart；Node.js executable code 当前属于 trusted code，不宣称 OS sandbox。

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
Batch D  Error / timeout / retry / cancellation               ← Next
Batch E  Runtime failure unwind                                ← Draft
Batch F  Limits / fixtures / profile/version completion       ← Draft
```

### Batch A

- Frame 是 Main-owned call / ordinary-input control object；
- `frameId` 永不复用，Frame 永久绑定 `descriptor.key`，`callerFrameId` immutable；
- Main 是 lifecycle / Stack / Activation / InputTarget 唯一权威；
- lifecycle 只有 `starting / active / suspended / closing / closed`；
- `completed / cancelled / failed` 是 outcome，不是 lifecycle；
- 无 Frame `ready / initialized / frame.status`；
- 只有 active Frame 有 current Activation；Activation never rolls back/resumes/reuses；
- 稳定状态 Stack Top active，其他 live Frame suspended；
- Frame lifecycle 不控制 Runtime / Render / Data Connection。

### Batch B

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

全部是 JSON-RPC Request；closed schema；`FrameOutcome.completed.value` REQUIRED，无值用 `null`；`callerFrameId` 不下发；`frame.close` 无 reason；`frame.resume` 同时交付 Child Outcome + replacement Activation；`frame.call` 不等待最终业务结果；无 `system.call / system.return / frame.result`。

### Batch C

ordinary call transaction：

```text
frame.call Request
→ Main validates
→ Call Acceptance Commit:
     Caller active → suspended
     old Activation revoke
     Child starting / pushed
     InputTarget = null
→ frame.call Success { childFrameId }
→ frame.initialize Child
→ frame.activate Child
→ ACK
→ Child active + InputTarget publish
```

`frame.call` Success 表示 logical Child call accepted，不表示 Child active。ordinary call 不再额外发送 `frame.suspend`；该 RPC 仅保留为 Main 主动 quiesce / terminal preparation 原语。

return transaction：

```text
frame.return Request
→ Return Acceptance Commit:
     outcome terminal
     Child old Activation revoke
     Child → closing
     InputTarget = null
→ frame.return Success
→ frame.close Child
→ ACK / closed / pop
→ frame.resume Caller(new Activation + outcome)
→ ACK
→ Caller active + InputTarget publish
```

冻结 causal barriers：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

Main MUST complete `frame.call` Response before dependent Child `initialize/activate`，并 complete `frame.return` Response before dependent `close/resume`，因此 same-Subsystem recursive call 不依赖 nested bidirectional request-handler reentrancy。

失败边界：

```text
Pre-commit  → abort allowed
Post-commit → forward recovery only
```

一旦 Activation 已 commit revoke，后续 failure MUST NOT 恢复旧 Activation；一旦 Return outcome 已接受，后续 cleanup failure MUST NOT 抹掉该 outcome。

旧 [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) 仅为 Legacy redirect。

## 5. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Draft overall；Batch A/B/C Normative / Frozen |
| Main ⇄ Renderer Control | 尚待新文档 | Draft target |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| 旧 Frame lifecycle path | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |

## 6. Identity / Transaction 分层

```text
Subsystem Descriptor
    key

Launch Attempt
    launchId / PID / Process Handle
    Host-private

Control Connection
    connection-bound descriptor.key

Frame
    frameId
    permanent descriptor.key
    callerFrameId (Main-owned)

Activation
    one-shot ordinary input epoch

Stack Transaction
    Main-owned acceptance / commit / forward recovery

System Data Connection
    independent per-Subsystem data transport

Render Context
    independent Subsystem-owned identity
```

## 7. 版本与 Profile 规则

- 改变字段含义、identity ownership、RPC surface、commit point 或 ordering guarantee 属于不兼容变更；
- Transport Profile 不得改变应用协议语义；
- Batch D-F 不得静默改变 A/B/C 已 Frozen 的 identity/lifecycle/Activation/RPC/transaction semantics；
- Main⇄Renderer Control 的未来 wire 可选择如何编码 intermediate revision，但必须服从 Batch C causal barriers。

## 8. 推荐冻结顺序

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control v1                        Frozen
Frame / Call Batch A                        Frozen
Frame / Call Batch B                        Frozen
Frame / Call Batch C                        Frozen
Frame / Call Batch D                        ← Next
Frame / Call Batch E
Frame / Call Batch F
Main ⇄ Renderer Control
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

## 9. 当前明确暂缓

PWA Launcher/credential/Control Transport Profile、第二 Launcher、Sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、same-attempt reconnect、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume。

实现不得以“优化”为由隐式加入这些语义。

## 10. 完整冻结要求

Frame / Call 整体仍需 Batch D 的 error/timeout/retry/cancellation、Batch E 的 Runtime failure unwind，以及 Batch F 的 limits/fixtures/profile/version completion；完成后整体才能转为 Active / Normative / Frozen。
