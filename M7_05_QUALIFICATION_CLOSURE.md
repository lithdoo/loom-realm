# M7 / 05 — Qualification and Closure

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：05  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md) → [M7 / 04](M7_04_VERTICAL_INTEGRATION.md)  
> 目标：只定义 M7 最终 evidence/checklist；协议语义以 formal contract 为准，具体实现以前四份 M7 文档为准。

核心原则：

> **M7 closure 证明 Main committed authority 能被 Renderer 以 race-free、atomic、bounded、fail-closed 的方式镜像；Renderer Control failure不能反向改变 Frozen Frame / Runtime business authority。**

---

## 1. Closure Scope

M7 必须关闭：

```text
@loomrealm/renderer-control
@loomrealm/main Renderer projection/hello/current-peer slice
@loomrealm/renderer minimal Control slice
@loomrealm/platform-ports narrow fresh opaque material capability refinement
deterministic cross-package vertical
```

默认不实现：

```text
Renderer physical hosting port
Hostra Renderer Control WebSocket
PWA Renderer Control MessagePort
Main DataAuthority policy
Renderer Data/Input/Render/Content
```

若 real carrier ingress 在实现时确实无法在不暴露 Main internals 的情况下成立，才允许基于真实阻塞补一个最窄 Renderer ingress port；不得预建 mega-interface。

---

## 2. Abstraction Budget

M7 允许且必须有真实消费者的抽象：

```text
renderer-control Main peer
renderer-control Renderer peer
Main pure Snapshot projector
Main hello acceptance seam
Renderer current peer + Snapshot holder
OpaqueTokenGenerator narrow platform capability
```

其中 `OpaqueTokenGenerator` 已有多个真实 Main consumer：Runtime bootstrap token、Renderer Control token、Session identity material。

M7 不接受：

```text
GenericRpcPeer / UniversalProtocolSession
RequestIdAllocator / PendingRequestMap for one-shot hello
StateReplicator / Publisher framework
RendererControlState duplicate DTO
public Store subscription without real consumer
Renderer Runtime/Frame shadow registries
DataAuthority allocator/policy before M8
historical receiver Set/log for lifetime validation
RendererPlatform / universal Renderer host/service interface without ingress evidence
```

---

## 3. Renderer-control Package Evidence

必须证明：

```text
exact v1 root-exported wire types
hello first / one-shot / id=1
closed schema + whole current-Snapshot validation
connection-local revision monotonicity
hello Result before later renderer.state
Renderer initial hello Snapshot exposed before later state consumption
active peer retirement stops publication + closes carrier
retire during pending write settles bounded state
0..1 in-flight + 0..1 pendingLatest
outbound representation preflight
terminal first-wins
no retry/replay/history
```

receiver 不维护 unbounded Activation/Data generation history。

---

## 4. Main Evidence

必须证明：

```text
fresh Session-unique sessionId
initial Renderer revision = 1
revision comparison excludes revision field itself
revision advances exactly once per visible committed payload change
transport/peer changes alone do not advance revision
Snapshot is pure projection of existing authority
no shadow Runtime/Frame/InputTarget state
Runtime lifecycle mapping is deterministic
ACK-before-fresh Activation/InputTarget preserved
revoked Activation never regranted
M7 dataAuthorities = []
```

### Hello atomicity

必须有并发证据证明：

```text
hello acceptance
= token consume + capture current R + install new current + retire old current
```

相对于 Renderer-visible Main mutation是一个 serialized authority transaction。

不得存在：

```text
hello returns R
Main commits R+1 in acceptance gap
R+1 neither in hello nor pending state
```

### Current-peer terminal

```text
current peer terminal → clear current peer only
stale old peer terminal → cannot clear new current
peer terminal alone → no rendererRevision bump
```

---

## 5. Renderer Evidence

必须证明：

```text
role state = currentPeer + RendererAuthoritySnapshotV1|null
peer + initial Snapshot installed atomically
later state consumption starts only after initial install
new peer replaces old peer
old peer late Snapshot ignored
old peer terminal cannot clear new state
current peer terminal clears peer + Snapshot together
no second revision/session validator
no duplicate Control DTO
no public subscription framework frozen
```

---

## 6. Replacement Evidence

replacement必须是 active revocation：

```text
A current
→ B successful hello atomic acceptance
→ B only current
→ A removed from publication immediately
→ A carrier close/terminal requested
→ A Renderer fails closed locally
```

必须验证：

```text
A does not remain silently stale
A pending publication settles
B hello send failure does not resurrect A
fresh attempt required after failed B
```

“Main 不再给 A 发 state”但 A carrier长期保持 current-looking 状态，不算 closure。

---

## 7. Representation-limit Evidence

Renderer Control 的 limits 只属于 wire/connection safety。

必须证明一个合法 Main authority若当前完整 Snapshot无法在 v1 profile内表示：

```text
Renderer Control attempt/current connection fails closed
Main Runtime/Frame/Stack authority remains unchanged
no committed transaction rollback
no Renderer-specific frame.call error
no Snapshot truncation/drop
```

M7 不定义额外：

```text
Runtime count business max
Frame Stack depth business max
DataAuthority count business max
```

因此 Frozen Frame v1 不需要为 Renderer Control增加新的 call rejection语义。

---

## 8. Vertical Evidence

必须走：

```text
live Main authority
→ real revision/projector/hello acceptance
→ real renderer-control Main peer
→ MemoryCarrier
→ real Renderer peer
→ real Renderer current state
```

禁止：

