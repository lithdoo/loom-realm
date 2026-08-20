# `@loomrealm/game-launcher-hostra` 设计草案

> 状态：Draft  
> 阶段：Package boundary / Hostra launch planning / RuntimeHosting / Runner integration  
> 最近复核：2026-08-20  
> 目标：拥有 Hostra 的 Game Launch Manifest、preflight LaunchPlan 与 Node Subsystem Runtime launch/supervision 实现，同时保持 Main 与业务 Subsystem platform-neutral。  
> 正式契约：[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../doc/15-contracts/nodejs-launcher-profile-v1.md)

核心原则：

> **这是“Subsystem Runtime launch capability package”，不是 Hostra Platform mega-package。它拥有 Hostra 如何绑定并启动 Subsystem，但不拥有 Renderer/DataAuthority/Content application semantics。**

---

## 1. Package Position

```text
ValidatedGameEntryV1
        +
launch.hostra.json
        ↓
@loomrealm/game-launcher-hostra
    manifest validator
    key-set join
    module resolver
    LaunchPlan
    RuntimeHosting
    Node Runner integration
        ↓
@loomrealm/subsystem/host
```

它可以消费：

```text
@loomrealm/game-package
@loomrealm/subsystem/host
@loomrealm/foundation
@loomrealm/launcher-node          when implemented
@loomrealm/transport-websocket   as required
```

不得被 `@loomrealm/main` / business package反向依赖。

---

## 2. Owned Surface

本包拥有：

```text
HostraLaunchManifestV1 schema/parser
Hostra module logical syntax
Installation Root executable resolution
exact Game↔Hostra key join
immutable HostraLaunchPlan
Main-facing RuntimeHosting implementation
Node Runner entry/bootstrap integration
process supervision adapter
Runner provisioning integration surface
```

不拥有：

```text
Game logical topology
Main Frame/Runtime authority
DataAuthority generation/profile
DataConnectionBroker policy
Renderer Hosting
Content semantics
business Definition behavior
```

---

## 3. Manifest

```ts
interface HostraLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

配置只允许选择 installation 内 Hostra business implementation artifact。

禁止从 game-supplied manifest配置：

```text
Node executable
Runner entry
shell/argv
arbitrary env
bootstrap token
Control endpoint
Data ticket
```

这些通过 Host-owned policy/dependencies注入。

---

## 4. Parse → Plan → Commit

固定两阶段：

```text
PREPARE
Game validate
→ Hostra manifest validate
→ exact key join
→ resolve all modules
→ validate Hostra capability
→ freeze HostraLaunchPlan

COMMIT
Main launch(subsystemKey)
→ RuntimeHosting plan lookup
→ Launch Attempt
→ spawn Runner
```

任何 PREPARE failure：

```text
zero business Runtime process
zero Definition Module import
zero Runtime Control
```

这是 package最重要的 transaction boundary。

---

## 5. RuntimeHosting

候选构造：

```ts
createHostraRuntimeHosting({
  game,
  launchManifest,
  installation,
  nodePolicy,
  runnerEntry,
  controlHost,
  provisioningHost,
})
```

构造期间完成 preflight并持有 immutable plan；Main-facing launch API只接受 subsystemKey/Launch Attempt material。

不得让 Main传 `module`。

---

## 6. Runner

Host-owned Runner是 Node process唯一 argv entry。

Runner内部：

```text
bootstrap validation
→ import planned module
→ validate SubsystemDefinitionFactory
→ RuntimeControlBinding
→ SubsystemDataBinding
→ ContentClient
→ runSubsystem
```

Definition Module是 business implementation，不是 launcher implementation。

---

## 7. Provisioning Integration

DataConnectionBroker仍属于 Platform Composition。

本包只提供目标 Runner 的 Platform-local provisioning sink/source，使 composition可以：

```text
Broker current S/G/P
→ Hostra runner provisioning integration
→ endpoint/ticket
→ Runner
→ SubsystemDataBinding
```

本包 MUST NOT mint G/P，也不得把 provisioning failure升级为 Frame failure。

---

## 8. Error Domains

至少区分：

```text
manifest/join/preflight error
module resolution error
process launch/supervision error
module load/ABI error
Runtime Control bootstrap error
platform provisioning error
```

不要把它们折叠成一个 `GAME_PACKAGE_INVALID`。

---

## 9. Tests

```text
manifest closed schema
exact key-set join
all modules resolved before spawn
symlink/containment rejection
host policy not game-controlled
Main launch has no module
Runner is process entry
planned module imported exactly
spawn/connected/identified/ready distinction
unexpected exit/no-auto-restart
provisioning distinct from Runtime Control
Data provision failure domain
```

---

## 10. Package Boundary Guard

本包存在的理由是 Hostra launch config + startup semantics本身是稳定、独立、可测试 capability。

它 MUST NOT扩张为：

```text
Hostra Renderer mega-package
Hostra DataConnectionBroker authority
Hostra Content product
Hostra Shell abstraction
all-platform launcher registry
```

全产品仍由 `apps/desktop` composition root组装。

---

## 11. Final Invariants

1. Hostra manifest独立于 common Game Entry；
2. Game/Hostra key set严格 join；
3. LaunchPlan先完整闭合再产生 Runtime side effect；
4. Main只传 subsystemKey；
5. Host policy不可由 game config覆盖；
6. Runner是 process entry，business module由 Runner import；
7. provisioning capability与 application protocols分离；
8. package不拥有 Main/DataAuthority/Renderer/Content application semantics；
9. 与 PWA launcher只共享 logical ports/identity，不共享万能配置 schema。
