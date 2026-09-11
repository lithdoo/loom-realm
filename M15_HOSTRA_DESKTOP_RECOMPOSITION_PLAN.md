# M15 Hostra Desktop Recomposition Plan

> 状态：**Implementation Frozen / Preimplementation Closed / current M15 physical SSOT**  
> 决策：[ADR 0034 — Hostra-owned Desktop composition](doc/decisions/0034-hostra-owned-desktop-composition.md)  
> 目标：把历史 standalone Electron M15 改造成真正由 Hostra 承载的 Desktop product  
> 范围：只重做 M15 physical composition；M10–M14 logical/business contracts 不 reopen  
> Hostra：`lithdoo/hostra` 保持既有 Electron / preload / RPC / subprocess 运行模型，不为 LoomRealm 定制

---

## 1. Correction Scope

历史 M15 已证明 Main、Runner、Data、Content、Renderer、Input、M13 Presentation 与 M14 Map Game 可以在真实 Electron BrowserWindow 中完整工作，但旧 product path 是：

```text
LoomRealm Desktop
├─ imports Electron
├─ owns Electron app
├─ creates BrowserWindow
├─ owns MessageChannelMain / preload bootstrap
└─ @loomrealm/game-launcher-hostra
    └─ Node Runner
```

它不是 Hostra product composition。

Canonical M15 改为：

```text
Hostra shell
├─ Electron app
├─ BrowserWindow owner
├─ Hostra preload / ambient API
├─ WebSocket JSON-RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop process (plain Node)
├─ Main
├─ RuntimeHosting
│   └─ Runner child
├─ DesktopDataConnectionBroker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
└─ Renderer Data settlement loopback carrier
```

本次纠偏只替换最外层 physical owner。旧 standalone Electron implementation/E2E 保留为迁移回归证据，但不再拥有最终 M15 closure claim。

---

## 2. Terminology

以下术语固定使用，避免再次混淆两个“Hostra”概念：

```text
Hostra shell
    lithdoo/hostra external Electron host

Hostra launch profile
    @loomrealm/game-launcher-hostra PREPARE + Node Runner realization

LoomRealm Desktop process
    Hostra HOSTRA_SUBCMD direct child

Runner
    LoomRealm RuntimeHosting child of the Desktop process
```

不要再用模糊的：

```text
Hostra → Runner
```

替代真实 owner chain。

---

## 3. Supersession / SSOT

M15 physical composition 只以本文 + ADR 0034 为当前 SSOT。

旧 `M15_01`–`M15_05` 保留已经验证过的 logical/business/input intent，但 direct-Electron realization 被 supersede：

| 原文档 | 继续有效 | 被本文 supersede |
| --- | --- | --- |
| `M15_01_DESKTOP_PRODUCT_COMPOSITION.md` | Main/Broker/Content ownership、Hostra-ready installation、无 shadow authority | Electron app / BrowserWindow ownership、Electron-main Runner topology |
| `M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md` | Renderer/M13 seam、Control/Data/Content separation、trusted primitive capture intent | `MessageChannelMain`、LoomRealm preload、direct BrowserWindow ownership |
| `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md` | DOM input canonical mapping、reload/reconnect semantics、single cancellation owner | Electron app/window shutdown mechanics |
| `M15_04_DESKTOP_FULL_E2E_VERTICAL.md` | M14 gameplay outcome、real input/reload/reconnect evidence intent | direct-Electron canonical E2E topology |
| `M15_05_QUALIFICATION_CLOSURE.md` | M14 prerequisite、single `test:m15` gate、boundary discipline | direct-Electron qualification subject |

发生冲突时，physical topology、Window ownership、bootstrap transport、shutdown/failure owner chain与 canonical E2E host 以本文为准。

---

## 4. Frozen Ownership