```text
test reads Main private stack
test manually constructs authority Snapshot
fake revision counter
bypass Main token/current-peer decision
```

覆盖：

```text
initial Session/revision
hello concurrent mutation race
Runtime lifecycle projection
initial Frame activate
frame.call
frame.return + fresh resume Activation
Runtime failure + fixed-point unwind
active connection replacement
current/stale terminal race
slow consumer structural boundedness
representation failure isolation
```

---

## 9. Backpressure Evidence Boundary

M7 core必须证明：

```text
0..1 in-flight
0..1 pendingLatest
no revision-sized queue/history
terminal cleanup releases pending state
```

M7 deterministic MemoryCarrier **不**用来宣称 Hostra/PWA actual stalled-write timeout 已验证。

后续 concrete product qualification分别证明：

```text
Hostra WebSocket finite stalled-write close policy
PWA MessagePort/host finite failure/liveness policy
```

这与 core boundedness 是两份不同 evidence。

---

## 10. Opaque Material Evidence

`@loomrealm/platform-ports` 的 M7 refinement必须保持：

```text
one tiny generate(): string capability
no token registry
no identity service
no semantic binding in Platform
```

Main分别为 Session、Runtime attempt、Renderer attempt取得 fresh value，并自己验证/绑定/consume。

Concrete Hostra/test platform适配不得扩张成 universal credential broker。

---

## 11. Dependency Evidence

目标方向：

```text
foundation/wire → renderer-control
platform-ports → main
renderer-control →?  NO
main → renderer-control
renderer → renderer-control
```

准确 invariant：

```text
renderer-control !→ main
renderer-control !→ renderer
renderer-control !→ platform-ports
main !→ renderer
renderer !→ main
```

`main` 同时消费 `platform-ports` 与 `renderer-control` 是合法组合，不形成 role cycle。

---

## 12. Regression Evidence

M7不得破坏：

```text
M1 Foundation/Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime/Frame
M5 Main Runtime/Frame/Stack
M6 Hostra Runtime vertical
```

特别检查：

```text
Renderer publication不改变 Frame mutation ordering
Renderer representation failure不改变 frame.call semantics
opaque token capability泛化不转移 Main credential authority
generic RPC extraction没有发生
```

---

## 13. Package / CI Evidence

至少：

```text
renderer-control build/test/pack
platform-ports build/test
main M7 projection/hello/replacement tests
renderer build/test/pack if publishable
M7 deterministic vertical
existing core regression suites
```

Root M7 docs 不进入 runtime package publish surface。

---

## 14. Documentation Closure

M7 complete 后同步：

```text
README implementation state
phase-1-delivery-plan M7 status
package README status
formal Renderer Control contract review date/status
qualification evidence reference
```

formal contract是协议事实源；M7 root docs是 implementation plan/evidence source。

---

## 15. Explicit Non-goals

M7 complete 不表示：

```text
Main DataAuthority policy
Renderer Data runtime integration
DataConnectionBroker
User Input / Frame Interest
Render Update / Render Store
Content
Desktop BrowserWindow Renderer Control transport
PWA Renderer Control transport
concrete transport stalled-write policy qualified
cross-platform equivalence
```

---

## 16. Closure Checklist

```text
[ ] M7_01 concrete asymmetric renderer-control peers qualified
[ ] hello id=1 / no generic request framework
[ ] initial hello handoff before later-state consumption
[ ] active retirement closes old carrier
[ ] structural 1+1 publication boundedness
[ ] representation preflight/fail-close

[ ] M7_02 fresh opaque material capability closed
[ ] sessionId fresh + revision starts at 1
[ ] revision comparison excludes revision itself
[ ] Main pure projection / no shadow authority
[ ] hello acceptance atomic against Main visible mutation
[ ] replacement currentness + old-peer retirement closed
[ ] stale/current peer terminal identity-safe
[ ] M7 dataAuthorities remains []

[ ] M7_03 currentPeer + currentSnapshot|null only
[ ] peer + initial Snapshot atomic install
[ ] no second revision/session state machine
[ ] no duplicate DTO / premature observer framework

[ ] M7_04 real vertical path passes
[ ] concurrent hello revision cannot be lost
[ ] old connection actively terminalized
[ ] call/return/failure traces pass
[ ] representation limit cannot mutate Frame/Runtime authority
[ ] no test-built authority Snapshot

[ ] dependency graph acyclic
[ ] M1–M6 regression green
[ ] build/type/pack clean
[ ] README / phase plan / contract status synchronized
```

---

## 17. Handoff to M8

M8 可以依赖：

```text
Renderer either has one validated current Main Snapshot or null
Renderer participant replacement/currentness is already authoritative
Renderer Control wire already knows RendererDataAuthorityV1 shape
Control representation failure does not alter Frame/Runtime semantics
```

M8 首次关闭：

```text
Main DataAuthority allocation/generation/profile policy
Subsystem DataPlane real consumer
Renderer Data binding real consumer
current Renderer participant ↔ Data provisioning binding
actual Data Connection establishment/retirement
```

---

## 18. Final Closure Statement

M7 可以标记 complete 的唯一含义：

> **同一 Main Session 的 committed Runtime / Frame / Activation / InputTarget authority，通过一个 hello/currentness 原子、replacement 主动撤销、publication 结构 bounded、representation failure 隔离的 Renderer Control v1 链路，被完整镜像到当前 Renderer；Main 不建立 shadow authority，Renderer 不建立第二套协议状态机，Renderer Control 的失败或 wire limits 不改变 Frozen Frame / Runtime business semantics。**
