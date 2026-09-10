# 测试策略

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 closed；M14 implementation complete / requalification pending；M15 preimplementation frozen  
> 主要定义：package/role/protocol/vertical ownership，以及 M14–M17 E2E qualification 分工  
> 依赖：[正式契约目录](../15-contracts/README.md)、[Phase 1 交付计划](./phase-1-delivery-plan.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)  
> 最近复核：2026-09-11

测试目标不是“消息能通”，而是证明每层不能绕过 authority、lifecycle、failure-domain、public author API、PREPARE、package boundary 和 currentness。

M14 formal status只以 [`m14-qualification.md`](./m14-qualification.md) 为准；当前仍是 implementation complete / requalification pending。M15可以直接实施，但 formal closure不得先于 M14 formal closure。

---

## 1. Evidence Ownership

```text
Foundation / Wire
    generic carrier + bounded JSON mechanics

protocol packages
    wire/profile validation + protocol conformance

Main / Renderer / Subsystem
    role authority + lifecycle + author-facing semantics

Platform / Launcher / Broker
    physical hosting/provisioning/install/currentness

M13
    browser presentation contract + real Chromium

M14
    first real game consumer through M10–M13 public/frozen seams

M15
    full Desktop physical/security/lifecycle E2E

M16
    PWA Runtime/Worker hosting

M17
    full PWA E2E + Hostra/PWA logical equivalence
```

Nearest owner owns nearest evidence。Large E2E does not replace package/role/protocol tests。

---

## 2. Closed Baseline M1–M13

Existing qualification remains authoritative：

```text
M1–M9   Foundation / Runtime / Main / Hostra / Renderer / Data
M10      User Input
M11      Render Replication
M12      Content
M13      Web Presentation
```

Do not weaken or duplicate their detailed gates here。Current repository-level M14 gate remains：

```text
npm run test:m14
```

M10 physical-source milestone placement is frozen：

```text
M14 → existing/synthetic RendererInputSource
M15 → real Desktop BrowserWindow RendererInputSource
M17 → real PWA Window RendererInputSource
```

M11 RenderDomain wire id remains SDK-assigned/opaque。M12 logical Content semantics are reused unchanged。M13 Web Presentation Config/API/currentness semantics are reused unchanged。

---

## 3. Common Test Rules

All milestones follow：

```text
no test-only business truth
no direct authority injection when a frozen seam exists
no fake patch/state protocol alongside production semantics
no giant test replacing owner-local evidence
no private implementation detail frozen unless observable correctness requires it
```

Tests may use small local fakes/stubs for physical edges only when the seam being tested remains the real production/public seam。

---

## 4. M14 — Map Game Library + First Real Game

Canonical gate target：

```text
npm run test:m14
```

Exact closure is owned by root `M14_05_QUALIFICATION_CLOSURE.md` and live status/evidence by `m14-qualification.md`。Testing strategy only preserves ownership：

```text
workspace/package boundary
→ selective RMXP Map/Tileset consumer projection
→ @loomrealm-game/map semantic tests
→ checked-in example/config/resource validation
→ real Main/Subsystem/Data/Renderer/Content composition
→ existing/synthetic RendererInputSource through M10
→ one long-lived map Frame
→ one opaque RenderDomain
→ M13 classic bootstrap + Projector
→ real Chromium
→ real Canvas tile pixels + player sprite
→ deterministic passable then blocked movement
```

M14 tests MUST use the selective consumer records only：

```text
Map/{id}
    tileset_id,width,height,data

Tileset/{id}
    id,tileset_name,passages,priorities
```

Do not qualify or implement MapInfo/Event/Color/Tone/AudioFile projection merely because the importer can decode them。

M14 Canvas evidence uses current full-state semantics：

```text
clear full logical viewport
→ draw current retained tiles[]
```

Include stale-resource/current-data and stale-pixel cases, but do not introduce AssetManager、dirty-rectangle framework or map delta protocol。

