# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-03

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明系统职责和所有权；契约冻结消息、状态、顺序、错误和兼容性。

## 1. 当前已确定的上层边界

1. Game Entry 一次性声明本次会话全部 Subsystem Descriptor；
2. Descriptor identity 使用稳定 `key`，MVP 不保留独立 `id` / `name`；
3. Desktop MVP 唯一 Launcher Type 为 `nodejs`；
4. 全部 Descriptor eager / all-required，MVP 不定义 `lazy`；
5. `launcher.entry` 已冻结为 Installation Root 相对的安全 package logical path；
6. Desktop Node.js Launcher 由 Host 选择 Node Runtime，`shell = false`，显式构造 child environment；
7. Launcher 在 spawn 前创建 Launch Attempt、注册 Bootstrap Credential，并在 spawn 后由 Supervisor 接管 Process；
8. Desktop v1 不自动 restart failed Subsystem；
9. Node.js Subsystem code 在 Desktop v1 中属于 trusted executable code；Entry 路径安全不等于 OS sandbox；
10. Subsystem Control Protocol v1 已冻结 `subsystem.hello / subsystem.status / subsystem.shutdown`；
11. Main 拥有正常 Runtime shutdown intent，`stopped` 只来自 Supervisor observation；
12. Subsystem Control v1 不定义 application heartbeat、reconnect、resume 或 automatic restart；
13. `spawn success ≠ connected ≠ identified ≠ ready`；
14. Frame / Call 是独立协议域；Batch A 已冻结 Frame identity、authority、lifecycle 与 Activation；
15. Frame lifecycle 只有 `starting / active / suspended / closing / closed`；`completed / cancelled / failed` 是 outcome，不是 lifecycle state；
16. Frame v1 不定义独立 `ready / initialized / frame.status`；
17. `frameId` / `activationId` 由 Main 生成、Session 内唯一且不复用；Activation 一旦 revoke 永久失效；
18. Render 生命周期完全属于 Subsystem；
19. Renderer ⇄ Subsystem 数据面拆分为 Connection / Render Update / User Input 三个协议域；
20. Content 继续通过独立只读 Content API 传输。

## 2. Game Package v2 / Desktop Launcher

权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

Descriptor：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: {
    readonly type: "nodejs";
    readonly entry: string;
  };
  readonly env?: Readonly<Record<string, string>>;
}
```

冻结语义：

- `key` 在 Descriptor 集合中唯一并保持稳定；
- Main 在启动任何业务 Subsystem 前读取并校验完整 Descriptor 集合；
- 当前全部 Descriptor eager / required；
- `launcher.entry` 是 Installation Root 相对 logical path，并禁止 traversal、absolute/URL、symlink/junction/reparse escape；
- Desktop v1 Entry 只接受 `.mjs` / `.cjs` regular file；普通 `.js` + `package.json.type` 解析暂缓；
- Game Package 不能指定 Node executable、Node flags、argv 或 Shell；
- Child environment 不默认继承 Main 完整 ambient environment；
- Descriptor `env` 不能覆盖 `LOOMREALM_*`、`NODE_OPTIONS`、`NODE_PATH`；
- Bootstrap authentication state 必须在 Process spawn 前建立；
- spawn success 只表示 Process 已创建并纳入 Supervisor，公共 Runtime 状态仍为 `starting`；
- unexpected Process exit 是 failure，即使 exit code 为 0；
- Desktop v1 不自动 restart。

## 3. Subsystem Control Protocol v1

权威入口：[Main ⇄ Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

冻结 wire surface：

```text
Subsystem → Main
    subsystem.hello      Request
        key
        bootstrapToken
        protocolVersions[]

    subsystem.status     Notification
        initializing
        ready + rendererDataEndpoint
        stopping
        failed + error

Main → Subsystem
    subsystem.shutdown   Request
        reason = session-end | bootstrap-abort
