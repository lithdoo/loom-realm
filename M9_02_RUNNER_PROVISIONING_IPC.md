# M9 / 02 — Runner Late Provisioning IPC

> 状态：**Implementation Boundary Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Hostra Desktop Composition](doc/20-modules/desktop-host/README.md)  
> 目标：为已运行 Node Runner 增加 Host-owned late provisioning path，使现有 `SubsystemDataBinding` 获得 committed Data carrier；不复用 Runtime Control，也不把 Data endpoint 固定进 Runtime bootstrap。

> **Runtime bootstrap 启动 Runtime；provisioning IPC 只在 Runtime 已运行后交付 fresh Data material。两者不是同一协议。**

---

## 1. Physical Shape

Current M6：

```text
Host process
→ spawn Node Runner
→ Runtime Control WebSocket
```

M9 adds：

```text
Host process
↔ dedicated Node child IPC
→ fresh Data endpoint material
→ Runner Data WebSocket
→ SubsystemDataBinding
```

Data endpoint/ticket MUST NOT进入 `RunnerBootstrapV1`；它们是 late、candidate-scoped material。

---

## 2. IPC Scope

IPC 只允许表达 provisioning lifecycle：

```text
Subsystem side is waiting for Data
provision candidate material
candidate prepared
commit candidate
revoke/dispose candidate
```

它 MUST NOT承载：

```text
Frame RPC
Runtime Control messages
business commands
Main authority mutation
Input/Render payload
Game/launch manifest rewrite
```

这是 Hostra-private IPC，不是新的 LoomRealm application protocol。

---

## 3. Runner-side Binding

Runner 在 `runSubsystem(...)` 时提供真实 `SubsystemDataBinding`。

```text
SubsystemDataBinding.acquire(signal)
→ mark one pending consumer wait
→ notify Host through provisioning IPC
→ receive candidate material
→ connect Data WS
→ report prepared
→ wait for Host commit
→ resolve {carrier,G,P}
```

Commit 前 carrier 不交给 `@loomrealm/subsystem/host`。

Abort / host leaves ready：

```text
cancel pending wait
close uncommitted carrier
ignore late candidate result
```

同一 Runtime host lifetime 只需要 0..1 pending acquire。

---

## 4. Minimal Private Messages

实现可使用 closed private messages，语义只需覆盖：

```text
runner → host : acquire
host   → runner: provision(candidate, endpoint, G, P)
runner → host : prepared(candidate)
host   → runner: commit(candidate)
host   → runner: revoke(candidate)
```

字段和编码保持 Hostra-private；不进入 `@loomrealm/wire` formal Data protocol，也不抽成 generic RPC。

`candidate` 仅用于 Host/Runner stale-work correlation，不是 Data Connection identity。

---

## 5. Failure Semantics

Candidate-level failure：

```text
WS connect failure
stale provision
revoke before commit
candidate timeout/disposal
```

默认只 dispose 当前 candidate；若 `SubsystemDataBinding.acquire` 仍有效，可继续保持 pending 等待 fresh material。

Provisioning channel 本身不可继续使用时，Binding MAY surface one non-abort rejection；现有 M8 Subsystem host semantics负责停止该 host lifetime 的后续 acquire。

以上均：

```text
!= Runtime failure
!= Frame unwind
```

真实 child process exit 仍由既有 RuntimeHosting supervision 处理。

---

## 6. Security / Transport

Hostra Data endpoint保持 local physical capability：

```text
127.0.0.1
fresh one-time unguessable material
single intended candidate
finite cleanup
```

Provisioning material不得来自 Game manifest；Host owns endpoint/ticket policy。

Data WebSocket application unit继续是一个 UTF-8 JSON text message；IPC 不解析 Data payload。

---

## 7. Placement

`@loomrealm/game-launcher-hostra` 只增加与其真实 Node child ownership直接相关的 provisioning mechanics。

Broker policy、Renderer pairing、Main authority revalidation仍留在 Desktop composition；不得因此把 `game-launcher-hostra` 扩成 Platform mega-package。

---

## 8. Closure

M9/02 关闭时，一个已 ready 的真实 Node Runner 可以在不重启、不修改 Runtime bootstrap、不借用 Runtime Control 的前提下，通过 dedicated IPC 获得 fresh Data candidate，并只在 Host commit 后向 `SubsystemDataBinding` 交付 carrier。
