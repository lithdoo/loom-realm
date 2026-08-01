# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-02

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明为什么这样设计；契约说明消息、状态和数据到底如何表现。

## 1. 当前架构迁移提示

2026-08-02 的架构修订已经确定两项会导致契约重组的上层结论：

1. Game Entry 声明本次会话全部 Subsystem 及其 Launcher Descriptor，Main 启动 Subsystem 后由 Subsystem 主动连接 Main，并以匹配 `systemId` 的 `ready` 表示加载完成；
2. Frame 只属于调用 / User Input Context，Render 生命周期完全属于 Subsystem；Frame 与 Render 没有公共协议所有权关系。

因此当前以下 v1 契约仍保留旧 Schema，**只能作为迁移前详细字段参考，不能继续作为新增架构设计的所有权依据**：

```text
frame-data-channel-v1.md
    仍把 Render State / Event 放进 Frame Logical Stream

client-state-tree-v1.md
    仍把 Scope / Node identity 绑定到 frameId

game-package-v1.md
    仍采用平台提供 System Registry、游戏包不声明可执行 Subsystem 的旧模型
```

这些不兼容变化将在后续契约 PR 中通过新版本 / 新协议域正式迁移，而不是在本轮架构 PR 中静默修改字段含义。

## 2. 当前契约

| 主题 | 权威入口 | 当前状态 |
|---|---|---|
| Runtime Container、Frame 生命周期与调用 | [生命周期协议草案](./system-lifecycle-protocol.md) | Draft；需按新的 Frame/Input-only 语义重写 ready 与恢复条件 |
| Renderer ⇄ Subsystem 数据 | [Renderer–Subsystem 数据协议 v1](./frame-data-channel-v1.md) | 迁移中；旧 Frame-scoped 数据模型待拆分 |
| Client State Tree | [Client State Tree v1](./client-state-tree-v1.md) | 迁移中；旧 Frame-scoped identity 待替换为 Render identity |
| 游戏包 | [游戏包契约 v1](./game-package-v1.md) | v1 保留；新的 Subsystem Descriptor / Launcher 需要新版本 |
| 逻辑只读内容访问 | [Content API v1](./content-api-v1.md) | Active / Normative；只读内容语义继续有效 |
| 资源交付 | [资源协议草案](./resource-protocol.md) | Draft；逐步并入 Content API 和 Renderer Resource Client |

## 3. 目标契约关系

架构层已经确定后续应收敛为：

```text
Main ⇄ Subsystem Bootstrap / Lifecycle Protocol
    Subsystem connect / identify / ready
    Frame initialize / activate / suspend / resume / close
        │
        └── Frame 只负责调用与 User Input Context

Main ⇄ Renderer Control Protocol
    Session / ready System
    Frame Stack / Activation / Input Target
    System Data Connection Grant / revoke

Renderer ⇄ Subsystem System Data Connection
    ├── Connection Protocol
    │       System-level identity / auth / version / heartbeat
    ├── Render Update Protocol
    │       renderId-oriented state / event / recovery
    └── User Input Protocol
            frameId + activationId-oriented input

Render State Tree / equivalent contract
    renderId / scopeId / node identity

Game Package v2 or equivalent
    initial call + subsystem descriptors + launcher profiles
```

内容主体继续通过 Content API 独立传输，不进入上述控制或 System Data Protocol。

## 4. Transport Profile

正式协议继续区分语义与传输：

| 语义连接 | 桌面 Profile | PWA Profile |
|---|---|---|
| Renderer ⇄ Main | 每会话 localhost WebSocket | MessagePort |
| Subsystem ⇄ Main | 每 System localhost WebSocket，Subsystem 主动连接 | 每 System 控制 MessagePort / Worker bootstrap |
| Renderer ⇄ Runtime Container | 每 System localhost WebSocket | 每 System 数据 MessagePort |
| Content API | localhost HTTP | same-origin Fetch + Service Worker |

不同 Profile 必须保持相同 System、Frame/Input 和 Render 所有权语义。

## 5. 身份分层

后续正式契约必须严格区分：

```text
System Data Connection
    sessionId + systemId + connectionId

Frame Input Context
    frameId + activationId

Render Context
    systemId + renderId

Render State
    Render/Scope Revision（精确名称待冻结）
```

Frame 不拥有 Render。Render Revision / Sequence 不能继续复用 Frame Activation Sequence。

## 6. 契约文档要求

一份可冻结的契约至少应包含：

- 参与方和适用范围；
- 术语和身份；
- 数据 Schema；
- 方法、请求、响应和通知；
- 前置条件和后置条件；
- 合法状态转换；
- 顺序与幂等性；
- 多路复用与故障隔离；
- 超时、取消和重试；
- 错误码和失败恢复；
- 安全和大小限制；
- 版本与兼容性；
- 最小互操作测试。

## 7. 版本规则

- 对现有实现无影响的说明性修改可以保持版本；
- 新增可选字段必须定义旧实现行为；
- 改变字段含义、身份归属、状态转换或顺序保证属于不兼容变更；
- 不兼容变更必须提升协议版本或提供明确迁移；
- Transport 实现变化不应自动提升业务协议版本；
- 实验字段不得假装为冻结字段。

本次 Frame-owned Render → Subsystem-owned Render、Game Package v1 → Subsystem Launcher Descriptor 都属于不兼容语义变更，因此后续不能直接覆盖现有 v1 字段定义。

## 8. 迁移顺序

建议按依赖顺序推进：

```text
1. Main ⇄ Subsystem Bootstrap / Lifecycle
2. Main ⇄ Renderer Control Protocol
3. Renderer ⇄ Subsystem Connection Protocol
4. Render Update Protocol
5. User Input Protocol
6. Render State Tree
7. Game Package 新版本
```

现有 v1 文件在新契约完成前保留，避免链接失效和历史语义丢失；新设计不得继续向旧 Frame-scoped Render 模型增加功能。
