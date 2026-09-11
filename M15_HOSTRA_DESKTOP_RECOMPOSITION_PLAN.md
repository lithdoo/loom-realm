# M15 Hostra Desktop Recompositon Plan

> 状态：**Physical composition reopened / implementation plan frozen for execution**  
> 目标：把当前 standalone Electron M15 改造成真正由 Hostra 承载的 Desktop product  
> 范围：只重做 M15 physical composition；M10–M14 logical/business contracts 不 reopen  
> Hostra：`lithdoo/hostra`，保持其既有运行模型，不为 LoomRealm 修改 Window/preload/RPC semantics

---

## 1. Why This Recomposition Exists

当前 M15 已经证明：LoomRealm 的 Main、Runner、Data、Content、Renderer、Input、M13 Presentation、M14 Map Game 可以在真实 Electron BrowserWindow 中完整工作。

但当前 product path 是：

```text
LoomRealm Desktop
├─ import Electron
├─ own Electron app
├─ new BrowserWindow(...)
├─ MessageChannelMain / preload bootstrap
└─ @loomrealm/game-launcher-hostra
    └─ Node Subsystem Runner
```

这不是 Hostra product composition。

真正的 Hostra 是独立 Electron local shell：Hostra 自己拥有 Electron、BrowserWindow、RPC server 和直属 subprocess；业务进程通过 WebSocket JSON-RPC 调用 `openWindow` / `closeWindow` / `getHostState`，并消费 `hostra.event`。

因此 M15 需要纠正的不是 M10–M14，而是最外层 physical owner：

```text
WRONG
LoomRealm → Electron → BrowserWindow

TARGET
Hostra → Electron / BrowserWindow
   └─ HOSTRA_SUBCMD → LoomRealm Desktop Node process
```

当前 standalone Electron E2E 保留为历史/迁移证据，但不能作为最终 Hostra Desktop closure evidence。

---

## 2. Non-negotiable Boundaries

### 2.1 Hostra stays unchanged

M15 不要求 Hostra 为 LoomRealm 增加特殊 Window profile，也不要求删除 Hostra preload、改变 `window.open` 策略、改变 RPC wire、改变 subprocess semantics 或改变 BrowserWindow defaults。

Hostra 的 ambient API 属于 Hostra runtime environment；LoomRealm 只保证自己的 contracts/business code 不依赖它。

```text
Hostra implementation policy    → Hostra owns
LoomRealm application semantics → LoomRealm owns
```

### 2.2 M10–M14 stay frozen

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

允许改变的只是 Desktop physical realization。

### 2.3 Hostra RPC is not a LoomRealm application bus

Hostra RPC 只用于 Hostra 已拥有的 physical host operations：

```text
openWindow
closeWindow
getHostState
hostra.event
```

以下内容不得塞进 Hostra RPC：

```text
Renderer Control application messages
Data application bytes
Render/Input protocol
Content bytes
Main/Subsystem business state
M9 candidate application carrier
```

### 2.4 No new generic hosting framework

本次改造不得引入：

```text
HostraManager
DesktopHostFramework
WindowRegistry
ConnectionManager
RecoveryManager
TransportRegistry
BrowserPrimitiveRegistry
HostraPlatformPort
```

Hostra 目前只有 Desktop 一个真实 consumer。Hostra RPC client 留在 `apps/desktop`。

---

## 3. Target Process Topology

```text
Hostra process
├─ Electron app
├─ Hostra preload / ambient electronAPI
├─ WebSocket JSON-RPC server
├─ BrowserWindow owner
├─ optional CDP endpoint
│
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop process (plain Node)
├─ thin Hostra RPC client
├─ Hostra Window correlation
├─ Main
├─ RuntimeHosting
│   └─ Node Runner
│       └─ Subsystem / @loomrealm-game/map
├─ DesktopDataConnectionBroker
├─ Desktop Content/Shell service
├─ Renderer Control loopback WebSocket
└─ Renderer Data settlement loopback WebSocket

Hostra BrowserWindow
└─ LoomRealm shell URL
    ├─ trusted Renderer entry
    ├─ Renderer Control WS
    ├─ Data settlement WS
    ├─ Data application WS
    ├─ Content HTTP
    ├─ M13 Web Presentation
    └─ M14 business Custom Elements
```

