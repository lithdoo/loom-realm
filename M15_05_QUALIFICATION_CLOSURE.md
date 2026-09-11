# M15 / 05 — Qualification and Closure

> 状态：**Closure rules retained / qualification subject recomposed around Hostra**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：05  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md) → [M15 / 04](M15_04_DESKTOP_FULL_E2E_VERTICAL.md)  
> 依赖：[Testing Strategy](doc/30-implementation/testing-strategy.md)、[M14 qualification](doc/30-implementation/m14-qualification.md)

> **Supersession notice:** M14 formal prerequisite、single `npm run test:m15` closure gate、boundary discipline 与 evidence ownership继续有效；原 direct-Electron / MessageChannelMain / LoomRealm preload / Electron-main run-as-node qualification subject 已被 Hostra recomposition supersede。

---

## 1. Formal Prerequisite

M15 implementation MAY proceed while M14 hosted requalification is pending；formal M15 closure REQUIRES formal M14 closure。

```text
M14 != Closed
→ M15 cannot be Closed
```

`npm run test:m15` must continue to include the current `npm run test:m14` gate first。Final status claim also requires `doc/30-implementation/m14-qualification.md` to record M14 as formally Closed。

## 2. Current Closure Subject

Final M15 closure subject is the **Hostra-owned Desktop composition**, not the historical standalone Electron app：

```text
pinned Hostra
→ HOSTRA_SUBCMD LoomRealm plain Node product
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ existing Main/RuntimeHosting/Runner
→ existing M13 presentation
→ same M14 game
```

The prior direct-Electron E2E remains historical/migration evidence only。

## 3. Required Physical Decisions

Qualification must prove, without reopening M10–M14：

```text
Hostra is sole Electron/BrowserWindow owner
LoomRealm Desktop production source owns no Electron app/BrowserWindow primitives
Hostra RPC is used only for Window/lifecycle operations
Renderer Control uses LoomRealm loopback physical carrier
Data settlement remains separate from Data application
M9 Broker remains sole Data candidate/current owner
Content remains existing Desktop Content API
M13 presentation remains existing trusted Renderer seam
DOM input remains existing M10 producer path
reload = same Hostra Window + fresh Renderer logical participant
shutdown/fatal/RPC-terminal cleanup uses one Main cancellation owner chain
```

Hostra itself is not modified or patched by LoomRealm qualification。

## 4. Abstraction Budget

M15 may add only concrete physical adapters/functions with immediate production consumers。

Expected conceptual budget：

```text
one concrete Hostra RPC adapter module
one concrete Renderer Control WS realization
one concrete Data settlement WS realization
small single-window document bootstrap state
```

No requirement exists for separate server classes per capability；Control/Data capability separation is semantic/physical-wire separation, not a mandate for a transport framework。

M15 MUST NOT introduce：

```text
IHostraClient / HostraClientPort / HostraSession
HostraManager / DesktopHostFramework
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry
RecoveryManager / retry framework
BrowserPrimitiveRegistry
UniversalRendererHost
PresentationHost / PresentationRuntime
generic local web/static-file server framework
second Renderer/Data currentness model
```

A concrete module/object/function is preferred over an interface/factory hierarchy when there is only one consumer and one realization。

## 5. Required Evidence

### Startup

```text
pinned Hostra starts
→ Hostra starts LoomRealm HOSTRA_SUBCMD
→ LoomRealm PREPARE/Main/RuntimeHosting start
→ Hostra RPC openWindow
→ Hostra-owned Window loads LoomRealm trusted shell
→ Control/Data/Content converge
→ visible M14 map
```

### Host ownership

```text
Hostra is actual Electron process
LoomRealm is actual Node subprocess
Window appears in Hostra lifecycle/state observation
apps/desktop production source contains no direct Electron ownership
```

`getHostState/getAllWindows` may be used here as qualification observation only。

### Input

```text
trusted ArrowRight → existing M10 → passable then blocked M14 result
synthetic Keyboard/Pointer ignored
Pointer chorded transition semantics hold
Gamepad standard mapping/threshold/fresh identity hold
focus/visibility unavailable → fresh baseline → available
```

### Reload

```text
same Hostra windowId
fresh Renderer identity
same Main/Runner/Subsystem generation/game state
fresh Control/Data/Content document material
current presentation resumes
```

### Reconnect

```text
same-generation physical Data loss
→ DataAuthority retained
→ existing Broker retire/prepare/commit/current
→ fresh Renderer acquire
→ presentation resumes
```

### Shutdown/failure

```text
user Window close
programmatic closeWindow
Main/Runner fatal
Hostra RPC terminal / host shutdown
```

all converge through one LoomRealm cancellation/cleanup path with no orphan Runner、Control/Data/Content listener、LoomRealm child or reusable private credential。Main rejection MUST NOT skip physical cleanup。

## 6. Canonical Gate

The unique M15 closure command remains：

```text
npm run test:m15
```

It MUST compose：

```text
npm run test:m14
→ Desktop boundary/build checks
→ real pinned-Hostra E2E
→ input/reload/reconnect/lifecycle evidence
```

CI runs this same root entry。The old standalone Electron test may remain temporarily as migration regression evidence, but it is not sufficient final closure evidence and should be retired from canonical ownership after the Hostra vertical qualifies。

Formal evidence belongs to：

```text
doc/30-implementation/m15-qualification.md
```

This landing document does not own a live PASS/Closed claim。

## 7. Mechanical Boundary Checks

Qualification MUST reject at least：

```text
apps/desktop production source imports "electron"
apps/desktop creates BrowserWindow or owns app.quit
canonical M15 launches Electron directly instead of Hostra
Hostra source/runtime is patched for LoomRealm
Hostra RPC carries LoomRealm Control/Data application payload
Hostra types leak into platform-ports/Main/Renderer/game packages
presentation config enters Hostra/Main bootstrap
business code depends on window.electronAPI
private Content/Data adapters use business-replaceable primitives after trusted bootstrap
Data application bytes merge into settlement channel
Browser/Hostra creates DataAuthority or candidate currentness
Desktop owns a second Runner termination policy
new Hostra/Window/Document/Connection/Recovery manager abstraction appears only for E2E
```

## 8. Reopen Rule

Implementation may choose private file/function names、whether small WS endpoints share one listener or use multiple tiny listeners、exact route spelling and bounded queue constants。

Do not reopen：

```text
authority ownership
Hostra-as-sole Electron/Window host
M10–M14 logical/business contracts
Control/Data/Content separation
M9 Broker currentness
reload logical semantics
single cancellation/shutdown owner chain
qualification ownership
```

Only a real contract/security/platform contradiction justifies design reopen；code reuse、future PWA symmetry or test convenience do not。

## 9. Closure Condition

M15 can be marked Closed only when：

```text
M14 formal status = Closed
pinned Hostra identity is recorded
npm run test:m15 = repeatable PASS in supported CI
Hostra-owned full Desktop E2E = PASS
reload/reconnect/input/lifecycle/failure evidence = PASS
no direct LoomRealm Electron ownership remains in canonical product path
```
