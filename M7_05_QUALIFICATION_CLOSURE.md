# M7 / 05 — Qualification and Closure

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：05  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md) → [M7 / 04](M7_04_VERTICAL_INTEGRATION.md)  
> 目标：定义 M7 的最终 qualification evidence、package/CI closure 条件、非目标与下一阶段 handoff；只有本文件条件全部满足时才可把 M7 标记为 complete。

核心原则：

> **M7 closure 证明“Main committed authority 能被 Renderer 正确、原子、bounded、fail-closed 地镜像”，不证明 Data/Input/Render/Content 或物理 Desktop/PWA composition 已完成。**

---

## 1. Closure Scope

M7 closure 涉及：

```text
@loomrealm/renderer-control
@loomrealm/main
@loomrealm/renderer
cross-package deterministic integration
```

默认不要求修改：

```text
@loomrealm/runtime-control
@loomrealm/subsystem
@loomrealm/game-package
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
@loomrealm/data
@loomrealm/fsdb-http
```

`@loomrealm/platform-ports` 只有真实 M7 consumer 证明存在必要的新 Core↔Platform capability 时才允许进入 scope；不能为了形式完整而预建接口。

---

## 2. Required Package State

### `@loomrealm/renderer-control`

必须具备：

```text
exact v1 wire types
closed schema validation
renderer.hello
renderer.state
full Snapshot validation
session/revision mechanics
bounded latest publication
terminal/fail-closed behavior
root-only public surface
package-local tests
```

### `@loomrealm/main`

必须具备：

```text
Main-owned sessionId
Main-owned AuthorityRevision
committed Renderer authority projection
immutable full Snapshot capture
ACK causal barriers preserved
rendererControlToken auth authority integration
publication seam into renderer-control
```

### `@loomrealm/renderer`

必须具备：

```text
M7 package slice
atomic Control Store
session replacement
revision monotonic application
control-loss authority invalidation
no Data/Input/Render implementation leakage
```

---

## 3. Required Trace Evidence

至少保留以下可重复测试证据：

```text
initial hello Snapshot
Runtime declared → ready projection
initial Frame initialize/activate projection
activate ACK-before-InputTarget
frame.call committed transitions
frame.return + fresh resume Activation
revoked Activation never reappears
Runtime failure + fixed-point unwind result projection
DataAuthority logical add/replace/revoke
connection replacement/reload
control connection terminal
slow consumer/coalescing
```

测试不要求观察每个 intermediate revision；要求 Renderer eventual current state 与 Main latest committed authority 一致。

---

## 4. Protocol Conformance

必须验证：

```text
hello is first application message
only renderer.hello is Request
renderer.state is Main → Renderer Notification
batch forbidden
closed v1 schema
whole-message limits
depth/member/topology limits
positive safe integer rules
request ID never reused on sender connection
unsupported version terminal behavior
auth failure does not leak token diagnosis
hello Result precedes all state notifications
revision gaps accepted
revision duplicate/regression rejected
no delta/patch/replay/resync
```

---

## 5. Authority Conformance

必须证明：

```text
Main is unique authority
Renderer Control does not allocate AuthorityRevision
Renderer does not create InputTarget
Renderer does not compute Runtime failure unwind
Renderer does not interpret call/return as authority commands
DataAuthority contains no endpoint/credential
Input Interest not present in Control Snapshot
Render state not present in Control Snapshot
```

任何测试 helper 若绕过真实 ownership 都不能作为 closure evidence。

---

## 6. Atomicity

必须构造会同时改变多个 Renderer-visible facts 的 Main transaction，并证明 Renderer 不观察半状态。

示例：

```text
caller active + InputTarget
→ call transition
→ caller suspended
→ InputTarget null
→ child starting
```

实现可以发布多个已提交 transitional Snapshots，但每个 Snapshot 本身必须是 Main 当时一个合法完整 authority state。

不得通过 per-field Renderer events模拟原子 Snapshot。

---

## 7. Boundedness

必须证明：

```text
0..1 in-flight publication
+
at most one replaceable latest unsent Snapshot
```

在持续 Main mutation + blocked Renderer writer 条件下：

```text
memory does not grow with revision count
pending queue does not grow with revision count
terminal cleanup releases pending state/listeners
```

M7 不接受“测试规模下没出问题”作为 boundedness 证据；实现结构必须显式 bounded。

---

## 8. Fail-closed

Renderer 遇到以下情况必须停止把缓存状态当作 current authority：

```text
invalid JSON/schema
invalid Snapshot relation
revision regression/duplicate
invalid session behavior
oversize message
carrier terminal
protocol terminal
```

M7 时至少可观察：

```text
Control Store current authority usability revoked
InputTarget usability revoked
DataAuthority usability revoked
```

