# M9 / 03 — Paired Installation and Cutover

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md)  
> 冻结决策：[ADR 0028](doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：冻结 Desktop two-sided WebSocket candidate、paired readiness、single-current installation、post-install role delivery、whole-pair retirement 与 same-generation replacement。

> **Candidate 两端 prepared 仍不等于 current。唯一 installation commit发生在 Desktop Broker 的 serialized slot lane；role delivery发生在该 commit 之后。**

---

## 1. Concrete Desktop Candidate

One candidate uses two role-specific loopback WebSocket capabilities：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque UTF-8 text relay
Runner WS   ─┘
```

Each side gets fresh one-time candidate material；Broker owns the mapping that both sides belong to the same candidate。

Before install：

```text
both sockets may physically connect
relay application gate remains closed
zero child application traffic is forwarded/accepted as current
unexpected pre-install application bytes fail/dispose candidate
```

After install：Broker relays text opaquely and never parses `@loomrealm/data` messages。

---

## 2. Candidate Binding / Preparation

Candidate binds exactly：

```text
session-scoped DataConnectionAuthoritySink instance
rendererControlToken T
HostedRuntime object R
subsystemKey S
generation G
dataProfile P
```

Prepared means：

```text
Renderer endpoint physically prepared
AND Runner endpoint physically prepared through HostraRuntimeDataProvisioner.prepare()
```

Prepared candidate：

```text
is not current
is not a Connection instance
occupies no current cardinality slot
```

One-side prepared cannot install。

---

## 3. Serialized Commit Gate

Each latest-view `(rendererControlToken,S)` slot owns one small serialized installation/retirement lane。

Immediately before install B, Broker re-reads latest sink view and requires：

```text
B still live/prepared
same rendererControlToken still current
same exact HostedRuntime object still current for S
same exact S/G/P still present
both physical sides still prepared
```

Role Binding waiter state is deliberately not part of authority revalidation。

Any mismatch：

```text
dispose B candidate
close both physical sides
install nothing
```

Endpoint/ticket/socket validity never substitutes Main view。

---

## 4. Exact Installation Commit

For prepared candidate B, serialized commit is exactly：

```text
revalidate B
→ old current A, if any, synchronously loses Broker current status / retires
→ B becomes the sole Broker current Data Connection
→ open B relay application gate
→ commit Renderer-side current-deliverable cell B
→ start Runner post-install delivery: provisioner.commit(B, deliverySignal)
→ request physical close/revoke of A
```

Logical current status changes inside the slot lane；network/IPC acknowledgement is not awaited by that lane。

Allowed：

```text
A current → none → B current
```

Forbidden：

```text
A current && B current
```

Once B is installed, A can never be resurrected even if B later fails delivery。

No generic TransactionManager/2PC framework。

---

## 5. Role Delivery After Install

Renderer-side delivery cell is app-local and MUST commit synchronously/non-throwing after B logical install。

```text
Renderer waiter pending → resolve B after install
no Renderer waiter      → hold one committed B carrier until acquire
```

Runner-side delivery uses M9/02 `provisioner.commit(B, signal)` only after B is logically current。

```text
commit resolves
→ Runner has accepted B as current-deliverable
→ pending SubsystemDataBinding waiter may resolve

commit rejects while B still current
→ retire B immediately
→ close/revoke both sides
→ no rollback to A
```

If B was already superseded/invalidated, late resolve/reject affects B only。

Role callback/promise resolution wall-clock order is not authority-visible；both endpoints were paired-ready before installation。

---

## 6. Proactive Same-generation Replacement

Existing M8 acquire semantics do not prevent physical pre-install：

```text
A role peers current
→ Broker privately prepares B under same current S/G/P
→ install B
→ A retires/closes
→ role A peers observe terminal
→ fresh M8 acquire receives B if B remains current-deliverable
```

No generation change、Renderer revision change、resume token、old queue migration or replay。

A proactive B may be installed even when neither role currently has a pending acquire waiter。

---

## 7. Loss-triggered Recovery

```text
A current physical close/read/write failure
→ slot lane marks A non-current/retired first
→ relay gate closes
→ both sides close/revoke best-effort
→ Main authority remains S/G/P
→ fresh B may prepare/install under same authority
```

Same mechanism handles reconnect；there is no Connection-level reconnect state or resume protocol。

---

## 8. Authority / Parent Invalidation

`DataConnectionAuthoritySink.replace()` synchronously updates installability/currentness before physical close convergence。

Required：

```text
S/G/P removed/replaced
Renderer token T→T2/null
HostedRuntime R→R2/removed
Session replace(null)
```

→ matching current and pending material immediately loses Broker current/installable status。

If Runner commit delivery is pending, Broker aborts its delivery signal and calls `revoke(candidateId)`。Late ACK cannot restore retired material。

---

## 9. Whole-pair Retirement

Either side terminal/read/write failure retires the entire current pair：

```text
serialized mark non-current first
→ close relay gate
→ detach Renderer delivery cell current identity
→ revoke Runner candidate/current-deliverable material
→ best-effort close both sockets
```

Logical retirement never waits for socket close。One half cannot remain current。

Retired late inbound bytes are stale-drop；late old send completion cannot retire/clear a newer current pair。

---

## 10. Candidate / Delivery Failure Classification

Before install：

```text
prepare/connect/auth/material failure
→ dispose candidate
→ no Connection instance / no retired Connection requirement
```

After install：

```text
Runner commit delivery failure
Renderer delivery invariant failure
relay read/write/close loss
```

→ current B transitions to retired。

This distinction is required；implementation MUST NOT rewrite post-install failure as if B never became current, and MUST NOT resurrect the previous current。

All such failures stay outside Runtime/Frame authority。

---

## 11. No New Data Messages

Connection v1 still has no：

```text
data.hello
data.ready
data.accept
data.resume
data.ping
data.close
```

`prepared/commit/committed/revoke` are Platform-private Hostra provisioning messages, never Data application carrier messages。

---

## 12. Minimal State / No Framework

Broker implementation may use plain private records/maps and one promise tail per slot。

It MUST NOT introduce：

```text
ConnectionManager framework
ConnectionRegistry service
GenericTransaction/2PC
retry/backoff scheduler
lease/heartbeat/currentness protocol
Data application parser in Broker
```

---

## 13. Qualification

Must prove：

```text
Renderer-only prepared not current
Runner-only prepared not current
pre-install bytes not exposed
exact latest Main view required at commit
concurrent candidates same slot → at most one install winner
no overlap old/new current
Binding waiter absent does not block install
old current never resurrected
Runner post-install commit failure → new current retires, no rollback
late commit/revoke/ACK identity-safe
one side terminal retires whole pair
same-generation proactive replacement
same-generation recovery after loss
no generation/revision mutation solely for physical replacement
no replay/resume/old queue migration
retired late traffic cannot affect replacement
opaque text relay only
```

---

## 14. Frozen Closure

M9/03 is implementation-closed when installation、post-install role delivery and retirement have the exact ordering above and no half-current/rollback interpretation remains for coding time。
