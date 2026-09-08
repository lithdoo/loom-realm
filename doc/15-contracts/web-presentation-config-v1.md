# Web Presentation Config v1

> 层级：正式契约  
> 状态：Active / Normative / Stabilizing  
> Milestone：M13 Web Presentation Projection  
> 主要定义：Renderer Window-level business Web presentation bootstrap resource declaration、prepared Content resolution、browser loading/registration ready barrier  
> 依赖：[Content API v1](./content-api-v1.md)、[Web Presentation API v1](./web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-freeze-m13-web-presentation-api-v1.md)  
> 最近复核：2026-09-08

本契约回答：**当前 Renderer Window 启动时需要加载哪些 business-owned Web presentation JS/CSS，以及这些 logical resources 如何在不暴露 filesystem path / Content credential 的前提下绑定到 browser bootstrap。**

它不定义 Runtime executable binding，不定义 RenderNode schema，不定义业务 Custom Element vocabulary，也不建立 dynamic module-loader framework。

---

## 1. Exact Shape

```ts
interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly WebPresentationResourceRefV1[];
  readonly styles: readonly WebPresentationResourceRefV1[];
}

interface WebPresentationResourceRefV1 {
  readonly namespace: string;
  readonly key: string;
}
```

Top-level 与 resource ref 都是 closed exact shape；未知字段必须拒绝。

`formatVersion` 必须精确为 `1`。

---

## 2. Independent Startup Input

Web Presentation Config 是独立 product startup input：

```text
Game installation/source
→ Platform Launcher PREPARE
→ prepared current-platform game + current Content view

user-selected WebPresentationConfigV1
→ validate
→ resolve against that current prepared Content view
→ PreparedWebPresentation
→ Renderer Window bootstrap
```

它不属于：

```text
game.json
launch.hostra.json
launch.pwa.json
LogicalGameBootstrap
Main state
Subsystem Definition
Render Update
```

因此修改 presentation bootstrap resource list不修改 logical Game topology，也不创建新的 Runtime executable binding。

---

## 3. Window-level Scope

Config作用域是整个 Renderer Window：

```text
WebPresentationConfigV1
    ↓
Renderer Window
    ├─ scripts[]
    └─ styles[]
```

因此 V1 不建立：

```text
subsystemKey → scripts/styles
Frame → presentation resource
RenderDomain → presentation resource
RenderNode.tag → dynamic module path
```

一个 script MAY 注册多个业务 Custom Elements；多个 Subsystem 的 Render tree MAY 使用同一已注册 Custom Element。

资源 declaration ownership、Render authority ownership 与 Subsystem ownership彼此独立。

---

## 4. Resource Identity

每个 resource ref 使用 M12 已有 logical Content identity：

```text
namespace
+
hierarchical resource key
```

V1 不发明第二种 FSDB path identity。

Current Desktop Content projection 对 FSDB resource table 使用：

```text
namespace = resource.<table-name>
key       = hierarchical ResourceKey
```

配置中的 resource ref MUST resolve 为 current prepared installation Content view 中的 `resource` entry。

配置 MUST NOT 携：

```text
absolute filesystem path
file: URL
http/https URL
localhost privileged URL
Content bearer
physical FSDB root
```

logical resource identity != physical capability。

---

## 5. FSDB Source / Configuration

M13 不新增用户可配置的 `fsdbRoot`。

Current Desktop M12 规则继续保持：

```text
user selects installationRoot
→ successful Hostra PREPARE
→ canonical prepared installation root
→ discover exactly one direct-child [FSDB]* directory
→ open current readonly FSDB snapshot
→ build prepared Content view
```

因此用户启动时：

```text
selects installationRoot
selects Web Presentation Config
```

但 **不单独选择 FSDB**。

这样避免：

```text
Game installation A
+
Presentation FSDB B
```

形成第二份 installation identity / trust / currentness 问题。

Node-only `@loomrealm/fsdb` 仍只拥有 readonly FSDB domain core；它不拥有 Web presentation config semantics 或 browser loading policy。

---

## 6. Prepare-time Resolution

Web Presentation Config validation 后，trusted product composition MUST 在当前 prepared Content view 中 resolve 每个 resource ref。

概念 prepared fact：

```ts
interface PreparedWebPresentation {
  readonly scripts: readonly PreparedPresentationResource[];
  readonly styles: readonly PreparedPresentationResource[];
}

interface PreparedPresentationResource {
  readonly namespace: string;
  readonly key: string;
  readonly contentVersion: string;
  readonly mime: string;
}
```

`contentVersion` / `mime` 来自 current immutable prepared Content entry，而不是业务配置手工填写。

