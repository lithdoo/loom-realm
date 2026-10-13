# LoomRealm Session Events v1 Conformance

> 层级：正式契约 / Conformance  
> 状态：**Active / Normative / Not Implemented / Not Qualified**  
> 对应契约：[Session Events v1](./session-events-v1.md)  
> Physical profile：[Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md)  
> 最近复核：2026-10-13

本文把 Session Events v1 的 normative semantics 转换为实现前必须具备的可执行断言。本文不重新定义协议；若与 [Session Events v1](./session-events-v1.md) 冲突，以契约正文为准。Current Hostra/PWA physical subject 以 [Runtime Integration Profile v1](./session-events-runtime-profile-v1.md) 为准。

---

## 1. Qualification Subject

Qualification MUST identify the exact implementation subject under test，包括：

```text
packages/session-events
packages/subsystem author/host integration
packages/main fatal integration
Hostra Runner/RuntimeHosting + Desktop composition
PWA Runner/RuntimeHosting + Session Worker composition
in-process logical binding subject
exact package/source commit
```

Current required physical profiles：

```text
Hostra = dedicated private Events WebSocket per Runtime
PWA    = dedicated private Events MessagePort per Runtime
```

State+Events multiplexed carrier is allowed by the logical contract but is **not a current v1 product qualification requirement** unless such a profile is actually introduced。

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

## 6. Failure Surface

Every author-facing failed `publish()` / `subscribe()` MUST be tested as a `SessionEventError` with stable：

```text
code
message
optional path
```

Tests MUST prove：

```text
INVALID_REQUEST / LIMIT_EXCEEDED / TERMINAL / BINDING_UNAVAILABLE / OUTCOME_UNKNOWN map correctly
message text is not required for branching
path is structural diagnostic only
isSessionEventFailure(SessionEventError) = true
isSessionEventFailure(structurally equivalent plain failure) = true
classification does not depend on instanceof
remote transport-private Error/stack/path/credential objects do not leak to business code
```

---

## 7. Subscription Establishment

Tests MUST prove：

```text
[] → INVALID_REQUEST
duplicate exact channel → INVALID_REQUEST
>64 channels → LIMIT_EXCEEDED
65th live subscription on one client → LIMIT_EXCEEDED

full channel set validates before install
no partially installed set
subscribe Promise resolves only after Hub install
subscription is still live when success becomes author-visible
listener never starts before Promise resolve
```

Race test A：

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

Race test B — candidate terminals before success becomes author-visible：

```text
candidate overflow before subscribe result
    → reject SessionEventError(LIMIT_EXCEEDED)
    → no handle
    → no listener

carrying binding terminals before subscribe result
    → reject SessionEventError(BINDING_UNAVAILABLE)
    → no handle
    → no listener

client/Hub terminals before subscribe result
    → reject SessionEventError(TERMINAL)
    → no handle
    → no listener
```

Failed/ambiguous establishment MUST expose no handle and no listener invocation。Any Hub-side orphan candidate MUST be retired/fenced on binding failure or pre-visible terminal。

---

## 8. Subscription `closed` Surface

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

## 9. Serial Listener Lane

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

## 10. Ordering

For one publisher binding：

```text
publish A accepted before B
```

Any subscription receiving both MUST invoke A before B。

Tests MUST NOT assume a global cross-publisher order or equality with Shared State/Main/Render/Input order。

Different subscriptions MAY progress independently because each has its own serial lane。

---

## 11. Backpressure / Overflow

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

## 12. Binding / Recovery

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

## 13. Runtime / Hub Lifetime + Main Fatal Ownership

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

Main fatal integration tests MUST prove：

```text
Hub invariant-fatal self-terminals before sessionEventsFatal is latched
current Main listener notified at most once
late Main subscribe to already-latched fatal schedules callback asynchronously at most once
pre-READY Hub construction failure does not emit live-Hub fatal fact
Main alone commits Session terminal/Runtime unwind
Main never receives business event/channel/subscription material
```

Frame suspend/close、Activation replacement、Renderer reload and Renderer Data reconnect MUST NOT revoke the Event client or reset subscriptions by themselves。

---

## 14. Hostra Current Physical Profile

Qualification MUST exercise a real Node Runner boundary and prove：

```text
one dedicated private Events WebSocket per Runtime
Events WS distinct from Runtime Control / Realm State / Renderer Data / Content / Hostra RPC
RuntimeHosting listens before Runner spawn
LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT is host-generated, strict loopback capability URL
Runner copies + scrubs the env value before business Definition import
required initial Event binding is usable before Definition import
source.subsystemKey derives from launch/bound Runtime identity
wrong path/capability cannot consume valid binding
post-start Event binding loss does not fail Runtime/Frame/Session by itself
fresh binding uses generation fencing and does not revive old subscriptions/replay history
```

---

## 15. PWA Current Physical Profile

Qualification MUST exercise real Dedicated Worker + MessagePort boundaries and prove：

```text
PwaRunnerBootstrapV1 closed schema remains unchanged
Session Events uses one dedicated Event MessagePort per current Runtime binding
Event MessagePort is transferred through provisioning control using session-events/install
matching session-events/result acknowledgement required before business Definition import
provisioningPort never carries publish/subscription/event payload frames
wrong subsystemKey / duplicate requestId / stale bindingId / late result are fenced
initial install failure prevents business import
post-start Event binding loss does not fail Runtime/Frame/Session by itself
fresh Event port may attach to same logical client without replay/reactivation
```

---

## 16. Shared Carrier Equivalence — Conditional Future Profile

If State and Events are later multiplexed onto one physical carrier, that profile MUST additionally prove：

```text
separate logical correlation namespaces
State request cannot complete Event request or vice versa
Event overflow does not terminal healthy State binding
State logical error does not terminal healthy Event binding
shared carrier loss may affect both physically but each derives own failure/evidence
wire order does not create public State/Event happens-before
heavy Event/Diagnostics traffic cannot indefinitely starve State
```

Dedicated-carrier and any future multiplexed-carrier profile MUST expose equivalent Session Events logical outcomes。

---

## 17. Platform Equivalence

Current v1 qualification MUST compare Hostra dedicated WebSocket and PWA dedicated MessagePort subjects for：

```text
channel/type validation
payload limits/detachment
source authenticity
routing/multiplicity
publish evidence
SessionEventError failure shape
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

## 18. Qualification Exit

Session Events v1 may be marked Qualified only when：

```text
contract subject commit is fixed
all applicable assertions above are automated
@loomrealm/session-events package subject passes
Subsystem/Main integration passes
Hostra dedicated WebSocket profile passes
PWA dedicated MessagePort profile passes
all affected repository regressions pass
no known architecture/contract/profile divergence remains
qualification evidence records exact subject + environment
```