Repository-owned M14 qualification code MAY reuse existing M13 internal Window-composition mechanics only as test infrastructure。Game library/example business code MUST NOT depend on Renderer internals。

M14 local compatibility gate：

```text
npm run test:m14:essentials-local -- \
  --source <path> \
  --map-id <id> \
  --x <x> \
  --y <y> \
  --character-name <name>
```

It proves a real Essentials v21.1 source enters the same selective projection/runtime/browser path。Third-party source bytes are not committed or uploaded。

M14 does **not** claim Desktop BrowserWindow/Node-child/full product E2E。

---

## 5. M15 — Desktop Full E2E — Implementation Frozen

M15 replaces M14 test-owned physical composition with the frozen real Hostra/Desktop product composition：

```text
checked-in Hostra-ready M14 installation
→ Hostra PREPARE in Electron main
→ Main
→ process.execPath + ELECTRON_RUN_AS_NODE real Hostra Runner child
→ existing Runtime Control WebSocket
→ Desktop Data Broker
→ exact 127.0.0.1 Desktop shell + Content origin
→ secure Electron BrowserWindow
→ one-shot isolated-preload handoff
→ Main-World trusted Renderer + captured native primitives
→ Renderer Control native MessagePort
→ BrowserWindow-native Data WebSocket
→ real DOM Keyboard/Pointer/Gamepad RendererInputSource
→ existing M13 presentation
→ same M14 game/map Runtime/WC
```

Hostra/Electron evidence is deliberately narrow。ADR 0033 preserves the existing Hostra process model：

```text
Runner executable remains process.execPath
Electron child receives host-synthesized ELECTRON_RUN_AS_NODE=1
supported Electron build keeps runAsNode fuse enabled
real child reaches existing Runtime Control ready + HostedRuntime termination
```

Qualification MUST NOT satisfy this by selecting an external Node path、adding UtilityProcess RuntimeHosting or creating another Runner path。

BrowserWindow qualification MUST assert：

```text
nodeIntegration=false
contextIsolation=true
sandbox=true
webSecurity=true
shell and /_lr/v1 Content API share exact http://127.0.0.1:<port> origin
no file:// shell
no Content CORS/OPTIONS extension
no preload Content-fetch proxy
no generic Electron/contextBridge API visible to business page
```

Execution-world/capability evidence MUST preserve：

```text
preload isolated world
    exact bootstrap/port handoff only

page Main World before business bootstrap
    trusted Renderer holder/input/M13 Projector
    private bootstrap material consumed
    authority-bearing native browser primitives captured/bound

page Main World after that boundary
    business Custom Elements/scripts
```

After business bootstrap，qualification MUST replace the page-visible `fetch` and `WebSocket` globals and prove the production trusted clients continue through their captured primitives without exposing Content bearer、private Data endpoint or raw transferred ports。

Renderer Control physical evidence uses `MessageChannelMain → native DOM MessagePort → existing Renderer Control`。Data evidence keeps the M9 Broker as sole candidate/current owner；Electron Data handoff carries only prepare/commit/revoke settlement, while Data application messages use the captured native browser WebSocket carrier。

Physical input evidence MUST use the production M15 DOM source and the exact frozen mapping/provenance rules in `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md`。The repository-level strategy does not duplicate that algorithm；the cross-owner minimum evidence is：

```text
trusted Keyboard ArrowRight reaches existing M10 path
synthetic Keyboard/Pointer dispatch is ignored
Pointer chorded-button transition preserves State-before-Event
Gamepad standard mapping/threshold path runs through the same production source
focus/visibility loss → unavailable → fresh baseline → available
```

Qualification adds real product lifecycle evidence：

```text
startup
real Electron-hosted Hostra child ready
physical keyboard input
focused Pointer/Gamepad producer evidence
reload / Renderer replacement
same-generation Data reconnect behavior
normal shutdown through runMain AbortSignal
Runner child termination
Window-local failure containment
```

M15 MUST NOT re-test M6/M10–M14 by bypassing their frozen seams or fork map business semantics into Desktop code。It only adds the physical Electron evidence missing from those owner-local suites。

