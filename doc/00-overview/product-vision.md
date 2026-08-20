# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定，当前首次实现冻结前允许直接收口  
> 主要定义：产品目标、跨平台逻辑/物理边界、第一阶段验收方向  
> 最近复核：2026-08-20

本文是 LoomRealm 最高层产品事实源。下层架构、协议、模块和实施文档不得通过实现便利反向改变这里的产品边界。

---

## 1. 产品目标

LoomRealm 是一个：

> **由只读 Game Package 声明 platform-neutral logical Subsystem topology，由 Main 管理 Session/Runtime/Frame authority，并由每个平台自己的 Game Launcher/Platform Composition 选择、验证和承载对应 Subsystem implementation 的模块化游戏运行平台。**

目标：

- 地图、菜单、对话、战斗等业务能力拆成边界明确的 Subsystem；
- Game Package只声明逻辑 key、initial target/input 等真正跨平台字段；
- executable module、Process/Worker、Runner、Transport 与 provisioning由当前 Platform拥有；
- Hostra/PWA拥有独立 Launch Manifest/schema，不制造万能跨平台 launcher配置；
- Main拥有唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority；
- Subsystem拥有自身 business state、Input Interest与 Render Domain authoritative state；
- Renderer只镜像 Main authority、生产输入、复制/呈现 Render State；
- Platform physical ownership不提升为 application authority；
- 不同平台实现允许使用不同 executable artifact，但必须遵守同一 Subsystem ABI和等价 observable semantics；
- 先通过可执行纵向链路证明边界，再扩 Save、Sandbox、更多 Runtime等横向能力。

---

## 2. 总体链路

```text
Readonly Game Package
    │ logical topology: { key } + initial
    ▼
Validated Game Entry
    │
    ├───────────────┐
    │               │
    ▼               ▼
LoomRealm Main   Platform Launch Planner
logical authority    + launch.<platform>.json
    │               │
    │               ▼
    │          immutable LaunchPlan
    │               │
    └── launch(key) ─┤
                    ▼
             Platform RuntimeHosting
             ┌────────────┴────────────┐
             ▼                         ▼
       Hostra Node Runner        PWA Worker Runner
             │                         │
             ▼                         ▼
      platform-selected          platform-selected
      Definition Module          Definition Module
             └──────────┬──────────────┘
                        ▼
              @loomrealm/subsystem
```

跨平台相同的是 logical identity、formal contracts 和 business-observable semantics；物理 artifact/path/Runner/transport 可以不同。

---

## 3. Game Package

Game Package v1只拥有：

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

它不声明：

```text
module
Node/Worker launcher
process argv/env
Worker options
WebSocket/MessagePort
Platform provisioning
credential
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

Phase 1：

```text
keys(Game Entry) = keys(Current Platform Launch Manifest)
```

每个平台在任何 business Runtime side effect前完成：

```text
manifest validation
→ exact key join
→ executable resolution
→ hosting capability validation
→ immutable LaunchPlan
```

Main之后只发出 `launch(subsystemKey)` logical intent。

---

## 5. Runner / Host Policy

Platform Launch Manifest可以选择 installation 内的业务实现 artifact，但不能控制 Host-owned security/deployment policy。

Host-owned：

```text
Node executable / Worker Runner entry
Runner bootstrap
process/Worker options
Control endpoint / MessagePort
credential/token/ticket
Supervisor policy
resource/timeouts
```

业务 Definition Module不是 Process/Worker entry；Host-owned Runner负责加载/验证 Module、构造 role-local Platform Ports 并进入 `@loomrealm/subsystem/host`。

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
Subsystem Control v1 + Frame / Call v1
```

```text
launch != connected != identified != ready
ready != Data Connection exists
```

Frame timeout/loss ambiguity不得 retry/rollback，进入 Runtime failure。

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

Frame outcome明确：`completed / cancelled / failed`。

