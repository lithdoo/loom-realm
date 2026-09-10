# M15 / 02 — BrowserWindow Renderer Composition

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：02  
> 最近复核：2026-09-11  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md)  
> 依赖：[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)、[M12 Renderer Resource Client](M12_03_RENDERER_RESOURCE_CLIENT.md)、[Desktop Host design](doc/20-modules/desktop-host/README.md)  
> 目标：让真实 Electron `BrowserWindow` 成为 production Renderer environment，并复用既有 Control/Data/Content/Presentation seams。

> **BrowserWindow 只提供 physical environment；它不拥有 Renderer authority，也不建立新的 browser-side application model。**

---

## 1. Physical Composition

```text
Electron main
    │
    ├─ Renderer Control MessageChannelMain
    ├─ Desktop Data Broker + window Data handoff port
    ├─ one exact loopback HTTP origin
    │      ├─ app-owned trusted shell routes
    │      └─ existing /_lr/v1 Content API routes
    └─ BrowserWindow
          ↓
       trusted Renderer role
          ↓
       existing M13 presentation
          ↓
       business Custom Elements
```

Renderer Control 的 Desktop realization固定使用 Electron `MessageChannelMain` / transferable `MessagePortMain`；进入 Renderer 后是 native DOM `MessagePort`，再适配既有 `MessageCarrier`。该 adapter 留在 `apps/desktop`，不是新的 cross-platform protocol。

Data 继续由现有 Desktop Data Broker 拥有 candidate/pair/currentness。Content 继续走现有 readonly Content service。Control/Data/Content 三条 capability 不合并成万能 IPC。

## 2. Browser Security Boundary

BrowserWindow 固定：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
webSecurity = true
```

M15 Desktop page origin固定为 **app-owned `http://127.0.0.1:<port>` loopback origin**。BrowserWindow shell与 existing Desktop Content API MUST share the exact same scheme + host + port：

```text
http://127.0.0.1:<port>/...        app-private exact shell routes
http://127.0.0.1:<port>/_lr/v1/... existing Content API routes
```

这只是一个 physical listener/origin composition，**不是把 shell 加入 Content API**。Shell routes属于 `apps/desktop` private product mechanics；`/_lr/v1/...` 继续完全由 Content API v1语义拥有。

实现不得为了这个边界新增：

```text
file:// product shell
custom privileged scheme only to bypass same-origin
webSecurity=false
Content CORS/OPTIONS extension
preload Content-fetch proxy
universal local web server/static-file framework
```

App-private shell route MUST be exact/bounded and may only serve checked-in/bundled trusted Desktop shell material；不得把 URL path直接映射成 arbitrary filesystem read。

由于 shell 与 Content API same-origin，Renderer ResourceClient可以继续使用当前 GET + `Authorization: Bearer ...` Content semantics，不需要 CORS preflight或第二条 Content transport。

M15 product composition 不允许 business presentation 导航到任意 remote document、创建新的 privileged Window，或关闭这些 BrowserWindow security settings。

Preload运行在 Electron isolated world，只拥有接收精确 bootstrap handoff 所需的最小 Electron capability。不得：

```text
contextBridge.exposeInMainWorld(genericElectronApi)
expose ipcRenderer.send/invoke/on generically
expose filesystem / shell / process / Main object
expose Data/Content/Control manager object
```

## 3. Execution World and One-shot Bootstrap

LoomRealm trusted Renderer runtime、Renderer holder、DOM `RendererInputSource`、M13 bootstrap 和 `WebProjector` 固定运行在页面 **Main World**。原因是 `WebProjector` 必须直接操作同一 `document/customElements` 并调用 business Custom Element structural ABI。

Business JS 也运行在 Main World，但它只在 trusted Renderer 已取得 private capabilities 并捕获后续需要的 authority-bearing browser primitives 后，才由 M13 ordered bootstrap加载。

Exact startup handoff：

