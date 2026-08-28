# ADR 0021：Concrete Platform 是 Session Composition Object，Launcher 是 Platform 内部 PREPARE Component

> 状态：Accepted  
> 日期：2026-08-28  
> 影响范围：Platform Composition、Hostra/PWA Launcher、Main bootstrap、Main-facing Platform ports、M5/M6/M15  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md)、[ADR 0019](./0019-platform-launch-manifest-boundary.md)、[ADR 0020](./0020-game-entry-consumer-boundary.md)

## 背景

ADR 0020 正确冻结了以下边界：

```text
matching Launcher consumes Game Entry
Launcher closes Game + current-platform PREPARE
Main receives LogicalGameBootstrap only
PlatformLaunchPlan remains Platform-private
Main does not depend on Game Package / concrete Launcher
```

但 ADR 0020 进一步把 prepared result 具体表达成：

```text
LogicalGameBootstrap
+
plan-bound RuntimeHosting
```

Hostra/PWA Launcher DESIGN 又把该表达固化成：

```ts
interface PreparedPlatformGame {
  logicalBootstrap: LogicalGameBootstrap;
  runtimeHosting: RuntimeHosting;
}
```

这会把两个不同 lifetime 的对象绑进一个 DTO：

```text
per-game PREPARE result
!=
long-lived physical Platform capability
```

同时，产品开发者真正自然的组合方式是：

```ts
const platform = createPwaPlatform(...);
const prepared = await platform.prepareGame(source);
await runMain({ bootstrap: prepared.logicalBootstrap, platform });
```

因此需要澄清 Launcher、Concrete Platform、Platform Ports 与 Main 的关系。

---

## 决策 1：Concrete Platform 是产品组合对象

Hostra/PWA 产品 composition root MUST 建立当前 Session 的 concrete Platform instance：

```text
apps/desktop
    → HostraPlatform

apps/pwa
    → PwaPlatform
```

Phase 1 推荐：

```text
one concrete Platform instance
    → one prepared Game
    → one Main Session
```

新 Game / 新独立 Session 使用 fresh Platform instance；不要求在同一个 mutable object 上执行 plan rebinding。

Concrete Platform instance 可以聚合当前平台真实需要的 capability implementation，例如：

```text
Game PREPARE component
RuntimeHosting
DeadlineScheduler
RendererHosting        later
DataConnectionBroker   later
Content realization    later
```

这只是 composition object，不等于创建 universal cross-platform `Platform` contract，也不要求这些实现位于一个 npm package。

---

## 决策 2：Launcher 是 Concrete Platform 内部的 PREPARE Component

固定：

```text
Product caller
    ↓
Concrete Platform.prepareGame(...)
    ↓
matching Launcher component
    ↓
@loomrealm/game-package
+ current Platform Launch Manifest
+ resolver/security/preflight
```

因此：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

仍然存在，并继续拥有各自 platform-specific Game PREPARE / executable planning 规则；但它们不是完整 Platform object，也不是 Main 直接依赖。

Product composition MAY 直接使用低层 Launcher API 做测试/tooling，但标准 Runtime-product developer path SHOULD 面向 concrete Platform instance。

---

## 决策 3：PREPARE 安装 PlatformLaunchPlan 到当前 Platform Instance

PREPARE：

```text
obtain Game Entry
→ Game Package validation
→ current Platform Manifest validation
→ exact key-set join
→ executable resolution
→ hosting/security preflight
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
```

成功后：

```text
PlatformLaunchPlan
    → installed/frozen inside current concrete Platform instance

LogicalGameBootstrap
    → returned to composition / passed to Main
```

`PlatformLaunchPlan` MUST NOT进入 Main。

PREPARE failure仍保证：

```text
business Runtime creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

本 ADR 不改变 ADR 0020 的 PREPARE atomicity。

---

## 决策 4：Main 接收 Logical Bootstrap + Main-facing Platform View

标准 composition：

```ts
const platform = createPwaPlatform(platformOptions);
const prepared = await platform.prepareGame(gameSource);

const result = await runMain({
  bootstrap: prepared.logicalBootstrap,
  platform,
  policy,
});
```

Main MUST NOT：

```text
call platform.prepareGame()
read Game Entry / Platform manifest
read PlatformLaunchPlan
import PwaPlatform / HostraPlatform concrete type
```

Main 只消费：

```text
LogicalGameBootstrap
+
Main-facing narrow capability view
```

Concrete Platform MAY structural-satisfy that view directly。

---

## 决策 5：Role-local Capability Bundle != Platform Mega-interface

`@loomrealm/platform-ports` 继续只定义 independent capability contracts。

M5 例如可冻结：

```text
DeadlineScheduler
RuntimeHosting
HostedRuntime / Main-side Runtime Control establishment capability
```

而 `@loomrealm/main` MAY 为调用 ergonomics 定义 consumer-owned role-local bundle：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly runtimeHosting: RuntimeHosting;
}
```