Authority remains：

```text
Hostra
    physical desktop/window/direct-subprocess authority

LoomRealm Desktop
    LoomRealm physical service composition only

Main
    Session / Runtime / Frame / Renderer currentness / DataAuthority

Renderer
    replica / presentation / physical input producer

Subsystem / game library
    business state / Render authority
```

---

## 4. Startup Contract

Canonical product startup becomes：

```text
Hostra starts
→ Hostra RPC ready
→ Hostra starts HOSTRA_SUBCMD
→ LoomRealm Desktop reads inherited HOSTRA_* environment
→ connect Hostra RPC
→ getHostState() / establish host session
→ Hostra game PREPARE
→ start LoomRealm Content/Shell + Control/Data physical services
→ runMain(...)
→ mint LoomRealm-owned stable Window id + high-entropy shell capability
→ Hostra RPC openWindow({ id, loadUrl })
→ Hostra creates BrowserWindow
→ BrowserWindow requests LoomRealm shell
→ fresh Renderer document bootstrap
→ Renderer Control/Data connect
→ M13 presentation
→ M14 game visible
```

LoomRealm MUST use an explicit `openWindow.params.id` that it mints before the call. That id is the stable Hostra physical Window correlation id for one product Window lifetime.

The shell URL MUST be stable across reload but unguessable, for example conceptually：

```text
http://127.0.0.1:<loom-port>/_lr/window/<window-route-secret>
```

`window-route-secret` is not the Main Renderer identity and not a DataAuthority credential. It only binds requests to this Hostra physical Window route.

---

## 5. Thin Hostra RPC Client

Add one concrete Desktop-private client, e.g.：

```text
apps/desktop/src/hostra-rpc-client.ts
```

Minimum responsibility：

```ts
interface HostraRpcClient {
  openWindow(options: {
    id: string;
    title?: string;
    width?: number;
    height?: number;
    loadUrl: string;
    devTool?: boolean;
  }): Promise<string>;

  closeWindow(windowId: string): Promise<void>;
  getHostState(): Promise<unknown>;
  onEvent(listener: (event: HostraEvent) => void): () => void;
  close(): void;
}
```

Connection material comes from Hostra's inherited environment, primarily：

```text
HOSTRA_RPC_PORT
HOSTRA_RPC_TOKEN
```

Rules：

1. connect loopback only；
2. token is Hostra RPC credential only；
3. JSON-RPC request ids are client-local correlation；
4. unsolicited `hostra.event` is handled separately from request responses；
5. RPC connection loss is terminal for this Desktop process；do not build reconnect/recovery authority in M15；
6. no Hostra RPC types leak into `@loomrealm/main`、`platform-ports`、Renderer or game packages。

---

## 6. Desktop Becomes a Plain Node Product

Current Electron entry：

```text
apps/desktop/src/main-entry.ts
→ import { app } from "electron"
→ app.whenReady()
→ app.quit()
```

must become a normal Node entry：

```text
node apps/desktop/dist/main-entry.js
```

Hostra launches it through `HOSTRA_SUBCMD`。

After migration, production code under `apps/desktop/src` MUST NOT own Electron primitives：

```text
from "electron"
require("electron")
BrowserWindow
MessageChannelMain
MessagePortMain
ipcMain
ipcRenderer
app.quit()
```

`apps/desktop/package.json` MUST NOT require Electron to run the LoomRealm Desktop process。

The canonical Hostra version used for qualification MUST be pinned explicitly; do not qualify against an implicit `latest`. At plan time the current Hostra package is `hostra@1.0.1-beta.1`; implementation may advance the pin only as an explicit qualification-subject change。

Hostra may be installed by the product/qualification harness; LoomRealm application source MUST NOT import Hostra as an in-process library。

---

## 7. Renderer Control: MessagePort → Loopback WebSocket

