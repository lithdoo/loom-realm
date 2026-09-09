# LoomRealm Web Presentation Config v1

> 层级：正式契约  
> 状态：Active / Normative / Frozen  
> 契约版本：1  
> 稳定程度：Frozen for M13 implementation  
> Milestone：M13 Web Presentation  
> 主要定义：Window-level business JS/CSS declaration、M12 prepared Content resolution、MIME compatibility、ordered browser bootstrap、`window.onload` start barrier  
> 依赖：[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 相关：[Web Presentation API v1](./web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Config 只描述“当前 Renderer Window 在启动 projection 前加载哪些 business JS/CSS”。它不是 Game topology、Subsystem binding、runtime asset API 或 module-loader contract。**

---

## 1. Acquisition Boundary

Config source acquisition属于 concrete product/platform：

```text
product/platform-private source acquisition
→ read / parse candidate JSON
────────────────────────────────────────
Web Presentation Config v1 begins
→ validate
→ resolve prepared Content refs
→ browser bootstrap
```

本契约不定义 path、URL、FileSystemHandle、picker、settings key 或 opaque locator。Config acquisition/material MUST NOT进入 GameEntry、Platform Launch Manifest、LogicalGameBootstrap、Main/Frame 或 RenderNode。

---

## 2. Normative Shape

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

Top-level MUST 精确包含：

```text
formatVersion
scripts
styles
```

`formatVersion` MUST === `1`。Unknown/missing fields invalid。

`scripts` 与 `styles` 各自列表内 `(namespace,key)` MUST 唯一；duplicate config MUST 在任何 browser bootstrap side effect 前拒绝。实现不得 dedupe、repeat 或自行解释 duplicate。

V1 MUST NOT增加 subsystem、module/url/path、credential、loader/resolver 或 runtime resource capability 字段。

---

## 3. Window Scope

`scripts[]` / `styles[]` 属于整个 Renderer Window presentation environment，不绑定 Subsystem、Frame、RenderDomain 或 RenderNode.tag。

一个 script MAY 注册多个 Custom Elements；多个 Subsystem MAY 使用同一 element definition。Phase 1 不在同一 Window 中按 Subsystem 动态装卸 bootstrap resources。

---

## 4. Prepared Content / MIME

每个 ref使用 M12 logical identity：

```text
namespace + hierarchical ResourceKey
```

trusted composition MUST 在 current prepared Content view 中 resolve ref，并在 browser side effect 前固定：

```text
contentVersion
MIME
private browser-load binding material
```

Business config/WC MUST NOT获得 filesystem path、FSDB handle、Content bearer、origin 或 privileged URL。

### 4.1 Frozen MIME compatibility

M13 V1 不依赖 platform/browser-specific MIME sniffing。Compatibility按 parsed media type **essence** 判断；参数（例如 `charset=utf-8`）不参与 equality。

```text
scripts[] item
→ MIME essence MUST equal "text/javascript"

styles[] item
→ MIME essence MUST equal "text/css"
```

因此：

```text
text/javascript; charset=utf-8  ✅ script
text/css; charset=utf-8         ✅ style
application/javascript         ❌ M13 V1 script
text/plain                     ❌
missing/unparseable MIME       ❌
```

Wrong/missing MIME是 bootstrap/config failure；实现 MUST NOT通过 browser sniff、fallback type 或 platform-specific allowlist扩大 V1 semantics。

---

## 5. Ordered Browser Bootstrap

Current V1 realization：

```text
styles[]  → ordered <link rel="stylesheet" href="...">
scripts[] → ordered classic <script src="..."></script>
```

要求：

```text
styles preserve declaration order
scripts preserve declaration evaluation order
scripts MUST NOT use async ordering
no implementation-defined dedupe
business scripts use native customElements.define(...)
```

M13不建立 ESM/Blob module graph、dynamic component loader、PluginManager、second registry或 tag vocabulary。

---

## 6. `window.onload` Start Barrier

正常路径：

```text
pure fail-closed validation
→ prepared Content resolution + MIME fixation
→ private href/src binding
→ ordered styles/scripts
→ browser load/evaluation
→ business customElements registration
→ window.onload
→ start presentation once
```

Validation MUST complete before Content/browser side effects。`window.onload` 是 normal presentation start barrier，但不是 resource success 的替代证明。

实现 MUST 独立观察其 bootstrap mechanism 可观察到的 stylesheet/script load/evaluation failure；failure 时 presentation MUST NOT start。

Config 不声明 expected tag set。Projector实际需要某 `RenderNode.tag` 时仍未注册，属于 Web Presentation API v1 的 projection-time structural failure。

---

## 7. Window Lifetime

```text
Renderer Window lifetime
=
Web presentation bootstrap environment lifetime
=
Custom Element registry lifetime
```

需要 incompatible definitions 时使用 fresh Renderer Window，不在同一 Window 中卸载/重定义既有 Custom Elements。

---

## 8. Bootstrap vs Runtime Resources

```text
bootstrap resources
    JS/CSS
    declared by Config v1
    loaded before presentation start

runtime resources
    image/map/audio/data/etc.
    read after start through PresentationResourceClient
```

Config MUST NOT 演化成 runtime asset API；PresentationResourceClient MUST NOT 演化成 dynamic script/component loader。

---

## 9. Failure Boundary

Bootstrap failure包括：

```text
invalid shape/version/duplicate
missing/invalid prepared resource
MIME mismatch
stylesheet/script load failure
script evaluation failure
```

结果：

```text
presentation does not start
no Renderer Store rollback
no Main/Subsystem authority mutation
not Render protocol-fatal
```

Unregistered RenderNode.tag、receiver/resource/DOM failure属于 presentation phase，不属于 Config phase。

---

## 10. Qualification Minimum

必须证明：

```text
closed-schema validation before side effects
duplicate refs rejected
exact MIME essence rules
ordered styles/scripts
load/evaluation failure detection
business customElements registration
window.onload before first Projector mutation
no path/token/private binding exposure
```

Browser-observable evidence MUST 使用 real Chromium；纯 validation/resolution可由 Node tests关闭。

---

## 11. Frozen Invariants / Reopen Rule

1. Config exact shape = `{formatVersion,scripts,styles}`；
2. source acquisition属于 product/platform-private mechanics；
3. refs复用 M12 logical Content identity；
4. script/style MIME essence分别固定为 `text/javascript` / `text/css`；
5. bootstrap固定为 ordered `<link>` + ordered classic `<script>`；
6. `window.onload` 后 presentation才可启动；
7. Config不声明 tag vocabulary、runtime resources或 Subsystem binding；
8. M13不建立 generic loader/registry/framework。

除 correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，本契约在 M13 implementation/qualification期间不 reopen。
