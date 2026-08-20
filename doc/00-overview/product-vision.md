# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定，当前 v1在首次实现冻结前允许按治理规则直接收口  
> 主要定义：产品目标、适用范围、Game/Platform 边界、跨平台原则、第一阶段验收方向  
> 最近复核：2026-08-20

本文是 LoomRealm 最高层产品事实源。下层架构、协议、模块和实施文档不得通过实现便利反向改变这里的产品边界。

---

## 1. 产品目标

LoomRealm 是一个：

> **由只读 Game Package 声明 platform-neutral logical Subsystem topology，由 Main 管理 Session/Runtime/Frame authority，并由 Hostra Desktop / PWA 等每个平台自己的 Game Launcher/Platform Composition 选择、验证和承载对应 Subsystem implementation 的模块化游戏运行平台。**

目标：

- 地图、菜单、对话、战斗等业务能力拆成边界明确的 Subsystem；
- Game Package显式声明当前 Session完整 logical Subsystem集合与 initial business input；
- Game common config不声明 executable module、Process/Worker、Transport或 provisioning；
- 每个平台独立拥有 Launch Manifest/schema/resolver，不建立万能 launcher option bag；
- 业务 Subsystem source不依赖 Desktop/PWA/Transport/launch config；
- Main拥有唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority application authority；
- Frame只承担调用与 ordinary input authority，不拥有 Render lifecycle；
- Subsystem拥有自身 business state、Input Interest与 Render Domain authoritative state；
- Renderer只镜像 Main authority、生产输入、复制/呈现 Render State，不成为 business authority；
- Platform负责 executable binding、Process/Worker/Socket/Port/Window/Content/Provisioning physical topology，但不获得 application authority；
- Hostra Desktop与 PWA 对相同 logical Game/topology/scenario得到等价 logical outcome；
- 不同平台可以使用不同 Definition artifact/path/bytes，只要遵守相同 author ABI/formal semantics/business observable result；
- 先通过可执行纵向链路证明边界，再扩展 Save、Sandbox、更多 Runtime等横向能力。

---

## 2. 总体链路

```text
Readonly Game Package
    │ logical topology: {key...} + initial target/input
    ▼
Validated Game Entry
    │
    ├──────────────────────► LoomRealm Main
    │                           logical Runtime / Frame / Data authority
    │                                  │
    │                                  │ launch(subsystemKey)
    │                                  ▼
    └──► Current Platform Launch Manifest
              ├── launch.hostra.json
              └── launch.pwa.json
                       │
                 exact key-set join
                 full executable resolution
                 hosting/security preflight
                       │
                       ▼
              immutable PlatformLaunchPlan
                       │
                       ▼
                 RuntimeHosting
              ┌────────┴────────┐
              ▼                 ▼
       Hostra Node Runner   PWA Worker Runner
              │                 │
              ▼                 ▼
       platform-selected   platform-selected
       Definition Module   Definition Module
              └────────┬────────┘
                       ▼
              @loomrealm/subsystem
                       │
             business / Input / Render / Content
```

Renderer：

```text
Main committed authority
        ↓
Web Renderer
        ⇅ authorized Data Profile
Subsystem Runtime
```

核心边界：

```text
Game logical topology != Platform executable binding
Platform physical ownership != application authority
```

---

## 3. Game Package / Logical Topology

Game Package v1只声明：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

以及：

```text
formatVersion
initial.subsystem
initial.input
complete required subsystem key set
```

`key` 是 application Subsystem identity，并在 Main、Runtime bootstrap、Frame target、DataAuthority等域保持一致。

Game Package不声明：

```text
module
launcher.type / launcher.entry
Node/Worker selection
process argv/env
Worker options
WebSocket/MessagePort
Platform provisioning
bootstrap token / Data ticket
platform switch/options bag
```

Game Package validation只产出可信 logical topology，不产生 executable capability。

---

## 4. Platform Launch Manifest / Plan

平台差异显式留在平台：

```text
Hostra
    launch.hostra.json
    → @loomrealm/game-launcher-hostra
    → HostraLaunchPlan

PWA
    launch.pwa.json
    → @loomrealm/game-launcher-pwa
    → PwaLaunchPlan
```

两个 Platform manifest当前 MAY都有 `{key,module}` binding，但它们不是 universal launcher schema；字段/validation/security/policy可独立演化。

Phase 1：

```text
keys(Game Entry) = keys(Current Platform Launch Manifest)
```

每个平台在任何 business Runtime side effect前完成：

