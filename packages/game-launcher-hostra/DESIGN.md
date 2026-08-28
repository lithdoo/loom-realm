# `@loomrealm/game-launcher-hostra` 设计

> 状态：Implementation Planning / Boundary Frozen  
> 阶段：M6 Hostra launch planning / RuntimeHosting / Runner integration  
> 最近复核：2026-08-20  
> 目标：成为 concrete Hostra Platform 内部的 Game PREPARE / Runner integration component：内部消费 `@loomrealm/game-package`，闭合 Hostra Game + executable PREPARE，产出 immutable `HostraLaunchPlan` + Main-facing logical bootstrap；long-lived Main-facing capabilities 由 session-scoped HostraPlatform instance 暴露。  
> 正式契约：[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../doc/15-contracts/nodejs-launcher-profile-v1.md)  
> 消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)

核心原则：

> **这是 HostraPlatform 的 Game PREPARE / Runner integration component，不是 Hostra Platform 本身。Product bootstrap caller 面向 session-scoped HostraPlatform；HostraPlatform 内部调用本包，本包内部调用 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**

---

## 1. Package Position

```text
Hostra game source / installation
        ↓
@loomrealm/game-launcher-hostra
    ├── @loomrealm/game-package parse/validate
    ├── Hostra manifest validator
    ├── exact key-set join
    ├── module resolver/security preflight
    ├── immutable HostraLaunchPlan
    ├── LogicalGameBootstrap projection
    ├── immutable HostraLaunchPlan
    └── Node Runner/supervision integration primitives
        ↓
PreparedHostraGame { logicalBootstrap, launchPlan }
        ↓
HostraPlatform.prepareGame installs plan
        ↓
apps/desktop passes the same HostraPlatform to Main
```

Dependencies MAY include：

```text
@loomrealm/game-package
@loomrealm/subsystem/host
@loomrealm/foundation
@loomrealm/launcher-node          when justified
@loomrealm/transport-websocket   as required
```

MUST NOT be depended on by `@loomrealm/main` or business packages。

---

## 2. Owned Surface

本包拥有：

```text
Hostra Game Entry consumption orchestration
HostraLaunchManifestV1 schema/parser
Hostra module logical syntax
installation executable resolution
exact Game↔Hostra key join
immutable HostraLaunchPlan
Main-facing LogicalGameBootstrap projection
HostraLaunchPlan production + plan-consumer primitives for concrete HostraPlatform RuntimeHosting
Node Runner/bootstrap integration
process supervision adapter
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

调用者不应被迫先构造 `ValidatedGameEntryV1`。

首批 API方向：

```ts
interface HostraGameSource {
  // exact acquisition representation is installation/product integration,
  // not a universal Game Package source abstraction.
}

interface PreparedHostraGame {
  readonly logicalBootstrap: LogicalGameBootstrap;
  readonly launchPlan: HostraLaunchPlan;
}

async function prepareHostraGame(
  options: HostraPrepareOptions,
): Promise<PreparedHostraGame>;
```

`prepareHostraGame` exact source/acquisition details在 M6 随真实 Desktop installation integration 冻结；现在冻结的是 responsibility：

```text
caller supplies Hostra source/installation capability
launcher obtains Game Entry
launcher invokes @loomrealm/game-package
caller does not orchestrate common validation manually
```

不得为了 Hostra/PWA相似而预建 universal `GameSource` / `PreparedPlatformGame` package。

---

## 4. Manifest

```ts
interface HostraLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly {
    readonly key: string;
    readonly module: string;
  }[];
}
```

Manifest 只选择 installation 内 Hostra business implementation artifact。

MUST NOT configure：

```text
Node executable
Runner entry
shell/argv
arbitrary env
bootstrap token
Control endpoint
Data ticket
```

Host-owned policy通过 trusted dependencies/options注入。

---

## 5. PREPARE → COMMIT

### PREPARE

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ Hostra manifest validate
→ exact key join
→ resolve all modules / containment
→ validate Hostra runtime capability
→ freeze HostraLaunchPlan
→ project/freeze LogicalGameBootstrap
→ return PreparedHostraGame to HostraPlatform
```

