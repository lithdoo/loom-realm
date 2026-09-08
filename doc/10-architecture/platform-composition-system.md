# 平台组合系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / M9 closed / **M12 Content closed / M13 Web presentation integration pending**  
> 主要定义：跨平台 composition boundary、Launcher-owned PREPARE、PlatformLaunchPlan、Runtime Runner、Renderer/Data physical provisioning、Content binding、Web presentation startup composition，以及 Hostra/PWA 对同一 logical Session 的 realization  
> 依赖：[系统架构总览](./system-overview.md)、[ADR 0017](../decisions/0017-system-level-platform-composition.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)  
> 被以下文档细化：[运行承载系统](./runtime-hosting-system.md)、[存储与内容系统](./storage-system.md)、[渲染系统](./rendering-system.md)  
> 被以下文档实现：[Hostra Desktop Composition](../20-modules/desktop-host/README.md)、[PWA Composition](../20-modules/pwa-host/README.md)  
> 最近复核：2026-09-08

本文回答：**同一套 LoomRealm application semantics 如何在不同物理平台上被完整准备、组合并运行。**

M13 Web presentation startup source 已收敛：用户在产品启动时另行选择 `WebPresentationConfigV1`；该配置声明整个 Renderer Window 在 projection 前必须加载的 ordered JS/CSS logical resources。它不进入 Game Entry、Platform Launch Manifest、LogicalGameBootstrap或 Render tree。

---

## 1. Core Boundary

```text
             Platform-neutral application roles
┌──────────────────────────────────────────────────────┐
│ Main             Renderer             Subsystem      │
│                  logical Content consumers           │
└──────────────────────────────────────────────────────┘
                         ▲
                 narrow role capabilities
                         │
        ┌────────────────┴────────────────┐
        │                                 │
     Hostra                             PWA
```

Platform是完整 physical Session composition boundary，但不是 universal application authority/service locator。

Web presentation额外区分：

```text
Renderer Web Projector
    → LoomRealm-owned thin projection mechanics

Business Web presentation implementation
    → business-owned concrete Custom Elements

WebPresentationConfigV1
    → Renderer Window-level JS/CSS bootstrap declaration
```

具体 WC implementation由 business JS在 Renderer Window里通过 browser `customElements`注册。LoomRealm不建立 business component registry、generic layer system或 dynamic component loader。

---

## 2. Launcher-owned PREPARE vs Presentation Startup

Runtime PREPARE仍是：

```text
Game source
→ session-scoped concrete Platform
→ matching Launcher component
    → @loomrealm/game-package validation
    → current Platform Launch Manifest
    → exact key-set join
    → executable/security/hosting preflight
    → immutable PlatformLaunchPlan
    → LogicalGameBootstrap projection
→ concrete Platform installs plan privately
→ Main receives LogicalGameBootstrap + Main-facing view
```

PREPARE failure必须保持：

```text
Process/Worker create = 0
business Definition import = 0
Runtime Control establishment = 0
```

M12在成功 PREPARE后的 current prepared installation上形成 immutable Content view。

M13不把 Web Presentation Config塞回 Launcher manifest或 Game Entry。产品启动额外拥有：

```text
user-selected WebPresentationConfigV1 source/path
```

Desktop current composition：

```text
successful Hostra PREPARE
→ current prepared installation / Content view
+
user-selected WebPresentationConfigV1
→ validate config
→ resolve declared JS/CSS logical resources against current prepared Content view
→ immutable PreparedWebPresentation
```

Launcher继续只负责 Runtime executable PREPARE；Web presentation startup由产品/Renderer physical composition负责，不修改 `HostraGameSource`、Game Package或 Main logical bootstrap contract。

---

## 3. Logical Bootstrap vs Physical Plans

