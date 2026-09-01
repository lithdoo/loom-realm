# LoomRealm Game Package v1 Logical Topology Contract

> 层级：正式契约  
> 状态：Active / Normative  
> 契约版本：1  
> 稳定程度：Stabilizing  
> 主要定义：Game Entry platform-neutral document shape、Subsystem logical topology、初始 Frame target、集合级校验、validated snapshot 与 Platform Launcher consumption boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)  
> Hostra realization：[Hostra Game Launcher / Node Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md)  
> PWA realization：[PWA Game Launcher / Worker Subsystem Runner Profile v1](./pwa-launcher-profile-v1.md)  
> 最近复核：2026-09-01

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> Current v1 直接使用 `{key}` Descriptor；不存在 v2、旧 `{key,module}` parser、deprecated alias 或 dual model。Game Entry 是 installation/document contract，不是 Main application state model。

核心原则：

> **Game Package 回答“这个 common Game Entry 是否成立、游戏由哪些 logical Subsystem 组成、从哪里开始”；matching Platform Launcher 回答“当前平台如何完整准备并实现这些 key”；Main 只接收 prepared logical projection，不解析 Game Entry。**

---

## 1. Game Entry

当前标准 Game Entry 是 JSON document。安装布局 MAY 保存为 `game.json`；core validation API 只依赖 JSON text/value，不依赖 filesystem、Fetch 或物理路径。

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

Game Entry MUST NOT包含 executable/platform binding。

---

## 2. `SubsystemDescriptorV1`

Descriptor v1 精确只有：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

`key` 是 Session 中稳定的 Subsystem application identity。

要求：

- MUST 是 well-formed Unicode 非空字符串，UTF-8 编码长度为 `1..256` bytes；
- MUST 在同一 `subsystems[]` 中唯一；
- 比较 MUST 大小写敏感、按字符串 exact equality；
- validator MUST NOT trim、case-fold 或 Unicode-normalize key；
- Main、Runtime bootstrap、Subsystem Control、Frame target 与 DataAuthority MUST 使用同一个 logical key；
- PID、Worker ID、module path、URL、Launch Attempt ID、Port MUST NOT 替代 key。

Current v1 只冻结 `1..256` UTF-8 bytes 的 representation bound，不额外冻结 ASCII/regex/prefix grammar。若未来进一步收紧 key syntax，应修改本 formal contract，而不是实现私自 normalize。

---

## 3. Initial Frame Target

`initial.subsystem` MUST 引用 `subsystems[]` 中已声明的 exact key。

`initial.input` MUST 是合法 `JsonValue`，并成为 Session bootstrap 创建 initial Frame 时的 business input。

`initial.input` 对 Game Package MUST otherwise opaque。

因此业务 input 内出现：

```text
module
env
platform
launcher
__proto__
```

等 JSON member name 本身不构成 Game/Platform configuration，也不得被递归 blacklist。

```text
closed Game schema
!=
recursive reserved business JSON names
```

---

## 4. Closed Schema

Game Entry、InitialFrameTarget、SubsystemDescriptor 都是 closed schema：

```text
GameEntry
    exactly formatVersion / initial / subsystems

InitialFrameTarget
    exactly subsystem / input

SubsystemDescriptor
    exactly key
```

因此在这些 schema 层出现额外字段即 MUST reject，例如：

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

若未来出现真正 platform-neutral game-level field，应直接修改 current Game Package contract；不得加入 arbitrary platform option bag。

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

Game Entry 一次性声明本次 Session 完整 logical Subsystem key set。

`subsystems[]` declaration order MUST 在 validated representation 中保留，但：

```text
order != launch order
order != dependency order
order != startup/shutdown priority
```

Topology authority 是 exact key set。

---

## 6. Validation

`@loomrealm/game-package` MUST 在任何 Platform launch planning 或 business Runtime side effect前完成 common validation：

```text
JSON representation validation
closed top-level schema
formatVersion exact current version
initial closed schema
initial.input JsonValue validation
subsystems[] / descriptor closed schema
key well-formed Unicode / 1..256 UTF-8 bytes / exact uniqueness
initial.subsystem declared
```

Game Package validation MUST NOT：

```text
read Platform Launch Manifest
resolve executable module
import Definition Module
create Process/Worker
open Control/Data carrier
select Hostra/PWA
```

输出是 `ValidatedGameEntryV1` document snapshot。

---

## 7. Validated Snapshot

Successful validation MUST produce a trusted snapshot rather than merely retyping caller-owned mutable input。

实现 MUST：

```text
construct detached representation
recursively freeze returned containers
preserve JsonValue semantic value
preserve subsystem declaration order
```

实现 MUST NOT：

```text
mutate caller-owned input
freeze caller-owned input
retain mutable caller-owned containers
invoke user getter/toJSON as part of snapshot construction
```

因此 caller 后续 mutation MUST NOT alter the validated snapshot。

Snapshot construction SHOULD be deep-input safe and MUST NOT require recursion proportional to JSON nesting depth as correctness behavior。

Object member names such as `__proto__` MUST remain ordinary JSON data, not prototype authority。

---

## 8. Consumer Boundary

`GameEntryV1` / `ValidatedGameEntryV1` 是 document-layer types。

Runtime-product path 的 primary consumers MUST 是 matching Platform Launcher/Profile：

```text
Game source
→ matching Platform Launcher
    → @loomrealm/game-package validation
    → own Platform manifest validation
    → exact join / executable preflight
```

