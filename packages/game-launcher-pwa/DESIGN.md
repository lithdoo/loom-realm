# `@loomrealm/game-launcher-pwa` 设计

> 状态：Implementation Planning / Boundary Frozen  
> 阶段：M15 PWA launch planning / RuntimeHosting / Worker Runner integration  
> 最近复核：2026-08-28  
> 目标：成为 concrete PWA Platform 内部的 Game PREPARE / Worker Runner integration component：内部消费 `@loomrealm/game-package`，闭合 PWA Game + executable PREPARE，产出 immutable `PwaLaunchPlan` + Main-facing logical bootstrap；long-lived Main-facing capabilities 由 session-scoped PwaPlatform instance 暴露。  
> 正式契约：[PWA Game Launcher / Worker Subsystem Runner Profile v1](../../doc/15-contracts/pwa-launcher-profile-v1.md)  
> 消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../doc/decisions/0026-session-scoped-platform-instance.md)

核心原则：

> **这是 PwaPlatform 的 Game PREPARE / Worker Runner integration component，不是 PWA Platform 本身。Product bootstrap caller 面向 session-scoped PwaPlatform；PwaPlatform 内部调用本包，本包内部调用 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**

---

## 1. Package Position

```text
apps/pwa / product entry
        ↓
PwaPlatform.prepareGame(source)
        ↓
@loomrealm/game-launcher-pwa component
    ├── @loomrealm/game-package parse/validate
    ├── PWA manifest validator
    ├── exact key-set join
    ├── installation/origin resolver/security preflight
    ├── immutable PwaLaunchPlan
    ├── LogicalGameBootstrap projection
    └── Worker Runner/supervision integration primitives
        ↓
PreparedPwaGame { logicalBootstrap, launchPlan }
        ↓
PwaPlatform.prepareGame installs plan
        ↓
apps/pwa passes the same PwaPlatform to Main
```

Dependencies MAY include：

```text
@loomrealm/game-package
@loomrealm/subsystem/host
@loomrealm/foundation
@loomrealm/transport-messageport
```

MUST NOT be depended on by `@loomrealm/main` or business packages。

---

## 2. Owned Surface

本包拥有：

```text
PWA Game Entry consumption orchestration
PwaLaunchManifestV1 schema/parser
PWA executable logical module syntax
installation registry / same-origin module resolution
exact Game↔PWA key join
immutable PwaLaunchPlan
Main-facing LogicalGameBootstrap projection
PwaLaunchPlan production + plan-consumer primitives for concrete PwaPlatform RuntimeHosting
Host-owned Worker Runner/bootstrap integration
Worker supervision adapter
Runner provisioning integration surface
```

不拥有：

```text
Game Entry common schema authority
Main Frame/Runtime authority
DataAuthority generation/profile
full DataConnectionBroker policy
Renderer Hosting
Content semantics
business Definition behavior
```

Common Game schema仍由 `@loomrealm/game-package` 定义；本包只是其主要 Runtime-product consumer。

---

## 3. Public Bootstrap Shape

标准 Runtime-product caller 面向 `PwaPlatform.prepareGame(...)`，不应被迫先构造 `ValidatedGameEntryV1`。下列 low-level Launcher API 是 `PwaPlatform` 内部 integration surface，也可用于 tooling/test。

首批 API方向：

```ts
interface PreparedPwaGame {
  readonly logicalBootstrap: LogicalGameBootstrap;
  readonly launchPlan: PwaLaunchPlan;
}

async function preparePwaGame(
  options: PwaPrepareOptions,
): Promise<PreparedPwaGame>;
```

`preparePwaGame` exact Game acquisition/installation shape在 M15 随真实 PWA installation integration 冻结；现在冻结的是：

```text
PwaPlatform supplies PWA source/installation capability to Launcher component
launcher obtains Game Entry
launcher invokes @loomrealm/game-package
product caller does not orchestrate common validation or call Game Package manually
```

不得为了 Hostra/PWA相似预建 universal `GameSource` / `PreparedPlatformGame` package。

---

## 4. Manifest

```ts
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

`module` 只能选择 selected installation 内 PWA business artifact。

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

## 5. PREPARE → COMMIT

### PREPARE

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ PWA manifest validate
→ exact key join
→ resolve all installation modules
→ validate origin/security/Worker capability
→ freeze PwaLaunchPlan
→ project/freeze LogicalGameBootstrap
→ return PreparedPwaGame to PwaPlatform
```

PREPARE failure：

```text
zero business Runtime Worker
zero Definition Module import
zero Runtime Control
```

### COMMIT

