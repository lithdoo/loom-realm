# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M12/M13 **Implemented / Qualified / Closed**；M14 consumer shape revised
> 主要定义：M0..M17 实现顺序、current closure、game library/example 与 Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
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
→ reusable Map Game Library + concrete game example
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

M1 Foundation + Wire、M2 Game Package、M3 Runtime Control、M4 Subsystem Runtime/Frame、M5 Main Core、M6 Hostra Runtime、M7 Renderer Control、M8 Renderer Data、M9 Desktop Data Broker均已关闭对应主干。

---

## M10：User Input — Closed ✅

Canonical gate：`npm run test:m10`。M15/M17 physical DOM/Gamepad source必须复用 frozen M10 seam。

---

## M11：Render Replication — Closed ✅

关闭 Subsystem authoritative RenderDomain、Render Update v1、Renderer Store、one-shot identity、same-generation baseline rebuild与 Event transient semantics。

Canonical gate：`npm run test:m11`。

---

## M12：Content — Closed ✅

Canonical gate：`npm run test:m12`。

关闭 readonly FSDB/Content Service、Subsystem ContentClient、Renderer trusted/private ResourceClient 与 production vertical。M13/M14复用其 logical identity/version/credential boundary。

---

## M13：Web Presentation — Implemented / Qualified / Closed ✅

Formal source：Web Presentation Config v1 / API v1 Frozen；ADR 0031 Accepted/Frozen。

Canonical gate：

```text
npm run test:m13
```

M13 已关闭 Config/bootstrap、Control+Store reevaluation、per-subsystem currentness、thin Projector、business-owned WC ABI/resource lifetime与 real Chromium evidence。

M14 直接消费，不重新设计 M13。

---

## M14：Map Game Library + First Real Game — pending

M14 不再实现 `packages/map` / `@loomrealm/map`。目标是第一次同时证明 framework consumer layering：

```text
packages/*          LoomRealm framework
        ↓
game-libs/map       @loomrealm-game/map
        ↓
examples/essentials-v21.1
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

### M14/01 — repository/workspace boundary

增加 `game-libs/*` 与 `examples/*` workspace category，保持 framework `packages/*`、platform `apps/*`、tooling `tools/*` ownership清晰。`@loomrealm/*` 只表示 framework/runtime；game libs使用独立 `@loomrealm-game/*` namespace。

### M14/02 — map game library

`game-libs/map` runtime Definition只依赖 public `@loomrealm/subsystem`，真实使用：

```text
Frame
InputListener
RenderDomain
ContentClient
```

同一 game library可以拥有隔离的 browser presentation side，消费 frozen M13 structural ABI。Map library拥有 normalized map schema，不理解 Essentials/RMXP/PBS/Marshal。

### M14/03 — concrete Essentials example

建立 private `examples/essentials-v21.1`。开发时复用现有 `tools/fixtures/essentials-v21.1` importer，但仅作为 preparation：

```text
external/local source
→ importer
→ .local imported data
→ example-local compatibility preparation
→ map normalized Content
→ runtime example
```

第三方 corpus不提交，不成为 runtime dependency。

Canonical CI 使用可分发 synthetic/author-owned minimal fixture；exact v21.1 official/local corpus 作为独立 local compatibility evidence。

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

如果真实 interaction自然需要 nested `frame.call/return`，可以加入；不为 protocol coverage 硬造第二个 reusable game library。

记录真实 map workload 的 projection cost；只有可测 frame pressure 才允许 reopen M13 scheduling mechanics。

### M14/05 — closure

Future canonical gate：

```text
npm run test:m14
```

该命令不存在/未通过前不得声明 M14 Closed。Gate必须包含 `test:m13`、game-lib tests、example preparation/vertical、real Chromium、dependency boundary与 `@loomrealm-game/map` pack qualification，并在 Node 20/24 CI执行。

M14 Closed只证明 first real game vertical，不代表完整 Pokémon Essentials gameplay或 Desktop/PWA full E2E。

---

## M15：Desktop Full E2E — pending

完成真实 Desktop composition：PREPARE、Main/Runner/Control/Data Broker、BrowserWindow、M13 presentation、M10 physical input、M14 concrete game、reload/reconnect/shutdown。

不重新设计 Input/Render/Content/Web Presentation/game-library ownership semantics。

---

## M16：PWA Runtime — pending

只关闭 PWA PREPARE、Worker Runner、RuntimeHosting、Runtime Control MessagePort、Main↔Worker↔Subsystem lifecycle。

---

## M17：PWA Full E2E / Equivalence — pending

完成 Window Renderer Control、PWA Data broker、Input/Render、Content、M13 Config/API、same concrete game/business WC、reload/replacement/shutdown，并比较 logical outcome。

---

## Current Status

```text
M1–M9                                      ✅
M10 User Input                             ✅ Closed
M11 Render Replication                     ✅ Closed
M12 Content                                ✅ Closed
M13 Web Presentation                       ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game     pending
M15 Desktop full E2E                       pending
M16 PWA Runtime                            pending
M17 PWA full E2E/equivalence               pending
```

当前 canonical executable closure为 `npm run test:m13`。下一步按 M14/01–05 实现 repository/game consumer vertical。