```

核心规则：

- hello 成功后 Control Connection 永久绑定 `descriptor.key`；
- hello 只协商 Subsystem Control Protocol version，不协商 Frame / Call；
- `ready` 是 Runtime status，不重新声明 identity；
- `initializing` 可选；
- Main 在发送 shutdown 前先建立 shutdown intent；
- `stopping` 只有 Main-requested shutdown 下合法；
- shutdown Response 只表示关闭请求已接受，不表示 Process 已退出；
- `stopped` 来自 Supervisor 对实际 Runtime exit 的观察，不由 Subsystem 自报告；
- `failed` terminal；
- duplicate / illegal status transition 为 fatal Protocol Error；
- 没有 shutdown intent 的 Control Connection loss / Process exit 是 Runtime failure；
- v1 不支持 same-attempt reconnect / resume / old-token reuse；
- v1 不定义 application heartbeat；
- LoomRealm semantic RPC error 使用 JSON-RPC `-32000` + 稳定 `error.data.code`；
- Runtime lifecycle message 不加入 PID / launchId / arbitrary metadata。

## 4. Frame / Call Protocol v1

权威入口：[Main ⇄ Subsystem Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

当前采用分批冻结：

```text
Batch A  Identity / Authority / Lifecycle / Activation    ← Frozen
Batch B  RPC Schema                                        ← Draft
Batch C  Call / Return transaction / commit barrier         ← Draft
Batch D  Error / timeout / retry / cancellation              ← Draft
Batch E  Runtime failure unwind                              ← Draft
Batch F  Limits / fixtures / profile/version completion      ← Draft
```

Batch A 已冻结：

- Frame 是 Main-owned call / ordinary-input control object；
- `frameId` Main-generated、Session-scoped unique、opaque、never reused；
- 每个 Frame 永久绑定一个 `descriptor.key`；
- `callerFrameId` 创建后 immutable；
- Main 是 Frame lifecycle、Stack、Activation 与 Input Target 的唯一权威；
- lifecycle = `starting / active / suspended / closing / closed`；
- `completed / cancelled / failed` 是 termination outcome，不是 lifecycle state；
- v1 不存在 Frame `ready / initialized / frame.status`；
- 只有 `active` Frame 有有效 current Activation；
- `activationId` Main-generated、Session-scoped unique、never reused；
- Frame 每次重新 active 都获得新的 Activation；
- Activation 一旦 revoke 永久失效，never rolls back；
- 稳定状态中 Stack Top = active，其他 live Frame = suspended；
- Frame 只能在 ready 且无 shutdown intent 的 Runtime 上建立；
- Frame lifecycle 不隐式控制 Runtime、Render 或 System Data Connection。

旧 [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) 已降为 Legacy / redirect，不再作为当前 Frame 设计权威入口。

## 5. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 Bootstrap / Descriptor | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop Bootstrap subset 已冻结 |
| Desktop Node.js Launcher Profile v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative；Entry / env / spawn / Supervisor / failure 已冻结 |
| Subsystem Control Protocol v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative；hello/status/shutdown、错误、limits 与 failure semantics 已冻结 |
| Main ⇄ Subsystem Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Draft overall；Batch A Identity/Lifecycle/Activation 已 Normative / Frozen |
| Main ⇄ Renderer Control | 尚待新文档 | Draft target |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render State Tree / equivalent | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| 旧 Frame 生命周期草案路径 | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded by Frame / Call v1 |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |
| Game Package v1 | [game-package-v1.md](./game-package-v1.md) | Legacy for new bootstrap |
| 独立 Resource Protocol | [resource-protocol.md](./resource-protocol.md) | Legacy / Superseded by Content API |

## 6. 目标契约关系

```text
Game Package v2
    subsystem descriptors
        │
        ▼
Desktop Node.js Launcher Profile v1
    process spawn / supervision
        │
        ▼
Subsystem Control Protocol v1
    Runtime identity / lifecycle / shutdown
        │
        ├─────────────────────────────┐
        ▼                             ▼
Frame / Call Protocol v1       Runtime Supervisor
    Frame identity             process existence / termination
    lifecycle / Activation
    call / return (Batch B+)

Main ⇄ Renderer Control Protocol
    Session / Subsystem State
    Frame Stack / Activation / Input Target
    System Data Grant / revoke

Renderer ⇄ Subsystem System Data Connection
    ├── Connection Protocol
    ├── Render Update Protocol
    └── User Input Protocol

