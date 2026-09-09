# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content / M13 Web Presentation **Implemented + Qualified**；M15 Full E2E Planned
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

Hostra 只拥有 physical topology/composition；Main 保留 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority，Subsystem/game library保留 business Render authority。

---

## 1. Milestone Shape

```text
M6  Hostra PREPARE / Runner / Runtime Control         ✅
M9  Desktop Data Broker / child provisioning         ✅
M10 User Input                                       ✅
M11 Render Replication                               ✅
M12 Desktop Content                                  ✅
M13 Web Presentation                                 ✅ Qualified 2026-09-09
M14 Map Game Library + concrete example              pending
M15 BrowserWindow/full Desktop E2E                   pending
```

M15 只完成真实 Desktop physical composition，不重新设计 M9–M14 logical/business ownership semantics。

---

## 2. Runtime PREPARE / Presentation Input

Hostra Runtime PREPARE 继续：

```text
HostraPlatform.prepareGame
→ game-launcher-hostra
→ Game Entry + launch.hostra.json validation/join
→ executable/security preflight
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Web presentation 是独立 product startup input；Config acquisition mechanics 属于 Desktop private composition：

```text
installation / app-owned source
→ read / parse candidate JSON
→ WebPresentationConfigV1
```

filesystem path 只是一种 Desktop acquisition mechanism，不是 Config 字段或跨平台 ABI。Presentation Config 不进入 Game Entry、Hostra manifest、Runtime executable join 或 Main bootstrap。

---

## 3. Existing Physical Slices

### Data

Data Broker 负责 paired current Renderer/Runner carrier；Data ticket/provisioning IPC 不能作为 Content 或 JS/CSS loader channel。

### Content

```text
successful Hostra PREPARE
→ readonly prepared Content view/service
→ Subsystem ContentClient
→ Renderer trusted/private ResourceClient
```

Desktop 不新增独立 Content authority，也不向 business WC 暴露 path/token/origin/private Renderer client。

---

## 4. M13 Browser Bootstrap

精确规则由 [Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md) 拥有：

```text
Desktop-private Config acquisition
→ current prepared Content refs
→ private browser binding
→ ordered business JS/CSS
→ window.onload
→ start presentation
```

Desktop 负责 concrete BrowserWindow/Window composition 与 private resource binding；不得建立平台专属 component loader/registry。

---

## 5. M13 Projector Integration

Desktop 不定义 presentation authority，只连接现有 Renderer facts：

```text
committed/fresh current Control Session/DataAuthority topology ─┐
                                                               ├→ package-private reevaluation
successful current per-subsystem Store commit ─────────────────┘
                                                                        ↓
                                                              per-subsystem eligibility
                                                                        ↓
                                                                  Web Projector
```

精确 identity/currentness/reconnect/body-order semantics 由 [渲染系统](../../10-architecture/rendering-system.md) 与 [Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md) 拥有。

Desktop 特别不得把 same-generation Data carrier loss解释为 DataAuthority removal；受影响 subsystem 的 projection freeze 与健康 subsystem 的继续更新必须遵守 frozen M13 semantics。

Actual layout/stacking 由 business WC/CSS 负责；Desktop 不建立 per-Domain layer/framework。

---

## 6. M14 Game Consumer Placement

M14 business不进入 Desktop app source：

```text
game-libs/map
    reusable @loomrealm-game/map

examples/essentials-v21.1
    concrete private game

apps/desktop
    physical Hostra host
```

Essentials importer只在 development/preparation阶段产生 ignored local game material。Desktop runtime通过正常 Launcher/Content路径运行 concrete game，不直接调用 tooling或读取 source corpus path。

---

## 7. Web Presentation API Integration

Business WC 只消费 formal Web Presentation API 的 structural ABI：context/data + narrow PresentationResourceClient。Desktop/Renderer 不提供 Store/Data carrier/Main authority shortcut，也不为 TypeScript symmetry新增 mandatory presentation SDK/package。

Config bootstrap resource binding 与 runtime PresentationResourceClient 是不同 capability boundary。

---

## 8. Failure / Lifetime

Bootstrap failure 阻止 presentation start。Runtime presentation failure 保持 Window-local，不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

Window teardown/resource lifetime、unknown-tag structural failure、receiver ordering 等精确规则直接引用 frozen formal API；Desktop 不维护平台专属 recovery state machine。

---

## 9. Qualification Placement

M13 real Chromium 关闭 browser-observable Web semantics，但不 claim Electron full E2E。M14关闭 reusable map game library + concrete game vertical。

M15 再覆盖：

```text
BrowserWindow
Renderer Control
Data Broker
physical input
M14 concrete game + map library
reconnect / reload / shutdown
full Desktop business trace
```

M15 必须复用 M10–M14 frozen/closed boundaries，不重新设计它们。

---

## 10. Final Invariants

1. Hostra Launcher 只拥有 Runtime executable PREPARE；presentation startup 独立；
2. Main 不接收 plan/path/token/presentation config；
3. Config acquisition 属于 Desktop private composition，不属于 Config v1；
4. Data provisioning、Content credential、presentation bootstrap 不混成万能 channel；
5. Desktop 复用 M13 frozen Control-topology + Store reevaluation semantics，不新增平台 variant；
6. Business WC 只读 LoomRealm projection并只通过 narrow resource capability读取 runtime resource；
7. reusable game library/concrete game 不被吸收到 `apps/desktop`；
8. Desktop 不建立 component registry、AssetManager、dynamic loader、global layer manager或 second projection authority。
