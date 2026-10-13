# LoomRealm Session Events v1 Conformance

> 层级：正式契约 / Conformance  
> 状态：**Active / Normative / Not Implemented / Not Qualified**  
> 对应契约：[Session Events v1](./session-events-v1.md)  
> 最近复核：2026-10-13

本文把 Session Events v1 的 normative semantics 转换为实现前必须具备的可执行断言。本文不重新定义协议；若与 [Session Events v1](./session-events-v1.md) 冲突，以契约正文为准。

---

## 1. Qualification Subject

Qualification MUST identify the exact implementation subject under test，包括：

```text
package/source commit
in-process logical binding subject
Desktop/Hostra remote or multiplexed profile when applicable
PWA/Worker remote or multiplexed profile when applicable
```

`Contract Frozen != Implemented != Qualified`。

---

## 2. Identity / Validation

Automated tests MUST prove：

```text
channel non-empty
channel UTF-8 <= 256 bytes
channel control chars rejected
channel exact/case-sensitive/no-normalization
'/' accepted as ordinary text
battle != battle/main
leading/trailing/repeated '/' have no hidden normalization

type non-empty
type UTF-8 <= 128 bytes
type control chars rejected
type exact/case-sensitive

type does not affect routing

payload valid JsonValue only
payload <= 256 KiB encoded JSON
payload depth <= 64
invalid numeric/non-JSON/cyclic values rejected
```

Boundary tests MUST include exact-limit and one-over-limit values。

---

## 3. Detachment / Source Authenticity

Tests MUST prove：

```text
publisher mutation after accepted publish does not change delivered payload
subscriber A mutation does not change subscriber B observation
in-process and remote realization have equivalent detachment

source.subsystemKey is derived from bound Runtime identity
publisher cannot override/spoof source
remote envelope source field, if physically present, is ignored/rejected as authority
self-publish uses the actual publishing Runtime source
```

---

## 4. Channel Routing

For subscriptions：

```text
A → [battle, dialogue]
B → [quest]
C → [battle]
```

publishing channel `battle` MUST：

```text
deliver to A exactly once
deliver to C exactly once
not send/deliver to B
```

Additional tests MUST prove：

```text
zero matching subscriptions → publish success
one Runtime with two matching subscriptions → one delivery to each subscription
one subscription with many channels → at most one delivery for one event
self-subscription → self-delivery allowed
no normal broadcast-to-all + client discard implementation
```

---

## 5. Publish Evidence

Tests MUST distinguish：

```text
invalid/limit/pre-dispatch terminal/no-binding
    → known not accepted

successful publish result
    → accepted by Hub
    → independent of listener completion

dispatch happened + definitive result lost
    → OUTCOME_UNKNOWN
```

Framework MUST NOT automatically retry `OUTCOME_UNKNOWN`。

A subscriber callback throw/rejection or subscriber overflow MUST NOT retroactively fail an already accepted publish。

---

## 6. Subscription Establishment

Tests MUST prove：

```text
[] → INVALID_REQUEST
duplicate exact channel → INVALID_REQUEST
>64 channels → LIMIT_EXCEEDED
65th live subscription on one client → LIMIT_EXCEEDED

full channel set validates before install
no partially installed set
subscribe Promise resolves only after Hub install
listener never starts before Promise resolve
```

Race test：

```text
Hub installs @ N
event accepted after N
subscribe ack intentionally delayed
```

Expected：

```text
event retained boundedly
subscribe resolves first
listener runs afterwards
```

Failed/ambiguous establishment MUST expose no handle and no listener invocation。Any Hub-side orphan candidate MUST be retired/fenced on binding failure。

---

## 7. Subscription `closed` Surface

`closed` MUST：

```text
exist on every successful handle
resolve exactly once
never reject
```

Required reasons：

```text
closed
overflow
binding-terminal
client-terminal
hub-terminal
```

Explicit `close()` tests：