```text
Hostra shell
    physical Electron / BrowserWindow / direct-subprocess authority

LoomRealm Desktop process
    LoomRealm-specific physical composition only

Main
    Session / Runtime / Frame / Renderer currentness / DataAuthority

Renderer
    replica / presentation / physical input producer

Subsystem/game
    business state / Render authority
```

Hostra RPC 只消费既有 host-control operations：

```text
openWindow
closeWindow
hostra.event
```

`getHostState/getAllWindows` 只允许 qualification/diagnostics 使用，不是 production startup handshake、currentness 或 authority。

Hostra RPC 不承载：

```text
Renderer Control application messages
Data settlement/application messages
Content bytes
Input/Render protocol
Main/Subsystem business state
```

---

## 5. Abstraction Budget

新增概念预算固定为：

```text
concrete Hostra RPC adapter
concrete Renderer Control loopback realization
one concrete Data settlement loopback realization
small single-window document bootstrap state
```

可以共享一个 loopback listener，也可以使用几个很小的 listener；冻结的是 capability/wire separation，不是 Server-class topology。

不得仅为 M15 引入：

```text
IHostraClient / HostraClientPort / HostraSession
HostraManager / HostraPlatformPort
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry
RecoveryManager
BrowserPrimitiveRegistry
generic WebSocket transport framework
```

没有第二个真实 consumer 时，不提取 shared Hostra/transport package。

---

## 6. Desktop Becomes a Plain Node Product

Canonical path：

```text
Hostra HOSTRA_SUBCMD
→ node apps/desktop/dist/main-entry.js
```

最终 recomposition 完成后，canonical production `apps/desktop` 不拥有：

```text
Electron app
BrowserWindow
MessageChannelMain / MessagePortMain
ipcMain / ipcRenderer
app.quit()
```

Hostra 可以由 product/qualification tooling 安装并启动，但 LoomRealm application source 不 import Hostra internals 作为 in-process library。

### 6.1 Frozen Hostra implementation baseline

M15 implementation and qualification are frozen against this exact external host baseline：

```text
package          hostra@1.0.1-beta.1
source repository lithdoo/hostra
source commit     d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron  44.1.1
shutdown grace    1000 ms
```

Implementation MUST NOT silently follow `latest` or a moving Hostra branch. Changing the package/source identity, bundled Electron, or lifecycle behavior creates a new M15 qualification subject and requires requalification；it does not by itself justify a new LoomRealm abstraction。

---

## 7. Concrete Hostra RPC Adapter

允许一个 Desktop-private concrete module，例如：

```ts
const hostra = await connectHostraRpc({ port, token });
await hostra.openWindow(...);
hostra.onEvent(...);
await hostra.closeWindow(...);
await hostra.close();
```

连接材料来自 Hostra inherited environment：

```text
HOSTRA_RPC_PORT
HOSTRA_RPC_TOKEN
```

规则：

```text
loopback only
Hostra token only authorizes Hostra RPC
request id = local correlation only
hostra.event separate from request response
RPC terminal = product-terminal for M15
no reconnect to a fresh Hostra session
no Hostra types leak into Main/platform-ports/Renderer/game packages
```

---

## 8. Startup

Canonical startup：

```text
Hostra shell ready
→ Hostra starts HOSTRA_SUBCMD
→ LoomRealm Desktop reads HOSTRA_* env
→ connect Hostra RPC
→ Hostra launch-profile PREPARE
→ create prepared Content view
→ start bounded shell/Content + Control/Data physical endpoints
→ runMain(...)
→ Main may arm RendererControlBinding.acquire(token)
→ mint caller-provided opaque Hostra window correlation id
→ mint stable high-entropy shell route secret
→ Hostra RPC openWindow({ id, loadUrl })
→ Hostra creates BrowserWindow
→ top-level document navigates to trusted shell route
→ document/acquire rendezvous
→ fresh Renderer bootstrap
→ Renderer Control/Data converge
→ M13 presentation
→ M14 game visible
```

`windowId` 只是 caller-provided Hostra correlation，不是 LoomRealm authority。

