# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定，current v1 在首次实现 compatibility boundary 形成前可按治理规则直接收口  
> 主要定义：产品目标、Game/Platform/Main 消费边界、跨平台原则、第一阶段验收方向  
> 最近复核：2026-09-09

本文是 LoomRealm 最高层产品事实源。下层架构、协议、模块和实施文档不得通过实现便利反向改变这里的产品边界。

---

## 1. 产品目标

LoomRealm 是一个：

> **由只读 Game Entry 声明 platform-neutral logical Subsystem topology，由 matching Platform Launcher 负责 common Game validation + current-platform executable preflight，由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA 等 Platform Composition 实现真实物理承载的模块化游戏运行平台。**

目标：

- 地图、菜单、对话、战斗等业务能力拆成边界明确的 Subsystem；
- reusable game-domain libraries 是 LoomRealm author API 的消费者，不自动成为 framework `@loomrealm/*` package；
- concrete game 显式组合 game libraries、game-specific Subsystem 与 logical content；
- Game Entry 显式声明当前 Session 完整 logical Subsystem key set 与 initial business input；
- `@loomrealm/game-package` 只验证 common document，不成为 Runtime role；
- 产品 bootstrap caller 调 matching Platform Launcher，不要求先手动调用 Game Package；
- Main 不解析 `game.json`、不依赖 `@loomrealm/game-package`、不接收 executable material；
- 每个平台独立拥有 Launch Manifest/schema/resolver，不建立万能 launcher option bag；
- 业务 Subsystem source 不依赖 Desktop/PWA/Transport/launch config；
- Main 是唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority application authority；
- Platform 负责 executable binding、Process/Worker/Socket/Port/Window/Content/Provisioning physical topology，但不获得 application authority；
- Hostra/PWA 对相同 logical Game/scenario 得到等价 application outcome；
- 不同平台可以使用不同 Definition artifact/path/bytes，只要遵守相同 author ABI、formal semantics 与 business-observable result。

---

## 2. 总体闭环

```text
Game installation / source
        ↓
matching Platform Launcher PREPARE
    ├── @loomrealm/game-package
    │       Game Entry parse / validate
    ├── current Platform Launch Manifest parse / validate
    ├── exact Game↔Platform key-set join
    ├── all executable resolution
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
       Host-owned Runner
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
Platform physical ownership != application authority
Framework package != reusable game library != concrete game
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

它的 Runtime-product primary consumers 是 matching Platform Launchers，不是 Main 或业务 Subsystem。

---

## 4. Platform Launcher PREPARE

Hostra：

```text
@loomrealm/game-launcher-hostra
    game.json via @loomrealm/game-package
    + launch.hostra.json
    → HostraLaunchPlan
```

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
→ all executable resolution
→ security/hosting capability validation
→ freeze immutable PlatformLaunchPlan
→ project immutable LogicalGameBootstrap
```

任何 PREPARE failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

---

## 5. Main-facing Bootstrap

Main 接收的不是 Game Entry document，而是已经投影的 logical facts：

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

同时 Platform 提供 plan-bound `RuntimeHosting`：

```text
Main launch(subsystemKey)
→ RuntimeHosting lookup frozen plan
→ physical Runner Runtime
```

这使 Main 保持 platform-neutral，同时不与 installation document model 耦合。

---

## 6. Platform / Runner

Host-owned Runner 是 physical Runtime entry：

```text
Hostra → Host-owned Node Runner Process
PWA    → Host-owned Worker Runner
```

Runner：

```text
verify planned binding
→ load exact selected Definition Module
→ validate SubsystemDefinitionFactory
→ construct RuntimeControlBinding / SubsystemDataBinding / ContentClient
→ enter @loomrealm/subsystem/host
```

Business Definition Module 不是 Process/Worker entry，也不读取 Platform manifest/bootstrap material。

Host-owned deployment/security policy包括：

```text
Node executable / Worker Runner entry
shell/argv/env safety policy
Worker constructor policy
bootstrap credentials
Control/provisioning facilities
resource/timeouts
CSP/same-origin policy
```

Game/Platform manifest不能把“选择 business implementation”升级为任意 Host code execution authority。

---

## 7. Runtime / Frame Authority

Main 管理：

```text
Session
Runtime public lifecycle
Frame identity/caller/lifecycle/outcome/Stack
Activation
InputTarget
Frame transaction/failure unwind
DataAuthority
```

Runtime Control：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Profile v1
```

```text
launch != connected != identified != ready
ready != Data Connection exists
```

Frame state-changing transaction：

```text
Success        → known commit
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous → Runtime failure
```

不得 retry/replay ambiguous mutation；failure unwind 由 Main 收敛。

---

## 8. Author SDK Boundary

Business author 与 reusable game libraries 只使用：

```text
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

业务代码不得：

```text
read game.json raw config
import @loomrealm/game-package
read launch.hostra.json / launch.pwa.json
import game-launcher-hostra/pwa
observe module path/URL/Runner/bootstrap material
branch on Process/Worker/transport for business semantics
```

`frame.call()` 必须忠实映射 Frozen Frame transaction/failure semantics；Runtime-fatal/ambiguous 情况不得重新进入 business continuation。

---

## 9. Renderer / Data / Input / Render

Main 发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Platform DataConnectionBroker 只实现实际 physical carrier，不拥有 generation/profile。

```text
Data provisioning/loss
    != Runtime failure
    != Frame unwind
    != DataAuthority mutation
```

Input：

