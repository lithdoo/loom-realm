# M15 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：05  
> 最近复核：2026-09-11  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md) → [M15 / 04](M15_04_DESKTOP_FULL_E2E_VERTICAL.md)  
> 依赖：[Testing Strategy](doc/30-implementation/testing-strategy.md)、[M14 qualification](doc/30-implementation/m14-qualification.md)、[ADR 0033](doc/decisions/0033-electron-hostra-run-as-node.md)  
> 目标：定义唯一 M15 closure scope；实施只补真实 Desktop physical evidence，不以 E2E 名义扩张架构。

> **M15 closure = 同一 M14 logical game 通过真实 Hostra PREPARE、Electron-hosted Node-mode child、Desktop Data/Content、secure same-origin Electron BrowserWindow、真实 DOM input 与 M13 presentation 完成可重复的 startup → input → reload/reconnect → shutdown trace。**

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
Hostra process.execPath Runner started with Electron run-as-node mode
existing Hostra Runtime Control over its existing WebSocket carrier
secure BrowserWindow preferences
same exact 127.0.0.1 origin for app shell + existing Content API
one-shot isolated-preload → Main-World Renderer bootstrap
trusted browser primitive capture before business scripts
real BrowserWindow Renderer candidate/currentness
real existing Hostra Runner child
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

M6、M10–M13 已正式关闭的 protocol/business semantics继续由原 qualification拥有；M14 frozen implementation/business semantics继续由 M14 landing docs/qualification subject拥有，formal status仍以 `m14-qualification.md` 为准。M15不复制第二套 conformance suite。

ADR 0033 is the sole M15-triggered Hostra physical correction：it keeps the same Runner executable selection and owner chain，and only specifies how the Electron composition enters that executable in Node mode。

## 3. Frozen Physical Decisions

M15 implementation不得重新选择以下设计：

```text
Hostra Runner under Electron:
    executable = canonical process.execPath
    Hostra synthesizes ELECTRON_RUN_AS_NODE=1 for Runner child only
    supported Electron build keeps runAsNode fuse enabled
    same existing Hostra RuntimeHosting / ChildProcess / Runtime Control WebSocket

BrowserWindow:
    nodeIntegration=false
    contextIsolation=true
    sandbox=true
    webSecurity=true

Desktop browser origin:
    app-owned shell and existing /_lr/v1 Content API
    share exact http://127.0.0.1:<port> origin
    shell routes remain product-private and exact
    no file:// / CORS extension / Content preload proxy

execution worlds:
    preload = Electron isolated world, exact handoff only
    trusted Renderer + M13 Projector = page Main World
    business JS = page Main World, loaded only after trusted bootstrap consumption

bootstrap timing:
    app-owned shell did-finish-load
    → exactly one private handoff attempt for that document
    → capture/bind authority-bearing native browser primitives
    → stale document/ports retire instead of retrying old material

trusted browser primitives:
    private Content reads use pre-business captured native fetch/URL mechanics
    private Data endpoints use pre-business captured native WebSocket
    transferred MessagePorts remain lexical/private
    M15/03 input primitives are captured/installed before business can replace them

Runtime Control:
    existing Hostra Node Runner WebSocket carrier remains unchanged

Renderer Control:
    Electron MessageChannelMain / MessagePortMain
    → native DOM MessagePort
    → existing MessageCarrier / Renderer Control

Renderer Data:
    existing Desktop Broker remains authority/candidate owner
    → dedicated window settlement port for prepare/commit/revoke only
    → native browser WebSocket carries Data application messages

physical input:
    trusted KeyboardEvent.code → frozen KeyboardCodeV1
    trusted PointerEvent → BrowserWindow viewport mapping + buttons-set transitions + one-shot local ids
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
BrowserPrimitiveRegistry / security service locator
LocalWebServer framework / generic static-file host
RecoveryManager / retry framework
second Renderer currentness/projection model
Electron-specific Input/Render/Content application protocol
platform-owned game/component registry
alternate Electron UtilityProcess Runtime path
configurable Node executable framework
```

The same-origin listener may contain small concrete app-shell route handling beside the existing Content API handler。That is physical composition，not a new Content protocol/service abstraction。

Electron private bridge只承担 one-shot Renderer bootstrap 与 Control/Data physical handoff；不得演化为 universal IPC bus或第二条 application data plane。

若实施暴露出 frozen contract 的真实 correctness/security contradiction，修 nearest owner并建立新的 qualification subject；不得在 Desktop层补 shadow state。

## 5. Required Evidence

Closure至少包含：

