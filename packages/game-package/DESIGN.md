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

> **`@loomrealm/game-package` 是 Game Entry document validation capability，不是 Runtime role、不是 Main bootstrap API。它只回答 common Game Entry 是否成立、logical topology/initial input 是什么；matching Platform Launcher 负责把它与 current Platform Launch Manifest 一起完成 PREPARE，并向 Main 投影纯 logical bootstrap facts。**

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

Primary Runtime-product consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Possible direct tooling consumers：validator CLI、editor、catalog ingestion、publisher tooling。

Explicit non-consumers：

```text
@loomrealm/main
business Subsystem
Renderer
Runtime Control
```

Main 不解析 `game.json`，不 import `@loomrealm/game-package`。Main 只消费 full Platform PREPARE 后投影的 `LogicalGameBootstrap`。

---

## 2. Authority / Dependency Boundary

本包只拥有：

```text
Game Entry v1 document shape
formatVersion
Subsystem logical key
initial logical target
initial business JsonValue
complete declared key set
validated immutable snapshot
```

本包不得拥有：

```text
Hostra / PWA
Platform Launch Manifest
module/path/URL
Definition Module ABI
Node / Worker / Runner
RuntimeHosting
Process/Worker creation
WebSocket/MessagePort
bootstrap token
DataAuthority / generation / profile
Content physical location
Main Session/Frame authority
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

所有 parse/validate/snapshot operation MUST 是 deterministic、synchronous，并且没有 filesystem/network/module-load/Runtime side effect，也不得 mutate/freeze caller-owned input。

---

## 3. Exact Public Surface

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

  constructor(
    code: GamePackageErrorCode,
    path?: readonly WirePathSegment[],
    options?: { readonly cause?: unknown },
  );
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

Brand 只作为 TypeScript trust marker；runtime snapshot 不需要 symbol brand own property，仍保持 JSON-compatible representation。

---

## 4. Game Entry v1 / Closed Schema

Normative shape：

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

Closed schema 精确为：

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

因此 `module / implementation / launcher / runtime / hostra / pwa / env / argv / worker / node / endpoint / url / bootstrapToken` 若出现在上述 schema 层均 MUST reject。

Game Package 不维护 platform-field blacklist；这些 case 只是 exact-schema regression tests。

---

## 5. Subsystem Key Exact Semantics

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

当前 formal contract 只要求 non-empty，因此 whitespace-only string 仍按 current v1 接受。未来若收紧 syntax，必须修改 formal contract，validator 不得私自 normalize。

`subsystems` declaration order MUST 保留，但：

```text
order != Runtime launch order
order != dependency order
order != startup/shutdown priority
order != Platform binding order
```

Topology authority 是 exact key set；duplicate MUST reject，禁止 silent dedupe/sort。

---

## 6. Initial Target / Opaque Business Input

`initial.subsystem`：

```text
MUST be string
MUST exactly equal one declared key
```

`initial.input`：

```text
MUST be JsonValue
MUST otherwise remain opaque to Game Package
```

因此业务 input 内出现以下 member name 本身合法：

```text
module
env
platform
launcher
__proto__
constructor
```

核心：

```text
closed Game schema
!=
recursive reserved business JSON names
```

Game Package 只解释 GameEntry / InitialFrameTarget / SubsystemDescriptor 的字段，不解释 `initial.input` 的业务结构。

---

## 7. Validation Pipeline / Precedence

### `parseGameEntryV1(text)`

```text
runtime string check
↓
@loomrealm/wire.parseJsonText
↓
Game Entry validation pipeline
↓
detached immutable snapshot
```

### `validateGameEntryV1(value)`

固定 observable precedence：

```text
1. Wire representation validation over the whole value graph
2. top-level JsonObject + exact keys
3. formatVersion classification
4. initial exact shape + initial.subsystem type
5. subsystems array + descriptor exact shapes + key validity
6. key uniqueness
7. initial target membership
8. detached immutable snapshot construction
```

Representation validity 故意先于 schema/domain semantics。因此 unsupported JS value、exotic/accessor/sparse/cyclic graph 先在 Wire boundary fail closed，Game Package 不建立第二套 JSON representation validator。

### Closed-object defect precedence

若同一 closed object 同时存在多个 schema defect：

```text
required-member presence
    checked first in normative field order

