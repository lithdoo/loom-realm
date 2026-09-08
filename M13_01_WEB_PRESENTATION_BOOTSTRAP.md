# M13 / 01 — Web Presentation Bootstrap

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：01  
> 最近复核：2026-09-09  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)  
> 相关契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：关闭 Window-level Config validation、prepared Content resolution 与 ordered browser bootstrap；不建立通用 loader、registry 或 presentation framework。

> **M13/01 只回答“Renderer Window 在 Projector 启动前如何准备业务 JS/CSS”。Config source acquisition 仍属于具体 product/platform。**

---

## 1. Frozen Flow

```text
product/platform-private config acquisition
→ parse candidate JSON
→ validate WebPresentationConfigV1
→ resolve refs against current prepared Content view
→ freeze prepared resource facts
→ materialize ordered styles/scripts
→ observe load/evaluation outcome
→ window.onload
→ allow M13/02+ Projector start
```

`window.onload` 是 Projector start barrier，但不是 bootstrap resource 成功的替代证明。

---

## 2. Scope

必须实现：

```text
closed-schema Config v1 validation
formatVersion = 1
scripts/styles ordered list validation
per-list duplicate (namespace,key) rejection
prepared Content resolution
contentVersion / MIME fixation
ordered stylesheet materialization
ordered classic script evaluation
explicit load/evaluation failure reporting
window.onload ready barrier
```

不实现：

```text
Config path / URL / FileSystemHandle contract
ESM / Blob module graph
dynamic component loader
PluginManager
second Custom Element registry
subsystem-scoped scripts/styles
runtime asset manager
```

---

## 3. Prepared Resource Boundary

Config public facts只保留 logical identity：

```text
namespace
key
```

trusted preparation在 current prepared Content view 中固定：

```text
contentVersion
MIME
private browser-load binding material
```

Business config / Custom Element不得获得：

```text
filesystem path
FSDB handle
Content bearer
authorized origin
privileged URL
Renderer-private ResourceClient
```

M13复用 M12 Content identity/version/security boundary，不复制 Content subsystem。

---

## 4. Browser Bootstrap

Current v1 realization：

```text
styles[]  → ordered <link rel="stylesheet">
scripts[] → ordered classic <script>
```

要求：

```text
preserve declaration order
scripts must not use async ordering
no implementation-defined dedupe
business scripts use native customElements.define(...)
Projector cannot start before window.onload
```

Bootstrap failure必须阻止 Projector进入 running，但不得修改 Renderer Store、Main 或 Subsystem authority。

`RenderNode.tag` 是否已注册不在 Config phase推断；Projector真正需要 materialize 时仍未注册，属于 M13/03 projection-time structural failure。

---

## 5. Ownership

```text
product/platform composition
    owns Config source acquisition

Renderer trusted bootstrap
    owns Config validation
    owns prepared resource resolution
    owns private href/src binding
    owns browser bootstrap lifecycle

business JS/CSS
    owns Custom Element definitions and styles
```

不得把 Config acquisition加入 Game Entry、Platform Launch Manifest、LogicalGameBootstrap 或 Main。

---

## 6. Minimal Implementation Shape

优先在现有 Renderer/Desktop composition中增加最小实现文件；允许按职责拆为 config/bootstrap helper，但不为目录对称创建新 package。

禁止新增：

```text
@loomrealm/presentation
UniversalResourceLoader
PresentationRegistry
ComponentLoader
AssetManager
```

---

## 7. Tests

必须覆盖：

```text
valid Config accepted
unknown/missing fields rejected
wrong formatVersion rejected
duplicate scripts ref rejected
duplicate styles ref rejected
missing/invalid prepared resource rejected
MIME incompatibility rejected
styles preserve declaration order
scripts preserve evaluation order
stylesheet/script load failure detected
script evaluation failure detected
window.onload gates Projector start
no credential/path/private binding exposed
```

Node tests可以关闭 validation/preparation；browser lifecycle evidence留给 M13/04 real Chromium vertical。

---

## 8. Frozen Closure

M13/01 complete when：

```text
Config v1 is validated exactly once at trusted boundary
all bootstrap refs resolve against prepared M12 Content
ordered browser bootstrap is deterministic
load/evaluation failures are explicit
window.onload is the only normal Projector start barrier
no new loader/registry/asset abstraction exists
```

除 formal contract / ADR reopen 外，实施阶段不得扩大 Config shape 或新增通用加载框架。
