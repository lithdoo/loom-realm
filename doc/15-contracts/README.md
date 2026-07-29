# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-07-29

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明为什么这样设计；契约说明消息、状态和数据到底如何表现。

## 1. 当前契约

| 主题 | 新入口 | 当前详细来源 |
|---|---|---|
| 子系统生命周期与调用 | [生命周期协议草案](./system-lifecycle-protocol.md) | [程序主系统与模块子系统](../architecture/main-system-and-subsystems.md)、[JSON-RPC 与状态同步](../architecture/runtime-rpc-and-state-sync.md) |
| Client State Tree | [Client State Tree v1](./client-state-tree-v1.md) | [现有 Normative 协议](../architecture/client-state-tree-protocol.md) |
| 游戏包 | [游戏包契约 v1](./game-package-v1.md) | [现有 Normative 契约](../contracts/game-package-v1.md) |
| 资源交付 | [资源协议草案](./resource-protocol.md) | [游戏加载设计](../game-package/phase-1-game-loading.md) |

## 2. 契约文档要求

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

## 3. 当前成熟度

Client State Tree 和游戏包契约已标记为 Normative，但仍处于第一阶段演进期。

生命周期、调用返回、资源接口和精确 JSON Schema 尚未完全冻结。实现前必须解决相关开放问题，不能仅根据示例 JSON 推断最终协议。

## 4. 版本规则

- 对现有实现无影响的说明性修改可以保持版本；
- 新增可选字段必须定义旧实现行为；
- 改变字段含义、状态转换或顺序保证属于不兼容变更；
- 不兼容变更必须提升协议版本或提供明确协商与迁移；
- 实验字段不得假装为冻结字段。

## 5. 迁移说明

本目录是新的契约入口。旧路径暂时保留详细内容，后续按主题迁入本目录。

迁移期间：

1. 新结论先写入本目录对应入口；
2. 旧文档只维护必要的一致性修正；
3. 主题完整迁移后，将旧文件改为 Legacy 提示；
4. 内部链接迁移完成前不删除旧路径。
