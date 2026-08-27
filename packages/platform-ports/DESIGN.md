# `@loomrealm/platform-ports` 设计

> 状态：**Implemented Baseline / Core Boundary Frozen / M4 Slice Frozen**  
> 阶段：M4 Platform Capability Contract baseline  
> 最近复核：2026-08-27  
> 当前代码：M4 public slice 已落地；root export 仅 `DeadlineScheduler` / `RuntimeControlBinding`。  
> 上层事实源：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)、[运行承载系统](../../doc/10-architecture/runtime-hosting-system.md)、[运行时启动系统](../../doc/10-architecture/runtime-bootstrap-system.md)  
> 首个消费者：`@loomrealm/subsystem/host`（M4）；M5+ exact ports 尚未冻结。

> **本包只定义 platform-neutral Core 需要的窄 capability contract；不拥有 Core authority、不拥有 role policy、不实现 protocol mechanics、不实现 Hostra/PWA physical mechanism。**

---

## 1. Position / Ownership

现有架构已经有 role-facing ports 概念；缺的是一个由 Core consumer 与 Hostra/PWA implementation 共同依赖的 TypeScript 契约事实源。

固定 ownership：

```text
Core roles
    application authority + role policy

@loomrealm/platform-ports
    narrow capability contracts

Protocol packages
    protocol mechanics

Hostra / PWA adapters
    physical realization
```

目标依赖：

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

Runtime Control 保持正交：

```text
foundation + wire → runtime-control → subsystem/host
platform-ports --------------------→ subsystem/host
```

因此：

```text
platform-ports MUST NOT depend on runtime-control
platform-ports MUST NOT depend on main/subsystem
platform-ports MUST NOT depend on concrete Platform APIs
```

M4 implementation 后，本包 runtime dependency 只允许 `@loomrealm/foundation`。

必须保持：

```text
Platform capability != Core authority
Platform capability != protocol mechanics
Platform capability != physical connection
Platform package boundary != process boundary
```

---

## 2. What May Enter This Package

一个 public port 必须同时满足：

1. 已有真实 platform-neutral Core consumer；
2. Hostra/PWA 物理实现可不同但 abstract semantics 相同；
3. 表达 capability/fact，而不是 Core authority；
4. 不是 protocol mechanics 的重复 facade；
5. exact shape 已由当前 milestone 证明需要。

以下理由不足以新增 API：

```text
未来可能需要
为了接口完整/统一命名
测试方便
某个平台当前刚好这样实现
```

禁止万能：

```ts
interface Platform {
  runtime: unknown;
  renderer: unknown;
  data: unknown;
  content: unknown;
  filesystem: unknown;
  window: unknown;
}
```

也禁止：service locator、DI container、generic event bus、transport registry、generic lifecycle framework、generic Clock、platform detection API。

每个 capability 独立定义、独立注入、独立 lifetime。

---

## 3. M4 Frozen Public API

M4 第一版只冻结两个接口：

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}
```

首个 implementation PR root export **只能**新增：

```text
DeadlineScheduler
RuntimeControlBinding
```

不得顺手加入 M5/M7/M8/M12 ports。

### 3.1 `DeadlineScheduler`

这是 deadline scheduling capability，不是 Clock。

```text
delayMs = finite non-negative integer
callback begins at most once
cancel function is idempotent
cancel before callback begins => callback MUST NOT begin later
cancel after callback begins => no retroactive effect
implementation MUST NOT intentionally fire before requested delay
```

不提供 `now` / wall clock / timezone / interval / cron / sleep Promise。

其 shape 与 `@loomrealm/runtime-control` 的 `RuntimeControlScheduler` structural-compatible；Subsystem Host 可直接传入，不需要 adapter，也不要求本包依赖 Runtime Control。

### 3.2 `RuntimeControlBinding`

一个 instance 表示**一个 Subsystem Launch Attempt 的 single-use Control establishment capability**。

```text
consumer calls acquire at most once
at most one successful carrier result
success returns already-established MessageCarrier<string>
no JSON / hello / protocol-state ownership
no same-attempt reconnect
no retry/replay policy
```

Abort：

```text
signal already aborted
→ MUST NOT return a new successful carrier

signal aborts while pending
→ Platform stops/retires establishment as far as physically possible
→ acquire MUST NOT later resolve a live carrier

signal aborts after resolve
→ does not retroactively invalidate the resolved-carrier fact
```

若 abort 与 physical establishment 竞争并产生 late carrier，Platform implementation 必须自行 close/discard，不能再次交给 consumer。

`acquire` rejection 只表示 Control establishment failure；本包不定义 Hostra/PWA-specific error taxonomy。

---

## 4. Capability, Policy, Authority

### Capability != role policy

属于本包：

```text
DeadlineScheduler
RuntimeControlBinding
```

不属于：

```text
helloDeadlineMs
frameDeadlineMs
Subsystem terminal policy
Frame failure classification
```

M4 `@loomrealm/subsystem/host` 自己拥有：

```ts
interface SubsystemRuntimeControlPolicy {
  readonly scheduler: DeadlineScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
}
```

关系固定为：

```text
Platform Port    how to schedule / establish
Subsystem Host   which deadline policy applies
Runtime Control  how timeout/protocol mechanics settle
```

### Platform projection != Core authority

Core package不能被 Platform反向依赖，不等于把 Core authority model 搬进本包。

> **Core authority stays in its owner；Platform Ports MAY only define the narrow projection/fact DTO needed to cross one port.**

例如未来：

```text
Main owns Launch Attempt
    ↓ narrow projection if proven necessary