PREPARE failure：

```text
zero business Runtime process
zero Definition Module import
zero Runtime Control
```

### COMMIT

```text
apps/desktop creates one HostraPlatform
→ HostraPlatform.prepareGame(source) delegates PREPARE to this package
→ HostraPlatform installs immutable HostraLaunchPlan
→ apps/desktop runs Main(logicalBootstrap, same HostraPlatform)
→ Main launch(subsystemKey) through HostraPlatform.runtimeHosting
→ plan lookup
→ Launch Attempt
→ spawn Runner
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
HostraLaunchPlan
module/path
Node/Runner/process data
```

Projection应 immutable，保持 exact key与 business input semantics。

---

## 7. RuntimeHosting

Main-facing Hostra RuntimeHosting 由 session-scoped HostraPlatform 暴露，并消费该 Platform instance 在 `prepareGame()` 时安装的 frozen plan。`PreparedHostraGame` 不再携带独立 long-lived RuntimeHosting object。

Main-facing launch只接受：

```text
subsystemKey
Launch Attempt material
```

不得让 Main传：

```text
game
manifest
module
physical path
Node flags
```

---

## 8. Runner

Host-owned Runner是 Node process唯一 argv entry。

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

Business Definition Module不是 launcher/entry policy。

---

## 9. Provisioning Integration

DataConnectionBroker仍属于 Platform Composition。

本包只提供 target Runner provisioning integration，使 composition可以：

```text
Broker current S/G/P
→ Hostra runner provisioning integration
→ endpoint/ticket
→ Runner
→ SubsystemDataBinding
```

本包 MUST NOT mint generation/profile，也不得把 provisioning failure升级为 Frame failure。

---

## 10. Error Domains

至少区分：

```text
GamePackageError
Hostra manifest/join/preflight error
module resolution error
process launch/supervision error
module load/ABI error
Runtime Control bootstrap error
platform provisioning error
```

Common Game error可作为 Launcher PREPARE failure的 cause/typed domain暴露，但不得被误映射成 Platform module error。

---

## 11. Tests

```text
prepare accepts raw/current Hostra Game source without caller Game Package step
Game validation failure occurs before Hostra side effect
manifest closed schema
exact key-set join
all modules resolved before spawn
symlink/containment rejection
host policy not game-controlled
logicalBootstrap has no formatVersion/module
Main package not required to import launcher/game-package
Main launch has no module
Runner is process entry
planned module imported exactly
spawn/connected/identified/ready distinction
unexpected exit/no-auto-restart
provisioning distinct from Runtime Control
Data provision failure domain
```

M6 是 `@loomrealm/game-package` 第一个真实 Runtime-product consumer qualification。

---

## 12. Package Boundary Guard

MUST NOT扩张为：

```text
Hostra Renderer mega-package
Hostra DataConnectionBroker authority
Hostra Content product
Hostra Shell abstraction
all-platform launcher registry
universal Game source abstraction
```

完整产品仍由 `apps/desktop` composition root组装。

---

## 13. Final Invariants

1. Product bootstrap caller创建并调用 session-scoped HostraPlatform，不手动编排 Game Package；
2. HostraPlatform内部使用 Hostra Launcher component；Launcher内部消费 `@loomrealm/game-package`；
3. Game/Hostra key set严格 join；
4. HostraLaunchPlan + LogicalGameBootstrap在 first Runtime side effect前闭合；
5. Main不依赖 Game Package/concrete Launcher；Main 只消费 HostraPlatform 的 Main-facing narrow view；
6. Main只传 subsystemKey；
7. Host policy不可由 Game/Platform config覆盖；
8. Runner是 process entry，business module由 Runner import；
9. provisioning capability与 application protocols分离；
10. package不拥有 Main/DataAuthority/Renderer/Content semantics；
11. 与 PWA launcher只共享 logical contracts/ports，不共享万能 config/prepared schema。
