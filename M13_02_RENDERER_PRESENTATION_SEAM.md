# M13 / 02 — Renderer Presentation Seam

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：02  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md)  
> 正式契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：在现有 M11 Renderer Store 上增加最窄的 successful-commit → presentation seam 与 eligibility gate；不建立第二份 Store/currentness authority。

> **M13/02 只消费 M11 已提交的 current replica。DOM 不参与 currentness 判断，presentation 也不拥有独立 desired state。**

---

## 1. Frozen Flow

```text
render.* wire
→ M11 Store validation
→ atomic successful commit
→ package-private post-commit effect
→ presentation eligibility gate
→ M13/03 Web Projector
```

Failed Store mutation：

```text
→ no presentation effect
```

Business code不得订阅该 seam。

---

## 2. Existing Facts Are Authority

M13复用 Store 已有事实：

```text
current carrier / generation
registrySeen
current Registry Domains
per-Domain baselined state
committed roots/tree
```

不得增加：

```text
PresentationStore
DesiredDomTree
public PresentationState
second generation/revision tracker
reconnect coordinator framework
```

---

## 3. Eligibility

Projector只有在 bootstrap ready 且 current presentation baseline完整时可 reconcile：

```text
bootstrapReady
AND current carrier exists
AND registrySeen
AND every Domain in current Registry is baselined
```

Fresh Registry为空时，Registry commit本身即可形成 complete baseline，并允许 reconcile 到空 managed presentation。

---

## 4. Same-generation Carrier Loss

冻结行为：

```text
current carrier loss
→ keep last committed managed DOM mounted
→ freeze Projector mutation
→ no receiveRenderContext
→ no receiveRenderData
→ no LoomRealm-caused detach/reinsert
```

Replacement carrier开始后：

```text
fresh Registry commit
→ partial Domain rebaseline may update Store
→ no DOM mutation yet
→ complete baseline
→ exactly one current-state reconciliation opportunity
```

Matching live wire-node identity继续复用 existing HTMLElement。

---

## 5. Fresh Generation

Fresh generation结束旧 identity universe：

```text
old generation managed elements retire
new generation baseline completes
→ new identity universe
```

相同 textual `domainId/key` 不允许继承旧 generation HTMLElement identity。

Generation/currentness继续由 existing Renderer Data/Store mechanics提供；M13不 mint 新 epoch。

---

## 6. Post-commit Discipline

Presentation effect必须满足：

```text
successful Store commit only
commit state visible before effect
one commit produces at most one scheduling opportunity
partial reconnect state never leaks to DOM
presentation failure cannot rollback Store
```

实现可以同步调用或做一个 bounded coalesced local scheduling point；不得引入 event bus、history queue 或 public observer API。

---

## 7. Tests

必须覆盖：

```text
failed Store mutation → no presentation effect
successful eligible commit → one projection opportunity
successful ineligible commit → no DOM reconciliation
carrier loss freezes projection
carrier loss preserves managed DOM identity
partial same-generation rebaseline stays hidden
complete same-generation rebaseline enables one reconcile
empty Registry reconciles to empty
fresh generation retires old identity universe
no second presentation state/revision/currentness machine
```

---

## 8. Frozen Closure

M13/02 complete when：

```text
M11 Store remains the only Renderer Render replica authority
Projector is driven only by successful committed state
eligibility is derived from existing Store/currentness facts
same-generation reconnect never exposes partial DOM
fresh generation cleanly changes element identity universe
business cannot observe or mutate the internal seam
```

不得为 Projector方便而复制 Store、generation、Registry 或 Domain state。
