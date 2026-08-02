# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-02

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明系统职责和所有权；契约冻结消息、状态、顺序、错误和兼容性。

## 1. 当前已确定的上层边界

1. Game Entry 一次性声明本次会话全部 Subsystem Descriptor；
2. Descriptor identity 使用稳定 `key`，MVP 不保留独立 `id` / `name`；
3. Desktop MVP 唯一 Launcher Type 为 `nodejs`；
4. 全部 Descriptor eager / all-required，MVP 不定义 `lazy`；
5. 任一 unsupported Launcher 或任一 required Subsystem 无法 ready 都使 Game Bootstrap 失败；
6. `launcher.entry` 路径基准和安全规则尚未冻结；
7. Main ⇄ Subsystem Control v1 使用 `subsystem.hello` 完成 identity binding / version negotiation，使用 `subsystem.status` 报告 Runtime lifecycle；
8. `connected ≠ identified ≠ ready`；
9. Frame 只属于 call / User Input Context；
10. Render 生命周期完全属于 Subsystem；
11. Renderer ⇄ Subsystem 数据面拆分为 Connection / Render Update / User Input 三个协议域；
12. Content 继续通过独立只读 Content API 传输。

## 2. Subsystem Descriptor MVP

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

已冻结语义：

- `key` 在 Descriptor 集合中唯一并保持稳定；
- Main 在启动任何业务 Subsystem 前读取完整 Descriptor 集合；
- Main 在 Bootstrap 阶段启动全部声明 Subsystem；
- Descriptor env 不能覆盖 LoomRealm 保留启动字段；
- `launcher.entry` 的最终路径与安全规则仍待 Game Package v2 / Launcher Contract 冻结。

## 3. Main ⇄ Subsystem Control v1

权威入口：[Main ⇄ Subsystem 控制与运行时生命周期协议 v1](./subsystem-control-lifecycle-protocol.md)。

冻结的 wire surface：

```text
subsystem.hello Request
    key
    bootstrapToken
    protocolVersions[]

subsystem.status Notification
    initializing
    ready + rendererDataEndpoint
    stopping
    failed + error
```

核心规则：

- hello 成功后 Control Connection 永久绑定 `descriptor.key`；
- `ready` 是 Runtime status，不重新声明 identity；
- `initializing` 可选；
- `failed` terminal；
- duplicate / illegal reverse status transition 为 fatal Protocol Error；
- Desktop v1 ready endpoint 使用 WebSocket Profile；
- Runtime lifecycle message 不加入 timestamp / sequence / PID / arbitrary metadata。

## 4. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Main ⇄ Subsystem Bootstrap / Identity / Runtime Lifecycle | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Draft / Stabilizing；v1 hello/status Schema 与状态机已冻结 |
| Main ⇄ Subsystem Frame / Call | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Draft；已移除 Container Bootstrap 与 Frame-owned Render 假设 |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render State Tree / equivalent | 尚待新文档 | Draft target |
| Game Package v2 / Descriptor | 尚待新版本 | Draft target；`entry` 安全仍待冻结 |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |
| Game Package v1 | [game-package-v1.md](./game-package-v1.md) | Legacy for new bootstrap |
| 独立 Resource Protocol | [resource-protocol.md](./resource-protocol.md) | Legacy / Superseded by Content API |

旧 v1 路径保留用于链接兼容和 Git 历史追溯，不再重复发布已被当前架构否定的 Normative Schema。

## 5. 目标契约关系

```text
Game Package v2
    initial target
    subsystem descriptors
        key
        launcher.type = nodejs
        launcher.entry
        env
    eager / all-required bootstrap
        │
        ▼
Main ⇄ Subsystem Control & Runtime Lifecycle v1
    subsystem.hello
    subsystem.status
        │
        ▼
Main ⇄ Subsystem Frame / Call Protocol
    frame initialize / activate / suspend / resume / close
    call / return

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

## 6. 身份分层

```text
Subsystem Descriptor
    key

Main ⇄ Subsystem Control Connection
    hello 成功后 connection-bound descriptor.key

System Data Connection
    当前旧协议常用 sessionId + systemId + connectionId
    systemId 与 Descriptor key 的最终统一方式待 Connection Contract 冻结

Frame Input Context
    frameId + activationId

Render Context
    independent Render identity
    精确 wire 字段名待冻结
```

不要全局把现有 `systemId` 文本替换为 `key`。Descriptor identity 已冻结为 `key`，但旧数据协议字段的兼容迁移必须在对应协议版本中显式完成。

## 7. 版本规则

- 说明性修改且不改变实现行为，可以保持协议版本；
- 新增可选字段必须定义旧实现行为；
- 改变字段含义、identity ownership、状态转换或顺序保证属于不兼容变更；
- 不兼容变更必须提升版本或提供迁移；
- Transport Profile 变化不自动提升业务协议版本；
- 架构概念占位名不得假装为冻结 wire field。

Frame-owned Render → Subsystem-owned Render、Game Package v1 → Descriptor Launcher 都是不兼容语义变化，因此旧 v1 已降为 Legacy，而不是原地改义。

## 8. 推荐迁移顺序

```text
1. Game Package v2 / Launcher entry security
2. Main ⇄ Subsystem Control & Runtime Lifecycle v1   ← hello/status 已收敛
3. Main ⇄ Subsystem Frame / Call Protocol
4. Main ⇄ Renderer Control Protocol
5. Renderer ⇄ Subsystem Connection Protocol
6. User Input Protocol
7. Render Update Protocol
8. Render State Contract
```

User Input 与 Render Update 可以并行设计，但都依赖 System Data Connection 边界已经明确。

## 9. 契约冻结要求

一份可冻结契约至少包含：

- 参与方 / scope；
- terminology / identity；
- JSON Schema；
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