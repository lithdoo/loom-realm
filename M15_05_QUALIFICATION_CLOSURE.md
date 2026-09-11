# M15 / 05 — Qualification and Closure

> 状态：**Closure rules retained / qualification subject recomposed around Hostra**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：05  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 当前决策：[ADR 0034](doc/decisions/0034-hostra-owned-desktop-composition.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md) → [M15 / 04](M15_04_DESKTOP_FULL_E2E_VERTICAL.md)  
> 依赖：[Testing Strategy](doc/30-implementation/testing-strategy.md)、[M14 qualification](doc/30-implementation/m14-qualification.md)

> **Supersession notice:** M14 formal prerequisite、single `npm run test:m15` gate、boundary discipline 与 evidence ownership继续有效；原 direct-Electron / MessageChannelMain / LoomRealm preload / Electron-main run-as-node qualification subject已被 ADR 0034 supersede。

---

## 1. Formal Prerequisite

M15 implementation MAY proceed while M14 hosted requalification is pending；formal M15 closure REQUIRES formal M14 closure。

```text
M14 != Closed
→ M15 cannot be Closed
```

`npm run test:m15` continues to include current `npm run test:m14` first。Final status claim also requires `doc/30-implementation/m14-qualification.md` to record M14 as formally Closed。

---

## 2. Current Closure Subject

Final subject：

```text
pinned Hostra shell
→ HOSTRA_SUBCMD LoomRealm plain Node product
→ LoomRealm RuntimeHosting Runner child
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ existing Main/M10–M14 path
```

Historical standalone Electron E2E is migration evidence only。

---

## 3. Required Physical Decisions

Qualification must prove：

```text
Hostra shell = sole Electron/BrowserWindow owner
LoomRealm Desktop = actual HOSTRA_SUBCMD Node child
Runner = LoomRealm RuntimeHosting child
Hostra RPC = host-control only
Renderer Control = LoomRealm loopback physical carrier
Data settlement remains separate from Data application
M9 Broker remains sole Data candidate/current owner
Content remains existing Desktop Content semantics
M13 presentation remains existing trusted Renderer seam
DOM input remains existing M10 producer path
```

Hostra itself is not patched by LoomRealm qualification。

---

## 4. Document / Bootstrap Closure

Startup/reload must qualify bounded rendezvous：

```text
pendingAcquire   0..1
pendingDocument  0..1
currentDocument  0..1
```

Both orderings must converge：

```text
acquire first → document later
document first → acquire later
```

Cancellation must be observable：

```text
aborted document does not consume later acquire
retired acquire does not bootstrap later document
product terminal clears pending/current document material
```

Trusted shell route is top-level-navigation-only。Qualification must prove ordinary page activity cannot mint/replace Renderer lifetime：

```text
fetch(location.href) → no lifecycle effect
XHR                  → no lifecycle effect
iframe/subframe      → no lifecycle effect
resource request     → no lifecycle effect
wrong route secret   → no lifecycle effect
```

Implementation may choose concrete navigation metadata/headers；the behavior is frozen, not a particular helper。

---

## 5. Reload / Reconnect Evidence

Reload：

```text
same Hostra windowId
→ fresh top-level document
→ fresh Renderer identity
→ fresh Control/Data/Content material
→ same Main/Runner/Subsystem generation/game state
→ current presentation/input resumes
```

Reload MUST NOT call Hostra `openWindow()` again。

Reconnect：

```text
same-generation physical Data loss
→ DataAuthority retained
→ existing Broker retire/prepare/commit/current
→ fresh Renderer acquire
→ presentation resumes
```

---

## 6. One Termination Funnel

The following triggers must all reach one idempotent LoomRealm owner path：

```text
window.closed
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
programmatic close
Main fatal
Runner fatal
startup partial failure
```

Required convergence：

```text
beginTermination(reason)
→ stop new document activity
→ abort runMain
→ await/preserve Main settlement
→ existing RuntimeHosting converges Runner
→ finally close Control/Data/Content/document resources
→ close Hostra RPC adapter
→ LoomRealm child exits
```

