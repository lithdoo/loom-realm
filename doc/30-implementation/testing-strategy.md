# 测试策略

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M15 implemented；M14/M15 current subject local requalification PASS、exact-head CI pending；Viewport Core Qualified；M16/M17 implemented with independent PWA gate
> 主要定义：package/role/protocol/vertical ownership，以及 M14–M17 E2E qualification 分工  
> 依赖：[正式契约目录](../15-contracts/README.md)、[下一阶段路线图](./roadmap.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-10-08

测试目标不是“消息能通”，而是证明每层不能绕过 authority、lifecycle、failure-domain、public author API、PREPARE、package boundary 和 currentness。

M11/M14/M15 formal status 分别只以 [`m11-qualification.md`](./m11-qualification.md)、[`m14-qualification.md`](./m14-qualification.md)、[`m15-qualification.md`](./m15-qualification.md) 为准。Viewport Core 状态只以 [`viewport-profile-v1-qualification.md`](./viewport-profile-v1-qualification.md) 为准。历史 direct-Electron evidence 是 migration oracle，不是最终 M15 closure evidence；历史 qualification PASS 也不能自动转移到新的 executable/qualification-input subject。

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
    Hostra-owned full Desktop physical/security/lifecycle E2E

M16
    PWA Runtime/Worker hosting

M17
    full PWA E2E + Hostra/PWA logical equivalence
```

Nearest owner owns nearest evidence。Large E2E does not replace package/role/protocol tests。

---

## 2. Current Closed / Qualified Baseline

Current qualification records remain authoritative：

```text
M1–M10   Foundation / Runtime / Main / launch profile / Renderer / Data / User Input
M11      Render Replication — current-subject hosted Node 20/24 Closed
M12      Content
M13      Web Presentation
M14      first real game / exact official Essentials production path — Closed
M15      frozen Hostra Desktop full E2E/lifecycle — Closed
Viewport corrected four-child /1 — Core Qualified (Desktop + shared contracts)
```

Current repository-level M14 gate remains：

```text
npm run test:m14
```

M10 physical-source placement：

```text
M14 → existing/synthetic RendererInputSource
M15 → real Hostra-owned BrowserWindow RendererInputSource
M17 → real PWA Window RendererInputSource
```

M11 RenderDomain wire id remains SDK-assigned/opaque。M12 logical Content semantics and M13 presentation currentness remain unchanged。

---

## 3. Common Test Rules

```text
no test-only business truth
no direct authority injection when a frozen seam exists
no fake patch/state protocol alongside production semantics
no giant E2E replacing owner-local evidence
no private implementation detail frozen unless observable correctness requires it
```

Physical-edge fakes/stubs are allowed only when the seam under test remains the real production/public seam。

---

## 4. M14 — Map Game Library + First Real Game

Canonical gate：

```text
npm run test:m14
```

Exact closure is owned by live evidence in [`m14-qualification.md`](./m14-qualification.md)。

Required ownership chain remains：

```text
workspace/package boundary
→ selective RMXP Map/Tileset projection
→ @loomrealm-game/map semantics
→ checked-in example/config/resources
→ real Main/Subsystem/Data/Renderer/Content composition
→ existing/synthetic RendererInputSource through M10
→ M13 bootstrap/Projector
→ real Chromium
→ deterministic passable then blocked movement
```

M14 does not claim Hostra shell/BrowserWindow/full Desktop lifecycle。Current M14 formal qualification is Closed for the subject recorded by its ledger；any later behavior/qualification-input change creates a new subject and must re-run the required exact + hosted gates。

---

## 5. M15 — Hostra-owned Desktop Full E2E

M15 frozen qualification baseline：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
shutdown grace 1000 ms
```

M15 canonical subject is：

```text
frozen Hostra shell
├─ actual Electron / BrowserWindow owner
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ Main
├─ RuntimeHosting → Runner
├─ Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
└─ Data settlement loopback carrier

Hostra-owned BrowserWindow
→ trusted Renderer
→ real DOM input
→ existing M13 presentation
→ same M14 game
```

Qualification MUST NOT satisfy M15 by launching Electron directly from LoomRealm application code、by relying on ADR0033 run-as-node embedding、or by silently changing the frozen Hostra baseline。

### 5.1 Boundary evidence

Mechanically reject：

```text
canonical Desktop entry importing Electron
canonical LoomRealm path creating BrowserWindow/app.quit
Hostra RPC carrying Renderer/Data application messages
Hostra type leakage into platform-ports/Main/Renderer/game packages
second Data currentness owner
second Runner termination authority
generic Hostra/Window/Document/Connection/Recovery framework
Hostra source patched by LoomRealm qualification
```

Historical legacy direct-Electron source may be retained only as fixed-history regression context；it is not a current production owner and does not substitute for Hostra qualification。

### 5.2 Process ownership evidence

Observe：

```text
Hostra is actual Electron process
LoomRealm Desktop is actual HOSTRA_SUBCMD direct child
Runner is child of LoomRealm RuntimeHosting, not Hostra's direct application child
Hostra owns the tested BrowserWindow
```

`getHostState/getAllWindows` and CDP may be used for observation only；they are not production authority。

### 5.3 Document bootstrap/rendezvous evidence

Production implementation must exercise both ordering cases：

```text
RendererControlBinding.acquire first
→ top-level document arrives later
→ converges

top-level document first
→ Main acquire arrives later
→ converges
```

Also prove bounded cancellation：

```text
aborted document request does not consume later acquire
retired acquire does not bootstrap later document
product terminal clears pending document/acquire state
```

Trusted shell route must be navigation-only：

```text
real top-level main-document navigation → may create fresh Renderer lifetime
fetch(location.href)                    → cannot
XHR                                     → cannot
iframe/subframe                         → cannot
script/resource request                 → cannot
wrong route secret                      → cannot
```

This evidence verifies behavior, not a particular header/helper implementation。

### 5.4 Capability evidence

Control、Data settlement、Data application、Content remain distinct。The exact number of loopback listeners is not normative。

Trusted Renderer captures required native `fetch` / `WebSocket` / input primitives before business bootstrap。After business bootstrap, replacing page-visible globals must not expose private Content bearer、Data endpoint or Control/Data carrier material。

### 5.5 Input evidence

Use the production M15 DOM source and exact frozen mapping/provenance rules：

```text
trusted Keyboard ArrowRight reaches existing M10 path
synthetic Keyboard/Pointer dispatch ignored
Pointer chorded-button transition preserves State-before-Event
Gamepad standard mapping/threshold runs through same producer
focus/visibility loss → unavailable → fresh baseline → available
```

### 5.6 Reload evidence

```text
same Hostra windowId
→ fresh top-level document
→ fresh Renderer identity
→ fresh Control/Data/Content material
→ unchanged Main/Runner/Subsystem generation/game truth
→ current presentation/input resumes
```

Reload MUST NOT call Hostra `openWindow()` again。

### 5.7 Data reconnect evidence

```text
same-generation physical Data loss
→ same Renderer Control participant remains current
→ Main DataAuthority remains current
→ existing Broker retires old pair
→ fresh prepare/prepared/commit
→ fresh RendererDataBinding.acquire() resolves
→ fresh Data physical pair only
→ same Renderer identity resumes current truth
```

Qualification MUST assert Renderer logical identity remains unchanged during Data-only reconnect。No retry/backoff/recovery authority is introduced。

### 5.8 Termination/failure evidence

Every terminal trigger must reach one idempotent owner chain：

```text
user final-window close
programmatic closeWindow
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
Main fatal
Runner fatal
startup partial failure
    ↓
beginTermination
    ↓
abort runMain
    ↓
Main/RuntimeHosting convergence
    ↓
finally Control/Data/Content/document cleanup
```

This suite must specifically exercise frozen Hostra final-window behavior because Hostra may signal the `HOSTRA_SUBCMD` during host shutdown。Prove：

```text
signal handler participates in the same termination path
Runner PID absent
LoomRealm child absent
former loopback ports refuse connections
Hostra converges normally
```

If the owner chain cannot converge within the frozen Hostra **1000 ms** grace, qualification fails and the platform boundary must be explicitly reopened；tests must not add a Desktop direct Runner kill shortcut。

### 5.9 Startup failure evidence

At least representative failures from the following stages must prove finally-like cleanup：

```text
RPC/PREPARE
listener startup
runMain early rejection
openWindow failure
bootstrap/Renderer convergence failure
```

`openWindow` RPC success is not considered product ready。

### 5.10 Canonical gate and current result

```text
npm run test:m15
```

It runs current `npm run test:m14` first, then boundary/build + frozen Hostra full E2E + input/reload/Data-only reconnect/termination evidence。Formal M15 status is **Closed** in [`m15-qualification.md`](./m15-qualification.md)：hosted canonical/lifecycle evidence and same-checkout local full three-viewport P95 evidence are recorded separately and combined only according to the frozen closure rule。A later behavior-affecting subject must re-run the applicable gates rather than inheriting this result。

---

## 6. M16 — PWA Runtime

M16 owns PWA Runtime hosting mechanics：

```text
PWA PREPARE
→ Dedicated Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
→ termination/failure
```

The canonical PWA product has implemented this physical profile and its independent CI gate。M16 does not redefine Desktop/Hostra physical ownership and does not justify shared physical-host abstractions merely for symmetry。

---

## 7. M17 — PWA Full E2E / Equivalence

M17 completes：

```text
Window Renderer Control
→ PWA Data broker / provisioning
→ PWA Content
→ real Window RendererInputSource
→ Render replication
→ M13 presentation
→ same M14 concrete game/business WC
```

The canonical PWA product has implemented these paths and their independent qualification gate。Cross-platform equivalence compares logical/application outcomes, not physical implementation identity。

Allowed differences include：

```text
Hostra shell process vs browser Window/Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA storage/fetch mechanics
```

---

## 8. Root Gate Evolution

Historical root gates remain unchanged。M14 owns：

```text
test:m14
test:m14:pack
test:m14:essentials-local
```

M15 owns one top-level closure entry：

```text
test:m15
```

PWA M16/M17 use their own independent completion/qualification commands documented in the PWA ledger。Later milestones add unique top-level gates instead of silently redefining historical gates。

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
BrowserPrimitiveRegistry
HostraManager / HostraSession
WindowLifecycleManager / DocumentManager / BootstrapCoordinator
generic local-server/CORS/WebSocket framework
second Renderer currentness state machine
```

Prefer small test-local objects/functions that drive real seams。

---

## 10. Final Test Invariants

1. M1–M15 的 Closed/Qualified 结论只对各自 ledger 记录的 subject/evidence 有效，后续行为或 qualification-input 变化必须重新形成当前证据；
2. M11 current subject 已通过 hosted Node 20/24 canonical root gate；
3. M14 仍证明 first real game consumer，并在其 current qualification subject 上 formally Closed；
4. M15 alone claims full Hostra-owned Desktop E2E，且 formal qualification 已 Closed；
5. M16 owns PWA Worker Runtime evidence；
6. M17 owns full PWA E2E + logical equivalence evidence；
7. M15 uses frozen Hostra-owned BrowserWindow, not LoomRealm-owned Electron；
8. M15 Hostra RPC is host-control only；
9. M15 document bootstrap is top-level-navigation-only and rendezvous is race-safe；
10. reload replaces Renderer identity；Data-only reconnect preserves Renderer identity；
11. M15 termination has one idempotent funnel including OS signals；
12. M15 Data Broker remains sole candidate/current owner；
13. tests assert observable behavior, not unnecessary helper/class topology；
14. no generic registry/manager/recovery/framework is created solely for qualification convenience；
15. PWA qualification does not rewrite Desktop qualification history or vice versa。
