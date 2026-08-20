# `@loomrealm/game-launcher-pwa` 设计草案

> 状态：Draft  
> 阶段：Package boundary / PWA launch planning / RuntimeHosting / Worker Runner integration  
> 最近复核：2026-08-20  
> 目标：拥有 PWA 的 Game Launch Manifest、preflight LaunchPlan 与 Worker Subsystem Runtime launch/supervision 实现，同时保持 Main 与业务 Subsystem platform-neutral。  
> 正式契约：[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../doc/15-contracts/pwa-launcher-profile-v1.md)

核心原则：

> **这是 PWA Subsystem Runtime launch capability package，不是 PWA Platform mega-package。它拥有 PWA 如何绑定并启动 Subsystem，但不拥有 Renderer/DataAuthority/Content application semantics。**

---

## 1. Package Position

```text
ValidatedGameEntryV1
        +
launch.pwa.json
        ↓
@loomrealm/game-launcher-pwa
    manifest validator
    key-set join
    installation module resolver
    PwaLaunchPlan
    RuntimeHosting
    Worker Runner integration
        ↓
@loomrealm/subsystem/host
```

可消费：

```text
@loomrealm/game-package
@loomrealm/subsystem/host
@loomrealm/foundation
@loomrealm/transport-messageport
```

不得被 `@loomrealm/main` 或 business package反向依赖。

---

## 2. Owned Surface

本包拥有：

```text
PwaLaunchManifestV1 schema/parser
PWA executable logical module syntax
installation registry / same-origin module resolution
exact Game↔PWA key join
immutable PwaLaunchPlan
Main-facing RuntimeHosting implementation
Host-owned Worker Runner/bootstrap integration
Worker supervision adapter
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
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

`module` 只能选择当前 validated installation 内的 PWA business implementation artifact。

禁止配置：

```text
Worker Runner entry
arbitrary Worker URL/options
MessagePort/bootstrap credential
Service Worker/CSP policy
external executable URL
```

这些属于 Host-owned policy/dependencies。

---

## 4. Parse → Plan → Commit

固定：

```text
PREPARE
Game validate
→ PWA manifest validate
→ exact key join
→ resolve all installation modules
→ validate Worker/MessageChannel capabilities
→ freeze PwaLaunchPlan

COMMIT
Main launch(subsystemKey)
→ RuntimeHosting plan lookup
→ Launch Attempt
→ create Host-owned Worker Runner
```

任何 PREPARE failure：

```text
zero business Runtime Worker
zero Definition Module import
zero Runtime Control
```

---

## 5. RuntimeHosting

候选：

```ts
createPwaRuntimeHosting({
  game,
  launchManifest,
  installation,
  workerPolicy,
  runnerEntry,
  controlHost,
  provisioningHost,
})
```

构造/prepare阶段持有 immutable plan；Main-facing launch只接受 `subsystemKey` 与 Launch Attempt material。

Main不见 module URL/Worker options/Port。

---

## 6. Runner

Host-owned Worker Runner是 Dedicated Worker constructor entry。

Runner：

```text
bootstrap validation
→ import exact planned module
→ validate SubsystemDefinitionFactory
→ RuntimeControlBinding
→ SubsystemDataBinding
→ ContentClient
→ runSubsystem
```

业务 module不是 Worker entry，也不寻找 platform Port。

---

## 7. MessagePort Boundary

Runtime Control/Data建立后统一暴露：

```text
MessageCarrier<string>
```

application unit：

```text
postMessage(string)
= one UTF-8 JSON text string
```

Structured Clone只用于 bootstrap/provisioning/Port transfer。

---

## 8. Provisioning Integration

DataConnectionBroker仍由 PWA composition协调。

本包提供 target Worker Runner 的 provisioning path，使 composition可：

```text
Broker current S/G/P
→ create MessageChannel
→ transfer one endpoint through Runner provisioning
→ SubsystemDataBinding
```

本包不 mint G/P，不把 transfer failure解释成 Runtime/Frame failure。

---

## 9. Error Domains

至少区分：

```text
manifest/join/preflight
module resolution/security policy
Worker creation/supervision
module load/ABI
Runtime Control bootstrap
platform provisioning
```

不得折叠成 `GAME_PACKAGE_INVALID`。

---

## 10. Tests

```text
manifest closed schema
exact key-set join
all modules resolved before Worker creation
external URL/traversal rejection
same-origin/installation resolution
host policy not game-controlled
Main launch has no module
Host-owned Worker Runner is constructor entry
planned module imported exactly
postMessage(string) Control
created/connected/identified/ready distinction
unexpected termination/no-auto-restart
provisioning distinct from Runtime Control/Data
Data transfer failure domain
```

---

## 11. Package Boundary Guard

MUST NOT扩张为：

```text
PWA Renderer mega-package
PWA DataAuthority owner
PWA Content product
Service Worker abstraction总包
all-platform launcher registry
```

全产品仍由 `apps/pwa` composition root组装。

---

## 12. Final Invariants

1. PWA manifest独立于 common Game Entry；
2. Game/PWA key set严格 join；
3. LaunchPlan先完整闭合再产生 Worker side effect；
4. Main只传 subsystemKey；
5. Host policy不可由 game config覆盖；
6. Worker Runner是 constructor entry，business module由 Runner import；
7. provisioning与 application protocol分离；
8. package不拥有 Main/DataAuthority/Renderer/Content application semantics；
9. 与 Hostra launcher只共享 logical identity/ports，不共享万能配置 schema。