unknown own members
    checked only after all required members exist
    first failure follows ECMAScript Object.keys order
```

Required-member order 固定：

```text
GameEntry:            formatVersion → initial → subsystems
InitialFrameTarget:   subsystem → input
SubsystemDescriptor:  key
```

Descriptor traversal 按 declaration order；duplicate detection 完成后才检查 initial membership。

---

## 8. Own-member / Prototype Safety

Wire representation validation保证 supported JsonObject own properties是 enumerable data properties；但 Game Package schema logic仍 MUST NOT通过 prototype chain读取缺失成员。

所有 required-member presence/read MUST等价于：

```ts
hasOwn(object, key)
Object.getOwnPropertyDescriptor(object, key)
```

并且只读取 descriptor 的 own data `value`。

禁止在确认 own member存在前使用：

```ts
object[key]
object.formatVersion
object.initial
object.subsystems
```

原因：普通 plain object 允许继承 `Object.prototype`；缺失 own member时，直接属性访问可能执行 inherited getter。

Regression MUST证明给 `Object.prototype` 临时安装 `formatVersion / initial / subsystems / subsystem / input / key` getter时，缺失 own member 的 validation：

```text
inherited getter read count = 0
```

Game Package 不把 prototype member 当作 document member。

---

## 9. Format Version

```text
missing formatVersion
    → GAME_ENTRY_INVALID

present but non-number
    → GAME_ENTRY_INVALID

finite number === 1
    → current v1

finite number !== 1
    → GAME_ENTRY_VERSION_UNSUPPORTED
```

非 finite number 在更早的 Wire representation stage 已经 invalid，因此属于 `GAME_ENTRY_INVALID`，不是 unsupported-version。

首批无 coercion、fallback、migration、legacy parser、dual model。

---

## 10. Error Contract

Stable public facts：

```text
GamePackageError class
constructor signature
error.code
error.path
```

Not stable：

```text
human Error.message
stack wording
engine syntax wording
Wire internal message
cause concrete type
```

`cause` MAY保留 diagnostics，但 compatibility branching MUST只依赖 class/code/path。

### Runtime construction

Constructor MUST：

```text
copy supplied path
→ Object.freeze(copied path)
→ expose copied frozen array as error.path
```

Caller 后续修改 constructor input array MUST NOT影响 `error.path`；普通 JS mutation也 MUST NOT改写已发布 path。

### Total expected-error mapping

所有 expected invalid input MUST收敛为 `GamePackageError`；`WireValidationError` / `JsonTextSyntaxError` 不得成为 expected consumer surface。

```text
parseGameEntryV1 runtime non-string
→ GAME_ENTRY_INVALID []

malformed JSON text
→ GAME_ENTRY_INVALID []

Wire representation failure under ["initial","input",...]
→ INITIAL_INPUT_INVALID
→ preserve full path

Wire representation failure at/past ["subsystems",i,"key",...]
→ SUBSYSTEM_KEY_INVALID
→ preserve full path

all other Wire representation failures
→ GAME_ENTRY_INVALID
→ preserve Wire path

top-level non-object
→ GAME_ENTRY_INVALID []

missing/unknown top-level member
→ GAME_ENTRY_INVALID [member]

initial non-object
→ GAME_ENTRY_INVALID ["initial"]

missing/unknown initial member
→ GAME_ENTRY_INVALID ["initial", member]

initial.subsystem non-string
→ GAME_ENTRY_INVALID ["initial","subsystem"]

subsystems non-array
→ GAME_ENTRY_INVALID ["subsystems"]

subsystem descriptor non-object
→ GAME_ENTRY_INVALID ["subsystems",i]

missing/unknown descriptor member
→ GAME_ENTRY_INVALID ["subsystems",i,member]

descriptor key non-string/empty
→ SUBSYSTEM_KEY_INVALID ["subsystems",i,"key"]

finite numeric formatVersion != 1
→ GAME_ENTRY_VERSION_UNSUPPORTED ["formatVersion"]

