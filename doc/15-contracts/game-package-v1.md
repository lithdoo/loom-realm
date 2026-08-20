# LoomRealm Game Package v1 Logical Topology Contract

> 层级：正式契约  
> 状态：Active / Normative  
> 契约版本：1  
> 稳定程度：Stabilizing  
> 主要定义：Game Entry 的 platform-neutral 公共字段、Subsystem logical topology、初始 Frame target、集合级校验与 Platform Launch Manifest 连接边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> Hostra realization：[Hostra Game Launcher / Node Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md)  
> PWA realization：[PWA Game Launcher / Worker Subsystem Runner Profile v1](./pwa-launcher-profile-v1.md)  
> 最近复核：2026-08-20

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> 当前 v1 直接移除旧 `SubsystemDescriptor {key,module}`。不存在 v2、兼容 alias 或 dual parser。Game Package v1 从现在起只声明 **游戏逻辑 topology 与平台无关初始输入**；可执行实现、module resolution 与 Runtime 创建全部由当前 Platform 的 Game Launcher/Profile 拥有。

核心原则：

> **Game Package 回答“这个游戏由哪些 logical Subsystem 组成、从哪里开始”；Platform Launch Manifest 回答“当前平台用什么实现这些 key”；RuntimeHosting 回答“当前平台如何真正运行它们”。**

---

## 1. Game Entry

当前标准公共 Game Entry 是一个 JSON document。安装布局 MAY 将其保存为 `game.json`；`@loomrealm/game-package` 的核心 API 只依赖 document bytes/value，不依赖 filesystem、Fetch 或某一物理路径 API。

Normative model：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

interface InitialFrameTargetV1 {
  readonly subsystem: string;
  readonly input: JsonValue;
}

interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

概念示例：

```json
{
  "formatVersion": 1,
  "initial": {
    "subsystem": "loom.map",
    "input": null
  },
  "subsystems": [
    { "key": "loom.map" },
    { "key": "loom.battle" }
  ]
}
```

Game Entry MUST NOT包含任何 executable/platform binding。

---

## 2. `SubsystemDescriptorV1`

Descriptor v1 精确只有：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

`key` 是当前 Session 中稳定的 Subsystem application identity。

要求：

- MUST 是非空字符串；
- MUST 在同一 Game Entry 的 `subsystems[]` 中唯一；
- 比较 MUST 大小写敏感、逐字符精确；
- Main、Runtime bootstrap、Subsystem Control、Frame target 与 DataAuthority MUST 使用同一个 key；
- PID、Worker ID、module path、URL、Launch Attempt ID、Port MUST NOT 代替 key。

Game Package 不再拥有：

```text
module
launcher.type
launcher.entry
env
Node/Worker selection
process argv/flags
Worker options
WebSocket URL / MessagePort
bootstrap token
Data endpoint/ticket
platform switch
```

---

## 3. Initial Frame Target

`initial.subsystem` MUST 引用 `subsystems[]` 中已声明的 key。

`initial.input` MUST 是合法 `JsonValue`，并成为 Session bootstrap 创建 initial Frame 时的业务输入。

它不是：

```text
Platform bootstrap object
process env
Worker bootstrap material
Content credential
Runtime Control payload
```

因此相同 Game Entry 可在不同 Platform Launch realization 中使用相同初始业务语义。

---

## 4. Closed Schema

Game Entry、InitialFrameTarget 与 SubsystemDescriptor 都是 closed schema。

以下字段出现即 MUST reject：

```text
module
implementation
launcher
runtime
hostra
pwa
env
argv
worker
node
endpoint
url
bootstrapToken
```

若未来确实出现 platform-neutral game-level 字段，应直接修改 current Game Package contract；不得把任意 platform option bag 塞入 common manifest。

---

## 5. Phase 1 Topology

Phase 1：

```text
all declared Subsystems = eager + required
```

v1 当前不定义：

```text
lazy Subsystem
optional Subsystem
multiple Runtime instances per key
runtime implementation negotiation
remote Runtime
```

Game Entry 一次性声明本次 Session 的完整 logical Subsystem key set。

---

## 6. Game Package Validation

`@loomrealm/game-package` / Game Package Validator MUST 在任何 Platform launch planning 或 business Runtime side effect 前完成：

```text
JSON parse
closed top-level schema
formatVersion == 1
initial closed schema
initial.input JsonValue validation
subsystems[] closed schema
key non-empty / uniqueness
initial.subsystem declared
```

Game Package validation MUST NOT：

```text
resolve executable module
import Definition Module
create Process/Worker
open Control/Data carrier
read Platform Launch Manifest
select Hostra/PWA
```

输出是 platform-neutral `ValidatedGameEntryV1` / logical topology。

---

## 7. Platform Launch Join Boundary

每个平台拥有自己的 Launch Manifest 与 validator：

```text
ValidatedGameEntryV1
        +
ValidatedPlatformLaunchManifest
        ↓ exact key-set join
Platform Launch Planner
        ↓
immutable PlatformLaunchPlan
```

