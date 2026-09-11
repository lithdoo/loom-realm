# M15 Hostra Desktop Recomposition Plan

> 状态：**M15 physical composition reopened / this plan is the current physical SSOT and frozen for execution**  
> 目标：把当前 standalone Electron M15 改造成真正由 Hostra 承载的 Desktop product  
> 范围：只重做 M15 physical composition；M10–M14 logical/business contracts 不 reopen  
> Hostra：`lithdoo/hostra`，保持既有 Electron / preload / RPC / subprocess 运行模型，不为 LoomRealm 定制 Hostra

---

## 1. Why Recomposition Is Required

当前 M15 已证明 Main、Runner、Data、Content、Renderer、Input、M13 Presentation 与 M14 Map Game 能在真实 Electron BrowserWindow 中完整工作，但当前 product path 是：

```text
LoomRealm Desktop
├─ imports Electron
├─ owns Electron app
├─ creates BrowserWindow
├─ owns MessageChannelMain / preload bootstrap
└─ @loomrealm/game-launcher-hostra
    └─ Node Subsystem Runner
```

这不是 Hostra product composition。

真正的目标是：

```text
Hostra
├─ Electron app
├─ BrowserWindow owner
├─ WebSocket JSON-RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
```

因此本次纠偏只替换最外层 physical owner。当前 standalone Electron E2E 保留为迁移回归证据，但不再拥有最终 M15 closure claim。

---

## 2. Supersession / SSOT

从本计划落地起，**M15 physical composition 只以本文为当前 SSOT**。旧 `M15_01`–`M15_05` 仍保留已经验证过的 logical/business/lifecycle intent，但其中 direct-Electron realization 不再是当前冻结设计。

| 原文档 | 继续有效 | 被本文 supersede |
| --- | --- | --- |
| `M15_01_DESKTOP_PRODUCT_COMPOSITION.md` | Main/Broker/Content ownership、Hostra-ready installation、无 shadow authority | Electron app ownership、BrowserWindow ownership、Electron-main run-as-node product topology |
| `M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md` | Renderer/M13 seam、Control/Data/Content capability separation、trusted primitive capture intent | `MessageChannelMain`、LoomRealm preload、direct BrowserWindow configuration/ownership |
| `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md` | DOM input canonical mapping、reload/reconnect logical semantics、single cancellation owner | Electron app/window shutdown mechanics |
| `M15_04_DESKTOP_FULL_E2E_VERTICAL.md` | M14 gameplay outcome、real physical input/reload/reconnect evidence intent | direct-Electron canonical E2E topology |
| `M15_05_QUALIFICATION_CLOSURE.md` | M14 formal prerequisite、single `test:m15` closure gate、boundary discipline | direct-Electron qualification subject |

如果本文与旧 M15 文档在 physical topology、Electron ownership、Renderer bootstrap transport 或 canonical E2E host 上冲突，以本文为准。

---

## 3. Non-negotiable Boundaries

### 3.1 Hostra stays unchanged

M15 不要求 Hostra 增加 LoomRealm-specific Window profile，也不要求修改 Hostra preload、`window.open` policy、RPC wire、subprocess semantics 或 BrowserWindow defaults。

```text
Hostra implementation policy    → Hostra owns
LoomRealm application semantics → LoomRealm owns
```

Hostra 的 ambient `window.electronAPI` 属于 Hostra runtime environment。LoomRealm 只保证自己的 Runtime/Renderer/business contracts 不依赖它。

### 3.2 M10–M14 stay frozen

不得因为 transport 迁移而重写：

```text
Main Session / Runtime / Frame authority
Renderer Control logical protocol
DataAuthority / Data profile semantics
M9 Broker candidate/currentness
M10 Input semantics
M11 Render replication/store
M12 Content API semantics
M13 Web Presentation semantics
M14 map/game business runtime
```

### 3.3 Hostra RPC is host control, not a LoomRealm bus

Production LoomRealm 只消费 Hostra 已存在的 host operations：

```text
openWindow
closeWindow
hostra.event
```

`getHostState` / `getAllWindows` 可用于 qualification、diagnostics 和 assertions，但不得成为新的 LoomRealm authority、startup handshake 或 currentness source。

Hostra RPC 不承载：

