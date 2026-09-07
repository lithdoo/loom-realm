# M11 / 02 — Render Publication

> 状态：**Planned**  
> 阶段：M11 Render  
> 落地顺序：02  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)

M11/02把 Subsystem-owned business Render state投影到 current Data carrier；只实现 Render Update v1 publication lifecycle，不改变 business Domain ownership。

---

## 1. Goal

```text
business Render Domains
→ generation-scoped wire Domains
→ current Data carrier
→ render.domains / snapshot / patch / event
```

publication state属于 wire/carrier lifecycle，不是第二份 business authority。

---

## 2. Fresh Carrier

fresh current Data carrier 的第一条 Render message必须是：

```text
render.domains(current Registry)
```

随后每个 current Domain独立：

```text
unbaselined
→ render.snapshot(R)
→ baselined(R)
→ patch / snapshot / event
```

不存在 global Render ready。

---

## 3. Identity / Generation

必须保持：

```text
wire Domain identity
= Session × subsystemKey × DataAuthority generation × domainId
```

因此：

```text
same-generation carrier replacement
→ keep wire Domain/Node one-shot history
→ discard old carrier cursor
→ fresh Registry + Snapshot baseline

fresh generation
→ fresh wire Render universe
→ business Domain MAY survive and be re-exported
```

carrier replacement不得被实现成 business Domain recreate。

---

## 4. Publication Rules

每个 carrier + Domain维护最小 publication cursor：

```text
unbaselined | baselined(revision)
```

规则：

```text
Registry present before Domain message
fresh baseline uses Snapshot
Patch only from current revision R to R+1
post-baseline Snapshot also commits R+1
Event ordered, transient, never replayed
Domain removal discards pending unsent Domain messages
carrier loss discards old cursor/pending publication
```

第一版允许保守使用 full Snapshot fallback；不要求最优 tree diff。

---

## 5. Backpressure

只实现协议需要的有界 publication：

```text
authoritative desired state may coalesce before emitted boundary
Event remains ordering barrier
old carrier pending work cannot cross replacement
```

不增加 ACK、NACK、resume cursor、retry/replay 或 Renderer-driven resync。

---

## 6. Abstraction Budget

允许：

```text
one publication coordinator
per-generation identity history
per-carrier Domain cursors
bounded pending publication
minimal Patch/Snapshot selection
```

禁止：

```text
generic replication framework
cross-Domain global revision
transport retry/backoff
Renderer acknowledgment protocol
history log / replay buffer
raw carrier competing reader
DOM/presentation logic
```

---

## 7. Evidence

必须验证：

```text
fresh carrier Registry first
per-Domain baseline independence
same-generation reconnect fresh baseline
old carrier cursor/pending output retired
fresh generation resets wire identity universe
Domain/Node one-shot history correct within generation
Event no replay
Domain removal publication barrier
revision continuity
```

M11/02完成后，Subsystem侧应能通过现有 Data peer产生完整合法 Render Update v1 trace。
