# M11 / 03 — Renderer Store

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M11 / 02](M11_02_RENDER_PUBLICATION.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 目标：实现 Renderer 对 current Render Update stream 的 authoritative replica；不实现 physical presentation，也不新增 public Render API。

> **Renderer 只复制 Subsystem-owned Render state；Store validity 不产生 business、Frame、Input 或 Render authority。**

---

## 1. Position

```text
existing Renderer Data slot
→ current RendererDataPeer render handlers
→ internal Render Store
→ validate
→ isolated candidate
→ atomic commit
→ current authoritative replica
```

Render Store 挂接现有 `(controlPeer, subsystemKey, generation, dataProfile)` Data-slot currentness；不新增 Render Session、Render Connection Manager 或第二套 Data currentness。

---

## 2. Public Boundary

M11 **不新增 `@loomrealm/renderer` public Render/presentation API**。

禁止为 M11 root-export：

```text
RenderStore
RenderSession
RenderSubscription
subscribeRender
PresentationAdapter
RenderEventBus
```

Store 与 Event-delivery seam 均保持 package-internal。Unit/conformance tests MAY 使用 internal/test-only observation seam 读取 normalized committed state/Event trace；该 seam 不形成 production compatibility boundary。

Physical presentation consumer 属于 M14。

---

## 3. Store Lifetime

对 current desired Data-slot identity，Store 维护：

```text
current Registry
per-Domain unbaselined | baselined(revision)
current committed authoritative Domain state
generation-scoped observed Domain/Node one-shot history
```

same-generation carrier replacement：

```text
keep generation-scoped observed identity history
reset carrier-local Registry/baseline/revision currentness
old committed state MAY remain as stale presentation cache only
fresh Registry + Snapshots rebuild current replica
```

fresh generation：

```text
fresh Store identity universe
```

该语义由 receiver-role deterministic fixture证明；M11 不为测试增加 Main generation allocator。

---

## 4. Application Rules

```text
render.domains
→ validate full Registry/lifecycle
→ atomic membership replacement

render.snapshot
→ require current Domain membership
→ validate complete candidate + identity/limits
→ atomic Domain replacement

render.patch
→ require current baseline
→ baseRevision == currentRevision
→ revision == baseRevision + 1
→ apply ordered ops to isolated candidate
→ validate after each bounded structural op + final candidate
→ atomic commit once

render.event
→ validate schema/limits
→ if current Domain + current baseline + current target: deliver internal transient trace
→ otherwise drop only
```

Registry removal retires that current authoritative Domain replica but preserves required generation one-shot history。

---

## 5. Failure Disposition

Renderer render handlers return existing `DataInboundDisposition` only：

```text
valid authoritative commit / valid Event drop-or-deliver
→ { kind: "accepted" }

representation/schema/limit violation
OR authoritative continuity violation
→ { kind: "protocol-fatal", cause? }
```

`@loomrealm/data` owns Data terminalization/peer close after `protocol-fatal`。

A well-formed stale/inapplicable Event is **accepted + dropped**, not protocol-fatal。

任何 failed Snapshot/Patch：

```text
revision unchanged
zIndex unchanged
tree unchanged
no partial Event/presentation exposure
```

Render/Data stream fatal：

```text
!= Runtime terminal
!= Frame unwind
```

---

## 6. Identity / Atomicity

必须保持：

```text
Domain removed in generation cannot reappear
removed published Node key cannot reappear in same wire Domain lifetime
live key keeps stable tag
same-generation fresh baseline may contain still-live keys
fresh generation creates fresh identity universe
```

不得把 carrier-local baseline reset误当成 generation identity reset。

Snapshot/Patch 固定：

```text
validate whole message
→ build isolated candidate
→ validate identity/tree/limits
→ atomic commit once
```

内部可以使用 mutable candidate，只要失败前不修改 current committed replica。

---

## 7. Abstraction Budget

允许：

```text
one concrete internal Render Store per current Renderer Data-slot identity
minimal Domain/node indexes
isolated candidate helpers
minimal internal Event-delivery/test observation seam
```

禁止：

```text
Generic Store / Observable framework
Render Session / Render Connection Manager
public Render subscription API
virtual DOM / reconciler
component registry
resource loader
presentation scheduler
Renderer→Subsystem Render RPC
resync/retry protocol
cross-Domain transaction layer
```

---

## 8. Done

M11/03 必须证明：

```text
no new public renderer Render exports
Registry atomic replacement
Snapshot baseline/full commit
Patch R→R+1 continuity
invalid/gapped/stale authoritative commit → protocol-fatal disposition
failed candidate leaves current replica unchanged
Domain/Node one-shot identity + stable tag
well-formed stale Event accepted+drop only
same-generation Data replacement isolates old stream and preserves identity history
fresh carrier requires fresh Registry/Snapshot
fresh-generation identity reset by receiver-role fixture
Render fatal does not mutate Runtime/Frame authority
```

完成后 Renderer core 拥有 protocol-correct current replica，但仍没有 DOM/Canvas/WebGL 或 production presentation subscription surface。
