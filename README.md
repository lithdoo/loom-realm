# LoomRealm

LoomRealm 是一个通过只读 Game Entry 声明 **platform-neutral logical Subsystem topology**、由 matching Platform Launcher 完成 common Game validation 与 current-platform executable PREPARE、由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA Platform Composition 实现物理承载的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` vertical validation。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档治理](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [Subsystem 模型](./doc/10-architecture/subsystem-model.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Runtime Control v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [Renderer Control v1](./doc/15-contracts/main-renderer-control-v1.md)
- [Renderer Data Profile v1](./doc/15-contracts/renderer-data-profile-v1.md)
- [User Input v1](./doc/15-contracts/user-input-v1.md)
- [User Input v1 Conformance — fixtureSetRevision 2](./doc/15-contracts/user-input-conformance-v1.md)
- [Render Update v1](./doc/15-contracts/render-update-v1.md)
- [Render Update v1 Conformance — fixtureSetRevision 1](./doc/15-contracts/render-update-conformance-v1.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)

### M10 implementation and qualification — Complete

- [M10 / 01 — Subsystem InputManager](./M10_01_SUBSYSTEM_INPUT_MANAGER.md)
- [M10 / 02 — Renderer Input Gate](./M10_02_RENDERER_INPUT_GATE.md)
- [M10 / 03 — Renderer Input Producers](./M10_03_RENDERER_INPUT_PRODUCERS.md)
- [M10 / 04 — User Input Vertical Integration](./M10_04_VERTICAL_INTEGRATION.md)
- [M10 / 05 — Qualification and Closure](./M10_05_QUALIFICATION_CLOSURE.md)
- [M10 qualification record](./doc/30-implementation/m10-qualification.md)

### M11 implementation plan — Frozen / Directly Implementable

- [M11 / 01 — Subsystem RenderManager](./M11_01_SUBSYSTEM_RENDER_MANAGER.md)
- [M11 / 02 — Render Publication](./M11_02_RENDER_PUBLICATION.md)
- [M11 / 03 — Renderer Render Store](./M11_03_RENDERER_STORE.md)
- [M11 / 04 — Render Vertical Integration](./M11_04_VERTICAL_INTEGRATION.md)
- [M11 / 05 — Qualification and Closure](./M11_05_QUALIFICATION_CLOSURE.md)

历史 M7/M8/M9 root plans继续保留作为已完成 milestone implementation provenance。

---

## Bootstrap Boundary

```text
Game installation/source
→ concrete Platform.prepareGame(source)
→ matching Launcher
→ @loomrealm/game-package validation
→ current Platform Launch Manifest join/preflight
→ immutable PlatformLaunchPlan
→ Platform-private plan install
→ LogicalGameBootstrap
→ runMain({bootstrap, platform, policy})
→ RuntimeHosting.launch
→ Host-owned Runner
→ platform-selected Definition Module
→ @loomrealm/subsystem/host
```

固定：

```text
Game Entry document != Main bootstrap model
Game topology != Platform executable binding
Main ✗ game-package / concrete launcher
Business ✗ Game Package / Launcher / protocol packages
```

---

## Authority / Role Boundary

```text
Main
    Session / Runtime / Frame / Stack / Activation / InputTarget / DataAuthority

Subsystem
    business state
    local Frame Context / mutation gate
    Desired Input Interest + retained author State
    business Render Domain authority

Renderer
    read-only Main mirror
    current Data consumers
    Input sender
    current Render replica

Platform
    executable binding
    Runtime/Renderer hosting
    Control/Data physical provisioning
    Content binding
```

一个 authority 只允许一个 owner；Platform physical ownership不产生第二份 application authority。

---

## Current Data / Input / Render Model

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data provisioning/loss != Runtime failure / Frame unwind。

User Input：

```text
protocolVersion = 1
fixtureSetRevision = 2
Effective = Data × Main InputTarget × active F/A × Interest × Producer
```

M10 已 Implemented / Qualified / Closed。

Render：

```text
protocolVersion = 1
fixtureSetRevision = 1
business Domain authority = Subsystem
wire Domain lifetime = Session × subsystemKey × generation × domainId
carrier lifetime = independent publication baseline
```

---

## M11 Frozen Author / Publication / Renderer Boundary

Subsystem root只新增：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

Exact author seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

固定：

```text
all author operations synchronous local-only
validate → detach → atomic local commit
successful values always Frozen-v1 representable
live Domains <= 256
SDK domainId never reused within Runtime instance
business Node key one-shot within business RenderDomain lifetime
Frame/Data do not own business Domain lifetime
```

Publication：

```text
fresh carrier → render.domains → fresh Snapshot each current Domain
same-generation reconnect keeps emitted identity history, resets carrier baseline
Event never replays across carrier
```

Renderer M11 Store挂在 existing Data slot，internal-only；M11 不新增 public Renderer Render/subscription API。

M11 qualification只 claim：

```text
subsystem-sender
renderer-receiver
```

包含 Hostra/PWA trace equivalence 的 `transport` role 留到 M16。

---

## 当前实现状态

```text
M1 Foundation + Wire                  ✅
M2 Game Package                       ✅
M3 Runtime Control                    ✅
M4 Subsystem Runtime/Frame            ✅
M5 Main Core                          ✅
M6 Hostra Runtime vertical            ✅
M7 Renderer Control                   ✅
M8 Renderer Data role/core            ✅
M9 Desktop Data Broker                ✅
M10 User Input                        ✅ Qualified / Closed
M11 Render                            Implementation Frozen / Ready
M12 Content                           pending
M13 loom.map                          pending
M14 Desktop full E2E                  pending
M15 PWA Runtime                       pending
M16 PWA full E2E/equivalence          pending
```

M11 现在进入 implementation-only phase：private layout/data structure、finite queue capacity、domainId private representation、Patch-vs-Snapshot heuristic可以选择；authority、public API、identity/lifetime、error/publication/receiver semantics与 qualification shape不得重新设计，除非证明 Frozen docs存在 correctness contradiction。

---

## Dependency Rules

```text
@loomrealm/foundation → platform-ports / protocol mechanics
@loomrealm/wire       → runtime-control / renderer-control / data / game-package
@loomrealm/main       → platform-ports + runtime-control + renderer-control + wire
@loomrealm/renderer   → renderer-control + platform-ports + data
@loomrealm/subsystem/host → platform-ports + runtime-control + data
Business Definition  → @loomrealm/subsystem only
@loomrealm/map        → @loomrealm/subsystem
```

`@loomrealm/subsystem` implementation可 internally/type-only复用 shared protocol declarations；business Definition不得直接依赖它们。

Forbidden：

```text
protocol mechanics → role authority implementations
main → game-package / concrete launcher / renderer role
business → platform/protocol packages
InputManager/RenderManager → raw carrier reader
public generic Store/EventBus/service locator
Hostra/PWA private retry/currentness protocol
```

---

## Cross-platform Equivalence

Hostra/PWA共享 logical semantics，而不是 physical identity。完整 User Input / Render Update transport-equivalence claim在 M16完成。

---

## 文档与测试

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```

Latest qualified implementation gate仍是 **M10**：`npm run test:m10`。

M11 实施完成后的唯一 closure gate已冻结为：

```bash
npm run test:m11
```

其语义见 [M11 / 05](./M11_05_QUALIFICATION_CLOSURE.md)。