Phase 1 MUST满足：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

因此：

```text
missing platform binding
    → bootstrap rejected before Runtime side effect

platform binding for undeclared key
    → bootstrap rejected before Runtime side effect
```

Game Package package本身不解析 Hostra/PWA manifest；exact-set join由对应 Platform Launcher/Profile负责。

---

## 8. Zero-side-effect Preflight Invariant

启动边界固定为：

```text
read/validate Game Entry
→ read/validate current Platform Launch Manifest
→ exact key-set join
→ resolve every required platform implementation
→ validate current Platform hosting capability
→ freeze immutable LaunchPlan
────────────────────────────────────────────
first business Runtime side effect may begin
```

配置、集合 join、module syntax、module existence/containment 或当前 Platform capability 的任何 preflight failure：

```text
MUST NOT create any business Runtime Container
```

Definition Module 的 actual ESM import/default-export ABI validation MAY 需要在 Host-owned Runner 中执行；此类 launch-time failure使 all-required Game Bootstrap失败并统一 cleanup，但不削弱 preflight 的零副作用保证。

---

## 9. Definition Module Is Not Game Package Authority

Subsystem Definition Module 仍使用 `@loomrealm/subsystem` 定义的业务 ABI：

```text
.mjs ESM
default export = SubsystemDefinitionFactory
```

但 **哪个 module 实现哪个 key** 不再由 Game Package 声明，而由当前 Platform Launch Manifest 声明。

因此允许：

```text
same logical key
    Hostra → hostra-specific build artifact
    PWA    → pwa-specific build artifact
```

两个 artifact MUST遵守同一 Subsystem author/host contract，并满足产品要求的 observable semantics。

共享同一 source/module仍是良好优化，但不是 Game Package v1 identity 或 compatibility invariant。

---

## 10. Main Boundary

Main 只消费 logical topology：

```text
subsystemKey
initial target/input
```

Main MUST NOT 接收普通 application authority 中的：

```text
module path
resolved filesystem path
module URL
Node executable
Worker entry
platform launch options
```

Main 创建 logical Launch Attempt 后，通过 Main-facing `RuntimeHosting` 请求：

```text
launch(subsystemKey, launch-attempt material)
```

RuntimeHosting 在其封闭的 PlatformLaunchPlan 中查找 executable binding。

---

## 11. Business Configuration Boundary

跨平台业务配置使用 platform-neutral mechanism：

```text
Game Entry initial.input
Frame params
Readonly Content
Subsystem-owned business data
```

Platform Launch Manifest MUST NOT 被业务代码当作普通配置读取入口。

Platform/Runner 自己需要的环境变量、Worker options、bootstrap credentials、timeouts 与 resource policy 属于 Host-owned deployment policy，不属于 Game Package。

---

## 12. Error Categories

Game Package v1 至少冻结：

```text
GAME_ENTRY_INVALID
GAME_ENTRY_VERSION_UNSUPPORTED
SUBSYSTEM_KEY_INVALID
SUBSYSTEM_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
INITIAL_INPUT_INVALID
```

以下错误已经移出 Game Package，归对应 Platform Launcher/Profile：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
PLATFORM_RUNTIME_UNSUPPORTED
```

---

## 13. Trust Model

Game Entry 是声明性 logical topology，不授予 executable capability。

```text
Game declares key
!=
Game may execute arbitrary path/URL
```

Executable trust、module containment、Runner ownership、Node/Worker policy由 Platform Launcher/Profile承担。Publisher Trust、签名与 untrusted executable sandbox仍是后续能力。

---

## 14. Conformance Requirements

至少 MUST 覆盖：

```text
valid minimal game entry
closed top-level/initial/descriptor schema
unsupported formatVersion
empty/duplicate key
undeclared initial target
invalid initial JsonValue
module/launcher/env/platform field rejected from common descriptor
common validation performs no executable resolution
common validation performs no Runtime side effect
same Game Entry accepted by Hostra/PWA launch planners
missing/extra platform key rejected by platform join
all preflight failures occur before Runtime creation
```

---

## 15. Core Invariants

1. Game Package v1 只拥有 platform-neutral logical topology 与 initial business input；
2. Descriptor v1 精确为 `{key}`；
3. `key` 是唯一跨 Main/Runtime/Frame/Data 使用的 Subsystem application identity；
4. Game Package 不拥有 executable module identity、Runner、Process/Worker 或 Transport；
5. Platform Launch Manifest 独立绑定 key → current-platform implementation；
6. Phase 1 Game key set 与 current Platform binding key set必须严格相等；
7. 完整 Platform LaunchPlan 在任何 business Runtime side effect前闭合；
8. Main只发出 logical launch intent，不携 executable material；
9. Definition Module ABI由 `@loomrealm/subsystem` 统一，具体 artifact可按平台不同；
10. Game Package validation failure与 Platform preflight failure均零 Runtime side effect；
11. Host policy/credential/resource options不得由 Game common manifest注入；
12. 本次是 current v1直接 reset，不存在 v2或旧 `{key,module}` compatibility path。
