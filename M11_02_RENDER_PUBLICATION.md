# M11 / 02 — Render Publication

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：02  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> 目标：把 Subsystem-owned desired Render state 投影到 current Data peer；只实现 Frozen Render Update v1 publication lifecycle。

> **publication state 是 generation/carrier-local projection，不是第二份 business authority。**

---

## 1. Position

```text
business Render Domains
→ one bounded publication responsibility
→ generation-scoped wire Domains
→ existing SubsystemDataPeer.render
→ render.domains / snapshot / patch / event
```

这里的 publication coordinator 是一个 responsibility/state boundary，不要求独立 class/service；它可以直接由 `RenderManager` 内部承担。不得因为文档名义再造 connection/session/replication framework。

Author 只提交 current desired state/Event intent，不接触 wire identity、revision、message kind 或 send outcome。

---

## 2. Fresh Carrier / Baseline

安装 fresh current Data peer 后：

```text
first Render application message
= render.domains(current Registry)
```

随后每个 current Domain 独立：

```text
unbaselined
→ render.snapshot(R)
→ baselined(R)
→ patch / snapshot / event
```

不存在 global Render ready。Registry 可以在其它 Domain 尚未 baseline 时变化。

无 current Data peer 时：

```text
business state continues to change locally
no historical authoritative publication queue is required
next fresh carrier observes latest current state through Registry + Snapshots
```

---

## 3. Identity / Generation

```text
wire Domain identity
= Session × subsystemKey × DataAuthority generation × domainId
```

必须保持：

```text
same-generation carrier replacement
→ keep emitted Domain/Node one-shot history
→ discard old carrier cursor/pending output
→ fresh Registry + Snapshot baseline

fresh generation
→ fresh wire Render universe
→ business Domain MAY survive and be re-exported
```

carrier replacement不得 recreate business Domain。

M11/01 的 business Node-key one-shot 是 local stronger invariant；M11/02 仍维护 Frozen protocol 要求的 generation-scoped **emitted** Domain/Node identity history。

### 3.1 Revision Exhaustion

Frozen Render v1 禁止 revision wrap/reuse。若某 current carrier/domain 的 `lastEmittedRevision == Number.MAX_SAFE_INTEGER`，且该 live business Domain 之后还有新的 authoritative desired change：

```text
MUST NOT emit MAX+1 / wrap / reuse revision
→ discard pending old-wire-domain Events
→ mint one fresh SDK-private domainId
→ emit next full Registry with old domainId absent + fresh domainId present
→ fresh domainId starts unbaselined
→ emit fresh Snapshot for the same still-live business Domain
```

这是 protocol-mandated wire lifecycle rollover，不是 business Domain recreation：

```text
business RenderDomain handle/lifetime unchanged
business authoritative state unchanged except the author mutation itself
wire Domain identity changes
```

该异常路径只需要在 Domain record 中替换当前 private wire `domainId` 或等价 private fact；不得因此建立 generic business↔wire identity translation layer、revision rollover framework 或新的 Main/Data authority mechanism。

---

## 4. Per-carrier Publication State

每个 current carrier + current Domain 只维护：

```text
unbaselined | baselined(revision)
```

固定：

```text
Registry present before Domain message
fresh baseline uses Snapshot
Patch only R→R+1
post-baseline Snapshot commits R+1
Domain removal discards pending unsent Domain messages
carrier loss discards all old carrier cursors/pending output
```

Business `close()` 与 publication 直接闭合：

```text
close() local commit
→ Domain immediately absent from desired business Registry
→ discard all not-yet-emitted Snapshot/Patch/Event for that Domain
→ if old wire domainId was emitted present, next valid Registry publication removes it
→ after removal publication, no message for that old wire domainId may be sent
```

已经进入 ordered-send boundary 的 message 不能 retract；它属于 close 之前的 emitted history。close 不等待 Registry send completion。

`replace()` 不对应固定 Patch。publication 可基于 `lastEmittedRevision`：

```text
emit next Patch
OR
emit full Snapshot fallback
```

第一版允许保守使用 Snapshot；Patch-vs-Snapshot heuristic 是 private optimization。

---

## 5. Event / Barrier

Event 只存在于 **当前 carrier publication lifetime**，永不成为 future-carrier replay backlog。

三种情况冻结为：

```text
no current carrier
→ valid author Event intent may be dropped immediately
→ MUST NOT carry into a future carrier

current carrier + Domain unbaselined
→ Event MAY enter bounded current-carrier pending queue
→ Snapshot establishing current target lifetime MUST emit first
→ carrier loss / Domain removal / forced wire-id rollover discards pending Event

current carrier + Domain baselined
→ ordinary bounded ordered Event publication
```

因此：

```text
current-carrier pending Event
!= historical replay
```

保留的未 emitted Event 是 authoritative coalescing barrier；若 backpressure policy 在 emitted 前丢弃 Event，则 barrier 同时消失。

Event：

```text
never coalesced
surviving Events preserve relative order
never replayed after carrier replacement
must not block authoritative convergence indefinitely
```

---

## 6. Backpressure / Emitted Boundary

publication 自己必须在 generic `@loomrealm/data` writer overflow 前保持 bounded：

```text
0..1 publication send in flight
bounded pending authoritative work
bounded pending Event work
```

允许：

```text
unemitted desired authoritative changes coalesce to latest representable state
Snapshot fallback
Event drop before emitted under pressure
```

禁止：

```text
retract/reorder emitted authoritative message
retry an accepted send after loss
replay old Patch/Event
ACK/NACK/resume cursor
history log
```

`emitted` 完全沿用 Frozen Render v1：current carrier ordered send boundary 成功接受 application unit。

---

## 7. Data Failure Boundary

`SubsystemDataPeer.render.send*` 返回 terminal 或 peer terminal：

```text
invalidate old publication peer/cursors synchronously
business Domains remain authoritative locally
pending old-carrier Events/output discarded
existing Subsystem host Data lifecycle decides whether a fresh peer is acquired
```

Render publication/Data failure：

```text
!= author exception
!= Runtime terminal
!= Frame unwind
```

Author validation已经保证成功 local state/event 可表示为 Frozen Render v1；若 publication 内部仍构造非法 outbound message，这是 implementation/programming failure，不得转嫁给 author，也不得依赖 Renderer 宽容解析。

---

## 8. Abstraction Budget

允许：

```text
one bounded publication responsibility
per-generation emitted identity history
per-carrier Domain cursors
bounded current-carrier pending work
minimal Patch/Snapshot selection
private current wire-domain id on each business Domain record
```

禁止：

```text
generic replication framework
generic business↔wire identity translation layer
cross-Domain global revision
transport retry/backoff
Renderer acknowledgment/resync protocol
history/replay buffer
raw carrier competing reader/writer
DOM/presentation logic
```

---

## 9. Done

M11/02 必须证明：

```text
fresh carrier Registry first
per-Domain independent Snapshot baseline
same-generation reconnect keeps emitted identity history
old carrier cursor/pending output retired
fresh-generation wire reset by sender-role fixture
revision continuity + Snapshot fallback
revision exhaustion never wraps and rolls to one fresh private wire domainId
business close removes desired Domain and discards not-yet-emitted Domain work
Domain removal publication barrier
no-carrier Event never crosses into future carrier
prebaseline retained Event follows establishing Snapshot
Event no replay / bounded drop / barrier semantics
Data terminal keeps business Domains and does not fail Runtime/Frame
outbound preflight prevents illegal v1 message
```

完成后 Subsystem sender 应能通过现有 Data peer 产生 protocol-correct Render Update v1 trace；不得新增第二套 connection/currentness abstraction。
