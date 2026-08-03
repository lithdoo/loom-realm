# LoomRealm 游戏包契约 v1（Legacy for Subsystem Bootstrap）

> 层级：正式契约  
> 状态：Legacy / Superseded for new bootstrap  
> 稳定程度：Frozen Historical  
> 主要定义：旧 Game Package v1 入口模型的退役说明  
> 被替代原因：Game Entry 现已声明完整 Subsystem Descriptor 与 Launcher  
> 最近复核：2026-08-03

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

## 当前 v2 Bootstrap 模型

当前权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

当前 Descriptor：

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

当前已冻结：

- Game Entry 一次性声明当前会话全部 Descriptor；
- `key` 唯一且作为稳定 Runtime identity；
- Desktop v1 `launcher.type = nodejs`；
- 所有声明项 eager / all-required；
- unsupported Launcher 导致 Game Bootstrap 失败；
- Descriptor env 不能覆盖 LoomRealm / Node 保留启动字段；
- `launcher.entry` 是 Installation Root 相对的安全 package logical path；
- Desktop v1 Entry 禁止 traversal / absolute / URL / symlink escape，并只接受 `.js` / `.mjs` / `.cjs` regular file；
- Node executable 由 Host 选择，Process creation 不经过 Shell；
- Launcher 在 spawn 前创建/注册 Launch Attempt Bootstrap Credential；
- spawn success 不等于 connected / identified / ready；
- Desktop v1 不自动 restart。

## 仍然有效的跨版本原则

- 游戏包运行期间只读；
- Manifest / Entry 公共结构由 Main 校验；
- 业务 `params` 由目标 Subsystem 校验；
- 普通 Content API 不暴露物理路径；
- Runtime 状态不写回原始游戏包；
- `validate` 与正式运行会话是不同操作。

注意：当前 Desktop Node.js executable code 属于 trusted code，Entry 路径安全不构成 Node.js OS sandbox。

## 当前权威来源

- [产品设计总览](../00-overview/product-vision.md)；
- [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
- [存储与内容系统](../10-architecture/storage-system.md)；
- [ADR 0007：Subsystem Descriptor MVP 收敛](../decisions/0007-subsystem-descriptor-mvp.md)；
- [ADR 0008：Desktop Node.js Launcher Profile v1](../decisions/0008-desktop-nodejs-launcher-profile-v1.md)；
- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

新的 Subsystem Descriptor 入口必须使用 v2 或等价明确迁移，不能静默改变 v1 字段含义。