```text
startup:
    checked-in Hostra installation
    → PREPARE in Electron main
    → process.execPath + ELECTRON_RUN_AS_NODE child
    → existing Runtime Control ready
    → secure BrowserWindow
    → same-origin shell + Content API
    → did-finish-load → one-shot private bootstrap
    → visible M14 map

security/world boundary:
    fixed BrowserWindow preferences
    → preload isolation preserved
    → no generic Electron/contextBridge API visible to business code
    → shell/Content exact same origin; no CORS/OPTIONS escape hatch
    → business bootstrap begins after private Renderer bootstrap + primitive capture
    → post-bootstrap replacement of page fetch/WebSocket cannot observe private bearer/endpoint/ports

input:
    trusted real DOM ArrowRight → existing M10 → passable then blocked M14 outcome
    + synthetic Keyboard/Pointer dispatch ignored
    + focused Pointer chorded-button / Gamepad production-source qualification
    + focus/visibility unavailable → fresh baseline → available

reload:
    fresh Renderer/ports/resource/primitive lifetime without game/session restart
    → current presentation restored

reconnect:
    same-generation Data carrier loss
    → authority retained
    → existing Broker prepare/commit + fresh acquire path resumes projection

shutdown:
    close/retire Window
    → abort runMain signal
    → await Main settlement / RuntimeHosting child convergence
    → close remaining Data/Content/shell physical services
    → no live DOM listeners/rAF/ports/sockets/servers/Runner child

failure containment:
    synthetic/input/presentation/Window-local failure does not mutate Main/Subsystem authority
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
→ verify supported Electron runAsNode build capability
→ M15 boundary + Electron E2E/lifecycle evidence
```

不得改变 `test:m14` 的含义。CI增加 dedicated M15 workflow，运行同一个 `test:m15` entry。

Formal closure evidence记录在：

```text
doc/30-implementation/m15-qualification.md
```

该 record，而不是本 frozen landing file，拥有最终 PASS/Closed claim。

## 7. Boundary Checks

Qualification必须 mechanically reject至少：

```text
apps/desktop owning map/business source
canonical M15 test generating a replacement Hostra game/manifest
launch.hostra.json selecting Node executable / ELECTRON_RUN_AS_NODE
alternate Electron RuntimeHosting/UtilityProcess path for the same Hostra Runner
supported Desktop build disabling runAsNode while claiming M15 qualification
product code importing packages/renderer/dist/internal/*
business WC importing Desktop/Renderer private authority
presentation config entering Hostra/Main bootstrap
BrowserWindow receiving Node-only DesktopRendererDataBinding
BrowserWindow shell using file:// or a different origin from Desktop Content API
Content API expanded with CORS/OPTIONS only to satisfy BrowserWindow composition
business page seeing generic ipcRenderer/contextBridge Electron API
bootstrap material sent before trusted shell did-finish-load
trusted Projector placed in an isolated world that cannot use the same business Custom Element ABI
private Resource/Data adapter dynamically using business-replaceable fetch/WebSocket globals after bootstrap
Data application messages routed through Electron settlement IPC
Runtime Control incorrectly replaced by Desktop Renderer MessagePort
BrowserWindow presenting rendererControlToken as Data authorization
synthetic Keyboard/Pointer DOM events entering RendererInputSource
Desktop direct Store/Main mutation
Desktop directly owning a second Runner termination policy
new generic host/manager/registry/recovery/security/static-server abstraction introduced only for E2E
```

## 8. Frozen Reopen Rule

Implementation可以自由选择 private function/class/file names、exact app-shell path spelling、bounded queue constants和无业务语义的 callback组织，但不得改变本组文档已冻结的：

```text
authority owner
process/window topology
Electron-hosted Hostra run-as-node realization
same-origin shell/Content boundary
execution-world placement
trusted primitive capture before business bootstrap
Runtime Control / Renderer Control physical distinction
Control/Data/Content capability separation
Data candidate/currentness semantics
DOM input canonical mapping and physical provenance
reload/reconnect/shutdown owner chain
qualification ownership
```

只有 implementation发现真实 correctness/security contradiction、existing formal contract conflict或不可实现的 platform constraint时才允许 reopen设计；单纯代码便利性、测试便利性或“未来可能复用”不足以 reopen。

## 9. Closure Condition

M15 can be marked Closed only when：

```text
M14 formal status = Closed
npm run test:m15 = repeatable PASS in supported CI
supported Electron build proves runAsNode Hostra child execution
all M15 production physical/security/input/lifecycle/failure evidence = PASS
```

No new ADR is required unless implementation changes an already-frozen architecture/contract boundary；ADR 0033 already records the only current frozen-owner correction discovered by the final Phase 1 consistency review。
