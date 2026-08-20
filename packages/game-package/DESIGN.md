# `@loomrealm/game-package` 设计

> 状态：Implementation Ready / Core Contract Frozen  
> 阶段：M2 Game Package first implementation baseline  
> 最近复核：2026-08-20  
> 目标：把不可信 Game Entry JSON text/value 收敛成 detached、deeply immutable、platform-neutral `ValidatedGameEntryV1`，供 Platform Launcher / tooling 使用；不建立 Main Runtime authority、不读取 Platform Launch Manifest、不解析 executable binding。  
> 正式契约：[Game Package v1](../../doc/15-contracts/game-package-v1.md)  
> 消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)  
> 上层实施：[第一阶段交付计划](../../doc/30-implementation/phase-1-delivery-plan.md)  
> 分包规则：[独立分包与发布架构](../../doc/30-implementation/package-architecture.md)

核心原则：

> **`@loomrealm/game-package` 是 Game Entry document validation capability，不是 Runtime role、不是 Main bootstrap API。它只回答“这个 common Game Entry 是否成立、其 logical topology/initial input 是什么”；matching Platform Launcher 负责把它与 current Platform Launch Manifest 一起完成 PREPARE，并向 Main 投影纯 logical bootstrap facts。**

---

## 1. Position

```text
untrusted Game Entry JSON text / unknown JS value
                    ↓
          @loomrealm/game-package
                    ↓
       ValidatedGameEntryV1
                    ↓
        matching Platform Launcher
           /                 \
Hostra PREPARE             PWA PREPARE
```

Runtime-product primary consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Possible direct tooling consumers：

```text
validator CLI
editor
catalog ingestion
publisher tooling
```

Explicit non-consumers：

```text
@loomrealm/main
business Subsystem
Renderer
Runtime Control
```

Main 不解析 `game.json`，不 import `@loomrealm/game-package`。Main 只消费 Platform Launcher/Composition 在 full preflight 后投影的 `LogicalGameBootstrap`。

---

## 2. Authority Boundary

本包可以知道：

```text
Game Entry v1 document shape
formatVersion
Subsystem logical key
initial logical target
initial business JsonValue
complete declared key set
```

本包不得知道：

```text
Hostra / PWA
Platform Launch Manifest
module/path/URL
Definition Module ABI
Node / Worker
Runner
RuntimeHosting
Process/Worker creation
WebSocket/MessagePort
bootstrap token
DataAuthority / generation / profile
Content physical location
Main Session/Frame authority
```

判断规则：

> 如果一个 API 需要理解 current Platform executable binding、Runtime lifecycle 或 application authority 才能解释，它不属于 `@loomrealm/game-package`。

---

## 3. Dependency / Purity Boundary

首批实现：

```text
@loomrealm/wire
        ↓
@loomrealm/game-package
```

唯一 runtime dependency：

```text
@loomrealm/wire
```

MUST NOT 依赖：

```text
@loomrealm/foundation
@loomrealm/main
@loomrealm/subsystem
@loomrealm/runtime-control
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa

node:*
filesystem
Fetch
Worker
WebSocket
MessagePort
dynamic module import
```

所有 parse/validate/snapshot operation 必须：

```text
deterministic
synchronous
no filesystem
no network
no module loading
no Runtime side effect
no mutation/freeze of caller-owned input
```

---

## 4. Exact Public Surface

首批 root export 冻结为：

```ts
import type { JsonValue, WirePathSegment } from "@loomrealm/wire";

export interface SubsystemDescriptorV1 {
  readonly key: string;
}

export interface InitialFrameTargetV1 {
  readonly subsystem: string;
  readonly input: JsonValue;
}

export interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

declare const validatedGameEntryV1Brand: unique symbol;

export type ValidatedGameEntryV1 =
  GameEntryV1 & {
    readonly [validatedGameEntryV1Brand]: never;
  };

export type GamePackageErrorCode =
  | "GAME_ENTRY_INVALID"
  | "GAME_ENTRY_VERSION_UNSUPPORTED"
  | "SUBSYSTEM_KEY_INVALID"
  | "SUBSYSTEM_KEY_DUPLICATE"
  | "INITIAL_TARGET_UNDECLARED"
  | "INITIAL_INPUT_INVALID";

export class GamePackageError extends Error {
  readonly code: GamePackageErrorCode;
  readonly path: readonly WirePathSegment[];
  readonly cause?: unknown;
}

export function parseGameEntryV1(
  text: string,
): ValidatedGameEntryV1;

export function validateGameEntryV1(
  value: unknown,
): ValidatedGameEntryV1;
```

