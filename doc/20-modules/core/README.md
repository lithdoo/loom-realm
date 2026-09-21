# 已实现核心模块：从入口到真实产品

> 范围：当前 `main` 的实现结构；不是 milestone 签核报告。起点：`78ba3999f9064fbbfcf90e55c3b027d4fe25a397`（2026-09-21）。后续代码变化以实际源码与测试为准。

LoomRealm 分为 **框架逻辑（`packages/`）→ 可复用游戏业务（`game-libs/`）→ 具体游戏（`examples/`）→ 物理平台产品（`apps/`）**。跨进程的授权、身份与线协议由[正式契约](../../15-contracts/README.md)定义；这里说明已经存在的模块、职责、源码和验证入口，不复述历史实施会议和逐轮 PASS 记录。正式状态及待办只在[路线图](../../30-implementation/roadmap.md)追踪。

## 实现地图

| 边界 | 当前职责 | 源码/模块说明 | 验证入口 |
| --- | --- | --- | --- |
| Foundation、Wire、Game Package | 基础类型、消息格式、逻辑游戏拓扑与校验 | `packages/foundation`、`packages/wire`、[`Game Package`](../game-package/README.md) | 根 `package.json` 中对应 workspace 测试；`test:m12` 回归 |
| Runtime Control / Subsystem | Runner 生命周期、Frame、业务定义、RenderDomain 与 Content 作者接口 | `packages/runtime-control`、`packages/subsystem`；[Subsystem 模型](../../10-architecture/subsystem-model.md) | `test:m10`、`test:m11`、`test:m12` |
| Main | Session、Runtime、Frame、Activation、InputTarget、DataAuthority 唯一权威 | `packages/main`；[Main 模块](../main-system/README.md) | M9–M12 及相关集成测试 |
| Renderer / Web Presentation | 当前控制镜像、Render Store、副本、资源客户端、Web Projector 与 DOM 投影；不反向拥有业务 | `packages/renderer`；[Renderer 模块](../web-renderer/README.md) | `test:m11`、`test:m13`、Chromium |
| Content / FSDB | `@loomrealm/fsdb` 只读内核、`fsdb-http` 投影、Desktop Content、Subsystem ContentClient；不执行素材代码 | `packages/fsdb`、`packages/fsdb-http`、`apps/desktop`；[Content 模块](../fsdb-content-service/README.md) | `test:m12`、fixture importer |
| Map 游戏库 | 选择性导入 Map/Tileset/MapAction；有效 terrain/passability；普通行走、Bridge、Ledge 与地图渲染 | `game-libs/map`；[Map 模块](../loom-map/README.md) | `test:m14`、地图产品 E2E；正式资格另见路线图 |
| Essentials 示例 | 具体 Game Entry、准备的 FSDB、资源与页面组合；不提供平台或通用框架 | `examples/essentials-v21.1`、本地合法素材工具 | fixture、`test:m14:essentials-local`（需要合法本地素材） |
| Desktop / Hostra | Hostra 唯一 Electron/BrowserWindow owner；LoomRealm Desktop 是 plain Node 子进程，组合 Main、Data、Content 和可信 shell | `apps/desktop`；[Desktop 模块](../desktop-host/README.md) | `test:m15`、Hostra E2E |
| PWA | 设计已存在；M16 Worker Runtime 和 M17 产品等价仍未交付 | [PWA 模块](../pwa-host/README.md) | [路线图的未来验收](../../30-implementation/roadmap.md) |

## 一条端到端链路

```text
具体游戏 Game Entry → 平台 PREPARE / 逻辑 Game Package
→ Main Session / RuntimeHosting / Runner → Subsystem business authority
→ Data + RenderDomain → Renderer current Store → Web Projector
→ game-owned Web Component → Browser
```

输入方向相反：Browser 的物理输入通过 RendererInputSource / M10 进入 Main 的 InputTarget，再送到当前 Frame。Content 经平台准备、只读边界与授权客户端进入业务，不能通过 Browser 或导入工具回写第二份权威。

## 使用约定

- **了解当前接口：** 先读[契约索引](../../15-contracts/README.md)和相应源码公开入口，再读模块文档；旧 `M##_...` 计划不覆盖现有实现。
- **检查交付与下一步：** 只读[路线图](../../30-implementation/roadmap.md)；M11/M14/M15 历史 Closed 不自动等于当前 SHA 已重新认证。
- **追溯为什么这么设计：** [ADR 索引](../../decisions/README.md)与 Git 历史；已完成的审查/阶段过程不放在模块导航。
- **验证：** 使用当前 commit 的 CI run 与实际测试命令；不把另一个 SHA 的 PASS、静态回放或跳过测试当成当前产品 PASS。