```text
LogicalGameBootstrap
    subsystemKeys + initial target/input
    → Main-visible

PlatformLaunchPlan
    executable binding + Host policy/preflight
    → Platform-private

Prepared Content view
    installationId + normalized public manifest + readonly Content index/source
    → Platform-private composition fact

PreparedWebPresentation
    ordered resolved scripts/styles
    logical identity + current contentVersion/MIME
    → Renderer Window startup-private fact
```

`PreparedWebPresentation`不得携 business-facing filesystem path、FSDB handle、bearer或 arbitrary loader capability。

不得创建同时暴露 logical + executable + presentation loader + filesystem/credential material 的万能 DTO。

Business presentation module identity/path/URL不进入 LogicalGameBootstrap、Frame params或 RenderNode。

---

## 4. Platform Authority Boundary

Main唯一拥有：

```text
Session / Runtime / Frame / Stack / Activation
InputTarget / Renderer currentness / DataAuthority
```

Subsystem拥有 business state、Input Interest/State、Render authoritative Domains。

Renderer拥有 read-only Main mirror、Input Producers/gate、Render replica；M12 resource bytes read与 M13 Web projection都不产生新的 application authority。

Platform/app composition拥有现有 physical responsibilities：

```text
executable binding
Process/Worker/Window hosting
Control/Data physical provisioning
Content physical service/binding/credential
Web Presentation Config acquisition/validation
presentation bootstrap resource resolution / trusted href/src binding
startup/shutdown/supervision facts
```

这些 physical responsibilities不拥有具体 Custom Element业务语义或 Render authority。

Business Web Component拥有 private Shadow DOM/Canvas/WebGL/presentation-local state和 business layout/stacking policy，但对 LoomRealm projected Render state只有读取权。

---

## 5. Role-facing Capabilities Through M13 Direction

Role-facing capability随真实 consumer冻结，不构成一个 universal `Platform` interface。

Main-facing：

```text
DeadlineScheduler
RuntimeHosting
OpaqueMaterialGenerator
RendererControlBinding?
DataConnectionAuthoritySink?
```

Subsystem physical realization：

```text
RuntimeControlBinding
SubsystemDataBinding
Hostra/PWA Runner constructs bound ContentClient
```

Renderer physical realization：

```text
RendererDataBinding
RendererInputSource environment
M12 trusted Renderer ResourceClient binding
M13 PreparedWebPresentation bootstrap material
M13 package-private Store → Projector seam
M13 document.body Web projection environment
```

M13不得为了模块加载、layout或组件管理预建 universal presentation/service locator port。

---

## 6. Runtime / Runner

```text
RuntimeHosting.launch(subsystemKey, LaunchAttemptMaterial)
→ lookup frozen PlatformLaunchPlan
→ Host-owned Runner Container
→ selected Definition Module
→ construct role-local capabilities
→ @loomrealm/subsystem/host
```

Runner capability增长：

```text
M6  RuntimeControlBinding
M8  SubsystemDataBinding role seam
M9  Hostra child Data provisioning implementation
M12 bound ContentClient
M16 PWA equivalent Runtime physical realization
```

Business Web presentation implementation不进入 Subsystem Runner；Runner也不负责具体 Custom Element业务逻辑。

Runner不重新解释 raw Game/Platform manifests，也不把 Content credential放进 Runtime Control/Data application messages。

---

## 7. Data Provisioning — M9 Closed

Hostra：

```text
Main current Renderer + DataAuthority + exact HostedRuntime
→ DataConnectionAuthoritySink.replace(full view)
→ apps/desktop Broker
→ Renderer/Runner WS candidate
→ exact child-scoped HostraRuntimeDataProvisioner
→ commit-time latest-view revalidation
→ sole-current paired install
```

Data candidate/provisioning/loss/post-install delivery failure不直接 fail Runtime/Frame，也不 mutate Main DataAuthority。

M12 Content grant/material、M13 presentation bootstrap material与 M9 Data ticket/provisioning IPC严格分离。不得复用 Data application/provisioning protocol当作任意 JS/CSS loader channel。

---