Stable shell route conceptually：

```text
http://127.0.0.1:<loom-port>/_lr/window/<random-route-secret>
```

route secret 只是高熵随机字符串，不建立 WindowAuthority/Lease/Credential object model。

`openWindow` RPC success 不等于 product ready。Visible/ready 必须由真实 Renderer Control + presentation vertical 证明。

---

## 9. Renderer Control Physical Realization

旧：

```text
RendererControlBinding.acquire(token)
→ MessageChannelMain
→ LoomRealm preload
→ DOM MessagePort
```

新：

```text
RendererControlBinding.acquire(token)
→ concrete Desktop loopback binding
→ fresh one-shot endpoint capability
→ trusted Renderer connects
→ endpoint consumed
→ MessageCarrier resolves existing acquire(token)
```

Endpoint 本身就是 physical one-shot capability；不要增加 parallel ticket store。

必须保持：

```text
existing RendererControlBinding logical contract unchanged
0..1 pending acquire bound
fresh endpoint per Renderer document
successful claim consumes endpoint
stale/duplicate claim cannot restore old Renderer
reload creates fresh logical Renderer
Control payload never passes through Hostra RPC
```

---

## 10. Document / Acquire Rendezvous

Reload/startup 中 HTTP navigation 与 Main `RendererControlBinding.acquire()` 是两个独立异步方向。M15 固定一个最小 rendezvous，不增加 coordinator abstraction。

有界状态只有：

```text
pendingAcquire   0..1
pendingDocument  0..1
currentDocument  0..1
```

规则：

```text
acquire first
→ hold pendingAcquire
→ top-level document arrives
→ pair

document first
→ hold one pending main-document response
→ acquire arrives
→ pair

both present
→ mint fresh Control endpoint
→ mint fresh Data settlement capability
→ mint fresh Content grant
→ bind presentation candidate
→ return/complete trusted document bootstrap
```

取消规则：

```text
HTTP request aborted     → clear pendingDocument only
acquire aborted/retired  → clear pendingAcquire only
product termination      → cancel both + current document
new valid top-level navigation
    → retire previous current document material
    → becomes the sole pending/current document candidate
```

不得通过 retry framework 或第二套 Renderer currentness 解决该 race。

---

## 11. Navigation-only Trusted Bootstrap Route

Trusted shell route 是 **main-document bootstrap endpoint**，不是普通可重复读取的 application resource。

它只允许当前 Hostra Window 的 top-level main-frame navigation 建立 document lifetime。

必须拒绝或不产生 lifecycle effect：

```text
fetch()/XHR
iframe/subframe navigation
script/style/image/resource request
non-GET/HEAD method
request for wrong route secret
request after product termination
```

普通 page code 即使知道当前 URL，也不能通过 `fetch(location.href)` retire 当前 Renderer 或 mint 新 bootstrap。

实现可使用 Chromium/HTTP 提供的可靠 navigation metadata 或等价 main-document判据；具体 header/helper 名称不是 contract，但 qualification 必须证明 ordinary page fetch/subframe 无法触发 fresh Renderer lifetime。

每个成功 document pairing 才获得 fresh：

```text
Renderer Control token/material
Control one-shot endpoint
Data settlement capability
Content grant
WebPresentationConfigV1 candidate
```

Trusted `renderer.js` 在 M13 business scripts 前消费 material、捕获需要的 native `fetch` / `WebSocket` / input primitives，并尽快移除/失效 page-visible bootstrap representation。

Bootstrap 不得包含 Hostra RPC credentials、filesystem path、Runner private material、Main private state或 DataAuthority policy。

Hostra 自己的 preload/ambient API 保持 Hostra-owned；LoomRealm 不修改它，也不依赖它作为 application capability。

---

## 12. Data

`DesktopDataConnectionBroker` 继续是唯一 Desktop Data candidate/current owner。