```text
Main InputTarget
× Subsystem Interest[F]
× Renderer Producer
× current matching Data
```

Render Domain authoritative state 属于 Subsystem，Frame/Data carrier lifecycle 不自动创建/销毁 Render Domain。

Web Presentation 只把 current Control/DataAuthority 与 current Render replica 的 authoritative facts 机械投影到 business-owned Web Components；DOM 不成为 Main/Render authority source。精确 identity/currentness/ABI 由冻结的 Web Presentation contracts 定义。

---

## 10. Content / Execution Boundary

Readonly Content capability 与 executable capability 必须分离：

```text
Platform executable capability
    PlatformLaunchPlan + trusted Runner

Readonly Content API
    logical data/resource access only
```

Content API 不提供 arbitrary executable path/capability。

Runtime bootstrap token、Runner bootstrap、Data ticket/Port、Content credential 相互独立。

Presentation bootstrap JS/CSS 通过独立 Window-level Config 消费 prepared Content；runtime business presentation resources 通过 narrow PresentationResourceClient 消费 Content。两者都不得把 executable/path/credential material带入 business authority。

---

## 11. Cross-platform Equivalence

Hostra/PWA 必须共享：

```text
same Game Entry logical topology
same subsystem keys
same LogicalGameBootstrap semantics
same formal protocol/profile semantics
same Subsystem author ABI
same Web Presentation Config/API semantics
same logical scenario/input
same business-observable outcome
```

不要求：

```text
same module path/bytes/build artifact
PID == Worker id
IPC/ticket == Port transfer
WebSocket == MessagePort
HTTP == Service Worker internals
private browser resource binding identical
```

---

## 12. 第一阶段目标

Phase 1 纵向链路：

```text
Game source
→ matching Launcher full PREPARE
→ LogicalGameBootstrap + plan-bound RuntimeHosting
→ required Runtime Runner ready
→ initial Frame
→ Content
→ Input
→ Render
→ Web Presentation
→ real business Web Components
→ nested Subsystem call/return
→ Data reconnect
→ Renderer reload
→ shutdown
```

M14 先建立 framework 之外的 reusable game library + concrete game consumer：

```text
external/local Essentials v21.1 source
        ↓
tools/fixtures/essentials-v21.1 importer
        ↓
source/decoder representation
        ↓
semantic JSON materialization
        ↓
prepared FSDB JSON records + raw resources
        ↓
M12 ContentClient
        ↓
examples/essentials-v21.1 + @loomrealm-game/map
        ↓
Frame/Input/Render/Content/M13 real map vertical
```

M14 不再额外定义 `MapNormalizedV1` / generic MapBundle。RMXP/Essentials map model 是 FSDB JSON records 的 semantic authority；prepared FSDB JSON 是 Runtime representation；`ContentClient` 是 map runtime 的访问边界。`RPG::Map` / `RPG::Tileset` / `RPG::Event` / RGSS `Table` / Essentials map metadata 等名称定义字段语义和关系来源，不表示 `@loomrealm-game/map` 接收 importer/RMXP decoder object。Map runtime 不依赖 `RmxpObject`、`RubyString`、`$id/$ref/$typed`、tooling filesystem 或 Platform storage。随后分别在 Hostra Desktop 与 PWA 完成 full E2E，并验证等价 logical outcome。

---

## 13. 长期设计原则

1. 每份 authoritative state 只有一个 owner；
2. Game Entry document、Main bootstrap model、Platform executable binding 三者分离；
3. Product bootstrap caller 使用 matching Launcher；
4. `@loomrealm/game-package` 是 document capability，不是 Runtime role；
5. Main 不依赖 Game Package 或 concrete Launcher；
6. full PREPARE before Runtime side effects；
7. Platform physical ownership不是 application authority；
8. Business source/game libraries只依赖 author SDK；
9. Protocol/domain lifecycle保持分离；
10. capability通过 ports 注入，不通过 global/service-locator 搜索；
11. Protocol/package/process/platform/game-library boundary互不等价；
12. 主要定义依赖保持单向 DAG；
13. tooling/preparation不成为 runtime game dependency；
14. 没有真实 compatibility obligation 时不制造虚假 v2/compat layer；
15. 已有真实 domain model 足以满足 consumer 时，不为了“通用化”复制第二份 schema；
16. 有真实 compatibility obligation 后严格 version/migration 治理。

---

## 14. 当前非目标

```text
Save System
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
lazy/optional Subsystem
multiple Runtime instances per key
remote Runtime / multiple Renderer
runtime implementation negotiation
universal cross-platform launcher schema
predictive platform/Runner mega-package
GameLibrary registry/base framework
framework-owned map/menu/dialogue/battle vocabulary
universal map schema / MapNormalizedV1
```

---

## 15. 当前实施主线

```text
M1–M9 Foundation / Game / Runtime / Hostra / Data   ✅
M10 User Input                                      ✅ Closed
M11 Render Replication                              ✅ Closed
M12 Content                                         ✅ Closed
M13 Web Presentation                                ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game              pending
M15 Desktop full E2E                                 pending
M16 PWA Runtime                                      pending
M17 PWA full E2E / equivalence                       pending
```

当前 executable closure是 `npm run test:m13`。下一步按 M14/01–05 建立 `game-libs/map` 与 `examples/essentials-v21.1`，让 map runtime 通过 `ContentClient` 消费 RMXP/Essentials-compatible FSDB JSON records完成 first playable map vertical，再进入 Desktop/PWA full E2E。
