# M9 / 03 — Paired Installation and Cutover

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：冻结 Desktop WebSocket candidate 的 paired readiness、commit-time revalidation、single-current cutover 与 same-generation recovery；不新增 Data handshake/ACK/resume message。

> **Role acquire waits for committed carrier；Broker installation is driven by Main authority + physical readiness。**

---

## 1. Concrete Desktop Candidate

One candidate uses two role-specific local WebSocket capabilities：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque text relay
Runner WS   ─┘
```

Each side gets fresh one-time candidate material。Broker knows both endpoints belong to the same candidate。

Before commit：

```text
both sockets may physically connect
Broker forwards zero application traffic
unexpected pre-commit application bytes fail/dispose the candidate
```

After commit Broker relays UTF-8 text opaquely；it does not parse `@loomrealm/data` messages。

---

## 2. Paired Preparation

Candidate binds exactly：

```text
current session-scoped sink instance
rendererControlToken
HostedRuntime object / subsystemKey S
G
P
```

Physical prepare requires：

```text
Renderer endpoint prepared
AND Runner endpoint prepared through HostraRuntimeDataProvisioner
```

One-side prepared is never current。

---

## 3. Commit Gate

Each `(rendererControlToken,S)` slot has one small serialized commit lane。

Immediately before commit, Broker re-reads its latest `DataConnectionAuthorityView` and requires：

```text
candidate still live
same rendererControlToken still current
same exact HostedRuntime object still current for S
same exact S/G/P still present
both physical endpoints still prepared
```

Role `acquire()` state is deliberately **not** part of this gate。

Any mismatch：

```text
dispose candidate
close both sides
install nothing
```

This is the only authority revalidation point；endpoint/ticket/socket validity alone never authorizes install。

---

## 4. Installation / Delivery

Serialized successful commit：

```text
revalidate B
→ old current A, if any, loses Broker current status
→ B becomes sole Broker current
→ commit Runner provisioner B
→ commit Renderer-side delivery cell B
→ close/retire A physical pair
```

Role-facing Bindings then observe one already-current carrier：

```text
waiter already pending → resolve after commit
no waiter yet         → hold committed carrier until next acquire
```

Promise callback ordering between Renderer/Subsystem is not authority-visible；both endpoints were paired-ready before commit。

Allowed：

```text
A → none → B
```

Forbidden：

```text
A current && B current
```

No generic TransactionManager is needed。

---

## 5. Proactive and Loss Recovery

Because Binding acquire is only delivery wait：

```text
A current
→ Platform MAY prepare B privately under same current S/G/P
→ commit B
→ close A
→ role A peer terminal
→ role fresh acquire receives already-committed B
```

The same mechanism handles physical loss：

```text
A lost/retired
→ authority still S/G/P
→ fresh B
→ fresh paired prepare/commit
```

Same-generation replacement never implies：

```text
generation change
Renderer revision change solely for reconnect/supersede
resume token
old message replay
old unsent migration
```

Fresh role peers own fresh child publication baseline。

---

## 6. Retirement / Relay Failure

Either relay side terminal/read/write failure retires the whole current pair：

```text
mark pair non-current first
→ stop accepting/forwarding traffic
→ close both sides best-effort
```

Authority remains unchanged unless Main changes it；a fresh candidate MAY later install under the same S/G/P。

Stale/retired inbound bytes are dropped and cannot affect a replacement pair。

---

## 7. Stale Work

Identity-safe events include：

```text
old Renderer socket open/close late
old Runner prepared ACK late
old provisioner revoke/commit late
old Binding waiter resolution/abort late
old relay send completion late
```

They may affect only the exact old candidate/pair。

---

## 8. No New Data Messages

Connection v1 still has no：

```text
data.hello
data.ready
data.accept
data.resume
data.ping
data.close
```

`prepared/commit/revoke` exist only in Platform-private provisioning/control path。

---

## 9. Closure

M9/03 is closed when Desktop physical realization guarantees：

```text
paired-before-current
commit-time Main-view revalidation
0..1 current per slot
role acquire independent from install authority
whole-pair retirement
same-generation fresh replacement
retired terminal / no replay
opaque Data relay
```
