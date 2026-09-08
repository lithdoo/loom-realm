# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime / M9 Data / M12 Content **Implemented + Qualified**；M13 Web Projection Planned；M15 Full E2E Planned  
> 稳定程度：Closed lower slices / M13 projection Active Design / M15 physical composition Evolving  
> 主要定义：Hostra Launcher PREPARE、Node Runner、Runtime Control WS、Desktop Data Broker、M12 Content composition、M13 Web presentation config/bootstrap + thin projection integration，以及 M15 BrowserWindow/Renderer full product target  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[渲染系统](../../10-architecture/rendering-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

Hostra owns physical topology only；Main retains Session/Runtime/Frame/Activation/InputTarget/DataAuthority/Renderer-currentness authority。

---

## 1. Milestone Shape

```text
M6  Hostra PREPARE + Node Runner + Runtime Control        ✅
M9  Desktop paired Data Broker + child provisioning      ✅
M10 Input role behavior                                  ✅
M11 Render replication                                   ✅
M12 Desktop Content service + two Content consumers      ✅
M13 Web presentation config/bootstrap + thin WC projection pending
M14 loom.map + map-owned WC real consumer                pending
M15 BrowserWindow + physical Renderer full E2E           pending
```

M15不会重新设计 M9–M13 logical semantics，只完成真实 Desktop physical composition。

---

## 2. Hostra PREPARE / Product Startup Inputs

Hostra Runtime PREPARE保持：

```text
HostraPlatform.prepareGame(...)
→ @loomrealm/game-launcher-hostra
→ @loomrealm/game-package validation
→ launch.hostra.json validation
→ exact key-set join
→ safe executable resolution/preflight
→ immutable HostraLaunchPlan
→ LogicalGameBootstrap
```

Any PREPARE failure：

```text
Process create = 0
business module import = 0
Runtime Control establish = 0
Content service business exposure = 0
```

Main只接收 LogicalGameBootstrap + narrow Main-facing capabilities，不接收 Hostra plan/module/path/Content credential。

M13新增的是独立 product startup input，不修改 `HostraGameSource` / `game.json` / `launch.hostra.json`：

```text
user selects installationRoot
+
user selects WebPresentationConfigV1 file/source
```

Web Presentation Config不进入 Launcher Runtime executable join，也不进入 Main logical bootstrap。

---

## 3. Runner / Runtime

```text
RuntimeHosting
→ Host-owned Node Runner
→ exact planned Definition Module
→ RuntimeControlBinding
→ optional/current SubsystemDataBinding
→ M12 bound ContentClient
→ @loomrealm/subsystem/host
```

Runner负责构造 physical role-local capabilities，不拥有 Frame/Data/Render/presentation authority。

Business Web presentation implementation不进入 Node Runner；它运行在 BrowserWindow/Web Renderer side。

---

## 4. M9 Data Provisioning — Closed

```text
Main DataConnectionAuthoritySink
→ apps/desktop Broker
→ Renderer WS + Runner WS candidate
→ exact HostedRuntime-bound HostraRuntimeDataProvisioner
→ commit-time latest-view revalidation
→ paired sole-current install
```

Data ticket/provisioning IPC不产生 application authority。Post-install Runner delivery failure只 retire新 Data current，不 resurrect旧 current，也不自动 fail Runtime/Frame。

M12 Content credential/material、M13 presentation bootstrap material与 M9 Data provisioning IPC/ticket严格分离；不得借用 Data protocol作为任意 JS/CSS loader channel。

---

## 5. M12 Desktop Content — Closed

Physical chain：

```text
successful Hostra PREPARE
→ current immutable prepared installation view
→ discover exactly one direct-child [FSDB]* root
→ @loomrealm/fsdb snapshot
→ private immutable Content Index + normalized public manifest
→ localhost Content Service
```

Package placement：

```text
@loomrealm/fsdb
    readonly Node FSDB core

@loomrealm/fsdb-http
    standalone FSDB HTTP projection

apps/desktop
    LoomRealm Content route/auth/version composition
```

Desktop Content grant保持 Host-owned / opaque / installation-scoped / permission-scoped / expiring，并与 Runtime bootstrapToken、Renderer token、Data ticket分离。

M13不新增 `fsdbRoot` 用户配置。Presentation Config引用的 JS/CSS和普通 Content一样都从这个 current prepared installation唯一 FSDB/Content view解析。

---

## 6. M12 Content Consumers — Closed

Subsystem：

```text
Runner constructs bound ContentClient
→ runSubsystem({content,...})
→ scope.content.record/resource
```

Renderer ordinary runtime resource：

```text
Desktop composition binds current installation/grant
→ trusted @loomrealm/renderer/resource-client integration subpath
→ logical resource + expected sha256 version
→ bytes + MIME
```

Renderer ResourceClient不是 public Platform port/AssetManager，也不解释 RenderNode business presentation schema。

Business-owned WC不得获得 bearer、filesystem path或 privileged localhost URL。

---

## 7. M13 Web Presentation Config / Bootstrap

Current config contract：

```ts
interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly { readonly namespace: string; readonly key: string }[];
  readonly styles: readonly { readonly namespace: string; readonly key: string }[];
}
```

这是整个 Renderer Window的 presentation bootstrap declaration：

```text
scripts/styles = Window-level
no subsystems field
no subsystemKey → resource binding
```

Config resource ref使用 M12 logical resource identity：

```text
namespace + hierarchical resource key
```

Desktop composition：

```text
user-selected WebPresentationConfigV1
→ validate
→ lookup each script/style in current prepared Content view
→ capture current contentVersion + MIME
→ immutable PreparedWebPresentation
```

Config不携 filesystem path、FSDB handle、URL、bearer或 loader capability。

trusted Desktop bootstrap可把 prepared resources私下绑定成 browser-loadable `<link href>` / `<script src>`，但这些 physical values不得成为 business config/WC capability。

---

## 8. M13 Renderer Window Bootstrap / Ready Barrier

Desktop BrowserWindow中的 M13启动 target：

```text
validated/resolved WebPresentationConfigV1
↓
open Renderer bootstrap document
↓
styles[] → ordered <link rel="stylesheet">
↓
scripts[] → ordered classic <script>
↓
business JS customElements.define(...)
↓
window.onload
────────────────────────────────────────
start Web Projector
↓
M11 committed Render Store
→ business-owned Custom Elements
```

classic scripts不得使用 `async`破坏 declaration evaluation order。

V1不建立 ESM/Blob/module-graph/dynamic component loader framework，也不依赖 arbitrary late Custom Element upgrade。

---

## 9. M13 Thin Projector

Projection mapping：

```text
key      → stable HTMLElement identity
tag      → business-owned WC name
attrs    → Renderer-managed host attrs
data     → optional receiveRenderData(full readonly snapshot)
children → Renderer-managed ordered light DOM
```

Top-level roots直接成为：

```text
document.body children
```

Desktop/Renderer **不** 建立：

```text
per-Domain presentation wrapper/layer
CSS stacking framework
automatic z-index style
layout engine
cross-Subsystem visual layer manager
```

业务 WC / CSS自行负责 actual layout/position/stacking。

Store → Projector内部方向：

```text
Render Store successful atomic commit
→ package-private post-commit notification/effect
→ Web Projector
```

Projector不消费 raw Render wire。

---

## 10. `receiveRenderData(...)` / Projection Ordering

M13 exact WC data method：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

method optional；未实现时不投递 data，也不是 failure。

一次 committed change的 projection order：

```text
1. structure / managed children
2. attrs
3. receiveRenderData(full current data)
```

业务收到 `receiveRenderData(...)` 时，managed structure/children与 attrs已经对应同一次 Store commit。

M13不定义 RenderEvent → WC/DOM event ABI。

---

## 11. Read-only Contract / No Policing

业务 WC 对 LoomRealm-managed attrs/data/children等 projected state只有 read access。

M13不使用 MutationObserver或其他 policing机制检测/修复 WC违规 DOM mutation。

如果业务违规：

```text
Store remains authoritative
DOM is never adopted back into Store
subsequent presentation-local behavior is not guaranteed
business-local accidental consequences are not LoomRealm responsibility
```

普通 WC/private UI state仍由业务自己管理。

---

## 12. Failure / Lifetime

Bootstrap failure：

```text
config invalid
required JS/CSS load failure
script evaluation/registration failure
→ Projector does not enter running state
```

Runtime projection/WC failure：

```text
unregistered tag
receiveRenderData throws
DOM operation failure
WC contract violation
→ report local error
→ no Store rollback
→ no Main/Subsystem authority mutation
→ continue best-effort where possible
```

Presentation bootstrap lifetime：

```text
Renderer Window lifetime
=
Web Presentation Config bootstrap lifetime
=
Custom Element registry lifetime
```

V1不按 Subsystem/Frame/Domain动态装卸 scripts/styles。若启动需要不同/incompatible WC definitions，则创建 fresh Renderer Window。

---

## 13. M13 / M15 Qualification Target

M13需要真实 headless Chromium qualification，至少覆盖：

```text
<link> / ordered classic <script>
window.onload ready barrier
customElements registration
Store commit → Projector notification
roots → document.body
same-key HTMLElement identity
attrs / children
receiveRenderData initial/update
structure/attrs before receiveRenderData
DOM violation never rewrites Store
callback failure never rolls back authority
RenderEvent not delivered to WC/DOM
```

M15 Full Desktop target：

```text
M12-capable Hostra composition
+
user-selected WebPresentationConfigV1
+
BrowserWindow/Web Renderer bootstrap document
+
ordered <link> / classic <script> / window.onload
+
physical RendererControlBinding WS
+
M9 Data Broker
+
real DOM/Gamepad RendererInputSource
+
M11 internal current Render replica
+
M13 document.body Web Projector
+
M14 map-owned Custom Elements
+
M12 Renderer ResourceClient → runtime resource bytes
→ full Desktop E2E
```

M15不得：

```text
DOM→Data shortcut绕过 M10 source
business WC自建 Render authority
Renderer从 DOM反向同步 Render Store
Render State携 Content URL/token/path
Renderer/WC直接读 fs/fsdb-http business path
重新引入 per-Subsystem presentation script/style loading
重新引入 generic presentation layer/stacking framework
```

---

## 14. Final Invariants

1. Launcher owns Game/executable PREPARE, not Renderer/Content application authority；
2. Main sees no Hostra plan/module/path/token/presentation config；
3. Web Presentation Config是独立用户启动输入，不修改 Game Entry / Hostra Launch Manifest / LogicalGameBootstrap；
4. config顶层 scripts/styles属于整个 Renderer Window，没有 subsystems；
5. M9 Data、M12 Content与 M13 presentation bootstrap不得混成同一 application protocol；
6. apps/desktop owns Broker + Content + BrowserWindow/presentation bootstrap composition policy；
7. Desktop继续自动发现 prepared installation唯一 FSDB，用户不单独指定 fsdbRoot；
8. browser bootstrap使用 ordered `<link>` / classic `<script>`；`window.onload` 是 Projector start barrier；
9. business JS通过 browser `customElements`注册具体 WC；Desktop/Renderer不提供 business component registry；
10. top-level projected roots直接进入 `document.body`；Renderer不提供 generic layer/stacking framework；
11. Store successful commit后才通知 Projector；Projector不消费 raw wire；
12. data通过 optional `receiveRenderData(...)`完整投递；projection order = structure → attrs → data；
13. M13不定义 RenderEvent → WC/DOM event ABI；
14. WC只读 contract不通过 MutationObserver policing；违规后果不由 LoomRealm保证；
15. ordinary Data/Content/presentation failure does not directly equal Runtime/Frame failure；
16. M13由真实 Chromium qualification关闭；
17. M15是 first full BrowserWindow product closure。