Current physical Control path：

```text
Main RendererControlBinding.acquire(token)
→ ElectronRendererControlBinding
→ MessageChannelMain
→ preload/window transferred MessagePort
→ Browser MessageCarrier
```

Target：

```text
Main RendererControlBinding.acquire(token)
→ DesktopRendererControlBinding
→ pending logical Renderer candidate
→ document bootstrap mints one-shot Control WS ticket
→ trusted Renderer connects loopback WebSocket
→ ticket/token validated once
→ WebSocket MessageCarrier resolves acquire(token)
```

Required invariants：

1. Main's existing `RendererControlBinding` contract is unchanged；
2. one pending acquire remains bounded；
3. ticket is fresh, unguessable and one-shot；
4. successful WS handoff consumes the candidate；
5. document loss/WS close retires physical carrier；
6. stale/duplicate connection cannot restore an old Renderer；
7. Browser reload creates a fresh Renderer logical participant；
8. no Control application payload passes through Hostra RPC。

The new binding is a concrete Desktop adapter, not a generic WebSocket hosting package。

---

## 8. Window Shell / Document Bootstrap

Electron preload transfer is removed from LoomRealm because Hostra owns the BrowserWindow and its preload。

LoomRealm's existing Content listener is extended/reused for an exact trusted shell route. It MUST NOT become a generic static filesystem server。

For one stable Hostra Window：

```text
Hostra window id       = stable physical identity
shell route secret     = stable high-entropy route capability
Renderer Control token = fresh logical participant identity
Data settlement ticket = fresh document physical material
Content grant          = fresh document capability
```

On every main-document request：

```text
GET stable shell URL
→ retire previous document-local grants/settlement if still present
→ wait for / bind fresh pending Renderer Control candidate
→ mint fresh document bootstrap
→ return trusted shell + renderer.js
```

The trusted Renderer must be the first LoomRealm page script to consume bootstrap material. It captures authority-bearing browser primitives before M13 loads business scripts, then removes/invalidates bootstrap material as soon as practical。

Bootstrap contains only material required by the current document：

```text
Renderer Control token + WS endpoint/ticket
Data settlement WS endpoint/ticket
Renderer Content access
WebPresentationConfigV1 candidate
```

It MUST NOT contain：

```text
Hostra RPC token
Hostra RPC endpoint for business use
filesystem paths
Runner/bootstrap token
Main private state
DataAuthority policy
```

Hostra's own preload/`window.electronAPI` remains Hostra-owned ambient environment. LoomRealm does not depend on it and does not alter Hostra to remove it。

---

## 9. Data: Preserve M9, Replace Settlement Transport Only

`DesktopDataConnectionBroker` remains the only Desktop Data candidate/current owner。

Current BrowserWindow physical settlement：

```text
Desktop Broker
→ WindowRendererDataSettlement
→ Electron MessagePort
→ browser createWindowRendererDataBinding
→ application Data WebSocket
```

Target：

```text
Desktop Broker
→ BrowserRendererDataSettlement
→ dedicated loopback settlement WebSocket
→ browser RendererDataBinding
→ existing application Data WebSocket
```

Settlement wire remains narrowly physical：

```text
prepare
prepared-or-failed
commit
revoke
close
```

Do not merge settlement and application Data into one protocol。

M9 semantics stay exactly：

```text
Broker chooses candidate/current
Runner provisioner prepares/commits its side
Renderer settlement prepares/commits its side
same-generation physical loss retires current pair
fresh candidate converges
Main DataAuthority remains unchanged
```

No retry scheduler、rollback authority、ConnectionManager or second currentness model is introduced。

---

## 10. Content / Presentation / Input

These surfaces should change as little as possible。

### Content

Keep：

```text
prepared Hostra installation view
Desktop Content API
Subsystem ContentClient
Renderer ResourceClient
PresentationResourceClient
```

Only shell/document bootstrap routing changes physically。

### M13 Presentation

Keep：

```text
@loomrealm/renderer/web-presentation
prepareWebPresentationV1
bootstrapWebPresentation
attachRendererPresentation
WebProjector
```

