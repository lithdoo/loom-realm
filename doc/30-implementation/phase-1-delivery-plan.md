# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M12/M13 **Implemented / Qualified / Closed**；M14 consumer shape revised
> 主要定义：M0..M17 实现顺序、current closure、Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation
→ Map Game Library + first concrete game
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope != Implementable Slice != Milestone Closure
Framework Package != Game Library != Concrete Game
```

不为未来猜测预建 fake v2、deprecated alias 或 generic framework。

---

## M1–M9：Foundation / Hostra / Data ✅

```text
M1 Foundation + Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime/Frame
M5 Main Core
M6 Hostra Runtime
M7 Renderer Control
M8 Renderer Data
M9 Desktop Data Broker
```

均已关闭对应主干。

---

## M10：User Input — Closed ✅

Canonical gate：

```text
npm run test:m10
```

M15/M17 physical DOM/Gamepad source必须复用 frozen M10 seam。

---

## M11：Render Replication — Closed ✅

关闭 Subsystem authoritative RenderDomain、Render Update v1、Renderer internal Store、one-shot identity、same-generation baseline rebuild、Event transient semantics与 Desktop/Hostra vertical。

```text
npm run test:m11
```

M13不重开 Render Update v1。

---

## M12：Content — Closed ✅

2026-09-08 已在 Node 20.20.2 / 24.20.0 通过：

```text
npm run test:m12
```

关闭 readonly FSDB/Content Service、Subsystem ContentClient、Renderer trusted/private ResourceClient 与真实 production vertical。M13/M14复用其 identity/version/credential boundary。

---

## M13：Web Presentation — Implemented / Qualified / Closed

Formal source：

```text
Web Presentation Config v1        Active / Normative / Frozen
Web Presentation API v1           Active / Normative / Frozen
ADR 0031                          Accepted / Frozen
Rendering System                  M13 Implemented / Qualified
```

Landing docs：

```text
M13_01_WEB_PRESENTATION_BOOTSTRAP.md
→ M13_02_RENDERER_PRESENTATION_SEAM.md
→ M13_03_WEB_PROJECTOR.md
→ M13_04_VERTICAL_INTEGRATION.md
→ M13_05_QUALIFICATION_CLOSURE.md
```

### Frozen implementation flow

```text
concrete Window composition
→ Config source
→ fail-closed validation
→ prepared M12 Content
→ exact MIME
    scripts = text/javascript essence
    styles  = text/css essence
→ ordered <link> / classic <script>
→ customElements registration
→ window.onload
→ start presentation

current Control Session/DataAuthority ─┐
                                      ├→ package-private reevaluation
current per-subsystem Store ──────────┘
                                               ↓
                                     per-subsystem eligibility
                                               ↓
                                       thin Web Projector
                                               ↓
                                document.body / business WC
```

### Frozen authority/currentness

```text
Control snapshot
→ only Session/subsystem/generation topology authority

Renderer Store
→ only per-subsystem Render replica authority

same-generation carrier loss
→ freeze only affected subsystem
→ partial rebaseline hidden
→ complete baseline reconcile once

DataAuthority removed
→ remove DOM without later Render commit

generation changed
→ retire old DOM immediately

fresh Session
→ fresh entire HTMLElement universe

Control transport loss only
→ preserve/freeze last presentation
```

### Frozen Projector/API

```text
identity = (Session, subsystemKey, generation, domainId, key)
same identity → same HTMLElement
move/reorder → move existing HTMLElement
body order = subsystemKey lexical → zIndex → domainId lexical → roots

new element:
construct → context → insertion/structure → attrs → data

