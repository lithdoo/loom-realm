# LoomRealm Game Package v1 Logical Topology Contract

> 层级：正式契约  
> 状态：Active / Normative **(Pre-release)**  
> 契约版本：1  
> 稳定程度：**Stabilizing / Not Formally Released / Breaking Schema Changes Allowed Until v1 Freeze**；Realm State slice pre-implementation / not qualified  
> 主要定义：Game Entry platform-neutral document shape、Subsystem logical topology、Realm State initial document definition、初始 Frame target、集合级校验、validated snapshot 与 Platform Launcher consumption boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[Realm State v1](./realm-state-v1.md)、[ADR 0019](../decisions/0019-platform-launch-manifest-boundary.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)  
> Hostra realization：[Hostra Game Launcher / Node Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md)  
> PWA realization：[PWA Game Launcher / Worker Subsystem Runner Profile v1](./pwa-launcher-profile-v1.md)  
> 最近复核：2026-10-05

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> Game Package v1 **尚未正式发布/freeze**。当前 contract 对当前实现是 normative，但历史 draft v1 shape 不形成向后/向前兼容承诺；在显式 v1 release/freeze 之前允许 breaking schema evolution。
>
> 因此 current v1 直接使用 `{key}` Descriptor，并加入 optional `state`，继续使用 `formatVersion: 1`；不存在为了兼容历史未发布 draft 而引入的 Game Entry v2、旧 `{key,module}` parser、deprecated alias 或 dual model。
>
> 一旦 Game Package v1 正式发布/freeze，closed schema 的结构性新增/变更原则上 MUST 使用新的 `formatVersion`，除非已发布 contract 事先冻结明确 extension mechanism。

核心原则：

> **Game Package 回答“这个 common Game Entry document 是否成立、游戏有哪些 logical Subsystems、共享业务初始定义是什么、从哪里开始”；matching Platform Launcher 回答“当前平台如何把这些 document facts 投影成 Main / Realm State 的 prepared logical inputs，并如何实现这些 subsystem keys”；Main 与 RealmStateAuthority 都不直接解析 Game Entry document。**

---

## 1. Game Entry

当前标准 Game Entry 是 JSON document。安装布局 MAY 保存为 `game.json`；core validation API 只依赖 JSON text/value，不依赖 filesystem、Fetch 或物理路径。

Normative model：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly state?: RealmStateGameDefinitionV1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

interface RealmStateGameDefinitionV1 {
  readonly records: readonly RealmStateInitialRecordV1[];
}

