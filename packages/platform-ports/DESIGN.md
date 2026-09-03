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

Runtime dependency remains exactly `@loomrealm/foundation`。MUST NOT depend on runtime-control、renderer-control、main、renderer或 concrete Hostra/PWA APIs。

---

## 2. Port Admission Rule

Public port只有当前真实 Core consumer + 多平台 physical realization需要时才进入本包。

禁止 universal Platform、service locator、generic connection registry、generic lifecycle/event bus、generic Clock/Crypto service、future port inventory。

M7 `RendererControlBinding` 已由 Main real consumer closure证明；它不是 Renderer mega-port。

---

## 3. Frozen Root API Through M7

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

Current-v1 不保留 `BootstrapTokenGenerator` alias；M7直接改为 `OpaqueMaterialGenerator`。

---

## 4. M4/M5 Frozen Baseline

`DeadlineScheduler`：narrow relative deadline capability；no wall-clock/interval/cron。

`RuntimeControlBinding`：Subsystem-side one-attempt single-use already-established carrier；abort prevents late live delivery；no reconnect/retry/replay。

`RuntimeLaunchRequest`：only `subsystemKey + bootstrapToken`。

`RuntimeHosting` / `HostedRuntime` / `MainRuntimeControlBinding`：physical Runtime creation、Main-side Control acquisition、termination request与actual termination fact；M5 semantics unchanged。

---

## 5. `OpaqueMaterialGenerator`

M5 Runtime bootstrap + M7 Session identity/Renderer token形成多个真实 consumer：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}
```

每个 successful call MUST 返回：

```text
ASCII string
1..128 bytes
fresh for the concrete Platform/Session lifetime
at least 128 bits of unpredictability for security-sensitive uses
opaque to callers
```

Main 对 Session identity、Runtime bootstrap credential、Renderer Control credential分别独立调用；不得复用同一值。

Generator不拥有 Session identity semantics、Runtime attempt authority、Renderer currentness、credential registration/binding/consumption。Main 对每种用途仍做 formal representation validation。

不是 identity service/token registry/kind-dispatch factory/crypto facade；不得为了三个用途增加 `generate(kind)` 或多个语义化 generator interface。

---

## 6. `RendererControlBinding` — Frozen Candidate Slot

```ts
interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

一个 acquire调用不是“立即启动一个 Renderer”，而是：

```text
arm exactly one candidate slot with Main-issued token T
→ MAY remain pending until Platform has a physical candidate
→ Platform binds at most one candidate to T
→ Platform delivers exact T to that candidate bootstrap
→ Platform establishes one already-connected MessageCarrier
→ Promise resolves at most once
```

`acquire()` MUST NOT itself mean：

```text
create/show a new Renderer now
replace current Renderer
authenticate token
negotiate Renderer Control version
mark candidate current
```

如果没有 armed slot，或一个 slot已绑定 candidate 后又出现额外 candidate：

```text
Platform MUST NOT give it T
Platform MUST NOT expose it as a live Renderer Control participant
Platform rejects/closes/discards it according to product policy
```

Settlement semantics：

```text
AbortSignal abort before resolution
→ cancel only this slot
→ late candidate/carrier MUST NOT be delivered as a live result

non-abort acquire rejection
→ this RendererControlBinding is terminal for the owning Main Session
→ consumer MUST NOT call acquire again in that Session
```

Binding无需 typed error hierarchy。Carrier成功 acquire 后的 protocol/peer failure不等于 Binding terminal。

这允许 Main 在 current Renderer存在时预挂下一 slot而不会自动产生 replacement。

M7 deterministic realization：MemoryCarrier fixture。Desktop/PWA physical realization分别 M14/M16。

---

## 7. Optional Capability in Main-facing View

`RendererControlBinding` 是 frozen capability type，但 concrete Platform/Session MAY omit。

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

```text
rendererControl absent
→ Renderer-incapable/headless composition
→ Main runs Runtime/Frame normally
→ no Renderer token/candidate slot

rendererControl present
→ Main uses frozen one-current + one-slot/currentness semantics
```

M6 Hostra Runtime-only无需 fake Binding；M14加入真实 Hostra Renderer physical realization。

---

## 8. Capability / Protocol / Authority Split

Platform Ports owns：relative deadline scheduling、fresh opaque material、Runtime physical facts、candidate Renderer slot/carrier establishment when capability exists。

Renderer-control owns：hello wire/schema/version negotiation、Snapshot validation、publication/terminal mechanics。

Main owns：Session identity、Runtime attempt、all credential semantics、Renderer slot token/current participant/replacement、Runtime/Frame/Activation/InputTarget/DataAuthority/revision/failure/unwind。

---

## 9. Binding Does Not Move Protocol Mechanics

`RendererControlBinding` MUST NOT parse `renderer.hello/state`、encode JSON-RPC、validate Snapshot/revision、negotiate version、own current Renderer或 coalesce publication。

Binding只等待/建立一个 candidate physical carrier；Main + renderer-control决定其 semantic fate。

---

## 10. Qualification Through M7

```text
M4 DeadlineScheduler / RuntimeControlBinding
    ✅ real Subsystem Host consumer qualified

M5 RuntimeHosting / HostedRuntime / MainRuntimeControlBinding
    ✅ real Main consumer qualified

M7 OpaqueMaterialGenerator / RendererControlBinding
    Frozen contract
    deterministic Platform provides real candidate-slot Binding
    capability-absent Main path also qualified

M14 Hostra Renderer physical realization
M16 PWA Renderer physical realization
```

M7 tests MUST prove：

```text
OpaqueMaterialGenerator output bound + independent values
one slot → one candidate
acquire may remain pending without creating replacement
no-slot extra candidate gets no token/live carrier
already-bound slot extra candidate gets no token/live carrier
abort → no late live result
non-abort acquire rejection → Binding terminal for Session / no re-acquire
carrier-acquired peer failure does not falsely terminalize Binding
Main one-candidate usage
capability absence needs no fake Binding
```

---

## 11. Compatibility

Current project无 public compatibility obligation：

```text
BootstrapTokenGenerator → OpaqueMaterialGenerator
```

无 alias/deprecation wrapper/v2。

---

## 12. Freeze Statement

Frozen M7 additions/refinement：

```text
OpaqueMaterialGenerator common output contract
RendererControlBinding candidate-slot semantics
abort cancellation vs non-abort terminal rejection
optional capability availability in MainPlatform
Binding owns no protocol/authority
```

除 ADR 0027 Reopen Rule外，不允许实现阶段新增 kind-specific random service、Binding error framework、connection registry或 Renderer mega-port。
