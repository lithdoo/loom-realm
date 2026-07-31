# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-01

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明为什么这样设计；契约说明消息、状态和数据到底如何表现。

## 1. 当前契约

| 主题 | 权威入口 | 当前详细来源或状态 |
|---|---|---|
| Runtime Container、Frame 生命周期与调用 | [生命周期协议草案](./system-lifecycle-protocol.md) | Draft；Container 与 Frame 两层状态仍需冻结 |
| Frame 输入上行与视图下行 | [Frame 数据通道 v1](./frame-data-channel-v1.md) | Active / Normative；桌面 WebSocket 与 PWA MessagePort 共用语义 |
| Client State Tree | [Client State Tree v1](./client-state-tree-v1.md) | Active / Normative；精确树字段仍引用现有 Normative 协议 |
| 游戏包 | [游戏包契约 v1](./game-package-v1.md) | Active / Normative |
| 逻辑只读内容访问 | [Content API v1](./content-api-v1.md) | Active / Normative；桌面 HTTP 与 PWA Service Worker 共用语义 |
| 资源交付 | [资源协议草案](./resource-protocol.md) | Draft；逐步并入 Content API 和 Renderer Resource Client |

## 2. 契约关系

```text
生命周期协议
    创建、激活、暂停、恢复和关闭 Frame
        ↓
Frame 数据通道
    输入上行、Client State 下行、Event 和 Resync
        ↓
Client State Tree
    Frame / Scope / Client Node 的声明式结构

游戏包契约
    安装实例与入口
        ↓
Content API
    Manifest、Record、Group 和 Resource 的只读访问
```

生命周期控制消息不承载普通输入或 Client State。资源主体不进入 Frame 数据通道。

## 3. Transport Profile

正式协议区分语义与传输：

| 语义连接 | 桌面 Profile | PWA Profile |
|---|---|---|
| Renderer ⇄ Main | localhost WebSocket | MessagePort |
| Main ⇄ Runtime Container | localhost WebSocket | MessagePort |
| Renderer ⇄ Frame Runtime | localhost WebSocket | 每 Frame 一个 MessagePort |
| Content API | localhost HTTP | same-origin Fetch + Service Worker |

不同 Profile 必须通过同一契约 Fixture，产生相同状态、错误和恢复结果。

## 4. 契约文档要求

一份可冻结的契约至少应包含：

- 参与方和适用范围；
- 术语和身份；
- 数据 Schema；
- 方法、请求、响应和通知；
- 前置条件和后置条件；
- 合法状态转换；
- 顺序与幂等性；
- 超时、取消和重试；
- 错误码和失败恢复；
- 安全和大小限制；
- 版本与兼容性；
- 最小互操作测试。

## 5. 当前成熟度

Frame 数据通道、Client State Tree、游戏包和 Content API 已标记为 Normative，但仍处于第一阶段演进期。

生命周期、调用返回、Container 故障展开、精确 JSON Schema 和部分资源授权仍未完全冻结。实现不能仅根据示例 JSON 推断最终协议。

## 6. 版本规则

- 对现有实现无影响的说明性修改可以保持版本；
- 新增可选字段必须定义旧实现行为；
- 改变字段含义、状态转换或顺序保证属于不兼容变更；
- 不兼容变更必须提升协议版本或提供明确协商与迁移；
- Transport 实现变化不应自动提升业务协议版本；
- 实验字段不得假装为冻结字段。

## 7. 迁移说明

本目录是新的契约权威入口。旧路径暂时保留详细内容，后续按主题迁入本目录。

迁移期间：

1. 新结论先写入本目录对应入口；
2. 旧文档只维护必要的一致性修正；
3. 主题完整迁移后，将旧文件改为 Legacy 提示；
4. 内部链接迁移完成前不删除旧路径；
5. Frame 数据通道和 Content API 的新定义优先于旧通信示例中的 Transport 假设。