interface RealmStateInitialRecordV1 {
  readonly namespace: string;
  readonly key: string;
  readonly value: JsonValue;
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
  "state": {
    "records": [
      { "namespace": "player", "key": "profile", "value": null }
    ]
  },
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

缺少 `state` MUST 等价于：

```text
Realm State initial document definition = empty
```

Game Entry MUST NOT 包含 executable/platform binding，也 MUST NOT 指定 Realm State Record version、global revision、transaction ID、Save/Load seed 或 persistence policy。

---

## 2. Versioning / Compatibility Rule

### 2.1 Current pre-release v1

当前 Game Package v1 尚未正式发布，因此：

```text
historical draft shape
    != compatibility contract

current normative pre-release v1
    supersedes earlier draft v1 shapes
```

`state?: ...` 在当前阶段加入 `formatVersion: 1` 是允许的，即使历史 draft validator 因 closed-schema 规则不会接受该字段。

本项目不为未发布 draft 提供：

```text
legacy parser
dual schema
v1-old / v1-new negotiation
deprecated alias
synthetic v2 solely for draft compatibility
```

### 2.2 After v1 formal release/freeze

Game Package v1 一旦显式 release/freeze，`formatVersion` 成为 document compatibility discriminator：

```text
reader claims support for formatVersion N
→ reader must support the released/frozen schema for N
```

因为 Game Entry 是 closed schema，release 后增加新的 structural field 会使旧 reader reject；因此 release 后的结构性 schema evolution原则上 MUST bump `formatVersion`，除非该 released version 已经定义可扩展 envelope/extension mechanism。

换言之：

```text
before v1 release
    breaking schema change allowed inside draft/pre-release v1

after v1 release
    breaking structural schema change → new formatVersion
```

---

## 3. `SubsystemDescriptorV1`

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

Current v1 只冻结 `1..256` UTF-8 bytes 的 representation bound，不额外冻结 ASCII/regex/prefix grammar。若未来进一步收紧 key syntax，应修改本 formal contract；在 v1 正式 release 后，如该收紧破坏已发布合法 document，则应按 versioning rule 处理。

---

## 4. Realm State Initial Document Definition

`state.records[]` 声明 **Game-level shared business baseline document**。它与 `initial.input` 不同：

```text
state.records
    Session shared mutable business facts 的 immutable Game baseline document

initial.input
    initial Frame invocation parameters
```

Game Entry 声明 Records，而不是独立 Namespace objects。Namespace/Collection 由 `records[].namespace` 自然派生。

每个 initial Record identity 是 `(namespace,key)`，其 grammar MUST 与 Realm State v1 一致：

```text
namespace
    non-empty valid Unicode scalar-value string
    UTF-8 <= 64 bytes
    no '/'
    no U+0000..U+001F / U+007F

key
    non-empty valid Unicode scalar-value string
    UTF-8 <= 256 bytes
    no '/'
    no U+0000..U+001F / U+007F

identity
    case-sensitive exact scalar sequence
    no trim / normalization / locale comparison
```

同一 `state.records[]` 内完整 Record identity MUST 唯一。

Realm State initial document hard bounds：

```text
initial record count        <= 4096
single JsonValue            <= 256 KiB logical encoded JSON
JsonValue nesting depth     <= 64
whole initial State payload <= 8 MiB
```

精确 encoded-size / nesting-depth accounting algorithm 由 [Realm State v1](./realm-state-v1.md) formal freeze 统一定义。该算法未冻结前，Realm State feature 不得宣称 implementation-qualified；各平台不得私自采用不一致的更宽松算法。

`state.records[].value` MUST 是合法 `JsonValue`。Game Package 不解释其业务 schema。

重要边界：

```text
RealmStateGameDefinitionV1
    = Game Package document-layer representation

PreparedRealmStateDefinition
    = Realm State runtime/bootstrap representation
```

二者语义相关但 owner 不同；RealmStateAuthority MUST NOT 直接依赖本 Game Package document type。

Game Entry `state` 只定义 prepared Game initial baseline。Save/Load/restore data 不进入 Game Entry State，也不成为 RealmStateAuthority 第二套 bootstrap input；持久化恢复属于运行中业务通过 `RealmStateClient` 执行的普通 mutation。

---

## 5. Initial Frame Target

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

## 6. Closed Schema

Game Entry、RealmStateGameDefinition、RealmStateInitialRecord、InitialFrameTarget、SubsystemDescriptor 都是 closed schema：

```text
GameEntry
    exactly formatVersion / optional state / initial / subsystems

RealmStateGameDefinition
    exactly records

RealmStateInitialRecord
    exactly namespace / key / value

InitialFrameTarget
    exactly subsystem / input

SubsystemDescriptor
    exactly key
```

因此在这些 schema 层出现未声明字段即 MUST reject，例如：

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
version
revision
transactionId
saveSlot
loadSeed
```

Pre-release 阶段若出现真正 platform-neutral game-level field，可直接修改 current v1 contract；v1 正式发布后则按 §2 versioning rule 处理。不得加入 arbitrary platform option bag。

---

## 7. Phase 1 Topology

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

## 8. Validation

`@loomrealm/game-package` MUST 在任何 Platform launch planning 或 business Runtime side effect 前完成 common validation：

```text
JSON representation validation
closed top-level schema
formatVersion exact current version
optional state closed schema
state.records Record shape / identity grammar / exact uniqueness
state JsonValue / count / payload bounds
initial closed schema
initial.input JsonValue validation
subsystems[] / descriptor closed schema
Subsystem key well-formed Unicode / 1..256 UTF-8 bytes / exact uniqueness
initial.subsystem declared
```

Game Package validation MUST NOT：

```text
read Platform Launch Manifest
resolve executable module
import Definition Module
create Process/Worker
open Control/Data/Realm State carrier
create RealmStateAuthority
select Hostra/PWA
interpret Save/Load persistence data
```

输出是 `ValidatedGameEntryV1` document snapshot。

---

## 9. Validated Snapshot

Successful validation MUST produce a trusted snapshot rather than merely retyping caller-owned mutable input。

实现 MUST：

```text
construct detached representation
recursively isolate/freeze returned containers
preserve JsonValue semantic value
preserve subsystem declaration order
preserve State Record identities/values
```

实现 MUST NOT：

```text
mutate caller-owned input
freeze caller-owned input
retain mutable caller-owned containers
invoke user getter/toJSON as part of snapshot construction
```

因此 caller 后续 mutation MUST NOT alter the validated snapshot。

Snapshot construction SHOULD be deep-input safe。Realm State value validation/size/depth/detach MAY 使用一个 bounded traversal，不要求分层重复遍历同一可信值。

Object member names such as `__proto__` MUST remain ordinary JSON data, not prototype authority。

---

## 10. Consumer / Projection Boundary

`GameEntryV1` / `ValidatedGameEntryV1` 是 document-layer types。

Runtime-product path 的 primary consumers MUST 是 matching Platform Launcher/Profile：

```text
Game source
→ matching Platform Launcher
    → @loomrealm/game-package validation
    → own Platform manifest validation
    → exact join / executable preflight
    → project Main bootstrap
    → project Realm State prepared bootstrap definition
```

Projection ownership：

```text
ValidatedGameEntryV1.initial/subsystems
    → LogicalGameBootstrap

ValidatedGameEntryV1.state
    → PreparedRealmStateDefinition
```

`PreparedRealmStateDefinition` 的 runtime semantics/type ownership 属 [Realm State v1](./realm-state-v1.md)，不是本 Game Package document contract。

Product application/composition MUST NOT be required to call Game Package manually before invoking the matching launcher。

Tooling MAY directly consume Game Package。

---

## 11. Prepared Logical Projections

Main MUST NOT：

```text
parse game.json
validate GameEntryV1
import @loomrealm/game-package as a Runtime role dependency
receive formatVersion / validated document brand
receive Realm State initial Records
receive Platform executable fields
```

After full Platform PREPARE，Launcher projects Main-required logical facts：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Realm State bootstrap remains a **sibling projection**, not a Main field：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

其中 `PreparedRealmStateDefinition` 由 Realm State contract拥有，概念上是 detached/immutable、platform-neutral 的 prepared Game Record baseline。Launcher MUST explicitly project `ValidatedGameEntryV1.state` into that representation，而不是把 `RealmStateGameDefinitionV1` document object直接当作 Authority bootstrap object。

`LogicalGameBootstrap` MUST be immutable and MUST NOT contain executable/Platform/Realm State material。

Prepared `state` MUST be detached/immutable and MUST NOT contain Game Package `formatVersion`、Runtime version/revision、transaction ID、Save/Load material 或 Platform executable material。

---

## 12. Platform Launch Join Boundary

每个平台拥有自己的 Launch Manifest/validator/planner：

```text
ValidatedGameEntryV1
        +
ValidatedPlatformLaunchManifest
        ↓ exact Subsystem key-set join
Platform Launch Planner
        ↓
immutable PlatformLaunchPlan
+
PreparedLogicalGame {
    main: LogicalGameBootstrap,
    state: PreparedRealmStateDefinition
}
```

Phase 1 MUST：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

Realm State Records 不参与 executable key-set join。

Missing/extra executable binding MUST fail before Runtime side effects。

Game Package 本身不解析 Hostra/PWA manifest；exact-set join与 prepared projection由对应 Launcher/Profile负责。

---

## 13. Zero-side-effect PREPARE Invariant

启动边界：

```text
read/obtain Game Entry
→ Game Package validation including optional state document
→ current Platform manifest validation
→ exact key join
→ all executable resolution
→ hosting/security capability preflight
→ freeze PlatformLaunchPlan
→ project/freeze LogicalGameBootstrap
→ project/freeze PreparedRealmStateDefinition
────────────────────────────────────────
PREPARE complete
```

在 PREPARE complete 前：

```text
MUST NOT create business Runtime Container
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
MUST NOT permit business Runtime side effect
```

RealmStateAuthority 的 physical creation MAY 位于 PREPARE 之后的 Session bootstrap，但 MUST consume the prepared State projection and MUST be READY before first business Runtime side effect。

Session bootstrap MUST NOT consume Save/Load seed as a privileged Realm State input。Persistence restoration, if any, happens later as ordinary business activity。

Definition Module actual ESM import/default-export ABI validation MAY 发生在 Host-owned Runner；此类 launch-time failure使 all-required bootstrap失败并 cleanup，但不改变 PREPARE owner。

---

## 14. Definition Module Is Not Game Package Authority

Definition Module 使用 `@loomrealm/subsystem` 定义的 business ABI，但**哪个 module 实现哪个 key**由 current Platform Launch Manifest决定。

允许：

```text
same logical key
    Hostra → artifact A
    PWA    → artifact B
```

A/B MUST 遵守相同 author/host contract，并在同一 logical scenario 下满足等价 observable semantics。

Same artifact/path/bytes 不是 Game Package compatibility invariant。

Definition Module MUST NOT receive Game Package document State or infer that `RealmStateGameDefinitionV1` is a Runtime capability；it consumes only author-facing `RealmStateClient` provided by the Runtime host。

---

## 15. Main / Realm State Runtime Boundary

Main 拥有 logical Subsystem Registry / Runtime/Frame control authority，但不拥有 Game document/executable binding，也不拥有 Realm State business data。

Prepared RuntimeHosting 的 Main-facing request：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

Main MUST NOT 传入：

```text
GameEntryV1
RealmStateGameDefinitionV1
PreparedRealmStateDefinition
Realm State values/revision/version
module path / URL
resolved filesystem path
Node executable
Worker entry/options
PlatformLaunchPlan
```

RuntimeHosting 在封闭的 PlatformLaunchPlan 中 lookup binding。Runtime-scoped RealmStateClient capability 由 Session/Platform composition 独立注入对应 Runtime，而不是通过 Frame params、Main business fields 或 Runtime Control message传递。

RealmStateAuthority MUST consume the Realm State-owned prepared representation, not Game Package document types。

---

## 16. Error Categories

Game Package v1 至少冻结：

```text
GAME_ENTRY_INVALID
GAME_ENTRY_VERSION_UNSUPPORTED
SUBSYSTEM_KEY_INVALID
SUBSYSTEM_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
INITIAL_INPUT_INVALID
REALM_STATE_INITIAL_INVALID
REALM_STATE_INITIAL_DUPLICATE
REALM_STATE_INITIAL_LIMIT_EXCEEDED
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

Realm State Runtime read/commit/subscription/binding errors归 Realm State contract，不属于 Game Package validation error namespace。

---

## 17. Trust Model

Game Entry 是 declarative logical topology + initial business definition，不授予 executable capability：

```text
Game declares Subsystem key / Realm State initial value
!=
Game may execute arbitrary path/URL
```

Executable trust、module containment、Runner ownership、Node/Worker policy由 Platform Launcher/Profile承担。

Realm State runtime authority同样不来自 Game document object identity；它来自 Session bootstrap建立的 RealmStateAuthority。Document validation/projection只提供 immutable initial business baseline。

Publisher Trust / signing / untrusted executable sandbox仍是后续能力。

---

## 18. Conformance Requirements

至少 MUST 覆盖：

```text
valid minimal Game Entry without state
valid optional state.records
omitted state = empty Realm State document definition
closed top-level/state/initial/descriptor schemas
unsupported formatVersion
empty/oversized/ill-formed-Unicode/duplicate Subsystem key
Realm State namespace/key grammar + duplicate full Record identity
Realm State initial count/value/payload hard limits
case-sensitive no-normalization identity semantics
undeclared initial target
invalid initial JsonValue
reserved-looking member names allowed inside business JsonValue
module/launcher/env/platform/version/revision/loadSeed field rejected from schema layers
validated snapshot detached + immutable
source mutation cannot change validated result
common validation performs no I/O/module import/Runtime side effect
Hostra/PWA launcher prepare consume the same common Game Entry
Launcher projects document State → PreparedRealmStateDefinition
Prepared State is detached/immutable and does not expose Game Package formatVersion
RealmStateAuthority does not require GameEntryV1 / RealmStateGameDefinitionV1
Main projection excludes Realm State state.records
missing/extra Platform Subsystem key rejected by Platform join
all PREPARE failures before business Runtime side effects
no privileged Save/Load bootstrap input is projected from Game Package
```

Pre-release versioning qualification SHOULD additionally lock：historical draft v1 compatibility is not promised；current validator implements only the current pre-release v1 schema。After formal v1 release, versioning qualification MUST prevent silent structural schema drift under `formatVersion: 1`。

Realm State exact encoded-size/depth accounting 已由 Realm State v1 implementation/qualification 关闭；Game Package State document vectors复用相同逻辑规则。

---

## 19. Core Invariants

1. Game Package v1 拥有 platform-neutral Game Entry **document**、logical topology、optional Realm State initial document definition 与 initial business input；
2. Game Package v1 当前是 pre-release normative contract，尚无历史 draft compatibility commitment；
3. Descriptor v1 精确 `{key}`；
4. current pre-release v1 直接包含 optional `state`，继续使用 `formatVersion: 1`；
5. v1 正式 release 后，closed-schema breaking structural evolution原则上必须使用新的 `formatVersion`；
6. State document声明 Records，不声明独立 Namespace objects；完整 identity `(namespace,key)` 必须唯一；
7. Subsystem key 与 Realm State identity 均使用 exact/no-normalization semantics；
8. initial.input 与 state Record values 都是 opaque JsonValue；
9. successful validation产出 detached immutable document snapshot；
10. Game Package不是 Runtime role，也不创建/拥有 RealmStateAuthority；
11. matching Platform Launcher是 Runtime-product Game Entry consumer；
12. Launcher owns projection from validated Game document to `LogicalGameBootstrap` + Realm State-owned `PreparedRealmStateDefinition`；
13. Main不依赖/解析 Game Package document model，也不接收 Realm State prepared State；
14. RealmStateAuthority不依赖 `GameEntryV1` / `RealmStateGameDefinitionV1` / `formatVersion` / `game.json`；
15. Main只接收 immutable LogicalGameBootstrap；PreparedRealmStateDefinition是 sibling prepared projection；
16. Game Entry State只定义 immutable prepared Game baseline，不承载 Save/Load seed或 persistence workflow；
17. Platform Launch Manifest独立绑定 Subsystem key → current-platform implementation；
18. Phase 1 Game Subsystem key set与 current Platform key set严格相等；
19. complete PlatformLaunchPlan + Main projection + Realm State prepared projection 在 business Runtime side effect前闭合；
20. Definition Module ABI统一，artifact可按平台不同；
21. Host policy/credential/resource options不得由 Game common manifest注入；
22. current implementation path只支持该 current pre-release v1 document model，不提供历史 draft dual-parser compatibility path。
