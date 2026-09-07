# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role + **M10 Input Implemented / Qualified** + **M11 Render Implementation Frozen / Ready**  
> 阶段：M11 Render / M12 Content pending  
> 最近复核：2026-09-07  
> 架构：[Subsystem Model](../../doc/10-architecture/subsystem-model.md) · [Rendering System](../../doc/10-architecture/rendering-system.md)  
> 正式语义：[Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md) · [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md) · [Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [User Input v1](../../doc/15-contracts/user-input-v1.md) · [Render Update v1](../../doc/15-contracts/render-update-v1.md)  
> Exact M10 surface：[M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md)  
> Exact M11 surface：[M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md)  

> **业务只表达业务；SDK把 Frozen protocol 投影为窄 author capability。M11 不新增 Platform Port、service locator、public RenderManager、EventBus 或第二份 Render/Data authority。**

---

## 1. Package / Consumer Boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ Host-owned Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author root
→ Business Definition
```

Business Definition source只 import `@loomrealm/subsystem`，不得直接 import Runtime Control、Data、Platform Ports、Wire、carrier、launch manifest 或 Hostra/PWA details。

Package trusted host/internal code MAY依赖现有 protocol/port/wire packages；不得把 envelope、peer、carrier或 platform capability暴露到 author root。

---

## 2. Capability Readiness

```text
M4  Definition/lifecycle + Frame/Outcome       implemented / qualified
M4  Host Runtime Control mapping              implemented / qualified
M8  role-local Data peer lifecycle            implemented / qualified
M10 InputListener + InputManager               implemented / qualified
M11 RenderDomain + RenderManager               implementation frozen / ready
M12 ContentClient author mapping               pending
```

`Package Scope != Current Implementable Slice != Milestone Closure`。

---

## 3. Definition ABI

```ts
import { defineSubsystem, completed } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {},
  async frame(frame) {
    return completed(null);
  },
  async shutdown() {},
}));
```

Module load不等于 Runtime start；module path不等于 Runtime identity。Definition不得拥有 physical provisioning 或读取 Platform Launch Manifest。

---

## 4. Author Root Surface Through M11

Existing M10 root：

```text
defineSubsystem
SubsystemDefinitionFactory / SubsystemScope
Frame / FrameOutcome / FrameFailure
completed / cancelled / failed
business-safe Frame errors
Input* exact M10 exports
```

M11 **只新增**：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

以及：

```text
SubsystemScope.createRenderDomain(initialState)
```

不 root-export `RenderManager`、protocol envelopes、revision/generation/domainId、supporting JSON aliases或 presentation types。

Host surface保持：

```text
runSubsystem
SubsystemRuntimeFatalError
RunSubsystemOptions
SubsystemLaunchContext
SubsystemRuntimeControlPolicy
```

不得创建万能 `SubsystemRuntime` / `RenderManager` service locator。

---

## 5. Platform Capability Ownership

Current host uses：

```text
DeadlineScheduler
RuntimeControlBinding
SubsystemDataBinding
```

M10/M11 都不新增 Platform Port；Input/Render建立在同一 current Data peer之上。

---

## 6. Bootstrap-safe Wiring

固定最小 wiring：

```text
create exactly one InputManager
create exactly one RenderManager
→ create SubsystemScope
     signal
     createInputListener(...)  → same InputManager
     createRenderDomain(...)   → same RenderManager
→ definition factory(scope)
→ create FrameRuntime(definition,...)
→ bind exact FrameRuntime facts into InputManager
→ Runtime Control acquire/connect
→ initialize
→ ready
→ optional Data acquire
→ install same current Data peer into Input/Render publication
```

RenderManager不需要 FrameRuntime authority binding；Frame生命周期不拥有 Render Domain。

不得为了构造顺序建立 dummy/shadow Frame/Render registry、service locator或第二条 Data reader/writer。

---

## 7. Frame Model / Local Fact Source

Author `Frame` 保持：

```text
id
params
signal
call(subsystem, params)
```

Main拥有 public Frame/Activation authority；Subsystem内部 `FrameRuntime` 是 local Frame Context、current Activation 与 mutation gate 的唯一事实源。

InputManager消费少量 same-package facts；RenderManager不复制 Frame lifecycle state machine，也不建立 Frame→Domain implicit ownership。

---

## 8. Frozen Input Projection

M10 exact Input types/semantics以 [M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md) 为事实源。

关键保持：

```text
channels/setChannels → Interest contribution
on/unsubscribe       → callback registration only
retained State       → detached immutable / local baseline
Event                → no replay
async handler        → not Data flow control
fresh Data           → republish Interest / fresh State baseline
```

---

## 9. Frozen Render Author Types

Exact M11 surface：

```ts
export type RenderNode = RenderNodeV1;