Product application/composition MUST NOT be required to call Game Package manually before invoking the matching launcher。

Tooling MAY directly consume Game Package。

---

## 9. Main-facing Projection

Main MUST NOT：

```text
parse game.json
validate GameEntryV1
import @loomrealm/game-package as a Runtime role dependency
receive formatVersion / validated document brand
receive Platform executable fields
```

After full Platform PREPARE，Launcher/Composition projects only Main-required logical facts：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

这只是 conceptual Main-facing bootstrap shape，不是新的 Game file format，也不是 universal Platform launcher schema。

`LogicalGameBootstrap` MUST be immutable and MUST NOT contain executable/Platform material。

---

## 10. Platform Launch Join Boundary

每个平台拥有自己的 Launch Manifest/validator/planner：

```text
ValidatedGameEntryV1
        +
ValidatedPlatformLaunchManifest
        ↓ exact key-set join
Platform Launch Planner
        ↓
immutable PlatformLaunchPlan
```

Phase 1 MUST：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

Missing/extra binding MUST fail before Runtime side effects。

Game Package 本身不解析 Hostra/PWA manifest；exact-set join由对应 Launcher/Profile负责。

---

## 11. Zero-side-effect PREPARE Invariant

启动边界：

```text
read/obtain Game Entry
→ Game Package validation
→ current Platform manifest validation
→ exact key join
→ all executable resolution
→ hosting/security capability preflight
→ freeze PlatformLaunchPlan
→ project LogicalGameBootstrap
────────────────────────────────────────
first business Runtime side effect may begin
```

任一 config/join/resolution/capability PREPARE failure：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

Definition Module actual ESM import/default-export ABI validation MAY 发生在 Host-owned Runner；此类 launch-time failure使 all-required bootstrap失败并 cleanup，但不改变 PREPARE owner。

---

## 12. Definition Module Is Not Game Package Authority

Definition Module 使用 `@loomrealm/subsystem` 定义的 business ABI，但**哪个 module 实现哪个 key**由 current Platform Launch Manifest决定。

允许：

```text
same logical key
    Hostra → artifact A
    PWA    → artifact B
```

A/B MUST 遵守相同 author/host contract，并在同一 logical scenario 下满足等价 observable semantics。

Same artifact/path/bytes 不是 Game Package compatibility invariant。

---

## 13. Main Boundary

Main 拥有 logical Subsystem Registry / Runtime/Frame authority，但不拥有 Game document/executable binding。

Prepared RuntimeHosting 的 Main-facing request：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

Main MUST NOT 传入：

```text
GameEntryV1
module path / URL
resolved filesystem path
Node executable
Worker entry/options
PlatformLaunchPlan
```

RuntimeHosting 在封闭的 PlatformLaunchPlan 中 lookup binding。

---

## 14. Error Categories

Game Package v1 至少冻结：

```text
GAME_ENTRY_INVALID
GAME_ENTRY_VERSION_UNSUPPORTED
SUBSYSTEM_KEY_INVALID
SUBSYSTEM_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
INITIAL_INPUT_INVALID
```

Implementation-facing public error SHOULD expose stable category + structural path；human message 不形成 compatibility contract。

以下错误归 Platform Launcher/Profile：

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

## 15. Trust Model

Game Entry 是 declarative logical topology，不授予 executable capability：

```text
Game declares key
!=
Game may execute arbitrary path/URL
```

Executable trust、module containment、Runner ownership、Node/Worker policy由 Platform Launcher/Profile承担。

Publisher Trust / signing / untrusted executable sandbox仍是后续能力。

---

## 16. Conformance Requirements

至少 MUST 覆盖：

```text
valid minimal Game Entry
closed top-level/initial/descriptor schema
unsupported formatVersion
empty/oversized/ill-formed-Unicode/duplicate exact key
case-sensitive no-normalization key semantics
undeclared initial target
invalid initial JsonValue
reserved-looking member names allowed inside initial.input
module/launcher/env/platform field rejected from schema layers
validated snapshot detached + immutable
source mutation cannot change validated result
common validation performs no I/O/module import/Runtime side effect
Hostra/PWA launcher prepare consume the same common Game Entry
Main package has no Game Package document dependency
missing/extra Platform key rejected by Platform join
all PREPARE failures before Runtime creation
```

---

## 17. Core Invariants

1. Game Package v1 只拥有 platform-neutral Game Entry document、logical topology 与 initial business input；
2. Descriptor v1 精确 `{key}`；
3. key 是 well-formed Unicode、`1..256` UTF-8 bytes、case-sensitive exact，不由实现 trim/normalize；
4. initial.input 是 opaque JsonValue；
5. successful validation产出 detached immutable snapshot；
6. Game Package不是 Runtime role；
7. matching Platform Launcher是 Runtime-product Game Entry consumer；
8. Main不依赖/解析 Game Package document model；
9. Main只接收 immutable LogicalGameBootstrap projection；
10. Platform Launch Manifest独立绑定 key → current-platform implementation；
11. Phase 1 Game key set与 current Platform key set严格相等；
12. complete PlatformLaunchPlan + logical projection 在任何 business Runtime side effect前闭合；
13. Definition Module ABI统一，artifact可按平台不同；
14. Host policy/credential/resource options不得由 Game common manifest注入；
15. current v1直接实现该模型，不存在 v2/legacy `{key,module}` compatibility path。
