# M13 / 02 — Renderer Presentation Seam

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：02  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md)  
> 正式契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：把现有 Renderer Control/Data-slot authority lifecycle 与 M11 committed Store连接到 Projector；不建立第二份 Store、topology或 currentness authority。

> **M13/02 只从现有 Control snapshot、Data slot 与 Render Store读取事实。Presentation拥有“何时机械重算”的私有 effect，不拥有新的 desired authority。**

---

## 1. Frozen Inputs / Effects

Presentation启动后只有两类 production reevaluation source：

```text
A. committed Renderer authority topology change
   → current Control Snapshot 的 dataAuthorities 发生 committed change

B. successful current Render Store commit
   → render.domains / render.snapshot / render.patch accepted + atomically committed
```

概念路径：

```text
current Control Snapshot ───────────────┐
                                       ├→ package-private presentation reevaluation
current per-subsystem Data slot/Store ─┘
                                                ↓
                                      per-subsystem eligibility
                                                ↓
                                      M13/03 Web Projector
```

Failed Store mutation：

```text
→ no presentation effect
```

Business code不得订阅该 seam。

---

## 2. Existing Facts Remain Authority

M13只读取既有事实：

```text
current Control peer/snapshot
current dataAuthorities[]
per-subsystem current/pending/failed Data slot
Data identity: subsystemKey + generation + dataProfile
RendererRenderStore:
    currentCarrier
    registrySeen
    current Registry Domains
    per-Domain baselined state
    committed roots/tree
```

不得增加：

```text
PresentationStore
DesiredDomTree
PresentationTopology registry
public PresentationState
second generation/revision tracker
reconnect coordinator framework
```

DOM存在与否不得反向决定 authority/currentness。

---

## 3. Per-subsystem Eligibility

Eligibility 按 current `(subsystemKey, generation)` 独立计算，不是 Window-global all-or-nothing gate：

```text
committed DataAuthority exists for subsystemKey/generation
AND matching current Data carrier exists
AND matching Store currentCarrier
AND registrySeen
AND every Domain in that Store's current Registry is baselined
```

Fresh Registry为空时，Registry commit本身即可形成 complete baseline，并允许该 subsystem reconcile 到空。

一个 subsystem same-generation reconnect时，其他独立且 eligible 的 subsystem MAY继续 projection；stale subsystem只贡献其最后一次成功 reconcile 的 frozen managed elements。

Window-level deterministic body order仍由 M13/03统一机械维护；对 frozen element的相对插入位置变化不得造成其 detach/recreate或 receiver callback。

---

## 4. Committed Authority Topology Change

Control snapshot 是“哪些 subsystem/generation 当前有 authority”的唯一 topology source。

### DataAuthority removed

```text
committed snapshot removes subsystemKey
→ that subsystem is authoritatively no longer current
→ retire/remove its managed elements
→ discard corresponding private element identity/delivery bookkeeping
```

该删除不等待未来 Render Store commit。

### Generation changed

```text
committed snapshot: subsystemKey G → G+1
→ G identity universe ends immediately
→ retire/remove G managed elements
→ do not reuse G HTMLElement identity
→ wait G+1 matching Data carrier + complete baseline
→ project fresh G+1 element universe
```

相同 textual `domainId/key` 在 G+1 中仍是 fresh identity。

不得把 topology复制到 Presentation registry；reevaluation时直接读取 current Control/Data-slot facts。

---

## 5. Transport Loss Is Not Authority Removal

必须区分 committed authority change 与 local transport loss。

### Same-generation Data carrier loss

```text
Control仍声明 same subsystemKey/generation
+ current Data carrier lost
→ keep that subsystem last committed managed DOM mounted
→ freeze that subsystem projection
→ no receiveRenderContext
→ no receiveRenderData
→ no LoomRealm-caused detach/reinsert
```

Replacement carrier：

```text
fresh Registry commit
→ partial Domain baselines may update Store
→ stale subsystem DOM remains unchanged
→ all current Domains baselined
→ one reconciliation opportunity
→ matching live wire-node identity preserves HTMLElement
```

### Control carrier terminal / local mirror loss

Local Control terminal本身不是一个新的 committed empty authority snapshot：

```text
→ freeze last successful managed presentation
→ do not reinterpret as dataAuthorities=[]
→ no presentation-driven authority mutation
```

后续 fresh current Control snapshot再按其 committed topology决定 remove / generation change / resume。

---

## 6. Successful Store Commit Discipline

对 matching current Data slot，presentation effect必须满足：

```text
successful Store commit only
commit state visible before reevaluation
one commit produces at most one local scheduling opportunity
partial reconnect state never leaks to DOM
presentation failure cannot rollback Store
```

实现可以同步调用或做一个 bounded/coalesced local scheduling point；不得引入 EventBus、history queue或 public observer API。

`render.event` 不进入 Web Presentation ABI，也不成为 Projector trigger。

---

## 7. Tests

必须覆盖：

```text
failed Store mutation → no presentation effect
successful eligible Store commit → projection opportunity
successful ineligible Store commit → stale DOM unchanged
DataAuthority removal removes subsystem DOM without requiring another Render commit
generation change retires old DOM before new baseline and never reuses old HTMLElement
same-generation carrier loss preserves/freeze only affected subsystem
healthy other subsystem remains independently projectable
partial same-generation rebaseline stays hidden
complete same-generation rebaseline enables one reconcile
empty Registry reconciles that subsystem to empty
Control terminal alone preserves/freeze last presentation
fresh Control snapshot re-evaluates authoritative topology
no second topology/store/revision/currentness machine
```

---

## 8. Frozen Closure

M13/02 complete when：

```text
Control snapshot remains the only presentation topology authority
M11 Store remains the only per-subsystem Render replica authority
DataAuthority removal/generation change cannot leave orphaned old DOM
same-generation transport loss cannot be mistaken for authority removal
eligibility is per-subsystem and derived only from existing facts
partial reconnect never leaks mixed state
business cannot observe or mutate the internal seam
```

不得为 Projector方便而复制 Control topology、Store、generation、Registry 或 Domain state。