首批不导出：

```text
getSubsystemKeys
getInitialTarget
loadGamePackage
openInstallation
resolveModule
createRuntime
PlatformLaunchOptions
/testing
/internal
/node
/browser
```

无真实独立消费者价值的 convenience/helper 不进入冻结 surface。

Brand 只作为 TypeScript trust marker；实现不要求给 runtime snapshot 增加 symbol own property。返回值仍应保持普通 JSON-compatible representation。

---

## 5. Game Entry v1 Model

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: {
    readonly subsystem: string;
    readonly input: JsonValue;
  };
  readonly subsystems: readonly {
    readonly key: string;
  }[];
}
```

Descriptor v1 精确：

```text
{ key }
```

不存在：

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
platform option bag
```

这些若出现在 GameEntry / Initial / Descriptor schema 层即 unknown member rejection。

---

## 6. Subsystem Key Exact Semantics

Key 有效条件：

```text
typeof key === "string"
key.length > 0
```

比较：

```text
exact JavaScript string equality
case-sensitive
```

首批不做：

```text
trim
case-fold
Unicode normalization
ASCII-only
regex grammar
reserved prefix
platform-name blacklist
```

因此：

```text
"loom.map" != "LOOM.MAP"
"é" != "e\u0301"
" loom.map" != "loom.map"
```

当前 formal contract 只要求 non-empty，因此 whitespace-only string 仍按 current v1 接受。

如果未来认为 whitespace-only / Unicode normalization 必须收紧，应修改 formal Game Package contract；实现不得自行增加 policy。

---

## 7. Initial Target / Opaque Business Input

`initial.subsystem`：

```text
MUST be a string
MUST exactly equal one declared subsystem key
```

`initial.input`：

```text
MUST be a JsonValue
MUST otherwise be opaque to Game Package
```

Game Package 不得把业务 JSON member name 解释成 Platform 配置。

例如以下 input 合法：

```json
{
  "module": "business-data",
  "env": "forest",
  "platform": "ancient-temple",
  "__proto__": {
    "kind": "business-value"
  }
}
```

核心：

```text
closed Game schema
!=
recursively reserved JSON member names
```

Game Package 只对：

```text
GameEntry
InitialFrameTarget
SubsystemDescriptor
```

应用 exact schema。

---

## 8. Closed Schema

固定：

```text
GameEntry
    required = formatVersion, initial, subsystems
    optional = none

InitialFrameTarget
    required = subsystem, input
    optional = none

SubsystemDescriptor
    required = key
    optional = none
```

任何 unknown own member：

```text
→ GAME_ENTRY_INVALID
```

不维护 platform-field blacklist 作为实现机制；`module`/`launcher`/`env` 等测试只是证明 exact schema 已关闭。

---

## 9. Validation Pipeline

### 9.1 `parseGameEntryV1(text)`

```text
assert text string
↓
@loomrealm/wire.parseJsonText
↓
Game Entry validation pipeline
↓
detached immutable snapshot
```

### 9.2 `validateGameEntryV1(value)`

固定 observable precedence：

```text
1. Wire representation validation
2. top-level JsonObject / exact keys
3. formatVersion
4. initial exact shape
5. subsystems array / descriptor exact shapes
6. key validity
7. key uniqueness
8. initial target membership
9. detached immutable snapshot construction
```

Representation validity 故意先于 Game schema/domain semantics。

这保证：

```text
unsupported JS/exotic/accessor/sparse/cyclic input
→ fail at representation boundary
```

