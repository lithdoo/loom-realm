# 已实现核心模块：从入口到产品

> 范围：Current repository realization；不是 milestone 签核报告。跨进程身份、授权和协议以[正式契约](../../15-contracts/README.md)为准，系统级 owner 以[架构总览](../../10-architecture/system-overview.md)为准。

LoomRealm 分为 **framework/runtime (`packages/`) → reusable game business (`game-libs/`) → concrete games (`examples/`) → physical products (`apps/`)**。这里说明已经存在的模块、职责、代码位置和主要验证入口，不复述逐轮 delivery/PASS 历史。

## 实现地图

| Capability | Current responsibility | Owner / docs | Validation examples |
| --- | --- | --- | --- |
| Foundation / Wire / Game Package | 基础类型、bounded message mechanics、logical game topology/validation | `packages/foundation`、`packages/wire`、[`game-package`](../game-package/README.md) | workspace tests / contract conformance |
| Main / Runtime Control | Session、Runtime、Frame、Activation、InputTarget、DataAuthority 与 failure unwind | `packages/main`、`packages/runtime-control`、[`Main`](../main-system/README.md) | runtime/main qualification suites |
| Realm State | Session shared mutable Records、versions、OCC、subscriptions、commit revision | `packages/realm-state`、[architecture](../../10-architecture/realm-state-system.md) | `test:realm-state` + integration |
| Subsystem | Domain execution、local business state、Input Interest、Render Domains、Content author API | `packages/subsystem`、[Subsystem](../../10-architecture/subsystem-model.md) | subsystem/render/content tests |
| Renderer / Web Presentation | current replica、input producer gate、resource client、Web Projector 与 DOM projection | `packages/renderer` 与 related packages、[Renderer](../web-renderer/README.md) | render/input/presentation + Chromium |
| Content / FSDB | readonly FSDB core、HTTP projection、platform Content service、Subsystem ContentClient | `packages/fsdb`、`packages/fsdb-http`、[Content](../fsdb-content-service/README.md) | content/FSDB/importer suites |
| Map game library | Map/Tileset/MapAction、passability、movement、Bridge/Ledge、browser presentation | `game-libs/map`、[Map](../loom-map/README.md) | map package + real consumer/product E2E |
| Desktop / Hostra | Hostra owns Electron/BrowserWindow；LoomRealm Desktop plain Node child composes runtime/data/content | `apps/desktop`、[Desktop](../desktop-host/README.md) | Hostra/Desktop E2E |
| PWA | Window + Session Worker + Subsystem Workers + Service Worker product composition | `apps/pwa`、[`game-launcher-pwa`](../../../packages/game-launcher-pwa)、[PWA](../pwa-host/README.md) | PWA browser/product qualification |

现有 `test:mXX` 名称是历史兼容的 command alias，不再定义模块阶段；测试职责与当前入口见[测试策略](../../30-development/testing.md)。

## 一条端到端链路

```text
Game Entry
→ Platform PREPARE / Game Package
→ Session composition
→ Main + RealmStateAuthority
→ RuntimeHosting / Runner
→ Subsystem business authority
→ RenderDomain
→ Renderer current replica
→ Web Projector / game-owned Web Components
```

输入方向相反，但必须经过 Renderer producer gate、current Data identity、Main InputTarget/Activation 和 Subsystem Interest。Content 通过 prepared readonly boundary 进入业务，不与 mutable Realm State 或 Render replica 混为一类 authority。

## 使用约定

- **当前接口/ABI：** [Contract index](../../15-contracts/README.md)；
- **当前 authority/topology：** [Architecture](../../10-architecture/system-overview.md)；
- **当前实现 owner：** 本目录与 package/app README；
- **开发/测试/requalification：** [30-development](../../30-development/README.md)；
- **为什么这么设计：** [ADR](../../decisions/README.md)；
- **历史 exact-subject evidence：** legacy qualification ledger / Git，不得冒充新 HEAD PASS。
