# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Loader、Catalog、Repository、资源和 Validator 的模块边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[游戏包契约 v1](../../15-contracts/game-package-v1.md)  
> 最近复核：2026-07-29

## 1. 建议模块

```text
Game Package
├── Safe Package Root
├── Manifest Loader
├── Entry Loader
├── Requirement Resolver
├── Catalog Builder
├── Repository Toolkit
├── Resource Service
└── Package Validator
```

## 2. Safe Package Root

统一处理路径规范化、包内约束和链接逃逸检查。其他模块不得自行拼接未经验证的本机路径。

## 3. Manifest 与 Entry Loader

- 读取 UTF-8 JSON；
- 校验格式和版本；
- 解析公共字段；
- 保留目标子系统业务参数原样；
- 不启动业务内容加载。

## 4. Requirement Resolver

检查平台版本、必需 System 和 Feature。系统解析失败与内容加载失败使用不同错误分类。

## 5. Catalog Builder

扫描必要 Namespace 和轻量元数据，建立逻辑 ID 到安全内容位置的索引，不读取全部地图和图片主体。

## 6. Repository Toolkit

为具体子系统提供只读 Repository 基础能力：

- 异步读取；
- 解析和局部校验；
- 同 ID 并发去重；
- 进程内缓存；
- 不可变返回值；
- 关闭和取消。

具体业务 Repository 属于对应子系统。

## 7. Resource Service

根据稳定资源 Key 交付 MIME、内容版本和主体。最终归属和权限模型由资源协议冻结。

## 8. Package Validator

`validate` 遍历全部强引用，聚合错误而不是遇到首个错误即结束。它不创建正式 Frame，也不运行游戏会话。

## 9. 核心不变量

- 游戏包运行期间只读；
- 公共 Loader 不解释地图参数；
- Catalog 不保存大型主体；
- Repository 不进入 Runtime Core；
- 物理路径不进入 Client State；
- 所有解析输入都有大小和深度限制。

## 10. 测试入口

- 清单和入口成功/失败；
- 路径穿越和符号链接；
- 重复内容 ID；
- Catalog 不读取图片主体；
- Repository 并发去重；
- 缓存失败不污染后续请求；
- `start` 延迟加载；
- `validate` 全包聚合错误。

现有详细资料：[第一阶段游戏启动与异步内容加载](../../game-package/phase-1-game-loading.md)。