RuntimeHosting
```

而不是把 `LaunchAttempt` 迁到 `platform-ports`。

Future projection DTO 只能包含 Platform operation 必需数据，不能成为第二份 authority registry/model。

---

## 5. M5+ Is Deliberately Deferred

M5 确实需要 Main-facing physical capabilities，但 exact API 现在不冻结。

M5 preimplementation closure 先闭合：

```text
Main-owned Launch Attempt
        ↓
Platform Runtime creation
        ↓
Control connection
        ↓
Main correlation
```

再决定：

```text
RuntimeHosting 与 RuntimeControlHost 是否真有独立 lifetime
Control 如何绑定 exact Launch Attempt
Supervisor facts 用 handle / stream / returned capability 哪一种
terminate 属于 hosting port 还是 returned runtime capability
```

因此现在不公开猜测版：

```text
RuntimeHosting
RuntimeControlHost
RuntimeSupervisor
LaunchAttemptMaterial
HostedRuntime
```

后续增长顺序：

```text
M4     DeadlineScheduler + RuntimeControlBinding
M5     Main hosting/control/supervision slice（另行冻结）
M7     Renderer physical capabilities
M8/M9  Data bindings + DataConnectionBroker
M12    Content physical binding
```

固定：`future responsibility != current public export`。

---

## 6. Package / Cross-runtime Policy

当前只发布：

```text
@loomrealm/platform-ports
```

M4 不预建 `/main`、`/subsystem`、`/renderer`、`/data`、`/testing`、`/node`、`/browser`。只有 root surface 真实变大时才按 consumer 证据拆 subpath。

M4 使用标准 `AbortSignal`；Node >=20 与现代浏览器均具备该 runtime primitive。它只表示 cancellation，不表示 DOM ownership。

本包 MAY 使用提供 `AbortSignal` 类型所需的 standard typings，但 MUST NOT依赖 concrete `Window` / `Document` / `WebSocket` / `MessagePort` / `fetch` / `child_process` / Worker / filesystem / Hostra API。

`MessageCarrier` 只从 `@loomrealm/foundation` 引用，不复制结构定义。

Concrete implementation 可以分布在 launcher / transport / broker / content adapter；最终由 `apps/desktop` / `apps/pwa` composition。Launcher 不因实现某个 port 自动成为 Platform mega-package。

---

## 7. M4 Consumer Closure

M4 `@loomrealm/subsystem/host` 必须：

```text
import DeadlineScheduler / RuntimeControlBinding from platform-ports
own SubsystemRuntimeControlPolicy deadline values
consume @loomrealm/runtime-control internally
call RuntimeControlBinding.acquire exactly once
map acquire failure into Runtime bootstrap/fatal path
never reconnect same Launch Attempt
never expose carrier/scheduler/deadline through author root
```

链路：

```text
Hostra/PWA implementation
        ↓
platform-ports capability contract
        ↓
subsystem/host orchestration + policy
        ↓
runtime-control mechanics
        ↓
subsystem business SDK
```

`packages/subsystem/DESIGN.md` 已改为消费本文 M4 slice；本文是 `DeadlineScheduler` / `RuntimeControlBinding` 的唯一 Platform contract owner。

---

## 8. Implementation / CI

当前 M4 baseline 已按冻结 contract 机械落地：

```text
1. package.json add @loomrealm/foundation dependency
2. TS typings support standard AbortSignal
3. src/index.ts export exactly the two frozen interfaces
4. no runtime implementation
5. Node 20 + 24 build
6. npm pack --dry-run
7. M4 subsystem/host consumes them
```

本包是 type-contract package，不 fake Hostra/PWA runtime conformance。真实替换性在 consumer/platform integration 验证：不同 physical implementation 必须满足同一 abstract port semantics。

当前 package-level CI 最低要求：

```text
npm run build -w @loomrealm/foundation -w @loomrealm/platform-ports
npm pack -w @loomrealm/platform-ports --dry-run
```

---

## 9. Freeze Statement

本次冻结：

```text
package ownership boundary
port admission rules
M4 dependency direction
DeadlineScheduler exact shape + semantics
RuntimeControlBinding exact shape + semantics
capability vs role-policy split
Core authority projection rule
```

仍 Evolving：

```text
M5 Main exact ports
M7 Renderer exact ports
M8/M9 Data exact ports
M12 Content exact ports
future subpath layout
```

修改 frozen M4 slice 必须由至少一项驱动：M4 real implementation 证明 contract impossible/ambiguous、formal Runtime Control contract 改变、或 Hostra/PWA 无法共同实现该 abstract semantics。“更方便”或“未来可能需要”不是理由。

当前允许表述：

```text
@loomrealm/platform-ports
    Core Boundary Frozen
    M4 Port Slice Frozen
    Implemented Baseline
```

仍不得表述：

```text
Platform Ports fully implemented
M5 Main platform contract frozen
Hostra/PWA integration qualified
complete Platform API frozen
```

### Final invariants

1. Platform Ports只拥有 capability contract；Core拥有 authority/policy；Protocol package拥有 mechanics；Platform实现 physical realization。  
2. 不存在万能 Platform object/service locator。  
3. M4 只公开 `DeadlineScheduler`、`RuntimeControlBinding`。  
4. `RuntimeControlBinding` 是 Launch-Attempt-local、single-use、no-reconnect capability。  
5. `DeadlineScheduler` 是窄 deadline capability，不升级为 Clock；deadline values 属于 Subsystem Host policy。  
6. platform-ports 不依赖 runtime-control；`MessageCarrier` 只引用 Foundation。  
7. Core authority model不迁入本包，只允许必要窄 projection。  
8. Future ports 只由真实 milestone consumer 推动；Hostra/PWA physical mechanism可不同但同一 port semantics必须等价。
