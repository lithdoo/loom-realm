# LoomRealm Web Presentation Config v1

> 层级：正式契约  
> 状态：Active / Normative / Stabilizing  
> 契约版本：1  
> Milestone：M13 Web Presentation Projection  
> 主要定义：Window-level business JS/CSS declaration、M12 logical Content resolution、browser bootstrap、`window.onload` projection-start barrier  
> 依赖：[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 相关：[Web Presentation API v1](./web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Web Presentation Config 只描述“当前 Renderer Window 在启动 Render projection 前加载哪些业务 JS/CSS”。它不是 Game topology、Subsystem executable binding、Render state、runtime asset API、module-loader contract，也不定义产品如何取得配置 source。**

---

## 1. Config Acquisition Boundary

Web Presentation Config 是 product startup input，但 **source acquisition 不属于本契约**。

边界固定为：

```text
product / Platform composition
→ acquire config source using platform-private mechanism
→ read / parse candidate JSON
────────────────────────────────────────────
Web Presentation Config v1 contract begins
→ validate WebPresentationConfigV1
→ resolve prepared Content refs
→ browser bootstrap
```

因此本契约不定义或冻结：

```text
filesystem path
URL
FileSystemHandle
picker result
command-line argument
settings key
opaque source locator
```

Desktop MAY 使用用户选择的 filesystem path；PWA MAY 使用 picker、persisted handle 或 app-owned source。上述 acquisition mechanics 都不是 `WebPresentationConfigV1` 字段或跨平台 ABI。

配置 acquisition/material 不得进入：

```text
GameEntryV1
Hostra/PWA Launch Manifest
LogicalGameBootstrap
Main / Frame
RenderNode / Render Update
```

本契约不要求 installation 内存在固定配置文件名。

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

V1 顶层 MUST 精确包含：

```text
formatVersion
scripts
styles
```

`formatVersion` MUST 精确等于 `1`。

V1 MUST NOT 增加：

```text
subsystems
module / url / filesystemPath
bearer / credential
loader / resolver
platform / hostra / pwa
runtime resource capability
```

---

## 3. Window-level Scope

`scripts[]` / `styles[]` 属于整个 Renderer Window presentation environment，而不是某个 Subsystem。

V1 不建立：

```text
subsystemKey → scripts/styles
Frame → presentation resource
RenderDomain → presentation resource
RenderNode.tag → module path
```

一个 script MAY 注册多个 Custom Elements；多个 Subsystem MAY 使用同一已注册 business element。

---

## 4. Resource Identity / Prepared Source

每个 ref 使用 M12 logical Content identity：

```text
namespace + hierarchical resource key
```

配置 MUST NOT 携：

```text
absolute filesystem path
file/http/https URL
privileged localhost URL
Content bearer
FSDB handle/root
```

Current Desktop 继续复用 prepared installation：

```text
user selects installationRoot
→ successful Hostra PREPARE
→ canonical prepared installation
→ exactly one direct-child [FSDB]*
→ current readonly Content view
```

M13 不新增用户可配置 `fsdbRoot`。

trusted composition MUST 在 current prepared Content view 中 resolve 每个 ref，并固定当前 immutable `contentVersion` / MIME facts。Prepared representation不得向 business config/WC 暴露 path、FSDB handle、bearer 或 privileged URL。

trusted Window bootstrap MAY 私下把 prepared resource 绑定成 browser-loadable `src` / `href`；该 binding 是 implementation-private physical capability。

---

## 5. Ordered Browser Bootstrap

`scripts[]` 与 `styles[]` 都是 ordered lists。

Current V1 realization冻结：

```text
styles[]  → ordered <link rel="stylesheet" href="...">
scripts[] → ordered classic <script src="..."></script>
```

stylesheets MUST 按 declaration order materialize。scripts MUST 保持 declaration evaluation order；不得使用 `async` 破坏顺序。

同一 logical bootstrap resource 在同一 Window SHOULD 只安装/执行一次；implementation MAY deterministic dedupe，但不得造成 nondeterministic Custom Element registration。

V1 不建立：

```text
ESM / Blob module graph
runtime component loader
PluginManager
second Custom Element registry
tag vocabulary
```

业务 JS 使用 browser-native `customElements.define(...)`。

---

## 6. `window.onload` Ready Barrier

正常启动路径：

```text
validate + resolve WebPresentationConfigV1
↓
create/open Renderer bootstrap document
↓
materialize ordered styles/scripts
↓
browser loads/evaluates resources
↓
business JS registers Custom Elements
↓
window.onload
────────────────────────────────────────
Web Projector may start
```

Web Projector MUST NOT start before `window.onload`。

V1 normal path不依赖“先创建 unknown element，再等待 arbitrary future loader/native upgrade”。projection 使用某个 `RenderNode.tag` 时若对应 Custom Element仍未注册，属于 presentation-local contract failure。

实现还必须独立观察/报告 stylesheet/script load/evaluation failure；`window.onload` 本身不得被解释成“所有 bootstrap resource 必然成功”的证明。

---

## 7. Window Lifetime

```text
Renderer Window lifetime
=
Web presentation bootstrap lifetime
=
Custom Element registry lifetime
```

V1 不按 Subsystem、Frame、Activation、RenderDomain 或 Data reconnect 动态装卸 scripts/styles。

需要 incompatible presentation definitions 时，Phase 1 使用 fresh Renderer Window，而不是在同一 Window 中卸载/重定义既有 Custom Elements。

---

## 8. Bootstrap vs Runtime Resources

必须区分：

```text
bootstrap presentation resources
    JS / CSS
    declared by WebPresentationConfigV1
    loaded before Projector start

runtime business resources
    image / map / audio / data / etc.
    consumed by projected business WC after start
```

Config **只**声明 bootstrap JS/CSS。

M13 已通过 [Web Presentation API v1](./web-presentation-api-v1.md) 冻结 runtime presentation resource capability：Business WC 只能经 `receiveRenderContext(...)` 获得 narrow `PresentationResourceClient`，以 `namespace + hierarchical key + expectedContentVersion` 读取 caller-owned bytes。

Bootstrap `href/src` binding MUST NOT 因此暴露任意 Content URL/path/credential；PresentationResourceClient 也 MUST NOT 演化成 dynamic script/component loader。

---

## 9. Existing Startup Contracts Remain Unchanged

本契约不修改：

```text
GameEntryV1 / game.json
SubsystemDescriptorV1 = exactly {key}
launch.hostra.json / launch.pwa.json executable binding
LogicalGameBootstrap
Main RuntimeHosting request
M12 Content identity/version semantics
Render Update v1
```

关系是：

```text
game.json                    → what logical business exists
launch.<platform>.json       → how Runtime executes
WebPresentationConfigV1      → what business Web JS/CSS the Window loads
Web Presentation API v1      → how projected WC consumes local context/data/resources
RenderNode                    → current authoritative presentation state
```

这些边界不得合并成 universal startup/presentation DTO。

---

## 10. Failure Boundary

以下至少属于 bootstrap/config failure：

```text
invalid config/schema/version
invalid or missing prepared resource
incompatible resource kind/MIME
stylesheet/script load failure
script evaluation/registration failure
required Custom Element unregistered at projection use
```

bootstrap failure：

```text
→ Projector does not enter running state
→ no Main/Subsystem/Render Store authority mutation
→ not Render protocol-fatal
```

runtime receiver/resource failure由 Web Presentation API v1 定义，不属于本 Config contract。

---

## 11. Core Invariants

1. Web Presentation Config 是 product startup input，但 source acquisition是 platform/product-private mechanics，不属于 Config v1；
2. V1 exact top-level shape = `formatVersion/scripts/styles`；
3. scripts/styles 是 Window-level ordered lists，没有 `subsystems`；
4. refs 复用 M12 logical `namespace + hierarchical key`；
5. Desktop继续复用 prepared installation唯一 FSDB/Content view，用户不单独配置 FSDB；
6. config/prepared public facts不携 path/URL/bearer/loader capability；
7. browser mechanism = ordered `<link>` + ordered classic `<script>`；
8. business JS使用 browser-native `customElements.define(...)`；
9. `window.onload` 是 Web Projector start barrier，但 load/evaluation failure必须独立检测；
10. bootstrap lifetime与 Renderer Window lifetime一致；
11. runtime business resource capability属于 Web Presentation API v1，不属于 Config；
12. M13不建立 ESM loader、dynamic component loader、second registry或 universal startup DTO。
