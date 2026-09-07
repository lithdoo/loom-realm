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

Data absent、publication backlog、send outcome 都不能反向改变已经通过 local validation 的 author mutation：

```text
replace → authoritative local state commits
emit    → author call succeeds; Event MAY be dropped by current publication policy
close   → business lifetime closes
```

只有 M11/01 定义的 local validation/lifetime misuse 才从 author API 抛错；普通 publication pressure 不向 business 暴露。

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
→ stop starting new old-wire-domain Snapshot/Patch/Event sends
→ discard pending/not-started old-wire-domain Events/work
→ allow any already-started send to settle
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
Domain removal discards pending/not-started Domain messages
carrier loss discards all old carrier cursors/pending output
```

Business `close()` 与 publication 直接闭合：

```text
close() local commit
→ Domain immediately absent from desired business Registry
→ no new Snapshot/Patch/Event send for that Domain may start
→ discard all pending/not-started Snapshot/Patch/Event for that Domain
→ allow any already-started send to settle
→ if old wire domainId was emitted present, next Render publication for that lifecycle change is Registry removal
→ after Registry removal is emitted, no message for that old wire domainId may be sent
```

Foundation/Data 不保证取消已经开始的 `send()`。因此 close 前已经 started 的 send MAY 在 close 后才 resolve；若它成功，则其 emitted position逻辑上仍先于后续 Registry removal。close 不等待 send completion，也不把该 race 暴露给 author。

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
→ carrier loss / Domain removal / forced wire-id rollover discards pending/not-started Event

current carrier + Domain baselined
→ ordinary bounded ordered Event publication
```

因此：

```text
current-carrier pending Event
!= historical replay
```

保留的未 started Event 是 authoritative coalescing barrier；若 backpressure policy 在 start 前丢弃 Event，则 barrier 同时消失。已经 started 的 Event 不能 retract，按其最终 send outcome处理。

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
not-started desired authoritative changes coalesce to latest representable state
Snapshot fallback
Event drop before send starts under pressure
```

禁止：

```text
retract/reorder started or emitted authoritative message
retry an accepted send after loss
replay old Patch/Event
ACK/NACK/resume cursor
history log
```

`emitted` 完全沿用 Frozen Render v1：current carrier ordered send boundary 成功接受 application unit。`started` 只是实现侧已有 `send*()` in-flight、尚未得到 outcome 的状态，不是新的 wire/protocol state。

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

`@loomrealm/data` 仍是 outbound wire static validation/serialization 的最终 owner。M11 author validator 是 role-local commit guard；不得仅为了 DRY 扩大 `@loomrealm/data` public codec/validator API，也不得把 author validation推迟到 `send*()` 后让 local-fatal Data terminal替代业务错误。

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
new public @loomrealm/data validator/codec surface only for M11 convenience
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
business close starts no new Domain sends and discards pending/not-started Domain work
already-started send settles before Registry removal ordering
Domain removal publication barrier
no-carrier Event never crosses into future carrier
prebaseline retained Event follows establishing Snapshot
Event no replay / bounded drop / barrier semantics
publication pressure never becomes author API error
Data terminal keeps business Domains and does not fail Runtime/Frame
outbound preflight prevents illegal v1 message
```

完成后 Subsystem sender 应能通过现有 Data peer 产生 protocol-correct Render Update v1 trace；不得新增第二套 connection/currentness abstraction。
