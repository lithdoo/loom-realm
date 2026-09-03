# M7 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：05  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md) → [M7 / 04](M7_04_VERTICAL_INTEGRATION.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：定义唯一 M7 implementation qualification/evidence matrix。协议事实以 Frozen Renderer Control v1 为准；实施只能满足本清单，不得在编码阶段扩张架构。

> **M7 closure = Main committed authority 经 frozen Binding + concrete Renderer Control peers，以 race-free、atomic、bounded、fail-closed 的方式镜像到唯一 current Renderer；Renderer Control failure不得改变 Frozen Frame / Runtime business authority。**

---

## 1. M7 Closure Scope

必须实现：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports M7 slice
    OpaqueMaterialGenerator
    RendererControlBinding
@loomrealm/main M7 slice
    sessionId / revision
    pure projection
    bounded Renderer accept loop
    atomic hello/currentness/replacement
    Session terminal retirement
@loomrealm/renderer minimal Control holder
deterministic MemoryCarrier vertical
```

不属于 M7 implementation closure：

```text
Hostra Renderer Control WebSocket physical realization
PWA Renderer Control MessagePort physical realization
concrete stalled-write timeout policy
Main DataAuthority policy / Data Broker
User Input / Render / Content
```

---

## 2. Abstraction Budget

允许且必须有当前真实 consumer的抽象：

```text
renderer-control Main peer
renderer-control Renderer peer
exact outbound hello preparation/preflight
OpaqueMaterialGenerator
RendererControlBinding
Main pure Snapshot projector
Main bounded Renderer accept loop + hello acceptance seam
Renderer current peer+Snapshot holder
```

禁止：

```text
GenericRpcPeer / UniversalProtocolSession
RequestIdAllocator / PendingRequestMap for hello
StateReplicator / Publisher framework
RendererControlState duplicate DTO
public Store subscription without M8 consumer
Renderer Runtime/Frame shadow registries
DataAuthority allocator/policy before M8
historical receiver Set/log
ConnectionRegistry / RendererPlatform / universal Renderer service interface
cancelable writer abstraction只为消除 old inFlight late bytes
```

---

## 3. `@loomrealm/renderer-control` Evidence

必须证明：

```text
root-only exact v1 types/surfaces
hello first / one-shot / id=1
closed schema + whole current-Snapshot validation
connection-local revision monotonicity
exact side-effect-free hello outbound preparation
actual UTF-8/depth/member/1MiB preflight
hello Result before later renderer.state
Renderer initial Snapshot returned before later-state consumption
retirement synchronously blocks new publication submission/send start
retirement clears pendingLatest + requests carrier close
already-started inFlight may settle without authority resurrection
0..1 inFlight + 0..1 pendingLatest
outbound representation failure terminalizes
terminal first-wins
no retry/replay/history
```

Receiver不得维护 unbounded Activation/Data generation history。

---

## 4. `@loomrealm/platform-ports` Evidence

Frozen M7 surface必须实现：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}

interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

证明：

```text
one acquire = one candidate physical attempt
success returns already-established carrier only
Binding does not authenticate/consume token
Binding does not decide current Renderer
abort-before-resolution prevents late live-carrier delivery
at most one successful result per acquire
Platform Ports still runtime-depends only on Foundation
```

`BootstrapTokenGenerator` current-v1 rename为 `OpaqueMaterialGenerator`，无 compatibility alias。

---

## 5. Main Evidence

必须证明：

```text
fresh Session-unique sessionId
initial Renderer revision = 1
revision comparison excludes revision itself
revision advances exactly once per visible committed payload change
no connection/transport-only revision bump
Snapshot pure projection / no shadow Runtime/Frame/InputTarget
Runtime lifecycle frozen mapping
ACK-before-fresh Activation/InputTarget
revoked Activation never regranted
M7 dataAuthorities=[]
```

### Accept loop

```text
at most one pending acquire/candidate
Renderer absence does not block Main Session business path
current Renderer may coexist with one future candidate
attempt terminal invalidates token
fresh next attempt uses fresh token
Binding Session-lifetime terminal不升级为 Runtime/Frame failure
```

### Hello atomicity

Main serialized transaction必须证明：

```text
Session/candidate/token/version validate
→ capture current R
→ exact prepared hello preflight
→ only on success consume token + switch current + retire old
```

必须覆盖：

```text
concurrent R+1 is either in hello or pending, never lost
unrepresentable candidate cannot evict healthy old current
prepared hello send failure does not resurrect old current
```

### Current peer terminal

```text
current terminal → clear current only
stale old terminal → ignored for new current
terminal alone → no revision bump
```

---

## 6. Renderer Evidence

必须证明：

```text
role state = one atomic {peer,snapshot} | null
initial peer+Snapshot installed before later state consumption
later Snapshot whole replacement
new peer replaces old peer
old late Snapshot ignored
old already-inFlight late delivery ignored after replacement
old terminal cannot clear new state
current terminal clears current atomically
no second revision/session validator
no duplicate DTO
no public subscription framework
```

---

## 7. Replacement Evidence

必须使用 A/B 两个 real peers：

```text
A current
→ B candidate
→ B exact preflight success
→ B atomic acceptance
→ A immediately non-current
→ A no new publication/send start
→ A pendingLatest settled
→ A carrier close requested
→ B initial Snapshot installed
```

验证：

```text
A already-started inFlight MAY physically arrive later
late A activity cannot mutate B current state/currentness
A terminal cannot clear B
B hello send failure leaves no current A resurrection
next recovery = fresh attempt/token
```

不能用“replacement 后 old peer绝不收到晚到 bytes”作为 Core pass condition。

---

## 8. Session Terminal Evidence

分别覆盖 root outcome / external shutdown / fatal：

```text
Session terminal latch
→ no fresh Renderer token/attempt
→ abort pending Binding acquire
→ invalidate pending token
→ retire candidate peer
→ retire current peer
→ stop future publication
```

并证明：

```text
Main Session result/Runtime cleanup不等待 Renderer physical close
Renderer current最终因 Control terminal变为 null
无 final session-ended RPC/Snapshot
```

---

## 9. Representation Isolation Evidence

合法 Main authority若 full Renderer Control message不可表示：

```text
candidate/current Control fails closed
Main Runtime/Frame/Stack unchanged
no committed transaction rollback
no Renderer-specific frame.call error
no Snapshot truncation/drop
```

M7不定义 Runtime count、Frame depth、DataAuthority count业务上限。

---

## 10. Vertical Evidence

必须走真实：

```text
RendererControlBinding
→ Main bounded accept loop
→ Main pure projection/revision/hello acceptance
→ renderer-control Main peer
→ MemoryCarrier
→ renderer-control Renderer peer
→ Renderer current holder
```

禁止：

```text
test reads Main private stack
test manually constructs Snapshot/revision
test directly marks peer current
test bypasses Binding/token/currentness
```

覆盖：

```text
initial Session/revision
hello concurrent mutation
initial Frame activate
frame.call
frame.return + fresh resume Activation
Runtime failure + fixed-point unwind
replacement
current/stale terminal
Session terminal
slow consumer structural boundedness
representation failure isolation
```

---

## 11. Backpressure Evidence Boundary

M7 core必须证明：

```text
0..1 inFlight
0..1 pendingLatest
no revision-sized queue/history
every terminal/retirement settles pending state
```

M7 MemoryCarrier **不**证明：

```text
Hostra WebSocket finite stalled-write timeout
PWA MessagePort host liveness timeout
```

这些是后续 concrete Platform qualification。

---

## 12. Dependency Evidence

目标：

```text
foundation → platform-ports
foundation + wire → renderer-control
main → platform-ports + runtime-control + renderer-control + wire
renderer → renderer-control
```

禁止：

```text
renderer-control → main/renderer/platform-ports
platform-ports → main/renderer-control
renderer → main/platform-ports
main → renderer
```

---

## 13. Regression Evidence

必须保持 M1–M6：

```text
Foundation/Wire
Game Package
Runtime Control
Subsystem Runtime/Frame
Main Runtime/Frame/Stack authority
Hostra Runtime vertical
```

特别验证：

```text
OpaqueMaterialGenerator rename不转移 credential authority
Renderer publication不改变 Frame ordering
representation failure不改变 Frame semantics
Session terminal Renderer retirement不改变 Main terminal result
no generic RPC extraction
```

---

## 14. Package / CI Evidence

至少：

```text
renderer-control build/test/pack
platform-ports build/test/pack
main M7 tests
renderer build/test/pack
M7 deterministic vertical
existing core regression suites
```

M7 root docs不进入 runtime package publish surface。

---

## 15. Documentation Closure After Implementation

M7 implementation qualification完成后再同步状态：

```text
README implementation state
phase-1-delivery-plan M7 → ✅
package README / DESIGN implementation status
qualification run/evidence reference
```

Frozen contract/ADR本身不因实现完成改变语义。

---

## 16. Explicit Non-goals

M7 complete 不表示：

```text
Main DataAuthority policy
Renderer Data runtime integration
DataConnectionBroker
User Input / Frame Interest
Render Update / Render Store
Content
Hostra physical Renderer Control
PWA physical Renderer Control
concrete transport stalled-write policy
cross-platform equivalence
```

---

## 17. Implementation Checklist

```text
[ ] M7_01 concrete asymmetric peers implemented
[ ] hello id=1 / no generic request framework
[ ] exact outbound hello preparation/preflight implemented
[ ] initial handoff before later-state consumption
[ ] retirement blocks new sends + clears pending
[ ] structural 1+1 boundedness

