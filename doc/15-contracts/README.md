# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-04

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明系统职责和所有权；契约冻结消息、状态、顺序、错误和兼容性。

## 1. 当前已确定的上层边界

1. Game Entry 一次性声明本次会话全部 Subsystem Descriptor；
2. Descriptor identity 使用稳定 `key`；Desktop MVP 唯一 Launcher Type 为 `nodejs`；
3. 全部 Descriptor eager / all-required；
4. Game Package v2 与 Desktop Node.js Launcher v1 已冻结 Entry / env / spawn / Supervisor / trust 边界；
5. Subsystem Control Protocol v1 已冻结 `subsystem.hello / subsystem.status / subsystem.shutdown`；
6. `spawn success ≠ connected ≠ identified ≠ ready`；Main 拥有 Runtime shutdown intent，`stopped` 只来自 Supervisor observation；
7. Frame / Call 是独立协议域；Batch A 已冻结 identity / authority / lifecycle / Activation；Batch B 已冻结七个 RPC 的 wire surface；
8. Frame lifecycle = `starting / active / suspended / closing / closed`；`completed / cancelled / failed` 是 outcome；
9. Frame v1 没有 `ready / initialized / frame.status`；
10. `frameId` / `activationId` 由 Main 生成、Session 内唯一且不复用；Activation revoke 后永久失效；
11. Frame / Call v1 的七个 RPC 固定为 `frame.initialize / activate / suspend / resume / close / call / return`；
12. `callerFrameId` 是 Main-owned relationship，不进入 Main ⇄ Subsystem Frame RPC wire；
13. `frame.resume` 同时交付 Child Outcome 与 replacement Activation；`frame.call` 不等待 Child 最终业务结果；
14. Render 生命周期完全属于 Subsystem；
15. Renderer ⇄ Subsystem 数据面拆分为 Connection / Render Update / User Input 三个协议域；
16. Content 继续通过独立只读 Content API 传输。

## 2. Game Package v2 / Desktop Launcher

权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

Desktop v1 冻结：

- Descriptor `key + launcher.type=nodejs + launcher.entry + env`；
- 完整 Descriptor 集合先校验再产生 Process side effect；
- `launcher.entry` 是 Installation Root 相对 logical path，禁止 traversal / absolute / URL / redirect escape；
- Entry 仅接受 `.mjs / .cjs` regular file；
- Host 选择 Node Runtime，Game Package 不提供 Node executable / flags / argv；
- `shell=false`、固定 `cwd`、显式 child environment；
- Bootstrap authentication state 在 Process spawn 前建立；
- spawn success 后公共 Runtime 状态仍为 `starting`；
- unexpected Process exit 是 failure，即使 exit code 为 0；
- Desktop v1 不自动 restart；Node.js executable code 当前属于 trusted code，不宣称 OS sandbox。

## 3. Subsystem Control Protocol v1