```text
Game Entry validation
→ Platform manifest validation
→ exact key-set join
→ all executable resolution
→ installation/security containment
→ hosting capability validation
→ immutable LaunchPlan
```

任何 config/join/resolution/capability preflight failure：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

Main之后只发出 logical `launch(subsystemKey)` intent，不传 module/path/URL/Node/Worker options。

---

## 5. Platform / Runner

Business module与 physical Runtime entry分离：

```text
PlatformLaunchPlan selected Definition Module
        ↓
Host-owned Runner
        ↓
@loomrealm/subsystem/host
```

Host-owned Runner负责：

```text
load exact plan-selected Definition Module
validate default SubsystemDefinitionFactory
construct role-local Platform Ports
enter @loomrealm/subsystem host runtime
platform-local diagnostics/cleanup
```

Host-owned deployment/security policy包括：

```text
Node executable
Runner entry
shell/argv/env safety policy
Worker constructor policy
bootstrap credentials
Control endpoint/MessagePort
resource/timeouts
CSP/same-origin policy
```

Game/Platform manifest不能把“选择 business implementation”升级为任意 Host code execution authority。

Platform差异停在 build/launcher/Runner/adapter/composition层，不传播到 business code。

---

## 6. Runtime / Frame Authority

Main管理：

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

不得 application retry/rollback ambiguous mutation；failure unwind由 Main收敛。

---

## 7. Author SDK Boundary

业务 author只使用：

```text
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

Frame outcome明确：

```text
completed
cancelled
failed
```

`frame.call()`：

```text
child terminal Outcome
    → resolve FrameOutcome

明确 pre-commit recoverable rejection
    → typed reject; current Activation remains valid

Runtime-fatal/ambiguous
    → MUST NOT re-enter business continuation
```

这保证高层 ergonomics不会绕过底层 authority/commit semantics。

业务代码不得读取 `game.json` raw config、`launch.hostra.json`、`launch.pwa.json`、module path/URL、Runner/bootstrap material。

---

## 8. User Input

ordinary input最终由以下交集产生：

```text
Main InputTarget(S,F,A)
× Subsystem Interest[F]
× Renderer Producer(C)
× current matching Data Connection
```

Interest是 Frame-scoped configuration，不是 authority。

```text
fresh Activation
    may reuse Interest config
    never reuse old Input State/Event

fresh Data carrier
    remote Interest/State start empty
    republish/rebaseline
```

Control/Data无跨连接 total order；Interest-first / Authority-first 都必须安全收敛。

---

## 9. Render

Subsystem拥有 `0..N Render Domains`。

```text
Frame create/close/suspend
    does not create/destroy/hide Render Domain

Data carrier replacement
    does not destroy authoritative Domain
```

Renderer复制 declarative authoritative state并映射到 DOM/Canvas/WebGL等本地 presentation。

fresh Data carrier通过 current Domain Registry + fresh Snapshots重建 replica baseline。

---

## 10. Renderer Data

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Platform DataConnectionBroker建立实际 Renderer/Subsystem endpoints；endpoint/ticket/Port不是 authority。

Runtime已经 ready 后的 Data material通过 Platform provisioning path动态交付，不污染 Runtime Control/Renderer Control/business payload。

```text
Data provisioning/loss
    != Runtime failure
    != Frame unwind
    != DataAuthority mutation
```

same S/G/P可 sequential reconnect；profile change需要 fresh generation。

---

## 11. Cross-platform Messaging

当前 message-oriented profiles统一：

```text
one application unit = one UTF-8 JSON text string
```

因此 WebSocket与 MessagePort拥有相同 application value model；Structured Clone只用于 Platform bootstrap/Port transfer。

跨平台 equivalence比较 logical authority/outcome，而不是物理 trace。

---

## 12. Content / Execution Boundary

Game Package运行期间只读。

必须区分：

```text
Platform executable capability
    PlatformLaunchPlan + trusted Runner加载 selected Definition Module

Content API
    readonly logical data/resource access
