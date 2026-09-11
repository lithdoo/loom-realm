# M15 / 04 — Desktop Full E2E Vertical

> 状态：**Business-visible vertical retained / canonical physical host changed to Hostra**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：04  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 当前决策：[ADR 0034](doc/decisions/0034-hostra-owned-desktop-composition.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md)  
> 依赖：[M14 / 04](M14_04_REAL_GAME_VERTICAL.md)

> **Supersession notice:** 本文继续拥有同一 M14 gameplay outcome、real DOM input、reload、same-generation reconnect 与 owner-boundary evidence intent；原 direct-Electron canonical trace、Electron-main run-as-node、LoomRealm preload/MessagePort evidence 已被 ADR 0034 supersede。

---

## 1. Canonical Trace

Final M15 vertical MUST start at Hostra：

```text
pinned Hostra shell
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ checked-in examples/essentials-v21.1 installation
→ Hostra launch-profile PREPARE
→ Main
→ existing RuntimeHosting / real Node Runner
→ existing Runtime Control
→ Desktop Data Broker
→ Desktop Content + trusted shell
→ Hostra RPC openWindow
→ Hostra-owned BrowserWindow
→ document/acquire rendezvous
→ trusted Renderer bootstrap
→ Renderer Control + Data settlement/application carriers
→ existing M13 presentation
→ @loomrealm-game/map + business Custom Elements
```

Qualification may use Hostra CDP/Playwright for observation and trusted physical input, but MUST NOT inject Main/Store/game state or manufacture a second game/manifest/runtime path。

---

## 2. Business-visible Happy Path

```text
map visible
→ trusted ArrowRight
→ existing M10 path
→ (10,8) → (11,8)
→ second ArrowRight
→ persisted passability blocks target (12,8)
→ player remains (11,8)
```

M15 does not re-own map schema、Canvas crop math、Custom Element internals or other M14 owner-local semantics。

---

## 3. Physical Host / Process Evidence

The suite MUST prove：

```text
Hostra is actual Electron/BrowserWindow owner
LoomRealm Desktop is actual HOSTRA_SUBCMD direct child
Runner is child of LoomRealm RuntimeHosting
Window appears in Hostra lifecycle/state observation
canonical LoomRealm path does not create BrowserWindow/app.quit
Hostra itself is not patched for LoomRealm
```

Hostra RPC is Window/lifecycle control only；LoomRealm Control/Data application payload never flows through it。

---

## 4. Document / Capability Evidence

Both rendezvous orders MUST be exercised：

```text
Main acquire first → top-level document later → converge
top-level document first → Main acquire later → converge
```

The trusted shell bootstrap route MUST be proven navigation-only：

```text
valid top-level main-document navigation → fresh Renderer lifetime
fetch(location.href)                    → no lifecycle effect
XHR                                     → no lifecycle effect
iframe/subframe                         → no lifecycle effect
resource request                        → no lifecycle effect
wrong route secret                      → no lifecycle effect
```

Browser-side evidence also proves：

```text
fresh bootstrap is consumed before business scripts
Renderer Control uses LoomRealm loopback carrier
Data Broker remains candidate/current owner
Data settlement remains separate from Data application
Content remains existing Desktop Content semantics
M13 production seam projects same M14 game
```

After trusted bootstrap, qualification SHOULD replace page-visible `fetch` / `WebSocket` and still prove normal Resource/Data behavior without exposing private Content bearer or private endpoint material。

Hostra's own ambient preload/API may exist；LoomRealm contracts/business code do not depend on it。

---

## 5. Input Evidence

The same production DOM source proves：

```text
Keyboard
→ trusted event only
→ existing M10 path
→ synthetic dispatch ignored

Pointer
→ trusted event only
→ viewport normalization
→ fresh local pointerId
→ chorded buttons State-before-Event
→ synthetic dispatch ignored

Gamepad
→ captured getGamepads()
→ standard mapping
→ rAF sampling
→ fresh gamepadId on reconnect/index reuse
→ frozen threshold ordering
```

focus/visibility loss/return proves unavailable → fresh baseline → available, with no stale Event replay。

---

## 6. Reload / Reconnect Evidence

Reload：

```text
same Hostra windowId
old Renderer retires
fresh top-level document/acquire rendezvous
fresh Renderer identity/material
Main / Runner / Subsystem generation unchanged
current game state unchanged
presentation/input resume
```

same-generation Data failure：

```text
current physical pair lost
→ Main DataAuthority remains
→ Broker retires pair
→ fresh prepare/commit/current
→ fresh Renderer acquire
→ presentation resumes
```

Reload MUST NOT call Hostra `openWindow()` again。

---

## 7. Lifecycle / Failure Evidence

All terminal triggers qualify the same idempotent LoomRealm path：

```text
user final-window close
programmatic closeWindow
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
Main / Runner fatal
representative startup partial failure
```

Expected chain：

```text
beginTermination
→ stop document activity
→ abort runMain
→ existing RuntimeHosting converges Runner
→ finally close Control/Data/Content/document resources
→ LoomRealm child exits
```

Pinned Hostra's actual final-window signal ordering MUST be exercised；do not assume `window.closed` completes cleanup before SIGTERM。

Terminal assertions：

```text
Runner PID absent
LoomRealm child absent
former LoomRealm loopback ports refuse connections
Hostra converges normally
```

No Desktop direct Runner kill shortcut is permitted。If real Hostra grace is insufficient for the existing owner chain, qualification fails and architecture must explicitly reopen。

---

## 8. Startup Failure Evidence

Representative failures from RPC/PREPARE、listener startup、runMain early rejection、openWindow、document/bootstrap/Renderer convergence must prove no orphan resource。

`openWindow` RPC success alone is not product-ready evidence。

---

## 9. Test Placement and Abstraction Budget

Allowed：

```text
apps/desktop/test/*
test/m15-*.test.mjs
```

Do not create production：

```text
MiniDesktopHost
HostraManager / HostraSession
WindowRegistry / WindowLifecycleManager
DocumentManager / BootstrapCoordinator
TransportRegistry / ConnectionManager
RecoveryManager
fake application authority
test-only game/runtime/presentation path
```

Assertions target public/observable effects and owner boundaries, not private callback/helper topology。

---

## 10. Completion

M15/04 retained intent is complete when one real Hostra trace proves：

```text
pinned Hostra owns Electron + BrowserWindow
LoomRealm is HOSTRA_SUBCMD Node child
Runner is RuntimeHosting child
same checked-in game reaches Main/Runner
same M13/M14 presentation is visible
navigation-only bootstrap + race-safe rendezvous
trusted physical input reaches M10
reload = same Hostra Window + fresh Renderer + same game
same-generation Data reconnect converges
window/signal/RPC/fatal/startup failure all leave no LoomRealm orphan resources
```

The earlier standalone Electron E2E remains migration evidence only and cannot satisfy final M15 closure by itself。