Prepared representation MUST NOT 暴露：

```text
filesystem path
FSDB handle
Content bearer
privileged localhost URL
```

trusted Window bootstrap 可以把 prepared resource 私下绑定成 browser-loadable `src` / `href`；该物理绑定不是 business config，也不得成为 WC 可取得的 credential/path capability。

---

## 7. Ordered Lists

`scripts[]` 与 `styles[]` 都是 ordered lists。

Current browser realization：

```text
styles[]  → <link rel="stylesheet" href="...">
scripts[] → classic <script src="..."></script>
```

stylesheets MUST 按 declaration order 放入 bootstrap document。scripts MUST 按 declaration order 放入 bootstrap document，并使用保持 declaration evaluation order 的 classic-script loading；不得用 `async` 破坏顺序。

同一 logical resource identity在同一个 Window bootstrap 中 SHOULD 只执行/安装一次；duplicate handling可以由 implementation做 deterministic dedupe，但不得形成重复执行造成的 nondeterministic Custom Element registration。

---

## 8. `window.onload` Presentation Ready Barrier

正常启动路径：

```text
validated PreparedWebPresentation available
↓
create/open Renderer bootstrap document
↓
materialize ordered <link rel="stylesheet"> tags
↓
materialize ordered classic <script> tags
↓
browser loads styles/scripts
↓
business scripts call customElements.define(...)
↓
window.onload
────────────────────────────────────────
Web Projector may start
↓
Render Store → business-owned WC tree
```

M13 V1 使用 browser `window.onload` 作为 presentation bootstrap ready barrier。Web Projector MUST NOT start before this barrier。

Business JS 使用浏览器原生：

```ts
customElements.define(...)
```

LoomRealm MUST NOT 建立第二个 business component registry / PluginManager / tag vocabulary。

V1 normal path不依赖“先创建 unknown element，未来再 native-upgrade”作为 bootstrap机制。若 projection 时 `RenderNode.tag` 对应的 Custom Element仍未注册，则属于 presentation contract failure；不得等待 arbitrary future module loader旁路。

---

## 9. Window Lifetime

Presentation bootstrap resource lifetime 与 Renderer Window lifetime对齐：

```text
Renderer Window lifetime
=
Web presentation bootstrap lifetime
=
Custom Element registry lifetime
```

V1 不按以下 lifetime 动态装卸 scripts/styles：

```text
Subsystem launch/terminal
Frame create/close
Activation
RenderDomain create/close
Data reconnect
```

若需要使用不同的 Web Presentation Config / incompatible Custom Element definitions，Phase 1 current model通过创建新的 Renderer Window获得 fresh browser registry/environment，而不是在同一 Window里尝试卸载或重定义已有 Custom Elements。

---

## 10. Content vs Executable Presentation Boundary

Presentation bootstrap JS/CSS 与 runtime business resource虽然都由 current installation Content/FSDB material提供，但用途不同：

```text
bootstrap presentation resources
    JS / CSS
    Window startup before projection

runtime business resources
    image / map / audio / data / etc.
    WC running after projection
```

Config只声明 bootstrap JS/CSS。

Business WC运行后需要普通 resource bytes时，使用 [Web Presentation API v1](./web-presentation-api-v1.md) 冻结的 `PresentationResourceClient`：

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual contentVersion
```

该 API由 trusted Projector通过 one-shot `receiveRenderContext(...)` 注入；它复用 M12 Renderer-private ResourceClient semantics，但不得暴露 private client object、filesystem path、Content bearer、origin/installationId或 privileged URL。

Bootstrap `<script>` / `<link>` physical binding 与 runtime resource capability仍是两个不同 seam；存在其中一个不授权业务取得另一个的 physical material。

---

## 11. Existing Startup Contracts Remain Unchanged

本契约不修改：

```text
GameEntryV1 / game.json
SubsystemDescriptorV1 = exactly {key}
launch.hostra.json key → Definition Module binding
launch.pwa.json key → Definition Module binding
LogicalGameBootstrap
Main RuntimeHosting request
M12 Content API logical identity/version semantics
```

关系是：

```text
game.json
→ what logical business exists

launch.<platform>.json
→ how business Runtime executes on that platform

user-selected WebPresentationConfigV1
→ what business Web JS/CSS this Renderer Window loads

Web Presentation API v1
→ how running projected business WC receives context/data and reads ordinary runtime resource bytes