Render State Contract
    Render identity / Scope / Node / Revision / Event / Recovery

Readonly Content API
    Manifest / Record / Group / Resource
```

## 7. 身份分层

```text
Subsystem Descriptor
    key

Launch Attempt
    launchId / PID / Process Handle
    Host-private; not protocol identity

Main ⇄ Subsystem Control Connection
    hello 成功后 connection-bound descriptor.key

Frame
    frameId
    permanently assigned descriptor.key
    callerFrameId

Frame Activation
    activationId
    one-shot ordinary input epoch

System Data Connection
    当前旧协议常用 sessionId + systemId + connectionId
    systemId 与 Descriptor key 的最终 wire 迁移由 Connection Contract 冻结

Render Context
    independent Render identity
    精确 wire 字段名待冻结
```

不要全局把 Legacy 数据协议中的 `systemId` 文本替换为 `key`；但新 Frame / Call v1 不应再以旧 `systemId` 建立新的身份来源。

## 8. 版本与 Profile 规则

- 说明性修改且不改变实现行为，可以保持协议版本；
- 新增可选字段必须定义旧实现行为；
- 改变字段含义、identity ownership、状态转换或顺序保证属于不兼容变更；
- 不兼容变更必须提升版本或提供迁移；
- Transport Profile 变化不自动提升业务协议版本；
- Launcher Profile 变化不得静默改变 Game Package 字段含义；
- Frame / Call 与 Subsystem Control 是独立协议域，即使共享物理 Control Connection；
- Frame Batch B+ 不得重新打开 Batch A 已冻结的 identity / lifecycle / Activation；
- 架构概念占位名不得假装为冻结 wire field。

## 9. 当前推荐冻结顺序

```text
1. Game Package v2 Bootstrap / Desktop Node.js Launcher v1  ← 已冻结
2. Subsystem Control Protocol v1                             ← 已冻结
3A. Frame / Call Batch A: Identity/Lifecycle/Activation      ← 已冻结
3B. Frame / Call Batch B: RPC Schema                         ← 下一步
3C. Frame / Call Batch C: transaction / commit barrier
3D. Frame / Call Batch D: error / timeout / retry
3E. Frame / Call Batch E: Runtime failure unwind
3F. Frame / Call Batch F: limits / fixtures / profile
4. Main ⇄ Renderer Control Protocol
5. Renderer ⇄ Subsystem Connection Protocol
6. User Input Protocol
7. Render Update Protocol
8. Render State Contract
```

Main ⇄ Renderer Control 可以在 Frame Batch C 时同步验证 Input Target commit barrier，但不得反向改变 Batch A identity / Activation 语义。

## 10. 当前明确暂缓项

以下项目不阻塞当前已冻结的 Launcher / Subsystem Control / Frame Batch A：

- PWA Descriptor → Worker Script Profile；
- PWA Bootstrap Credential / Control Transport Profile；
- 第二种 Desktop Launcher Type；
- 不可信 executable code Sandbox；
- automatic Runtime restart / resume / checkpoint / crash recovery；
- same-attempt Control reconnect；
- application-level heartbeat / health probe；
- lazy / idle recycle；
- 一个 `key` 多 Runtime instance；
- remote Subsystem；
- Game-supplied Node executable / flags / argv；
- Node version negotiation in Game Entry；
- Host timeout 默认数值；
- Bootstrap Token 精确熵 / 生成算法；
- executable signature / Publisher Trust；
- 多主栈 / 一般 Frame Graph；
- Frame migration；
- Activation reuse / persistent resume。

实现不得以“优化”为由偷偷加入这些语义。

## 11. 契约冻结要求

一份完整可冻结协议至少包含：

- 参与方 / scope；
- terminology / identity；
- Schema；
- request / response / notification；
- precondition / postcondition；
- state transition；
- ordering / idempotency；
- multiplexing / failure isolation；
- timeout / cancellation / retry；
- error code；
- security / size limit；
- version / compatibility；
- interoperable fixture / conformance test。

Frame / Call 当前只完成上述清单中属于 Batch A 的身份、权威、生命周期与 Activation 部分，因此整体状态仍保持 Draft，直到 Batch F 完成。
