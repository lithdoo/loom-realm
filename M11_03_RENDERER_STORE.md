# M11 / 03 — Renderer Render Store

> 状态：**Planned**  
> 阶段：M11 Render  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M11 / 02](M11_02_RENDER_PUBLICATION.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)

M11/03实现 Renderer 对 current Render Update stream 的 authoritative replica；不实现 DOM/Canvas/WebGL presentation。

---

## 1. Goal

```text
current Render Update stream
→ validate
→ isolated candidate
→ atomic commit
→ Renderer authoritative replica
```

Renderer只复制 Subsystem-owned Render state，不取得 business 或 Render authority。

---

## 2. Store State

每个 current Data slot维护：

```text
current Registry
per-Domain unbaselined | baselined(revision)
current authoritative Domain state
one-shot Domain/Node identity history required by current generation
```

Data retire 后，该 Store不再是 current authority。产品未来可选择保留 stale presentation cache，但 M11 core不得把它作为 fresh Patch base。

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

不得把 carrier-local Store reset误当成 generation identity reset。

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
one Render Store per current Data slot
minimal Domain/node indexes
isolated candidate application helpers
transient event callback surface if required by Renderer core
```

禁止：

```text
Generic Store / Observable framework
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
Patch atomic rollback-on-invalid candidate
Domain/Node one-shot identity
stable tag
stale Event drop
Data replacement isolates old stream
fresh carrier requires fresh Registry/Snapshot
```

M11/03完成后，Renderer core应拥有 protocol-correct replica，但仍不负责 physical presentation。
