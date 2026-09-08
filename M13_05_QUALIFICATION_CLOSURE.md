# M13 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：05  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md) → [M13 / 03](M13_03_WEB_PROJECTOR.md) → [M13 / 04](M13_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：定义 M13 唯一 qualification/closure matrix；关闭 M11 Render replica → physical Web presentation seam，不扩大为 UI framework 或 Desktop full E2E。

> **M13 closure = prepared business JS/CSS 在真实 Chromium 中启动，eligible Renderer Store 被稳定投影为 business-owned Custom Elements，并保持 Frozen Render identity/currentness 与 M12 resource authority boundary。**

---

## 1. Closure Scope

必须实现并 qualification：

```text
WebPresentationConfigV1 validation
prepared M12 Content resolution
ordered browser bootstrap
window.onload start barrier
Renderer Store successful-commit seam
presentation eligibility/currentness gate
thin Web Projector
stable HTMLElement identity
managed attrs/light DOM
context/data receiver ABI
PresentationResourceClient façade
presentation-local failure containment
real Chromium vertical
```

不属于 M13：

```text
loom.map
Desktop full Electron E2E
PWA Runtime / PWA full equivalence
RenderEvent → WC ABI
AssetManager / dynamic loader
layout/layer/component framework
public Render Store / PresentationState
```

---

## 2. Abstraction Budget

允许的新增 state/mechanics只服务真实 M13 consumer：

```text
prepared bootstrap resource facts
package-private Store post-commit effect
presentation eligibility derived state
private live identity → HTMLElement mapping
Window-local structural-failure latch
narrow PresentationResourceClient façade
```

禁止：

```text
@loomrealm/presentation
second Renderer/Presentation Store
public RenderNodeIdentity DTO/service
EventBus / ObserverHub
ComponentRegistry / PluginManager
AssetManager / decoder registry
ESM/dynamic loader
layer/layout engine
global service locator
MutationObserver policing
```

---

## 3. Config / Bootstrap Evidence

必须证明：

```text
closed-schema validation
duplicate logical refs rejected
prepared resource/version/MIME resolution
ordered styles/scripts
load/evaluation failure detection
window.onload before Projector start
no path/token/private binding exposure
```

---

## 4. Store / Currentness Evidence

必须证明：

```text
failed Store mutation → no presentation effect
successful eligible commit → projection
same-generation carrier loss → DOM preserved/frozen
partial rebaseline → no DOM/callback leakage
complete rebaseline → one reconcile
matching live identity preserved
fresh generation → fresh element identity universe
```

M11 Store继续是唯一 Render replica authority。

---

## 5. Projector / ABI Evidence

必须证明：

```text
same live wire-node → same HTMLElement
same key across Domain/Subsystem does not collide
move/reparent/reorder preserves instance
managed body order deterministic
context before first insertion
context at most once
context/data receivers independent
initial/update data are full current snapshots
business-owned Shadow DOM/private state not managed by Renderer
RenderEvent not delivered to WC/DOM
```

---

## 6. Resource Evidence

必须通过真实 M12 path证明：

```text
namespace + key + expectedContentVersion → bytes/MIME/version
version mismatch → CONTENT_CONFLICT
cancellation → CONTENT_CANCELLED
returned bytes are caller-owned
no origin/token/path/private-client exposure
```

M13不复制 M12 Content conformance，只证明 integration boundary。

---

## 7. Failure Isolation Evidence

必须证明：

```text
bootstrap failure → Projector never runs
context/data callback throw → presentation-local
resource rejection → presentation-local
unregistered tag → stop further managed DOM mutation, preserve last successful DOM
no failure above rolls back Renderer Store
no failure above mutates Main/Subsystem authority
no failure above becomes Runtime/Frame failure
```

---

## 8. Real Chromium Gate

Browser-observable closure必须使用 real headless Chromium，至少覆盖：

```text
customElements lifecycle
window.onload
script/style load behavior
HTMLElement identity
DOM move/reorder
same-generation reconnect
fresh-generation replacement
resource-backed business WC
```

Node/unit tests只关闭 pure validation/error mapping/internal state mechanics。

---

## 9. Canonical Gate

实现完成后新增唯一：

```text
npm run test:m13
```

Gate必须包含或严格依赖现有 `test:m12` closure，并增加：

```text
M13 package/internal tests
M13 boundary checks
real Chromium qualification
pack/publish-surface checks
```

CI 至少保持当前 Node 20 / 24 qualification policy；浏览器 runner只是测试依赖，不成为 runtime dependency。

在该命令真实存在并通过前，README/Phase Plan不得把 M13标记为 Closed。

---

## 10. Implementation Checklist

```text
[ ] M13/01 Config validation + prepared Content resolution
[ ] ordered styles/scripts + explicit bootstrap failure detection
[ ] window.onload Projector barrier

[ ] M13/02 successful Store commit seam
[ ] eligibility derived from existing Store/currentness facts
[ ] same-generation reconnect hides partial baseline
[ ] fresh generation changes identity universe

[ ] M13/03 thin Projector
[ ] stable full-scope HTMLElement identity
[ ] deterministic managed body order
[ ] context/data receiver ordering
[ ] PresentationResourceClient façade
[ ] structural failure containment

[ ] M13/04 real Chromium vertical
[ ] real M12 resource read from business WC
[ ] reconnect / reorder / generation identity evidence
[ ] callback/resource/structural failure isolation

[ ] test:m13 canonical gate
[ ] Node 20 / 24 CI green
[ ] M1–M12 regression green
[ ] build/type/pack clean
```

---

## 11. Documentation Closure After Implementation

M13 qualification完成后再：

```text
record doc/30-implementation/m13-qualification.md
mark README / Phase Plan M13 Closed
link baseline implementation + clean qualification commits
advance current executable closure from test:m12 to test:m13
```

Formal contracts/ADR不因实现关闭而改变语义。

---

## 12. Freeze Statement

M13 实施只关闭已冻结的 Web presentation seam。

如果编码过程中需要新增 public presentation package、第二份 Store/currentness、generic loader/registry、global service locator、layout/layer authority 或 RenderEvent WC ABI，必须先用真实 consumer correctness requirement 证明 reopen；不得以 API symmetry、目录对称或未来猜测为理由扩张。