```text
synchronous
idempotent
closed settles reason=closed
no new listener invocation after close returns
works even when physical binding is unavailable
late old event/ack fenced
```

If one listener callback is already active when `close()` occurs, it MAY finish naturally but no later callback starts。

---

## 8. Serial Listener Lane

For each subscription：

```text
max active listener invocation = 1
```

Test with listener A blocked on a controllable Promise and event B queued：B listener MUST NOT start until A settles。

Both of these MUST be locally contained：

```text
sync throw
returned rejected Promise
```

After either failure, a later queued event MUST still be deliverable unless subscription independently closed/terminal。

Listener reentrant `publish()` / `subscribe()` / own `close()` MUST NOT deadlock Hub or binding。

---

## 9. Ordering

For one publisher binding：

```text
publish A accepted before B
```

Any subscription receiving both MUST invoke A before B。

Tests MUST NOT assume a global cross-publisher order or equality with Shared State/Main/Render/Input order。

Different subscriptions MAY progress independently because each has its own serial lane。

---

## 10. Backpressure / Overflow

Per subscription exact limits：

```text
pending events <= 64
pending logical bytes <= 8 MiB
```

Tests MUST cover count overflow and byte overflow separately。

On would-overflow enqueue：

```text
subscription closed reason=overflow
queued undelivered events may be discarded
no new listener invocation starts
accepted publisher result remains successful
unrelated subscription remains healthy
```

Implementations MUST demonstrate bounded physical buffering/no unbounded Promise accumulation under a deliberately stalled listener。

---

## 11. Binding / Recovery

No usable binding：

```text
publish → BINDING_UNAVAILABLE / known not accepted / no wait
subscribe → BINDING_UNAVAILABLE / no handle / no wait
```

Binding-loss tests MUST prove：

```text
publish pre-dispatch → BINDING_UNAVAILABLE
publish post-dispatch result lost → OUTCOME_UNKNOWN
live subscription → closed(binding-terminal)
old subscription does not reattach
late old-binding event/result/ack fenced
fresh binding can serve same still-live logical client
fresh subscribe required
no replay of missed history
no automatic retry of ambiguous publish
```

---

## 12. Runtime / Hub Lifetime

Runtime terminal MUST：

```text
terminal its SessionEventClient
future publish/subscribe → TERMINAL
live subscriptions → client-terminal when observable
```

Session/Hub terminal MUST：

```text
stop new admission
future operations → TERMINAL
live subscriptions → hub-terminal when observable
```

Hub invariant-fatal test MUST show Hub becomes inert before Session-fatal fact is reported to Main/Session lifecycle owner。

Frame suspend/close、Activation replacement、Renderer reload and Renderer Data reconnect MUST NOT revoke the Event client or reset subscriptions by themselves。

---

## 13. Shared Carrier Equivalence

If State and Events multiplex one physical carrier, tests MUST prove：

```text
separate logical correlation namespaces
State request cannot complete Event request or vice versa
Event overflow does not terminal healthy State binding
State logical error does not terminal healthy Event binding
shared carrier loss may affect both physically but each derives own failure/evidence
wire order does not create public State/Event happens-before
heavy Event/Diagnostics traffic cannot indefinitely starve State
```

Dedicated-carrier and multiplexed-carrier profiles MUST expose equivalent Session Events logical outcomes。

---

## 14. Platform Equivalence

Where both Desktop/Hostra and PWA subjects exist, qualification MUST compare：

```text
channel/type validation
payload limits/detachment
source authenticity
routing/multiplicity
publish evidence
subscription establishment races
closed reasons
serial listener execution
ordering
overflow
binding fencing/recovery
Runtime/Hub terminal behavior
```

Process/Worker placement or carrier choice MUST NOT change these observables。

---

## 15. Qualification Exit

Session Events v1 may be marked Qualified only when：

```text
contract subject commit is fixed
all applicable assertions above are automated
all required physical profiles pass
no known architecture/contract divergence remains
qualification evidence records exact subject + environment
```
