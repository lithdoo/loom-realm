# `@loomrealm/platform-ports` 设计

> 状态：**Implementation Ready / Core Boundary Frozen / M4 Slice Frozen**  
> 阶段：M4 前 Platform Capability Contract foundation  
> 最近复核：2026-08-27  
> 当前代码状态：空公共 API；首个 implementation PR 只允许落地本文冻结的 M4 symbols。  
> 上层架构：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)、[运行承载系统](../../doc/10-architecture/runtime-hosting-system.md)、[运行时启动系统](../../doc/10-architecture/runtime-bootstrap-system.md)  
> 首个消费者：`@loomrealm/subsystem/host`（M4）  
> 第二消费者：`@loomrealm/main`（M5；exact slice 尚未冻结）

核心原则：

> **本包只定义 platform-neutral Core 向 concrete Platform 索取的窄 capability；不拥有 Core authority、不拥有 role policy、不实现 protocol mechanics，也不实现任何 Hostra/PWA physical mechanism。**

---

## 0. Decision

现有架构已经固定：

```text
Platform-neutral Core roles
Main / Renderer / Subsystem
        ↑
   role-facing capabilities
        ↑
Hostra / PWA realizations
```

此前缺口是这些 capability 名称散落在 Main、Subsystem、Hostra、PWA 文档中，没有一个可被 consumer 与 implementation 共同依赖的 TypeScript 契约事实源。

因此建立：

```text
@loomrealm/platform-ports
```

只解决：

```text
Core 需要什么平台能力？
该能力的 lifetime / failure boundary 是什么？
Hostra 与 PWA 要实现哪一份相同契约？
```

不解决：

```text
平台怎么实现
业务 authority 怎么变化
协议怎么编码/调度
Launcher manifest 怎么解析
```

---

## 1. Ownership Boundary

### `@loomrealm/platform-ports` owns

```text
narrow capability interface shape
capability-local lifetime
capability-local cancellation/failure semantics
Core ↔ Platform narrow projection boundary
```

### Core role packages own

```text
Main        Session/Runtime/Frame/Activation/InputTarget/DataAuthority
Subsystem   business Runtime/Frame/Input/Render/Content role semantics
Renderer    renderer-local role semantics
role-specific policy such as protocol deadline values
```

### Protocol packages own

```text
@loomrealm/runtime-control   Runtime Control / Frame mechanics
@loomrealm/data              Renderer Data profile mechanics
```

### Concrete Platform owns

```text
Process / Worker
WebSocket / MessagePort / MessageChannel
IPC / endpoint / ticket
filesystem / Fetch / Service Worker
physical supervision and establishment
```

固定：

```text
Platform capability != Core authority
Platform capability != protocol mechanics
Platform capability != physical connection
Platform package boundary != process boundary
```

---

## 2. Dependency Direction

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
 Hostra/PWA adapters implement the same ports
```

Runtime Control 保持独立：

```text
@loomrealm/foundation + @loomrealm/wire
        ↑
@loomrealm/runtime-control
```

M4 Subsystem Host 同时消费：

```text
@loomrealm/platform-ports
+
@loomrealm/runtime-control
```

**`@loomrealm/platform-ports` MUST NOT 依赖 `@loomrealm/runtime-control`。**

原因：Platform port 是基础 capability contract；不能为了 timer/carrier shape 把 Platform adapter 绑定到 protocol mechanics package。

M4 implementation 后，本包 runtime dependency 只允许：

```text
@loomrealm/foundation
```

直到真实后续 port 证明还需要别的低层类型。

---

## 3. Port Admission Gate

一个类型进入本包，必须同时满足：

1. 已有真实 platform-neutral Core consumer；
2. Hostra/PWA 物理实现不同但 abstract semantics 相同；
3. 它表达 capability/fact，而不是 Core authority；
4. 它不是某个 protocol mechanics 的重复 API；
5. 放在具体 Platform 内会迫使 Core 依赖 concrete implementation；
6. exact shape 已由当前 milestone 的 consumer 场景证明需要。

以下理由不足以新增 public port：

```text
未来可能需要
为了接口看起来完整
为了统一命名
测试方便
Hostra 当前实现刚好这样
PWA 当前实现刚好这样
```

禁止万能对象：

```ts
interface Platform {
  runtime: unknown;
  renderer: unknown;
  data: unknown;
  content: unknown;
  filesystem: unknown;
  window: unknown;
  network: unknown;
}
```

每个 capability 独立定义、独立注入、独立 lifetime。

---

## 4. M4 Frozen Public Slice

M4 第一版只冻结两个 capability。

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}
```

