# LoomRealm 游戏包契约 v1（Legacy for Subsystem Bootstrap）

> 层级：正式契约  
> 状态：Legacy / Superseded for new bootstrap  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Game Package v1 入口模型的退役说明  
> 被替代原因：Game Entry 现已声明完整 Subsystem Descriptor 与 Launcher；需要新的 Game Package 版本  
> 最近复核：2026-08-02

本路径保留用于旧链接和 Git 历史追溯。旧 v1 的 `realm.game.json` / `realm.entry.json` 基础格式和路径安全历史可以通过 Git 历史查询，但**旧入口模型不能继续作为当前 Subsystem Bootstrap 的实现依据**。

## 旧 v1 模型

旧版本入口主要表达：

```json
{
  "format": "loom-realm-entry",
  "formatVersion": 1,
  "system": "loom.map",
  "params": {}
}
```

并假设游戏包只选择平台预注册 System，实现由平台固定 Registry 提供。

该假设已经被 Subsystem Descriptor 架构替代。

## 当前架构要求的新版本能力

新的 Game Package Contract 必须至少表达：

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

并定义：

- initial target 如何引用已声明 Subsystem；
- Game Entry 一次性声明当前会话全部 Descriptor；
- `key` 唯一和稳定身份规则；
- Desktop MVP `launcher.type = nodejs`；
- 所有声明项 eager / all-required；
- unsupported Launcher 导致 Game Bootstrap 失败；
- Descriptor env 不能覆盖 LoomRealm 保留启动字段；
- `launcher.entry` 的最终路径基准、安全和安装根边界。

最后一项目前仍未冻结，不应从旧 v1 路径安全条款直接推导为 Node.js Launcher 的稳定保证。

## 仍然有效的跨版本原则

- 游戏包运行期间只读；
- Manifest / Entry 公共结构由 Main 校验；
- 业务 `params` 由目标 Subsystem 校验；
- 普通 Content API 不暴露物理路径；
- Runtime 状态不写回原始游戏包；
- `validate` 与正式运行会话是不同操作。

## 当前权威来源

- [产品设计总览](../00-overview/product-vision.md)；
- [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
- [存储与内容系统](../10-architecture/storage-system.md)；
- [ADR 0007：Subsystem Descriptor MVP 收敛](../decisions/0007-subsystem-descriptor-mvp.md)；
- [正式契约目录](./README.md)。

新的 Subsystem Descriptor 入口必须使用新的 Game Package 版本或等价明确迁移，不能静默改变 v1 字段含义。