[ ] platform-ports OpaqueMaterialGenerator implemented
[ ] platform-ports RendererControlBinding implemented
[ ] no BootstrapTokenGenerator compatibility alias

[ ] MainPlatform M7 view implemented
[ ] Session id/revision=1 implemented
[ ] pure projection / no shadow authority
[ ] bounded accept loop implemented
[ ] hello preflight before current switch
[ ] concurrent revision cannot be lost
[ ] unrepresentable candidate cannot evict healthy current
[ ] replacement + stale/current terminal identity-safe
[ ] Session terminal abort/retirement implemented
[ ] M7 dataAuthorities=[]

[ ] Renderer atomic {peer,snapshot}|null implemented
[ ] no second revision/session state machine
[ ] no duplicate DTO / premature observer framework

[ ] deterministic vertical passes
[ ] call/return/failure traces pass
[ ] old already-inFlight late delivery has no authority effect
[ ] representation failure isolation passes
[ ] Session terminal trace passes

[ ] dependency graph acyclic
[ ] M1–M6 regression green
[ ] build/type/pack clean
```

---

## 18. Frozen Handoff to M8

M8 可依赖：

```text
Renderer either has one validated current Main Snapshot or null
Main current Renderer participant/replacement semantics already frozen
RendererControlBinding/Control-loss semantics already frozen
RendererDataAuthorityV1 wire shape already frozen
Control representation failure cannot alter Frame/Runtime authority
```

M8 首次实现：

```text
Main DataAuthority allocation/generation/profile policy
Subsystem DataPlane consumer
Renderer Data binding consumer
current Renderer participant ↔ physical Data provisioning
Data Connection establish/retire
```

---

## 19. Freeze Statement

本文件从 2026-09-03 起作为 M7 implementation qualification 的 Frozen evidence source。

实施者可自由选择内部文件/函数/class命名，但不得重新决定：

```text
RendererControlBinding shape/attempt semantics
hello preflight/current switch ordering
one-current + one-candidate bound
revision ownership
replacement retirement semantics
old inFlight可保证边界
Renderer initial handoff ordering
Session terminal Renderer retirement
representation failure isolation
DataAuthority defer-to-M8 boundary
```

需要改变这些内容必须按 ADR 0027 Reopen Rule先修改正式契约/ADR，再修改实现。