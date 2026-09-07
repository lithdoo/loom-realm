# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Closed / M11 implementation slice Frozen**  
> 主要定义：logical roles/modules、Runner/role-facing capabilities、Renderer/Data/Input/Render 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-07

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | read-only Main mirror、Data reconciliation、M10 frozen Input role、M11 internal Render receiver Store |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| FSDB Content | [fsdb-content-service](./fsdb-content-service/README.md) | readonly Content implementation |
| `loom.map` | [loom-map](./loom-map/README.md) | ordinary platform-neutral Subsystem consumer |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra Launcher/Runner/WS/Data Broker/Content composition |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Launcher/Worker/MessagePort/Broker/Content composition |

Desktop/PWA 是同一 application architecture 的不同 physical realization。

---

## 2. Launch / Runner Boundary

```text
Game Entry logical topology
→ current Platform Launcher
→ platform manifest exact join + preflight
→ immutable PlatformLaunchPlan
→ Host-owned Runner
→ selected Subsystem Definition Module
→ @loomrealm/subsystem/host
```

Game Package/Main不拥有 executable path；Launcher/Runner physical ownership不产生 Frame/Data/Input/Render authority。

---

## 3. Role-facing Capabilities

```text
Main-facing
    DeadlineScheduler
    OpaqueMaterialGenerator
    RuntimeHosting
    RendererControlBinding?
    DataConnectionAuthoritySink?

Renderer-facing
    RendererDataBinding
    RendererInputSource          // M10 role integration, not Platform Port
    presentation environment

Subsystem-facing
    RuntimeControlBinding
    SubsystemDataBinding
    ContentClient (M12)
```

这些不是 universal Platform interface；capability只随真实 consumer冻结。M10/M11 都没有新增 `@loomrealm/platform-ports` surface。

---

## 4. Authority / Lifetime

```text
Main
    Frame / Stack / Activation / InputTarget / DataAuthority

Subsystem
    business state / local Frame Context
    Desired Interest / retained author Input State
    business Render Domains

Renderer
    read-only Main mirror
    Producer facts / Input sender gate
    current Render replica / optional stale presentation cache
```

保持：

```text
Frame != Runtime != Data != Render lifecycle
Activation != Desired Interest lifetime
business Render Domain != wire Render Domain != Data carrier
Data carrier != capability lifetime
source object != source subscription != Data lifetime
```

---

## 5. Renderer Control / Data

M7 Renderer Control已 qualified：Main authority → full Snapshot → one current Renderer holder。

M8 Data role已 qualified：Main ready-derived DataAuthority → Renderer/Subsystem Bindings → real `@loomrealm/data` peers。

M9 Desktop Broker已 qualified：Main full authority view + exact HostedRuntime → paired Data WebSockets → install-before-role-delivery。

Data loss/provisioning failure != Runtime failure/Frame unwind。

M10 User Input 已 Implemented / Qualified / Closed；M11 Render不得修改以上 currentness/Data lifecycle换取实现便利。

---

## 6. User Input — Current Revision 2

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active F/A
∧ C ∈ Interest[F]
∧ Producer(C)
```

Three lifetimes：Desired Interest Frame-scoped；Input Lease Activation-scoped；wire publication Data-carrier-scoped。

Subsystem receive semantics distinguish：

```text
retention eligibility
    current Data + local Frame/current Activation + Desired Interest

business delivery eligibility
    retention eligibility + Frame active + mutation gate open