duplicate key
→ SUBSYSTEM_KEY_DUPLICATE ["subsystems",laterIndex,"key"]

initial subsystem string not declared
→ INITIAL_TARGET_UNDECLARED ["initial","subsystem"]
```

When multiple defects exist, §7 precedence decides the unique reported failure.

---

## 11. `ValidatedGameEntryV1` Trust Boundary

Validation success不是“给 caller object 加类型”。成功必须：

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

因此 source mutation after validation MUST NOT改变 validated result，且 returned topology/input 的普通 JS mutation不能改变其状态。

`parseGameEntryV1` 与 `validateGameEntryV1` 具有相同 snapshot semantics。

---

## 12. Snapshot Semantics / Safety

Snapshot MUST保留：

```text
JsonValue semantic value
subsystems declaration order
exact key strings
negative-zero semantics where present in direct-value input
all business JSON member names
```

Snapshot MUST NOT调用 getter / `toJSON()` / custom normalization / business parser。

`__proto__` / `constructor` 等 MUST作为 ordinary JSON data member处理，不得获得 prototype authority。Object member construction MUST使用安全 data-property semantics，不能让 `target[key] = value` 把 `"__proto__"` 解释成 prototype mutation。

Prototype identity与 shared-reference identity不是 public semantic contract；JsonValue semantic value才是。

### Deep safety

Snapshot construction MUST：

```text
avoid recursion proportional to JSON nesting depth
avoid exponential expansion of shared acyclic graphs
```

推荐 internal strategy：explicit work stack + WeakMap memo + children-complete freeze。算法选择不形成 public API。

---

## 13. JSON Text Boundary

`parseGameEntryV1` 复用 `@loomrealm/wire.parseJsonText` observable semantics。

Game Package 不建立：

```text
custom JSON parser
canonical JSON
duplicate-member source detector
streaming parser
UTF-8 decoder
JSON-RPC
```

Duplicate JSON source member 行为跟随冻结的 Wire / ECMAScript `JSON.parse` semantics。若未来要求 source-level duplicate rejection，应回到 Wire/parser contract重新评估，不得在 Game Package 私藏第二解析器。

---

## 14. Resource / Complexity Boundary

Current Game Package v1 不冻结：

```text
MAX_GAME_ENTRY_BYTES
MAX_GAME_ENTRY_DEPTH
MAX_SUBSYSTEM_COUNT
MAX_KEY_BYTES
MAX_INITIAL_INPUT_BYTES
```

这些属于未来 formal policy；Host/product 可在 raw document acquisition阶段施加自己的资源限制，但不得偷偷改变 Game Entry semantic contract。

本包算法本身 MUST deep-input safe，并在正常 supported input上保持接近 visited representation size 的线性 traversal；不得重新引入 recursion-stack 或 per-depth path-copying 的平方退化。

---

## 15. Launcher Consumption Boundary

Runtime-product path 固定：

```text
Game source
→ matching Platform Launcher
    → @loomrealm/game-package
    → own Platform manifest validator
    → exact Game↔Platform key-set join
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

Game Package 不提供 `LogicalGameBootstrap` constructor 给 Main；该 projection属于 Platform Launcher / Main bootstrap integration boundary。

M2 不用 fake planner 冒充真实 consumer qualification：

```text
M6  Hostra Launcher = first Runtime-product consumer
M15 PWA Launcher    = second Runtime-product consumer
M5  Main            = explicit non-consumer
```

---

## 16. Package / Build Shape

第一实现：

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

Metadata baseline：

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

不建立 `/testing` export。

---

## 17. Automated Closure Matrix

Implementation baseline MUST覆盖：

