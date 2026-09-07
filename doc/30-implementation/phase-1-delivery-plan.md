# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / **M10 Closed / M11 Implementation Frozen**  
> 主要定义：M0..M16 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
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
Package Scope != Current Implementable Slice != Milestone Closure
```

首次实现只维护一个 current model；不制造 fake v2 / deprecated alias / generic framework。

---

## M0：文档与契约基线

Current docs统一 Game/Launcher/Main、Runtime/Frame、Renderer Control、Data/Input/Render contracts与 Platform composition boundary。

---

## M1：Foundation + Wire ✅

MessageCarrier/MemoryCarrier + JSON/JSON-RPC representation/limits primitives。

## M2：Game Package v1 ✅

Common Game Entry validation/snapshot capability。M6 Hostra first real consumer；M15 PWA second consumer。

## M3：Runtime Control Mechanics ✅

one reader / one writer、strict sender IDs、finite deadlines、terminal first-wins、no retry/replay/reconnect。

## M4：Subsystem Runtime/Frame Core ✅

Runtime/Frame author/host slice implemented；Input/Render/Content分别 M10/M11/M12。

## M5：Main Core + LogicalGameBootstrap ✅

Runtime/Frame authority、Stack/Activation/InputTarget、serialized mutation、failure unwind、Session terminal implemented。

## M6：Hostra Platform Vertical / Node Runner ✅

Qualified 2026-09-03：Hostra PREPARE → LaunchPlan/bootstrap → Node Runner → Runtime Control WS → real Main/Subsystem vertical。

## M7：Renderer Control ✅

Qualified 2026-09-03：Main pure authority projection/revision/currentness + Renderer local holder。Physical BrowserWindow Renderer Control remains M14；PWA M16。

## M8：Renderer Data Role/Core ✅

Qualified 2026-09-04：Main ready-derived DataAuthority、RendererDataBinding / SubsystemDataBinding、real `@loomrealm/data` peers、Renderer per-subsystem Data reconciliation。

## M9：Desktop DataConnectionBroker / Late Provisioning ✅

Qualified 2026-09-04：Main full Data authority view → exact HostedRuntime → paired Desktop Data WebSockets → install-before-role-delivery。Root gate：`npm run test:m9`。

---

## M10：User Input v1 + InputManager — **Implemented / Qualified / Closed**

```text
protocolVersion = 1
fixtureSetRevision = 2
root gate = npm run test:m10
```

Frozen/qualified：

```text
SubsystemScope.createInputListener exact author surface
InputManager Desired Interest + retained State
mutation-gate State convergence
Renderer Effective gate / bounded State-Event-Reset publisher
RendererInputSource exact construction/lifetime
same-generation reconnect fresh State baseline / no Event replay
platform-independent role qualification
Hostra/Desktop real vertical
```

fresh-generation role semantics由 deterministic fixture证明，不为测试增加 Main generation allocator。Hostra/PWA transport equivalence留 M16。

M10 已关闭；M11不得修改其 authority、API、lifetime、ordering或 Data currentness。

---

## M11：Render Update v1 + RenderManager — **Implementation Frozen / Ready**

正式输入：

```text
Render Update protocolVersion = 1
Conformance fixtureSetRevision = 1
```

Root plans：

```text
M11_01_SUBSYSTEM_RENDER_MANAGER.md
M11_02_RENDER_PUBLICATION.md
M11_03_RENDERER_STORE.md
M11_04_VERTICAL_INTEGRATION.md
M11_05_QUALIFICATION_CLOSURE.md
```

### Exact Subsystem author slice

M11 root **只新增**：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

以及：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

固定：

```text
one internal RenderManager / Subsystem instance
all author operations synchronous local-only
validate → detach caller-owned value → atomic local commit
successful state/event always Frozen-v1 representable
live business Domains <= 256
invalid semantic/closed/stale target → TypeError
hard-limit overflow → RangeError
close idempotent; replace/emit after close reject
SDK domainId never reused within one Runtime instance
business Node key one-shot within one business RenderDomain lifetime
Frame/Data do not own Domain lifetime
```

不新增 public RenderManager、Frame→Domain registry、identity translation layer或 Render error hierarchy。

### Publication slice

```text
business Domains
→ one publication coordinator
→ existing SubsystemDataPeer.render
```

Fresh carrier：

```text
render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