existing element:
structure/reorder → attrs → data only when retained JSON value changed
```

PresentationResourceClient复用 M12 private ResourceClient。Window teardown取消在途 reads，teardown 后格式正确的 `resource()` reject `CONTENT_CANCELLED`。

### Frozen structural failure

所有本次需要新建的 tags 必须在首次 DOM mutation前 preflight：

```text
unknown tag
→ zero mutation for reconciliation
→ preserve last successful DOM exactly
→ no fallback / no late registration wait
→ no future managed DOM mutation in this Window
```

恢复只能 fresh Window。

### Explicit non-goals

M13不建立：

```text
@loomrealm/presentation
second Store/topology/currentness
public RenderNodeIdentity/PresentationState
AssetManager / decoder registry
dynamic loader / PluginManager
layout/layer/component framework
global service locator
DOM rollback framework
RenderEvent → WC ABI
```

### Qualification

M13/04–05 使用 real headless Chromium覆盖 bootstrap、Session/DataAuthority/generation transitions、per-subsystem reconnect、HTMLElement identity/order、unknown-tag zero-mutation、real M12 resource bytes、Window teardown 与 failure isolation。

Canonical gate：

```text
npm run test:m13
```

该命令已真实存在，并由 Node 20/24 CI + Chromium qualification持续强制；closure evidence见 [m13-qualification.md](./m13-qualification.md)。

实施期间除 demonstrated correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，**禁止设计性 reopen**。

---

## M14：Map Game Library + First Real Game — pending

M14不再实现 `packages/map` / `@loomrealm/map`。它第一次证明 framework consumer layering：

```text
packages/*
    LoomRealm framework
        ↓
game-libs/map
    @loomrealm-game/map
        ↓
examples/essentials-v21.1
    private concrete game
        ↓
observable playable map slice
```

Landing docs：

```text
M14_01_WORKSPACE_BOUNDARY.md
→ M14_02_MAP_GAME_LIBRARY.md
→ M14_03_ESSENTIALS_EXAMPLE.md
→ M14_04_REAL_GAME_VERTICAL.md
→ M14_05_QUALIFICATION_CLOSURE.md
```

### M14/01 — workspace boundary

Root workspace增加 `game-libs/*` 与 `examples/*`。Framework继续 `@loomrealm/*`；game libraries使用独立 `@loomrealm-game/*` namespace；examples private。复核现有 `--workspaces` scripts，避免 framework qualification隐式包含 concrete examples。

### M14/02 — map game library

`game-libs/map` runtime Definition只依赖 public `@loomrealm/subsystem`，真实使用 Frame/InputListener/RenderDomain/ContentClient；browser side拥有 map-owned Custom Elements并结构性消费 M13。

Map library拥有自己的 normalized map business/content schema，不理解 Essentials/RPG Maker/PBS/Marshal/tooling。

### M14/03 — Essentials concrete example

`examples/essentials-v21.1`负责 concrete Game Entry/game-specific keys/compatibility preparation。

```text
external/local source
→ tools/fixtures/essentials-v21.1 importer
→ ignored .local imported data
→ example-local compatibility preparation
→ map normalized Content
→ runtime example
```

第三方 corpus不提交，tooling不成为 runtime dependency。Canonical CI使用可分发 synthetic/author-owned fixture；exact v21.1 official/local corpus作为独立 local compatibility evidence。

### M14/04 — real consumer vertical

至少完成：

```text
load one map
→ map metadata/resource
→ player spawn
→ directional input
→ business movement
→ RenderDomain update
→ M13 map-owned WC
→ visible movement
```

只有真实 interaction自然需要时才增加 nested `frame.call/return`；不为覆盖率硬造第二个 reusable game library。

记录真实 map workload 的 projection cost；只有可测 frame pressure 才允许最小 reopen M13 scheduling mechanics。

### M14/05 — closure

Future canonical gate：

```text
npm run test:m14
```

该命令不存在/未通过前不得声明 M14 Closed。Gate至少包含 `test:m13`、game-lib tests、example preparation/vertical、real Chromium、dependency boundary与 `@loomrealm-game/map` pack qualification，并在 Node 20/24 CI执行。

M14 Closed只证明 first real game vertical，不代表完整 Pokémon Essentials gameplay或 Desktop/PWA full E2E。

---

## M15：Desktop Full E2E — pending

完成真实 Desktop composition：PREPARE、Main/Runner/Control/Data Broker、BrowserWindow、M13 presentation、M10 physical input、M14 concrete game + map library、reload/reconnect/shutdown。

不重新设计 Input/Render/Content/Web Presentation/game-library ownership semantics。

---

## M16：PWA Runtime — pending

只关闭 PWA PREPARE、Worker Runner、RuntimeHosting、Runtime Control MessagePort、Main↔Worker↔Subsystem lifecycle。

---

## M17：PWA Full E2E / Equivalence — pending

完成 Window Renderer Control、PWA Data broker、Input/Render、Content、M13 Config/API semantics、same concrete M14 game/business WC、reload/replacement/shutdown。

比较 logical semantics/outcome，不要求相同 PID/Worker、WebSocket/MessagePort、FSDB/OPFS 或 private physical binding。

---

## Current Status

```text
M1–M9                                      ✅
M10 User Input                             ✅ Closed
M11 Render Replication                     ✅ Closed
M12 Content                                ✅ Closed 2026-09-08
M13 Web Presentation                       ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game     pending
M15 Desktop full E2E                       pending
M16 PWA Runtime                            pending
M17 PWA full E2E/equivalence               pending
```

当前 canonical executable closure为 `npm run test:m13`。下一步按 M14/01–05 建立 first real game consumer；不重新打开 M13 已冻结边界。
