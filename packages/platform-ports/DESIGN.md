# `@loomrealm/platform-ports` 设计

> 状态：**Implemented Baseline / Core Boundary Frozen / M4-M5 Consumer Qualified / M7 Slice Frozen for Implementation**  
> 阶段：M7 Renderer Control preimplementation closure  
> 最近复核：2026-09-03  
> 冻结决策：[ADR 0027](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 当前/目标 root surface：`DeadlineScheduler` / `RuntimeControlBinding` / `OpaqueMaterialGenerator` / `RuntimeLaunchRequest` / `MainRuntimeControlBinding` / `HostedRuntime` / `RuntimeHosting` / `RendererControlBinding`

> **本包只定义 platform-neutral Core 需要的窄 capability / physical fact contract；不拥有 Core authority、role policy、protocol mechanics 或 concrete Hostra/PWA implementation。**

---

## 1. Ownership

```text
Core roles
    application authority + role policy

@loomrealm/platform-ports
    narrow cross-boundary capabilities / physical facts

Protocol packages
    protocol mechanics

Hostra / PWA
    physical realization
```

Runtime dependency remains exactly：

```text
@loomrealm/foundation
```

MUST NOT depend on runtime-control、renderer-control、main、renderer或 concrete Hostra/PWA APIs。

---

## 2. Port Admission Rule

Public port只有当前真实 Core consumer + 多平台 physical realization需要时才进入本包。

禁止：

```text
universal Platform interface
service locator / DI container
generic connection registry
generic lifecycle/event bus
generic Clock/Crypto service
future port inventory
```

M7 `RendererControlBinding` 已由 Main real consumer closure证明；它不是 Renderer mega-port。

---

## 3. Frozen Root API Through M7

目标 TypeScript surface：

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

export interface OpaqueMaterialGenerator {
  generate(): string;
}

export interface RuntimeLaunchRequest {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
}

export interface MainRuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

export interface HostedRuntime {
  readonly runtimeControl: MainRuntimeControlBinding;
  readonly terminated: Promise<void>;
  requestTermination(signal: AbortSignal): Promise<void>;
}

export interface RuntimeHosting {
  launch(
    request: RuntimeLaunchRequest,
    signal: AbortSignal,
  ): Promise<HostedRuntime>;
}

export interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

Current-v1 不保留 `BootstrapTokenGenerator` alias；实现 M7 时直接改为 `OpaqueMaterialGenerator`。

---

## 4. M4 Contracts — Unchanged Frozen Baseline

### `DeadlineScheduler`

Narrow relative deadline capability：callback begins at most once；cancel idempotent；cancel-before-begin prevents later begin；cancel-after-begin no retroactive effect；implementation does not intentionally fire early。无 wall clock/interval/cron。

### `RuntimeControlBinding`

Subsystem-side one-Launch-Attempt, single-use Control establishment：

```text
acquire at most once
at most one successful already-established MessageCarrier
abort-before-resolution prevents late live-carrier delivery
no protocol/hello/currentness ownership
no reconnect/retry/replay
```

M4 `@loomrealm/subsystem/host` 已 consumer-qualified。

---

## 5. `OpaqueMaterialGenerator` — M7 Frozen Refinement

M5 Runtime bootstrap + M7 Session identity/Renderer Control token形成多个真实 consumer，因此 material source收敛为：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}
```

每个 successful call MUST返回 fresh/high-entropy/opaque string material。

Generator不拥有 Session identity semantics、Runtime attempt authority、Renderer currentness、credential registration/binding/consumption。Main 对每种用途独立 `generate()`，不得复用同一值。

这不是 random/crypto service facade；只提供当前多个真实 Core consumer都需要的 fresh opaque material。

---

## 6. M5 Runtime Hosting Contracts — Semantics Unchanged

`RuntimeLaunchRequest` 只含 `subsystemKey + bootstrapToken`。

`RuntimeHosting.launch()` lookup Platform-private plan、创建 physical Runtime、返回 `HostedRuntime`；success不等于 Control hello/ready。

`HostedRuntime` 同一 physical lifetime聚合 Main-side Runtime Control establishment、termination request、actual termination fact。`terminated` resolution才是 physical stopped fact。

`MainRuntimeControlBinding` one HostedRuntime lifetime single-use acquire；abort prevents late live carrier；无 same-attempt reconnect。

---

## 7. `RendererControlBinding` — M7 Frozen Contract

```ts
interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

一个 acquire调用：

```text
Main-issued token T
→ Platform physically exposes/delivers exact T to one candidate Renderer bootstrap
→ Platform establishes one candidate Renderer Control carrier
→ Promise resolves exactly once with already-established MessageCarrier
```