same-generation reconnect：

```text
keep emitted Domain/Node one-shot history
reset old carrier cursor/pending output
fresh Registry + Snapshots
```

Event：

```text
no carrier → never retained into future carrier
current carrier + unbaselined → MAY bounded-pend behind establishing Snapshot
carrier loss / Domain removal → pending Event discarded
never replay
```

第一版允许保守 Snapshot fallback；Patch-vs-Snapshot heuristic是 private optimization。无 ACK/NACK/resync/retry/history。

### Renderer slice

M11 Store挂在 existing Renderer Data-slot identity：

```text
current Registry
per-Domain baseline/revision
current committed zIndex/tree
generation-scoped observed one-shot history
```

固定：

```text
Registry/Snapshot/Patch atomic application
well-formed stale Event → accepted + drop
schema/limit/authoritative continuity invalid → protocol-fatal disposition
old carrier cannot mutate replacement current
same-generation reconnect retains identity history but resets baseline
```

M11 **不新增 public `@loomrealm/renderer` Render/subscription API**；Store与 qualification observation seam internal-only。DOM/Canvas/WebGL presentation留 M14。

### Real vertical

Hostra/Desktop real vertical只要求当前真实 lifecycle：

```text
business Domain create
→ Registry
→ Snapshot
→ current Renderer replica
→ authoritative update
→ replica changes

same-generation carrier close
→ business Domain survives
→ fresh carrier Registry + Snapshot
→ old output isolated
```

同时验证：

```text
Frame close != business Domain destroy
Data retire != business Domain destroy
Render/Data failure != Runtime terminal / Frame unwind
Event no replay
```

fresh-generation语义只由 sender/receiver deterministic fixtures证明；不得为 M11 增加 test-only generation authority。

### Formal qualification / root gate

M11 只形成：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
```

`transport` role（含 Hostra/PWA trace equivalence）留 M16。

每个 claimed role 的每个 normative fixture descriptor必须 exactly once 注册/执行，并记录：

```text
protocol
protocolVersion
fixtureSetRevision
role
group
fixture
result
```

Audit 必须拒绝 missing / duplicate / unexecuted / non-pass fixture。

唯一 M11 closure gate：

```text
npm run test:m11
= npm run test:m10
+ Subsystem author/lifecycle/public-boundary tests
+ subsystem-sender fixtureSetRevision 1 qualification + audit
+ renderer-receiver fixtureSetRevision 1 qualification + audit
+ Renderer replica/package tests
+ Desktop/Hostra same-generation real vertical
```

closure evidence：

```text
doc/30-implementation/m11-qualification.md
```

### Freeze rule

M11 implementation允许改变：

```text
private files/classes/data structures
private domainId representation meeting invariants
finite local queue capacities within protocol bounds
Patch-vs-Snapshot heuristic
internal test observation wiring
```

不得重新讨论：

```text
Render authority owner
exact Subsystem author API / sync semantics
business/wire/carrier lifetime
identity rules
validation/error model
Registry/baseline/revision/Event semantics
Renderer public boundary/currentness
M11 conformance claim roles / root gate
```

编码遇到困难默认按 implementation problem处理；只有证明 Frozen docs存在 correctness contradiction 才走显式治理流程重新打开设计。

---

## M12：Content

Implement readonly Content capability + Desktop Content Service/adapters，并提供 Subsystem `ContentClient` 与 Renderer resource Content consumer。

保持 ordinary Content capability != executable/module resolution capability；Renderer resource lookup != Render authority。

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
→ BrowserWindow + Renderer Control WS
→ M9 Data Broker
→ M10 Input + M11 Render + M12 Content
→ presentation / nested Frames / reload / shutdown
```

M14 real RendererInputSource必须复用 M10 source seam；presentation消费 M11 internal current replica + M12 Content，不反向改变 M11 Render contract。

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
- M10 Input exact SDK/source semantics与 fixtureSetRevision 2完整闭合；
- M11 Render exact author surface、publication、internal replica、sender/receiver qualification完整闭合；
- M12同时提供 Subsystem author Content 与 Renderer resource Content consumer；
- Data/Render failure不升级 Runtime/Frame；
- M14才宣称 Desktop full product E2E；
- M16才宣称完整 PWA/cross-platform transport equivalence；
- no generic RPC/connection/authority/input/render/transaction/retry/currentness framework。

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