```text
apps/pwa creates one PwaPlatform
→ PwaPlatform.prepareGame(source) delegates PREPARE to this package
→ PwaPlatform installs immutable PwaLaunchPlan
→ apps/pwa runs Main(logicalBootstrap, same PwaPlatform)
→ Main launch(subsystemKey) through PwaPlatform.runtimeHosting
→ plan lookup
→ Launch Attempt
→ create Host-owned Worker Runner
```

---

## 6. `LogicalGameBootstrap`

Main-facing projection仅含：

```text
subsystemKeys
initial {subsystemKey,input}
```

MUST NOT contain：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
PwaLaunchPlan
module/moduleUrl
Worker/Runner/Port data
```

Projection应 immutable，保持 exact key与 business input semantics。

---

## 7. RuntimeHosting

Main-facing PWA RuntimeHosting 由 session-scoped PwaPlatform 暴露，并消费该 Platform instance 在 `prepareGame()` 时安装的 frozen plan。`PreparedPwaGame` 不再携带独立 long-lived RuntimeHosting object。

Main-facing launch只接受：

```text
subsystemKey
Launch Attempt material
```

不得让 Main传：

```text
game
manifest
module URL
Worker options
MessagePort
```

---

## 8. Worker Runner

Host-owned Worker Runner 是 Dedicated Worker constructor entry。

```text
bootstrap validation
→ verify planned key/binding
→ import exact planned module
→ validate SubsystemDefinitionFactory
→ RuntimeControlBinding
→ SubsystemDataBinding
→ ContentClient
→ runSubsystem
```

Business Definition Module 不是 Worker entry，也不寻找 bootstrap Port。

---

## 9. MessagePort Boundary

Runtime Control/Data 建立后统一暴露：

```text
MessageCarrier
```

Application unit：

```text
postMessage(string)
= one UTF-8 JSON text string
```

Structured Clone 只用于 bootstrap/provisioning/Port transfer。

---

## 10. Provisioning Integration

DataConnectionBroker仍由 PWA composition协调。

本包只提供 target Worker provisioning path：

```text
Broker current S/G/P
→ create MessageChannel
→ transfer endpoint through Runner provisioning
→ SubsystemDataBinding
```

本包不 mint generation/profile，不把 transfer failure解释成 Runtime/Frame failure。

---

## 11. Error Domains

至少区分：

```text
GamePackageError
PWA manifest/join/preflight error
module resolution/security policy
Worker creation/supervision
module load/ABI
Runtime Control bootstrap
platform provisioning
```

Common Game error可作为 Launcher PREPARE failure的 cause/typed domain暴露，但不得折叠成 PWA module error。

---

## 12. Tests

```text
prepare accepts PWA Game source without caller Game Package step
Game validation failure occurs before Worker side effect
manifest closed schema
exact key-set join
all modules resolved before Worker creation
external URL/traversal rejection
same-origin/installation resolution
host policy not game-controlled
logicalBootstrap has no formatVersion/module/Port
Main package not required to import launcher/game-package
Main launch has no module
Host-owned Worker Runner is constructor entry
planned module imported exactly
postMessage(string) Control
created/connected/identified/ready distinction
unexpected termination/no-auto-restart
provisioning distinct from Runtime Control/Data
Data transfer failure domain
```

M15 是 `@loomrealm/game-package` 第二个真实 Runtime-product consumer qualification。

---

## 13. Package Boundary Guard

MUST NOT扩张为：

```text
PWA Renderer mega-package
PWA DataAuthority owner
PWA Content product
Service Worker abstraction总包
all-platform launcher registry
universal Game source abstraction
```

完整产品仍由 `apps/pwa` composition root组装。

---

## 14. Final Invariants

1. Product bootstrap caller创建并调用 session-scoped PwaPlatform，不手动编排 Game Package；
2. PwaPlatform内部使用 PWA Launcher component；Launcher内部消费 `@loomrealm/game-package`；
3. Game/PWA key set严格 join；
4. PwaLaunchPlan + LogicalGameBootstrap在 first Worker side effect前闭合；
5. Main不依赖 Game Package/concrete Launcher；Main 只消费 PwaPlatform 的 Main-facing narrow view；
6. Main只传 subsystemKey；
7. Host policy不可由 Game/Platform config覆盖；
8. Worker Runner是 constructor entry，business module由 Runner import；
9. provisioning与 application protocol分离；
10. package不拥有 Main/DataAuthority/Renderer/Content semantics；
11. 与 Hostra launcher只共享 logical contracts/ports，不共享万能 config/prepared schema。
