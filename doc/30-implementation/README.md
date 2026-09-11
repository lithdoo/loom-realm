# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 Qualified / Closed；M14 implementation complete / requalification pending；M15 **Implementation Frozen / Preimplementation Closed**  
> 主要定义：current implementation fact-source、delivery route、qualification entry points  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-09-11

实施层只落地 current architecture/contracts；不反向创造 authority、lifecycle、recovery 或 framework abstraction。精确 milestone closure由 `phase-1-delivery-plan.md` 与对应 qualification record决定。

Live evidence ownership：

```text
M14 → m14-qualification.md
M15 → m15-qualification.md
```

---

## 1. Current Tracking Sources

- [第一阶段交付计划](./phase-1-delivery-plan.md) — M1–M17 顺序与 milestone closure；
- [独立分包与发布架构](./package-architecture.md) — package/publish/dependency boundary；
- [仓库与目录方案](./repository-layout.md) — current/planned physical code placement；
- [测试策略](./testing-strategy.md) — package/role/vertical/E2E evidence ownership；
- [M14 Map Game qualification](./m14-qualification.md) — M14 formal status/evidence authority；
- [M15 Desktop qualification](./m15-qualification.md) — current Hostra-owned M15 evidence ledger；
- [ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md) + root [`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`](https://github.com/lithdoo/loom-realm/blob/main/M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md) — current M15 physical SSOT。

Historical direct-Electron M15 evidence可作为 migration/regression oracle，但不拥有 current closure claim。

---

## 2. Current Baseline

```text
M1  Foundation / Wire                         ✅
M2  Game Package                              ✅
M3  Runtime Control                           ✅
M4  Subsystem Runtime / Frame                 ✅
M5  Main authority                            ✅
M6  Hostra launch-profile Runtime             ✅ Qualified
M7  Renderer Control                          ✅ Qualified
M8  Data role integration                     ✅ Qualified
M9  Desktop Data Broker                       ✅ Qualified
M10 User Input                                ✅ Closed
M11 Render Replication                        ✅ Closed
M12 Content                                   ✅ Closed
M13 Web Presentation                          ✅ Closed
M14 Map Game Library + First Real Game        ⚠️ Implemented / requalification pending
M15 Hostra-owned Desktop Full E2E             🔒 Implementation Frozen / Preimplementation Closed
M16 PWA Runtime                               pending
M17 PWA Full E2E / Equivalence                pending
```

Last formally closed milestone gate remains：

```text
npm run test:m13
```

M14 implementation/consumer semantics are frozen；formal M14 status only follows `m14-qualification.md`。

---

## 3. Current Phase Route

```text
M1–M13                                      Closed
↓
M14 Map Game Library + First Real Game     Requalification pending
↓
M15 Hostra-owned Desktop Full E2E          Preimplementation Closed / implementation pending
↓
M16 PWA Runtime                            Pending
↓
M17 PWA Full E2E / Equivalence             Pending
```

M15 implementation may proceed while M14 hosted requalification is pending；formal M15 closure still requires M14 formally Closed。

---

## 4. M14 Boundary

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

M14 qualification uses test-owned physical composition + real Chromium。It does not own real Desktop Hostra shell、HOSTRA_SUBCMD lifecycle、Hostra Window、reload or shutdown；those belong to M15。

---

## 5. M15–M17 Boundary

### M15 — Hostra-owned Desktop Full E2E

```text
frozen Hostra shell
├─ Electron / BrowserWindow / JSON-RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ Hostra RPC adapter
├─ Main
├─ RuntimeHosting → Runner
├─ Desktop Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
└─ Data settlement loopback carrier
     ↓
Hostra-owned BrowserWindow
→ real DOM RendererInputSource
→ M13 presentation
→ same M14 game/map Runtime/WC
```

Frozen physical distinctions：

```text
reload
→ same Hostra Window
→ fresh Renderer identity

same-generation Data-only reconnect
→ same Renderer identity
→ fresh Data physical pair only

window/signal/RPC/fatal/startup failure
→ one idempotent termination funnel
```

Canonical M15 does not use LoomRealm-owned Electron app/BrowserWindow、LoomRealm preload、`MessageChannelMain` or ADR0033 run-as-node embedding。

### M16 — PWA Runtime

```text
PWA PREPARE
→ Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
```

No requirement to implement full PWA Renderer/Data/Content/Web presentation in M16。

### M17 — PWA Full E2E / Equivalence

```text
Window Renderer
→ PWA Data
→ PWA Content
→ physical Window input
→ M13 presentation
→ same M14 concrete game
→ Hostra/PWA logical-outcome equivalence
```

Physical transport/storage may differ；logical semantics and business-observable result must match。

---

## 6. Repository Ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      private concrete games
apps/          physical platform/product compositions
tools/         development/import/compatibility tooling
```

Primary dependency direction：

```text
examples → game-libs → public LoomRealm author APIs
```

There is no framework `packages/map` / `@loomrealm/map` and no new shared Hostra/Window/transport package for M15。

---

## 7. Qualification Records

Formally closed evidence stays in existing qualification records。Current open ledgers：

```text
doc/30-implementation/m14-qualification.md
    current M14 subject + exact-local/hosted evidence

doc/30-implementation/m15-qualification.md
    frozen Hostra baseline + implementation/closure evidence
```

Do not mirror live PASS/PENDING state into design docs。Evidence-recording docs-only commits do not create a new executable qualification subject。

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
HostraManager / HostraSession / HostraPlatformPort
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry / RecoveryManager
PWA abstraction solely for symmetry
```

M15 implementation must follow ADR0034 + current root SSOT directly。只有真实 correctness/security/platform contradiction允许 reopen frozen physical design。
