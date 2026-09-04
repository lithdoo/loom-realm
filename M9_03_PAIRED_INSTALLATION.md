# M9 / 03 — Paired Installation and Cutover

> 状态：**Implementation Boundary Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：冻结 Desktop candidate 的 paired readiness、commit-time revalidation、single-current cutover 与 same-generation recovery；不新增 Data handshake/ACK/resume message。

> **两端 socket 都连上仍然只是 prepared candidate。只有 serialized paired commit 才产生 current Data Connection。**

---

## 1. Candidate Preparation

一个 candidate 必须绑定同一：

```text
Session
Renderer participant
Subsystem Runtime / S
G
P
```

并完成：

```text
Renderer endpoint prepared
Subsystem endpoint prepared
```

任一端未 prepared：不得 commit，不得暴露 child traffic。

---

## 2. Commit Gate

每个 `(current Renderer, S)` slot 使用一个简单 serialized commit lane。

Commit 前重新确认：

```text
candidate still live
Session still current
Renderer participant still current
target Runtime still valid
candidate S/G/P == current Main DataAuthority S/G/P
Renderer acquire still current
Subsystem acquire still current
```

任何条件失败：

```text
dispose candidate
close both physical sides
install nothing
```

不能因为 candidate 已经 physical-ready 而放宽 revalidation。

---

## 3. Cutover

如果已有 current A，prepared candidate B 可以提前存在；commit 时必须串行：

```text
revalidate B
→ A loses current / retire
→ B becomes sole current
→ resolve both role-facing bindings
```

允许：

```text
A → none → B
```

禁止：

```text
A current && B current
```

不要引入通用 TransactionManager；一个 per-slot serialized critical section 足够。

---

## 4. Same-generation Recovery

Current A 因 Data physical loss retired，但 Main authority仍是同一 `S/G/P`：

```text
fresh candidate B
→ fresh paired prepare
→ same commit gate
→ B current
```

不发生：

```text
generation change
Renderer revision change solely for reconnect
resume token
old message replay
old unsent queue migration
```

Fresh B 创建 fresh `@loomrealm/data` peers / publication baseline。

---

## 5. Stale Work

必须 identity-safe：

```text
old candidate prepared late
old carrier close late
old Runner prepared ACK late
old Renderer acquire resolution late
```

都只能影响原 candidate；不得 retire/replace newer current。

Retired carrier 的 late inbound traffic直接 stale-drop，不进入 fresh peer state machine。

---

## 6. Failure Boundary

以下都只影响 Data slot/candidate：

```text
candidate establishment failure
authority-race rejection
paired prepare failure
current Data loss
same-generation reconnect failure
child Data-fatal retirement
```

不得直接：

```text
fail Runtime
unwind Frame
change Main DataAuthority
clear Renderer Control
```

---

## 7. No New Data Messages

Connection v1 仍然没有：

```text
data.hello
data.ready
data.accept
data.resume
data.ping
data.close
```

Renderer/Runner 的 prepared/commit coordination只能存在于 Platform-private establishment/provisioning path，不能进入 Data application carrier。

---

## 8. Closure

M9/03 关闭时，Desktop physical realization可以在并发、authority race、same-generation reconnect 和 cutover 下始终维持：

```text
0..1 current per slot
paired-before-current
commit-time Main authority revalidation
retired terminal
no replay/resume
```
