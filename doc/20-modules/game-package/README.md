# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Game Entry document validator、broader Game Installation/Catalog/Repository concern，以及与 matching Platform Launcher 的连接边界  
> 依赖：[Game Package v1](../../15-contracts/game-package-v1.md)、[平台组合系统](../../10-architecture/platform-composition-system.md)、[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)、[存储与内容系统](../../10-architecture/storage-system.md)  
> Hostra realization：[Hostra Game Launcher / Node Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> PWA realization：[PWA Game Launcher / Worker Runner Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)  
> 最近复核：2026-08-20

> [!NOTE]
> 本文描述较宽的 Game Installation / Package module concern；它不等于 `@loomrealm/game-package` npm package。该 npm package 的 exact implementation boundary 以 [package design source](https://github.com/lithdoo/loom-realm/blob/main/packages/game-package/DESIGN.md) 为准。

---

## 1. Concern Map

```text
Game Installation / Package concern
├── Common Game Entry Validator
├── installation/source acquisition
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── package-level validation coordination
```

其中只有第一项当前明确落在：

```text
@loomrealm/game-package
```

Executable Definition Module resolver 不属于 common Game Package；分别由 matching Platform Launcher/Profile 拥有。

---

## 2. `@loomrealm/game-package`

只处理：

```text
GameEntryV1 document model
formatVersion
Descriptor {key}
initial target/input
closed schema
key-set validation
validated detached immutable snapshot
```

不处理：

```text
filesystem/Fetch Game source lifecycle
Platform Launch Manifest
module resolution
Definition Module ABI
RuntimeHosting
Main bootstrap state
Process/Worker
```

它不是 Runtime role，也不是 application orchestration API。

---

## 3. Game Entry Model

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

```text
key
    application Subsystem identity

initial.subsystem
    initial Frame logical target

initial.input
    opaque platform-neutral business JsonValue
```

以下不属于 common Game Entry：

```text
module
launcher.type/entry
env/argv
Node/Worker options
Transport/bootstrap material
```

---

## 4. Common Validator

负责：

```text
Wire JsonValue representation
closed Game Entry schema
formatVersion current version
closed initial/descriptor schema
initial.input JsonValue
key exact non-empty / uniqueness
initial target reference
detached immutable snapshot
```

Key 不 trim/case-fold/Unicode-normalize。

`initial.input` 业务 member name 完全 opaque；其中出现 `module`、`env`、`platform`、`__proto__` 等字段不构成 Platform config。

Common validation必须：

```text
pure/deterministic
no filesystem/Fetch
no module import
no Runtime side effect
no caller-input mutation/freeze
```

---

## 5. Runtime-product Consumer Boundary

Matching Platform Launcher 是主要 Runtime-product consumer：

```text
Hostra game source
→ @loomrealm/game-launcher-hostra
    → @loomrealm/game-package

PWA game source
→ @loomrealm/game-launcher-pwa
    → @loomrealm/game-package
```

Product application不需要：

```text
parseGameEntryV1(...)
→ pass ValidatedGameEntryV1 to launcher
```

而是调用 matching launcher 的 prepare/bootstrap API。

Tooling/validator/editor MAY 直接消费 `@loomrealm/game-package`。

---

## 6. Platform Launch Planner Boundary

Launcher内部：

```text
ValidatedGameEntryV1
+
Validated current Platform Launch Manifest
        ↓
exact key-set join
all executable resolution
security/hosting capability preflight
        ↓
immutable PlatformLaunchPlan
+
immutable LogicalGameBootstrap
```

Common Game Package不提供：

```text
resolveModule()
createRuntime()
PlatformLaunchOptions
LogicalGameBootstrap constructor for Main
```

---

## 7. Main Boundary

Main 不直接消费：

```text
GameEntryV1
ValidatedGameEntryV1
formatVersion
GamePackageError
```

Matching Launcher/Composition 在 full PREPARE 后向 Main 投影：

```text
LogicalGameBootstrap
    subsystemKeys
    initial {subsystemKey,input}
```

因此：

```text
Game Entry document model != Main application bootstrap model
```

---

## 8. Zero-side-effect Closure

Full Session PREPARE：

```text
Launcher obtains Game Entry
→ common validation
→ Platform manifest validation
→ exact key join
→ all executable resolution/capability checks
→ immutable PlatformLaunchPlan
→ immutable LogicalGameBootstrap
────────────────────────────────────────
first Runtime side effect
```

不能边读 Descriptor边启动 Runtime。

---

## 9. Definition Module ABI Boundary

Definition Module不是 Game Package identity field。

```text
same key
    Hostra → artifact A
    PWA    → artifact B
```

A/B MAY不同，但必须满足统一 `SubsystemDefinitionFactory` author/host contract与 equivalent observable semantics。

---

## 10. Catalog / Repository

Catalog/Repository属于 broader Game Installation/Content concern，不自动进入 `@loomrealm/game-package`。

可能职责：

```text
logical installation/catalog identity
async readonly acquisition
same-ID concurrent dedup
immutable cache
close/cancel
resource metadata
```

它们仍不得承担 Subsystem executable resolution，除非未来明确拆出新的 trusted Platform capability。

---

## 11. Content / Execution Separation

```text
Platform executable resolver
    selected business executable module

Readonly Content API
    logical content only
```

可以复用底层 safe path/install primitives，但不得把 executable capability暴露给 ordinary Content client。

---

## 12. Tests

Common package/module tests：

```text
valid/invalid Game Entry
formatVersion
closed top-level/initial/descriptor
exact key semantics
initial JsonValue opaque business fields
validated snapshot detached/immutable
no I/O/module import/Runtime side effect
```

Cross-package：

```text
same Game Entry source
→ Hostra launcher prepare
→ PWA launcher prepare
→ equivalent LogicalGameBootstrap
```

不要把“application手动传同一个 ValidatedGameEntry 给两个 planner”当作目标 API。

---

## 13. Core Invariants

1. Game Entry一次性声明完整 logical key set；
2. Descriptor v1精确 `{key}`；
3. `@loomrealm/game-package` 只实现 common document model/parse/validation/snapshot；
4. matching Platform Launchers 是 Runtime-product consumers；
5. Main/业务不直接依赖 Game Package；
6. full Game+Platform PREPARE先于任何 Runtime side effect；
7. module属于 current Platform Launch Manifest；
8. Definition Module与 Host-owned Runner分离；
9. executable capability与 Content capability分离；
10. broader Catalog/Repository concern不自动扩大 npm package职责；
11. Hostra/PWA可以为同一 key选择不同 artifact，但必须实现统一 ABI/semantics。