固定：

```text
MainPlatform
    = capabilities Main currently requires
    != complete LoomRealm Platform
    != service locator
    != physical implementation owner
```

未来 Renderer/Data capability 只有在对应 milestone 出现真实 Main consumer 后才加入相关 role view；不得为了“平台完整”提前占位。

---

## 决策 6：Lifetime 必须分离

固定 lifetime：

```text
Concrete Platform instance lifetime
    contains one prepared Session composition

LogicalGameBootstrap lifetime
    immutable logical Session input

PlatformLaunchPlan lifetime
    Platform-private immutable plan for that prepared Session

Main Session lifetime
    application authority lifetime

Hosted Runtime lifetime
    child physical Runtime lifetime
```

因此：

```text
Platform lifetime != Runtime lifetime
Prepared Game != RuntimeHosting DTO
Main Session authority != Platform object
Platform capability lifetime != protocol carrier lifetime
```

---

## 决策 7：RuntimeHosting 属于 Platform Instance 的 Main-facing Projection

Launcher MAY 提供 RuntimeHosting implementation primitives / plan consumers，但 outward Main-facing capability 由 prepared concrete Platform instance 暴露：

```text
HostraPlatform
    owns installed HostraLaunchPlan
    exposes runtimeHosting

PwaPlatform
    owns installed PwaLaunchPlan
    exposes runtimeHosting
```

Main：

```text
launch(subsystemKey)
→ platform.runtimeHosting
→ lookup platform-private frozen plan
→ physical Runner Runtime
```

Main 永远不重新传 module/path/URL/Worker options/Node options。

---

## 决策 8：Platform Object 不意味着 Platform Mega-package

允许：

```ts
const platform = createPwaPlatform(...);
```

不推出：

```text
必须存在 @loomrealm/platform-pwa mega-package
必须把 launcher/renderer/data/content 放在同一个 package
必须定义 universal Platform API
```

Concrete Platform factory MAY 最初只存在于：

```text
apps/desktop composition root
apps/pwa composition root
```

当跨产品复用证明需要时再提取 package。

---

## 结果

推荐产品开发流程变为：

```text
Product entry
    ↓
create concrete Platform instance
    ↓
platform.prepareGame(source)
    ↓
Launcher component closes PREPARE
    ├── install PlatformLaunchPlan inside Platform
    └── return LogicalGameBootstrap
    ↓
runMain({ bootstrap, platform })
    ↓
Main consumes narrow platform capabilities
    ↓
RuntimeHosting / Runner / Runtime Control
    ↓
Subsystem business
```

业务 Definition 仍只依赖：

```text
@loomrealm/subsystem
```

不得依赖 Main / Platform / Launcher。

---

## Compatibility / Supersession

本 ADR **不推翻 ADR 0020** 的核心 consumer boundary。

仍然成立：

```text
Launcher owns Game Entry consumption
Main receives LogicalGameBootstrap
Main does not depend on Game Package / concrete Launcher
PlatformLaunchPlan remains Platform-private
```

本 ADR 只部分取代 ADR 0020 决策 5 中以下过度具体的 implementation shape：

```text
Prepared result = LogicalGameBootstrap + plan-bound RuntimeHosting
```

替换为：

```text
Concrete Platform.prepareGame
    installs PlatformLaunchPlan internally
    returns LogicalGameBootstrap

Main receives
    LogicalGameBootstrap + Main-facing view of the same prepared Platform instance
```

---

## Final Invariants

1. Concrete Platform is the product/session composition object, not a Core authority owner.  
2. Launcher is a Platform-internal PREPARE component, not the complete Platform.  
3. PlatformLaunchPlan remains Platform-private and immutable after PREPARE.  
4. Main receives logical bootstrap + narrow platform capability view, never executable material.  
5. Concrete Platform MAY structurally satisfy role-local views; Core MUST NOT depend on concrete Platform types.  
6. Role-local capability bundle is not a universal Platform service locator.  
7. Platform object existence does not imply one mega npm package.  
8. Phase 1 Platform instance is session-scoped and one-shot prepared.  
9. Main does not call Game PREPARE; composition does so before Main starts.  
10. Business remains platform-neutral and depends only on its author SDK.
