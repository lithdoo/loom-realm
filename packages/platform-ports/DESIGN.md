# `@loomrealm/platform-ports` 设计

> 状态：**Implemented Baseline / Core Boundary Frozen / M4 Consumer Qualified / M5 Slice Frozen**  
> 阶段：M5 Main Platform Capability Contract baseline  
> 最近复核：2026-08-28  
> 当前 root export：`DeadlineScheduler` / `RuntimeControlBinding` / `RuntimeLaunchRequest` / `MainRuntimeControlBinding` / `HostedRuntime` / `RuntimeHosting`  
> 上层事实源：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)、[运行承载系统](../../doc/10-architecture/runtime-hosting-system.md)、[运行时启动系统](../../doc/10-architecture/runtime-bootstrap-system.md)  
> 真实消费者：M4 `@loomrealm/subsystem/host` 已 qualification；M5 `@loomrealm/main` consumer qualification pending。

> **本包只定义 platform-neutral Core 需要的窄 capability / physical fact contract；不拥有 Core authority、不拥有 role policy、不实现 protocol mechanics、不实现 Hostra/PWA physical mechanism。**

---

## 1. Position / Ownership

```text
Core roles
    application authority + role policy

@loomrealm/platform-ports
    narrow cross-boundary capability contracts

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

当前 runtime dependency 仍只有：

```text
@loomrealm/foundation
```

必须保持：

```text
Platform capability != Core authority
Platform capability != protocol mechanics
Platform capability != physical connection lifetime
Platform package boundary != process boundary
```

---

## 2. Port Admission Rule

一个 public port 必须同时满足：

1. 当前 milestone 已有明确 Core consumer use-site；
2. Hostra/PWA 可用不同 physical mechanism 实现同一 abstract semantics；
3. 表达 capability / fact，而不是第二份 Core authority model；
4. 不重复 protocol package mechanics；
5. exact shape 已足够小，并由当前 vertical 证明需要。

以下理由不足以新增 API：

```text
未来可能需要
为了接口看起来完整
为了统一命名
为了测试方便
某个平台碰巧已有该 API
```

禁止：

```ts
interface Platform {
  runtime: unknown;
  renderer: unknown;
  data: unknown;
  content: unknown;
  filesystem: unknown;
  network: unknown;
  window: unknown;
}
```

也禁止 service locator、DI container、generic event bus、transport registry、generic lifecycle framework、generic Clock、platform detection API。

这不禁止 product composition 创建 concrete `HostraPlatform` / `PwaPlatform` object。Concrete Platform 是 composition object；Core role 只 structural-consume 自己的 narrow role view。

---

## 3. Frozen Root Public API

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
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

M4 existing API 不改变；M5 只新增 Main Runtime hosting vertical 所需四个类型。

---

## 4. M4 Existing Contracts

### 4.1 `DeadlineScheduler`

它是 deadline scheduling capability，不是 Clock。

```text
delayMs = finite non-negative integer
callback begins at most once
cancel idempotent
cancel-before-begin => callback MUST NOT begin later
cancel-after-begin => no retroactive effect
implementation MUST NOT intentionally fire early
```

不提供：

```text
now
wall clock
timezone
interval
cron
sleep Promise
```

它与 `@loomrealm/runtime-control` scheduler structural-compatible，但本包不依赖 Runtime Control。

### 4.2 `RuntimeControlBinding`

这是 **Subsystem-side** capability：一个 Subsystem Launch Attempt 的 single-use Control establishment。

```text
consumer acquire at most once
at most one successful carrier
success returns already-established MessageCarrier<string>
no hello / JSON / protocol state ownership
no reconnect / retry / replay
```

M4 `@loomrealm/subsystem/host` 已真实消费并 qualification，因此 M4 状态不再是 pending。

---

## 5. M5 Runtime Hosting Contract

### 5.1 `RuntimeLaunchRequest`

`RuntimeLaunchRequest` 是 Main-owned Launch Attempt 向 Platform 的**最小 operation projection**，不是 Launch Attempt authority object。

只包含：

```text
subsystemKey
bootstrapToken
```

禁止加入：

```text
LaunchAttempt registry object / mutable state
GameEntry / ValidatedGameEntry
PlatformLaunchPlan
module/path/URL
Node executable / argv / env
Worker target/options
Control endpoint / MessagePort
Renderer/Data/Content material
```

#### `subsystemKey`

表示 logical Runtime/application identity。Prepared concrete Platform 已持有 immutable PlatformLaunchPlan，因此 `RuntimeHosting` 只按 key lookup platform-private executable binding。

#### `bootstrapToken`

`bootstrapToken` 保持正式 Subsystem Control v1 的 ownership：

```text
Main creates + registers token
Main binds token to current Launch Attempt + subsystemKey
Platform receives token only to inject it into the exact Runner bootstrap
Main consumes/authenticates it during subsystem.hello
```

因此 Platform MUST：

```text
preserve token bytes/string exactly
inject only into the Runtime created for this launch call
not log / persist beyond physical bootstrap need
not mint application authority from the token
```

Main MUST register credential authority before calling `RuntimeHosting.launch()`，从而保持“Runtime can execute 前 credential 已注册”。

### 5.2 `RuntimeHosting`

一个 prepared concrete Platform instance 暴露一个 Main-facing `RuntimeHosting` capability。

```text
RuntimeHosting.launch(request, signal)
    → lookup frozen PlatformLaunchPlan[request.subsystemKey]
    → establish trusted Runner bootstrap material
    → create exactly one physical Runtime lifetime
    → inject subsystemKey/bootstrapToken
    → return HostedRuntime
