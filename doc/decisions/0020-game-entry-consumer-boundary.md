# ADR 0020：Game Entry 消费边界归 Platform Launcher，Main 只接收 LogicalGameBootstrap

> 状态：Accepted  
> 日期：2026-08-20  
> 影响范围：Game Package、Hostra/PWA Launcher、Main bootstrap、Platform Composition、package dependency graph、M2/M5/M6/M15  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md) Platform Composition ownership、[ADR 0019](./0019-platform-launch-manifest-boundary.md) Game topology / Platform executable binding 分离  
> 后续澄清：[ADR 0021](./0021-session-scoped-platform-instance.md) 将本 ADR 决策 5 中过度具体的 `LogicalGameBootstrap + plan-bound RuntimeHosting` prepared-result 形态收敛为 session-scoped concrete Platform instance；本 ADR 的 Game Entry consumer boundary 与 Main logical-only boundary 保持不变。

## 背景

ADR 0019 已经把：

```text
Game logical topology
!=
Platform executable binding
```

彻底分开。

但 current 文档仍有若干表达使 `ValidatedGameEntryV1` 看起来像 Main 的直接输入：

```text
Game Package → Main
Main reads Game Entry initial target/input
main → game-package
```

这会重新引入另一种 authority/representation 耦合：

1. Main 被迫理解 installation document contract / `formatVersion`；
2. Product composition 需要先手动调用 Game Package，再调用 Launcher；
3. Launcher 无法真正拥有完整 Game + current Platform PREPARE transaction；
4. Game Entry document model 与 application bootstrap state 被误当成同一模型。

---

## 决策 1：Game Package 不是 Runtime role

`@loomrealm/game-package` 是 platform-neutral document validation capability。

它拥有：

```text
GameEntryV1 schema
Descriptor {key}
initial target/input
closed validation
validated immutable snapshot
```

它不拥有：

```text
Main Session authority
RuntimeHosting
Platform manifest
executable binding
Process/Worker
business SDK
```

Main / Renderer / Subsystem / Content 才是 platform-neutral Runtime/application roles。

---

## 决策 2：Matching Platform Launcher 是主要 Runtime-product consumer

Hostra：

```text
game source
→ @loomrealm/game-launcher-hostra
    → @loomrealm/game-package
    → launch.hostra.json
    → exact join / preflight
```

PWA：

```text
game source
→ @loomrealm/game-launcher-pwa
    → @loomrealm/game-package
    → launch.pwa.json
    → exact join / preflight
```

Product composition 在 Game bootstrap 路径上调用 matching launcher；不要求先显式调用 `@loomrealm/game-package`。

Tooling / validator / editor MAY 直接消费 `@loomrealm/game-package`，但这不形成 Runtime role dependency。

---

## 决策 3：Launcher PREPARE 一次性闭合 Game + Platform

固定：

```text
read/obtain Game Entry
→ @loomrealm/game-package validate
→ validate current Platform Launch Manifest
→ exact key-set join
→ resolve all current-platform executable bindings
→ hosting/security capability preflight
→ freeze immutable PlatformLaunchPlan
→ project Main-facing LogicalGameBootstrap
──────────────────────────────────────────
only now may the prepared result become usable for Runtime bootstrap
```

任一 PREPARE failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

---

## 决策 4：Main 接收 LogicalGameBootstrap，不接收 GameEntryV1

概念：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

该 projection：

```text
MUST 只包含 Main 需要的 logical facts
MUST 保持 subsystemKey exact identity
MUST 保持 initial business JsonValue semantics
MUST immutable
MUST NOT 包含 formatVersion
MUST NOT 包含 ValidatedGameEntry brand
MUST NOT 包含 module/path/URL
MUST NOT 包含 Platform manifest
MUST NOT 包含 Runner/Node/Worker/Port
MUST NOT 成为 universal launcher schema
```

Main 不解析 Game Entry，不重做 Game Package validation。

---

## 决策 5：Prepared result 是两个正交 projection

Prepared Hostra/PWA result 概念上同时提供：

```text
LogicalGameBootstrap
    → Main logical bootstrap

plan-bound RuntimeHosting
    → Main logical launch port
```

`PlatformLaunchPlan` 保持 Platform-private；Main 只通过 RuntimeHosting lookup 使用它。

不要求 Hostra/PWA 共享一个可发布 `PreparedPlatformGame` package/type。共同点是 architecture semantics，不是万能跨平台 config/API。

---

## 决策 6：依赖方向

```text
@loomrealm/wire
    ↓
@loomrealm/game-package
    ↓
@loomrealm/game-launcher-hostra / pwa
    ↓
apps/* composition
```

Main：

```text
@loomrealm/main
    → runtime-control / renderer-control / wire as required
    ✗ game-package
    ✗ concrete game-launcher-*
```

Business：

```text
business
    → @loomrealm/subsystem
    ✗ game-package
    ✗ game-launcher-*
```

Higher platform integration MAY 依赖 Main-facing type/port surface；Main 不得反向依赖 concrete launcher。

---

## 决策 7：Launcher 仍是窄能力 package

Launcher PREPARE 拥有 Game document validation orchestration，不意味着它拥有：

```text
Renderer Hosting
DataAuthority
full DataConnectionBroker
Content product
Main Frame authority
business lifecycle
```

`apps/desktop` / `apps/pwa` 仍是完整 composition roots。

---

## 结果

```text
Game Entry document
        ↓ matching launcher PREPARE
    @loomrealm/game-package
        +
    platform manifest/resolver/policy
        ↓
    immutable LaunchPlan
        +
    LogicalGameBootstrap
        ↓
apps/* installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound RuntimeHosting
```

因此：

```text
GameEntryV1 != Main bootstrap model
Game Package != Runtime role
Application bootstrap caller → matching launcher
Main → logical facts only
```

---

## Compatibility

本决策不改变 Game Entry v1 wire/schema shape，不创建 v2。

它只直接修正 preimplementation package/consumer boundary：

```text
no Main → game-package dependency
no application-required manual game-package step
no compatibility adapter
```

---

## 重新评估条件

- third-party launcher 需要稳定跨实现 prepared-result wire；
- Main bootstrap facts 扩张到需要独立共享 capability package；
- lazy/optional Subsystem 改变 topology projection；
- Game Entry 形成已部署 compatibility obligation；
- installation/catalog 系统需要新的公开 document acquisition contract。
