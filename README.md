# LoomRealm

LoomRealm 是一个以 **platform-neutral logical Subsystem topology**、Main authority、capability-oriented role boundaries 与 cross-platform composition 为核心的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 compatibility corpus 验证真实 game consumer；M14 不再把 map 视为 framework package，而是通过 `game-libs/map` + `examples/essentials-v21.1` 验证 framework / game library / concrete game 分层。

---

## Repository ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries (M14+)
examples/      concrete games (M14+)
apps/          Desktop/PWA product/platform compositions
tools/         development/import/compatibility tooling
```

主依赖方向：

```text
examples → game-libs → public LoomRealm author APIs
```

Framework 不反向拥有 map/menu/dialogue/battle 等业务 vocabulary。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [平台组合系统](./doc/10-architecture/platform-composition-system.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Web Presentation Config v1](./doc/15-contracts/web-presentation-config-v1.md)
- [Web Presentation API v1](./doc/15-contracts/web-presentation-api-v1.md)
- [ADR 0031：M13 Web Presentation Frozen Design](./doc/decisions/0031-business-owned-web-component-projection.md)
- [ADR 0032：Game Library / Example Boundary](./doc/decisions/0032-game-library-example-boundary.md)
- [ADR 0034：Hostra owns Desktop Electron composition](./doc/decisions/0034-hostra-owned-desktop-composition.md)
- [ADR 0033：historical direct-Electron Runner compatibility](./doc/decisions/0033-electron-hostra-run-as-node.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [Testing Strategy](./doc/30-implementation/testing-strategy.md)
- [M14 qualification record](./doc/30-implementation/m14-qualification.md)
- [M15 Hostra Desktop Recomposition Plan — frozen physical SSOT](./M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)
- [M15 qualification record](./doc/30-implementation/m15-qualification.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)
- [Desktop Host module design](./doc/20-modules/desktop-host/README.md)
- [Map Game Library design](./doc/20-modules/loom-map/README.md)

---

## 当前状态

```text
M10 User Input                              ✅ Closed
M11 Render Replication                      ✅ Closed
M12 Content                                 ✅ Closed 2026-09-08
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      ✅ Closed
M15 Desktop full E2E                        ✅ Closed
M16 PWA Runtime                             pending
M17 PWA full E2E                            pending
```

M14/M15 formal evidence lives in [`m14-qualification.md`](./doc/30-implementation/m14-qualification.md) and [`m15-qualification.md`](./doc/30-implementation/m15-qualification.md)。

M15 的 Main/Data/Renderer/Input/Presentation/game logical intent保持冻结；此前 standalone Electron implementation作为历史/迁移证据保留。Canonical physical host已经由 ADR 0034纠正为：

```text
Hostra shell
    Electron / BrowserWindow / RPC owner
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop plain Node process
        ↓ RuntimeHosting
Runner
```

M15 frozen Hostra baseline：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
shutdown grace 1000 ms
```

当前 M15 physical SSOT 是 [`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`](./M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)。ADR 0033只保留 historical direct-Electron compatibility relevance。

M15 is Closed on the frozen Hostra subject. Only a real Hostra baseline or frozen LoomRealm contract contradiction may reopen the physical design。

Last formally closed milestone gate：

```text
npm run test:m15
```

---

## Authority Boundary

```text
Main
    Session / Runtime / Frame / Activation
    InputTarget / DataAuthority

Subsystem
    business state / Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main mirror
    per-subsystem Data consumers / current Render replicas
    trusted/private ResourceClient
    physical Web projection mutation

Business Web Component
    read-only projection consumer
    Shadow DOM / Canvas / WebGL / private presentation owner

Hostra shell
    Electron / BrowserWindow / direct HOSTRA_SUBCMD process

Platform / apps/*
    LoomRealm Control/Data/Content physical composition
    external-host adapters
```

一个 authority只允许一个 owner；DOM/Platform/Host physical ownership不产生第二份 application authority。

---

## M13 Web Presentation — Implemented / Qualified / Closed

M13 已完成生产实现与真实 Chromium qualification：

```text
Window bootstrap
→ current Control Session/DataAuthority + Renderer Store
→ package-private reevaluation
→ thin Web Projector
→ business-owned Custom Elements
```

Formal source：

```text
Web Presentation Config v1   Active / Normative / Frozen
Web Presentation API v1      Active / Normative / Frozen
ADR 0031                     Accepted / Frozen decision provenance
```

M13 closure gate remains：

```text
npm run test:m13
```

M13不建立 second Store/topology、public PresentationState、component registry/loader、AssetManager、layout/layer framework、global service locator或 mandatory presentation SDK/package。

---

## M14 revised direction

M14 implementation does not create `packages/map` / `@loomrealm/map`：

```text
examples/essentials-v21.1
    ↓
game-libs/map
    @loomrealm-game/map
        ↓
@loomrealm/subsystem public author APIs
        ↓
M10 Input + M11 Render + M12 Content + M13 Presentation
```

M14只 materialize first-slice实际消费的 RMXP/Essentials facts 到 prepared FSDB records/resources。`@loomrealm-game/map` 只通过 M12 ContentClient消费普通 JsonValue和 resources，不依赖 Ruby Marshal/importer/tooling runtime representation。

M14 qualification使用 test-owned physical harness + real Chromium；真实 Hostra shell/BrowserWindow/DOM physical input/reload/shutdown属于 M15。

---

## M15 Desktop full E2E — Closed

Canonical topology：

```text
frozen Hostra shell
├─ Electron app
├─ Hostra preload/RPC
├─ BrowserWindow owner
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ concrete Hostra RPC adapter
├─ Main / RuntimeHosting / Runner
├─ Desktop Data Broker
├─ Desktop Content + trusted shell
├─ Renderer Control loopback carrier
└─ Data settlement loopback carrier
     ↓
Hostra-owned BrowserWindow
→ trusted Renderer
→ real DOM input
→ existing M13 presentation
→ same M14 game
```

Frozen current boundaries：

```text
Hostra shell = sole Electron/BrowserWindow owner
Hostra RPC = host-control only
Control / Data settlement / Data application / Content remain separated
M9 Broker = sole Data candidate/current owner
trusted shell bootstrap = top-level-navigation-only
Main acquire + document navigation = bounded 0..1 rendezvous
reload = same Hostra Window + fresh Renderer logical participant
Data-only reconnect = same Renderer identity + fresh Data physical pair
window/signal/RPC/fatal/startup failure = one idempotent termination funnel
Runner convergence remains existing Main/RuntimeHosting owner chain
```

Implementation不得为此引入 HostraManager、HostraSession、Window/Document manager、TransportRegistry、ConnectionManager、RecoveryManager或 generic WebSocket framework。

Historical `M15_01`–`M15_05`仅保留 recomposition plan明确列出的 logical/input intent；发生 physical conflict时以 ADR 0034 + current plan 为准。

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