权威入口：[Main ⇄ Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

冻结 wire surface：

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

核心规则：

- hello 成功后 Control Connection 永久绑定 `descriptor.key`；
- hello 只协商 Subsystem Control Protocol version；
- `ready` 是 Runtime status；`initializing` 可选；
- Main 建立 shutdown intent 后才发送 shutdown；`stopping` 只在 Main-requested shutdown 下合法；
- shutdown Response / `status(stopping)` 都不等于 `stopped`；
- `stopped` 来自 Supervisor；`failed` terminal；
- 没有 shutdown intent 的 Control loss / Process exit 是 Runtime failure；
- v1 无 application heartbeat、same-attempt reconnect / resume、automatic restart；
- LoomRealm semantic RPC error 使用 JSON-RPC `-32000` + `error.data.code`。

## 4. Frame / Call Protocol v1

权威入口：[Main ⇄ Subsystem Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

当前分批状态：

```text
Batch A  Identity / Authority / Lifecycle / Activation       ← Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        ← Frozen
Batch C  Call / Return transaction / commit barrier           ← Next
Batch D  Error / timeout / retry / cancellation               ← Draft
Batch E  Runtime failure unwind                                ← Draft
Batch F  Limits / fixtures / profile/version completion       ← Draft
```

### Batch A 冻结

- Frame 是 Main-owned call / ordinary-input control object；
- `frameId` Main-generated、Session-scoped unique、opaque、never reused；
- 每个 Frame 永久绑定一个 `descriptor.key`；
- `callerFrameId` 创建后 immutable；
- Main 是 Frame lifecycle、Stack、Activation 与 Input Target 的唯一权威；
- lifecycle = `starting / active / suspended / closing / closed`；
- `completed / cancelled / failed` 是 termination outcome，不是 lifecycle；
- v1 不存在 Frame `ready / initialized / frame.status`；
- 只有 `active` Frame 有有效 current Activation；
- `activationId` Main-generated、Session-scoped unique、never reused；
- Frame 每次重新 active 都获得新的 Activation；Activation 一旦 revoke 永久失效；
- 稳定状态 Stack Top = active，其他 live Frame = suspended；
- Frame lifecycle 不隐式控制 Runtime、Render 或 System Data Connection。

### Batch B 冻结

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

并冻结：

- 全部七个方法都是 JSON-RPC Request；
- source Subsystem identity 来自已认证 Control Connection，不重复携带 `systemId / sourceSubsystemKey`；
- `frame.initialize` / `frame.return` 不携带 `callerFrameId`；Receiver 由 Main 决定；
- `frame.close` v1 不携带 close reason；
- `frame.resume` 同时交付 Child Outcome 与 replacement Activation；
- `FrameOutcome` = `completed(value REQUIRED) / cancelled / failed(error)`；无返回值用 `null`；
- `FrameOutcome.failed` 与 JSON-RPC Error 不同；
- `frame.call` 只建立 Child call，不等待最终业务结果；最终结果通过 `frame.return → Main → frame.resume` 交付；
- RPC 对象使用 closed schema，不提供开放式 metadata bag；结构错误使用 JSON-RPC `-32602`。

旧 [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) 已降为 Legacy / redirect。

## 5. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 Bootstrap / Descriptor | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher Profile v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control Protocol v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Main ⇄ Subsystem Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Draft overall；Batch A/B Normative / Frozen |
| Main ⇄ Renderer Control | 尚待新文档 | Draft target |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| 旧 Frame 生命周期草案路径 | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |
| Game Package v1 | [game-package-v1.md](./game-package-v1.md) | Legacy for new bootstrap |
| Resource Protocol | [resource-protocol.md](./resource-protocol.md) | Legacy / Superseded by Content API |

## 6. 身份分层

```text
Subsystem Descriptor
    key

Launch Attempt
    launchId / PID / Process Handle
    Host-private

Main ⇄ Subsystem Control Connection
    connection-bound descriptor.key

Frame
    frameId
    permanently assigned descriptor.key
    callerFrameId (Main-owned relationship)

Frame Activation
    activationId
    one-shot ordinary input epoch

System Data Connection
    Legacy docs may still use systemId
    final migration belongs to Connection Protocol

Render Context
    independent Render identity
```

新 Frame / Call v1 不应再以 Legacy `systemId` 建立第二套身份来源。

## 7. 版本与 Profile 规则

- 改变字段含义、identity ownership、状态转换、RPC surface 或顺序保证属于不兼容变更；
- 不兼容变更必须提升版本或提供迁移；
- Transport Profile 变化不自动提升业务协议版本；
- Frame / Call 与 Subsystem Control 是独立协议域，即使共享物理 Control Connection；
- Batch C-F 不得静默改变 Batch A/B 已冻结的 identity / lifecycle / Activation / RPC fields；
- 架构概念占位名不得假装为冻结 wire field。

## 8. 当前推荐冻结顺序

```text
1. Game Package v2 / Desktop Node.js Launcher v1            ← Frozen
2. Subsystem Control Protocol v1                             ← Frozen
3A. Frame / Call Batch A                                     ← Frozen
3B. Frame / Call Batch B                                     ← Frozen
3C. Frame / Call Batch C: transaction / commit barrier       ← Next
3D. Frame / Call Batch D: error / timeout / retry
3E. Frame / Call Batch E: Runtime failure unwind
3F. Frame / Call Batch F: limits / fixtures / profile
4. Main ⇄ Renderer Control Protocol
5. Renderer ⇄ Subsystem Connection Protocol
6. User Input Protocol
7. Render Update Protocol
8. Render State Contract
```

Main ⇄ Renderer Control 可以在 Batch C 时同步验证 Input Target commit barrier，但不得反向改变 Batch A/B。

## 9. 当前明确暂缓项

- PWA Descriptor → Worker Script / Bootstrap Credential / Control Transport Profile；
- 第二种 Desktop Launcher Type；
- executable Sandbox / Publisher Trust / signing；
- automatic Runtime restart / resume / checkpoint；
- same-attempt Control reconnect；
- application-level heartbeat / health probe；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / flags / argv；
- Node version negotiation；
- Host timeout 默认数值；
- Bootstrap Token 精确熵 / 生成算法；
- 多主栈 / 一般 Frame Graph；
- Frame migration；
- Activation reuse / persistent resume。

实现不得以“优化”为由偷偷加入这些语义。

## 10. 完整协议冻结要求

完整协议最终仍需覆盖 Schema、request/result、pre/postcondition、state transition、ordering / idempotency、failure isolation、timeout / cancellation / retry、error code、security / size limit、version / compatibility 与 conformance fixture。

Frame / Call 当前已完成 Batch A/B，因此整体仍保持 Draft，直到 Batch F 完成后才能整体转为 Active / Normative / Frozen。
