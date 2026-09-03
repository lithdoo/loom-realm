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

Narrow relative deadline capability：

```text
callback begins at most once
cancel idempotent
cancel-before-begin prevents later begin
cancel-after-begin no retroactive effect
implementation does not intentionally fire early
```

无 `now` / wall-clock / interval / cron。

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

M5 需要 Runtime bootstrap bearer token material；M7 又有 Session identity + Renderer Control token两个真实 consumer，因此 material source收敛为：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}
```

每个 successful call MUST返回 fresh/high-entropy/opaque string material，适合作为 Main后续防御性验证的 identity/credential source。

Generator不拥有：

```text
Session identity semantics
Runtime attempt authority
Renderer currentness
credential registration/binding/consumption
```

Main 对每种用途独立 `generate()`，不得复用同一值。

这不是 random/crypto service facade；仅提供当前多个真实 Core consumer都需要的 fresh opaque material。

---

## 6. M5 Runtime Hosting Contracts — Semantics Unchanged

### `RuntimeLaunchRequest`

仅：

```text
subsystemKey
bootstrapToken
```

不得携 GameEntry、LaunchPlan、module/path/URL、Node/Worker options、Renderer/Data/Content material。

### `RuntimeHosting`

```text
launch({subsystemKey,bootstrapToken}, signal)
→ lookup Platform-private immutable plan
→ create exact physical Runtime
→ return HostedRuntime
```

Success不等于 Control acquired / hello / ready。

### `HostedRuntime`

同一 physical Runtime lifetime聚合：

```text
Main-side Runtime Control establishment
termination request
actual termination fact
```

`terminated` resolution 才是 physical stopped fact；Control loss / requestTermination resolve 都不是。

### `MainRuntimeControlBinding`

one HostedRuntime lifetime, single-use acquire, already-established carrier, abort prevents late live delivery, no same-attempt reconnect。

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

一个 acquire调用语义：

```text
Main-issued token T
→ Platform physically exposes/delivers exact T to one candidate Renderer bootstrap
→ Platform establishes one candidate Renderer Control carrier
→ Promise resolves exactly once with already-established MessageCarrier
```

Success只证明 physical candidate carrier存在；不证明：

```text
renderer.hello received
token authenticated
candidate current
Snapshot accepted
Renderer usable
```

这些都由 renderer-control + Main authority决定。

### Required lifecycle

```text
one acquire → at most one successful carrier
abort-before-resolution → no later live carrier delivery
late carrier after abort → Platform closes/discards
Platform preserves token exactly for delivery
Platform must not log/interpret/authenticate token
```

Main允许 Session内 sequential fresh attempts，但同一时刻只发起 one pending acquire/candidate。Binding本身不实现 protocol retry/replay。

### Physical realization

M7 deterministic：MemoryCarrier fixture。  
Desktop later：Browser/WS realization。  
PWA later：MessagePort realization。

Physical mechanism不同但 exact abstract semantics相同。

---

## 8. Capability / Policy / Authority Split

Platform Ports owns：

```text
relative deadline scheduling
fresh opaque material generation
physical Runtime creation/control carrier/termination facts
candidate Renderer Control carrier establishment + token delivery
```

Main owns：

```text
Session identity
Runtime Launch Attempt identity/currentness
all token validation/registration/binding/invalidation/consumption
Renderer attempt/current participant/replacement
Runtime/Frame/Activation/InputTarget/DataAuthority
revision / failure / unwind / deadline policy
```

Protocol packages own wire/JSON-RPC/state/correlation/terminal mechanics。

---

## 9. M7 Consumer-owned `MainPlatform`

`@loomrealm/main` defines its own structural view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl: RendererControlBinding;
}
```

这不是 Platform mega-interface。Concrete Hostra/PWA object MAY structural-satisfy it while还拥有 prepareGame等 product capability。

---

## 10. Renderer Binding Does Not Move Protocol Mechanics

`RendererControlBinding` MUST NOT：

```text
parse renderer.hello/state
encode JSON-RPC
validate Snapshot/revision
own current Renderer
coalesce publication
close old peer because of protocol replacement decision
```

Main作出 replacement decision；renderer-control peer执行 retirement/close；Binding只建立 candidate physical carrier。

---

## 11. Qualification Through M7

```text
M4 DeadlineScheduler / RuntimeControlBinding
    ✅ real Subsystem Host consumer qualified

M5 RuntimeHosting / HostedRuntime / MainRuntimeControlBinding
    ✅ real Main consumer qualified

M7 OpaqueMaterialGenerator / RendererControlBinding
    Frozen contract
    implementation qualification uses real Main consumer + deterministic Platform fixture

M14 Hostra Renderer physical realization
    later product qualification

M16 PWA Renderer physical realization
    later product qualification
```

M7 package-local/vertical tests MUST prove Binding abort/no-late-live-carrier semantics and Main one-candidate usage。

---

## 12. Compatibility

Current project尚未承诺 public compatibility。

M7 implementation直接：

```text
BootstrapTokenGenerator → OpaqueMaterialGenerator
```

不保留 alias/deprecation wrapper/v2名称。

---

## 13. Freeze Statement

Frozen M4：

```text
DeadlineScheduler
RuntimeControlBinding
```

Frozen M5 semantics：

```text
RuntimeLaunchRequest
MainRuntimeControlBinding
HostedRuntime
RuntimeHosting
```

Frozen M7 additions/refinement：

```text
OpaqueMaterialGenerator
RendererControlBinding
Main material/currentness authority remains outside Platform
```

Still deferred：M8 Data bindings/Broker ports、Content ports、physical Renderer transport implementation details。

### Final invariants

1. Platform Ports owns capabilities/facts only；Core owns authority/policy；protocol packages own mechanics。  
2. Runtime dependency remains Foundation only。  
3. `OpaqueMaterialGenerator` supplies fresh material only。  
4. `RendererControlBinding.acquire(token,signal)` creates one candidate physical carrier only；hello授予 currentness。  
5. Abort prevents late live carrier delivery。  
6. No universal Platform/Renderer service interface。  
7. M4/M5 semantics remain intact；M7 current-v1 rename uses no compatibility alias。  
8. Any change to M7 Binding semantics requires ADR 0027 reopen。