```text
Renderer Control application messages
Data settlement/application messages
Render/Input protocol
Content bytes
Main/Subsystem business state
```

### 3.4 No new generic hosting framework

禁止仅为本次迁移引入：

```text
IHostraClient / HostraClientPort
HostraManager / HostraSession
DesktopHostFramework
WindowRegistry / WindowLifecycleManager
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry
RecoveryManager
BrowserPrimitiveRegistry
HostraPlatformPort
```

Hostra 目前只有 Desktop 一个真实 consumer；adapter 留在 `apps/desktop`。

---

## 4. Target Topology and Authority

```text
Hostra process
├─ Electron app
├─ Hostra preload / ambient API
├─ JSON-RPC server
├─ BrowserWindow owner
├─ optional CDP endpoint
│
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop process (plain Node)
├─ concrete Hostra RPC adapter
├─ Main
├─ RuntimeHosting
│   └─ Node Runner
│       └─ Subsystem / @loomrealm-game/map
├─ DesktopDataConnectionBroker
├─ Desktop Content + trusted shell listener
├─ Renderer Control loopback WS realization
└─ Renderer Data settlement loopback WS realization

Hostra BrowserWindow
└─ LoomRealm trusted shell
    ├─ Renderer Control WS
    ├─ Data settlement WS
    ├─ existing Data application WS
    ├─ Content HTTP
    ├─ M13 Web Presentation
    └─ M14 business Custom Elements
```

Authority remains：

```text
Hostra             physical desktop/window/direct-subprocess authority
LoomRealm Desktop  LoomRealm physical service composition only
Main               Session / Runtime / Frame / Renderer currentness / DataAuthority
Renderer           replica / presentation / physical input producer
Subsystem/game     business state / Render authority
```

---

## 5. Minimal Implementation Budget

The correction should add only concrete production pieces with immediate consumers. Conceptually the budget is：

```text
apps/desktop/src/hostra-rpc-client.ts
    concrete connect/call/event adapter; no architectural interface required

apps/desktop/src/renderer-control-ws.ts
    RendererControlBinding physical WS realization

existing window-data-binding.ts or one replacement file
    same settlement semantics over WS

small document bootstrap state inside product/content composition
    single product Window only; no manager/state-machine hierarchy
```

The implementation MAY reuse one physical loopback listener for shell/Content/Control/settlement upgrades or use multiple tiny listeners if that is materially simpler. The frozen requirement is **capability/wire separation**, not a mandatory Server-class topology。

Do not create a generic WebSocket transport package or shared endpoint registry without a second real consumer。

---

## 6. Desktop Becomes a Plain Node Product

Current：

```text
apps/desktop/src/main-entry.ts
→ import Electron app
→ app.whenReady()
→ app.quit()
```

Target：

```text
Hostra HOSTRA_SUBCMD
→ node apps/desktop/dist/main-entry.js
```

After migration, production `apps/desktop/src` MUST NOT own Electron primitives：

```text
from "electron"
require("electron")
BrowserWindow
MessageChannelMain
MessagePortMain
ipcMain / ipcRenderer
app.quit()
```

`apps/desktop/package.json` MUST NOT require Electron to run the LoomRealm Desktop process。

Canonical qualification pins an exact Hostra release/source identity; no `latest` qualification. At plan time the observed package is `hostra@1.0.1-beta.1`; changing the pin creates a new Desktop qualification subject。

Hostra may be installed by product/qualification tooling, but LoomRealm application source does not import Hostra internals as an in-process library。

---

## 7. Thin Hostra RPC Adapter

A concrete module, for example `hostra-rpc-client.ts`, may expose functions/one returned object such as：

```ts
const hostra = await connectHostraRpc({ port, token });
await hostra.openWindow(...);
hostra.onEvent(...);
await hostra.closeWindow(...);
await hostra.close();
```

No separate `IHostraClient`/port/factory abstraction is required。

Connection material comes from inherited：

```text
HOSTRA_RPC_PORT
HOSTRA_RPC_TOKEN
```

Rules：

1. connect loopback only；
2. token is Hostra RPC credential only；
3. request ids are client-local correlation；
4. unsolicited `hostra.event` is separated from request responses；
5. RPC terminal is product-terminal in M15；do not add Hostra reconnect/recovery authority；
6. Hostra RPC types do not leak into `@loomrealm/main`、`platform-ports`、Renderer or game packages。