```text
Representation / parse
    valid minimal text
    malformed JSON
    runtime non-string parse input mapped
    top-level object required
    unsupported JS/exotic/accessor/sparse/cyclic rejected
    Wire failure under initial.input → INITIAL_INPUT_INVALID
    Wire failure under subsystem key → SUBSYSTEM_KEY_INVALID
    other Wire failure → GAME_ENTRY_INVALID
    duplicate source member follows Wire semantics

Closed schema / prototype safety
    exact top-level / initial / descriptor
    missing required member exact path
    unknown member exact path
    module/launcher/env/platform rejected at schema layer
    same names allowed inside initial.input
    inherited Object.prototype getters never executed
    inherited properties never satisfy required members

Version / keys / initial
    numeric 1 accepted
    string 1 invalid
    other finite numeric version unsupported
    non-finite version representation-invalid
    empty key rejected
    whitespace-only follows current contract
    case-sensitive / no trim / no normalization
    duplicate points to later occurrence
    declaration order preserved
    initial target must be declared
    arbitrary JsonValue input

Snapshot
    detached from source
    source mutation no effect
    deeply frozen including nested input
    deep input no call-stack overflow
    shared DAG no exponential copy
    __proto__ remains data
    no getter/toJSON execution

Errors
    stable GamePackageError class/constructor/code/path
    path copied + frozen
    total mapping / error precedence
    message not used for branching
    expected Wire/JSON syntax errors do not leak

Package boundary
    only runtime dependency = wire
    no foundation/main/launcher/platform API
    root export only
    workspace build/test
    npm pack --dry-run
```

---

## 18. Implementation Stages

```text
Stage A  package skeleton / metadata / root export
Stage B  public model + GamePackageError runtime contract
Stage C  representation reuse + own-member-safe schema validation
Stage D  total error mapping / precedence
Stage E  detached deep-frozen snapshot
Stage F  package conformance / boundary qualification
Stage G  real downstream consumer qualification (M6 / M15)
```

Stages A–F完成后：

```text
Implemented Baseline / Core Contract Frozen
```

Stage G 不阻塞 M2 local implementation closure，但决定 downstream consumer proof。

---

## 19. Explicit Non-goals

```text
filesystem/Fetch Game loader
installation/catalog lifecycle
Platform Launch Manifest
exact Platform binding join
module resolution
Definition Module ABI
RuntimeHosting
Main bootstrap model
Runtime/Frame/Data authority
generic manifest/schema framework
schema DSL
canonical JSON
custom duplicate-key parser
cross-platform universal launcher config
launcher registry
```

---

## 20. Closure Criteria / Final Invariants

Game Package 达到 implementation-ready 的定义：

> **实现者只需要选择 internal algorithm / file-private helper；不再需要自行决定 public API、key semantics、schema access safety、error category/path/precedence、snapshot semantics、dependency boundary或 consumer ownership。**

M2 local close 必须证明：

```text
untrusted text/value
→ deterministic own-member-safe validation
→ detached deeply immutable ValidatedGameEntryV1

failure
→ stable GamePackageError constructor/code/frozen-path
→ total expected-error mapping
→ zero Wire/syntax error leakage
→ filesystem/module import/Runtime side effect = 0
```

最终 invariants：

1. Descriptor v1精确只有 `{key}`；
2. Game Package只拥有 common document representation/validation，不是 Runtime/application role；
3. Runtime-product primary consumers是 matching Platform Launchers；Main与 business不是消费者；
4. JsonValue semantics直接复用 `@loomrealm/wire`；
5. closed schema只约束 GameEntry/Initial/Descriptor，`initial.input`保持 opaque；
6. key只执行 non-empty + exact/case-sensitive equality，不 trim/normalize；
7. duplicate必须 reject，declaration order保留但不形成 launch/dependency authority；
8. schema logic只读 own data members，缺失成员不得触发/接受 inherited getter/property；
9. successful validation返回 detached deeply immutable snapshot，caller input永不被 mutate/freeze；
10. snapshot/deep validation不得重新引入递归栈、平方 path-copy 或 shared-DAG 指数展开；
11. expected invalid input统一为 stable `GamePackageError` constructor/class/code/path，path copy+freeze；
12. all expected Wire/syntax failures按 total mapping收敛，不泄漏 dependency error；
13. Game Package不解析 Platform manifest、不 resolve module、不创建 Runtime；
14. matching Launcher完成 Game + Platform full PREPARE后才向 Main投影 logical bootstrap；
15. current v1直接实现该模型，不保留旧 `{key,module}` parser/alias；
16. 不为 Hostra/PWA当前相似需求抽 universal launcher schema；
17. 新 public primitive/API只有真实消费者证明必要时才进入下一轮 closure review。