只替换 Renderer-side settlement transport：

```text
Broker
→ concrete loopback settlement realization
→ browser RendererDataBinding
→ existing Data application WS
```

Settlement wire继续只允许：

```text
prepare
prepared-or-failed
commit
revoke
close
```

Data application bytes不与 settlement合并。

M9 semantics完全保持：

```text
Broker chooses pending/current
Runner provisioner prepares/commits runner side
Renderer settlement prepares/commits renderer side
same-generation physical loss retires current pair
fresh candidate converges
Main DataAuthority unchanged
```

Data-only reconnect 与 document reload 必须严格区分：

```text
reload
    → old Renderer Control participant retires
    → fresh Renderer logical identity

same-generation Data-only reconnect
    → current Renderer Control participant remains the same
    → Main DataAuthority remains current
    → only Data physical pair is replaced
    → fresh RendererDataBinding.acquire() resolves
```

不得把 Data carrier replacement 实现成 Renderer Control replacement，也不得因为 Data-only reconnect mint 新 Renderer identity。

不要保留 Electron + WS 两套 production realization 只为了做 transport hierarchy。Hostra vertical qualified 后删除 dead Electron settlement path。

---

## 13. Content / Presentation / Input

尽量不改：

```text
prepared Content view/service
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

Input继续：

```text
trusted KeyboardEvent
trusted PointerEvent
captured navigator.getGamepads()
→ existing RendererInputSource
→ existing M10 gate
```

Browser producer不知道 BrowserWindow 是由 Hostra 还是历史 direct Electron 所拥有。

---

## 14. Reload

```text
same Hostra physical Window W
Main / Runner / Subsystem / game state stay alive

old document D1 terminates
→ old Control/Data/Content document material retires
→ old Renderer R1 retires

same stable shell URL reloads
→ fresh top-level navigation D2
→ rendezvous with fresh Main acquire
→ fresh Renderer R2
→ fresh Control/Data/Content material
→ current truth projects
```

Invariant：

```text
Hostra windowId stable
R1 != R2
Subsystem generation unchanged
current game state unchanged
reload does not call Hostra openWindow again
```

---

## 15. One Termination Funnel

所有 product-terminal trigger 必须汇入一个 idempotent one-shot path，概念上：

```text
window.closed(windowId) ─────┐
SIGTERM / SIGINT ────────────┤
host.shuttingDown ───────────┤
Hostra RPC terminal ─────────┤
programmatic product close ──┤
Main / Runner fatal ─────────┤
startup partial failure ─────┘
                             ↓
                    beginTermination(reason)
                             ↓
                    stop new document activity
                             ↓
                    abort runMain signal
                             ↓
                    await/preserve Main settlement
                             ↓
                    finally close
                    Control / Data / Content
                    pending/current document material
                    Hostra RPC adapter
                             ↓
                    LoomRealm process exits
