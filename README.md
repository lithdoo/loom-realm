# LoomRealm

LoomRealm 是将逻辑游戏 Runtime 与平台物理组合分离的模块化游戏运行平台。Main 持有 Session/Runtime/InputTarget/DataAuthority，Subsystem 持有业务状态与 RenderDomain；Renderer 维护当前副本并投影。`game-libs/map` 是独立游戏业务库，不属于 framework；Hostra 是桌面的 Electron/BrowserWindow owner。

**[文档首页](./doc/index.md) · [已实现核心模块](./doc/20-modules/core/README.md) · [系统架构](./doc/10-architecture/system-overview.md) · [正式契约](./doc/15-contracts/README.md) · [下一阶段路线图](./doc/30-implementation/roadmap.md) · [ADR](./doc/decisions/README.md)**

## 仓库布局

```text
packages/     通用运行框架、角色与协议实现
game-libs/    可复用的具体游戏业务库（Map）
examples/     具体游戏和合法的本地兼容性示例
apps/         Desktop / 后续 PWA 物理产品组合
tools/        导入、fixture 和开发工具
doc/          唯一 VitePress 文档站源目录
```

依赖方向：`examples → game-libs → framework public author APIs`。跨模块 ABI 以契约为准；尚欠的 M11/M14/M15 当期资格、地形 RGSS 保真和 M16/M17 仅在路线图追踪，不在 README 维护另一个实时 PASS 表。

## 本地文档检查

```bash
npm ci
npm run docs:check-links
npm run docs:build
```

产品测试请使用根 `package.json` 中存在的脚本和[测试策略](./doc/30-implementation/testing-strategy.md)。PR 的 M12–M15 使用增量任务并由汇总检查统一判定；`main`/手动入口保留完整 canonical 链，细节见[CI 说明](./.github/CI-QUALIFICATION.md)。实际完成状态以当前 SHA 的 GitHub Actions 为准，不能复用历史成功记录。