而不是让 Game Package 建立第二套 JSON object validator。

---

## 10. Format Version

规则：

```text
missing formatVersion
    → GAME_ENTRY_INVALID

present but not a number / not expected scalar
    → GAME_ENTRY_INVALID

numeric value === 1
    → current v1

numeric value !== 1
    → GAME_ENTRY_VERSION_UNSUPPORTED
```

首批不做：

```text
string "1" coercion
version fallback
migration
legacy parser
dual model
```

---

## 11. Key-set Validation

遍历 `subsystems` declaration order。

每个 Descriptor：

```text
exact object {key}
↓
key string
↓
key.length > 0
↓
first occurrence inserts into Set
↓
later exact-equal occurrence fails
```

Duplicate error path 指向：

```text
second/subsequent occurrence
["subsystems", index, "key"]
```

禁止：

```text
silent dedupe
sort-before-validation
case folding
normalization
```

`initial.subsystem` membership 只在完整 descriptor/key validation 完成后判断。

---

## 12. Error Model

### 12.1 Stable

稳定 public facts：

```text
GamePackageError class
error.code
error.path
```

### 12.2 Not stable

不冻结：

```text
English/human message
stack wording
underlying engine syntax wording
Wire internal message
cause concrete type
```

`cause` MAY 保留诊断信息，但消费者不得依赖它做 compatibility branching。

### 12.3 Mapping

```text
malformed JSON
→ GAME_ENTRY_INVALID []

top-level non-object
→ GAME_ENTRY_INVALID []

missing/unknown top-level member
→ GAME_ENTRY_INVALID at member path

numeric formatVersion != 1
→ GAME_ENTRY_VERSION_UNSUPPORTED ["formatVersion"]

descriptor key non-string/empty
→ SUBSYSTEM_KEY_INVALID ["subsystems", i, "key"]

duplicate key
→ SUBSYSTEM_KEY_DUPLICATE ["subsystems", laterIndex, "key"]

initial subsystem string not declared
→ INITIAL_TARGET_UNDECLARED ["initial", "subsystem"]

invalid direct-value JsonValue under initial.input
→ INITIAL_INPUT_INVALID ["initial", "input", ...]
```

`WireValidationError` / `JsonTextSyntaxError` 是 implementation dependency error，不是 expected Game Package consumer branching surface。

---

## 13. `ValidatedGameEntryV1` Trust Boundary

Validation success 不等于“给 caller object 加类型”。

必须：

```text
validate
→ construct detached snapshot
→ recursively freeze returned containers
→ return opaque/branded ValidatedGameEntryV1
```

MUST NOT：

```text
return caller-owned object graph
mutate caller input
freeze caller input
retain mutable caller-owned nested containers
```

因此：

```text
source mutation after validation
    cannot change validated result

ordinary mutation of validated result
    cannot change topology/input
```

`parseGameEntryV1` 与 `validateGameEntryV1` 应具有同样的 validated snapshot semantics。

---

## 14. Snapshot Semantics

Snapshot 必须保留：

```text
JsonValue semantic value
subsystems declaration order
exact key strings
negative-zero number semantics where present in direct value input
all business JSON member names
```

Snapshot 不得调用：

```text
getter
toJSON
custom normalization
business parser
```

`__proto__` / `constructor` 等必须按 ordinary JSON data member 处理，不得成为 prototype authority。

实现应使用安全 data-property construction，避免 `target[key] = ...` 把 `"__proto__"` 解释成 prototype mutation。

### 14.1 Deep safety

Snapshot construction MUST：

```text
avoid recursion proportional to JSON nesting depth
avoid exponential expansion of shared acyclic graphs
```

推荐：

```text
explicit work stack
WeakMap input container → output container
freeze after children complete
```

Shared-reference identity 是否保留不是 public contract；JsonValue semantic value 才是。

---

## 15. Ordering Semantics

`ValidatedGameEntryV1.subsystems`：

```text
MUST preserve declaration order
```

但 declaration order：

```text
!= Runtime launch order
!= dependency order
!= startup priority
!= shutdown order
!= Platform binding order
```

