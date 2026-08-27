# `@loomrealm/platform-ports` 设计草案

> 状态：Draft / Empty Package Skeleton  
> 阶段：Platform Capability Contract preimplementation design  
> 最近复核：2026-08-27  
> 目标：定义 LoomRealm 平台无关 role core 对外部平台实现所要求的最小 capability ports，使 `@loomrealm/main`、`@loomrealm/subsystem` 等核心包只消费稳定接口，而 Hostra / PWA 及其 adapter 负责具体实例化。  
> 当前代码状态：**空公共 API；`src/index.ts` 不导出任何 capability。本文中的接口名称均为候选，不是已冻结 npm API。**

---

## 0. 为什么需要这个包

当前架构已经明确：

```text
Platform-neutral application roles
Main / Renderer / Subsystem
        ↑
   role-facing ports
        ↑
   Hostra / PWA
```

并且现有系统设计已经散落描述了：

```text
Main-facing
    RuntimeHosting / Supervisor
    RuntimeControlHost
    RendererHosting
    RendererControlHost
    DataConnectionBroker

Renderer-facing
    RendererControlBinding
    RendererDataBinding
    ContentClient
    presentation/input environment

Subsystem-facing
    RuntimeControlBinding
    SubsystemDataBinding
    ContentClient
```

缺口不在“有没有这些概念”，而在：

> **这些概念还没有形成一个由 Core consumer 与 concrete Platform implementation 共同依赖的 TypeScript 契约事实源。**

如果继续让 `main`、`subsystem/host`、Hostra、PWA 各自定义注入接口，长期会出现：

```text
同一能力多份接口
同一 lifetime 多种解释
Hostra/PWA 分别发明 injection shape
Core 名义 platform-neutral，实际上被具体 launcher/composition 反向塑形
```

因此引入：

```text
@loomrealm/platform-ports
```

只负责一件事：

> **声明 Core 需要平台提供什么能力。**

---

## 1. Position

建议依赖方向：

```text
                    @loomrealm/platform-ports
                    interfaces / contracts only
                       ↑               ↑
                       │               │
             @loomrealm/main   @loomrealm/subsystem
                       │               │
                       │ consumes      │ consumes
                       │               │
              ┌────────┴───────────────┴────────┐
              │                                 │
      Hostra adapters                      PWA adapters
      implement ports                     implement ports
              │                                 │
              └──────────────┬──────────────────┘
                             │
                      composition root
                  apps/desktop / apps/pwa
```

核心含义：

```text
Core role package
    consumes capability interfaces

Concrete platform adapters
    implement capability interfaces

Composition root
    creates concrete implementations
    injects them into Core roles
```

这是一层 **Ports & Adapters contract package**，不是 Platform implementation。

---

## 2. 它不是什么

`@loomrealm/platform-ports` MUST NOT 演化成：

```text
@loomrealm/platform mega-package
Hostra abstraction layer
PWA abstraction layer
transport implementation
process/worker launcher
filesystem/browser API wrapper
service locator
runtime authority owner
protocol implementation
```

特别禁止：

```ts
interface Platform {
  runtime: ...;
  renderer: ...;
  data: ...;
  content: ...;
  input: ...;
  filesystem: ...;
  window: ...;
  network: ...;
}
```

一个“大 Platform 对象”会把互不相关的 capability lifetime、authority 与实现 milestone 强行绑在一起。

应保持：

```text
Platform architecture != one mega package
Platform capability != platform implementation
Capability port != protocol package
Capability port != physical connection
```

---

## 3. Contract Granularity

本包应按**独立 capability**定义窄接口，而不是按产品定义接口。

候选分类：

```text
Main-facing ports
Subsystem-facing ports
Renderer-facing ports
shared narrow platform policy primitives
```

每个 Core role 只消费自己真正需要的 port 组合。

例如 M4 不应该为了“完整 Platform shape”要求 fake：

```text
Data
Input
Render
Content
Renderer
```

M4 只应消费 Runtime/Frame 所需能力。

---

## 4. M4 Subsystem 候选最小接口

> 本节是设计候选，不是已冻结 API。

M4 当前真正需要的平台能力只有 Runtime Control establishment/policy。

候选：

```ts
interface RuntimeControlBinding {
  acquire(signal?: AbortSignal): Promise<MessageCarrier>;
}
```

含义：

```text
Platform/Runner
    owns physical establishment
        ↓
RuntimeControlBinding
    yields already-established MessageCarrier
        ↓
@loomrealm/subsystem
    consumes @loomrealm/runtime-control mechanics
```

同一 Subsystem instance / Launch Attempt：

```text
0..1 successful Control acquisition
Control loss = Runtime failure
no same-attempt reconnect
```

Runtime Control mechanics 还需要 scheduler/deadline policy。候选：

```ts
interface RuntimeControlPolicy {
  readonly scheduler: RuntimeControlScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
}
```

需要进一步决定：

```text
RuntimeControlScheduler 是否直接复用 runtime-control public type
还是由 platform-ports 定义等价 narrow structural port
```