```

pending commit-sensitive mutation：

```text
.state → retain latest, suppress business delivery
.event → drop
reset  → clear current retained/suppressed State
```

explicit known-no-commit + same Activation reopen时：

```text
synchronously deliver current retained State convergence
→ then recoverable frame.call rejection becomes observable
```

Event不 replay；Renderer不感知 mutation gate。

User Input current conformance：`protocolVersion=1 / fixtureSetRevision=2`。

---

## 7. Frozen Subsystem Input Projection

M10 Subsystem role只增加 one InputManager，并冻结：

```text
SubsystemScope.createInputListener
InputChannel → canonical payload mapping
listener channels/setChannels = Interest contribution
on/unsubscribe = handler registration only
setChannels keeps dormant registrations
unsubscribe + close idempotent
stable delivery snapshot
same-channel registration order
multi-channel canonical channel order
async handler Promise does not block Data reader
immutable retained State/local baseline
latest-only Interest publisher
```

Handler只收到 payload，不收到 wire envelope/frameId/activationId/Data identity。

Author invalid config local-atomically reject，不得把 usage error变成 Data fatal。

---

## 8. Frozen Renderer Input Projection

Exact construction：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
)
```

Renderer role只增加：

```text
one construction-time source object per holder
0..1 active source subscription for current Control peer
one current Interest Registry per Data slot
one Effective gate
one bounded State/Event/Reset publisher
```

Control replacement/terminal invalidates/stops old source subscription；same holder later current Control会 restart同一个 source object并建立 fresh producer facts。Late old callback drop。

`.state` Producer available要求 fresh current sample + availability=true；loss清 producer sample，return不得使用 stale cache。

Event/Reset是 global State-coalescing barriers；普通 Input backlog必须在 generic Data writer overflow前 bounded/coalesce/drop。

不增加 InputDeviceRegistry、Store/EventBus、InputTarget shadow authority、retry/replay/currentness protocol。

---

## 9. FrameOutcome / Render / Content

Frame Outcome保持 completed / cancelled / failed；只有明确 pre-commit rejection可 catch继续，同一 ambiguous/fatal path不得回到 business continuation。

M11 Render 已冻结为直接可实施：

```text
Subsystem author
    RenderNode / RenderDomainState / RenderEvent / RenderDomain
    SubsystemScope.createRenderDomain
    replace / emit / close = synchronous local-only
    validate → detach → atomic local commit

Subsystem host
    one internal RenderManager
    existing SubsystemDataPeer.render publication

Renderer
    existing Data slot → internal Render Store
    no new public Render/subscription API
```

保持：

```text
live business Domains <= 256
SDK domainId Runtime-instance 内不复用
business Node key business-Domain-lifetime one-shot
Frame close/Data retire != business Domain destroy
same-generation reconnect keeps wire identity history, rebuilds carrier baseline
Event no future-carrier replay
Render/Data failure != Runtime failure / Frame unwind
```

M11 formal qualification只 claim `subsystem-sender` + `renderer-receiver`；transport-equivalence留 M16。

M12 Content：readonly logical content capability与 executable/module resolution严格分离。

---

## 10. Physical Placement

```text
M14 Hostra Desktop
    BrowserWindow
    physical Renderer Control WS
    M9 Data Broker
    real DOM/Gamepad RendererInputSource → exact M10 source seam
    M11 internal current Render replica → presentation
    M12 Content → resources

M16 PWA
    Window/Worker + MessagePort
    PWA Data provisioning
    same logical Input/Render/Content semantics
```

M10 不实现 BrowserWindow/DOM physical input；M11 不实现 physical presentation；M16才完成 Hostra/PWA full transport equivalence。

---

## 11. Current Milestones

```text
M6 Hostra Runtime             ✅
M7 Renderer Control           ✅
M8 Data role/core             ✅
M9 Desktop Data Broker        ✅
M10 User Input                ✅ Implemented / Qualified / Closed
M11 Render                    Implementation Frozen / Ready
M12 Content                   pending
M13 loom.map                  pending
M14 Desktop full E2E          pending
M15 PWA Runtime               pending
M16 PWA full E2E/equivalence  pending
```

Module tests验证 role semantics；protocol conformance由对应 contract fixtures负责；system E2E验证同一 logical scenario在不同 Platform realization下得到等价 business-observable result。

M11 implementation阶段只允许 private realization choices；public API、authority/lifetime、identity/error、publication/receiver semantics与 qualification shape不得重新设计，除非证明 Frozen docs存在 correctness contradiction。
