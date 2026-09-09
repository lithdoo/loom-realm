# M13 / 05 — Qualification and Closure

> 状态：**Implemented / Qualified / Closed**
> 阶段：M13 Web Presentation  
> 落地顺序：05  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md) → [M13 / 03](M13_03_WEB_PROJECTOR.md) → [M13 / 04](M13_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：定义 M13 唯一 qualification/closure matrix；关闭 existing Renderer authority lifecycle + M11 Render replica → physical Web presentation seam，不扩大为 UI framework 或 Desktop full E2E。

---

## 1. Closure Scope / Abstraction Budget

必须实现并 qualification：

```text
Config validation + prepared M12 Content + exact MIME
ordered browser bootstrap + window.onload start
Control Session/DataAuthority + Store reevaluation
per-subsystem currentness
thin Projector + stable HTMLElement identity
context/data structural ABI
PresentationResourceClient + Window lifetime
structural failure preflight
real Chromium vertical
```

允许的 private mechanics只服务以上职责：prepared bootstrap facts、reevaluation effect、derived eligibility、identity→HTMLElement mapping、minimal receiver-delivery bookkeeping、one structural-failure latch、one Window lifetime controller、narrow resource façade。

禁止新建 second Store/topology/currentness、public PresentationState/RenderNodeIdentity、EventBus、component registry/loader、AssetManager、layout/layer engine、global service locator、DOM rollback framework、mandatory presentation SDK/base class 或 `@loomrealm/presentation` package。

---

## 2. Config / MIME / Bootstrap Evidence

必须证明：

```text
closed-schema validation before side effects
duplicate logical refs rejected
prepared resource/version resolution
private href/src binding does not leak

script MIME:
  text/javascript                    → accept
  text/javascript; charset=utf-8     → accept
  application/javascript             → reject
  missing / malformed / wrong MIME   → reject

style MIME:
  text/css                           → accept
  text/css; charset=utf-8            → accept
  missing / malformed / wrong MIME   → reject

styles preserve declaration order
scripts preserve evaluation order
load/evaluation failure observed
bootstrap failure → presentation never starts
window.onload precedes first Projector mutation
```

Validation call count本身不是 contract；只要求 side effects前 fail-closed。

---

## 3. Authority / Currentness Evidence

必须证明：

```text
Control snapshot is the only Session/subsystem/generation topology authority
Store is the only per-subsystem Render replica authority
fresh Session retires entire old HTMLElement universe
DataAuthority removal removes DOM without later Render commit
generation change retires old DOM immediately
new generation waits matching carrier + complete baseline
same-generation carrier loss freezes only affected subsystem
healthy other subsystem remains projectable
partial rebaseline → no DOM/callback leakage
complete rebaseline → one reconcile + matching HTMLElement preserved
Control transport loss alone preserves last presentation
failed Store mutation → no presentation effect
```

不得创建第二份 topology/generation/reconnect state machine。

---

## 4. Projector / Structural ABI Evidence

必须证明：

```text
same full live wire-node identity → same HTMLElement
fresh Session/generation → fresh HTMLElement
same key across Domain/Subsystem does not collide
move/reparent/reorder preserves instance
managed body order deterministic
frozen subsystem element not detached/recreated by unrelated update
context before first insertion / at most once
context/data receiver independence
```

Data equality/callback必须验证 formal API structural semantics：

```text
{"a":1,"b":2} → {"b":2,"a":1}
→ no receiveRenderData redelivery

[1,2] → [2,1]
→ receiveRenderData full current snapshot

{"a":1} → {"a":1,"b":null}
→ receiveRenderData full current snapshot

attrs/order-only commit + structurally equal data
→ no redelivery

throwing receiver + same structural value
→ no automatic retry
```

M13 ABI是 structural；qualification business element无需依赖新的 public presentation package/type subpath。

### Unknown-tag structural failure

```text
all newly-required tags checked before first DOM mutation
unregistered tag → zero mutation for that reconciliation
no unknown element fallback / no late-registration recovery
previous successful managed DOM preserved exactly
Window permanently stops future managed DOM mutation
later authority/Store change still causes zero DOM mutation in failed Window
```

不得使用 DOM rollback framework。

---

## 5. Resource / Failure Evidence

必须经 real M12 path证明：

```text
namespace + key + expectedContentVersion → bytes/MIME/version
version mismatch → CONTENT_CONFLICT
caller cancellation → CONTENT_CANCELLED
returned bytes are caller-owned
no origin/token/path/private-client exposure

Window teardown
→ cancel all in-flight presentation reads
→ callers CONTENT_CANCELLED
→ later well-formed resource() CONTENT_CANCELLED
```

Callback/resource/ordinary DOM failure保持 presentation-local best effort；unknown-tag采用更强 fail-closed。任何 presentation failure都不得 rollback Store、mutate Main/Subsystem 或自动 fail Runtime/Frame。

---

## 6. Real Chromium Gate

Real headless Chromium至少覆盖：

```text
customElements lifecycle
window.onload
script/style load behavior
HTMLElement identity / DOM moves
fresh Session
DataAuthority removal / generation transition
per-subsystem reconnect / Control loss
unknown-tag zero-mutation preflight + permanent freeze
resource-backed business WC
Window teardown resource cancellation
```

Node/unit tests只关闭 pure validation/error mapping/internal mechanics。

---

## 7. Canonical Gate / Checklist

实现完成后新增唯一：

```text
npm run test:m13
```

Gate必须包含或严格依赖 `test:m12`，并增加 M13 package/internal tests、boundary checks、real Chromium qualification 与 pack/publish-surface checks。CI保持 Node 20 / 24 policy；browser runner只作为 test dependency。

Checklist：

```text
[ ] M13/01 Config + exact MIME + bootstrap
[ ] M13/02 authority/Store reevaluation + per-subsystem currentness
[ ] M13/03 thin Projector + structural ABI + resource lifetime
[ ] M13/04 real Chromium vertical
[ ] structural equality evidence
[ ] unknown-tag zero-partial-DOM + permanent freeze evidence
[ ] real M12 resource + teardown evidence
[ ] no new public presentation package/type surface required for closure
[ ] test:m13
[ ] Node 20 / 24 + M1–M12 regression + build/type/pack green
```

在该 gate真实存在并通过前，M13不得标记 Closed。

---

## 8. Documentation Closure / Freeze

M13 qualification完成后再记录 `doc/30-implementation/m13-qualification.md`、标记 README/Phase Plan Closed，并把 executable closure从 `test:m12`推进到 `test:m13`。

如果编码中需要新增 public presentation package、第二 Store/topology/currentness、generic loader/registry、layout/layer authority、DOM rollback或 RenderEvent WC ABI，必须先用真实 correctness/consumer requirement 证明 reopen；API symmetry、目录对称、测试便利或未来猜测不构成理由。
