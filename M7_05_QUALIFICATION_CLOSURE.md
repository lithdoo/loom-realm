# M7 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：05  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_HOLDER.md) → [M7 / 04](M7_04_VERTICAL_INTEGRATION.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：定义唯一 M7 implementation qualification/evidence matrix；实施只能满足本清单，不得在编码阶段扩张架构。

> **M7 closure = Main committed authority 经 optional frozen Binding + concrete Renderer Control peers，以 race-free、atomic、bounded、fail-closed 的方式镜像到唯一 current Renderer；Renderer capability absence、Binding terminal或 Control failure不得改变 Frozen Frame / Runtime business authority。**

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
    optional Binding capability
    bounded candidate-slot loop when present/healthy
    atomic hello/currentness/replacement
    Session terminal retirement
@loomrealm/renderer minimal Control holder
deterministic MemoryCarrier vertical with Binding present
existing M5/M6 MainPlatform providers/fixtures mechanical migration
    bootstrapTokens / BootstrapTokenGenerator
    → opaqueMaterial / OpaqueMaterialGenerator
```

Existing Hostra/headless Runtime-only compositions MUST remain Renderer-capability absent unless they actually implement the M14/M16 physical Binding；M7 migration不得通过 fake/no-op Binding满足类型。

不属于 M7 closure：Hostra Renderer WS、PWA Renderer MessagePort、concrete stalled-write timeout、Main DataAuthority policy/Data Broker、User Input/Render/Content。

---

## 2. Abstraction Budget

允许且必须有真实 consumer：

```text
renderer-control Main peer
renderer-control Renderer peer
exact outbound hello preparation/preflight
OpaqueMaterialGenerator
RendererControlBinding
Main pure Snapshot projector
Main bounded optional-Binding candidate-slot loop + hello acceptance seam
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
fake/no-op RendererControlBinding
Binding typed-error hierarchy/retry manager
kind-specific random generator / generate(kind)
currentness lease / epoch / heartbeat layer
cancelable writer abstraction only to eliminate old inFlight late bytes
```

---

## 3. `@loomrealm/renderer-control` Evidence

必须证明：

```text
root-only exact v1 types/surfaces
hello first / one-shot / id=1
hello schema/protocolVersions validation owned by protocol peer
unsupported version fails before Main currentness acceptance
closed schema + whole current-Snapshot validation
connection-local revision monotonicity
exact side-effect-free hello outbound preparation
actual UTF-8/depth/member/1MiB preflight
hello Result before later renderer.state
Renderer initial Snapshot returned before later-state consumption
retirement synchronously blocks new publication/send start
retirement clears pendingLatest + requests carrier close
already-started inFlight may settle without authority resurrection
0..1 inFlight + 0..1 pendingLatest
outbound representation failure terminalizes
terminal first-wins
no retry/replay/history
```

Renderer receiver不得维护 unbounded lifetime history。

---

## 4. `@loomrealm/platform-ports` Evidence

Frozen M7 surface：

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

### Opaque material

证明每个 successful generation：

```text
ASCII
1..128 bytes
fresh
>=128 bits unpredictability for security-sensitive use
```

并证明 Main 为 sessionId / Runtime bootstrap / Renderer token 独立调用且不复用同一值。

Entropy qualification使用 implementation/construction evidence（例如 CSPRNG 至少 128 random bits）+ representation/freshness tests；不得通过大样本统计测试虚构“随机性证明”。

### Candidate slot

证明：

```text
one acquire arms one candidate slot
acquire may remain pending
calling acquire does not create/show Renderer or replace current
success returns one already-established carrier only
Binding does not authenticate/consume token
Binding does not negotiate protocol version
Binding does not decide current Renderer
```

### Edge cases

必须显式覆盖：

```text
no armed slot + physical candidate
→ no Main token
→ no live participant/carrier exposed to Main

one slot already bound + second candidate
→ second gets no token
→ second never reaches Main renderer-control peer

abort before resolution
→ ordinary cancellation
→ no late live carrier result

non-abort acquire rejection
→ Binding terminal for this Main Session
→ Main does not call acquire again

carrier acquired, then peer/protocol terminal
→ does NOT by itself terminalize Binding
→ fresh slot may be armed if Session live
```

Platform Ports仍 runtime-depends only on Foundation。`BootstrapTokenGenerator` current-v1 rename为 `OpaqueMaterialGenerator`，无 compatibility alias。

`RendererControlBinding` MAY be absent from `MainPlatform`；absence MUST NOT require fake Binding。

---

## 5. Main Evidence

必须证明：

```text
fresh Session-unique sessionId
initial Renderer revision = 1
revision comparison excludes revision itself
revision advances exactly once per visible committed payload change
transport/capability/peer changes alone do not bump revision
Snapshot pure projection / no shadow Runtime/Frame/InputTarget
Runtime lifecycle frozen mapping
ACK-before-fresh Activation/InputTarget
revoked Activation never regranted
M7 dataAuthorities=[]
```

### Capability absence

```text
rendererControl absent
→ no Renderer token/acquire attempt
→ Runtime bootstrap/Frame/call/return/failure/Session terminal unaffected
```

### Existing provider migration

```text
all M5/Main + M6/Hostra MainPlatform providers/fixtures
    bootstrapTokens → opaqueMaterial

