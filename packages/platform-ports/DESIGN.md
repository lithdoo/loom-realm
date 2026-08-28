# `@loomrealm/platform-ports` 设计

> 状态：**Implemented Baseline / Core Boundary Frozen / M4 Consumer Qualified / M5 Slice Frozen**  
> 阶段：M5 Main Platform Capability Contract baseline  
> 最近复核：2026-08-28  
> 当前 root export：`DeadlineScheduler` / `RuntimeControlBinding` / `BootstrapTokenGenerator` / `RuntimeLaunchRequest` / `MainRuntimeControlBinding` / `HostedRuntime` / `RuntimeHosting`  
> 上层事实源：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)、[运行承载系统](../../doc/10-architecture/runtime-hosting-system.md)、[运行时启动系统](../../doc/10-architecture/runtime-bootstrap-system.md)  
> 真实消费者：M4 `@loomrealm/subsystem/host`、M5 `@loomrealm/main` 均已通过真实 role consumer qualification。

> **本包只定义 platform-neutral Core 需要的窄 capability / physical fact contract；不拥有 Core authority、不拥有 role policy、不实现 protocol mechanics、不实现 Hostra/PWA physical mechanism。**

---

## 1. Ownership

```text
Core roles
    application authority + role policy

@loomrealm/platform-ports
    narrow cross-boundary capabilities / physical facts

Protocol packages
    protocol mechanics

Hostra / PWA Platform implementations
    physical realization
```

依赖方向：

```text
@loomrealm/foundation
        ↑
@loomrealm/platform-ports
        ↑
        ├──────────────┐
        │              │
@loomrealm/subsystem  @loomrealm/main
        ↑              ↑
        │              │
 Hostra / PWA implementations
```

固定：

```text
platform-ports MUST NOT depend on runtime-control
platform-ports MUST NOT depend on main/subsystem
platform-ports MUST NOT depend on concrete Hostra/PWA APIs
```

当前 runtime dependency 仍只有 `@loomrealm/foundation`。

```text
Platform capability != Core authority
Platform capability != protocol mechanics
Platform capability lifetime != physical connection lifetime
Platform package boundary != process boundary
```

---

## 2. Port Admission Rule

新增 public port 必须同时满足：

1. 当前 milestone 有真实 Core consumer use-site；
2. Hostra/PWA 可用不同 physical mechanism 实现相同 abstract semantics；
3. 表达 capability/fact，不复制 Core authority；
4. 不重复 protocol mechanics；
5. exact shape 是完成当前 vertical 的最小集合。

以下理由不足以新增 API：未来可能需要、为了完整、为了统一命名、测试方便、某个平台碰巧已有。

禁止 universal `Platform` mega-interface、service locator、DI container、generic event bus、transport registry、generic lifecycle framework、generic Clock、platform detection API。

Product composition MAY 创建 concrete `HostraPlatform` / `PwaPlatform` object；Core role 只 structural-consume 自己的 narrow role view。

---

## 3. Frozen Root API

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

