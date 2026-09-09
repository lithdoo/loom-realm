# M13 / 01 — Web Presentation Bootstrap

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：01  
> 最近复核：2026-09-09  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)  
> 相关契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：关闭 Window-level Config validation、prepared Content resolution 与 ordered browser bootstrap；不建立通用 loader、registry 或 presentation framework。

> **M13/01 只回答“Renderer Window 在 Projector 启动前如何准备业务 JS/CSS”。Config source、prepared Content physical binding 与 document lifecycle 都留在具体 app / Renderer Window composition。**

---

## 1. Frozen Flow

```text
product/platform-private config acquisition
→ parse candidate JSON
→ pure fail-closed WebPresentationConfigV1 validation
→ resolve refs against current prepared Content view
→ freeze contentVersion / MIME facts
→ bind prepared resources to private browser-loadable href/src
→ materialize ordered styles/scripts
→ observe bootstrap resource outcome
→ window.onload
→ start presentation once
```

Validation MUST complete before Content/browser side effects. Implementations MAY defensively revalidate at a trusted boundary；M13不冻结“exactly once validation”这种无业务语义的调用次数约束。

`window.onload` 是 normal Projector start barrier，但不是 bootstrap resource 成功的替代证明。Presentation在该 barrier 后启动；M13/02不再维护长期 `bootstrapReady` currentness state。

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
private browser href/src binding
ordered stylesheet materialization
ordered classic script evaluation
explicit bootstrap load/evaluation failure reporting
window.onload start barrier
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
presentation currentness state machine
```

---

## 3. Ownership

```text
concrete app / Renderer Window composition
    owns Config source acquisition
    owns current prepared Content view selection
    owns private browser href/src binding
    owns document / Window bootstrap lifecycle

trusted shared implementation, if useful
    MAY own pure Config validation
    MAY own small prepared-ref/bootstrap helpers

business JS/CSS
    owns Custom Element definitions and styles
```

不得把 Config acquisition/material加入：

```text
Game Entry
Platform Launch Manifest
LogicalGameBootstrap
Main / Frame
RenderNode / Render Update
```

M13不为了共享 helper 新增 `@loomrealm/presentation` 或 universal platform port。

---

## 4. Prepared Resource Boundary

Config public facts只保留：

```text
namespace
key
```

trusted preparation固定：

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

## 5. Browser Bootstrap

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
Projector does not exist as a running consumer before window.onload
```

Current implementation必须显式观察其 bootstrap mechanism 可观察到的 stylesheet/script load failure 与 script evaluation failure；发生失败时不得继续进入 running Projector。真实 browser evidence由 M13/04关闭。

`RenderNode.tag` 是否已注册不在 Config phase推断；Projector真正需要 materialize 时仍未注册，属于 M13/03 projection-time structural failure。

Bootstrap failure：

```text
→ presentation never starts
→ no Renderer Store rollback
→ no Main/Subsystem authority mutation
→ not Render protocol-fatal
```

---

## 6. Minimal Implementation Shape

优先在 concrete Window composition 与现有 Renderer trusted implementation间保持少量明确 helper；不为目录对称创建新 package。

禁止新增：

```text
@loomrealm/presentation
UniversalResourceLoader
PresentationRegistry
ComponentLoader
AssetManager
PresentationBootstrapState machine
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
validation fails before Content/browser side effects
missing/invalid prepared resource rejected
MIME incompatibility rejected
styles preserve declaration order
scripts preserve evaluation order
stylesheet/script load failure detected
script evaluation failure detected
window.onload precedes presentation start
no credential/path/private binding exposed
```

Node tests可以关闭 pure validation/preparation；browser lifecycle evidence留给 M13/04 real Chromium vertical。

---

## 8. Frozen Closure

M13/01 complete when：

```text
Config is fully validated before side effects
all bootstrap refs resolve against prepared M12 Content
private physical binding stays in concrete Window composition
ordered browser bootstrap is deterministic
load/evaluation failures are explicit
window.onload hands off once into presentation start
no bootstrapReady authority/state machine exists
no new loader/registry/asset abstraction exists
```

除 formal contract / ADR reopen 外，实施阶段不得扩大 Config shape 或新增通用加载框架。