Phase 1 topology authority 仍是 exact key set。

Launcher exact join 必须按 set semantics 判断 completeness，而不能把数组位置当成 binding identity。

---

## 16. JSON Text Boundary

`parseGameEntryV1` 复用：

```text
@loomrealm/wire.parseJsonText
```

Game Package 不建立：

```text
custom JSON parser
canonical JSON
duplicate-member source detector
streaming parser
UTF-8 decoder
JSON-RPC
```

当前 duplicate JSON source member observable behavior 跟随冻结的 Wire JSON text semantics。

若未来需要 source-level duplicate member hard rejection，应先回到 Wire/parser closure review，不得在 Game Package 内部私藏第二解析器。

---

## 17. Resource / Complexity Boundary

Game Package v1 当前不冻结：

```text
MAX_GAME_ENTRY_BYTES
MAX_GAME_ENTRY_DEPTH
MAX_SUBSYSTEM_COUNT
MAX_KEY_BYTES
MAX_INITIAL_INPUT_BYTES
```

因为 formal Game Package contract 尚无这些 hard policy。

但实现算法必须：

```text
deep-input safe
no call-stack-overflow-defined behavior
near-linear traversal in visited representation size where practical
```

外层 installation/product 若需要文件大小或 resource hard limit，可在读取/接收 raw document 阶段施加 Host/product policy；不得偷偷改变 Game Entry semantic contract。

---

## 18. Launcher Consumption Boundary

Runtime-product 路径固定：

```text
Game source
→ matching Platform Launcher
    → @loomrealm/game-package
    → own Platform manifest validator
    → exact Game↔Platform join
    → executable resolution/security/capability preflight
    → immutable PlatformLaunchPlan
    → Main-facing LogicalGameBootstrap projection
```

Main 不接收：

```text
GameEntryV1
ValidatedGameEntryV1
formatVersion
GamePackageError
raw game.json
```

Main 只接收 Launcher/Composition 已经投影的 logical facts。

Game Package 不提供 `LogicalGameBootstrap` constructor 给 Main；该 projection 属于 Platform Launcher / Main bootstrap integration boundary。

---

## 19. Package / Build Shape

第一实现布局：

```text
packages/game-package/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── model.ts
│   ├── errors.ts
│   ├── validate.ts
│   └── snapshot.ts
└── test/
    ├── parse.test.mjs
    ├── schema.test.mjs
    ├── keys.test.mjs
    ├── snapshot.test.mjs
    ├── errors.test.mjs
    └── package-boundary.test.mjs
```

Package metadata baseline：

```text
name = @loomrealm/game-package
version = 0.1.0-alpha.0
ESM
Node >= 20
browser-compatible source
sideEffects = false
root export only
TypeScript declarations
runtime dependency = @loomrealm/wire
```

不建立 `/testing` export；首批行为都是 deterministic pure document operations。

---

## 20. Automated Test Matrix

### 20.1 Representation / parse

```text
valid-minimal-text
malformed-json
top-level-object-required
direct-unknown-non-json-rejected
wire-error-mapped
```

### 20.2 Closed schema

```text
exact-top-level
exact-initial
exact-descriptor
unknown-top-level-rejected
unknown-initial-rejected
unknown-descriptor-rejected
module-launcher-env-platform-rejected-at-schema-level
same-reserved-looking-keys-allowed-inside-initial-input
```

### 20.3 Version

```text
numeric-1-accepted
missing-version-invalid
string-1-invalid
numeric-other-version-unsupported
```

### 20.4 Keys

```text
non-empty
empty-rejected
whitespace-only-follows-current-contract
case-sensitive
no-trim
no-unicode-normalization
duplicate-later-path
declaration-order-preserved
```

### 20.5 Initial

```text
initial-subsystem-string
initial-target-declared
undeclared-target-category
arbitrary-json-value-input
invalid-direct-input-category
```

### 20.6 Snapshot

```text
detached-from-source
source-mutation-no-effect
deeply-frozen
nested-input-frozen
deep-input-no-call-stack-overflow
shared-dag-no-exponential-copy
proto-key-remains-data
no-getter-tojson-execution
```