no fake rendererControl field required
existing Hostra Runtime-only vertical remains Renderer-capability absent
existing credential registration/binding/consume authority remains in Main
existing CSPRNG generation strategy may remain when it satisfies frozen output contract
```

Migration compile/test failures are M7 closure failures；不得通过 compatibility alias或 duplicate old/new fields绕过。

### Candidate-slot loop

```text
at most one armed/pending/bound candidate
Renderer absence does not block Main Session business path
current Renderer may coexist with one future slot
slot cancellation invalidates token
acquired candidate terminal invalidates its token and may re-arm fresh slot
non-abort Binding rejection latches no-more-slots for Session
Binding terminal does not become Runtime/Frame failure
```

### Negotiation ownership

```text
renderer-control peer validates protocolVersions/selects v1
Main receives selected-v1 typed fact
Main does not parse/re-negotiate protocolVersions
```

### Hello atomicity

```text
candidate/token validate
→ capture current R
→ exact prepared hello preflight using already-selected v1
→ only on success consume token + switch current + retire old
```

必须覆盖 concurrent R+1 never lost、unrepresentable candidate cannot evict healthy old current、prepared hello send failure does not resurrect old current。

### Current peer terminal

```text
current terminal → clear current only
stale old terminal → ignored for new current
terminal alone → no revision bump
```

---

## 6. Renderer Holder Evidence

必须证明：

```text
role local state = one atomic {peer,snapshot} | null
initial peer+Snapshot installed before later state consumption
later Snapshot whole replacement
new peer replaces old peer
old late Snapshot ignored
old already-inFlight late delivery ignored after replacement
old terminal cannot clear new state
current terminal clears current atomically
local current!=null is not treated as independent proof of remote Main currentness
no lease/epoch/heartbeat layer
no second revision/session validator
no duplicate DTO
no public subscription framework
```

---

## 7. Replacement Evidence

使用 A/B real peers：

```text
A current
→ B binds armed candidate slot
→ protocol peer selects v1
→ B exact preflight success
→ B atomic Main acceptance
→ A immediately non-current in Main
→ A no new publication/send start
→ A pendingLatest settled
→ A carrier close requested
→ B initial Snapshot installed
```

验证 already-started A inFlight MAY late-arrive但无 B currentness/holder effect；A terminal不能清 B；B hello send failure不 resurrect A；next recovery=fresh attempt/token。

不能用“replacement 后 old peer绝不收到晚到 bytes”作为 Core pass condition。

---

## 8. Session Terminal Evidence

分别覆盖 root outcome / external shutdown / fatal：

```text
Session terminal latch
→ no fresh Renderer token/slot
→ abort pending Binding acquire if present
→ invalidate pending token
→ retire candidate peer
→ retire current peer
→ stop future publication
```

证明 Main Session result/Runtime cleanup不等待 Renderer physical close；Renderer current最终因 Control terminal变 null；capability absent/Binding terminal path均不制造额外 failure；无 final session-ended RPC/Snapshot。

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

Deterministic M7 vertical显式提供 `RendererControlBinding`：

```text
RendererControlBinding
→ Main bounded candidate-slot loop
→ renderer-control peer version negotiation
→ Main pure projection/revision/atomic hello acceptance
→ renderer-control Main peer
→ MemoryCarrier
→ renderer-control Renderer peer
→ Renderer current holder
```

禁止测试读取 Main private authority、手工构造 Snapshot/revision、直接标 current或绕过 Binding/token/currentness。

覆盖 initial Session/revision、candidate-slot edge cases、Binding rejection、hello race、Frame activate/call/return、Runtime failure/unwind、replacement、current/stale terminal、Session terminal、slow consumer boundedness、representation isolation。

Capability-absent path单独证明。

---

## 11. Backpressure Evidence Boundary

M7 core必须证明：

```text
0..1 inFlight
0..1 pendingLatest
no revision-sized queue/history
every terminal/retirement settles pending state
```

M7 MemoryCarrier不证明 Hostra/PWA actual stalled-write timeout。

---

## 12. Runtime Dependency Evidence

用明确 dependency set，不使用方向含糊的箭头：

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/renderer-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
```

禁止 renderer-control→main/renderer/platform-ports、platform-ports→main/renderer-control、renderer→main/platform-ports、main→renderer。