No new PresentationHost abstraction。

### M15 physical input

Keep current browser producer：

```text
KeyboardEvent
PointerEvent
navigator.getGamepads()
→ RendererInputSource
→ existing M10 gate
```

Hostra's BrowserWindow is a real Chromium Renderer, so the input producer should not know whether Electron was owned directly or by Hostra。

---

## 11. Reload Semantics

Reload MUST distinguish physical Window identity from logical Renderer identity：

```text
Hostra Window W stays alive
Main / Runner / Subsystem / game state stay alive

old document D1 dies
→ old Control/Data physical carriers close
→ old Renderer participant R1 retires

same shell URL reloads in W
→ fresh document D2
→ fresh pending Renderer participant R2
→ fresh Control ticket/carrier
→ fresh Data settlement
→ current Store/Render truth projects
```

Required invariant：

```text
Hostra windowId(W) stable
Renderer logical identity R1 != R2
Subsystem generation unchanged
current game state unchanged
```

A reload MUST NOT call Hostra `openWindow()` again。

---

## 12. Shutdown / Failure Ownership

### User closes Hostra Window

```text
Hostra emits window.closed(windowId)
→ LoomRealm recognizes its product Window
→ stop accepting fresh Renderer document activity
→ abort signal passed to runMain(...)
→ await Main settlement
→ existing RuntimeHosting converges Runner
→ close Renderer Control / Data Broker / Content services
→ close Hostra RPC client
→ LoomRealm Node process exits
→ Hostra observes HOSTRA_SUBCMD exit
→ Hostra performs its normal host shutdown
```

### LoomRealm requests normal product close

```text
LoomRealm RPC closeWindow(windowId)
→ Hostra closes its Window
→ local Main/physical cleanup converges
→ LoomRealm exits
```

The implementation must tolerate event/RPC ordering races and make close idempotent。

### Main / Runner fatal

```text
Main rejects / Runner terminal
→ preserve original logical failure
→ best-effort Hostra closeWindow(windowId)
→ ALWAYS dispose LoomRealm-owned Control/Data/Content physical resources
→ process exits non-zero
→ Hostra sees subprocess exit and converges normally
```

A Main rejection MUST NOT skip Desktop physical cleanup。

### Hostra shutdown / RPC loss

```text
host.shuttingDown or Hostra RPC terminal
→ abort Main
→ converge Runner
→ close LoomRealm services
→ exit
```

M15 does not attempt to reconnect to a fresh Hostra session or recreate Window state after Hostra death。

---

## 13. Current File Migration Map

Expected high-level treatment：

| Current file/surface | Action |
| --- | --- |
| `apps/desktop/src/main-entry.ts` | rewrite as plain Node entry |
| `apps/desktop/src/product-composition.ts` | rewrite outer composition around Hostra RPC; keep Main/Broker/Content composition |
| `apps/desktop/src/electron-renderer-control.ts` | replace with loopback WS Renderer Control binding |
| `apps/desktop/src/preload.ts` | delete from LoomRealm product path |
| `apps/desktop/src/message-port-carrier.ts` | remove from M15 product path unless another real consumer remains |
| `apps/desktop/src/window-data-binding.ts` | keep Data state semantics, replace MessagePort settlement realization with WS |
| `apps/desktop/src/data-broker.ts` | preserve authority/currentness; only adapt concrete renderer settlement |
| `apps/desktop/src/data-websocket.ts` | preserve application Data pair semantics |
| `apps/desktop/src/browser-websocket-carrier.ts` | preserve/reuse where contract fits |
| `apps/desktop/src/content-service.ts` | preserve Content semantics; add exact document bootstrap route only |
| `apps/desktop/src/desktop-bootstrap.ts` | revise from Electron postMessage envelope to document bootstrap shape |
| `apps/desktop/src/renderer-entry.ts` | preserve M13/Input/Data composition; replace MessagePort bootstrap/connect path |
| `apps/desktop/src/renderer-input-source.ts` | preserve |
| `apps/desktop/package.json` | remove Electron runtime/start path; pin only dependencies actually consumed by Node product |

