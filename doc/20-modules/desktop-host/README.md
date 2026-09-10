# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content / M13 Web Presentation **Implemented + Qualified**；M14 **Implementation complete / requalification pending**；M15 **Implementation Frozen / Preimplementation Closed**  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../../decisions/0032-game-library-example-boundary.md)、[ADR 0033](../../decisions/0033-electron-hostra-run-as-node.md)  
> 最近复核：2026-09-11

Hostra Desktop只拥有 physical topology/composition；Main保留 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority，Subsystem/game library保留 business Render authority，Renderer保留 current replica与 Web projection mechanics。

---

## 1. Milestone Shape

```text
M6  Hostra PREPARE / Runner / Runtime Control         ✅
M9  Desktop Data Broker / child provisioning         ✅
M10 User Input                                       ✅
M11 Render Replication                               ✅
M12 Desktop Content                                  ✅
M13 Web Presentation                                 ✅ Closed
M14 Map Game Library + concrete example              ⚠️ implementation complete / requalification pending
M15 BrowserWindow/full Desktop E2E                   🔒 implementation frozen / ready
```

M15只完成真实 Desktop physical composition，不重新设计 M9–M14 logical/business ownership semantics。ADR 0033只修正首次 Electron consumer暴露出的 Hostra physical launch contradiction；Node-hosted Hostra与 application contracts不变。

---

## 2. Runtime PREPARE / Product Inputs

Hostra Runtime PREPARE继续：

```text
installation root
→ game.json
→ launch.hostra.json
→ game-launcher-hostra PREPARE
→ executable/security preflight
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Canonical M15 game是 checked-in `examples/essentials-v21.1` Hostra-ready installation。Web Presentation Config仍是独立 product startup input：

```text
presentation.json
→ Desktop-private acquisition
→ WebPresentationConfigV1 validation/preparation
```

Presentation Config不得进入 Game Entry、Hostra manifest、HostraLaunchPlan或 Main bootstrap。

### Electron-hosted Runner

M15 Desktop main process is Electron，but Hostra keeps its single process model：

```text
canonical Runner executable = process.execPath
current process = Electron main
→ Hostra synthesizes ELECTRON_RUN_AS_NODE=1 for Runner child only
→ same package-owned Hostra Runner entry
→ same ChildProcess supervision
→ same Runtime Control WebSocket
```

The supported Electron build MUST keep its `runAsNode` fuse enabled。Game/manifest cannot select another Node executable or control this environment value。Desktop does not add UtilityProcess、ElectronRuntimeHosting、ProcessManager or Runner registry。

---

## 3. Existing Physical Slices

### Data

M9 Desktop Data Broker继续唯一拥有 paired candidate/current lifecycle：

```text
Main committed Data authority
→ Desktop Data Broker
→ Runner provisioner + Renderer physical delivery
```

Data ticket/provisioning IPC不能作为 Content或 JS/CSS loader channel。

### Content

```text
successful Hostra PREPARE
→ readonly prepared Content view/service
→ Subsystem ContentClient
→ Renderer trusted/private ResourceClient
→ narrow PresentationResourceClient
```

Desktop不新增 Content authority，也不向 business WC暴露 path/token/origin/raw private client。

M15 BrowserWindow physical composition reuses this exact Content API on the same loopback origin as the app-owned shell；it does not add CORS/OPTIONS、preload fetch proxy or a second Content service semantics。

---

## 4. M15 Frozen BrowserWindow Boundary

BrowserWindow固定：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
webSecurity = true
```

BrowserWindow loads an app-owned shell from an exact loopback HTTP origin：

```text
http://127.0.0.1:<port>/...            app-private trusted shell
http://127.0.0.1:<same-port>/_lr/v1/... existing Desktop Content API
```

The same physical listener may dispatch exact app-shell routes beside the existing Content handler，but shell routes are not Content API routes and MUST NOT become an arbitrary static-filesystem server。

