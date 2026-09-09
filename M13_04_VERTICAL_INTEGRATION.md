# M13 / 04 — Web Presentation Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：04  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md) → [M13 / 03](M13_03_WEB_PROJECTOR.md)  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：在真实 headless Chromium 中跑通 Config → M12 Content → Renderer authority/Store → Projector → business Custom Element；验证 browser-observable lifecycle/currentness，而不提前实现 M15 Desktop full E2E。

> **M13/04 的浏览器可以是 qualification harness，但 Config/bootstrap helper、ResourceClient、Renderer authority/Data-slot/Store、Projector 与 WC ABI必须走生产代码路径。**

---

## 1. Frozen Vertical

```text
prepared M12 Content fixture
→ concrete test Window composition
→ WebPresentationConfigV1
→ real browser bootstrap
→ business JS/CSS
→ customElements.define(...)
→ window.onload
→ start real presentation
→ current Renderer Control/Data authority
→ real per-subsystem Renderer Store
→ M13/02 reevaluation/eligibility
→ M13/03 Projector
→ document.body
→ test business Custom Elements
```

需要 resource evidence时：

```text
business WC
→ PresentationResourceClient
→ real Renderer-private M12 ResourceClient
→ real Content HTTP/service path
→ bytes
```

---

## 2. Browser Requirement

必须使用真实 Chromium；jsdom/纯 DOM mock不能作为 closure evidence，因为以下行为是 M13 correctness 的一部分：

```text
customElements registry
connectedCallback/disconnectedCallback
attributeChangedCallback interaction
script evaluation
stylesheet/script load events
window.onload
HTMLElement object identity
DOM move/reorder behavior
AbortSignal/fetch cancellation interaction
```

具体 runner属于 test plumbing，不进入 runtime architecture。

---

## 3. Bootstrap Evidence

必须证明：

```text
Config invalid → Content/browser bootstrap side effects do not begin
scripts/styles preserve declaration order
business scripts register Custom Elements
resource load/evaluation failure is observed
bootstrap failure → presentation never starts
window.onload occurs before first Projector mutation
```

不要通过预注册 test-only elements绕过 Config bootstrap。

---

## 4. Authority Topology / Per-subsystem Currentness Evidence

至少使用两个 subsystem A/B。

### Fresh Session

```text
Session S projects A/B
→ current Control is replaced by fresh Session S'
→ S' may reuse same subsystemKey/generation/domainId/key text
→ every S HTMLElement retires
→ no S HTMLElement is reused by S'
→ S' waits matching Data carriers/baselines before fresh projection
```

### Committed removal

```text
A + B current and projected
→ next committed Control snapshot removes A DataAuthority
→ A managed DOM removed without any later A Render message
→ B remains valid
```

### Fresh generation

```text
A generation G projected
→ committed Control snapshot changes A to G+1
→ G DOM retires immediately
→ no G HTMLElement is reused
→ G+1 waits for matching carrier + complete baseline
→ same textual key receives fresh HTMLElement
```

### Same-generation carrier loss

```text
A carrier lost while Control still declares A generation G
→ A DOM stays mounted/frozen
→ A fires no context/data/disconnect/reconnect caused by loss
→ B remains independently projectable
```

### Partial rebaseline

```text
A replacement carrier
→ fresh Registry
→ first/partial Domain baselines
→ Store may advance
→ A DOM unchanged
→ all current A Domains baselined
→ one A reconciliation
→ matching HTMLElement identity preserved
```

### Control transport loss

```text
current Control peer terminal without committed replacement Snapshot
→ last managed DOM remains frozen
→ implementation does not reinterpret local loss as empty authoritative topology
```

---

## 5. Identity / Ordering Evidence

至少构造：

```text
same key in two Domains
same key in two Subsystems
root reorder
tree reparent
fresh generation reusing textual key
fresh Session reusing all textual identity components except sessionId
```

证明：

```text
same live wire-node → same HTMLElement
different live identity → different HTMLElement
move/reorder moves existing instance
fresh generation / fresh Session → fresh instance
managed body sequence deterministic
frozen subsystem element is never detached/recreated by another subsystem update
```

---

## 6. WC ABI / Data Delivery Evidence

Test business elements至少覆盖：

```text
context-only receiver
data-only receiver
both receivers
neither receiver
throwing receiver
resource consumer
```

验证：

```text
context before first managed insertion
context at most once
connectedCallback cannot rely on initial attrs/children/data
data initial full snapshot
changed data → new full snapshot
attrs/order-only update with unchanged data → no data callback
throwing data receiver → no retry until data actually changes
context/data receivers independent
receiver/resource failure stays presentation-local
```

---

## 7. Structural Failure Evidence

构造一次 reconciliation，同时包含：

```text
one otherwise-valid DOM change
+ one new unregistered RenderNode.tag
```

必须证明：

```text
Projector preflight detects unknown tag before mutation
→ zero managed DOM change from that reconciliation
→ no unknown fallback HTMLElement created
→ no wait-for-upgrade behavior
→ further managed DOM mutation stops for this Window
→ previous successful managed DOM remains exactly preserved
→ Store/Main/Subsystem remain unchanged
```

随后再制造一个真实 committed authority topology change（例如 remove subsystem 或 generation change），必须继续证明该 failed Window 的 DOM仍完全不变；authority/Store事实可前进，但 presentation不得自行“恢复”。

恢复不在原 Window内尝试；fresh Window属于后续 product composition。

---

## 8. Presentation Resource Lifetime Evidence

必须真实证明：

```text
WC resource() → real M12 bytes
expected version mismatch → CONTENT_CONFLICT
caller AbortSignal → CONTENT_CANCELLED
returned bytes mutation does not affect later reads

in-flight read
→ Window presentation teardown
→ underlying read cancelled
→ business sees CONTENT_CANCELLED

post-teardown resource()
→ CONTENT_CANCELLED
```

不得向 WC 暴露 token/path/origin/private Renderer client。

---

## 9. Deferred Physical Scope

M13/04 不要求：

```text
Electron BrowserWindow full composition
Desktop reload/shutdown E2E
physical keyboard/gamepad wiring
loom.map business behavior
PWA Worker/MessagePort runtime
PWA storage/fetch equivalence
```

Window presentation teardown在 Chromium harness中只 qualification M13 resource/callback lifetime；不声称 M15 Desktop shutdown E2E已关闭。

---

## 10. Frozen Closure

M13/04 complete when real Chromium proves：

```text
bootstrap ordering/barrier is real
Session/DataAuthority topology changes drive presentation correctly
currentness/reconnect is scoped per subsystem
Custom Element lifecycle ordering is real
HTMLElement identity survives allowed moves/reconnect but never crosses Session/generation identity boundary
unknown-tag structural failure causes zero partial DOM mutation and stays frozen across later authority changes
PresentationResourceClient reaches real M12 bytes and dies with Window lifetime
presentation failures do not mutate application authority
```

不得以 browser mock替代上述 closure evidence，也不得为测试方便增加 production framework。