Success只证明 physical candidate carrier存在；不证明 hello、authentication、version negotiation、currentness、Snapshot acceptance或 Renderer usability。

Required lifecycle：

```text
one acquire → at most one successful carrier
abort-before-resolution → no later live carrier delivery
late carrier after abort → Platform closes/discards
Platform preserves token exactly for delivery
Platform must not log/interpret/authenticate token
Platform must not negotiate Renderer Control version
```

Main允许 Session内 sequential fresh attempts，但同一时刻只发起 one pending acquire/candidate。Binding本身不实现 protocol retry/replay。

M7 deterministic realization：MemoryCarrier fixture。Desktop/PWA physical realization分别在 M14/M16。

---

## 8. Optional Capability in Main-facing View

`RendererControlBinding` 是 frozen **capability type**，但不是每个 concrete Platform/Session 都必须提供的 capability。

`@loomrealm/main` M7 structural view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

语义：

```text
rendererControl absent
→ composition is Renderer-Control-incapable/headless for this Session
→ Main runs Runtime/Frame semantics normally
→ no Renderer token/acquire loop

rendererControl present
→ Main uses frozen bounded attempt/currentness semantics
```

因此现有 M6 Hostra Runtime-only implementation无需 fake Binding；M14 才加入真实 Hostra Renderer physical realization。

Optionality belongs to capability availability，不放松 Binding/protocol semantics。

---

## 9. Capability / Policy / Authority Split

Platform Ports owns：

```text
relative deadline scheduling
fresh opaque material generation
physical Runtime creation/control carrier/termination facts
candidate Renderer Control carrier establishment + token delivery when capability exists
```

Main owns：

```text
Session identity
Runtime Launch Attempt/currentness
all token validation/registration/binding/invalidation/consumption
Renderer attempt/current participant/replacement
Runtime/Frame/Activation/InputTarget/DataAuthority
revision/failure/unwind/deadline policy
```

Renderer-control owns wire/hello/version negotiation/validation/publication/terminal mechanics。

---

## 10. Renderer Binding Does Not Move Protocol Mechanics

`RendererControlBinding` MUST NOT parse `renderer.hello/state`、encode JSON-RPC、validate Snapshot/revision、negotiate version、own current Renderer或 coalesce publication。

Main作出 currentness/replacement decision；renderer-control peer执行 protocol mechanics/retirement；Binding只建立 candidate physical carrier。

---

## 11. Qualification Through M7

```text
M4 DeadlineScheduler / RuntimeControlBinding
    ✅ real Subsystem Host consumer qualified

M5 RuntimeHosting / HostedRuntime / MainRuntimeControlBinding
    ✅ real Main consumer qualified

M7 OpaqueMaterialGenerator / RendererControlBinding
    Frozen contract
    deterministic Platform provides Binding for real Main consumer vertical
    capability-absent Main path also qualified

M14 Hostra Renderer physical realization
M16 PWA Renderer physical realization
```

M7 tests MUST prove Binding abort/no-late-live-carrier semantics、Main one-candidate usage、and capability absence requires no fake Binding。

---

## 12. Compatibility

Current project尚未承诺 public compatibility。

M7 implementation直接：

```text
BootstrapTokenGenerator → OpaqueMaterialGenerator
```

无 alias/deprecation wrapper/v2名称。

---

## 13. Freeze Statement

Frozen M4：`DeadlineScheduler` / `RuntimeControlBinding`。  
Frozen M5 semantics：`RuntimeLaunchRequest` / `MainRuntimeControlBinding` / `HostedRuntime` / `RuntimeHosting`。  
Frozen M7：`OpaqueMaterialGenerator` / `RendererControlBinding` + optional availability in MainPlatform。

Still deferred：M8 Data bindings/Broker、Content ports、physical Renderer transport details。

### Final invariants

1. Platform Ports owns capabilities/facts only；Core owns authority/policy；protocol packages own mechanics。  
2. Runtime dependency remains Foundation only。  
3. `OpaqueMaterialGenerator` supplies fresh material only。  
4. `RendererControlBinding.acquire(token,signal)` creates one candidate physical carrier only；hello授予 currentness。  
5. `RendererControlBinding` availability may be absent per composition；no fake Binding required。  
6. Abort prevents late live carrier delivery。  
7. Binding不拥有 authentication/version negotiation/currentness。  
8. No universal Platform/Renderer service interface。  
9. Any change to M7 Binding or optionality requires ADR 0027 reopen。