原则是：

> scheduler/deadline 属于 trusted platform/host policy，不进入 business author API。

M4 的 `@loomrealm/subsystem` author root 不应看见 carrier、scheduler 或 deadline。

---

## 5. M5 Main 候选最小接口

> 本节同样是设计候选。

Main 不应该知道：

```text
Node process
Worker
module path / URL
WebSocket URL
MessagePort
Hostra manifest
PWA manifest
```

Main 只需要 logical hosting / supervision / Control establishment facts。

候选 capability：

```text
RuntimeHosting
RuntimeSupervisor facts
RuntimeControlHost
```

概念职责：

### RuntimeHosting

```text
Main logical launch intent
    ↓
RuntimeHosting
    ↓
platform-private frozen LaunchPlan lookup
    ↓
Node Runner / Worker Runner creation
```

Main input 只应包含 logical runtime identity / launch-attempt material，不包含 executable material。

### RuntimeSupervisor

只暴露 physical facts，例如：

```text
created / creation-failed
alive / exited
termination requested/result
exit reason/code/signal
```

Supervisor 不拥有：

```text
Frame authority
Activation authority
InputTarget
Runtime failure unwind commit
DataAuthority
```

### RuntimeControlHost

负责把已经建立的 Main-side Control carrier 交给 Main Runtime Control consumer；不实现 JSON-RPC/Frame mechanics。

具体 exact method shapes 在 M5 preimplementation closure 冻结。

---

## 6. 后续 capability 按真实 milestone 增长

不要现在一次性冻结完整平台 API。

建议随真实 consumer 增长：

```text
M4
    Subsystem RuntimeControlBinding / RuntimeControlPolicy

M5
    Main RuntimeHosting / Supervisor / RuntimeControlHost

M7
    RendererHosting / RendererControlBinding or Host

M8/M9
    SubsystemDataBinding
    RendererDataBinding
    DataConnectionBroker

M12
    Content-facing platform ports
```

因此：

```text
future responsibility
!= current public export
```

当前 `src/index.ts` 保持空，是为了避免 Draft 直接形成兼容性负担。

---

## 7. Hostra / PWA 的正确关系

Hostra 与 PWA concrete packages/adapters 应依赖本包，并实现相同 capability contracts。

例如：

```text
HostraRuntimeHosting
    implements RuntimeHosting

PwaRuntimeHosting
    implements RuntimeHosting
```

物理实现可以完全不同：

```text
Hostra
    child_process
    WebSocket
    IPC
    filesystem

PWA
    Worker
    MessagePort
    MessageChannel
    Fetch / Service Worker
```

但 Core role 看见的 capability contract 相同。

必须保持：

```text
same capability semantics
!= same physical mechanism
```

---

## 8. Launcher != Complete Platform

`@loomrealm/game-launcher-hostra` / `@loomrealm/game-launcher-pwa` 不应因为实现部分 ports 就升级成平台 mega-package。

现有职责仍应保持：

```text
matching Launcher
    Game Entry consumption
    Platform manifest validation
    executable PREPARE
    Runtime launch planning/hosting integration
```

而完整产品 composition 仍然是：

```text
apps/desktop
apps/pwa
```

因此 concrete implementation 可能分布在多个窄 adapter/package：

```text
game launcher / runtime hosting
transport adapter
renderer hosting adapter
data broker adapter
content adapter
```

最终由 composition root 组装。

---

## 9. 与 `@loomrealm/subsystem/host` 的关系

当前 `packages/subsystem/DESIGN.md` 将部分 Platform-facing shape 定义在 `/host` 中。

引入本包后，建议责任改为：

```text
@loomrealm/platform-ports
    owns reusable Platform capability contracts

@loomrealm/subsystem/host
    owns Subsystem role bootstrap/orchestration API
    consumes those contracts
```

也就是说：

```text
RuntimeControlBinding
    platform capability contract

runSubsystem(...)
    Subsystem role host integration API
```

不要让 `/host` 成为 Platform contract 的唯一事实源。

---

## 10. 与 `@loomrealm/main` 的关系

同理：

```text
@loomrealm/platform-ports
    defines RuntimeHosting/Supervisor/etc. contracts

@loomrealm/main
    owns application authority
    consumes those contracts
```

Main 不拥有 concrete platform implementation，也不反向定义 Hostra/PWA 需要实现的不同接口。

目标是：

```text
one port contract
    ↓
Main consumer
    +
Hostra implementation
    +
PWA implementation
```

而不是三份近似 interface。

---

## 11. Dependency Policy

当前空包阶段：

```text
runtime dependencies = none
public exports = none
```

后续引入具体 port 时再按真实类型需求增加依赖。

候选允许依赖应非常窄，例如：

```text
@loomrealm/foundation
    MessageCarrier type/capability

@loomrealm/runtime-control
    only if exact narrow scheduler/public protocol-neutral type reuse is justified
```

需要谨慎避免形成反向依赖或把 protocol implementation mechanics 泄漏成 Platform API。

