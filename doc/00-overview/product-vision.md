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
- Platform 负责 executable/Process/Worker/Socket/Port/Window/Content physical topology，不获得 application authority；
- Renderer 只拥有 read-only Main mirror、Input producer gate、per-subsystem Render replica、physical Web projection；
- Business Web presentation 只拥有具体 Custom Element/Canvas/WebGL/layout/private state；
- Hostra/PWA 对相同 logical Game/scenario 得到等价 application outcome。

---

## 2. Repository / Consumer Layering

Phase 1 从 M14 开始显式区分：

```text
packages/
    LoomRealm framework/runtime

game-libs/
    reusable game-domain libraries

examples/
    concrete games

apps/
    platform hosts

tools/
    development/import/compatibility tooling
```

主消费方向：

```text
examples → game-libs → public LoomRealm author APIs → packages
```

Framework 不反向拥有 map/menu/dialogue/battle 等业务 vocabulary。

`@loomrealm-game/map` 是第一个真实 reusable game library；它采用现有 RMXP/Essentials map semantics 作为第一版业务模型，而不是升级为 LoomRealm universal map contract。

---

## 3. Game / Platform / Main Boundary

Game source负责 logical game declaration与 business source；Platform Launcher负责 current platform executable binding；Main只消费 validated logical bootstrap。

```text
Game source
→ matching Platform Launcher PREPARE
→ LogicalGameBootstrap + PlatformLaunchPlan
→ RuntimeHosting
→ Main
```

平台可以使用不同 executable/transport/storage mechanics，但不能改变 logical application authority。

---

## 4. Game Entry / Launch Manifest

Game Entry 是 platform-neutral、readonly、declarative game topology；Platform Launch Manifest只声明 current platform executable/hosting facts。

```text
Game Entry
!= Hostra launch manifest
!= PWA launch manifest
!= Web presentation config
```

Game/Platform manifest不能把“选择 business implementation”升级为任意 Host code execution authority。

---

## 5. PREPARE Boundary

matching Platform Launcher负责：

```text
common Game validation
+ current Platform manifest validation
+ exact key join
+ executable/security/hosting preflight
→ immutable PlatformLaunchPlan
+ LogicalGameBootstrap
```

PREPARE failure必须发生在 Runtime/Subsystem Definition side effects之前。

---

## 6. Platform Composition

Platform composition拥有：

```text
Process / Worker / Window hosting
Control/Data physical binding
Content physical binding
Web presentation config acquisition/private browser binding
startup / shutdown / supervision
```

但不拥有：

```text
Session/Frame/InputTarget/DataAuthority
Subsystem business state
Render Domain authority
business Web Component semantics
```

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

M14 的 map content 不再经过额外 normalized-map adapter：

```text
Essentials/RMXP source
→ tools importer
→ RMXP/Essentials semantic records + raw resources
→ prepared Content
→ @loomrealm-game/map
```

Importer可以理解 Ruby Marshal、`.rxdata`、PBS、RPG::* source objects；map runtime只理解 materialized map semantics，不理解 importer wrappers、tool filesystem 或 physical storage。

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
→ existing importer
→ RMXP/Essentials semantic map records + resources
→ prepared Content
→ examples/essentials-v21.1
→ @loomrealm-game/map
→ Frame/Input/Render/Content/M13 real map vertical
```

Map library直接使用 RMXP/Essentials map semantics；不建立 `MapNormalizedV1` 或 generic MapBundle。Map browser JS/CSS通过 prepared Content + `WebPresentationConfigV1`启动，可见 tileset/player资源由 WC通过 `PresentationResourceClient`获得。

随后分别在 Hostra Desktop 与 PWA 完成 full E2E，并验证等价 logical outcome。

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

当前 executable closure是 `npm run test:m13`。下一步按 M14/01–05 建立 `game-libs/map` 与 `examples/essentials-v21.1`，直接用 importer materialized 的 RMXP/Essentials semantic records完成 first playable map vertical，再进入 Desktop/PWA full E2E。
