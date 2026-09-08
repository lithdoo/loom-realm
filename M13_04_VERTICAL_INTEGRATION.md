# M13 / 04 — Web Presentation Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：04  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md) → [M13 / 03](M13_03_WEB_PROJECTOR.md)  
> 正式契约：[Web Presentation Config v1](doc/15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：在真实 headless Chromium 中跑通 Config → M12 Content → Renderer Store → Projector → business Custom Element；验证 browser-observable lifecycle/currentness，而不提前实现 M15 Desktop full E2E。

> **M13/04 的浏览器可以是 qualification harness，但 Config、ResourceClient、Renderer Store、Projector 与 WC ABI必须走生产代码路径。**

---

## 1. Frozen Vertical

```text
prepared M12 Content fixture
→ WebPresentationConfigV1
→ real browser bootstrap
→ business JS/CSS
→ customElements.define(...)
→ window.onload
→ real @loomrealm/renderer Store
→ M13/02 eligibility seam
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
```

具体 runner属于 test plumbing，不进入 runtime architecture。

---

## 3. Bootstrap Evidence

必须证明：

```text
Config invalid → browser projection never starts
scripts/styles preserve declaration order
business scripts register Custom Elements
resource load/evaluation failure is observed
window.onload occurs before first Projector mutation
```

不要通过预注册 test-only elements绕过 Config bootstrap。

---

## 4. Identity / Ordering Evidence

至少构造：

```text
same key in two Domains
same key in two Subsystems
root reorder
tree reparent
fresh generation reusing textual key
```

证明：

```text
same live wire-node → same HTMLElement
different live identity → different HTMLElement
move/reorder moves existing instance
fresh generation → fresh instance
managed body sequence deterministic
```

---

## 5. Reconnect Evidence

Same-generation carrier loss：

```text
keep last managed DOM mounted
no context/data callback
no disconnectedCallback/connectedCallback caused by LoomRealm
```

Replacement baseline：

```text
fresh Registry
→ first/partial Domain baselines
→ Store may advance
→ DOM unchanged
→ all current Domains baselined
→ one reconcile
→ matching HTMLElement identity preserved
```

Fresh generation必须 retire old managed elements并创建 fresh identity universe。

---

## 6. WC ABI Evidence

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
data initial + committed full updates
resource version conflict/cancellation/value ownership
receiver/resource failure stays presentation-local
```

---

## 7. Structural Failure Evidence

构造 Store 中实际需要的 unregistered tag：

```text
Projector running
→ current Render requires unknown tag
→ no unknown fallback HTMLElement created
→ no wait-for-upgrade behavior
→ further managed DOM mutation stops
→ last successful managed DOM preserved
→ Store/Main/Subsystem remain unchanged
```

恢复不在原 Window内尝试；fresh Window属于后续产品 composition。

---

## 8. Deferred Physical Scope

M13/04 不要求：

```text
Electron BrowserWindow full composition
Desktop reload/shutdown E2E
physical keyboard/gamepad wiring
loom.map business behavior
PWA Worker/MessagePort runtime
PWA storage/fetch equivalence
```

这些分别属于 M14–M17。

---

## 9. Frozen Closure

M13/04 complete when real Chromium proves：

```text
bootstrap ordering/barrier is real
Custom Element lifecycle ordering is real
Store eligibility/currentness is browser-observable as specified
HTMLElement identity survives allowed moves/reconnect
fresh generation changes identity universe
PresentationResourceClient reaches real M12 bytes
presentation failures do not mutate application authority
```

不得以 browser mock替代上述 closure evidence，也不得为测试方便增加 production framework。