禁止通过下列方式解决浏览器同源问题：

```text
file:// shell
webSecurity=false
new CORS/OPTIONS Content semantics
preload Content proxy
custom privileged protocol solely as a bypass
```

Preload运行在 Electron isolated world，只负责 exact one-shot physical handoff；不得向 page Main World暴露 generic `ipcRenderer`、filesystem、shell、process或 service-manager API。

Execution-world placement固定：

```text
Electron isolated world
    preload: exact bootstrap handoff only

page Main World
    trusted LoomRealm Renderer entry
    Renderer holder / DOM RendererInputSource
    M13 bootstrap / WebProjector
    business Custom Elements loaded afterward
```

Trusted Renderer必须和 business Custom Elements处于同一 page Main World，确保 M13 `document/customElements` 与 structural receiver ABI是同一真实 browser realm；privileged Electron APIs则留在 isolated preload/main process。

---

## 5. Renderer Control / Private Bootstrap

Renderer Control的 Desktop physical realization固定：

```text
Electron main MessageChannelMain
→ transferable MessagePortMain
→ preload exact handoff
→ native DOM MessagePort in trusted Renderer
→ MessageCarrier
→ existing Renderer Control peer/holder
```

当前 Window的一次性 bootstrap material仅允许：

```text
Renderer Control token + Control port
window-scoped Data handoff port
RendererContentAccess
WebPresentationConfigV1 candidate
```

Material由 trusted Renderer lexical/private state消费；不得发布到 `window/globalThis`。Business JS只能在该 handoff被消费后由 M13启动。

Because business code shares the Main World，trusted Renderer MUST capture/bind any later authority-bearing native primitive before loading business JS。At minimum：

```text
native fetch for private Content bearer requests
native WebSocket for private Data endpoint acquisition
transferred MessagePort objects/methods
M15/03 browser input primitives
```

Concrete adapters close over those primitives；Desktop does not create a BrowserPrimitiveRegistry/security service locator。

---

## 6. BrowserWindow Data Delivery

M9 current `DesktopRendererDataBinding`是 Node-side deterministic Renderer realization；M15不把它注入 BrowserWindow。

M15仅增加 concrete Window-side physical delivery：

```text
Desktop Broker prepares renderer WS endpoint
→ dedicated window Data handoff port
→ captured BrowserWindow native WebSocket
→ MessageCarrier
→ existing RendererDataBinding / RendererDataPeer
```

Dedicated handoff port只允许 physical settlement：

```text
prepare / prepared-or-failed / commit / revoke / close
```

Data application bytes只走 WebSocket，不走 Electron IPC/MessagePort。BrowserWindow不能提交 `rendererControlToken`创建 Data authorization；Broker继续依据 Main committed view决定 candidate是否 installable/current。

Same-generation loss继续使用既有 Broker replacement + fresh `RendererDataBinding.acquire()`；不新增 retry/recovery authority。

---

## 7. M13 Presentation Integration

M15 product code通过 trusted subpaths使用现有实现：

```text
@loomrealm/renderer/web-presentation
@loomrealm/renderer/resource-client
```

`web-presentation`只提升已存在的 M13 validation/preparation/bootstrap/attachment/WebProjector mechanics；它不是 business API，也不是新的 PresentationHost/Runtime。

Frozen flow：

```text
private presentation candidate
→ current prepared Content refs
→ private browser binding
→ trusted ResourceClient/native primitives captured
→ ordered business JS/CSS
→ window.onload
→ existing M13 Projector
→ business WC
```

Config bootstrap resource binding与 runtime `PresentationResourceClient`保持独立 capability boundary。

---

## 8. Physical Input

M15 BrowserWindow source直接实现既有 `RendererInputSource`：

```text
trusted KeyboardEvent.code
trusted PointerEvent
captured navigator.getGamepads()
        ↓
canonical RendererInputSourceChange
        ↓
existing M10 gate
```