```text
BrowserWindow loads same-origin app-owned shell
→ load app-owned trusted Renderer entry first
→ trusted entry installs exact one-shot bootstrap listener
→ local shell reaches Electron did-finish-load

Electron main
→ webContents.postMessage(exact private channel, bootstrap envelope, transferred ports)
→ preload isolated world receives exact channel only
→ preload transfers envelope + native ports once through DOM window.postMessage
→ trusted Main-World entry accepts only same-window exact-channel message
→ consume private material into lexical/private state
→ capture/bind required native browser primitives
→ remove bootstrap listener
→ start Renderer Control/Data/Content composition
→ only then load business JS/CSS through M13
```

Electron main **MUST NOT** send the one-shot bootstrap before the app-owned shell's `did-finish-load`；该时点保证 trusted entry已经有机会安装 listener，不增加 bootstrap ACK/handshake protocol。

每个 loaded document最多一次 bootstrap transfer。若 reload/navigation在 transfer完成前使 document失效，旧 envelope/ports直接 retire；fresh document只能获得 fresh material，不 retry旧 transfer。

Bootstrap envelope只允许携带当前 Window启动必需的 concrete material：

```text
Renderer Control token + native Control port
window-scoped Data handoff port
RendererContentAccess for existing resource client
WebPresentationConfigV1 candidate
```

这些值只能保存在 trusted Renderer lexical/private state中；不得发布到 `globalThis/window`。Business code不得获得 Electron bridge或 raw port/token引用。

这不是新的 authentication protocol。Renderer Control token仍只用于现有 Renderer hello；它不得被重新解释为 Data/Content authorization。

## 4. Trusted Browser Primitive Capture

Because trusted Renderer and business scripts intentionally share the page Main World，any native primitive that will later carry private capability material MUST be captured/bound before the first business script executes。

Minimum M15 set：

```text
native fetch used by Renderer ResourceClient
native WebSocket constructor used by Renderer Data acquisition
transferred Control/Data MessagePort objects + required bound port methods
DOM input primitives that M15/03 uses after business load
```

For M12 ResourceClient specifically：

```text
private RendererContentAccess
→ create trusted ResourceClient before business JS
→ capture/bind native fetch + URL construction needed by that client
→ later resource() calls use captured primitives only
```

`resource()` MUST NOT dynamically resolve a business-replaceable `globalThis.fetch` after business bootstrap，because its request contains the private Content bearer。

Likewise the BrowserWindow Data adapter MUST NOT dynamically resolve a business-replaceable `globalThis.WebSocket` when it receives a private candidate endpoint。

This is not a BrowserPrimitiveRegistry or security service。Concrete adapters simply close over the exact primitives they consume。

Qualification MUST replace/monkey-patch the corresponding page globals **after** trusted bootstrap and prove that normal business/presentation activity cannot observe Content bearer、Data endpoint or Control/Data raw port material through those replacements。

## 5. Trusted M13 Production Seam

M13 qualification 当前可直接使用 Renderer internal composition，但 M15 product code不得 import `packages/renderer/dist/internal/*`。

M15 将现有 M13 implementation 仅提升为一个 trusted product-consumable subpath：

```text
@loomrealm/renderer/web-presentation
```

该 subpath 只暴露现有 M13 concrete mechanics 所需的 trusted composition surface：

```text
WebPresentationConfigV1 validation/preparation
bootstrapWebPresentation
attachRendererPresentation
WebProjector
```

Renderer resource client继续使用现有 trusted：

```text
@loomrealm/renderer/resource-client
```

这不是 business author API，不建立新的 PresentationHost/PresentationRuntime/registry。M15 只把已存在且已 qualified 的 M13 mechanics 从 repository-internal test reach-through 变成合法 production import seam。

## 6. Presentation Startup

```text
one-shot product-private Config candidate
→ trusted Config validation/preparation
→ resolve refs against current prepared Content
→ private browser bootstrap binding
→ ordered JS/CSS bootstrap
→ window.onload/readyState complete
→ WebProjector attach/start
```

Config bootstrap resource binding 与 runtime `PresentationResourceClient` 继续是两个 capability boundary。

