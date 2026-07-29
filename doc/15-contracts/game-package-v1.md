# LoomRealm 游戏包契约 v1

> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：游戏包契约 v1 的权威入口与稳定边界  
> 依赖：[存储与内容系统](../10-architecture/storage-system.md)  
> 最近复核：2026-07-29

本页是游戏包契约 v1 的新入口。完整字段、Schema、路径安全和校验规则当前仍由以下文档定义：

- [LoomRealm 游戏包契约 v1](../contracts/game-package-v1.md)

## 1. 已冻结边界

第一阶段：

- 普通目录即游戏包；
- 运行期间只读；
- 根目录包含 `realm.game.json`；
- 清单引用唯一 `realm.entry.json`；
- 入口定义初始 `system` 和 JSON `params`；
- 主系统只验证入口公共结构；
- 目标子系统验证业务参数；
- 所有物理路径必须限制在包内；
- 游戏包不要求执行包内脚本或本机二进制；
- Client State 只携带逻辑资源 Key。

## 2. 启动与验证

```text
loom-realm start ./game
    建立会话，只加载入口所需内容

loom-realm validate ./game
    遍历全部强引用，尽可能报告所有问题
```

`validate` 不启动正式调用栈，也不生成会话状态。

## 3. 入口边界

```json
{
  "format": "loom-realm-entry",
  "formatVersion": 1,
  "system": "loom.map",
  "params": {}
}
```

`params` 的字段属于目标子系统调用契约，不属于程序主系统固定 Schema。

## 4. 路径安全

必须拒绝：

- 绝对路径、盘符和 UNC；
- URL；
- `..` 越界；
- 符号链接或连接点逃逸；
- 指向游戏包外部的资源；
- 超过实现限制的文件大小和递归深度。

## 5. 后续迁移

后续将现有完整契约迁入本目录。迁移完成前，以旧路径中的 Normative 文档作为字段级单一真相源，本页负责维持新的文档层级和阅读入口。