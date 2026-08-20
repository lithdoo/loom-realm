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

`@loomrealm/game-package` 是 contract/capability package，不是 filesystem loader、Node launcher、Worker launcher或 Platform Composition。

---

## 2. Public Model

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

## 3. Public API

候选：

```ts
parseGameEntryV1(text: string): GameEntryV1
validateGameEntryV1(value: unknown): ValidatedGameEntryV1
getSubsystemKeys(game): readonly string[]
getInitialTarget(game): { subsystem: string; input: JsonValue }
```

可合并 parse + validate，但必须保持：

```text
pure/deterministic
no filesystem
no Fetch
no module import
no Runtime side effect
```

---

## 4. Validation

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

## 5. Authority Boundary

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

## 6. Platform Join

本包只向 launcher提供已经验证的 key set。

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

本包不提供 `resolveModule()` 或 `createRuntime()`。

---

## 7. Error Surface

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

## 8. Tests

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
stable key iteration/order semantics as documented
same validated entry can feed Hostra/PWA planners
```

---

## 9. Explicit Non-goals

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

## 10. Implementation Stages

### Stage 1

实现 types + parse/validate + fixtures。

### Stage 2

用 Hostra launcher作为第一个真实 consumer，证明本包无需 module/platform字段。

### Stage 3

用 PWA launcher作为第二个 consumer，证明同一 `ValidatedGameEntryV1` 可进入不同 Platform Launch Planner。

### Stage 4

与 Main fake RuntimeHosting vertical slice集成，证明 Main launch intent只依赖 subsystemKey。

---

## 11. Final Invariants

1. Descriptor v1只有 `{key}`；
2. Game Entry只表达 logical topology + initial business input；
3. parse/validate纯且零 Runtime side effect；
4. module/platform/runner不进入本包；
5. Platform manifest exact-set join属于对应 launcher；
6. Main消费 logical key，不消费 executable binding；
7. 不为两个平台当前相似字段抽“万能 launcher config”；
8. 当前 v1直接实现新模型，不保留旧 `{key,module}` parser。
