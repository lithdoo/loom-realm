# M15 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：05  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md) → [M15 / 04](M15_04_DESKTOP_FULL_E2E_VERTICAL.md)  
> 依赖：[Testing Strategy](doc/30-implementation/testing-strategy.md)、[M14 qualification](doc/30-implementation/m14-qualification.md)  
> 目标：定义唯一 M15 closure scope；实施只补真实 Desktop physical evidence，不以 E2E 名义扩张架构。

> **M15 closure = 同一 M14 logical game 通过真实 Hostra PREPARE、Node child、Desktop Data/Content、secure Electron BrowserWindow、真实 DOM input 与 M13 presentation 完成可重复的 startup → input → reload/reconnect → shutdown trace。**

---

## 1. Formal Prerequisite

M15 implementation MAY proceed while M14 hosted requalification is still pending；但 M15 formal closure REQUIRES M14 formal closure。

因此不得出现：

```text
M14 = not formally closed
M15 = formally closed
```

M15 qualification subject必须在当前 tree重新通过 `npm run test:m14`；M15 final PASS/Closed claim还要求 `doc/30-implementation/m14-qualification.md` 已记录正式 closure。

## 2. Closure Scope

必须实现并证明：

```text
checked-in Hostra-ready M14 example installation
real Electron product entry
secure BrowserWindow preferences
one-shot isolated-preload → Main-World Renderer bootstrap
real BrowserWindow Renderer candidate/currentness
real Node Runner child
existing Runtime Control over dedicated MessagePort carrier
existing Desktop Data Broker authority/pairing
BrowserWindow-native Renderer Data acquisition over native WebSocket
existing Desktop Content service + private Renderer resource access
real DOM Keyboard/Pointer/Gamepad RendererInputSource
trusted production M13 Renderer presentation seam
same M14 game library/example
reload/replacement
same-generation Data reconnect
normal shutdown through runMain AbortSignal
Runner child termination
failure containment
```

M6/M10–M14 已关闭的 protocol/business semantics继续由原 qualification拥有；M15不复制第二套 conformance suite。

## 3. Frozen Physical Decisions

M15 implementation不得重新选择以下设计：

```text
BrowserWindow:
    nodeIntegration=false
    contextIsolation=true
    sandbox=true
    webSecurity=true

execution worlds:
    preload = Electron isolated world, exact handoff only
    trusted Renderer + M13 Projector = page Main World
    business JS = page Main World, loaded only after trusted bootstrap consumption

Renderer Control:
    Electron MessageChannelMain / MessagePortMain
    → native DOM MessagePort
    → existing MessageCarrier / Renderer Control

Renderer Data:
    existing Desktop Broker remains authority/candidate owner
    → dedicated window settlement port for prepare/commit/revoke only
    → native browser WebSocket carries Data application messages

physical input:
    KeyboardEvent.code → frozen KeyboardCodeV1
    PointerEvent → BrowserWindow viewport fixed-point mapping + one-shot local ids
    navigator.getGamepads() mapping="standard" → rAF sampling + frozen threshold events
```

这些是 concrete Desktop realization，不建立新的 cross-platform protocol或 application authority。

## 4. Abstraction Budget

M15可以增加 concrete physical adapters/functions，只要存在直接 production consumer。

允许的 shared change仅限现有 M13 mechanics 的最窄 trusted product import seam：

```text
@loomrealm/renderer/web-presentation
```

不得新增：

```text
DesktopRuntimeHost / MiniDesktopHost
WindowRegistry / ConnectionRegistry
GameManager / ServiceLocator
UniversalRendererHost
PresentationHost / PresentationRuntime
InputDeviceManager / generic input registry
RecoveryManager / retry framework
second Renderer currentness/projection model
Electron-specific Input/Render/Content application protocol
platform-owned game/component registry
```

Electron private bridge只承担 one-shot Renderer bootstrap 与 Control/Data physical handoff；不得演化为 universal IPC bus或第二条 application data plane。

若实施暴露出 frozen contract 的真实 correctness/security contradiction，修 nearest owner并建立新的 qualification subject；不得在 Desktop层补 shadow state。

## 5. Required Evidence

Closure至少包含：

```text
startup:
    checked-in Hostra installation
    → PREPARE → child → Main
    → secure BrowserWindow
    → one-shot private bootstrap
    → visible M14 map

security/world boundary:
    fixed BrowserWindow preferences
    → preload isolation preserved
    → no generic Electron/contextBridge API visible to business code
    → business bootstrap begins after private Renderer bootstrap consumption

input:
    real DOM ArrowRight → existing M10 → passable then blocked M14 outcome
    + focused Pointer/Gamepad production-source qualification
    + focus/visibility unavailable → fresh baseline → available

reload:
    fresh Renderer/ports/resource lifetime without game/session restart
    → current presentation restored

reconnect:
    same-generation Data carrier loss
    → authority retained
    → existing Broker prepare/commit + fresh acquire path resumes projection

shutdown:
    close/retire Window
    → abort runMain signal
    → await Main settlement / RuntimeHosting child convergence
    → close remaining Data/Content physical services
    → no live DOM listeners/rAF/ports/sockets/servers/Runner child

failure containment:
    input/presentation/Window-local failure does not mutate Main/Subsystem authority
```

Unexpected Runner failure semantics remain owned by existing Hostra/Main qualification；M15只证明真实 product shutdown能够通过现有 owner chain终止 child。

## 6. Canonical Gate

M15新增一个新的 historical milestone gate：

```text
npm run test:m15
```

它 MUST include the existing gate first：

```text
npm run test:m14
→ build/qualify Desktop product composition
→ M15 boundary + Electron E2E/lifecycle evidence
```

不得改变 `test:m14` 的含义。CI增加 dedicated M15 workflow，运行同一个 `test:m15` entry。

Formal closure evidence记录在：

```text
doc/30-implementation/m15-qualification.md
```

该 record，而不是本 planning/frozen landing file，拥有最终 PASS/Closed claim。

## 7. Boundary Checks

Qualification必须 mechanically reject至少：

```text
apps/desktop owning map/business source
canonical M15 test generating a replacement Hostra game/manifest
product code importing packages/renderer/dist/internal/*
business WC importing Desktop/Renderer private authority
presentation config entering Hostra/Main bootstrap
BrowserWindow receiving Node-only DesktopRendererDataBinding
business page seeing generic ipcRenderer/contextBridge Electron API
trusted Projector placed in an isolated world that cannot use the same business Custom Element ABI
Data application messages routed through Electron settlement IPC
BrowserWindow presenting rendererControlToken as Data authorization
Desktop direct Store/Main mutation
Desktop directly owning a second Runner termination policy
new generic host/manager/registry/recovery abstraction introduced only for E2E
```

## 8. Frozen Reopen Rule

Implementation可以自由选择 private function/class/file names、bounded queue constants和无业务语义的 callback组织，但不得改变本组文档已冻结的：

```text
authority owner
process/window topology
execution-world placement
Control/Data/Content capability separation
Data candidate/currentness semantics
DOM input canonical mapping
reload/reconnect/shutdown owner chain
qualification ownership
```

只有 implementation发现真实 correctness/security contradiction、existing formal contract conflict或不可实现的 platform constraint时才允许 reopen设计；单纯代码便利性、测试便利性或“未来可能复用”不足以 reopen。

## 9. Closure Condition

M15 can be marked Closed only when：

```text
M14 formal status = Closed
npm run test:m15 = repeatable PASS in supported CI
all M15 production physical/security/input/lifecycle/failure evidence = PASS
```

No new ADR is required unless implementation changes an already-frozen architecture/contract boundary。
