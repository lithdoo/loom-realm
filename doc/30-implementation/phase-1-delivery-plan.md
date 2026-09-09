# Phase 1 Delivery Plan

> 层级：实施计划  
> 状态：Active / Tracking  
> 当前 closure：M13 Web Presentation **Implemented / Qualified / Closed**；M14 pending  
> 最近复核：2026-09-09

Phase 1 继续按真实 boundary closure推进。Milestone不是 package 对称，也不是每次增加一个“框架模块”。

---

## M10–M13 Closed Baseline

```text
M10 User Input                              ✅ Closed
M11 Render Replication                      ✅ Closed
M12 Content                                 ✅ Closed
M13 Web Presentation                        ✅ Closed 2026-09-09
```

当前 executable closure gate：

```text
npm run test:m13
```

M10–M13 作为 M14 的 frozen/closed consumer baseline；只有 real consumer 暴露 correctness/security contradiction、author capability缺口或可测性能失败时才 reopen。

---

## M14：Map Game Library + First Real Game — pending

M14 不创建 `packages/map` / `@loomrealm/map`。它第一次证明 framework consumer layering：

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
        ↓
@loomrealm/subsystem public author APIs
        ↓
Frame / Input / Content / Render / M13
        ↓
observable playable map slice
```

Repository taxonomy：

```text
packages/      framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games
apps/          platform hosts
tools/         development/import/compatibility tooling
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

M14 不设计独立 normalized map schema。第一版 map library 直接采用 Essentials v21.1 / RMXP map semantics：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
RPG::Event / Page / EventCommand
RGSS Table
Essentials MapMetadata / map connections when needed
```

Map library 可以理解这些业务语义，但不能依赖 Ruby Marshal、`.rxdata` decoder、Ruby object graph wrappers、`tools/fixtures` internals 或 platform storage。

### M14/03 — Essentials concrete example / preparation

`examples/essentials-v21.1`负责 concrete Game Entry、game-specific Subsystem keys、initial input/composition 与 presentation declaration；它不再拥有 Essentials→map normalized adapter。

真实数据链：

```text
external/local Essentials v21.1 source
→ tools/fixtures/essentials-v21.1 importer
→ Ruby/Marshal/RMXP decoding
→ RMXP/Essentials semantic records + raw resources
→ prepared Content/FSDB
→ examples/essentials-v21.1
→ @loomrealm-game/map
```

Importer materialization只去掉 source/serialization mechanics，不重新定义 map semantics。Runtime example/map library 不 import tool modules。

Canonical CI 使用 checked-in synthetic/author-owned RMXP-compatible semantic fixture；exact v21.1 official/local corpus作为独立 local compatibility evidence。两者必须汇入同一 Content/runtime/browser path。

### M14/04 — real consumer vertical

至少完成：

```text
load one RPG::Map + referenced RPG::Tileset
→ player spawn
→ directional input
→ business movement/collision
→ RenderDomain update
→ M13 map-owned WC
→ visible movement
```

至少一个真实可见资源（tileset 或 player sprite）必须完整走：

```text
Content semantic record
→ resource logical identity/version
→ Render data
→ map WC
→ PresentationResourceClient
→ browser bytes
```

Map browser JS/CSS 必须走：

```text
prepared Content
→ WebPresentationConfigV1
→ M13 bootstrap
→ customElements registration
```

不得通过 test-local direct import 绕过 M13 startup。

M14 full vertical使用 test-owned composition harness串联 existing production Main/Subsystem/Data/Renderer/Content + synthetic/existing RendererInputSource + real Chromium。该 harness不是新的 Host/Platform architecture；不得创建 MiniDesktopHost/MapHost/GameRuntimeHost。

只有真实 interaction自然需要时才增加 nested `frame.call/return`；不为覆盖率硬造第二个 reusable game library。

记录真实 map workload 的 projection cost；只有可测 frame pressure 才允许最小 reopen M13 scheduling mechanics。

### M14/05 — closure

Future canonical gate：

```text
npm run test:m14
```

该命令不存在/未通过前不得声明 M14 Closed。Gate至少包含：

```text
npm run test:m13
workspace/package boundary checks
RMXP/Essentials semantic materialization tests
@loomrealm-game/map tests
example/Content preparation qualification
real Chromium playable vertical
@loomrealm-game/map pack qualification
Node 20/24 CI
```

Boundary evidence至少证明：

```text
packages/* do not depend on game-libs/examples
game-libs/map runtime does not import renderer/main/platform/tools
runtime game does not import tools/fixtures
runtime does not consume RmxpObject/RubyString/$id/$ref/$typed wrappers
resource path/URL/token/bytes do not leak through Render business state
map browser startup uses prepared Content + WebPresentationConfigV1
```

M14 Closed只证明 first real RMXP/Essentials-compatible map vertical，不代表完整 Pokémon Essentials gameplay，也不建立 universal map schema。

---

## M15：Desktop Full E2E — pending

完成真实 Desktop composition：

```text
Hostra PREPARE
→ Main/Runner/Control/Data Broker
→ BrowserWindow
→ M13 presentation bootstrap/runtime
→ M10 physical input
→ examples/essentials-v21.1 + @loomrealm-game/map
→ reload/reconnect/shutdown
```

M15 用真实 Desktop physical composition替换 M14 qualification harness；不重新设计 Input/Render/Content/Web Presentation/game-library ownership或 RMXP map semantics。

---

## M16：PWA Runtime — pending

只关闭 PWA PREPARE、Worker Runner、RuntimeHosting、Runtime Control MessagePort、Main↔Worker↔Subsystem lifecycle。

---

## M17：PWA Full E2E / Equivalence — pending

完成 PWA Renderer/Data/Input/Render/Content/M13 + M14 concrete game，并与 Desktop 验证相同 logical game scenario/business-observable outcome。

PWA 不创建 platform-specific map/game library/presentation contract。

---

## Phase 1 Final Route

```text
M10 Input
→ M11 Render
→ M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

长期原则：

```text
Package Scope != Implementable Slice != Milestone Closure
```

真实 consumer first；没有 demonstrated consumer/correctness obligation 时不为 symmetry 创建 abstraction、package、protocol 或 compatibility layer。
