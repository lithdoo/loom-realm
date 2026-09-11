# M15 / 04 — Desktop Full E2E Vertical

> 状态：**Business-visible vertical retained / canonical physical host changed to Hostra**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：04  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md)  
> 依赖：[M14 / 04](M14_04_REAL_GAME_VERTICAL.md)

> **Supersession notice:** 本文继续拥有同一 M14 gameplay outcome、real DOM input、reload、same-generation reconnect 与 owner-boundary evidence intent；原 direct-Electron canonical trace、Electron-main run-as-node qualification、LoomRealm preload/MessagePort evidence 已被 Hostra recomposition supersede。

---

## 1. Canonical Trace

Final M15 vertical MUST start at Hostra：

```text
pinned Hostra
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ checked-in examples/essentials-v21.1 Hostra installation
→ Hostra PREPARE
→ Main
→ existing RuntimeHosting / real Node Runner
→ existing Runtime Control
→ Desktop Data Broker
→ Desktop Content + trusted shell
→ Hostra RPC openWindow
→ Hostra-owned BrowserWindow
→ trusted Renderer bootstrap
→ Renderer Control WS + Data settlement/application WS
→ existing M13 presentation
→ @loomrealm-game/map + business Custom Elements
```

Qualification may use Hostra CDP/Playwright for observation and trusted physical input, but MUST NOT inject Main/Store/game state or manufacture a second game/manifest/runtime path。

## 2. Business-visible Happy Path

Canonical scenario reuses M14 frozen facts：

```text
map visible
→ trusted ArrowRight
→ existing M10 path
→ first move succeeds: (10,8) → (11,8)
→ presentation reflects current state
→ second ArrowRight
→ persisted passability blocks movement
→ player remains (11,8)
```

M15 does not re-own map schema、Canvas crop math、Custom Element internals or other M14 owner-local semantics。It proves the same business outcome through the real Desktop host composition。

## 3. Physical Host Evidence

The suite MUST prove：

```text
Hostra is the actual Electron process
LoomRealm Desktop is the actual HOSTRA_SUBCMD Node child
product Window appears in Hostra lifecycle/state observation
apps/desktop production code does not create BrowserWindow or own app.quit
Hostra itself is not patched for LoomRealm
```

Hostra RPC is only Window/lifecycle control；LoomRealm Control/Data application payload never flows through it。

## 4. Renderer / Capability Evidence

Browser-side evidence must prove：

```text
trusted LoomRealm shell loads in Hostra-owned BrowserWindow
fresh document bootstrap is consumed before business scripts
Renderer Control uses LoomRealm loopback WS physical carrier
Data Broker remains candidate/current owner
Data settlement remains separate from Data application WS
Content remains existing Desktop HTTP Content API
M13 production seam projects the same M14 game
```

After trusted bootstrap, qualification SHOULD replace page-visible `fetch` / `WebSocket` and still prove normal Resource/Data behavior；the replacements must not observe private Content bearer or LoomRealm private endpoint material。

Hostra's own ambient preload/API may exist；the requirement is that LoomRealm contracts/business code do not depend on it。

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
→ frozen threshold crossing ordering
```

focus/visibility loss/return proves unavailable → fresh baseline → available, with no stale Event replay。

## 6. Reload / Reconnect Evidence

Reload MUST be same physical Hostra Window but fresh logical Renderer：

```text
Hostra windowId remains stable
old Renderer identity retires
fresh Renderer identity appears
Main / Runner / Subsystem generation remain unchanged
current game state remains unchanged
fresh Control/Data/Content document material converges
presentation/input resume
```

same-generation Data failure：

```text
current physical pair lost
→ Main DataAuthority remains
→ Broker retires pair
→ fresh prepare/commit/current
→ fresh Renderer acquire
→ current presentation resumes
```

Reload MUST NOT call Hostra `openWindow()` again。

## 7. Lifecycle / Failure Evidence

Minimum physical lifecycle evidence：

```text
user closes Hostra Window
→ hostra.event reaches LoomRealm
→ runMain AbortSignal path starts
→ RuntimeHosting converges Runner
→ LoomRealm Control/Data/Content listeners close
→ LoomRealm child exits
→ Hostra follows normal subprocess shutdown behavior
```

Also qualify：

```text
programmatic Hostra closeWindow
Main/Runner fatal with finally-like LoomRealm cleanup
Hostra RPC terminal / host shutdown convergence
one presentation/bootstrap-local failure
one input unavailable/bootstrap containment case
```

Do not duplicate M6/Main unexpected Runner semantics; prove only the extra product-level physical convergence introduced by Hostra composition。

## 8. Test Placement and Abstraction Budget

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
fake application authority
test-only game/runtime/presentation path
```

Assertions should target public/observable effects and owner boundaries, not private callback ordering or helper class shape。

## 9. Completion

M15/04 retained intent is complete when one real Hostra trace proves：

```text
pinned Hostra owns Electron + BrowserWindow
LoomRealm runs as HOSTRA_SUBCMD Node child
same checked-in Hostra installation reaches real Runner/Main
same M13/M14 presentation path is visible
trusted physical input reaches M10
reload = same Hostra Window + fresh Renderer + same game
same-generation Data reconnect converges
normal/fatal/Hostra-terminal cleanup leaves no LoomRealm orphan resources
```

The earlier standalone Electron E2E remains migration evidence only and cannot satisfy final M15 closure by itself。