首个 implementation PR 的 root export **只能**新增：

```text
DeadlineScheduler
RuntimeControlBinding
```

不得顺手加入 M5/M7/M8/M12 ports。

### 4.1 `DeadlineScheduler`

这是窄 deadline scheduling capability，不是通用 Clock framework。

调用约束：

```text
delayMs = finite non-negative integer
callback = at most once
```

实现语义：

```text
schedule() registers one delayed callback
returned cancel function is idempotent
cancel before callback begins => callback MUST NOT begin later
cancel after callback begins/completes => no retroactive effect
platform delay MAY be later than requested; MUST NOT intentionally fire early
```

不提供：

```text
now()
wall-clock time
timezone
interval
cron
sleep Promise
```

该 shape 与 `@loomrealm/runtime-control` 当前 `RuntimeControlScheduler` structural-compatible；Subsystem Host 可直接注入，不需要 adapter，也不要求本包依赖 Runtime Control。

### 4.2 `RuntimeControlBinding`

一个 binding 代表**一个 Subsystem Launch Attempt 的 single-use Control establishment capability**。

```text
RuntimeControlBinding
    ↓ acquire(signal)
physical establishment
    ↓
already-established MessageCarrier<string>
    ↓
@loomrealm/runtime-control
```

冻结语义：

```text
consumer MUST call acquire at most once per binding instance
one binding has at most one successful carrier result
success returns already-established MessageCarrier
binding does not parse JSON / run hello / own protocol state
no same-attempt reconnect
no retry/replay policy
```

Abort：

```text
signal already aborted
    → MUST NOT publish a new successful carrier

signal aborts while acquire pending
    → Platform MUST stop/retire the establishment attempt as far as physically possible
    → acquire MUST NOT later resolve a live carrier to the consumer

signal aborts after acquire resolved
    → does not retroactively invalidate the resolved-carrier fact
```

如果 physical establishment 与 abort 竞争并产生了 carrier，Platform implementation 必须在内部关闭/丢弃该 late carrier，而不是重新交给 consumer。

Failure：

```text
acquire rejection = Control establishment failure fact
```

本包不定义 Hostra/PWA-specific error class。Consumer 不得根据 platform-specific exception shape 改变 Runtime semantics。

Control carrier 后续 close/loss 由 Runtime Control peer 观察；Binding 不因此获得 Runtime authority。

---

## 5. Capability vs Role Policy

M4 必须把“平台能力”和“Subsystem policy”分开。

属于本包：

```text
RuntimeControlBinding
DeadlineScheduler
```

不属于本包：

```text
helloDeadlineMs
frameDeadlineMs
Subsystem terminal policy
Frame failure classification
```

M4 `@loomrealm/subsystem/host` 应拥有类似：

```ts
interface SubsystemRuntimeControlPolicy {
  readonly scheduler: DeadlineScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
}
```

这个类型属于 Subsystem Host，不从 `@loomrealm/platform-ports` 导出。

关系：

```text
Platform provides: how to schedule a deadline
Subsystem Host policy decides: what deadline value to use
Runtime Control mechanics decides: how timeout settles protocol work
```

这样不会把 role policy 伪装成通用 Platform capability。

---

## 6. Authority Projection Rule

本包不能因为 Core package 不能被 Platform 反向依赖，就把 Core domain model搬进来。

固定：

> **Core authority model stays in its Core owner. Platform Ports MAY define only the narrow projection/fact DTO required to cross the port.**

例如未来：

```text
Main owns Launch Attempt
    ↓ narrow projection
RuntimeLaunchRequest (if proven necessary)
    ↓
RuntimeHosting
```