`getHostState()` / `getAllWindows()` belong to qualification/diagnostics unless a concrete production need is later demonstrated。

---

## 8. Startup and Window Correlation

Canonical startup：

```text
Hostra starts and exposes RPC
→ Hostra starts HOSTRA_SUBCMD
→ LoomRealm Desktop reads inherited HOSTRA_* env
→ connect Hostra RPC
→ Hostra game PREPARE
→ start Content/shell + Control/Data physical endpoints
→ runMain(...)
→ Main arms Renderer Control acquire
→ mint caller-provided opaque Hostra Window correlation id
→ mint stable high-entropy shell route secret
→ Hostra RPC openWindow({ id, loadUrl })
→ Hostra creates BrowserWindow
→ document requests LoomRealm shell
→ fresh Renderer bootstrap
→ Renderer Control/Data connect
→ M13 presentation
→ M14 game visible
```

The caller-provided `windowId` is **correlation, not LoomRealm authority**. Pre-minting it makes RPC response / `window.created` event ordering irrelevant。

The shell URL remains stable across reload and includes one random route capability, conceptually：

```text
http://127.0.0.1:<loom-port>/_lr/window/<random-route-secret>
```

The route secret is only a random string used to guard this product Window's bootstrap route. Do not promote it into a WindowAuthority/Lease/Credential object model。

---

## 9. Renderer Control: MessagePort → One-shot WS Capability

Current physical path：

```text
RendererControlBinding.acquire(token)
→ ElectronRendererControlBinding
→ MessageChannelMain
→ preload/native MessagePort
```

Target：

```text
RendererControlBinding.acquire(token)
→ concrete Desktop WS binding
→ document bootstrap receives fresh one-shot WS endpoint
→ trusted Renderer connects
→ endpoint is consumed
→ WS MessageCarrier resolves acquire(token)
```

The unguessable endpoint itself is the physical capability；do not add a parallel ticket object/store unless platform behavior proves it necessary。

Required invariants：

```text
existing RendererControlBinding contract unchanged
0..1 pending acquire bound preserved
fresh endpoint per document/candidate
successful handoff consumes endpoint
stale/duplicate connection cannot restore old Renderer
reload creates fresh logical Renderer participant
no Control payload passes through Hostra RPC
```

---

## 10. Trusted Shell / Document Bootstrap

LoomRealm preload transfer disappears because Hostra owns the BrowserWindow and its own preload。LoomRealm reuses/extends its exact bounded loopback shell handling; it MUST NOT become a generic filesystem/static-file server。

For one Hostra Window：

```text
Hostra windowId        stable physical correlation
shell route secret     stable high-entropy route capability
RendererControl token  fresh logical participant material
Control WS endpoint    fresh physical one-shot capability
Data settlement endpoint fresh document physical capability
Content grant          fresh document capability
```

Every main-document request to the stable shell route：

```text
retire previous document-local LoomRealm grants/carriers if still present
→ bind fresh pending Renderer Control candidate
→ mint fresh document material
→ return trusted shell + renderer.js
```

Trusted `renderer.js` consumes bootstrap before M13 loads business scripts, captures the required native `fetch` / `WebSocket` / input primitives, and removes or invalidates bootstrap material as soon as practical。

Bootstrap MUST NOT contain Hostra RPC credentials/endpoints for business use、filesystem paths、Runner bootstrap material、Main private state or DataAuthority policy。

Hostra's own preload/ambient API remains unchanged and is not a LoomRealm capability source。

Single-window M15 should keep document lifetime as small composition state (grant/carrier/abort handles). Do not introduce `DocumentManager`、`WindowSession`、`BootstrapCoordinator` or a product Window state-machine hierarchy。

---

## 11. Data: Preserve M9, Replace Settlement Transport Only

`DesktopDataConnectionBroker` remains the only Desktop Data candidate/current owner。

Current：

```text
Broker
→ WindowRendererDataSettlement
→ Electron MessagePort
→ browser RendererDataBinding
→ Data application WS
```

Target：