### 20.7 Errors

```text
stable-game-package-error-class
stable-code
stable-path
human-message-not-used-for-branching
wire-error-not-required-by-consumer
```

### 20.8 Package boundary

```text
only-runtime-dependency-wire
no-foundation
no-main
no-launcher
no-fs-fetch-platform-api
root-export-only
npm-pack-dry-run
```

---

## 21. Implementation Stages

### Stage A — Package skeleton

关闭：

```text
package metadata
build
root export
wire dependency only
```

### Stage B — Model / Error contract

关闭：

```text
exact public types
GamePackageError class/code/path
no convenience API expansion
```

### Stage C — Parse / Validation

关闭：

```text
Wire representation reuse
closed schemas
version/key/initial semantics
stable precedence
```

### Stage D — Immutable snapshot

关闭：

```text
detached
deep frozen
deep-safe
shared-DAG-safe
proto-data-safe
```

### Stage E — Package qualification

关闭：

```text
full automated matrix
workspace build/test
package dry-run
boundary checks
```

A–E 完成后：

```text
Implemented Baseline / Core Contract Frozen
```

### Stage F — Real downstream consumers

不在 M2 用 fake planner 冒充。

真实 qualification：

```text
M6  @loomrealm/game-launcher-hostra
    first runtime-product consumer

M15 @loomrealm/game-launcher-pwa
    second runtime-product consumer
```

M5 `@loomrealm/main` 明确不是本包消费者。

---

## 22. Explicit Non-goals

```text
filesystem Game loader
Fetch Game loader
installation/catalog lifecycle
Platform Launch Manifest
exact Platform binding join
module resolution
Definition Module ABI
RuntimeHosting
Main bootstrap model
Runtime/Frame/Data authority
generic manifest framework
schema DSL
canonical JSON
cross-platform universal launcher config
launcher registry
```

---

## 23. Closure Criteria

Game Package 文档达到 implementation-ready 的定义：

> 实现者只需要选择内部 algorithm/file-private helper；不再需要自行决定 public API、key semantics、snapshot semantics、error category/path、validation precedence、dependency boundary 或 consumer ownership。

M2 local close 必须证明：

```text
untrusted text/value
→ deterministic Game validation
→ detached immutable ValidatedGameEntryV1

failure
→ stable GamePackageError
→ filesystem = 0
→ module import = 0
→ Runtime side effect = 0
```

Cross-package close 由 M6/M15 真实 launcher consumer 继续证明。

---

## 24. Final Invariants

1. Game Entry v1 Descriptor 精确只有 `{key}`；
2. Game Package 只拥有 common document representation/validation；
3. Game Package 不是 Runtime/application role；
4. Runtime-product primary consumers 是 matching Platform Launchers；
5. Main 不依赖 `@loomrealm/game-package`；
6. Business Subsystem 不依赖 Game Package/Launcher；
7. JsonValue 语义直接复用 `@loomrealm/wire`；
8. closed schema 只约束 GameEntry/Initial/Descriptor，不解释 `initial.input` business member name；
9. key 只按 current formal contract 执行 non-empty + exact/case-sensitive equality，不 trim/normalize；
10. duplicate 必须 reject，不 dedupe；
11. declaration order 保留，但不形成 launch/dependency authority；
12. successful validation 返回 detached deeply immutable snapshot；
13. caller input 永不被 mutate/freeze；
14. snapshot/deep validation 不得重新引入递归栈/平方路径问题；
15. expected invalid input 统一为 stable `GamePackageError` class/code/path；
16. Game Package 不解析 Platform manifest、不 resolve module、不创建 Runtime；
17. matching Launcher 完成 Game + Platform full PREPARE 后才向 Main 投影 logical bootstrap；
18. current v1 直接实现新边界，不保留旧 `{key,module}` parser/alias；
19. 不为 Hostra/PWA 当前相似需求抽 universal launcher schema；
20. 新 public primitive/API 只有真实消费者证明必要时才进入下一轮 closure review。