Trusted Renderer entry必须在加载第一份 business script前完成 private bootstrap consumption和必要 native primitive capture；business code不能通过 preload/Electron API或 page-global monkey patch取得 private material。

M15 不建立 component loader、component registry、AssetManager 或 platform-specific projector。

## 7. BrowserWindow Data Handoff

现有 M9 Desktop Broker authority/candidate semantics保持不变：

```text
Main Data authority
→ Desktop Data Broker
→ one pending/current pair per subsystem
→ Runner-side Hostra provisioner
→ Renderer-side physical delivery
```

M9 current `DesktopRendererDataBinding` 是 Node-side deterministic realization；它不得进入 `nodeIntegration=false` 的 BrowserWindow。

M15只替换 Renderer-side physical delivery adapter。Dedicated window Data handoff port只承载以下 concrete settlement：

```text
prepare(candidateId, endpoint, S/G/P)
prepared/failure acknowledgement
commit(candidateId, S/G/P)
revoke(candidateId)
close
```

它不得承载 Data application messages。

Exact candidate flow：

```text
Broker creates paired candidate
→ Runner provisioner prepares runner endpoint
→ Broker sends renderer endpoint + candidate identity on window Data handoff port
→ trusted Window adapter opens captured native WebSocket
→ wraps it as MessageCarrier
→ acknowledges prepared
→ existing Broker install revalidates current Main authority
→ Broker commits candidate
→ window adapter marks carrier current-deliverable
→ matching RendererDataBinding.acquire(S,G,P) resolves
→ existing Renderer holder/Data peer consumes carrier
```

冻结规则：

```text
window Data handoff port is bound to one physical Renderer candidate/window
rendererControlToken is never submitted by BrowserWindow as Data authorization
BrowserWindow request/settlement cannot create DataAuthority
Broker remains sole owner of pending/current candidate state
acquire resolves only after Broker commit
revoke/retirement synchronously makes late prepared/commit unusable
same-generation reconnect creates a fresh carrier/peer; no resume token/history
```

same-generation pair loss继续使用既有 Broker replacement + Renderer `RendererDataBinding.acquire()` 路径；不得增加第二套 reconnect authority、ConnectionManager或 retry framework。

## 8. Renderer Currentness / Reload

BrowserWindow reload/replacement 产生新的 physical Renderer candidate；Main existing Renderer Control semantics决定 currentness：

```text
old Renderer current
→ fresh Window loads same-origin trusted shell/entry
→ did-finish-load
→ fresh one-shot bootstrap + fresh captured primitives + Control candidate
→ new candidate hello/accept
→ atomic Main replacement
→ old Renderer retired
→ old private ports/resource lifetime closed
```

Reload不得复用旧 Window bootstrap envelope、Control port、Data handoff port、Content capability object或 old document primitive closure。

Window lifecycle 不得直接修改 Main Session/Runtime/Frame/DataAuthority truth。same-generation Data carrier loss只影响 carrier/current replica availability；不得被 Desktop翻译成 DataAuthority removal。

## 9. Completion

M15/02 完成时，真实 BrowserWindow必须通过 production seams获得：

```text
current Renderer Control snapshot
current per-subsystem Data connection
private Content/resource access
existing M13 Web projection
```

并证明：

```text
security preferences固定生效
page shell and /_lr/v1 Content share exact 127.0.0.1 origin
no file:// / CORS extension / Content preload proxy is required
preload与页面 Main World保持 context isolation
bootstrap只在 trusted shell did-finish-load 后发送一次
business JS加载前 private bootstrap和 required browser primitives已被 trusted Renderer消费/捕获
post-bootstrap global fetch/WebSocket replacement cannot observe private bearer/endpoint material
no generic Electron/contextBridge API exposed to business code
Control使用 dedicated MessagePort carrier
Data application bytes不经过 Electron handoff port
product source不引用 packages/renderer/dist/internal/*
Node-only M9 Renderer binding不进入 BrowserWindow
M14 lr-map-view / lr-map-sprite 可真实显示
```

Game library/example不得依赖 `apps/desktop`、Electron或 Renderer internals。