M8+ 的真实 Data connections 再接入 physical retire/close。

---

## 9. Regression Requirements

M7 不得破坏已有：

```text
M1 Foundation/Wire tests
M2 Game Package validation
M3 Runtime Control mechanics
M4 Subsystem Runtime/Frame behavior
M5 Main Runtime/Frame/Stack semantics
M6 Hostra runtime vertical
```

尤其要防止：

```text
为 Renderer publication 改写 Main mutation ordering
为 Snapshot convenience 放松 Frame ACK barrier
为 connection abstraction 改变 Runtime Control transport semantics
为共享代码提取 generic RPC framework
```

---

## 10. CI / Repository Qualification

建议最终至少形成：

```text
renderer-control package CI/test target
renderer package CI/test target
main package M7 regression target
M7 vertical integration target
```

同时运行已有核心测试。

Qualification matrix 至少覆盖 repository support baseline（当前 Node >=20）；如果包声明 browser-compatible runtime source，应避免在 package runtime source 中引入 `node:*`。

---

## 11. Pack / Publish Boundary

至少检查：

```text
npm pack --dry-run for @loomrealm/renderer-control
npm pack --dry-run for @loomrealm/renderer if publishable
root export resolves
.d.ts generated
no test/internal source unintentionally published
no M7 root implementation docs accidentally become package runtime dependency
```

Root M7 documents属于 repository implementation tracking，不需要随 npm package 发布。

---

## 12. Documentation Closure

M7 完成时同步：

```text
README current implementation state
phase-1-delivery-plan M7 status
package README status
relevant contract status/review date only if contract actually changed
implementation/qualification evidence reference
```

不要仅修改 milestone checkbox，而留下 README 旧状态。

如实现导致 formal contract 变化，必须先记录 contract/ADR provenance，再更新实现文档；不要让 root M7 文档成为协议事实源替代品。

---

## 13. Explicit Non-goals for M7 Closure

即使 M7 complete，也不得声称以下完成：

```text
Renderer Data Profile runtime integration
Renderer ⇄ Subsystem Data Connection
DataConnectionBroker
late Data provisioning
User Input
Frame Interest
Render Update
Render Store
Content
DOM/Canvas/WebGL presentation
Desktop BrowserWindow product composition
PWA Renderer/Worker composition
cross-platform equivalence
```

这些属于 M8+ 后续 slices。

---

## 14. Stop Conditions

以下情况必须停止实现并 reopen design/contract，而不是继续打补丁：

```text
Main cannot produce one legal full Snapshot for a legal authority state
required Snapshot field has ambiguous authority owner
Renderer needs operation history to interpret current authority
protocol package must know Main Registry internals
renderer-control needs transport-specific endpoint/credential
bounded latest-state publication cannot preserve required causal semantics
real consumer requires a generic extension bag to proceed
```

这些都说明边界设计存在实质问题。

---

## 15. M7 Closure Checklist

```text
[ ] M7_01 renderer-control package implemented and qualified
[ ] M7_02 Main committed authority projection implemented
[ ] M7_03 Renderer Control Store implemented
[ ] M7_04 deterministic vertical passes

[ ] hello/auth/version behavior passes
[ ] exact full Snapshot validation passes
[ ] Main-owned revision semantics pass
[ ] activate/resume ACK causal barriers pass
[ ] call/return traces pass
[ ] runtime failure/unwind projection passes
[ ] logical DataAuthority traces pass
[ ] connection replacement passes
[ ] slow-consumer boundedness passes
[ ] terminal/fail-closed passes

[ ] existing M1–M6 regression suite remains green
[ ] package dependency graph has no role cycle
[ ] package pack/build/type output is clean
[ ] root/phase README status is synchronized
```

---

## 16. Handoff to M8

M7 完成后，M8 可以假设以下稳定事实：

```text
Renderer always has either:
    a validated current Main authority Snapshot
    or no usable Main authority

DataAuthority is already represented as:
    subsystemKey + generation + dataProfile

Renderer Data integration must consume this authority
rather than creating a second policy source
```

M8 的第一个问题因此不是重新设计 Renderer authority，而是：

```text
How does a current logical DataAuthority become one actual Renderer ⇄ Subsystem Data Connection?
```

---

## 17. Final Closure Statement

M7 可以标记为 complete 的唯一含义：

> **同一个 Main Session 中，Main committed Runtime / Frame / Activation / InputTarget / DataAuthority authority 能通过 `@loomrealm/renderer-control` 以完整、严格验证、revision-monotonic、bounded、fail-closed 的方式复制到 `@loomrealm/renderer` Control Store；既有 Main Runtime/Frame semantics 不因 Renderer 的加入而改变。**
