# LoomRealm

LoomRealm 是一个通过只读 Game Entry 声明 **platform-neutral logical Subsystem topology**、由 matching Platform Launcher 完成 common Game validation 与 current-platform executable PREPARE、由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA Platform Composition 实现物理承载的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` vertical validation。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档治理](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [Subsystem 模型](./doc/10-architecture/subsystem-model.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Runtime Control v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [Renderer Control v1](./doc/15-contracts/main-renderer-control-v1.md)
- [Renderer Data Profile v1](./doc/15-contracts/renderer-data-profile-v1.md)
- [User Input v1](./doc/15-contracts/user-input-v1.md)
- [User Input v1 Conformance — fixtureSetRevision 2](./doc/15-contracts/user-input-conformance-v1.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [ADR 0029：User Input mutation-gate State convergence correction](./doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)

### M10 implementation and qualification — Complete

- [M10 / 01 — Subsystem InputManager](./M10_01_SUBSYSTEM_INPUT_MANAGER.md)
- [M10 / 02 — Renderer Input Gate](./M10_02_RENDERER_INPUT_GATE.md)
- [M10 / 03 — Renderer Input Producers](./M10_03_RENDERER_INPUT_PRODUCERS.md)
- [M10 / 04 — User Input Vertical Integration](./M10_04_VERTICAL_INTEGRATION.md)
- [M10 / 05 — Qualification and Closure](./M10_05_QUALIFICATION_CLOSURE.md)

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
    Render authoritative state

Renderer
    read-only Main mirror
    current Data consumers
    canonical Producer facts / Input sender
    Render replica

Platform
    executable binding
    Runtime/Renderer hosting
    Control/Data physical provisioning
    Content binding
```

一个 authority 只允许一个 owner；Platform physical ownership不产生第二份 application authority。

---

## Current Data / Input Model

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data provisioning/loss != Runtime failure / Frame unwind。

Current User Input：

```text
protocolVersion = 1
fixtureSetRevision = 2

Effective
= current Data
× Main InputTarget(F,A)
× active F/A
× Interest[F]
× Producer(C)
```

ADR 0029 修正首次实现前 State convergence hole：commit-sensitive mutation gate 暂时关闭时，same-current-Activation `.state` retain latest但 suppress business delivery；explicit known-no-commit + same Activation reopen时先同步完成 current retained-State handler invocation，再让 recoverable `frame.call` rejection 对业务可见；Event仍不 replay。

没有增加 wire message、revision、ACK、cross-plane barrier或 Renderer 对 Subsystem mutation gate 的知识。

---

## M10 Qualified Author / Renderer Surface

Subsystem author：

```text
SubsystemScope.createInputListener
InputChannel → canonical payload typed mapping
channels/setChannels = Interest contribution
on/unsubscribe = callback registration only
setChannels keeps dormant registrations
unsubscribe + close idempotent
stable registration-order delivery
async handler Promise does not block Data reader
```

Handler只收到 canonical payload，不收到 wire envelope/activationId/Data identity。

Renderer construction：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
)
```

```text
one construction-time RendererInputSource object
0..1 active source subscription for current Control peer
Control replacement/terminal → invalidate + stop old subscription
same holder later Control → restart same source object with fresh facts
```

M10不新增 Platform Port、producer registry、Store/EventBus 或 generic Input framework。

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
M10 User Input                        ✅
M11 Render                            pending
M12 Content                           pending
M13 loom.map                          pending
M14 Desktop full E2E                  pending
M15 PWA Runtime                       pending
M16 PWA full E2E/equivalence          pending
```

M10 不实现 BrowserWindow/DOM physical composition；真实 Browser `RendererInputSource` 属于 M14，并必须复用 frozen M10 source API/lifetime。

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

`@loomrealm/subsystem` package implementation may internally/type-only use shared Wire/protocol packages；business Definition不得直接依赖它们。

Forbidden：

```text
protocol mechanics → role authority implementations
main → game-package / concrete launcher / renderer role
business → platform/protocol packages
InputManager/RenderManager → raw carrier reader
Hostra/PWA private retry/currentness protocol
```

---

## Cross-platform Equivalence

Hostra/PWA必须共享 logical semantics，而不是 physical identity：

```text
same logical Game topology/bootstrap semantics
same SubsystemDefinitionFactory ABI
same Runtime/Frame/Renderer Control/Data/Input/Render semantics
same business-observable result for same logical scenario
```

可不同：Platform Launch Manifest、artifact/path、PID/Worker、WebSocket/MessagePort、IPC/Port transfer、HTTP/SW internals。

完整 User Input/Data Profile Hostra/PWA transport-equivalence claim在 M16完成。

---

## 文档与测试

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```

Latest qualified implementation gate：**M10**。运行 `npm run test:m10` 可复验完整 M9 regression、M10 role semantics、SDK/source projection与真实 Desktop/Hostra vertical。
