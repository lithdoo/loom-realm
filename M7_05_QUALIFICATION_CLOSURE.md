# M7 / 05 — Qualification and Closure

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：05  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md) → [M7 / 04](M7_04_VERTICAL_INTEGRATION.md)  
> 目标：只定义 M7 最终 evidence/checklist；协议语义以 formal contract 为准，具体实现方式以前四份 M7 文档为准。

核心原则：

> **本文件不是第三份协议规范。M7 closure 只证明 Main committed authority 能被 Renderer 正确、原子、bounded、fail-closed 地镜像。**

---

## 1. Closure Scope

M7 必须关闭：

```text
@loomrealm/renderer-control
@loomrealm/main Renderer projection slice
@loomrealm/renderer minimal Control slice
deterministic cross-package vertical
```

默认不要求修改：

```text
@loomrealm/runtime-control
@loomrealm/subsystem
@loomrealm/game-package
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
@loomrealm/data
```

`@loomrealm/platform-ports` 只有在真实 ingress 阻塞证明需要新 Core↔Platform capability 时才进入 scope。

---

## 2. Abstraction Budget

M7 closure 应能说明以下抽象都有当前真实消费者：

```text
renderer-control Main peer
renderer-control Renderer peer
Main pure Snapshot projector
Renderer current Snapshot holder
```

M7 不接受仅为未来设计产生的：

```text
GenericRpcPeer / UniversalProtocolSession
RequestIdAllocator / PendingRequestMap for one-shot hello
StateReplicator / Publisher framework
RendererControlState duplicate DTO
public subscription/event bus without real consumer
Renderer Runtime/Frame shadow registries
DataAuthority allocator/policy before M8
historical authority log/Set for lifetime validation
speculative Platform renderer mega-port
```

---

## 3. Package Evidence — `@loomrealm/renderer-control`

必须通过：

```text
exact v1 exported types
closed schema + whole current-Snapshot validation
hello is first and one-shot
hello uses concrete id=1 correlation
version/auth behavior
hello Result before renderer.state
connection-local revision monotonicity
gap accepted / duplicate-regression terminal
bounded 0..1 in-flight + 0..1 pendingLatest
terminal first-wins
no retry/replay/history
non-empty DataAuthority fixture representation validation
```

特别证明：receiver 不维护 unbounded Activation/Data generation history。

---

## 4. Main Evidence

必须证明：

```text
one Main-owned sessionId
one Main-owned AuthorityRevision
Snapshot is pure projection of existing authority
no shadow Runtime/Frame/InputTarget authority
all Renderer-visible mutations reach explicit commit observation
Runtime lifecycle mapping is deterministic
initializing collapses without second renderer lifecycle state
activate/resume ACK before fresh Activation/InputTarget publication
revoked Activation never regranted
failure/unwind remains Main-only
M7 dataAuthorities is []
```

Main tests，而不是 Renderer receiver history，负责 lifetime identity invariants。

---

## 5. Renderer Evidence

必须证明：

```text
role state is currentPeer + RendererAuthoritySnapshotV1|null
accepted Snapshot replacement is atomic
new current peer replaces old peer
old peer output cannot mutate current state
current peer terminal clears currentSnapshot
no second revision/session validator
no duplicate RendererControlState DTO
no public subscription framework frozen without consumer
```

---

## 6. Vertical Evidence

必须走真实生产 integration path：

```text
live Main authority
→ real Main projector/revision
→ real renderer-control Main peer
→ MemoryCarrier
→ real renderer-control Renderer peer
→ real Renderer current Snapshot
```

禁止：

```text
harness reads Main private stack
harness manually constructs Snapshot
fake revision counter
bypass Main token/current-connection decision
```

必须覆盖：

```text
initial hello
Runtime lifecycle projection
initial Frame activate
frame.call
frame.return + fresh resume Activation
Runtime failure + fixed-point unwind result
connection replacement
slow consumer boundedness
terminal/fail-closed
```