```

`launch()` success 只证明：

```text
physical Runtime lifetime created
HostedRuntime correlation established
```

不证明：

```text
Control acquired
hello identified
Runtime ready
Frame exists
Renderer/Data exists
```

每次 `launch()` 调用对应一个 fresh Main Launch Attempt projection；Platform MUST NOT transparent retry/restart/reuse previous Runtime lifetime。

#### launch Abort

```text
signal already aborted
→ MUST NOT return a new live HostedRuntime

signal aborts while launch pending
→ Platform retires partial physical resources as far as possible
→ launch MUST NOT later resolve a live HostedRuntime

signal aborts after launch resolved
→ does not retroactively invalidate returned HostedRuntime
```

若 abort 与 physical creation 竞争产生 late Runtime，Platform 必须自行 retire；不得把它作为成功结果晚交给 Main。

### 5.3 `HostedRuntime`

`HostedRuntime` 是一个**already-created physical Runtime lifetime capability object**。

它把三个天然相关的事实/能力绑在同一个 returned lifetime 上：

```text
Runtime Control establishment
actual physical termination observation
physical termination request
```

这样 Main 不需要再维护：

```text
RuntimeHostHandle → ControlHost lookup
RuntimeHostHandle → Supervisor lookup
LaunchAttemptId → physical handle registry join
parallel generic event bus correlation
```

`HostedRuntime` 本身不是 Main Runtime authority，也不暴露 PID/Worker/module/URL。

### 5.4 `MainRuntimeControlBinding`

这是 **Main-side** single-use Control establishment capability，绑定一个 `HostedRuntime` lifetime。

结构虽然与 Subsystem-side `RuntimeControlBinding` 相同，但 role/lifetime 不同，因此保持独立名称，不建立 generic role parameter 或复用一个含混接口。

```text
consumer acquire at most once
at most one successful carrier
success returns already-established MessageCarrier<string>
no protocol mechanics / hello ownership
no same-attempt reconnect
no retry/replay
```

Abort 语义与 M4 binding 相同：pending abort 后不得晚交付 live carrier；late physical carrier 由 Platform close/discard。

### 5.5 `HostedRuntime.terminated`

```text
readonly terminated: Promise<void>
```

它只表达一个事实：

> **physical Runtime 已经实际终止。**

固定：

```text
requestTermination resolved != terminated
Control lost != terminated
Runtime failed != terminated
exit code 0 alone != graceful application success
```

Main 只有观察到 `terminated` 后才能提交 `stopped` physical fact。

v1 不把 PID、exit code、signal、Worker diagnostics 固化成 cross-platform public DTO；这些可保留为 Platform-local diagnostics。若未来真实 consumer 证明 Main 必须基于某个 portable termination fact 做 authority decision，再单独增长 contract。

### 5.6 `requestTermination(signal)`

这是 bounded physical termination request capability。

```text
resolve
    = termination request 已被 Platform 接受/发出，或 Runtime 已实际终止
    != physical Runtime 已结束

actual termination
    = await HostedRuntime.terminated
```

同一 `HostedRuntime` 上重复请求 MUST 可安全收敛，不得创建第二 Runtime lifecycle；实现 SHOULD idempotent。

Abort 只约束当前 termination request effort；如果 physical termination 已经开始，abort 不要求撤销。

---

## 6. M5 Lifecycle Closure

标准链路：

```text
Main creates Launch Attempt L for subsystem S
→ Main creates/registers fresh bootstrap token T
→ platform.runtimeHosting.launch({ subsystemKey:S, bootstrapToken:T }, signal)
→ Platform looks up its private frozen LaunchPlan[S]
→ Platform creates Host-owned Runner and injects S/T
→ HostedRuntime H
→ H.runtimeControl.acquire(signal)
→ MessageCarrier
→ @loomrealm/runtime-control createMainRuntimeControlPeer(...)
→ subsystem.hello { key:S, bootstrapToken:T }
→ Main authenticates against current L/T
→ identified
→ status(ready)
```

Physical terminal：

```text
Main graceful/failure cleanup
→ H.requestTermination(...)
→ await H.terminated
→ only then physical stopped fact exists
```

Correlation 自然来自返回值：

```text
one RuntimeHosting.launch invocation
    → one HostedRuntime
        → one MainRuntimeControlBinding
        → one termination fact