Deletion happens only after the replacement vertical passes. Do not delete working legacy files before the Hostra path can display the canonical map。

---

## 14. Implementation Slices

### Slice 0 — Reopen M15 physical composition only

Before implementation：

```text
M10–M14 frozen
M15 logical requirements preserved
M15 direct-Electron physical composition superseded
existing Electron E2E = migration regression evidence, not final closure evidence
```

Update live M15 status only after the new Hostra vertical exists; do not claim Closed during migration。

### Slice 1 — Node product + Hostra RPC

Deliver：

```text
plain Node main-entry
Hostra RPC client
getHostState handshake
openWindow/closeWindow
hostra.event handling
```

Gate：Hostra launches LoomRealm via `HOSTRA_SUBCMD`, LoomRealm opens an inert trusted shell Window through RPC, and no LoomRealm production source imports Electron。

### Slice 2 — Renderer Control WS

Deliver one-shot loopback Control physical binding。

Gate：real Main Renderer Control peer connects through Hostra BrowserWindow without Electron MessagePort。

### Slice 3 — Document bootstrap + M13 presentation

Move bootstrap from preload/postMessage to LoomRealm trusted shell response。

Gate：Hostra Window loads M13 presentation and checked-in M14 map without Electron-specific LoomRealm bridge。

### Slice 4 — Data settlement WS

Replace only Window settlement MessagePort。

Gate：M9 prepare/prepared/commit/revoke/current behavior passes through Hostra BrowserWindow；same-generation reconnect works。

### Slice 5 — Physical input + reload

Gate：

```text
trusted ArrowRight
→ same M10 seam
→ 10,8 → 11,8
→ next Right blocked

Hostra BrowserWindow reload
→ same window id
→ fresh Renderer identity
→ same Main/Runner/game state
→ Data reconnect
→ projection/input resume
```

### Slice 6 — Lifecycle/failure convergence

Gate user close、programmatic close、Main fatal、Runner fatal、Hostra shutdown/RPC loss。

No orphan Runner、Content listener、Control/Data listener or LoomRealm process。

### Slice 7 — Replace qualification subject and remove legacy Electron ownership

Only now remove dead Electron-specific code/dependency and rewrite M15 qualification around Hostra。

---

## 15. Canonical Hostra E2E

Final M15 canonical product test MUST start at Hostra, not at Electron directly：

```text
qualification harness
→ spawn pinned Hostra
   HOSTRA_RPC_PORT=<controlled/ephemeral>
   HOSTRA_RPC_TOKEN=<fresh>
   HOSTRA_CDP_PORT=0
   HOSTRA_SUBCMD="node .../apps/desktop/dist/main-entry.js"
→ observe hostra.ready
→ Hostra starts LoomRealm child
→ LoomRealm RPC openWindow
→ observe Hostra window.created
→ Playwright connectOverCDP(hostra cdpEndpoint)
→ select the Hostra-owned LoomRealm page
```

Required vertical evidence：

```text
Hostra is the actual Electron process
LoomRealm is the actual HOSTRA_SUBCMD Node child
Window exists in Hostra getHostState/getAllWindows
canonical M14 map visible
trusted Keyboard/Pointer/Gamepad producer remains valid
ArrowRight movement + blocked movement
reload keeps Hostra window id but replaces Renderer identity
same-generation Data carrier loss/replacement
presentation resumes from current truth
user Window close reaches LoomRealm lifecycle
Runner terminates
LoomRealm child terminates
Hostra converges/exits
former LoomRealm loopback service ports refuse connections
```

The qualification harness may use Hostra CDP for observation. CDP is test observation, not LoomRealm production communication。

---

## 16. Boundary Qualification

Add mechanical checks that fail if M15 drifts back to standalone Electron：