---

## 13. Regression Evidence

必须保持 M1–M6，特别检查：

```text
all existing MainPlatform providers/fixtures use opaqueMaterial after direct rename
M6 Hostra Runtime-only provider remains valid without rendererControl
Hostra existing CSPRNG material satisfies ASCII/length/unpredictability construction contract
OpaqueMaterialGenerator rename/output bound不转移 credential authority
optional Renderer capability不破坏 M6 Hostra Runtime-only composition
Binding terminal不变成 Runtime failure
Renderer publication不改变 Frame ordering
representation failure不改变 Frame semantics
Session terminal Renderer retirement不改变 Main terminal result
generic RPC/currentness framework没有发生
```

---

## 14. Package / CI Evidence

至少：

```text
renderer-control build/test/pack
platform-ports build/test/pack
main M7 tests including capability-absent/present/Binding-terminal paths
renderer build/test/pack
M7 deterministic Binding vertical
existing Main tests/fixtures after OpaqueMaterialGenerator migration
M6 Hostra package/e2e regression after provider migration
existing core regression suites
```

M7 root docs不进入 runtime package publish surface。

---

## 15. Documentation Closure After Implementation

M7 qualification完成后再同步 README/phase plan/package implementation status和 qualification run reference。Frozen contract/ADR不因实现完成改变语义。

---

## 16. Explicit Non-goals

M7 complete 不表示 Main DataAuthority policy、DataConnectionBroker、User Input、Render、Content、Hostra/PWA physical Renderer Control、concrete transport stalled-write policy或 cross-platform equivalence已完成。

---

## 17. Implementation Checklist

```text
[ ] renderer-control concrete asymmetric peers implemented
[ ] protocol peer owns hello version negotiation
[ ] hello id=1 / no generic request framework
[ ] exact outbound hello preparation/preflight implemented
[ ] initial handoff before later-state consumption
[ ] retirement blocks new sends + clears pending
[ ] structural 1+1 boundedness

[ ] OpaqueMaterialGenerator implemented with ASCII 1..128 byte / >=128-bit unpredictability contract
[ ] independent material used for session/runtime/renderer semantics
[ ] existing M5/Main providers/fixtures migrated bootstrapTokens→opaqueMaterial
[ ] existing M6/Hostra providers/fixtures migrated without fake rendererControl
[ ] existing Hostra CSPRNG strategy reviewed/qualified against new material contract
[ ] RendererControlBinding implemented
[ ] acquire pending does not create Renderer
[ ] no-slot and already-bound extra candidate cases rejected/closed
[ ] abort cancellation has no late live result
[ ] non-abort acquire rejection terminalizes Binding for Session
[ ] acquired peer failure does not falsely terminalize Binding
[ ] no BootstrapTokenGenerator compatibility alias

[ ] MainPlatform.rendererControl optional capability implemented
[ ] capability-absent path stays functional
[ ] Session id/revision=1 implemented
[ ] pure projection / no shadow authority
[ ] bounded candidate-slot loop only while Binding present/healthy
[ ] Main does not renegotiate protocol version
[ ] hello preflight before current switch
[ ] concurrent revision cannot be lost
[ ] unrepresentable candidate cannot evict healthy current
[ ] replacement + stale/current terminal identity-safe
[ ] Session terminal abort/retirement implemented
[ ] M7 dataAuthorities=[]

[ ] Renderer atomic {peer,snapshot}|null implemented
[ ] local holder not treated as remote currentness proof
[ ] no lease/epoch/heartbeat currentness layer
[ ] no second revision/session state machine
[ ] no duplicate DTO / premature observer framework

[ ] deterministic vertical passes
[ ] call/return/failure traces pass
[ ] old already-inFlight late delivery has no authority effect
[ ] representation failure isolation passes
[ ] Session terminal trace passes

[ ] dependency graph acyclic
[ ] M1–M6 regression green, including Hostra M6 e2e after material-provider migration
[ ] build/type/pack clean
```

---

## 18. Freeze Statement

本文件从 2026-09-03 起作为 M7 implementation qualification 的 Frozen evidence source。

实施者可自由选择内部文件/函数/class命名，但不得重新决定：

```text
RendererControlBinding shape/candidate-slot semantics
abort cancellation vs non-abort Binding terminal rejection
OpaqueMaterialGenerator common output contract
MainPlatform Renderer capability optionality
protocol version negotiation ownership
hello preflight/current switch ordering
one-current + one-candidate bound
revision ownership
replacement/old-inFlight semantics
Renderer local holder vs remote currentness boundary
Renderer initial handoff ordering
Session terminal Renderer retirement
representation failure isolation
DataAuthority defer-to-M8 boundary
```

需要改变这些内容必须按 ADR 0027 Reopen Rule先修改正式契约/ADR，再修改实现。
