# LoomRealm

LoomRealm 是将逻辑游戏 Runtime 与平台物理组合分离的模块化游戏运行平台。Main 持有 Session/Runtime/InputTarget/DataAuthority，Realm State 持有 session 共享业务状态，Subsystem 持有 domain execution 与 RenderDomain；Renderer 维护只读/current presentation replica 并产生输入。`game-libs/` 存放可复用游戏业务库，Desktop 与 PWA 采用不同 physical topology，但遵守相同逻辑 authority 与 contract。

**[文档首页](./doc/index.md) · [产品与治理](./doc/00-overview/product-vision.md) · [系统架构](./doc/10-architecture/system-overview.md) · [正式契约](./doc/15-contracts/README.md) · [已实现模块](./doc/20-modules/core/README.md) · [开发与资格](./doc/30-development/README.md) · [ADR](./doc/decisions/README.md)**

## 仓库布局

```text
packages/     通用运行框架、角色与协议实现
game-libs/    可复用的具体游戏业务库
examples/     具体游戏、fixture 与合法本地兼容性入口
apps/         Desktop / PWA 物理产品组合
tools/        导入、fixture 和开发工具
doc/          唯一 VitePress 文档站源目录
```

依赖方向以 architecture/contracts 为准；跨模块 ABI 以 `doc/15-contracts` 为准。任务进度属于 GitHub Issue/PR，不在 Current 文档维护第二套 milestone ledger。历史 M7–M17 qualification、旧 review 与原始测量仍可从 legacy evidence 路径和 Git 历史追溯，但不能覆盖 Current Architecture、Contract、Module 或 Development 文档。

## 文档检查

```bash
npm ci
npm run docs:check-links
npm run docs:build
```

产品测试与 requalification 入口见[测试](./doc/30-development/testing.md)和[资格规则](./doc/30-development/qualification.md)。实际 PASS 只对被测 subject/HEAD 有效，不能继承历史成功记录。
