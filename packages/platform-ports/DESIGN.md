# `@loomrealm/platform-ports` 设计

> 状态：**Implemented Baseline through M8 / M9 Public Surface Frozen for Implementation**  
> 阶段：M9 Desktop DataConnectionBroker / Main→Platform authority feed  
> 最近复核：2026-09-04  
> 冻结决策：[ADR 0027](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md) · [ADR 0028](../../doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)

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

Hostra / PWA / apps/*
    physical realization
```

Runtime dependency remains exactly `@loomrealm/foundation`。MUST NOT depend on runtime-control、renderer-control、data、main、renderer或 concrete Hostra/PWA APIs。

---

## 2. Port Admission Rule

A public port enters this package only when a current platform-neutral Core consumer needs the same fact/capability while physical realization may differ across Platforms。

Forbidden：universal Platform、service locator、generic connection registry、event bus/observer stream、generic Clock/Crypto/provisioning framework、future port inventory。

---

## 3. Frozen Root API Through M9

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

export interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}

export interface RendererDataBinding {
  acquire(
    subsystemKey: string,
    generation: number,
    dataProfile: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}

export interface SubsystemDataBindingResult {
  readonly carrier: MessageCarrier;
  readonly generation: number;
  readonly dataProfile: string;
}

export interface SubsystemDataBinding {
  acquire(signal: AbortSignal): Promise<SubsystemDataBindingResult>;
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

export interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

export interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

export interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

Current-v1 has no `BootstrapTokenGenerator` alias and no alternate M9 Broker API。

---

## 4. M4/M5 Baseline

`DeadlineScheduler` is a narrow relative deadline capability。  
`RuntimeControlBinding` is Subsystem-side one-attempt already-established carrier acquisition。  
`RuntimeLaunchRequest` is only `subsystemKey + bootstrapToken`。  
`RuntimeHosting`/`HostedRuntime` expose physical creation/control acquisition/termination request/actual termination fact；they do not own Main Runtime/Data authority。

---

## 5. `OpaqueMaterialGenerator`

Each successful call returns：

```text
ASCII 1..128 bytes
fresh for the concrete Platform/Session lifetime
>=128-bit unpredictability for security-sensitive uses
opaque to callers
```

Main owns Session/Runtime/Renderer credential semantics。No kind parameter、identity service、token registry or generic crypto facade。

M9 does not change one-shot Renderer authentication。Main may retain the current accepted Renderer token value after authentication only as inert physical correlation；that retained live value remains part of Main's duplicate-material defense。

---

## 6. `RendererControlBinding` — M7 Frozen

`acquire(T,signal)` arms one physical candidate slot；it does not create/show/replace Renderer or grant currentness。

Settlement：

```text
abort before resolution
→ cancel that slot / no late live result

non-abort rejection
→ Binding terminal for owning Main Session / no re-acquire

carrier acquired then peer/protocol terminal
→ candidate attempt terminal only
```

Binding owns no hello/version/currentness semantics。

---

## 7. M8 Renderer / Subsystem Data Bindings

Bindings expose only already-current-deliverable paired carrier endpoints：

```text
RendererDataBinding.acquire(S,G,P,signal)
SubsystemDataBinding.acquire(signal) → {carrier,G,P}
```

They do not expose endpoint/ticket/candidate/Broker/transport or Main authority。

Binding waiter state is not M9 Broker installation authority and is not an installation prerequisite。

---

## 8. M9 `DataConnectionAuthoritySink`

The real Main consumer requires one narrow physical installation fact feed：

```text
current Renderer correlation
+ exact current HostedRuntime object
+ exact Main DataAuthority S/G/P
```

It is represented as full replacement：

```ts
interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

Frozen semantics：

```text
sink instance is Session-scoped
replace(null) = no current Renderer Data installation authority
replace(non-null) = the only installable current view
replace is synchronous
replace is non-blocking
replace MUST NOT throw
replace performs no network/IPC wait
```

Concrete implementation first atomically swaps its in-memory view and logically invalidates stale Broker current/pending material；physical close may converge asynchronously。

A throwing implementation is non-conforming and fails M9 qualification；the shared contract does not add a recovery/error hierarchy for provider bugs。

---

## 9. M9 View Identity

`DataConnectionAuthorityView` is Session-scoped, so Session ID is not repeated in the DTO。

`rendererControlToken`：

```text
already consumed as M7 one-shot Renderer authentication credential
retained by Main only while that Renderer is current
used as inert Platform-private correlation
never accepted from Renderer as Data authority proof
never enters Data application wire
```

`DataConnectionAuthorityEntry.runtime` is the exact `HostedRuntime` object identity。Same subsystemKey with a different HostedRuntime is a different physical target。

No PID/Worker ID/runtimeInstanceId is introduced。

---

## 10. Main-facing Optional Capabilities Through M9

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

```text
rendererControl absent
→ no physical Renderer attempt

dataConnections absent
→ no physical Data installation authority feed
```

Runtime/Frame semantics remain valid in both cases。M6/headless providers do not add fake capabilities。

---

## 11. Capability / Protocol / Authority Split

Platform Ports owns only narrow structural facts/capabilities。

Main owns Session/Runtime/Renderer/Data authority。  
Renderer-control owns hello/version/Snapshot mechanics。  
Data package owns connection-local Data application mechanics。  
Desktop/PWA composition owns Broker/physical carrier lifecycle。

`DataConnectionAuthoritySink` does not parse Data protocol or create generation/profile/current Renderer authority。

---

## 12. Qualification Through M9

```text
M4 DeadlineScheduler / RuntimeControlBinding
    ✅ real Subsystem Host consumer

M5 RuntimeHosting / HostedRuntime / MainRuntimeControlBinding
    ✅ real Main consumer

M7 OpaqueMaterialGenerator / RendererControlBinding
    ✅ real Main + deterministic candidate consumer

M8 RendererDataBinding / SubsystemDataBinding
    ✅ real Renderer/Subsystem consumers

M9 DataConnectionAuthorityEntry/View/Sink
    public shape frozen before implementation
    Main real producer + Desktop real consumer required
```

M9 package tests MUST prove：

```text
exact exported names/fields
Foundation-only runtime dependency remains true
no Broker/Hostra/PWA dependency
view can reference HostedRuntime without adding new identity type
sink replace signature remains void/full replacement
no generic event/registry/service surface exported
```

Behavioral non-throwing/full-view ordering is qualified by Main + Desktop consumer tests, not by a fake platform-ports state machine。

---

## 13. Freeze Statement

Frozen through M9：

```text
OpaqueMaterialGenerator common output
RendererControlBinding candidate-slot/settlement
RendererDataBinding / SubsystemDataBinding exact role seams
DataConnectionAuthorityEntry/View/Sink exact surface
sink full-replacement/non-throwing semantics
HostedRuntime object identity as physical Runtime correlation
```

Implementation MUST NOT add kind-specific random services、Binding error framework、AuthorityEventBus、ConnectionRegistry、public Broker interface or universal Platform mega-port。

M7 changes follow ADR 0027 reopen rule；M9 shared-port changes follow ADR 0028。
