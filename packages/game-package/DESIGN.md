# `@loomrealm/game-package` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 最近复核：2026-08-20  
> 目标：实现 Game Package v1 的 platform-neutral 公共 Game Entry 解析、logical Subsystem topology 与集合级静态校验。  
> 正式契约：[Game Package v1](../../doc/15-contracts/game-package-v1.md)

核心原则：

> **本包只把不可信 Game Entry 输入收敛成可信 logical topology；不解析任何 Platform Launch Manifest，不解析 executable module，不创建 Runtime。**

---

## 1. Position

```text
raw game.json / JSON text
        ↓
@loomrealm/game-package
        ↓
ValidatedGameEntryV1
        ↓
Main logical topology

ValidatedGameEntryV1
        +
platform launcher manifest
        ↓
Platform Launch Planner
```

`@loomrealm/game-package` 是 contract/capability package，不是 filesystem loader、Node launcher、Worker launcher、Content Repository或 Platform Composition。

---

## 2. Low-level Dependency

本包 MAY依赖：

```text
@loomrealm/wire
    JsonValue / JsonObject
    JSON text parsing primitives
    closed-object / exact-key validation helpers
```

依赖方向：

```text
wire
  ↑
game-package
```

`game-package` 不自行建立第二套 JSON value model，也不依赖 `foundation` carrier、role package或 platform launcher。

---

## 3. Public Model

候选：

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

Validated value SHOULD使用 branded/opaque boundary，避免 consumer重新把 arbitrary object当成已验证 topology。

---

## 4. Public API

候选：

```ts
parseGameEntryV1(text: string): ValidatedGameEntryV1
validateGameEntryV1(value: unknown): ValidatedGameEntryV1
getSubsystemKeys(game): readonly string[]
getInitialTarget(game): { subsystem: string; input: JsonValue }
```

`parseGameEntryV1` 不应返回“看似 typed 但尚未 validation”的公开对象；parse boundary要么成功产出 validated value，要么失败。

所有 API必须保持：

```text
pure/deterministic
no filesystem
no Fetch
no module import
no Runtime side effect
```

---

## 5. Validation

负责：

```text
JSON-compatible value
closed schema
formatVersion == 1
initial closed schema
initial.input JsonValue
subsystems[] closed schema
key non-empty
key exact/case-sensitive uniqueness
initial.subsystem declared
```

不负责：

```text
Hostra/PWA binding completeness
module path
module existence/containment
Definition Module ABI
Node/Worker availability
Process/Worker creation
```

---

## 6. Authority Boundary

本包可以知道：

```text
Game Entry
initial target/input
Subsystem logical key
```

不得知道：

```text
module
Definition Module physical/logical path
Hostra/PWA
Node/Worker
Runner
WebSocket/MessagePort
bootstrap token
Data generation/profile
```

即使两个 Platform Launch Manifest当前都使用 `{key,module}`，也不得抽回本包形成“通用 launcher schema”。

---

## 7. Platform Join

本包只向 launcher提供已经验证的 logical key set。

```text
ValidatedGameEntryV1
    keys = {loom.map, loom.battle}
```

Hostra/PWA各自负责：

```text
parse own manifest
validate own schema
exact key-set join
resolve own executable bindings
build own immutable LaunchPlan
```

本包不提供 `resolveModule()`、`PlatformLaunchOptions` 或 `createRuntime()`。

---

## 8. Error Surface

稳定 error categories至少：

```text
GAME_ENTRY_INVALID
GAME_ENTRY_VERSION_UNSUPPORTED
SUBSYSTEM_KEY_INVALID
SUBSYSTEM_KEY_DUPLICATE
INITIAL_TARGET_UNDECLARED
INITIAL_INPUT_INVALID
```

Platform binding/module/runtime errors不得混入本包。

---

## 9. Tests

至少：

```text
valid minimal entry
closed shape
format version
invalid JSON value
empty/duplicate key
case-sensitive key
undeclared initial target
module/launcher/env fields rejected
pure validation has no I/O
parse returns validated-or-error, not unchecked public model
wire JsonValue semantics reused
stable key iteration/order semantics as documented
same validated entry can feed Hostra/PWA planners
```

---

## 10. Explicit Non-goals

```text
generic manifest framework
schema DSL
installation resolver
Content repository
platform launch registry
RuntimeHosting
Definition Module loader
cross-platform executable abstraction
```

如果一个 API需要理解 Node/Worker/module path才能解释，就不属于 `game-package`。

---

## 11. Module Design != npm Package Boundary

`doc/20-modules/game-package/` 可以讨论更宽的 Game Installation/Catalog/Repository 协作，但公开 npm package职责以本文件和 `package-architecture.md` 为准。

因此：

```text
Game Package system/module concern
    MAY coordinate catalog/repository concepts

@loomrealm/game-package
    MUST stay focused on common Game Entry model + validation
```

不要因为上层模块文档提到 Catalog/Repository就把这些能力全部塞入 `@loomrealm/game-package`。

---

## 12. Implementation Stages

### Stage 1

实现 types + parse/validate + fixtures，复用 `@loomrealm/wire` JSON primitives。

### Stage 2

用 Hostra launcher作为第一个真实 consumer，证明本包无需 module/platform字段。

### Stage 3

用 PWA launcher作为第二个 consumer，证明同一 `ValidatedGameEntryV1` 可进入不同 Platform Launch Planner。

### Stage 4

与 Main fake RuntimeHosting vertical slice集成，证明 Main launch intent只依赖 subsystemKey。

---

## 13. Final Invariants

1. Descriptor v1只有 `{key}`；
2. Game Entry只表达 logical topology + initial business input；
3. JsonValue/JSON representation复用 `@loomrealm/wire`，不建立第二套 model；
4. parse/validate纯且零 Runtime side effect；
5. public parse boundary产出 validated value或 error；
6. module/platform/runner不进入本包；
7. Platform manifest exact-set join属于对应 launcher；
8. Main消费 logical key，不消费 executable binding；
9. Catalog/Repository等上层 module concern不自动扩大 npm package职责；
10. 不为两个平台当前相似字段抽“万能 launcher config”；
11. 当前 v1直接实现新模型，不保留旧 `{key,module}` parser。