```text
Broker
→ one concrete WS settlement realization
→ browser RendererDataBinding
→ existing Data application WS
```

Settlement remains physically narrow：

```text
prepare
prepared-or-failed
commit
revoke
close
```

Do not merge settlement and application Data. Do not preserve Electron and WS realizations merely to create a transport hierarchy；once the Hostra vertical qualifies, remove dead Electron-only settlement code。

M9 semantics remain exactly：

```text
Broker chooses pending/current
Runner provisioner prepares/commits runner side
Renderer settlement prepares/commits renderer side
same-generation physical loss retires current pair
fresh candidate converges
Main DataAuthority remains unchanged
```

No retry scheduler、rollback authority、ConnectionManager or second currentness model。

---

## 12. Content / Presentation / Input

Change as little as possible。

Keep：

```text
prepared Hostra installation view
Desktop Content API
Subsystem ContentClient
Renderer ResourceClient
PresentationResourceClient
@loomrealm/renderer/web-presentation
prepareWebPresentationV1
bootstrapWebPresentation
attachRendererPresentation
WebProjector
current DOM RendererInputSource
```

Physical input remains：

```text
trusted KeyboardEvent
trusted PointerEvent
captured navigator.getGamepads()
→ existing RendererInputSource
→ existing M10 gate
```

The browser producer must not know whether the containing BrowserWindow is owned directly by Electron application code or by Hostra。

---

## 13. Reload / Shutdown / Failure

### Reload

```text
same Hostra Window W stays alive
Main / Runner / Subsystem / game state stay alive
old document D1 dies
→ old LoomRealm Control/Data/Content document material retires
→ old Renderer R1 retires
same shell URL reloads
→ fresh document D2
→ fresh Renderer R2
→ fresh Control/Data material
→ current projection/input resumes
```

Invariant：

```text
Hostra windowId stable
R1 != R2
Subsystem generation unchanged
current game state unchanged
reload does not call Hostra openWindow() again
```

### User closes Hostra Window

```text
hostra.event window.closed(windowId)
→ stop accepting fresh document activity
→ abort runMain signal
→ await Main settlement
→ existing RuntimeHosting converges Runner
→ ALWAYS close LoomRealm Control/Data/Content resources
→ close Hostra RPC adapter
→ LoomRealm Node process exits
→ Hostra observes HOSTRA_SUBCMD exit and follows its own normal shutdown
```

### Programmatic product close

```text
best-effort Hostra closeWindow(windowId)
→ same local cancellation/cleanup path
```

Close is idempotent and tolerates RPC/event ordering races。

### Main / Runner fatal

Preserve the original logical failure, but physical cleanup is `finally`-like：

```text
Main reject / Runner terminal
→ best-effort Hostra closeWindow
→ ALWAYS dispose LoomRealm-owned Control/Data/Content resources
→ process exits non-zero
```

A Main rejection must never skip Desktop physical cleanup。

### Hostra shutdown / RPC terminal

```text
host.shuttingDown or RPC terminal
→ abort Main
→ converge Runner
→ close LoomRealm services
→ exit
```

No reconnect to a fresh Hostra session in M15。

---

## 14. File Migration Map

| Current surface | Action |
| --- | --- |
| `apps/desktop/src/main-entry.ts` | rewrite as plain Node entry |
| `apps/desktop/src/product-composition.ts` | rewrite outer composition around Hostra RPC; retain Main/Broker/Content ownership |
| `apps/desktop/src/electron-renderer-control.ts` | replace with concrete loopback WS Renderer Control binding |
| `apps/desktop/src/preload.ts` | remove from LoomRealm product path |
| `apps/desktop/src/message-port-carrier.ts` | remove from M15 product path if no real consumer remains |
| `apps/desktop/src/window-data-binding.ts` | preserve settlement semantics; change physical realization to WS or replace with one concrete WS file |
| `apps/desktop/src/data-broker.ts` | preserve authority/currentness |
| `apps/desktop/src/data-websocket.ts` | preserve application Data semantics |
| `apps/desktop/src/browser-websocket-carrier.ts` | reuse where it directly fits |
| `apps/desktop/src/content-service.ts` | preserve Content semantics; add exact document bootstrap handling only |
| `apps/desktop/src/desktop-bootstrap.ts` | revise to document bootstrap shape |
| `apps/desktop/src/renderer-entry.ts` | preserve M13/Input/Data composition; replace MessagePort bootstrap/connect path |
| `apps/desktop/src/renderer-input-source.ts` | preserve |
| `apps/desktop/package.json` | remove LoomRealm Electron runtime/start path; keep only actual Node-product dependencies |