本包 MUST NOT 依赖：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
Node APIs
DOM APIs
WebSocket concrete implementation
Worker concrete implementation
filesystem
Hostra APIs
```

---

## 12. Package Surface Policy

初始 skeleton 只保留 root package：

```text
@loomrealm/platform-ports
```

当前 root export 为空。

未来在真实接口数量增长前，不预建：

```text
/main
/subsystem
/renderer
/data
/testing
/node
/browser
```

如果后续 root surface 真实变大，再基于实际消费者决定是否拆 subpath。

原则：

> package structure follows proven consumers, not predicted taxonomy.

---

## 13. Authority / Lifetime Rules

Platform port 只提供 capability，不可反向创造 application authority。

例如：

```text
RuntimeHosting can create Runner
!= RuntimeHosting owns Runtime lifecycle authority

Supervisor can report exit
!= Supervisor decides Frame unwind

RuntimeControlBinding can provide carrier
!= Binding owns protocol state

DataConnectionBroker can provision carrier
!= Broker owns DataAuthority generation/profile
```

必须继续保持：

```text
Protocol boundary
!= Platform port boundary
!= npm package boundary
!= process boundary
!= capability lifetime
```

---

## 14. Composition Example

目标 composition 形态：

```ts
const runtimeHosting = createHostraRuntimeHosting(...);
const runtimeControlHost = createHostraRuntimeControlHost(...);

const main = createMain({
  runtimeHosting,
  runtimeControlHost,
});
```

Runner 侧：

```ts
const runtimeControl = createHostraRuntimeControlBinding(...);

await runSubsystem({
  definition,
  platform: {
    runtimeControl,
    runtimePolicy,
  },
  launch,
});
```

上面只说明依赖方向；exact API 尚未冻结。

PWA composition 应使用相同 abstract capability contracts，但注入不同 concrete implementations。

---

## 15. M4 前的收口目标

在 M4 真正编码前，本包至少需要冻结 M4 的最小 slice：

```text
RuntimeControlBinding
RuntimeControlPolicy ownership
carrier/scheduler/deadline lifetime
failure/abort semantics
```

随后 `@loomrealm/subsystem`：

```text
consumes platform-ports
consumes runtime-control internally
publishes business Runtime/Frame SDK
```

M4 不等待 M7/M8/M12 ports。

---

## 16. M5 前的收口目标

M5 开始前再冻结 Main 所需：

```text
RuntimeHosting
Supervisor fact stream / observation model
RuntimeControlHost
LaunchAttemptMaterial boundary
terminate semantics
```

不要在 M4 PR 中为了 M5 猜 exact shape。

---

## 17. Conformance Direction

本包未来的测试重点不是测试 Hostra/PWA API 本身，而是验证 contract 可替换性。

候选测试：

```text
fake Hostra-like implementation
fake PWA-like implementation
        ↓
same Core consumer scenario
        ↓
same abstract observable semantics
```

并验证：

```text
Core packages do not import Node/DOM/platform launchers
Platform implementations do not acquire Core application authority
one capability lifetime does not silently imply another capability lifetime
```

---

## 18. Non-goals

当前草案明确不做：

```text
完整 Platform API 一次冻结
Platform service locator
统一 Hostra/PWA physical topology
统一 launcher manifest
transport abstraction framework
filesystem/browser compatibility layer
generic dependency injection container
generic lifecycle/event bus
all future ports stub implementation
```

---

## 19. Proposed Milestone Position

建议把本包看成 M4 前的一个很小的 architecture foundation closure，而不是新的大型产品 milestone：

```text
M3 Runtime Control mechanics
        ↓
Platform Ports minimal contract foundation
        ↓
M4 Subsystem first consumer
        ↓
M5 Main second consumer
        ↓
M6 Hostra first concrete runtime realization
        ↓
...
M15 PWA second concrete realization
```

它的成功标准不是“接口很多”，而是：

> **让 platform-neutral Core 和 concrete Platform realization 之间只有一份明确、窄、可替换的 capability contract。**

---

## 20. Final Draft Invariants

1. `@loomrealm/platform-ports` 只定义平台能力契约，不实现平台；
2. `@loomrealm/main` / `@loomrealm/subsystem` 消费 ports，不拥有 Hostra/PWA implementation；
3. Hostra/PWA adapters 实现 ports，composition root 负责实例化与注入；
4. 不存在万能 `Platform` service locator；
5. capability 按真实 milestone / consumer 增长，不预建未来接口；
6. M4 只冻结 Subsystem Runtime Control 所需最小 ports；
7. M5 再冻结 Main Runtime Hosting/Control 所需 ports；
8. Launcher 仍是窄 Runtime-product capability，不变成 Platform mega-package；
9. physical mechanism 可平台特有，abstract capability semantics 必须一致；
10. Platform capability 不拥有 Main/Subsystem application authority；
11. Protocol lifetime、carrier lifetime、platform capability lifetime继续分离；
12. 当前 package public API 保持空，直到第一个真实 M4 contract freeze。
