# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 Qualified / Closed；M14 implementation complete / requalification pending
> 主要定义：current implementation fact-source、delivery route、qualification entry points  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

实施层只落地 current architecture/contracts；不反向创造 authority、lifecycle、recovery 或 framework abstraction。精确 milestone closure 由 `phase-1-delivery-plan.md` 与对应 qualification record 决定；M14 的 live evidence/status 只以 `m14-qualification.md` 为准。

---

## 1. Current Tracking Sources

- [第一阶段交付计划](./phase-1-delivery-plan.md) — M1–M17 顺序与 milestone closure；
- [独立分包与发布架构](./package-architecture.md) — package/publish/dependency boundary；
- [仓库与目录方案](./repository-layout.md) — current/planned physical code placement；
- [测试策略](./testing-strategy.md) — package/role/vertical/E2E evidence ownership；
- [M11 Render 最终闭环评审](./m11-final-closure-review.md)；
- [M12 Content qualification](./m12-qualification.md)；
- [M13 Web Presentation qualification](./m13-qualification.md)；
- [M14 Map Game qualification](./m14-qualification.md) — M14 formal status/evidence authority。

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

The root M14 documents freeze implemented design/behavior and closure criteria；they do not duplicate the current PASS/PENDING evidence ledger.

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
M14 Map Game Library + First Real Game        ⚠️ Implemented / requalification pending
```

Last formally closed milestone gate：

```text
npm run test:m13
```

Current M14 hosted requalification gate：

```text
npm run test:m14
```

M14 scripts/workspaces and the hardened business vertical are implemented. Exact-local evidence for the current qualification subject is recorded PASS；hosted Node 20/24 evidence is still pending in `m14-qualification.md`.

---

## 3. Current Phase Route

```text
M1–M13                                  ✅ Closed
↓
M14 Map Game Library + First Real Game     Requalification pending
↓
M15 Desktop Full E2E                       Pending
↓
M16 PWA Runtime                            Pending
↓
M17 PWA Full E2E / Equivalence             Pending
```

M14 architecture/implementation is frozen, so M15 planning may rely on those boundaries. Formal phase progression must not rewrite M14 as `Closed` until the current qualification subject has same-subject hosted Node 20/24 evidence.

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

Both evidence paths target one qualification subject. The exact subject SHA and current evidence live only in `m14-qualification.md`；a later docs-only evidence-recording commit does not itself create a new subject.

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

Current formally closed evidence：

```text
m8-qualification.md
m9-qualification.md
m10-qualification.md
m11-qualification.md
m12-qualification.md
m13-qualification.md
```

Current M14 qualification ledger：

```text
doc/30-implementation/m14-qualification.md
```

It records the qualification subject, exact-local evidence, historical evidence, current hosted Node 20/24 status and the formal closure decision. Do not mirror its live status in design docs.

When the missing hosted evidence is available, update the ledger first；only then synchronize milestone summaries to `Closed`. Evidence-recording documentation commits do not change the qualified subject unless they also alter executable behavior or qualification inputs.

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

M14 implementation should remain concrete and small；M15–M17 materialize only their own physical responsibilities。Formal M14 requalification is an evidence task, not a reason to reopen M10–M13 or add framework machinery unless a hosted failure proves a concrete missing behavior.