`frame.call()`只有明确 pre-commit recoverable rejection可作为 catchable error继续 current Activation；Runtime-fatal/ambiguous path不能重新进入 business continuation。

业务代码不得依赖 Hostra/PWA launch manifest、Runner bootstrap或物理 carrier。

---

## 8. Input / Render / Data

ordinary input：

```text
Main InputTarget
× Subsystem Interest[F]
× Renderer Producer
× current matching Data Connection
```

Render Domain authority在 Subsystem；Frame/Data carrier不拥有 Domain lifecycle。

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

Platform DataConnectionBroker只实现 physical carrier，不拥有 generation/profile。Data provisioning/loss本身不失败 Runtime、不 unwind Frame。

---

## 9. Cross-platform Messaging

当前 message-oriented profiles统一：

```text
one application unit = one UTF-8 JSON text string
```

WebSocket与 MessagePort拥有相同 application value model；Structured Clone只用于 Platform bootstrap/Port transfer。

---

## 10. Content / Execution Boundary

Game Package运行期间只读。

严格区分：

```text
Platform executable capability
    platform launch plan + trusted Runner加载 selected module

Readonly Content API
    logical data/resource access
```

Content API不得提供任意 executable path/capability；Render/business payload不得携 physical path/credential。

---

## 11. Cross-platform Equivalence

Hostra/PWA必须共享：

```text
same Game Entry logical topology
same Subsystem keys
same formal protocol/profile semantics
same Subsystem author ABI
same logical scenario/input
```

不要求共享：

```text
module path/bytes/build artifact
PID/Worker id
WebSocket/MessagePort
IPC/Port transfer
HTTP/SW realization
```

等价性比较 Runtime/Frame/Input/Render/Content/business observable result，而不是物理 trace。

---

## 12. 第一阶段目标

Phase 1必须跑通：

```text
Game Entry logical topology
→ current-platform Launch Manifest
→ preflight LaunchPlan
→ all required Runtime Runner ready
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

分别在 Hostra Desktop/PWA得到等价 logical outcome。

`loom.map` source应保持 platform-neutral；各平台 MAY使用相同 artifact，也 MAY使用由同一业务 source产生的不同平台 build artifact。

---

## 13. 长期设计原则

1. **状态唯一权威**：每份 authoritative state只有一个 owner；
2. **逻辑拓扑与 executable binding分离**：Game Package不拥有 platform execution；
3. **Platform physical ownership不是 application authority**；
4. **平台配置各自演化**：不为 Hostra/PWA建立万能 option bag；
5. **Preflight before side effects**：完整 game+platform plan闭合后才能启动 Runtime；
6. **业务与 Platform分离**：业务只依赖 author SDK；
7. **协议域分离**：Runtime Control / Renderer Control / Data / Input / Render / Content各自拥有 identity/lifecycle/recovery；
8. **Frame 与 Render/Data 解耦**；
9. **能力通过 ports注入，不通过 service locator/global context寻找**；
10. **execution capability与 ordinary Content capability分离**；
11. **Protocol/package/process/platform boundary互不等价**；
12. **没有真实兼容义务时不为旧草案制造虚假版本负担；本次直接更新 current v1。**

---

## 14. 当前非目标

- Save System；
- untrusted executable sandbox / publisher trust；
- automatic Runtime restart/checkpoint；
- lazy/optional Subsystem；
- multiple Runtime instances per key；
- remote Runtime / multiple Renderer；
- runtime implementation negotiation；
- 任意平台 launcher extension bag；
- 为预测性复用创建 platform mega-package。

---

## 15. 当前主线

```text
architecture/contracts aligned
→ foundation/wire
→ game-package logical topology
→ Runtime/Frame mechanics + Subsystem SDK
→ Hostra launcher/preflight/Runner
→ Desktop vertical slice
→ Renderer/Data/Input/Render/Content
→ loom.map
→ Desktop E2E
→ PWA launcher/preflight/Runner
→ PWA E2E
→ abstract-trace equivalence
```