Frozen physical choices由 `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md`拥有：Keyboard只接受 trusted标准 code；Pointer以 BrowserWindow content viewport归一化、使用不可复用 local id并按 `event.buttons` 前后差异生成 chorded-button transition；Gamepad只消费 `mapping="standard"`，使用 captured rAF采样和 frozen 500000 button threshold。

focus/visibility loss使 producer unavailable；恢复必须 fresh State → availability=true，无 Event replay。Synthetic Keyboard/Pointer events不得进入 M10。

---

## 9. Reload / Shutdown / Failure

Reload只替换 Renderer physical lifetime：

```text
Main / Runner / Subsystem stay live
→ old Window/ports/resource capability/primitive closure retire
→ fresh same-origin BrowserWindow + fresh bootstrap
→ existing Main Renderer currentness replaces participant
→ current Data/Render presentation resumes
```

Normal shutdown固定：

```text
retire current Window
→ abort signal passed to runMain(...)
→ await Main settlement
→ existing Main/RuntimeHosting converges Runner termination
→ close remaining Broker/Content/shell physical services
→ Electron exit
```

Desktop不建立第二份 Runner termination policy。

Failure containment：presentation/bootstrap/input failure保持 Window-local；Data carrier loss不等于 DataAuthority removal；Renderer failure不隐式 fail Runtime/Frame；Runner terminal继续使用 existing RuntimeHosting/Main semantics。

---

## 10. Game Consumer Placement

```text
game-libs/map
    reusable @loomrealm-game/map

examples/essentials-v21.1
    concrete Hostra-ready private game

apps/desktop
    physical Hostra/Electron host
```

Game library/example不得依赖 `apps/desktop`、Electron或 Renderer internals。Desktop runtime不得直接调用 importer/tooling或读取 third-party source corpus path。

---

## 11. Qualification Placement

M14正式状态只以 `doc/30-implementation/m14-qualification.md`为准；当前 implementation complete / requalification pending。M15可以实施，但 formal M15 closure必须等待 M14 formal closure。

M15 qualification覆盖：

```text
Hostra-ready checked-in game
Electron process.execPath + run-as-node real Hostra child
existing Runtime Control ready/termination
same-origin 127.0.0.1 shell + Content API
secure BrowserWindow + execution-world isolation
one-shot bootstrap + trusted native primitive capture
Renderer Control MessagePort
Browser-native Data WebSocket
Desktop Content
real trusted DOM Keyboard/Pointer/Gamepad source
M13 presentation
reload / same-generation reconnect / shutdown
full business-visible M14 trace
```

M15不得重新测试或重写 M6/M10–M14 owner-local semantics。It only adds the real Electron physical evidence that earlier owner-local qualification did not possess。

---

## 12. Final Invariants

1. Hostra Launcher只拥有 Runtime executable PREPARE；presentation startup独立；
2. Electron-hosted Hostra keeps `process.execPath` and uses host-owned run-as-node mode rather than a second Runtime path；
3. Main不接收 path/token/presentation config；
4. BrowserWindow security preferences、same-origin shell/Content placement与 execution-world placement已冻结；
5. preload只做 exact private handoff，不提供 generic Electron API；
6. trusted Renderer在 business bootstrap前捕获 authority-bearing browser primitives；
7. Control、Data settlement、Data application、Content保持分离；
8. M9 Broker仍是 Desktop Data candidate/current owner；
9. trusted Renderer/Main-World Projector不建立第二份 authority；
10. Business WC只消费 structural presentation ABI与 narrow resource capability；
11. reusable game library/concrete game不被吸收到 `apps/desktop`；
12. Desktop不建立 component registry、AssetManager、dynamic loader、global layer manager、InputDeviceManager、BrowserPrimitiveRegistry、generic host/manager或 recovery state machine。

M15 implementation现在可以直接依据根目录 `M15_01`–`M15_05`推进；除真实 correctness/security/platform contradiction外，不再进行 design reopen。
