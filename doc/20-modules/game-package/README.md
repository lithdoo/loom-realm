# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Game Entry / logical Descriptor Loader、Catalog、Repository、资源与 common Validator 的模块边界，以及与 Platform Launch Planner 的连接边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)  
> Hostra realization：[Hostra Game Launcher / Node Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> PWA realization：[PWA Game Launcher / Worker Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)  
> 最近复核：2026-08-20

> [!NOTE]
> 本文描述较宽的 **Game Installation / Package 模块协作**；它不等于单个 npm package 边界。`@loomrealm/game-package` 的公开职责以 [`packages/game-package/DESIGN.md`](../../../packages/game-package/DESIGN.md) 与 [独立分包与发布架构](../../30-implementation/package-architecture.md) 为准，当前只包含 common Game Entry model/parse/validation。

## 1. 建议模块

```text
Game Installation / Package concern
├── Common Game Entry Loader / Validator
├── Logical Topology Registry Builder
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package-level Validation Coordination
```

Executable Definition Module Resolver不属于 common Game Package；它分别由 current Platform Launcher/Profile拥有。

Game Package模块不创建 Process/Worker，不打开 Control/Data连接，也不选择 Hostra/PWA Runner。

---

## 2. Game Entry / Descriptor Model

Game Package v1：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: {
    readonly subsystem: string;
    readonly input: JsonValue;
  };
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

其中：

```text
key
    application Subsystem identity

initial.subsystem
    initial Frame logical target

initial.input
    platform-neutral initial business input
```

以下已从 common Game Package移出：

```text
module
launcher.type
launcher.entry
env
Node/Worker options
Transport/bootstrap material
```

---

## 3. Common Validator

负责：

```text
JSON/common value validation
closed Game Entry schema
formatVersion == 1
closed initial schema
initial.input JsonValue
closed Descriptor schema
key validity / uniqueness
initial target reference
```

Game common validation必须：

```text
pure/deterministic
no filesystem module lookup
no Fetch module lookup
no business module import
no Runtime side effect
```

不负责：

```text
Hostra/PWA binding completeness
module path syntax/existence/containment
Definition Module ABI
Node executable
Worker constructor
Process/Worker creation
Runtime bootstrap token
Control/Data carrier
```

---

## 4. Platform Launch Planner Boundary

Common Game Package输出：

```text
ValidatedGameEntryV1
```

随后 current Platform各自处理：

```text
Hostra
    ValidatedGameEntry
    + launch.hostra.json
    → exact key-set join
    → safe filesystem module resolution
    → HostraLaunchPlan

PWA
    ValidatedGameEntry
    + launch.pwa.json
    → exact key-set join
    → installation/same-origin module resolution
    → PwaLaunchPlan
```

Common Game Package不提供 `resolveModule()` / `createRuntime()` / universal `PlatformLaunchOptions`。

---

## 5. Zero-side-effect Closure

完整 Session preflight由 Platform Composition协调：

```text
Game common validation
→ current Platform manifest validation
→ exact key join
→ all executable resolution/capability checks
→ immutable PlatformLaunchPlan
────────────────────────────────────────
first Runtime side effect
```

Game common validation失败时零 Runtime side effect；Platform preflight failure也必须零 Runtime side effect。

不能通过“边读 Descriptor边启动 Runtime”破坏该 invariant。

---

## 6. Definition Module ABI Boundary

Definition Module不再是 Game Package identity字段。

每个 Platform LaunchPlan选定的 `.mjs` module必须由 Host-owned Runner加载，并 default export `@loomrealm/subsystem` 可接受的 `SubsystemDefinitionFactory`。

Game Package只知道 logical key，不验证 Definition Module ABI。

```text
same key
    Hostra → artifact A
    PWA    → artifact B
```

A/B可以相同也可以不同，但必须满足统一 Subsystem author/host contract和 observable semantics。

---

## 7. Safe Installation Namespace

安全 executable module resolution与 ordinary Content path policy是不同能力：

```text
Platform Executable Module Resolver
    may resolve selected business executable module

Readonly Content API
    reads logical content only
```

可以复用底层 safe installation/path primitive，但不得因为 Platform可执行 module就扩大 Content客户端权限。

Executable path/URL只允许存在于 Platform-private LaunchPlan/Runner realization，不进入 Game Descriptor或业务状态。

---

## 8. Manifest / Entry Loader

Game Entry Loader负责读取/校验真正跨平台的 common fields：

```text
formatVersion
initial target/input
complete subsystems[] key set
```

它不解释 map/battle等业务私有结构，不解析 Hostra/PWA launch manifest，不创建 Runtime。

文件 `game.json`是当前 installation convention；`@loomrealm/game-package` API应可以对 JSON text/value工作，不把 filesystem当成 contract authority。

---

## 9. Catalog / Repository

Catalog建立 logical ID → validated content location index；Repository提供 async readonly fetch、parse/local validation、same-ID concurrent dedup、immutable cache、close/cancel。

这些是 broader Game Installation/Content concern，不自动意味着它们属于 `@loomrealm/game-package` npm package。

它们无论最终落在哪个 package，都不得承担 Subsystem executable module resolution。

---

## 10. Resource Metadata

只处理 logical resource metadata、MIME、Content Version、Package Index。资源 body由 Content API交付。

Render State只携 logical resource reference，不携 physical module/content path。

---

## 11. Package Validator Coordination

Common portion：

```text
Game Entry
→ closed schema
→ format version
→ duplicate/invalid key
→ initial target/input
→ content/catalog common validation as applicable
```

Platform-specific executable portion：

```text
Platform Launch Manifest
→ exact Game key join
→ current-platform module validation/resolution
→ hosting capability checks
```

两个阶段由 Platform Composition在 Session bootstrap前串成完整 preflight，但 authority owner明确分开。

---

## 12. Cross-platform Boundary

同一 common Game Entry：

```json
{
  "formatVersion": 1,
  "initial": {
    "subsystem": "loom.map",
    "input": null
  },
  "subsystems": [
    { "key": "loom.map" }
  ]
}
```

可以同时作为：

```text
Hostra Launch Planner input
PWA Launch Planner input
```

但两个平台的 executable manifest和 Definition Module artifact可以不同。

Game Package不维护 Desktop/PWA两套 logical Descriptor。

---

## 13. Trust Boundary

```text
validated Game key
!= executable capability

validated Platform module resolution
!= executable sandbox
```

Desktop Node业务 module仍属于 trusted executable code；PWA Worker有不同物理隔离。签名/Publisher Trust/untrusted sandbox不在 Phase 1。

Game common config无法通过 module/path/URL字段获得任意执行能力。

---

## 14. Tests

至少覆盖：

```text
manifest/entry valid-invalid
formatVersion
initial JsonValue
duplicate/empty descriptor key
undeclared initial target
closed descriptor schema
module/launcher/env/platform fields rejected from common Game Entry
common validation no I/O/module import
same ValidatedGameEntry feeds Hostra/PWA planners
platform missing/extra key rejected by platform join
full preflight failure has zero Runtime side effects
catalog does not eagerly read large bodies
repository concurrent dedup
validate aggregates common errors
executable module cannot be fetched as arbitrary Content capability
```

---

## 15. Core Invariants

- Game Entry一次性声明完整 logical Subsystem key set；
- Descriptor identity=`key`；
- Descriptor v1精确=`{key}`；
- common Game Entry包含 initial target/input，不含 executable binding；
- `module`属于 current Platform Launch Manifest，不属于 Game Package；
- `@loomrealm/game-package`只实现 common model/parse/validation，不自动吞入 Catalog/Repository；
- Game Package不声明 Node/Worker/env/argv/transport；
- common package不执行 Definition Module ABI/module resolution；
- full Game+Platform preflight先于任何 Runtime side effect；
- Main launch只使用 logical key；
- Definition Module与 Host-owned Runtime Runner分离；
- Module executable capability与 Content capability分离；
- physical target不进入业务协议；
- Hostra/PWA可以为同一 key选择不同 artifact，但必须实现统一 Subsystem ABI/semantics。
