# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定，current v1 在首次实现 compatibility boundary 形成前可按治理规则直接收口  
> 主要定义：产品目标、Game/Platform/Main 消费边界、跨平台原则、第一阶段验收方向  
> 最近复核：2026-09-11

本文是 LoomRealm 最高层产品事实源。下层架构、协议、模块和实施文档不得通过实现便利反向改变这里的产品边界。

Milestone live qualification 状态不由本文复制维护：当前汇总见 [`phase-1-delivery-plan.md`](../30-implementation/phase-1-delivery-plan.md)。M15 Hostra physical correction由 [ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md) formalize。

---

## 1. 产品目标

LoomRealm 是一个：

> **由只读 Game Entry 声明 platform-neutral logical Subsystem topology，由 matching Platform Launcher/launch profile 负责 common Game validation + current-platform executable preflight，由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA 等真实 Platform Composition 提供物理承载的模块化游戏运行平台。**

目标：

- 地图、菜单、对话、战斗等业务能力拆成边界明确的 Subsystem；
- reusable game-domain libraries 是 LoomRealm author API 的消费者，不自动成为 framework `@loomrealm/*` package；
- concrete game 显式组合 game libraries、game-specific Subsystem 与 logical content；
- Game Entry 显式声明当前 Session 完整 logical Subsystem key set 与 initial business input；
- `@loomrealm/game-package` 只验证 common document，不成为 Runtime role；
- product bootstrap caller 调 matching Platform Launcher/launch profile，不要求先手动调用 Game Package；
- Main 不解析 `game.json`、不依赖 `@loomrealm/game-package`、不接收 executable material；
- 每个平台独立拥有 Launch Manifest/schema/resolver，不建立万能 launcher option bag；
- 业务 Subsystem source 不依赖 Desktop/PWA/Transport/launch config；
- Main 是唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority application authority；
- physical host/composition负责 Process/Worker/Socket/Port/Window/Content/Provisioning topology，但不获得 application authority；
- Hostra/PWA 对相同 logical Game/scenario 得到等价 application outcome；
- 不同平台可以使用不同 Definition artifact/path/bytes，只要遵守相同 author ABI、formal semantics 与 business-observable result。

---

## 2. 总体闭环

```text
Game installation / source
        ↓
matching Platform Launcher / launch-profile PREPARE
    ├── @loomrealm/game-package
    │       Game Entry parse / validate
    ├── current Platform Launch Manifest parse / validate
    ├── exact Game↔Platform key-set join
    ├── executable resolution
    ├── installation/security containment
    └── hosting capability preflight
        ↓
Prepared Current-Platform Game
    ├── immutable LogicalGameBootstrap
    │       ↓
    │      LoomRealm Main
    │       │
    │       └── launch(subsystemKey)
    │
    └── plan-bound RuntimeHosting
            ↓
        physical Runner
            ↓
 platform-selected Definition Module
            ↓
     @loomrealm/subsystem/host
            ↓
       business behavior
```

Renderer/Data：

```text
Main committed authority
        ↓
Web Renderer
        ⇅ authorized Data Profile
Subsystem Runtime
```

核心边界：

```text
Game Entry document != Main bootstrap model
Game logical topology != Platform executable binding
external physical host != LoomRealm application authority
framework package != reusable game library != concrete game
```

---

## 3. Game Entry / Game Package

Game Package v1 document：

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

`key` 是 application Subsystem identity，由 concrete game 拥有；LoomRealm 不为 map 等业务预留 `loom.*` key prefix。

Game Entry 不声明：

```text
module
launcher.type / launcher.entry
Node/Worker selection
argv/env/options
WebSocket/MessagePort
Platform provisioning
bootstrap token / Data ticket
platform switch/options bag
```

`@loomrealm/game-package`：

```text
untrusted Game Entry
→ deterministic closed validation
→ detached immutable ValidatedGameEntryV1
```

它的 Runtime-product primary consumers 是 matching Platform Launchers/launch profiles，不是 Main 或业务 Subsystem。

---

## 4. Platform Launcher / Launch-profile PREPARE

Hostra launch profile：

```text
@loomrealm/game-launcher-hostra
    game.json via @loomrealm/game-package
    + launch.hostra.json
    → HostraLaunchPlan
```

这里的 **Hostra launch profile** 是 LoomRealm 内部 PREPARE + Node Runner realization；它不等于 external `lithdoo/hostra` Electron shell。

PWA：

```text
@loomrealm/game-launcher-pwa
    game.json via @loomrealm/game-package
    + launch.pwa.json
    → PwaLaunchPlan
```

两个 Platform manifest 当前 MAY 都有 `{key,module}` binding，但不是 universal schema。

Phase 1：

```text
keys(Game Entry) = keys(Current Platform Launch Manifest)
```

PREPARE 必须在任何 business Runtime side effect 前完成：

```text
Game validation
→ Platform manifest validation
→ exact join
→ executable resolution
→ security/hosting capability validation
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
```

任何 PREPARE failure：

```text
Runner/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

---

## 5. Main-facing Bootstrap

Main 接收已经投影的 logical facts：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Main 不接收：

```text
formatVersion
ValidatedGameEntryV1 brand
PlatformLaunchPlan
module/path/URL
Node/Worker options
raw launch manifest
```

同时 concrete Platform composition 提供 plan-bound `RuntimeHosting`：

```text
Main launch(subsystemKey)
→ RuntimeHosting lookup frozen plan
→ physical Runner Runtime
```

Main 因此保持 platform-neutral，不与 installation document 或外部 host model 耦合。

---

## 6. Physical Host / Composition / Runner

产品层不要求 external host直接拥有每个 Runner。真实 process tree由 concrete platform composition决定。

Canonical Hostra Desktop：

```text
Hostra shell
    lithdoo/hostra Electron / BrowserWindow / RPC host
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop process
    plain Node product composition
        ↓ RuntimeHosting
Node Runner
        ↓
Subsystem Runtime
```

PWA：

```text
PWA composition
→ Dedicated Worker Runner
→ Subsystem Runtime
```

Runner统一负责：

```text
verify planned binding
→ load exact selected Definition Module
→ validate SubsystemDefinitionFactory
→ construct RuntimeControlBinding / SubsystemDataBinding / ContentClient
→ enter @loomrealm/subsystem/host
```

Business Definition Module 不是 Process/Worker entry，也不读取 Platform manifest/bootstrap material。

Physical deployment/security policy包括：

```text
external host process/window policy where applicable
Node executable / Worker Runner entry
shell/argv/env safety policy
Worker constructor policy
bootstrap credentials
Control/provisioning facilities
resource/timeouts
browser CSP/origin policy
```

Game/Platform manifest不能把“选择 business implementation”升级为任意 Host code execution authority。

Hostra Desktop 的 exact Window/subprocess ownership、termination signals与 document bootstrap属于低层 physical realization；它们不创建 product-level executable selection或 application authority。Canonical M15 owner chain由 ADR 0034定义，历史 ADR 0033仅保留 direct-Electron embedding compatibility provenance。