Main M7 vertical 不要求非空 DataAuthority；真实 DataAuthority lifecycle 属于 M8。

---

## 7. Ingress Stop Condition

如果 deterministic vertical 只能通过以下方式成立：

```text
暴露 Main private authority
加入 test-only public API
测试手工制造 Renderer Snapshot
```

M7/04 不得标绿。

此时应 reopen ingress design，并基于真实阻塞关闭一个最窄的 Core↔Platform capability；不得为了形式完整预建 universal Renderer host/service interface。

---

## 8. Regression Evidence

必须保持 M1–M6 已关闭语义：

```text
Foundation/Wire
Game Package
Runtime Control
Subsystem Runtime/Frame
Main Runtime/Frame/Stack authority
Hostra Runtime vertical
```

特别防止：

```text
Renderer publication改变 Main Frame ordering
Snapshot convenience放松 ACK causal barrier
generic RPC extraction改变 Runtime Control
Renderer ingress制造 role/package cycle
```

---

## 9. Package / CI Evidence

至少：

```text
renderer-control build/test/pack
renderer build/test/pack if publishable
main M7 projection tests
M7 deterministic vertical
existing core regression suites
```

检查 dependency direction：

```text
main → renderer-control
renderer → renderer-control
renderer-control !→ main/renderer
main !→ renderer
renderer !→ main
```

Root M7 docs 不进入 runtime dependency/publish surface。

---

## 10. Documentation Closure

M7 complete 后同步：

```text
README implementation state
phase-1-delivery-plan M7 status
package README status
qualification evidence reference
formal contract status only if contract actually changed
```

M7 root docs 不替代 formal contract。

---

## 11. Explicit Non-goals

M7 complete 不表示：

```text
Main DataAuthority policy implemented
Renderer Data runtime integration
DataConnectionBroker
User Input / Frame Interest
Render Update / Render Store
Content
Desktop BrowserWindow Renderer Control transport
PWA Renderer Control transport
cross-platform equivalence
```

这些进入 M8+ / product composition milestones。

---

## 12. Closure Checklist

```text
[ ] M7_01 renderer-control minimal concrete peers qualified
[ ] no generic RPC/request/publication framework introduced
[ ] receiver keeps only bounded current-connection history

[ ] M7_02 Main pure projection implemented
[ ] no shadow Runtime/Frame/InputTarget authority
[ ] lifecycle mapping closed
[ ] lifetime Activation invariants Main-owned
[ ] M7 dataAuthorities remains []

[ ] M7_03 Renderer currentPeer + currentSnapshot|null implemented
[ ] no duplicate revision/session state machine
[ ] no duplicate Control DTO / premature observer API

[ ] M7_04 real integration path passes
[ ] no test-built authority Snapshot
[ ] connection replacement passes
[ ] slow-consumer boundedness passes
[ ] terminal/fail-closed passes

[ ] dependency graph remains acyclic
[ ] M1–M6 regression green
[ ] build/type/pack clean
[ ] README / delivery-plan status synchronized
```

---

## 13. Handoff to M8

M8 可以依赖：

```text
Renderer has either:
    one validated current Main Snapshot
    or null / no usable Main authority

Renderer Control wire already knows RendererDataAuthorityV1 shape
```

M8 才首次关闭：

```text
Main DataAuthority allocation/generation/profile policy
Subsystem DataPlane real consumer
Renderer Data binding real consumer
actual current Data Connection establishment
```

因此 M8 的问题是从真实 Data consumer 反推最小 capability，而不是继承 M7 的 fake Data policy。

---

## 14. Final Closure Statement

M7 可以标记 complete 的唯一含义：

> **同一 Main Session 的 committed Runtime / Frame / Activation / InputTarget authority，通过具体且 bounded 的 Renderer Control v1 peers，以完整 Snapshot 镜像到 Renderer；Main 不建立 shadow authority，Renderer 不建立第二套协议状态机，M7 不提前实现 Data/Input/Render/Platform future abstractions。**