RenderNode
→ current authoritative presentation state to project
```

---

## 12. Browser Realization Is Intentionally Narrow

M13 V1 当前只冻结：

```text
<link rel="stylesheet">
classic <script>
browser customElements registry
window.onload ready barrier
```

M13 V1 不建立：

```text
ESM module graph loader
Blob module linker
import-map framework
hot component loader
per-Subsystem module lifecycle
dynamic tag → module resolver
```

这不是声明未来永远禁止 ESM，而是当前没有真实需求要求 LoomRealm拥有 module graph / loader authority。

---

## 13. Failure Boundary

以下是 presentation bootstrap failure：

```text
config parse/shape invalid
resource ref invalid
required prepared Content resource missing
invalid resource MIME/version fact
trusted browser binding failure
stylesheet load failure
script load/evaluation failure
required Custom Element registration absent at projection use
```

结果：

```text
presentation bootstrap fails
→ Web Projector MUST NOT enter running state if failure occurs before ready/start
```

`window.onload` 本身只是 ready barrier；implementation仍必须独立跟踪 required stylesheet/script load/evaluation/registration failure，不得把“onload已触发”自动解释成所有 business bootstrap均成功。

Presentation failure不修改 Main/Subsystem authority，也不回滚已合法 committed Renderer Store。

---

## 14. Security / Capability Boundary

Business config/WC只能观察 logical identity与业务可见 API，不得取得：

```text
Desktop Content bearer
Content Service privileged origin/path
filesystem path
FSDB handle
prepared installation internal object
Launcher executable resolver
PlatformLaunchPlan
```

trusted composition负责 physical `<link href>` / `<script src>` binding；该 binding MUST NOT 把 bearer、filesystem path 或 broad resolver capability编码成业务脚本可复用的 credential channel。

Business script本身运行在同一 Window，可能观察浏览器标准 `document.currentScript.src` / DOM `href/src`；因此 implementation使用的 browser-loadable binding必须本身是 narrowly scoped / non-sensitive material，而不是把 secret直接塞进 URL。

Runtime ordinary resource access则只能通过 Web Presentation API v1 narrow façade；不得通过 bootstrap URL反向派生 Content credential。

---

## 15. Cross-platform Semantics

Hostra Desktop 与 PWA MUST 保持：

```text
same config shape
same logical namespace/key semantics
same ordered list semantics
same classic-script evaluation ordering expectation
same window.onload ready barrier
same Custom Element registration expectation
same no-dynamic-loader baseline
```

Physical realization MAY 不同：

```text
Desktop Content HTTP/FSDB binding
PWA Service Worker/Cache/OPFS binding
browser-loadable href/src materialization
```

但 physical difference不得对 business产生 filesystem/token/platform-specific capability exposure。

Runtime WC resource access的 cross-platform business-observable semantics由 Web Presentation API v1独立冻结。

---

## 16. Qualification

M13 qualification至少证明：

```text
exact config validation
ordered scripts/styles retained
logical refs resolve only against current prepared Content view
no separately selected fsdbRoot
no path/URL/bearer accepted in config
ordered <link> realization
ordered classic <script> realization
window.onload before Projector start
required script/style failure prevents successful bootstrap
business customElements.define registration works in real Chromium
unregistered projected tag follows presentation failure policy
config does not create subsystem/resource binding
runtime WC resource capability comes from Web Presentation API v1, not bootstrap href/src
```

真实 browser lifecycle语义必须使用 headless Chromium；Node/fake DOM不足以关闭本契约。

---

## 17. Final Invariants

1. Web Presentation Config是独立 Window-level startup input；
2. exact V1 shape只有 `formatVersion/scripts/styles`；
3. scripts/styles只使用 M12 logical namespace + hierarchical resource key；
4. Desktop只使用 current prepared installation内 exactly-one `[FSDB]*`，用户不选第二个 fsdbRoot；
5. prepared representation只携 logical identity/contentVersion/MIME，不暴露 path/token/privileged URL；
6. styles使用 ordered `<link rel="stylesheet">`；
7. scripts使用 ordered classic `<script>`，不得 async破坏 declaration order；
8. `window.onload` 是 V1 Web Projector start barrier，但 implementation仍独立处理 resource/evaluation/registration failure；
9. business JS用 native `customElements.define(...)`注册 concrete WC；
10. V1不建立 ESM/dynamic component loader framework；
11. bootstrap JS/CSS与 runtime ordinary resources是不同用途；runtime resource由 Web Presentation API v1读取；
12. Config不进入 Game Entry/Launcher manifest/Main/Render state；
13. physical browser binding不能成为 business credential/path capability；
14. Hostra/PWA可有不同 physical storage/binding，但必须保持 business-observable config/bootstrap semantics。
