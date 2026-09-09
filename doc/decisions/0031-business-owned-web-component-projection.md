# ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica

> 状态：Accepted / Frozen for M13 implementation  
> 日期：2026-09-08  
> 最近复核：2026-09-09  
> 层级：架构决策记录  
> 决策范围：M13 Web Presentation ownership、currentness、thin projection、failure strategy  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  

---

## 1. Context

M11 已关闭：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ Renderer authoritative replica
```

但 physical Web presentation仍为空白。如果直接由首个 business consumer自行补齐，会混合 Render authority、DOM lifetime、component loading与资源访问，并很容易形成第二份 projection authority或隐性 UI framework。

Phase 1 的 Desktop/PWA Renderer 都使用 Web environment，因此 M13选择先冻结一个最薄的 Web seam。

---

## 2. Decision

```text
Main / Renderer Control snapshot
    owns current Session + DataAuthority topology

Subsystem
    owns business Render authority

Renderer Store
    owns current per-subsystem Render replica

Web Projector
    reads current topology + eligible Store facts
    exclusively mutates LoomRealm-managed DOM
    injects narrow presentation context

Business Web presentation
    owns concrete Custom Element semantics
    owns Shadow DOM / Canvas / WebGL / private presentation state
```

核心决策：

> **LoomRealm不拥有业务组件语义；它只把 current authoritative facts机械投影到 business-owned Custom Elements。**

DOM不是 Store/Main authority source；Presentation不得复制 Control topology、Store desired state或 currentness成为第二 authority。

---

## 3. Why This Shape

### Business-owned Custom Elements

选择 browser-native Custom Elements，而不是 LoomRealm component framework，因为：

- `RenderNode.tag` 已是 opaque business identifier；
- business 需要 Shadow DOM/Canvas/WebGL/private state；
- browser registry/lifecycle已经提供足够 physical realization；
- Core 不应拥有 tag vocabulary、component inheritance或 module mapping。

### Existing authority drives currentness

Presentation reevaluation只来自 current Control authority topology 与 successful Store commit。这样可直接表达 DataAuthority removal、fresh generation、same-generation reconnect，而无需 PresentationStore、topology registry或 reconnect coordinator。

### Fail-closed structural error

Unknown required tag在 DOM mutation前 preflight；失败后冻结该 Window，而不是引入 DOM rollback、late loader或 recovery state machine。Fresh Window是 Phase 1 唯一结构性恢复边界。

### Narrow resource capability

Business WC只获得 PresentationResourceClient façade，复用 M12 private ResourceClient；这避免泄漏 token/path/origin，也避免预建 AssetManager/decoder graph。

---

## 4. Consequences

得到：

```text
same full live wire identity → same HTMLElement
fresh Session/generation → fresh element universe
same-generation carrier loss → preserve affected DOM
partial rebaseline → hidden
committed authority removal → presentation updates without waiting Render commit
business WC owns layout/private rendering
real Chromium closes browser-observable semantics
```

代价：

```text
Web-specific M13 seam
unknown-tag failure requires fresh Window recovery
business presentation must honor managed host/light-DOM read-only boundary
```

这些是 deliberate Phase 1 trade-offs，不要求增加通用 abstraction来隐藏。

---

## 5. Rejected Alternatives

明确拒绝：

```text
LoomRealm component library / mandatory base CustomElement
PresentationStore / desired DOM tree / topology registry
public PresentationState / RenderNodeIdentity service
component registry / dynamic loader / PluginManager
AssetManager / decoder registry / prefetch graph
Presentation DSL / scene graph
layer/layout engine / cross-Subsystem stacking authority
global Window service locator
MutationObserver policing
DOM transaction/rollback framework
RenderEvent → WC ABI
```

同时不为了 TypeScript package symmetry新增 `@loomrealm/presentation`。Formal API 是 structural ABI；若后续真实 business author consumer证明需要 type-only packaging，再以最小 surface reopen。

---

## 6. What Remains Unchanged

M13不修改：

```text
M11 Render Update v1 authority/identity/revision semantics
M12 Content identity/version/credential boundary
Main Session/Runtime/Frame/InputTarget/DataAuthority authority
Subsystem Frame/Input/Render/Content author surface
Desktop/PWA physical transport/storage differences
```

Config exact shape/MIME/bootstrap、receiver ordering/data equality、resource error/lifetime、unknown-tag precise failure semantics由 formal contracts拥有；本 ADR不复制第二份 protocol正文。

---

## 7. Freeze / Reopen

M13 设计已 Preimplementation Closed。实施阶段只允许选择不改变 formal observable semantics 的 private mechanics，例如文件拆分、identity map结构、同步或有限 coalescing。

只有 demonstrated correctness/security contradiction、cross-contract conflict 或真实 consumer capability failure 才允许 reopen；API symmetry、目录对称、测试便利或未来猜测不构成理由。
