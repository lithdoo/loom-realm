# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 Implemented / Qualified / Closed；M14 Frozen for Implementation  
> 主要定义：current implementation fact-source、delivery route、qualification entry points  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

实施层只落地 current architecture/contracts；不反向创造 authority、lifecycle、recovery 或 framework abstraction。精确 milestone closure 由 `phase-1-delivery-plan.md`、对应 root Mxx landing 和 qualification record 共同定义。

---

## 1. Current Tracking Sources

- [第一阶段交付计划](./phase-1-delivery-plan.md) — M1–M17 顺序与 milestone closure；
- [独立分包与发布架构](./package-architecture.md) — package/publish/dependency boundary；
- [仓库与目录方案](./repository-layout.md) — current/planned physical code placement；
- [测试策略](./testing-strategy.md) — package/role/vertical/E2E evidence ownership；
- [M11 Render 最终闭环评审](./m11-final-closure-review.md)；
- [M12 Content qualification](./m12-qualification.md)；
- [M13 Web Presentation qualification](./m13-qualification.md)。

M14 current normative implementation set：

```text
ADR 0032
M14_01_WORKSPACE_BOUNDARY.md
M14_02_MAP_GAME_LIBRARY.md
M14_03_ESSENTIALS_EXAMPLE.md
M14_04_REAL_GAME_VERTICAL.md
M14_05_QUALIFICATION_CLOSURE.md
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

---

## 2. Current Implemented Baseline

```text
M1  Foundation / Wire                         ✅
M2  Game Package                              ✅
M3  Runtime Control                           ✅
M4  Subsystem Runtime / Frame                 ✅
M5  Main authority                            ✅
M6  Hostra Runtime                            ✅ Qualified 2026-09-03
M7  Renderer Control                          ✅ Qualified 2026-09-03
M8  Data role integration                     ✅ Qualified 2026-09-04
M9  Desktop Data Broker                       ✅ Qualified 2026-09-04
M10 User Input                                ✅ Qualified / Closed 2026-09-07
M11 Render Replication                        ✅ Qualified / Closed 2026-09-07
M12 Content                                   ✅ Qualified / Closed 2026-09-08
M13 Web Presentation                          ✅ Qualified / Closed 2026-09-09
```

Current canonical executable closure：

```text
npm run test:m13
```

M14 scripts/workspaces are intentionally absent until M14 implementation lands。

---

## 3. Current Phase Route

```text
M1–M13                                  ✅ Closed
↓
M14 Map Game Library + First Real Game     🔒 Frozen for Implementation / Pending
↓
M15 Desktop Full E2E                       Pending
↓
M16 PWA Runtime                            Pending
↓
M17 PWA Full E2E / Equivalence             Pending
```

This numbering is canonical。Older tracking text that called `loom.map` M13, Desktop E2E M14 or cross-platform equivalence M16 is superseded。

---

## 4. M14 Implementation Boundary

M14 proves a real independent business consumer of M10–M13：

```text
examples/essentials-v21.1
    ↓
game-libs/map
    @loomrealm-game/map
    ↓
@loomrealm/subsystem public author API
    ↓
Input + Render + Content + M13 Web Presentation
```

M14 source compatibility is selective：

```text
RMXP/Essentials source
→ existing importer/lossless representation
→ selective consumer projection
→ Map/{id} + Tileset/{id}
→ prepared Content
→ map Runtime
```

First slice does not materialize MapInfo/Event/Color/Tone/AudioFile graphs without a real consumer。

M14 qualification uses existing/synthetic `RendererInputSource` + real Chromium。It does not claim real Desktop Node child、BrowserWindow DOM input、reload/reconnect/shutdown；those belong to M15。

M14 target gates：

```text
npm run test:m14
npm run test:m14:essentials-local -- ...
```

The local gate is same-revision compatibility evidence and never commits third-party source bytes。

---

## 5. M15–M17 Boundary

### M15 Desktop Full E2E

```text
Hostra PREPARE
→ Main
→ real Node Runner child
→ Desktop Data/Content
→ Electron BrowserWindow
→ real DOM RendererInputSource
→ M13 presentation
→ same M14 game/map Runtime/WC
→ reload / reconnect / shutdown
```

### M16 PWA Runtime

```text
PWA PREPARE
→ Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
```

No requirement to implement full PWA Renderer/Data/Content/Web presentation in M16。

### M17 PWA Full E2E / Equivalence

```text
Window Renderer
→ PWA Data
→ PWA Content
→ physical Window input
→ M13 presentation
→ same M14 concrete game
→ Hostra/PWA logical-outcome equivalence
```

Physical transport/storage may differ；logical semantics and business-observable results must match。

---

## 6. Repository Ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      private concrete games
apps/          physical platform hosts/products
tools/         development/import/compatibility tooling
```

Primary dependency direction：

```text
examples → game-libs → public LoomRealm author APIs
```

There is no framework `packages/map` / `@loomrealm/map`。

---

## 7. Qualification Records

Current closed evidence：

```text
m8-qualification.md
m9-qualification.md
m10-qualification.md
m11-qualification.md
m12-qualification.md
m13-qualification.md
```

When M14 actually closes, create/update：

```text
doc/30-implementation/m14-qualification.md
```

It records the exact closure revision、Node 20/24 canonical result、local Essentials source fingerprint/selected slice and semantic/browser evidence required by M14/05。

---

## 8. Implementation Governance

Do not create without real evidence：

```text
AuthorityEventBus / ObserverHub
ConnectionRegistry / RuntimeDirectory
GenericTransaction / 2PC
retry/backoff framework
GameLibrary registry/base framework
MapNormalizedV1 / MapRepository / MapManager
ProjectionRegistry / ConsumerProjector<T>
AssetManager / ResourceProvider
SceneGraph / LayerManager
MiniDesktopHost / MapHost / GameRuntimeHost
PWA abstraction solely for symmetry
```

M14 implementation should remain concrete and small；M15–M17 materialize only their own physical responsibilities。