## 8. Content Binding — M12 Closed

Logical rule：

```text
Readonly Content capability != arbitrary executable resolver capability
```

Desktop：

```text
successful Hostra PREPARE
→ current immutable prepared installation view
→ discover exactly one direct-child [FSDB]* root
→ @loomrealm/fsdb readonly snapshot
→ private immutable Content Index + normalized public manifest/version
→ apps/desktop localhost Content Service
→ scoped bearer grants
```

当前 Desktop不新增 `fsdbRoot` 用户输入；FSDB继续由 prepared installation自动确定。

Subsystem：

```text
Hostra owner injects child-private access material
→ Runner constructs bound ContentClient
→ runSubsystem({content,...})
```

Renderer ordinary runtime resource：

```text
Desktop composition binds current installation/grant
→ trusted Renderer integration-subpath ResourceClient
→ logical resource + expected version
→ Content API bytes
```

Renderer presentation bootstrap：

```text
WebPresentationConfigV1 namespace + resourceKey
→ current prepared Content view lookup
→ current contentVersion + MIME
→ trusted browser href/src binding
→ ordered <link> / classic <script>
```

Content credentials不得进入 Runtime bootstrapToken、M9 Data provisioning IPC/ticket、Renderer Control snapshot、Frame params、Render State、business WC public state或 ordinary business payload。

Business WC如需 runtime resource，只能通过 M13/M14明确授予的 trusted presentation integration消费 M12 ResourceClient语义；不得拿 bearer/path/privileged URL。

---

## 9. Web Presentation Integration — M13 Current Model

M13 current model：

```text
user-selected WebPresentationConfigV1
→ current prepared Content/FSDB resource resolution
→ Renderer bootstrap document
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business JS customElements registration
→ window.onload
→ committed Render Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned Custom Element instances
```

冻结：

```text
WebPresentationConfigV1 is Window-level
scripts/styles are ordered top-level lists
no subsystems field
resource ref = M12 namespace + hierarchical resource key
Desktop user does not separately select FSDB
CSS uses <link rel="stylesheet">
JS uses ordered classic <script> without async
window.onload is projection-start barrier
business JS owns customElements.define(...)
top-level roots project directly into document.body
no generic Domain layer / CSS stacking framework
data ABI = optional receiveRenderData(full readonly snapshot)
projection order = structure → attrs → receiveRenderData
Store notifies Projector only after successful atomic commit
M13 does not define RenderEvent → WC/DOM event delivery
read-only DOM contract is not MutationObserver-policed
```

因此不再是 current候选：

```text
ESM / Blob module loader framework
per-Subsystem presentation resource list
dynamic module path/URL in RenderNode
normal-path arbitrary late Custom Element upgrade
generic cross-Subsystem presentation layer manager
RenderEvent → WC method/DOM dispatchEvent mapping
separate user-selected fsdbRoot
```

仍属于 implementation-private细节的主要是：

```text
trusted prepared resource → browser href/src physical binding
exact package-private Store→Projector type/name
presentation error reporting vocabulary
```

这些不得改变已冻结的 business-observable semantics。

---

## 10. Hostra / PWA Realizations

Hostra：

```text
launch.hostra.json
Node Runner Process
Runtime Control WebSocket
Desktop Data Broker / Data WebSocket
successful PREPARE → exactly one installation FSDB
user-selected WebPresentationConfigV1
BrowserWindow bootstrap document
M13 <link> / classic <script> / window.onload
M13 document.body thin Web projection
localhost Content HTTP
@loomrealm/fsdb physical source core
```

PWA：

```text
launch.pwa.json
Dedicated Worker Runner
Runtime Control MessagePort
PWA Data Broker / MessageChannel (M17)
Window bootstrap document
same WebPresentationConfigV1 logical semantics
same <link> / classic <script> / window.onload semantics
same document.body thin Web projection semantics
Fetch + Service Worker + OPFS/Cache Content (M17)
```