Do not delete the working direct-Electron vertical until the Hostra vertical displays the canonical M14 map；after replacement qualification, remove dead Electron-only production code instead of maintaining two paths。

---

## 15. Implementation Slices

### Slice 1 — Node product + Hostra RPC

Deliver plain Node entry + concrete RPC adapter + `openWindow/closeWindow/hostra.event`。Gate：Hostra launches LoomRealm through `HOSTRA_SUBCMD`; LoomRealm opens one inert trusted shell Window; production source owns no Electron primitive。

### Slice 2 — Renderer Control WS

Gate：real Main Renderer Control connects through the Hostra-owned Window with no Electron MessagePort。

### Slice 3 — Document bootstrap + M13/M14 visibility

Gate：Hostra Window loads existing M13 presentation and checked-in M14 map through the trusted shell without a LoomRealm preload bridge。

### Slice 4 — Data settlement WS

Gate：existing Broker `prepare/prepared/commit/revoke/current` semantics pass through the Hostra Window；same-generation reconnect works。

### Slice 5 — Physical input + reload

Gate：trusted ArrowRight still proves `(10,8) → (11,8)` and blocked `(12,8)`；reload keeps Hostra `windowId`, replaces Renderer identity, preserves Main/Runner/game state, reconnects Data and resumes presentation/input。

### Slice 6 — Lifecycle/failure convergence

Gate：user close、programmatic close、Main fatal、Runner fatal、Hostra shutdown/RPC terminal all converge with no orphan Runner、LoomRealm listener/socket or child process。

### Slice 7 — Qualification replacement + legacy removal

Only after the Hostra vertical passes, remove dead Electron ownership/dependency and replace direct-Electron M15 closure evidence with Hostra evidence。

---

## 16. Canonical Qualification and Closure

Final M15 product qualification MUST start at Hostra：

```text
qualification harness
→ launch pinned Hostra
   HOSTRA_RPC_PORT=<controlled/ephemeral>
   HOSTRA_RPC_TOKEN=<fresh>
   HOSTRA_CDP_PORT=0
   HOSTRA_SUBCMD="node .../apps/desktop/dist/main-entry.js"
→ observe hostra.ready
→ Hostra starts LoomRealm child
→ LoomRealm RPC openWindow
→ qualification observes Hostra window.created / getHostState or getAllWindows
→ Playwright connects to Hostra CDP
→ select Hostra-owned LoomRealm page
```

`getHostState/getAllWindows` here are observation only, not production authority。

Required evidence：

```text
Hostra is actual Electron process
LoomRealm is actual HOSTRA_SUBCMD Node child
Window is Hostra-owned
canonical M14 map visible
trusted Keyboard/Pointer/Gamepad path remains valid
ArrowRight move + blocked move
reload: same Hostra windowId + fresh Renderer identity
same-generation Data replacement
presentation/current truth resumes
user close reaches LoomRealm lifecycle
Main/Runner/Control/Data/Content converge
LoomRealm child terminates
Hostra converges according to its normal model
former LoomRealm loopback ports refuse connections
```

Boundary gate MUST reject：

```text
apps/desktop production source importing Electron
apps/desktop creating BrowserWindow or owning app.quit
Hostra RPC carrying LoomRealm Control/Data application payload
Hostra types leaking into platform-ports/Main/Renderer/game packages
second Data currentness/recovery owner
generic Hostra/Window/Document/Connection manager abstraction
canonical M15 gate launching Electron directly instead of Hostra
Hostra source/runtime patched by LoomRealm qualification
```

Formal closure remains：

```text
M14 formally Closed
+ pinned Hostra identity recorded
+ npm run test:m15 repeatably PASS in supported CI
+ Hostra-owned full Desktop E2E/lifecycle evidence PASS
→ M15 Closed
```

No new ADR/package/framework is required unless implementation discovers a real contract contradiction rather than a private implementation inconvenience。
