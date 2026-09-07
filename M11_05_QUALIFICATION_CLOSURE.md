# M11 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 02](M11_02_RENDER_PUBLICATION.md) → [M11 / 03](M11_03_RENDERER_STORE.md) → [M11 / 04](M11_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[Render Update v1](doc/15-contracts/render-update-v1.md)  
> Conformance：[Render Update v1 Conformance](doc/15-contracts/render-update-conformance-v1.md)  
> 目标：冻结 M11 唯一 implementation/qualification closure；实现阶段不得以便利重新设计 authority、API、lifetime、error 或 conformance shape。

> **M11 closure = Subsystem-owned business Render Domains 经 current generation/current Data publication为 Registry + per-Domain authoritative commits，Renderer只维护 current replica；Frame/Data 不取得 Render ownership，fresh carrier以 fresh baseline恢复，transient Event不 replay。**

---

## 1. Entry Gate

已满足：

```text
M10 fixtureSetRevision 2 qualification = pass
M10 = Implemented / Qualified / Closed
M11 implementation plan = Frozen / Ready
```

M11 不重新打开 M10 authority、Input 或 Data lifecycle 设计。

---

## 2. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    exact RenderNode / RenderDomainState / RenderEvent / RenderDomain root surface
    SubsystemScope.createRenderDomain
    synchronous validate → detach → local commit
    business Domain authority / identity / lifecycle

existing @loomrealm/data
    Frozen Render Update v1 codec/send/disposition mechanics reused as final wire preflight

@loomrealm/subsystem host
    one RenderManager authority responsibility
    bounded generation/current-carrier publication responsibility
    Registry + Snapshot/Patch/Event

@loomrealm/renderer
    internal replica state on existing Data slot
    atomic Registry/Snapshot/Patch application
    no new public Render/presentation API

Desktop/Hostra vertical
    same-generation reconnect / old-stream isolation