PWA不依赖 Node-only `@loomrealm/fsdb`。两平台必须保持相同 Web Presentation Config logical resource meaning、Content logical identity/version/error、Web projection semantics与 business-observable result，而不要求相同 physical storage/transport/href-src binding。

---

## 11. Milestone Placement

```text
M12  Desktop Content capability + two real consumers          closed
M13  Web config/bootstrap + thin Store→body WC projection    pending
M14  loom.map business + map-owned Web presentation           pending
M15  BrowserWindow/full Desktop physical composition          pending
M16  PWA Runtime/Worker vertical                               pending
M17  PWA Renderer/Data/Input/Render/Content/Web projection    pending
```

M13不实现 map product vocabulary；使用 fixture WC验证 presentation config/bootstrap + projection contract，并用真实 Chromium关闭 browser behavior。

M15 presentation不得直接使用 localhost privileged URL/path绕过 M12 ResourceClient/Content policy。

---

## 12. No Platform Mega-package

Complete composition roots：

```text
apps/desktop
apps/pwa
```

Narrow launcher packages只拥有 PREPARE/Runner integration。`apps/*` 可以组合多个 lower-level packages，但不得 duplicate Game/FSDB/protocol/domain validation。

禁止仅为未来用途建立：

```text
UniversalPlatform
RendererHosting core service
ContentService platform port
InstallationRegistry service locator
ConnectionRegistry
cross-platform StorageProvider SPI
UniversalPresentationRegistry
GenericPluginManager
GenericPresentationLayerManager
```

---

## 13. Cross-platform Equivalence

共享：

```text
same Game topology/LogicalGameBootstrap
same SubsystemDefinitionFactory ABI
same Runtime/Frame/Renderer/Data/Input/Render contracts
same Content logical semantics
same WebPresentationConfigV1 logical semantics
same <link>/classic <script>/window.onload bootstrap semantics
same document.body projection model
same key/attrs/receiveRenderData/children projection semantics
same business-owned presentation contract for same logical scenario
same logical business outcome
```

不比较：

```text
module path/bytes
PID vs Worker id
WS URL vs MessagePort
IPC vs Port transfer
Desktop FSDB/HTTP vs PWA OPFS/Service Worker
trusted physical browser href/src binding
business WC private Shadow DOM/Canvas/WebGL/layout implementation
```

---

## 14. Final Invariants

1. session-scoped concrete Platform是完整 physical composition boundary；
2. matching Launcher继续只拥有 current-platform Runtime executable PREPARE；Web Presentation Config是独立 product/Renderer startup input；
3. Main不读 Game/executable/presentation physical material；
4. Main仍是唯一 Session/Runtime/Frame/Renderer/Data application authority；
5. Host-owned Runner是 physical Runtime entry；
6. Data provisioning、Content injection与 presentation bootstrap不得混成同一 application protocol；
7. M12 Content不新增 universal Content service locator；M13不新增 universal presentation/plugin/layer service locator；
8. Web Presentation Config只有 Window-level ordered scripts/styles，没有 Subsystem binding；
9. Desktop presentation resources从 current prepared installation唯一 FSDB/Content view解析，用户不单独配置 FSDB；
10. browser bootstrap使用 ordered `<link>` / classic `<script>`，`window.onload`后启动 Projector；
11. top-level roots直接进入 `document.body`，actual layout/stacking由 business WC/CSS负责；
12. data通过 optional `receiveRenderData(...)`完整投递，structure/attrs先于 data；
13. M13不定义 RenderEvent → WC/DOM event ABI；
14. WC DOM read-only contract不通过 MutationObserver policing，DOM永远不反向成为 Store authority；
15. concrete Custom Elements由业务 JS通过 browser registry注册；
16. Hostra/PWA可以使用不同 storage/transport/trusted href-src binding；
17. M17只在 logical application + Web presentation/projection trace等价时关闭跨平台 equivalence。