```

不需要 Platform 拥有 Main LaunchAttempt authority，也不需要第二套 global handle registry contract。

---

## 7. Capability / Policy / Authority Split

### Platform Ports owns

```text
how to schedule a deadline callback
how to create one physical Runtime
how to establish its Main-side Control carrier
how to request physical termination
how to observe actual physical termination
```

### Main owns

```text
LogicalGameBootstrap
Subsystem Registry
Launch Attempt identity/currentness
bootstrap token creation/storage/consumption authority
Runtime public lifecycle interpretation
Frame / Activation / Stack / InputTarget
failure classification / unwind
all timeout values and recovery policy
```

### Runtime Control owns

```text
JSON-RPC / wire mechanics
hello state machine mechanics
request correlation
frame/shutdown deadlines execution
terminal mechanics
```

因此：

```text
Platform Port     capability / fact
Main              authority / policy
Runtime Control   protocol mechanics
```

---

## 8. Consumer-owned Role Bundle

`@loomrealm/platform-ports` 不定义 universal Platform interface。

M5 `@loomrealm/main` MAY 定义：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly runtimeHosting: RuntimeHosting;
}
```

Concrete：

```text
HostraPlatform
PwaPlatform
```

可以 structural-satisfy 这个 view，同时拥有 `prepareGame()` 和未来其他 Platform capabilities。

固定：

```text
MainPlatform
    = Main current capability view
    != complete LoomRealm Platform
    != service locator
    != physical implementation owner
```

---

## 9. Package / Cross-runtime Policy

当前仍只发布 root：

```text
@loomrealm/platform-ports
```

不预建 `/main`、`/subsystem`、`/renderer`、`/data`、`/testing`、`/node`、`/browser`。

标准 `AbortSignal` 是 cross-runtime cancellation primitive，不表示 DOM ownership。

本包 MUST NOT依赖 concrete：

```text
Window / Document
WebSocket / MessagePort
fetch
child_process / Worker
filesystem
Hostra APIs
```

`MessageCarrier` 只从 `@loomrealm/foundation` 引用，不复制结构。

---

## 10. Implementation / Qualification

Package-local implementation 是 type contract baseline：

```text
src/index.ts exports exact frozen M4 + M5 interfaces
runtime dependency remains Foundation only
Node 20 + 24 TypeScript build
npm pack --dry-run
no runtime implementation
```

真实 qualification 分层：

```text
M4 @loomrealm/subsystem/host
    ✅ real consumer qualified

M5 @loomrealm/main
    pending real consumer qualification

M6 HostraPlatform
    pending first real physical RuntimeHosting implementation

M15 PwaPlatform
    pending second physical implementation / equivalence qualification
```

本包不能用 fake Platform 自称 Hostra/PWA conformance；package-local build 只证明 contract 可发布，real consumer/platform vertical 负责证明语义替换性。

---

## 11. Freeze Statement

Frozen：

```text
Core/Platform ownership boundary
port admission rule
M4 DeadlineScheduler
M4 RuntimeControlBinding
M5 RuntimeLaunchRequest
M5 MainRuntimeControlBinding
M5 HostedRuntime
M5 RuntimeHosting
Main-owned bootstrap credential authority projection
RuntimeHosting → HostedRuntime lifetime correlation
terminated fact vs termination request separation
```

仍 Evolving：

```text
M7 Renderer exact ports
M8/M9 Data exact ports
M12 Content exact ports
future subpath layout
portable termination diagnostics, only if real consumer proves necessary
```

修改 frozen M4/M5 slice 必须由至少一项驱动：formal contract 改变、M5 Main real consumer 证明 impossible/ambiguous、或 Hostra/PWA 无法共同实现 abstract semantics。“更方便”或“未来可能需要”不是理由。

当前允许表述：

```text
@loomrealm/platform-ports
    Core Boundary Frozen
    M4 Port Slice Frozen + Consumer Qualified
    M5 Main Port Slice Frozen / Contract Baseline Implemented
    M5 Main real consumer qualification pending
```

不得表述：

```text
Platform Ports fully implemented
M5 Main milestone closed
Hostra/PWA RuntimeHosting integration qualified
complete Platform API frozen
```

### Final invariants

1. Platform Ports 只拥有 capability/fact contract；Core 拥有 authority/policy；Protocol package 拥有 mechanics。  
2. 不存在 universal Platform service locator。  
3. M4 frozen API 保持兼容。  
4. `RuntimeLaunchRequest` 是 Launch Attempt 的窄 projection，不是 authority object。  
5. bootstrapToken 由 Main 创建/注册/消费；Platform 只安全注入 exact Runtime。  
6. `RuntimeHosting.launch()` 每次产生一个 fresh physical Runtime lifetime 或失败；无透明 retry/restart。  
7. `HostedRuntime` 绑定 Main-side Control establishment、termination request、actual termination fact。  
8. `Runtime failed != terminated != stopped`；`stopped` 只来自 actual `terminated` fact。  
9. Main/Subsystem Control binding 都 single-use、no same-attempt reconnect；role identity 不因结构相同而合并。  
10. `platform-ports` 仍只依赖 Foundation，不依赖 Runtime Control/Main/Subsystem/concrete Platform。  
11. Future ports 只由真实 milestone consumer 推动。  