Canonical M15 gate is frozen as：

```text
npm run test:m15
```

It runs `npm run test:m14` first, then the M15 Desktop build/boundary/Electron/lifecycle evidence。Formal M15 closure additionally requires M14 formal status = Closed。

---

## 6. M16 — PWA Runtime

M16 closes only PWA Runtime hosting mechanics：

```text
PWA PREPARE
→ Dedicated Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
→ termination/failure
```

M16 does not require PWA Renderer/Data/Content/Web Presentation。A Subsystem may receive the existing unavailable Content capability when no physical ContentClient is supplied；this is not a second PWA Content implementation。

Do not add PWA Data/Content abstraction only for symmetry with Desktop。

---

## 7. M17 — PWA Full E2E / Equivalence

M17 completes：

```text
Window Renderer Control
→ PWA Data broker / MessageChannel provisioning
→ PWA Content realization
→ real Window RendererInputSource
→ Render replication
→ M13 Web Presentation Config/API/Projector
→ same M14 concrete game + business WC
```

Cross-platform equivalence compares normalized logical/application outcomes, not physical implementation identity：

```text
same Game topology
same Frame/Input/Render/Content semantics
same M14 movement/passability result
same M13 identity/currentness behavior
same business-observable presentation result
```

Allowed physical differences include Process vs Worker、WebSocket vs MessagePort、Desktop FSDB/HTTP vs PWA Fetch/SW/OPFS。

M17 does not duplicate all lower-level M13 Chromium conformance；it proves the PWA physical realization satisfies the already-frozen semantics。The Desktop-only Electron run-as-node and same-loopback-origin choices are **not** PWA contracts。

---

## 8. Root Gate Evolution

The root gate set before M14 was：

```text
npm run test:regression
npm run test:m9
npm run test:m10
npm run test:m11
npm run test:m12
npm run test:m13
npm run docs:build
npm run docs:check-links
```

M14 implementation adds：

```text
test:m14
test:m14:pack
test:m14:essentials-local
```

M15 implementation must add exactly the frozen top-level closure entry：

```text
test:m15
```

Later milestones add their own unique top-level qualification entry instead of silently changing the meaning of historical gates。

---

## 9. Abstraction Budget for Tests

Test convenience does not justify production abstractions such as：

```text
AuthorityEventBus / ObserverHub
ConnectionRegistry / ConnectionManager
DefinitionRegistry
GameRuntimeHost / MiniDesktopHost / MapHost
GenericTransaction / 2PC
retry/backoff framework
ProjectionRegistry / ConsumerProjector<T>
AssetManager / ResourceProvider
InputDeviceManager / generic input registry
BrowserPrimitiveRegistry / security service locator
generic local-server/CORS framework
generic conformance framework for one fixture
second Renderer currentness state machine
```

Prefer small test-local objects/functions that drive the real seams。

---

## 10. Final Test Invariants

1. M1–M13 closed evidence remains valid and is not renumbered；
2. M14 proves the first real game consumer and its formal status remains ledger-owned；
3. M15 alone claims full Desktop E2E and its implementation boundary is frozen before coding；
4. M16 alone closes PWA Worker Runtime hosting；
5. M17 closes full PWA E2E and Hostra/PWA logical equivalence；
6. M14 uses synthetic/existing input source through the exact M10 gate；M15/M17 own physical DOM producers；
7. M15 preserves isolated preload vs Main-World Renderer/business placement and does not expose generic Electron APIs；
8. M15 uses the existing Hostra Runner through Electron run-as-node mode rather than creating a second Runtime path；
9. M15 shell/Content are same-origin and Control/Data/Content physical paths remain capability-separated；
10. M15 trusted browser clients do not dynamically resolve business-replaceable authority-bearing globals after business bootstrap；
11. tests assert public/observable behavior, not unnecessary private Shadow/ordering/helpers；
12. no test-only business path, hidden second state model, or generic registry/manager/service/framework is created solely for qualification convenience。
