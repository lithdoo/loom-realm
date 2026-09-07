# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / **M10 Closed / M11 Implemented / Qualification Reopened**  
> 主要定义：M0..M16 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 当前 Input 决策：[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 当前 M11 评审：[M11 Render 最终闭环评审结论](./m11-final-closure-review.md)  
> 最近复核：2026-09-07

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render
→ Content
→ loom.map
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

首次实现只维护一个 current model；不制造 fake v2 / deprecated alias / generic framework。

---

## M0：文档与契约基线

Current docs统一 Game/Launcher/Main、Runtime/Frame、Renderer Control、Data/Input/Render contracts与 Platform composition boundary。

---

## M1：Foundation + Wire ✅

MessageCarrier/MemoryCarrier + JSON/JSON-RPC representation/limits primitives。

---

## M2：Game Package v1 ✅

Common Game Entry validation/snapshot capability。M6 Hostra first real consumer；M15 PWA second consumer。

---

## M3：Runtime Control Mechanics ✅

one reader / one writer、strict sender IDs、finite deadlines、terminal first-wins、no retry/replay/reconnect。

---

## M4：Subsystem Runtime/Frame Core ✅

Runtime/Frame author/host slice implemented；Input/Render/Content分别 M10/M11/M12。

---

## M5：Main Core + LogicalGameBootstrap ✅

Runtime/Frame authority、Stack/Activation/InputTarget、serialized mutation、failure unwind、Session terminal implemented。

---

## M6：Hostra Platform Vertical / Node Runner ✅

Qualified 2026-09-03：Hostra PREPARE → LaunchPlan/bootstrap → Node Runner → Runtime Control WS → real Main/Subsystem vertical。

---

## M7：Renderer Control ✅

Qualified 2026-09-03：

```text
@loomrealm/renderer-control peers
OpaqueMaterialGenerator
optional RendererControlBinding candidate slot
Main pure authority projection/revision/currentness
Renderer local holder
replacement/race/fail-closed qualification
```

Physical BrowserWindow Renderer Control remains M14；PWA M16。

---

## M8：Renderer Data Role/Core ✅

Qualified 2026-09-04：

```text
Main ready-derived DataAuthority
RendererDataBinding / SubsystemDataBinding
Subsystem optional Data peer lifecycle
Renderer per-subsystem Data reconciliation
real @loomrealm/data peers
```

No Broker/Input/Render business semantics in M8。

---

## M9：Desktop DataConnectionBroker / Late Provisioning ✅

Qualified 2026-09-04：

```text
Main → Platform full Data authority view
exact HostedRuntime target
Hostra Runtime-scoped provisioner + child IPC
Desktop paired Data WebSocket Broker
commit-time revalidation
install-before-role-delivery
post-install delivery failure never resurrects old current
```

Root gate：`npm run test:m9`。

M9只证明 physical Data lifecycle；fresh Input/Render business baseline属于 M10/M11。

---

## M10：User Input v1 + InputManager — **Implemented / Qualified / Closed**

Current facts：

```text
User Input protocolVersion = 1
fixtureSetRevision = 2
ADR 0023 + ADR 0029
no further design round expected before coding
```

Root implementation plans：

```text
M10_01_SUBSYSTEM_INPUT_MANAGER.md
M10_02_RENDERER_INPUT_GATE.md
M10_03_RENDERER_INPUT_PRODUCERS.md
M10_04_VERTICAL_INTEGRATION.md
M10_05_QUALIFICATION_CLOSURE.md
```

### Exact Subsystem author slice

```text
one InputManager / instance
SubsystemScope.createInputListener exact surface
InputChannel → canonical payload typed mapping
channels/setChannels solely own Interest contribution
on/unsubscribe solely own callback registration
setChannels preserves dormant registrations
unsubscribe + close idempotent
stable deterministic handler snapshot/order
async handler Promise does not block Data reader
immutable retained State/local state baseline
known-no-commit convergence before frame.call rejection observable
latest-only Interest publication
```

### Renderer slice

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
one input gate per current Data slot
one bounded State/Event/Reset publisher
Event/Reset global State-coalescing barriers
exact createRendererControlHolder(data?, input?) additive API
one construction-time RendererInputSource object
0..1 active source subscription for current Control peer
fresh source facts after Control replacement/reconnect
```

### Implementation verification and formal qualification

Real M9 Desktop Data vertical必须证明：

```text
exact SDK contribution/handler semantics
handler registration order + stable snapshot
async handler isolation
Interest-first / Authority-first convergence
nested child call / fresh Activation
recoverable frame.call State-before-rejection convergence
committed call never leaks old suppressed State
same-generation Data reconnect fresh baseline/no Event replay
fresh-generation role fixture
Control replacement source restart + late callback isolation
producer loss/return
handler/local author error isolation
barrier/backpressure rules
```

fresh-generation语义的 implementation regression 使用 role-level deterministic fixture证明，不为测试提前加入 Main generation allocator。

M10声明 User Input implementation、current platform-independent fixtureSetRevision=2 role qualification、frozen SDK/source projection与 Hostra/Desktop vertical 已通过；Hostra/PWA transport equivalence留到 M16。

Implementation qualification gate：

```text
npm run test:m10
```

该 closure gate已落地并通过；不得以更窄的 package-only test替代。

### Freeze rule

从当前状态开始，M10实现阶段允许改变：

```text
private names/layout/data structure
finite local queue capacity
private detach/freeze/token representation
```

不得重新讨论：

```text
public InputListener semantics
handler payload shape/order/async behavior
mutation reopen/rejection ordering
Renderer source construction/lifetime
User Input authority/lifetime/wire/backpressure
```

若编码遇到困难，默认按实现问题处理；只有证明 Frozen docs自身存在 correctness contradiction 才重新打开设计。

---

## M11：Render Update v1 + RenderManager — **Implemented / Qualification Reopened / Pending**

Current facts：

```text
Render Update protocolVersion = 1
Conformance fixtureSetRevision = 1
M10 = Implemented / Qualified / Closed
M11 production architecture = implemented
M11 root gate = npm run test:m11
M11 final closure review = doc/30-implementation/m11-final-closure-review.md
```

2026-09-07 最终复核不重新打开 Render authority/lifetime/protocol design；只重新打开 production representation validation 与 formal qualification evidence。历史 `202 fixtures / 266 role records` 不再构成 current closure evidence。

修复后的 source-derived audit target：

```text
unique fixtures       = 203
subsystem-sender      = 82
renderer-receiver     = 185
role evidence pairs   = 267
transport             = 0
```

Root implementation plans：

```text
M11_01_SUBSYSTEM_RENDER_MANAGER.md
M11_02_RENDER_PUBLICATION.md
M11_03_RENDERER_STORE.md
M11_04_VERTICAL_INTEGRATION.md
M11_05_QUALIFICATION_CLOSURE.md
```

### Exact Subsystem author slice

M11 root只新增：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

Exact seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

固定：

```text
one internal RenderManager responsibility per Subsystem instance
all author operations synchronous local-only
validate → detach caller-owned value → atomic local commit / bounded Event offer
successful state/event always Frozen Render v1 representable
live business Domains <= 256
invalid shape/semantic/stale target/closed handle → TypeError
hard-limit overflow → RangeError
close idempotent; replace/emit after close reject
SDK domainId never reused within one Subsystem Runtime instance
business Node key one-shot within one business RenderDomain lifetime
Frame/Data do not own business Domain lifetime
```

不新增 public RenderManager、Render-specific error hierarchy、Frame→Domain registry或 business-key→wire-key translation layer。

最终 correction 只允许在现有 author validation 中补齐 generic JSON Unicode-scalar representation guard；不得把 author API 绑定到 Data codec result或新增 public validator。

### Publication slice

```text
business Domains
→ one bounded publication responsibility
→ existing SubsystemDataPeer.render
```

fresh current carrier：

```text
render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

same-generation reconnect：

```text
keep generation-scoped emitted Domain/Node one-shot history
retire old carrier cursor/pending output
fresh Registry + Snapshots
```

Event：

```text
no current carrier
→ not retained into a future carrier

current carrier + Domain unbaselined
→ MAY bounded-pend behind establishing Snapshot

carrier loss / Domain removal
→ pending Event discarded

never replay across carrier
```

第一版允许保守 Snapshot fallback；Patch-vs-Snapshot heuristic是 private optimization。无 ACK/NACK/resync/retry/history。

### Data Render validation correction

Frozen representation/schema/static-limit invalidity必须在 Renderer semantic handler前 fail-closed。`@loomrealm/data` 只在现有 private Render codec 内补齐：

```text
generic Render JSON object key UTF-8 bound
all JSON string Unicode-scalar validity
Render Event data representation
Patch attrs/data Delta frozen static limits
```

不得新增 public Data validator surface、schema framework或第二 parser。

### Renderer slice

Store挂 existing Renderer Data-slot desired identity，不增加第二套 currentness：

```text
current Registry
per-Domain baseline/revision
current committed zIndex/tree
generation-scoped observed Domain/Node one-shot history
```

固定：

```text
Registry/Snapshot/Patch atomic application
well-formed stale Event → accepted + drop
schema/limit/authoritative continuity invalid → DataInboundDisposition.protocol-fatal
same-generation reconnect retains identity history but resets carrier baseline
old peer cannot mutate replacement current
```

M11不新增 public `@loomrealm/renderer` Render/subscription API；Store与 qualification observation seam internal-only。DOM/Canvas/WebGL presentation留 M14。

### Real vertical

Hostra/Desktop real vertical只验证当前真实 generation lifecycle：

```text
business Domain create
→ Registry
→ Snapshot
→ current Renderer replica
→ authoritative update
→ replica changes

business Domain close
→ no new Domain send starts
→ pending/not-started Domain work discarded
→ any already-started send settles in order
→ Registry removal
→ Renderer replica retires

same-generation carrier close
→ business Domain survives
→ fresh carrier Registry + Snapshot
→ old output isolated
```

同时证明：

```text
Frame close != business Domain destroy
Data retire != business Domain destroy
Render/Data failure != Runtime terminal / Frame unwind
Event no replay
```

fresh-generation语义由 sender/receiver deterministic fixtures证明；不得为 M11 增加 test-only generation authority。

### Formal qualification / root gate

M11最终只声明：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
```

`transport` role（含 Hostra/PWA application-trace equivalence）留 M16。

Qualification runner继续直接从 Frozen `render-update-conformance-v1.md` §§5–20 Required blocks派生 catalog；§21 transport不进入 M11 catalog。Parser必须 fail-closed，不得 silent-filter normative line，不维护第二份 fixture-name清单。

Formal evidence identity固定为：

```text
(protocol, protocolVersion, fixtureSetRevision, role, group, fixture)
```

每个 `(role, fixture)` 必须执行与该 role production seam对应的判别性 assertion；一个 fixture pass不得 fan-out 为多个 role pass。

Final audit固定验证：

```text
expected role×fixture pairs
== registered
== executed
== passed

no missing / unknown / duplicate / unexecuted
no automatic role fan-out
no transport evidence
```

Frozen Conformance §4 的全部 hard limits使用一个 M11-specific table-driven matrix证明 exact-at ACCEPT、one-over REJECT/inbound retirement、UTF-8 multibyte boundary；该 matrix不得演化为 generic test framework。

唯一 M11 closure gate：

```text
npm run test:m11
= npm run test:m10
+ Subsystem author/lifecycle/public-boundary tests
+ production Render validation regressions
+ subsystem-sender fixtureSetRevision 1 role-specific qualification + audit
+ renderer-receiver fixtureSetRevision 1 role-specific qualification + audit
+ Frozen §4 hard-limit matrix
+ Renderer replica/package tests
+ Desktop/Hostra same-generation real vertical
```

Node 20 + Node 24 必须运行同一个 root gate。Closure evidence重新生成到 `doc/30-implementation/m11-qualification.md`。

### Freeze rule

M11 correction允许改变：

```text
private class/function/file names
private validation helpers inside existing Data/Subsystem responsibilities
private Map/tree/index representation
private domainId representation meeting frozen invariants
finite local queue capacities within protocol bounds
Patch-vs-Snapshot heuristic
internal test observation wiring
role×fixture evidence tables
M11-specific hard-limit data generators
```

不得重新讨论：

```text
Render authority owner
exact Subsystem author API / synchronous semantics
business/wire/carrier lifetime
identity one-shot rules
validation/error model
Registry/baseline/revision/Event semantics
Renderer public boundary/currentness
M11 claimed conformance roles / qualification root gate
```

不得引入 generic validator/conformance/schema/replication framework。完整且固定的 correction checklist见 [M11 Render 最终闭环评审结论](./m11-final-closure-review.md)。

M11 未恢复 `Qualified / Closed` 前不进入 M12 implementation closure。

---

## M12：Content

Implement readonly Content capability + Desktop Content Service/adapters，并完成两个真实 consumer projection：

```text
Subsystem
    author-facing ContentClient mapping

Renderer
    Resource/Content client mapping
    logical resource reference → readonly Content API
```

保持：

```text
ordinary Content capability != executable/module resolution capability
Renderer resource lookup != Render authority
Content credential != Frame/Render/business payload
```

Content API虽然允许 Main作为 consumer，但 Phase 1 不为对称性预先给 Main增加 Content capability；只有出现真实 Main-side use case时才按 demand-driven 原则 materialize。

M12 必须为 M13 business content usage与 M14 Renderer resource presentation提供同一 logical Content semantics，不把 Renderer resource loading推迟成 M14 临时旁路。

---

## M13：`loom.map` Business Definition

```text
@loomrealm/map → @loomrealm/subsystem
```

No Game/Launcher/Runtime Control/Platform imports。用真实 Input/Render/Content/Frame call验证 author SDK。

---

## M14：Desktop Full E2E

```text
HostraPlatform.prepareGame
→ Main / Node Runner / Runtime Control
→ physical RendererControlBinding
→ BrowserWindow + Renderer Control WS
→ M9 Data Broker
→ M10 Input + M11 Render + M12 Content
→ nested Frames / Renderer reload / shutdown
```

M14加入真实 DOM/Gamepad `RendererInputSource`，必须复用 M10 exact source API、current-Control subscription lifetime与同一 authority/publisher semantics。

M14 Renderer presentation必须消费 M11 internal current replica + M12 已建立的 Renderer Content/Resource client；不得从 Render payload直接解释 physical path、absolute privileged URL 或 Content bearer，也不得反向改变 M11 Store/public boundary。

---

## M15：PWA Game Launcher / Runner

PWA manifest/join/resolver/LaunchPlan/LogicalGameBootstrap/RuntimeHosting/Worker Runner + MessagePort Runtime Control；成为 Game Package第二 real consumer。

---

## M16：PWA Full E2E + Cross-platform Equivalence

```text
PwaPlatform.prepareGame
→ Worker Runtime
→ PWA Renderer Control
→ PWA Data provisioning
→ User Input + Render + Content
→ full logical Session trace
```

在这里完成 User Input 与 Render Update 的 Hostra/PWA transport-equivalence conformance claims。

---

## Phase 1 Acceptance

- Foundation/Wire单一用途；
- Game Package / Launcher / Main bootstrap boundary不倒退；
- protocol package拥有 mechanics，不拥有 role authority；
- Frame causal/commit/unwind semantics保持 Frozen；
- Renderer currentness/token/revision保持 M7 boundary；
- Data authority/lifecycle保持 M8/M9 boundary；
- M10 State/Event/Reset revision 2 + exact SDK/source semantics完整闭合；
- M11 exact author surface、publication、internal Renderer replica保持 Frozen，且 production Render representation validation、203-fixture/267-role evidence、hard-limit matrix与 sender/receiver fixtureSetRevision 1 qualification完整闭合；
- M12同时提供 Subsystem author Content 与 Renderer resource Content consumer，不扩大 executable capability；
- Data/Render failure不升级 Runtime/Frame；
- M14才宣称 Desktop full product E2E；
- M16才宣称完整 PWA/cross-platform transport equivalence；
- no generic RPC/connection/authority/input/render/transaction/retry/currentness/conformance framework。

---

## Deferred

```text
Save
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
Runtime Control reconnect/resume
lazy / optional Subsystem
multiple Runtime instances per key
remote Runtime
multiple current Renderer participants
runtime implementation negotiation
universal multi-platform launcher schema
generic RPC/connection framework
Render history replay
```