```

实现可简单使用一个 cached Promise；不需要 LifecycleManager/state-machine framework。

Main rejection必须保留原 logical failure，但不能跳过 physical cleanup。

Programmatic close 可以 best-effort `closeWindow(windowId)`，但本地 termination 不得依赖 `window.closed` 一定返回。

---

## 16. Real Hostra Shutdown Constraint

Frozen Hostra baseline 在非 macOS 平台最后一个 Window 关闭时会进入自己的 shutdown，并向直属 `HOSTRA_SUBCMD` 发送 termination signal；当前 baseline 的 shutdown grace 是 **1000 ms**。因此 LoomRealm Node entry 必须把 `SIGTERM/SIGINT` 当作一级 product-terminal trigger。

不得假设：

```text
window.closed event
always arrives and fully completes LoomRealm cleanup
before Hostra termination signal
```

Hostra signal、event、RPC terminal 的任意合理 ordering 都必须汇入同一个 `beginTermination()`。

LoomRealm 不建立第二份 Runner kill authority；它仍通过 `runMain` + existing RuntimeHosting owner chain收敛 Runner。

Qualification 必须证明 ordinary final-window close 后：

```text
LoomRealm signal handler runs
Main/RuntimeHosting converges
Runner absent
LoomRealm child absent
no LoomRealm listener/socket remains
Hostra converges normally
```

如果真实 owner chain 无法在 frozen Hostra 1000 ms grace 下收敛，这是 platform contradiction，需要显式 reopen；不得偷偷增加 Desktop direct Runner kill path。

---

## 17. Startup / Partial Failure Convergence

以下任一失败均走同一个 termination/finally cleanup，不另造 rollback framework：

```text
Hostra RPC connect failure
PREPARE failure
Content/shell listener failure
Control/Data listener failure
runMain early rejection
openWindow RPC failure
Window/document bootstrap failure
Renderer never converges
```

原则：

```text
resource created → owner records concrete handle
later step fails → beginTermination(cause)
cleanup closes only handles that exist
original failure remains observable
```

`openWindow` success 不意味着 `loadURL`/document/presentation success；qualification 以真实 page/Renderer convergence 为准。

---

## 18. Migration Staging

避免“保留 legacy oracle”与“第一步整个仓库无 Electron”互相矛盾。

### Slices 1–6

Canonical Hostra path必须不依赖 Electron ownership；历史 direct-Electron path可以暂时隔离保留，仅作为 regression oracle。

此阶段 gate检查：

```text
Hostra-started canonical entry imports no Electron
canonical composition does not create BrowserWindow/app.quit
Hostra-owned Window vertical progressively replaces old path
```

不要因为 legacy test/source 仍暂存就让早期 slice失败。

### Final replacement slice

Hostra vertical已经覆盖 M14 visibility + input + reload + reconnect + lifecycle 后：

```text
delete legacy direct-Electron production path
remove Electron dependency/start command from canonical Desktop product
repository-wide apps/desktop production Electron ownership/import → FAIL
old direct-Electron qualification no longer closure owner
```

---

## 19. File Migration Map

| Current surface | Action |
| --- | --- |
| `apps/desktop/src/main-entry.ts` | canonical entry改为 plain Node + signals/termination funnel |
| `apps/desktop/src/product-composition.ts` | rewrite outer composition around Hostra RPC；保留 Main/Broker/Content owners |
| `apps/desktop/src/electron-renderer-control.ts` | replace with concrete loopback Renderer Control binding |
| `apps/desktop/src/preload.ts` | remove from canonical LoomRealm path；final slice删除 dead path |
| `apps/desktop/src/message-port-carrier.ts` | no real consumer后删除 |
| `apps/desktop/src/window-data-binding.ts` | preserve settlement semantics；physical realization改为 loopback carrier |
| `apps/desktop/src/data-broker.ts` | preserve authority/currentness |
| `apps/desktop/src/data-websocket.ts` | preserve application Data semantics |
| `apps/desktop/src/content-service.ts` | preserve Content；add exact navigation-only document bootstrap handling |
| `apps/desktop/src/desktop-bootstrap.ts` | revise to document bootstrap material |
| `apps/desktop/src/renderer-entry.ts` | preserve M13/Input/Data；replace Electron-port bootstrap |
| `apps/desktop/src/renderer-input-source.ts` | preserve |
| `apps/desktop/package.json` | final slice remove canonical Electron runtime/start dependency |

---

## 20. Implementation Slices

### Slice 1 — Hostra Node product skeleton

Hostra launches LoomRealm via `HOSTRA_SUBCMD`；canonical Node entry connects RPC、starts bounded shell、opens an inert Hostra Window。Canonical path itself imports no Electron。

### Slice 2 — Renderer Control + rendezvous

Implement concrete Control carrier and `pendingAcquire/pendingDocument/currentDocument` rendezvous。Gate startup ordering both directions + cancellation。

### Slice 3 — Navigation-only bootstrap + M13/M14 visibility

Trusted shell only bootstraps top-level navigation；ordinary fetch/subframe cannot mint Renderer lifetime。Hostra Window displays checked-in M14 map through existing M13 seams。

### Slice 4 — Data settlement replacement

Existing Broker prepare/prepared/commit/revoke/current semantics converge over new settlement carrier；same-generation replacement keeps the same Renderer Control participant and replaces only the Data physical pair。

### Slice 5 — Physical input + reload

ArrowRight proves `(10,8) → (11,8)` and blocked `(12,8)`；reload keeps Hostra `windowId`、replaces Renderer identity、preserves Main/Runner/game truth并恢复 input/presentation。

### Slice 6 — Termination/failure convergence

Gate：

```text
user final-window close
programmatic close
SIGTERM/SIGINT
host.shuttingDown / RPC terminal
Main fatal / Runner fatal
startup partial failure
```

全部进入同一个 termination funnel；无 orphan Runner/child/listener/socket。

### Slice 7 — Canonical qualification + legacy removal

Frozen Hostra full E2E通过后删除 dead direct-Electron ownership/dependency，启用 repository-wide no-Electron ownership gate。

---

## 21. Canonical Qualification

Final M15 qualification从 frozen Hostra baseline 开始：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
Electron 44.1.1
shutdown grace 1000 ms
    ↓
qualification harness
→ launch Hostra
   HOSTRA_RPC_PORT=<controlled/ephemeral>
   HOSTRA_RPC_TOKEN=<fresh>
   HOSTRA_CDP_PORT=0
   HOSTRA_SUBCMD="node .../apps/desktop/dist/main-entry.js"
→ observe hostra.ready
→ Hostra starts LoomRealm child
→ LoomRealm RPC openWindow
→ observe Hostra-owned Window via lifecycle/getHostState/getAllWindows
→ Playwright connects through Hostra CDP
→ exercise real Hostra BrowserWindow
```

