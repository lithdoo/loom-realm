# LoomRealm Web Presentation Config v1

> 层级：正式契约  
> 状态：Active / Normative  
> 契约版本：1  
> 稳定程度：Stabilizing / M13 current design  
> 主要定义：用户启动时选择的 Web presentation 配置、Window-level JS/CSS resource list、M12 Content/FSDB logical resource resolution、`<script>` / `<link>` browser bootstrap、`window.onload` projection-start barrier  
> 依赖：[Readonly Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Web Presentation Config 描述“当前 Renderer Window 在启动 Render projection 前必须加载哪些业务 JS/CSS”；它不是 Game logical topology、不是 Subsystem executable binding、不是 Render state，也不按 Subsystem 切分资源。**

---

## 1. Startup Input Boundary

用户在产品启动时显式提供 Web Presentation Config source/path。

概念产品输入：

```ts
interface DesktopStartInput {
  readonly installationRoot: string;
  readonly webPresentationConfig: string;
}
```

这里的 `webPresentationConfig` 只表示 product/application composition 要读取的配置文件位置；它：

```text
MUST NOT enter GameEntryV1
MUST NOT enter Hostra/PWA Launch Manifest
MUST NOT enter LogicalGameBootstrap
MUST NOT enter Main / Frame / RenderNode
```

本契约不要求 installation 内存在固定文件名。用户选择哪一个配置文件属于启动输入，不扩大 `game.json` 或 `launch.*.json` schema。

---

## 2. Normative JSON Shape

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

概念示例：

```json
{
  "formatVersion": 1,
  "scripts": [
    {
      "namespace": "resource.web",
      "key": "components/common"
    },
    {
      "namespace": "resource.web",
      "key": "components/game"
    }
  ],
  "styles": [
    {
      "namespace": "resource.web",
      "key": "styles/base"
    },
    {
      "namespace": "resource.web",
      "key": "styles/game"
    }
  ]
}
```

V1 顶层 schema MUST 精确包含：

```text
formatVersion
scripts
styles
```

V1 MUST NOT 增加：

```text
subsystems
module
url
filesystemPath
bearer
credential
loader
resolver
platform
hostra
pwa
```

`formatVersion` MUST 精确等于 `1`。

---

## 3. Window-level Scope

`scripts[]` / `styles[]` 属于整个 Renderer Window presentation environment，而不是某个 Subsystem：

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

Business WC运行后需要普通 resource bytes时，仍必须通过 M13/M14明确授予的受限 presentation Content capability消费 M12 ResourceClient semantics；不得因为 bootstrap `<script>` / `<link>` binding存在就获得任意 Content URL/path/credential。

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

RenderNode
→ current authoritative presentation state to project
```

四者不得合并成 universal startup DTO。

---

## 12. Failure Boundary

以下至少属于 presentation bootstrap/config failure：

```text
config JSON/schema invalid
unsupported formatVersion
resource identity invalid
resource not found in current prepared Content view
resource kind/MIME incompatible with declared scripts/styles use
stylesheet/script load failure
script evaluation/registration failure
required Custom Element remains unregistered at projection use
```

bootstrap failure → presentation不进入 Projector running state。

这些 failure MUST NOT 静默修改 Main/Subsystem/Render Store authority，也不得伪装成 Render protocol-fatal。

---

## 13. Browser Realization Boundary

M13 V1 已冻结 browser mechanism：

```text
CSS = <link rel="stylesheet">
JS  = ordered classic <script>
ready = window.onload
```

trusted host/composition仍负责把 prepared logical resources私下绑定成可供这些标签加载的 browser `href/src`。该绑定 MUST 保持 current installation identity，并 MUST NOT 向 business config/WC 暴露 Content bearer、filesystem path或 privileged resolver capability。

LoomRealm不建立 ESM module graph、Blob-module loader、dynamic component loader或 presentation dependency framework。

---

## 14. Core Invariants

1. Web Presentation Config 是用户启动输入，不进入 Game/Launcher/Main/Render authority；
2. V1 config顶层只有 `formatVersion/scripts/styles`；没有 `subsystems`；
3. scripts/styles是整个 Renderer Window的资源列表；
4. resource ref使用 M12 `namespace + hierarchical resource key`；
5. Desktop继续自动发现 prepared installation内 exactly one FSDB；用户不单独配置 FSDB；
6. config不携 filesystem path/URL/bearer/loader capability；
7. prepare阶段把 resource ref解析为 current immutable contentVersion/MIME facts；
8. styles使用 ordered `<link rel="stylesheet">`，scripts使用 ordered classic `<script>`；
9. `window.onload` 是 V1 presentation-ready / Web Projector start barrier；
10. JS由业务方负责通过 browser `customElements` 注册具体 WC；LoomRealm不维护 business component registry；
11. normal v1 bootstrap不依赖 arbitrary late Custom Element upgrade；
12. presentation bootstrap lifetime与 Renderer Window lifetime一致；
13. existing `game.json`、platform launch manifest、LogicalGameBootstrap与 M12 Content contracts保持不变。
