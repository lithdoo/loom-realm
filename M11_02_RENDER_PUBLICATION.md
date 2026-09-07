# M11 / 02 — Render Publication

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：02  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 目标：把 Subsystem-owned Render state 投影到 current Data carrier；只实现 Frozen Render Update v1 publication lifecycle。

> **publication state 属于 generation/carrier lifecycle，不是第二份 business authority。**

---

## 1. Frozen Position

```text
business Render Domains
→ generation-scoped wire Domains
→ current Data carrier
→ render.domains / snapshot / patch / event
```

publication 只读取 M11/01 的 current desired state/event intent；author 不接触 wire identity、revision 或 message kind。

---

## 2. Fresh Carrier

fresh current Data carrier 的第一条 Render message 必须是：

```text
render.domains(current Registry)
```

随后每个 current Domain 独立：

```text
unbaselined
→ render.snapshot(R)
→ baselined(R)
→ patch / snapshot / event
```

不存在 global Render ready。

---

## 3. Identity / Generation

```text
wire Domain identity
= Session × subsystemKey × DataAuthority generation × domainId
```

必须保持：

```text
same-generation carrier replacement
→ keep wire Domain/Node one-shot history
→ discard old carrier cursor
→ fresh Registry + Snapshot baseline

fresh generation
→ fresh wire Render universe
→ business Domain MAY survive and be re-exported
```

carrier replacement 不得被实现成 business Domain recreate。

M11/01 已采用更强的 business Node-key one-shot rule；M11/02 仍保留协议要求的 generation-scoped emitted history，因为 Domain lifecycle、fresh carrier 与 conformance 都不能依赖 author object internals。

---

## 4. Publication Rules

每个 current carrier + Domain 只维护：

```text
unbaselined | baselined(revision)
```

规则：

```text
Registry present before Domain message
fresh baseline uses Snapshot
Patch only R→R+1
post-baseline Snapshot commits R+1
Event ordered, transient, never replayed
Domain removal discards pending unsent Domain messages
carrier loss discards old cursor/pending publication
```

第一版允许保守使用 full Snapshot fallback；不要求最优 tree diff。

不得把 author `replace()` 映射成固定 Patch；Snapshot/Patch 只是 publication strategy。

---

## 5. Backpressure

只实现协议要求的有界 publication：

```text
desired authoritative state may coalesce before emitted boundary
Event remains ordering barrier
old carrier pending work cannot cross replacement
```

没有 current carrier 或合法 baseline 时，不建立 Event replay backlog。

不增加 ACK、NACK、resume cursor、retry/replay 或 Renderer-driven resync。

---

## 6. Abstraction Budget

允许：

```text
one publication coordinator
per-generation emitted identity history
per-carrier Domain cursors
bounded pending publication
minimal Patch/Snapshot selection
```

禁止：

```text
generic replication framework
business-key → wire-key translation layer
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
fresh generation resets wire identity universe by sender-role fixture
Domain/Node one-shot history correct within generation
Event no replay
Domain removal publication barrier
revision continuity
```

M11/02 完成后，Subsystem 侧应能通过现有 Data peer 产生合法 Render Update v1 trace。