`getHostState/getAllWindows` 是 qualification observation only。

必须证明：

```text
Hostra is actual Electron/BrowserWindow owner
LoomRealm is actual HOSTRA_SUBCMD child
Runner is LoomRealm RuntimeHosting child
canonical M14 map visible
trusted ArrowRight + blocked move
ordinary fetch/subframe cannot trigger document bootstrap
reload same Hostra windowId + fresh Renderer identity
same-generation Data-only reconnect keeps same Renderer identity
same-generation Data physical pair replacement converges
current presentation/input resumes
final Window close / Hostra signal ordering converges
programmatic close converges
Main/Runner fatal converges
startup failure leaves no resources
Runner absent
LoomRealm child absent
former loopback ports refuse connections
Hostra converges according to frozen host model
```

Boundary gate最终必须拒绝：

```text
canonical apps/desktop production path importing Electron
canonical path creating BrowserWindow/app.quit
Hostra RPC carrying LoomRealm Control/Data application payload
Hostra types leaking into platform-ports/Main/Renderer/game packages
second Data currentness/recovery owner
second Runner termination authority
generic Hostra/Window/Document/Connection manager abstraction
canonical M15 gate launching Electron directly instead of Hostra
Hostra source/runtime patched by LoomRealm qualification
```

---

## 22. Closure

Formal closure：

```text
M14 formally Closed
+ ADR 0034 propagated through all Current dependent docs
+ frozen Hostra baseline used exactly
+ npm run test:m15 repeatably PASS in supported CI
+ Hostra-owned full Desktop E2E/lifecycle evidence PASS
→ M15 Closed
```

**Preimplementation is closed now.** Implementation may choose only the private mechanics explicitly left open above（file/function names、bounded queue constants、exact navigation metadata helper、shared-vs-small-listener realization）。Any change to ownership、Renderer/Data identity semantics、rendezvous、bootstrap lifetime、termination owner chain or Hostra baseline is a design reopen and requires explicit evidence under the governance rules。