export interface BootstrapTokenGenerator {
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
```

M4 contracts remain unchanged. M5 adds only the capabilities proven necessary by the Main Runtime bootstrap vertical.

---

## 4. M4 Contracts

### `DeadlineScheduler`

Narrow deadline scheduling capability, not a Clock:

```text
delayMs finite non-negative integer
callback begins at most once
cancel idempotent
cancel-before-begin prevents later begin
cancel-after-begin has no retroactive effect
implementation does not intentionally fire early
```

No `now`, wall clock, timezone, interval, cron, sleep Promise.

### `RuntimeControlBinding`

Subsystem-side one-Launch-Attempt single-use Control establishment capability:

```text
consumer acquire at most once
at most one successful carrier result
already-established MessageCarrier
no hello/JSON/protocol-state ownership
no same-attempt reconnect/retry/replay
```

Pending abort must prevent later delivery of a live carrier; late physical carrier is closed/discarded by Platform.

M4 `@loomrealm/subsystem/host` is a qualified real consumer.

---

## 5. M5 Bootstrap Credential Capability

### `BootstrapTokenGenerator`

Subsystem Control v1 requires `bootstrapToken` to be fresh, high-entropy, opaque, bound to one Main Launch Attempt + key, registered before Runtime execution, consumed once, and not logged.

Main owns that credential authority, but platform-neutral Main must not import Node `crypto`, browser APIs, or concrete Platform primitives. Therefore M5 exposes one narrow capability:

```text
Main calls BootstrapTokenGenerator.generate()
→ receives fresh high-entropy opaque token material
→ Main validates/registers/binds it to LaunchAttempt + subsystemKey
→ Platform receives it only through RuntimeLaunchRequest
→ Main consumes/authenticates it during subsystem.hello
```

The generator owns **no credential authority**. It MUST NOT:

```text
register token
bind token to subsystem/attempt
consume token
decide hello authentication
retain token for application semantics
log token
```

Each successful call MUST yield fresh token material suitable for Subsystem Control v1 bearer authentication. Returned token MUST satisfy the protocol representation bound (`1..4096` UTF-8 bytes). Main remains responsible for rejecting invalid generator output before Runtime launch.

This capability is intentionally bootstrap-specific rather than a generic Crypto/Random service.

---

## 6. M5 Runtime Hosting Contract

### `RuntimeLaunchRequest`

A narrow projection of Main-owned Launch Attempt authority:

```text
subsystemKey
bootstrapToken
```

It is not a Launch Attempt registry/model and MUST NOT contain GameEntry, PlatformLaunchPlan, module/path/URL, Node/Worker options, endpoint/Port, Renderer/Data/Content material, or mutable Main state.

Before `RuntimeHosting.launch()`, Main has already registered the credential authority.

Platform receives the token only to inject it into the exact Runner created by this call. It preserves the token exactly, does not log it, and does not derive application authority from it.

### `RuntimeHosting`

A prepared concrete Platform exposes one Main-facing physical Runtime creation capability:

```text
launch({subsystemKey, bootstrapToken}, signal)
→ lookup immutable platform-private LaunchPlan[subsystemKey]
→ prepare trusted Runner bootstrap
→ create one physical Runtime lifetime
→ inject key/token
→ return HostedRuntime
```

Success proves only that the physical Runtime lifetime and its correlation object exist. It does not prove Control acquisition, hello identification, ready, Frame existence, Renderer, or Data.

No transparent retry/restart/reuse. Abort while pending must not later deliver a live HostedRuntime; late physical resources are retired internally.

### `HostedRuntime`

One already-created physical Runtime lifetime object correlates exactly:

```text
Main-side Control establishment
physical termination request
actual physical termination fact
```

This removes the need for parallel `RuntimeControlHost` / `RuntimeSupervisor` / handle registries solely to join facts belonging to the same physical lifetime.

`HostedRuntime` is not Main Runtime authority and exposes no PID/Worker/module/URL.

### `MainRuntimeControlBinding`

Main-side one-HostedRuntime single-use Control establishment capability. It is structurally similar to Subsystem-side `RuntimeControlBinding`, but role/lifetime identity differs, so the names remain separate.

```text
acquire at most once
at most one successful carrier
already-established MessageCarrier
no protocol/hello ownership
no same-attempt reconnect/retry/replay
```

Pending abort prevents late live-carrier delivery.

### `terminated`

`HostedRuntime.terminated` resolves only after the physical Runtime has actually terminated. Promise rejection/observation failure is **not** termination proof.

```text
termination request resolved != terminated
Control lost != terminated
Runtime failed != terminated
termination observation rejected != terminated
```

Only this physical fact can support Main committing `stopped`.

### `requestTermination(signal)`

Requests physical termination. Resolution means the request was accepted/issued or the Runtime was already terminated; it does not itself mean `stopped`.

Repeated requests on the same HostedRuntime MUST safely converge and MUST NOT create another Runtime lifetime. Abort does not require undoing termination already in progress.

---

## 7. M5 Lifecycle Closure

```text
Main creates LaunchAttempt L for subsystem S
→ generator.generate() => token T
→ Main validates/registers T against current L/S
→ runtimeHosting.launch({subsystemKey:S, bootstrapToken:T}, signal)
→ Platform creates Runner and injects S/T
→ HostedRuntime H
→ H.runtimeControl.acquire(signal)
→ MessageCarrier
→ createMainRuntimeControlPeer(...)
→ subsystem.hello {key:S, bootstrapToken:T}
→ Main authenticates/atomically consumes T
→ identified
→ status(ready)
```

Terminal cleanup separates graceful role shutdown from physical escalation:

```text
graceful Session terminal
→ Runtime Control shutdown accepted
→ bounded await H.terminated
→ if no successful termination observation: H.requestTermination(...)
→ bounded await H.terminated

Runtime failure / bootstrap abort
→ H.requestTermination(...) as needed
→ bounded await H.terminated
```

`requestTermination()` is escalation capability, not the default first step after a successful graceful shutdown.

One `launch()` result naturally carries one Control establishment capability and one termination lifetime; no second global correlation contract is needed.

---

## 8. Capability / Policy / Authority

Platform Ports owns:

```text
schedule relative deadline callback
generate environment-backed high-entropy bootstrap token material
create one physical Runtime
establish its Main-side Control carrier
request physical termination
observe actual physical termination
```

Main owns:

```text
LogicalGameBootstrap / Subsystem Registry
LaunchAttempt identity/currentness
bootstrap credential validation/registration/binding/consumption
Runtime lifecycle interpretation
Frame / Activation / Stack / InputTarget
failure classification / unwind
deadline values / recovery policy
```

Runtime Control owns wire/JSON-RPC/hello mechanics, request correlation/deadlines, and terminal mechanics.

---

## 9. Consumer-owned Role Bundle

`@loomrealm/platform-ports` does not define a universal Platform interface.

M5 `@loomrealm/main` may define:

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly bootstrapTokens: BootstrapTokenGenerator;
  readonly runtimeHosting: RuntimeHosting;
}
```

A concrete `HostraPlatform` / `PwaPlatform` may structural-satisfy this view while also owning `prepareGame()` and future platform capabilities.

```text
MainPlatform = Main's current capability view
             != complete LoomRealm Platform
             != service locator
```

---

## 10. Package / Qualification

Current package remains root-only and runtime-depends only on `@loomrealm/foundation`. No `/main`, `/subsystem`, `/node`, `/browser`, `/testing` subpaths are created.

The package contract MUST NOT depend on concrete Window/Document/WebSocket/MessagePort/fetch/child_process/Worker/filesystem APIs.

Qualification:

```text
M4 @loomrealm/subsystem/host
    ✅ real consumer qualified

M5 @loomrealm/main
    ✅ real consumer qualified

M6 HostraPlatform
    pending physical implementation

M15 PwaPlatform
    pending second implementation/equivalence
```

Package-local CI proves TypeScript build + publishable surface, not Hostra/PWA conformance.

---

## 11. Freeze Statement

Frozen M4:

```text
DeadlineScheduler
RuntimeControlBinding
```

Frozen M5:

```text
BootstrapTokenGenerator
RuntimeLaunchRequest
MainRuntimeControlBinding
HostedRuntime
RuntimeHosting
Main-owned credential authority vs environment-backed generation split
RuntimeHosting → HostedRuntime lifetime correlation
termination request vs actual termination fact
```

Still evolving: M7 Renderer ports, M8/M9 Data ports, M12 Content ports, future subpath layout, portable termination diagnostics only if a real consumer proves necessary.

Current valid claim:

```text
@loomrealm/platform-ports
    Core Boundary Frozen
    M4 Slice Frozen + Consumer Qualified
    M5 Main Slice Frozen / Contract Baseline Implemented
    M5 Main consumer qualified
```

Not valid:

```text
Platform Ports fully implemented
Hostra/PWA integration qualified
complete Platform API frozen
```

### Final invariants

1. Platform Ports owns capabilities/facts only; Core owns authority/policy; protocol packages own mechanics.  
2. No universal Platform/service locator.  
3. M4 contracts remain unchanged.  
4. Main owns bootstrap credential authority; generator only supplies fresh high-entropy material.  
5. RuntimeLaunchRequest contains only key + token projection.  
6. One RuntimeHosting launch returns one HostedRuntime lifetime with Control + termination correlation.  
7. `requestTermination()` never fabricates `terminated`/`stopped`.  
8. No same-attempt reconnect/retry/restart.  
9. Platform Ports still depends only on Foundation.  
10. Future ports require real milestone consumer evidence.