而不是：

```text
move LaunchAttempt into platform-ports
```

同理：

```text
Main owns DataAuthority
    ↓ narrow provisioning projection
DataConnectionBroker
```

Broker 不拥有 generation/profile authority。

任何 future projection DTO 都必须：

```text
contain only data required by the Platform operation
not expose unrelated Core registry/state
not become a second authority model
```

---

## 7. M5 Boundary: Intentionally Not Frozen Yet

M5 明确需要 Main-facing physical capabilities，但 exact API 现在不冻结。

候选职责仍是：

```text
RuntimeHosting
physical supervision facts
Main-side Runtime Control acceptance/establishment
```

M5 preimplementation closure 必须先回答一个问题：

```text
Main-owned Launch Attempt
        ↓
Platform Runtime creation
        ↓
Control connection
        ↓
Main correlation
```

需要确定：

```text
RuntimeHosting 与 RuntimeControlHost 是否真有独立 lifetime
Control 如何与 exact Launch Attempt 相关联
Supervisor facts 通过 handle、stream 还是 hosted-runtime capability 返回
terminate 属于 hosting capability 还是 returned runtime capability
```

在这些问题由 M5 real consumer 场景证明前，不新增 public symbol。

特别禁止为了提前“完整”而现在创建：

```text
RuntimeHosting
RuntimeControlHost
RuntimeSupervisor
LaunchAttemptMaterial
HostedRuntime
```

的猜测版 API。

---

## 8. Later Milestone Growth

后续仍按真实 consumer 增长：

```text
M4
    DeadlineScheduler
    RuntimeControlBinding

M5
    Main Runtime hosting/control/supervision slice
    exact shape after M5 closure

M7
    Renderer hosting/control physical capabilities

M8/M9
    Subsystem/Renderer Data binding
    DataConnectionBroker

M12
    Content physical binding capability
```

固定：

```text
future responsibility != current public export
```

Hostra/PWA concrete implementation 可以分布在 launcher、transport、broker、content 等窄 adapter/package；最终由：

```text
apps/desktop
apps/pwa
```

完成 composition。

Launcher 不因为实现某个 port 自动成为完整 Platform package。

---

## 9. Package Surface Policy

当前 package：

```text
@loomrealm/platform-ports
root export only
```

M4 不建立：

```text
/main
/subsystem
/renderer
/data
/testing
/node
/browser
```

如果未来 root surface 真实增长到影响可读性，再依据真实消费者拆分 subpath。

禁止：

```text
service locator
generic DI container
generic event bus
transport adapter registry
schema DSL
platform detection API
```

---

## 10. Cross-runtime Type Policy

M4 port 使用标准 `AbortSignal`，因为 Phase 1 支持的 Node >=20 与现代浏览器均具备该 runtime primitive。

它只表达 cancellation，不表示 DOM/Browser ownership。

实现 package MAY 为 TypeScript 声明加入提供 `AbortSignal` 类型所需的 standard library typings；但本包 MUST NOT 因此使用：

```text
Window
Document
WebSocket concrete class
MessagePort concrete class
fetch concrete implementation
Node child_process
```

`MessageCarrier` 继续来自 `@loomrealm/foundation`，不在本包复制结构定义。

---

## 11. Implementation Plan

本文冻结后，首个 implementation PR 是机械落地，不再做架构设计。

只做：

```text
1. package.json 增加 @loomrealm/foundation runtime dependency
2. TypeScript lib 配置支持标准 AbortSignal type
3. src/index.ts 导出 DeadlineScheduler / RuntimeControlBinding
4. 不增加 runtime implementation
5. build on Node 20 + 24
6. npm pack --dry-run
7. M4 @loomrealm/subsystem/host 开始消费这两个 port
```

本包本身没有需要 fake 的 Hostra/PWA runtime test。

真实替换性验证发生在消费者/平台 integration：

```text
Hostra-like implementation
PWA-like implementation
        ↓
same Core consumer contract
        ↓
same abstract observable semantics
```

---

## 12. M4 Consumer Closure

M4 `@loomrealm/subsystem/host` 必须：