```text
apps/desktop production source imports "electron"                  → FAIL
apps/desktop creates BrowserWindow                                 → FAIL
apps/desktop owns Electron app.quit                                → FAIL
Hostra RPC carries Renderer/Data application payload               → FAIL
Hostra types leak into platform-ports/Main/Renderer/game packages  → FAIL
second Data currentness/recovery owner appears                     → FAIL
generic Hostra/Window/Connection manager abstraction appears       → FAIL
canonical M15 gate launches Electron directly instead of Hostra    → FAIL
```

Also prove：

```text
Hostra source/runtime is not patched by LoomRealm qualification
Hostra preload semantics remain its own
LoomRealm business code does not require window.electronAPI
```

---

## 17. Dependency / Packaging Rule

Production layering：

```text
Hostra executable/package
      ↓ starts
apps/desktop Node product
      ↓ consumes only JSON-RPC over loopback
LoomRealm packages
```

LoomRealm does not link Hostra internals。

Qualification MUST pin an exact Hostra release/source identity. If root tooling adds `hostra` as a dev/qualification dependency, it is only to launch the real external host; `apps/desktop` application code still does not import it。

Changing the pinned Hostra version after M15 qualification is a Desktop qualification-subject change and requires re-running the Hostra E2E gate。

---

## 18. What Must Not Be Optimized During Migration

Do not combine this correction with：

```text
renaming @loomrealm/game-launcher-hostra
extracting a generic WebSocket transport package
PWA transport unification
multi-window product design
multi-Hostra-session reconnect
Window layout persistence
Hostra preload redesign
Hostra security-policy redesign
M10–M14 API cleanup
Content protocol redesign
Data protocol redesign
```

`@loomrealm/game-launcher-hostra` may continue to own the frozen Hostra-profile PREPARE + Node Runner mechanics. When LoomRealm runs as a plain Node `HOSTRA_SUBCMD`, the M15 product no longer needs Electron-main `process.execPath` / `ELECTRON_RUN_AS_NODE` as its normal path, but removing that compatibility path is outside this correction unless independent M6/M9 qualification proves it dead。

---

## 19. Migration Safety / Rollback

During implementation, keep the current standalone Electron vertical until the Hostra vertical reaches M14-visible presentation。Use it only as a regression oracle for LoomRealm internals。

Migration rule：

```text
new Hostra slice fails
→ fix the concrete Hostra physical adapter
→ do not reopen Main/Data/Renderer/game contracts to make the test pass
```

If a real contradiction is found between frozen LoomRealm contracts and Hostra's public RPC/window lifecycle, document the exact contradiction before changing either side。Do not silently patch Hostra from the LoomRealm repository。

---

## 20. Final Closure Criteria

The recomposition is complete only when all are true：

```text
1. Hostra is the sole Electron/BrowserWindow owner in canonical M15 product E2E
2. LoomRealm Desktop runs as Hostra HOSTRA_SUBCMD plain Node process
3. apps/desktop production code has no Electron ownership/import
4. Hostra itself is unmodified for LoomRealm
5. Main/Runtime/Frame/DataAuthority semantics are unchanged
6. Renderer Control uses LoomRealm loopback physical carrier, not Electron MessagePort
7. Data Broker/currentness is unchanged; only Browser settlement transport changed
8. Content/M13/M14 path is the same logical path
9. reload = same Hostra Window + fresh Renderer logical participant
10. user close / Main fatal / Runner fatal / Hostra shutdown all converge without orphan resources
11. canonical E2E starts Hostra and observes the Hostra-owned Window through Hostra/CDP evidence
12. current standalone Electron qualification is retired as canonical M15 closure evidence
13. pinned Hostra qualification + npm run test:m15 are repeatably green
14. M14 formal prerequisite is satisfied before formal M15 Closed
```

Desired final product boundary：

```text
Hostra
    owns desktop shell / Electron / Window / direct subprocess

LoomRealm Desktop
    owns LoomRealm physical service composition and Hostra RPC client

Main
    owns logical session/runtime authority

Renderer
    owns replica/presentation/input

Subsystem/game
    owns business state/render authority
```

At that point M15 may again be frozen and qualified. No further Desktop hosting abstraction is required merely for future PWA symmetry。