```

Content API不得提供任意 executable path/capability；Render/business payload不得携 physical path/credential。

Desktop trusted executable JavaScript当前不等于 OS sandbox；PWA Worker隔离也不自动等于 Publisher Trust。

Runtime bootstrap token、Platform Runner bootstrap、Data ticket与 Content credential必须相互独立。

---

## 13. Cross-platform Equivalence

Hostra/PWA必须共享：

```text
same Game Entry logical topology
same Subsystem keys
same formal protocol/profile semantics
same Subsystem author ABI
same logical scenario/input
same business-observable outcome
```

不要求共享：

```text
module path/bytes/build artifact
PID/Worker id
IPC/ticket vs Port transfer
WebSocket URL vs MessagePort
HTTP port vs Service Worker internals
bootstrap/provisioning physical message sequence
```

业务 source SHOULD platform-neutral；平台 build artifact差异由 build/launcher binding吸收。

---

## 14. 第一阶段目标

Phase 1必须跑通 `loom.map` 纵向链路：

```text
Game Entry logical topology
→ current Platform Launch Manifest
→ zero-side-effect preflight LaunchPlan
→ required Runtime Runner ready
→ initial Frame
→ map Content load
→ Frame-scoped input
→ world movement/collision/Portal
→ declarative Render
→ nested Subsystem call/return
→ Data reconnect
→ Renderer reload
→ shutdown
```

并分别在：

```text
Hostra Desktop
PWA
```

得到等价 logical outcome。

`loom.map` MUST实际使用 author-level FrameOutcome、Frame-bound InputListener、RenderDomain、ContentClient，并证明 Runtime-fatal不会重新进入业务 continuation。

Pokémon Essentials v21.1 / RPG Maker XP兼容仅是 `loom.map` 的验证 corpus，不是 LoomRealm长期核心格式。

---

## 15. 长期设计原则

1. **状态唯一权威**：每份 authoritative state只有一个 owner；
2. **逻辑拓扑与 executable binding分离**：Game Package不拥有 platform execution；
3. **Platform physical ownership不是 application authority**；
4. **平台配置各自演化**：不为 Hostra/PWA建立万能 option bag；
5. **Preflight before side effects**：完整 game+platform plan闭合后才能启动 Runtime；
6. **业务与 Platform分离**：Definition source只依赖 author SDK，不探测运行平台；
7. **协议域分离**：Runtime Control / Renderer Control / Data / Input / Render / Content各自拥有 identity/lifecycle/recovery；
8. **Frame 与 Render/Data 解耦**；
9. **能力通过 ports注入，不通过 service locator/global context寻找**；
10. **Business API隐藏 protocol mechanics，但不能弱化 protocol semantics**；
11. **Game Package只读，execution capability与 ordinary Content capability分离**；
12. **Protocol/package/process/platform boundary互不等价**；
13. **主要定义依赖保持单向 DAG**；
14. **先完成 cross-platform vertical slice，再扩横向能力**；
15. **没有真实兼容义务时不为旧草案制造虚假版本负担；有真实兼容承诺后严格治理版本。**

---

## 16. 当前非目标

- 完整 RPG/Pokémon产品功能；
- Game content editor；
- Save System；
- untrusted executable sandbox / publisher trust；
- automatic Runtime restart/checkpoint；
- lazy/optional Subsystem；
- multiple Runtime instances per key；
- remote Runtime / multiple Renderer；
- runtime implementation negotiation；
- Frame replay/migration/caller-driven cancellation；
- Render history replay/cross-Domain transaction；
- arbitrary plugin execution；
- universal cross-platform launcher option bag；
- 为预测性复用创建 platform/Runner mega-package。

---

## 17. 发展方向

当前主线：

```text
architecture/contracts aligned
→ implement foundation/wire
→ implement game-package logical topology
→ Runtime Control / Frame mechanics
→ Subsystem author/host SDK
→ Hostra launcher/preflight/Runner
→ Main + Desktop Frame vertical slice
→ Renderer/Data Profile/Broker
→ Input/Render/Content
→ loom.map
→ Desktop E2E
→ PWA launcher/preflight/Runner/provisioning
→ PWA E2E
→ abstract-trace equivalence
```

未来能力只有在当前 vertical slice证明后按真实需求增加。

---

## 18. 阅读顺序

1. 本文；
2. [文档分层与变更规则](./document-governance.md)；
3. [系统架构总览](../10-architecture/system-overview.md)；
4. [平台组合系统](../10-architecture/platform-composition-system.md)；
5. [运行承载系统](../10-architecture/runtime-hosting-system.md)；
6. Stack / Communication / Rendering / Subsystem architecture；
7. [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
8. [正式契约目录](../15-contracts/README.md)；
9. [Game Package v1](../15-contracts/game-package-v1.md)；
10. Hostra/PWA Launcher Profiles；
11. [模块设计目录](../20-modules/README.md)；
12. [实施计划目录](../30-implementation/README.md)。

专题文档与本文冲突时，必须先更新本层产品方向，再向下传播。