```text
import RuntimeControlBinding / DeadlineScheduler from platform-ports
own SubsystemRuntimeControlPolicy deadline values
consume @loomrealm/runtime-control internally
never expose carrier/scheduler/deadline through author root
call RuntimeControlBinding.acquire exactly once
map acquire failure into Runtime bootstrap/fatal path
never reconnect same Launch Attempt
```

因此 ownership 形成：

```text
Hostra/PWA
    implements establishment + scheduling capability
        ↓
@loomrealm/platform-ports
    defines capability contract
        ↓
@loomrealm/subsystem/host
    owns role orchestration/policy
        ↓
@loomrealm/runtime-control
    owns protocol mechanics
        ↓
@loomrealm/subsystem author SDK
    exposes business Runtime/Frame semantics
```

---

## 13. Non-goals

当前明确不做：

```text
完整 Platform API 一次冻结
Platform mega-package
Platform service locator
统一 Hostra/PWA physical topology
统一 launcher manifest
runtime-control facade
Data/Renderer/Content future port stubs
filesystem/browser compatibility layer
generic lifecycle framework
generic Clock abstraction
Core authority model relocation
```

---

## 14. Freeze / Change Policy

本次冻结范围：

```text
package ownership boundary
port admission rules
M4 dependency direction
DeadlineScheduler exact shape + semantics
RuntimeControlBinding exact shape + semantics
capability vs role-policy split
Core authority projection rule
```

以下仍 Evolving：

```text
M5 Main-facing exact ports
M7 Renderer-facing exact ports
M8/M9 Data exact ports
M12 Content exact ports
future subpath layout
```

修改已冻结 M4 slice 必须由以下至少一项驱动：

```text
M4 real implementation proves contract impossible/ambiguous
formal Runtime Control contract changes
Hostra/PWA both cannot realize the frozen abstract semantics
```

“代码写起来更方便”或“未来也许需要”不是破坏冻结的理由。

---

## 15. Implementation-ready Gate

本文可进入待实施状态，因为：

```text
[✓] package owner single-source 明确
[✓] Core / Protocol / Platform authority 分工明确
[✓] M4 real consumer 已知
[✓] M4 exact public symbols 已冻结
[✓] capability lifetime / cancellation / failure 已冻结
[✓] role policy 不再放入 platform-ports
[✓] platform-ports 不依赖 runtime-control
[✓] Core authority model 不迁入 platform-ports
[✓] M5 未成熟 API 明确延后
[✓] package surface 保持 root-only
[✓] implementation 是机械落地，无需再猜架构决策
```

允许状态：

```text
@loomrealm/platform-ports
    Core Boundary Frozen
    M4 Port Slice Frozen
    Implementation Ready
```

不允许状态：

```text
Platform Ports fully implemented
M5 Main platform contract frozen
Hostra/PWA platform integration qualified
complete Platform API frozen
```

---

## 16. Final Invariants

1. `@loomrealm/platform-ports` 只拥有 platform capability contracts；
2. Core role package拥有 application authority与 role-specific policy；
3. Protocol package拥有 protocol mechanics；
4. Concrete Platform拥有 physical establishment/hosting；
5. 不存在万能 `Platform` object/service locator；
6. capability 只随真实 milestone consumer 增长；
7. M4 只公开 `DeadlineScheduler` 与 `RuntimeControlBinding`；
8. `RuntimeControlBinding` 是 Launch-Attempt-local、single-use、no-reconnect capability；
9. `DeadlineScheduler` 是窄 deadline capability，不升级为通用 Clock；
10. deadline values 属于 Subsystem Host policy，不属于 platform-ports；
11. platform-ports 不依赖 runtime-control；
12. `MessageCarrier` 只从 Foundation 引用，不复制；
13. Core authority model不迁入本包，只允许必要的窄 projection；
14. M5 hosting/control/supervision exact split 在 M5 real consumer closure 前不冻结；
15. Hostra/PWA physical mechanism可不同，但同一 frozen port semantics必须等价；
16. 当前后续实现应是本文的直接机械映射，不再新增横向抽象。