Main rejection MUST NOT skip physical cleanup。Programmatic close MUST NOT rely on `window.closed` callback to begin local cleanup。

Pinned Hostra final-window behavior may signal the `HOSTRA_SUBCMD` before LoomRealm has completed cleanup；therefore real SIGTERM/SIGINT handling is part of M15 qualification。

Qualification must observe：

```text
signal handler enters same termination path
Runner PID absent
LoomRealm child absent
former LoomRealm ports refuse connections
Hostra converges according to pinned host behavior
```

No second Desktop direct Runner kill authority is allowed。If existing owner chain cannot converge within pinned Hostra's actual grace, M15 fails and physical design must be explicitly reopened。

---

## 7. Startup / Partial Failure Closure

Representative failures must leave no resources alive：

```text
Hostra RPC connect / PREPARE
listener startup
runMain early reject
openWindow failure
Window/document bootstrap failure
Renderer convergence failure
```

`openWindow` RPC success is not product-ready evidence。

No rollback framework is required；created concrete handles are disposed through the same finally-like termination owner path。

---

## 8. Abstraction Budget

Expected conceptual budget：

```text
one concrete Hostra RPC adapter
one concrete Renderer Control loopback realization
one concrete Data settlement realization
small single-window document bootstrap state
```

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
generic local web/static/WebSocket framework
second Renderer/Data currentness model
```

A concrete object/function is preferred over an interface/factory hierarchy when there is one consumer and one realization。

---

## 9. Migration Staging

Before the Hostra replacement vertical qualifies：

```text
canonical Hostra entry/path imports no Electron
canonical path does not create BrowserWindow/app.quit
legacy direct-Electron path MAY remain isolated as regression oracle
```

After replacement qualification：

```text
delete legacy direct-Electron production ownership
remove canonical Electron runtime/start dependency
repository-wide apps/desktop production Electron ownership/import → FAIL
```

Therefore a repository-wide no-Electron check is a **final replacement gate**, not a Slice-1 prerequisite。

---

## 10. Canonical Gate

```text
npm run test:m15
```

It MUST compose：

```text
npm run test:m14
→ Desktop boundary/build
→ pinned Hostra full E2E
→ document/bootstrap rendezvous + navigation-only evidence
→ input/reload/reconnect
→ signal/window/RPC/fatal/startup cleanup evidence
```

Formal evidence belongs to：

```text
doc/30-implementation/m15-qualification.md
```

This landing document does not own live PASS/Closed state。

---

## 11. Mechanical Boundary Checks

Final qualification MUST reject：

```text
canonical apps/desktop path imports "electron"
canonical path creates BrowserWindow or owns app.quit
canonical M15 launches Electron directly instead of Hostra
Hostra source/runtime patched for LoomRealm
Hostra RPC carries LoomRealm application payload
Hostra types leak into platform-ports/Main/Renderer/game packages
business code depends on window.electronAPI
ordinary fetch/subframe can create Renderer document lifetime
Data application merges into settlement channel
second Data currentness owner
second Runner termination policy
new Hostra/Window/Document/Connection/Recovery manager abstraction
```

---

## 12. Reopen Rule

Implementation may choose private names、route spelling、bounded queue constants、and whether small loopback carriers share a listener。

Do not reopen：

```text
authority ownership
Hostra-as-sole Electron/Window host
M10–M14 logical/business contracts
Control/Data/Content separation
M9 Broker currentness
bounded document/acquire rendezvous
navigation-only bootstrap lifetime
reload semantics
one idempotent termination funnel
qualification ownership
```

Only a real correctness/security/platform contradiction justifies design reopen。

---

## 13. Closure Condition

M15 can be marked Closed only when：

```text
M14 formal status = Closed
ADR 0034 propagation complete
pinned Hostra identity recorded
npm run test:m15 = repeatable PASS in supported CI
Hostra-owned full Desktop E2E = PASS
document/bootstrap + reload/reconnect/input + lifecycle/failure evidence = PASS
legacy direct-Electron canonical ownership removed
```
