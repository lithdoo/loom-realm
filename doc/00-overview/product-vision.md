# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定；M10–M13 qualified，M14进入真实 game consumer阶段  
> 主要定义：产品目标、Game/Platform/Main 消费边界、跨平台原则、第一阶段验收方向  
> 最近复核：2026-09-09

本文是 LoomRealm 最高层产品事实源。

---

## 1. 产品目标

LoomRealm 是由只读 Game Entry 声明 platform-neutral logical Subsystem topology、matching Platform Launcher完成 executable PREPARE、Main管理 Session/Runtime/Frame/Data authority、Hostra/PWA等 Platform Composition完成物理承载的模块化游戏运行平台。

目标包括：

- 地图、菜单、对话、战斗等业务能力可以形成独立 reusable game libraries，而不是 LoomRealm core framework vocabulary；
- concrete game显式组合业务库、game-specific Subsystem 与 logical content；
- Business Definition source不依赖 Desktop/PWA/Transport/launch config；
- Main是唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority application authority；
- Platform负责 executable/Process/Worker/Socket/Port/Window/Content physical topology，不获得 application authority；
- Hostra/PWA 对相同 logical Game/scenario得到等价 application outcome。

---

## 2. Framework / game / platform separation

```text
LoomRealm framework
    packages/*
        ↓ public author contracts
Reusable game libraries
    game-libs/*
        ↓
Concrete games
    examples/* / product game source
        ↓
Platform hosts
    apps/*
```

`tools/*` 只参与开发、导入、兼容性准备，不进入 runtime game dependency graph。

核心边界：

```text
framework capability != game business library
concrete game != platform host
preparation tooling != runtime dependency
```

---

## 3. Game Entry / Game Package

Game Entry只声明 logical Subsystem identity与initial input，不声明 module/path/transport/platform binding。`@loomrealm/game-package`只做 common document validation，不成为 Runtime role。

Business Subsystem key由具体 game拥有；LoomRealm不为 map等业务预留 `loom.*` key prefix。

---

## 4. Platform Launcher PREPARE

Matching Launcher负责 Game Entry + current Platform manifest join、executable/security/hosting preflight，并在任何 business Runtime side effect前冻结 PlatformLaunchPlan与 LogicalGameBootstrap。

Game library/example package placement不进入 Main bootstrap model。

---

## 5. Main / Runtime / Frame authority

Main管理 Session、Runtime public lifecycle、Frame/Stack/Activation、InputTarget、DataAuthority与 failure unwind。Platform physical ownership、game-library business ownership都不能复制这些 authority。

---

## 6. Author SDK boundary

Business author与 reusable game libraries只使用 public capabilities：

```text
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

不得读取 raw game/launch config、module path/URL、Runner/bootstrap material或按 Process/Worker分叉 business semantics。

---

## 7. Renderer / Data / Input / Render / Presentation

Main发布 DataAuthority；Platform只提供 physical Data carrier。Input、Render、Content继续使用 M10–M12 frozen semantics。

M13 Web Presentation把 current Control/DataAuthority + current Render replica机械投影到 business-owned Web Components；DOM不是 application authority source。

Reusable game library可以拥有自己的 RenderNode/business WC vocabulary，但这些 vocabulary不进入 LoomRealm core contracts。

---

## 8. Content / execution boundary

Readonly Content与 executable capability分离。Business只观察 logical record/resource identity；path/URL/bearer/FSDB保持 Platform-private。

Presentation bootstrap JS/CSS使用独立 Window-level Config；runtime WC resource使用 narrow PresentationResourceClient。

---

## 9. M14 first real game consumer

M14不再实现 framework `@loomrealm/map`。它引入：

```text
game-libs/map
    @loomrealm-game/map
    reusable map business + map-owned browser presentation

examples/essentials-v21.1
    private concrete game
    first real integrated consumer
```

Pokémon Essentials/RPG Maker compatibility只存在于 preparation/example boundary：

```text
external/local source
→ tools/fixtures/essentials-v21.1 importer
→ local canonical/prepared data
→ example compatibility preparation
→ map normalized game content
```

Map library本身不理解 PBS/Marshal/RMXP/Essentials。

---

## 10. Cross-platform equivalence

Hostra/PWA必须共享 same logical Game topology、formal Runtime/Data/Input/Render/Content/Web Presentation semantics、same game-library business rules与 business-observable outcome；physical Process/Worker/transport/storage/browser binding可不同。

M15/M17应运行同一 concrete M14 scenario，而不是平台各自维护一份游戏业务实现。

---

## 11. 第一阶段目标

```text
Game source
→ matching Launcher PREPARE
→ Runtime/Frame
→ Content
→ Input
→ Render
→ Web Presentation
→ reusable game library
→ concrete real game
→ Desktop full E2E
→ PWA Runtime/full E2E
```

M14先证明 framework之外的 reusable game library + concrete game可以自然消费 M10–M13；M15/M17再验证真实平台物理组合和等价 outcome。

---

## 12. 长期设计原则

1. 每份 authoritative state只有一个 owner；
2. framework、game library、concrete game、platform host、tooling保持 ownership分离；
3. Game Entry logical topology与 Platform executable binding分离；
4. full PREPARE before Runtime side effects；
5. Business/game-library source只依赖 public author capabilities；
6. Platform physical ownership不是 application authority；
7. protocol/package/process/platform/game-library boundary互不等价；
8. 没有真实 consumer obligation时不制造 universal registry/framework；
9. 第三方 compatibility source通过 preparation boundary进入，不污染通用 runtime library。

---

## 13. 当前非目标

```text
Save System
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
multiple Runtime instances per key
remote Runtime / multiple Renderer
universal cross-platform launcher schema
GameLibrary registry/base framework
framework-owned map/menu/dialogue/battle vocabulary
```

---

## 14. 当前实施主线

```text
M1–M9 Foundation / Game / Runtime / Hostra / Data   ✅
M10 User Input                                      ✅ Closed
M11 Render Replication                              ✅ Closed
M12 Content                                         ✅ Closed
M13 Web Presentation                                ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game              pending
M15 Desktop full E2E                                 pending
M16 PWA Runtime                                      pending
M17 PWA full E2E / equivalence                       pending
```

当前 executable closure是 `npm run test:m13`。下一步按 M14/01–05 建立 `game-libs/map` 与 `examples/essentials-v21.1` 的真实 consumer vertical。