```

`RenderManager`、publication coordinator、Renderer Store 都只描述真实 responsibility/state boundary；不要求独立 reusable class/framework。

M11 author boundary必须自己在 local commit前完成 author-shape/limit/stronger-lifetime validation；`@loomrealm/data` 继续拥有最终 outbound wire static validation。不得为了复用 M11 author validator新增 public codec/validator framework，也不得把 author invalidity推迟到 Data `local-fatal`。

不属于 M11：DOM/Canvas/WebGL presentation、Content/resource resolution、component registry、layout/animation、PWA transport equivalence。

---

## 3. Conformance Claim Boundary

Render Update v1 Conformance Profile revision 1 定义：

```text
subsystem-sender
renderer-receiver
transport
```

M11 只声明：

```text
LoomRealm Render Update v1 Subsystem Sender Conformant
LoomRealm Render Update v1 Renderer Receiver Conformant
```

M11 不声明：

```text
LoomRealm Render Update v1 Transport Mapping Conformant
```

transport role 包含 Hostra/PWA application-trace equivalence，留到 M16。

因此 M11 `Qualified / Closed` = Render application semantics + current Desktop/Hostra implementation closed，不等于 cross-platform transport equivalence closed。

---

## 4. Required Invariants

必须证明：

```text
business Render authority only in Subsystem
exact author API is synchronous local-only
successful author values always representable by Frozen Render v1
publication absence/backpressure never becomes author API error
Frame close != Domain destroy
Data retire != Domain destroy
business close immediately removes Domain from desired Registry
business close starts no new Domain sends and discards pending/not-started Domain work
already-started send may settle only before Registry removal ordering
SDK domainId is valid/private and never reused within one Subsystem Runtime instance
business Node key one-shot within business RenderDomain lifetime
same-generation reconnect != new wire Domain lifetime
fresh generation = fresh wire Render universe
fresh carrier starts Registry + per-Domain Snapshot baseline
Domain/Node emitted one-shot history holds within wire lifetime
live Node key keeps stable tag
Patch continuity is carrier-local R→R+1
revision never wraps; exhaustion rolls one still-live business Domain to one fresh private wire domainId
Snapshot/Patch commit atomically
Event ordered/transient/no replay
prebaseline retained Event follows establishing Snapshot
old carrier cannot mutate current replica
Renderer replica state remains internal
Render stream failure != Runtime terminal / Frame unwind
```

fresh-generation semantics由 sender/receiver deterministic role fixtures证明；不得为了 qualification 增加 Main/Platform test-only generation authority。

---

## 5. Abstraction Budget

允许：

```text
one internal Subsystem Render authority responsibility
RenderDomain handles/records
minimal Domain/tree validation/indexing
one bounded publication responsibility (may live inside RenderManager)
per-generation emitted identity history
per-carrier Domain cursors
one internal Renderer replica state per Data-slot identity
isolated candidate helpers
small sender/receiver qualification adapters
only-if-needed minimal test observation seam
```

禁止：

```text
Generic Store / Observable / EventBus
generic conformance framework for future protocols
public RenderManager / RenderStore / subscription API
mandatory separate manager/coordinator/store class hierarchy
new public @loomrealm/data codec/validator surface only to DRY M11 author validation
virtual DOM / reconciler
component/plugin registry
resource/content resolver
Render RPC / ACK / resync / replay
cross-Domain revision/transaction framework
Frame→Domain implicit ownership layer
generic replication framework
generic business↔wire identity translation layer
test-only Data generation authority
```

---

## 6. Executable Fixture Catalog / Evidence

Runner 直接从 Frozen `render-update-conformance-v1.md` 的 M11 application-role Required fixture code blocks（§§5–20）建立 current normative catalog；不得维护第二份手写 fixture-name 清单。§21 `transport` 不进入 M11 catalog。

每个 catalog fixture 必须显式绑定 assertion callback 与至少一个 M11 claimed role mapping；group pass 不得批量合成 fixture pass。

每个 claimed role 的每条 evidence 至少记录：

```text
protocol = loomrealm.render-update
protocolVersion = 1
fixtureSetRevision = 1
role = subsystem-sender | renderer-receiver
group
fixture = normative fixture id
result = pass
```

只有对应 assertion callback 真正成功后才能记录 `pass`。

Final audit 必须验证：

```text
normative §§5..20 groups all registered
normative fixture catalog exactly once
no unknown fixture/group
no duplicate fixture registration/evidence
no registered-but-unexecuted fixture
required claimed role mapping per fixture is non-empty
passed evidence == executed claimed evidence
no transport role evidence in M11 claim
```

Qualification adapter只把 fixture observable actions映射到当前生产实现或 package-private qualification seam；不得成为未来协议的 generic conformance framework，不得读取内部 Map/tree layout作为 assertion truth。

---

## 7. Required Evidence

必须包含：

```text
Subsystem exact public-boundary compile tests
Subsystem validation/detach/lifecycle tests
publication Registry/baseline/revision/Event tests
business close → desired Registry removal / pending-not-started discard tests
already-started send → Registry removal ordering test
revision-exhaustion no-wrap + fresh private wire-domain rollover sender test
publication pressure / no-carrier does not reject valid author mutation
Renderer atomic replica/disposition tests
identity/tombstone tests
same-generation reconnect real vertical
Frame/Data independence
old-stream isolation
fresh-generation sender/receiver role fixtures
M10 full regression remains pass
fixtureSetRevision 1 subsystem-sender audit pass
fixtureSetRevision 1 renderer-receiver audit pass
```

实现 regression 与 formal conformance 分开记录；两者都通过才能 Closed。

---

## 8. Root Gate

M11 唯一 root closure command：

```text
npm run test:m11
```

固定语义：

```text
npm run test:m11
= npm run test:m10
+ M11 Subsystem author/lifecycle/public-boundary tests
+ Render Update v1 subsystem-sender fixtureSetRevision 1 qualification + audit
+ Render Update v1 renderer-receiver fixtureSetRevision 1 qualification + audit
+ M11 Renderer replica/package tests
+ M11 Desktop/Hostra same-generation real vertical
```

不得用更窄 package-only test、single vertical 或 group summary 替代 root gate。

closure 后记录：

```text
doc/30-implementation/m11-qualification.md
```

至少包含 protocol/version/fixtureSetRevision、catalog fixture count、两个 claimed role 的 evidence counts/results、real vertical、M10 regression 与 root gate result。

---

## 9. Freeze Rule During Implementation

从本文件进入实现后，只允许改变：

```text
private class/function/file names
whether internal responsibilities share one object or use small private records/helpers
private Map/tree/index representation
private domainId mint/current-wire-id representation meeting frozen invariants
finite local queue capacities within protocol bounds
Patch-vs-Snapshot heuristic
internal test/observation wiring
```

不得重新讨论：

```text
Render authority owner
exact Subsystem author API / sync semantics
business/wire/carrier lifetime relationship
identity one-shot rules
validation/error classification
Registry/baseline/revision/Event semantics
Renderer public boundary/currentness
M11 claimed conformance roles
qualification/root-gate shape
```

编码遇到困难默认按 implementation problem 处理；只有证明 Frozen Render v1 或本 implementation plan 存在 correctness contradiction，才允许通过显式 ADR/治理流程重新打开设计。

---

## 10. Closure Claim

全部 evidence 通过后允许：

```text
M11 Render = Implemented / Qualified / Closed
```

否则只能保持：

```text
Implemented / Qualification Pending
```

M11 Closed 后进入 M12 Content；Render transport-equivalence claim 仍留到 M16。