export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderEvent {
  readonly targetKey: string;
  readonly name: string;
  readonly data: RenderEventV1["data"];
}

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

`SubsystemScope` 增加：

```ts
createRenderDomain(initialState: RenderDomainState): RenderDomain;
```

Implementation MAY type-alias matching `@loomrealm/data` declarations；Business Definition仍只 import `@loomrealm/subsystem`。

---

## 10. Render Local Commit / Validation

`createRenderDomain` / `replace` / `emit` / `close` 全部 synchronous local-only：

```text
validate
→ detach caller-owned value
→ atomic local commit / bounded Event offer
→ return
```

不得等待 Data/Renderer，不返回 send/revision result，不保留 caller mutable object by reference。

成功 state/event必须完整满足 Frozen Render v1 可表示性与 hard limits；live business Domains `<= 256`。

Errors：

```text
invalid shape/semantic/stale target/closed handle → TypeError
hard-limit overflow                         → RangeError
```

失败 local-atomic，不产生由失败调用引起的新 publication，不升级 Data/Runtime/Frame。

---

## 11. Render Domain Identity / Lifetime

```text
Frame close/suspend != Domain destroy/hide
Data retire          != business Domain destroy
```

SDK mint `domainId`，一个 Subsystem Runtime instance 内不复用。

Node key：

```text
current Domain state unique
live key stable tag
removed from one business RenderDomain lifetime
→ cannot be reintroduced in that business Domain lifetime
```

`close()` idempotent；close后 replace/emit → TypeError。Runtime terminal最终清全部 live Domains。

---

## 12. Render Event / Publication

`emit` 要求 `targetKey` 当前存在于 business Domain authoritative state。

```text
no current Data peer
→ Event not retained for future carrier

current peer + unbaselined Domain
→ Event MAY bounded-pend behind establishing Snapshot

carrier loss / Domain removal
→ pending Event discarded
```

Authoritative state即使在无 Data时也继续以 latest business truth存在；fresh peer只需要 current Registry + current Snapshots，不 replay历史 Patch/Event。

Publication coordinator只通过 existing `SubsystemDataPeer.render`发送，不竞争 raw carrier。

---

## 13. Data / Runtime Lifetime

Fresh Data：

```text
InputManager
→ republish current Interest

RenderManager publication
→ render.domains(current Registry)
→ fresh Snapshot each current Domain
```

Data terminal/loss：

```text
Input/Render old carrier state retired
business Render Domains survive
Runtime/Frame unaffected
```

Runtime terminal最终清 Input local state与 Render Domains。

---

## 14. Abstraction Budget

允许：

```text
one InputManager
one internal RenderManager
RenderDomain handles/records
minimal detached state + tree/index validation
one current Data peer
latest-only Input Interest publisher
bounded Render publication coordinator
```

禁止：

```text
InputStore / RenderStore author API / EventBus / Observable
public RenderManager / service locator
Frame/Activation/InputTarget shadow registry
Frame→Domain implicit ownership
Generic replication/connection/retry/replay framework
business-key → wire-key translation layer
second Data reader/writer
Platform/presentation objects in author API
```

---

## 15. M11 Implementation Rule

M11 coding may choose：

```text
private files/classes/data structures
private domainId representation meeting frozen invariants
finite queue capacities within protocol bounds
Patch-vs-Snapshot heuristic
```

不得重新设计：

```text
root Render exports
sync author semantics
validation/error model
Domain/Node lifetime/identity
Data publication lifecycle
```

只有证明 Frozen Render v1 或 M11 implementation plan 存在 correctness contradiction 才重新打开设计。

Qualification见根目录 `M11_05_QUALIFICATION_CLOSURE.md`。
