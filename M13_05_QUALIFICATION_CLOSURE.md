# M13 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：05  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md) → [M13 / 03](M13_03_WEB_PROJECTOR.md) → [M13 / 04](M13_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：定义 M13 唯一 qualification/closure matrix；关闭 M11 Render replica + existing Renderer authority lifecycle → physical Web presentation seam，不扩大为 UI framework 或 Desktop full E2E。

> **M13 closure = prepared business JS/CSS 在真实 Chromium 中启动；current Control/DataAuthority + eligible per-subsystem Renderer Store 被稳定机械投影为 business-owned Custom Elements，并保持 Frozen Render identity/currentness 与 M12 resource authority boundary。**

---

## 1. Closure Scope

必须实现并 qualification：

```text
WebPresentationConfigV1 validation before side effects
prepared M12 Content resolution
private Window browser binding + ordered bootstrap
window.onload one-shot presentation start
committed Control/DataAuthority topology reevaluation
Renderer Store successful-commit reevaluation
per-subsystem presentation eligibility/currentness
thin Web Projector
stable HTMLElement identity
managed attrs/light DOM
structural tag preflight
context/data receiver ABI
PresentationResourceClient façade + Window lifetime cancellation
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

允许的新增 private state/mechanics只服务真实 M13 consumer：

```text
prepared bootstrap resource facts
package-private authority/Store reevaluation effect
per-subsystem eligibility derived from existing facts
private live identity → HTMLElement mapping
minimal last-attempted data delivery bookkeeping
Window-local structural-failure latch
Window presentation resource lifetime AbortController/signal
narrow PresentationResourceClient façade
```

禁止：

```text
@loomrealm/presentation
second Renderer/Presentation Store
Presentation topology registry
public RenderNodeIdentity DTO/service
public PresentationState/currentness
EventBus / ObserverHub
ComponentRegistry / PluginManager
AssetManager / decoder registry
ESM/dynamic loader
layer/layout engine
global service locator
MutationObserver policing
DOM transaction/rollback framework
bootstrapReady state machine
```

---

## 3. Config / Bootstrap Evidence

必须证明：

```text
closed-schema validation completes before side effects
duplicate logical refs rejected
prepared resource/version/MIME resolution
private href/src binding does not leak
ordered styles/scripts
load/evaluation failure detection
bootstrap failure → Projector never starts
window.onload → one-shot presentation start
no path/token/private binding exposure
```

Validation call count本身不是 contract；只要求 side effects前完成 fail-closed validation。

---

## 4. Authority / Currentness Evidence

必须证明：

```text
Control snapshot is the only current subsystem/generation topology authority
Store is the only per-subsystem Render replica authority
DataAuthority removal removes managed subsystem DOM without requiring later Render commit
generation change retires old DOM and old HTMLElement identity immediately
new generation waits matching carrier + complete baseline
same-generation carrier loss preserves/freeze affected subsystem DOM
healthy other subsystem remains independently projectable
partial same-generation rebaseline → no DOM/callback leakage
complete rebaseline → one reconcile
matching live identity preserved
Control transport loss alone preserves/freeze last presentation and is not empty authority
failed Store mutation → no presentation effect
```

不得创建第二份 topology、generation或 reconnect state machine。

---

## 5. Projector / ABI Evidence

必须证明：

```text
same live wire-node → same HTMLElement
same key across Domain/Subsystem does not collide
move/reparent/reorder preserves instance
managed body order deterministic
frozen subsystem element is not detached/recreated by unrelated updates
context before first insertion
context at most once
context/data receivers independent
initial data full snapshot
unchanged data is not redelivered by attrs/order-only commits
changed data delivers full current snapshot
throwing receiver does not retry same data value
business-owned Shadow DOM/private state not managed by Renderer
RenderEvent not delivered to WC/DOM
```

### Structural preflight

必须证明：

```text
all newly-required tags checked before first DOM mutation
unregistered tag → zero mutation for that reconciliation
no unknown element fallback
previous successful managed DOM preserved exactly
Window latches no-further-managed-mutation state
```

不允许用 DOM rollback framework满足该要求。

---

## 6. Resource Evidence

必须通过真实 M12 path证明：

```text
namespace + key + expectedContentVersion → bytes/MIME/version
version mismatch → CONTENT_CONFLICT
caller cancellation → CONTENT_CANCELLED
returned bytes are caller-owned
no origin/token/path/private-client exposure
```

Window presentation lifetime还必须证明：

```text
teardown aborts all in-flight resource reads
in-flight callers observe CONTENT_CANCELLED
post-teardown resource() rejects CONTENT_CANCELLED
```

M13不复制 M12 Content conformance，只证明 integration/lifetime boundary。

---

## 7. Failure Isolation Evidence

必须证明：

```text
bootstrap failure → Projector never runs
context/data callback throw → presentation-local
resource rejection → presentation-local
unregistered tag → preflight fail-closed + preserve previous DOM
ordinary DOM/business presentation failure → presentation-local best effort
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
DataAuthority removal/generation transition
per-subsystem same-generation reconnect
Control transport loss freeze
unknown-tag zero-mutation preflight
resource-backed business WC
Window teardown resource cancellation
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
[ ] M13/01 Config validation before side effects + prepared Content resolution
[ ] private Window binding + ordered styles/scripts + explicit bootstrap failure detection
[ ] window.onload one-shot presentation start / no bootstrapReady state machine

[ ] M13/02 committed DataAuthority topology reevaluation
[ ] DataAuthority removal cannot leave orphaned DOM
[ ] fresh generation retires old element universe before new baseline
[ ] successful Store commit reevaluation
[ ] per-subsystem eligibility derived from existing authority/Store facts
[ ] same-generation reconnect hides partial baseline without freezing healthy subsystem
[ ] Control transport loss preserves last presentation without inventing empty authority

[ ] M13/03 thin Projector
[ ] stable full-scope HTMLElement identity
[ ] deterministic managed body order
[ ] preflight all newly-required tags before DOM mutation
[ ] context/data receiver ordering + no unchanged-data retry/redelivery
[ ] PresentationResourceClient façade
[ ] Window lifetime cancellation
[ ] structural failure containment

[ ] M13/04 real Chromium vertical
[ ] real M12 resource read from business WC
[ ] authority removal / generation / reconnect identity evidence
[ ] unknown-tag zero-partial-DOM evidence
[ ] teardown cancellation evidence
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

如果编码过程中需要新增 public presentation package、第二份 Store/topology/currentness、generic loader/registry、global service locator、layout/layer authority、DOM rollback framework或 RenderEvent WC ABI，必须先用真实 consumer correctness requirement 证明 reopen；不得以 API symmetry、目录对称或未来猜测为理由扩张。
