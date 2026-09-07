# M11 / 03 — Renderer Store

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M11 / 02](M11_02_RENDER_PUBLICATION.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 目标：实现 Renderer 对 current Render Update stream 的 authoritative replica；不实现 physical presentation。

> **Renderer 只复制 Subsystem-owned Render state；Store validity 不产生 business、Frame、Input 或 Render authority。**

---

## 1. Frozen Position

```text
current Render Update stream
→ validate
→ isolated candidate
→ atomic commit
→ current Renderer replica
```

Renderer Store 挂接现有 Renderer Data slot/currentness lifecycle；不新增 Render Session、Render Connection Manager 或第二套 Data currentness。

---

## 2. Store State / Lifetime

对当前 desired `(subsystemKey, generation, dataProfile)` Data slot，Render Store 维护：

```text
current Registry
per-Domain unbaselined | baselined(revision)
current authoritative Domain state
generation-scoped observed Domain/Node one-shot history
```

carrier replacement只重置：

```text
current per-carrier Registry/baseline/revision
```

same-generation identity history继续有效。Data retire 后最后合法 state MAY作为 stale presentation cache 保留，但不是 current authority，也不是 fresh Patch base。

fresh generation 建立 fresh Store identity universe；该语义由 receiver-role fixture证明，不要求 M11 为测试新增 Main generation allocator。

---

## 3. Application Rules

```text
render.domains
→ validate full Registry
→ atomic membership replacement

render.snapshot
→ validate complete candidate
→ atomic Domain replacement

render.patch
→ require current baseline
→ baseRevision == currentRevision
→ revision == baseRevision + 1
→ apply all ops to isolated candidate
→ validate final candidate
→ atomic commit

render.event
→ ordered transient delivery only when applicable
```

任何 authoritative continuity/schema/limit failure按 Data stream fatal处理；well-formed stale Event只 drop。

---

## 4. Identity

必须验证：

```text
Domain removed in generation cannot reappear
removed published Node key cannot reappear in same wire Domain lifetime
live key keeps stable tag
same-generation fresh carrier Snapshot may contain still-live keys
fresh generation creates fresh identity universe
```

不得把 carrier-local baseline reset误当成 generation identity reset。

---

## 5. Atomicity

任何 Snapshot/Patch：

```text
validate whole message
→ build candidate
→ validate tree/identity/limits
→ commit once
```

失败时 current replica不得暴露 partial mutation。

---

## 6. Abstraction Budget

允许：

```text
one concrete Render Store attached to each current Renderer Data slot identity
minimal Domain/node indexes
isolated candidate application helpers
minimal transient Event consumer surface
```

禁止：

```text
Generic Store / Observable framework
Render Session / Render Connection Manager
virtual DOM
component registry
resource loader
presentation scheduler
Renderer→Subsystem Render RPC
resync/retry protocol
cross-Domain transaction layer
```

---

## 7. Evidence

必须验证：

```text
Registry atomic replacement
Snapshot baseline/full commit
Patch R→R+1 continuity
invalid/gapped/stale authoritative commit fatal
Patch invalid candidate leaves replica unchanged
Domain/Node one-shot identity
stable tag
stale Event drop
same-generation Data replacement isolates old stream and preserves identity history
fresh carrier requires fresh Registry/Snapshot
fresh-generation identity reset by receiver-role fixture
```

M11/03 完成后，Renderer core 拥有 protocol-correct replica，但仍不负责 DOM/Canvas/WebGL presentation。
