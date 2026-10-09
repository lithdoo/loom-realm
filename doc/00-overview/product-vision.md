# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：Stable  
> 主要定义：产品目标、逻辑角色、authority partition、跨平台原则与兼容边界  
> 最近复核：2026-10-09

本文是 LoomRealm 最高层产品事实源。下层 Architecture、Contract、Module 和 Development 文档只能细化这里的边界，不能因为实现便利反向改变 authority。

## 1. 产品目标

LoomRealm 是一个将 **platform-neutral logical game runtime** 与 **platform-specific physical composition** 分离的模块化游戏运行平台。

核心目标：

- 地图、菜单、对话、战斗等业务能力以边界明确的 Subsystem/game library 组合；
- concrete game 声明 logical Subsystem topology、初始输入与只读安装内容；
- Platform Launcher 完成当前平台 executable/provisioning PREPARE；
- Main 管理 Session/control-flow，而不解析安装文档或业务状态；
- Realm State 独立持有 session 共享可变业务状态；
- Subsystem 持有 domain execution、local state 与 authoritative Render Domains；
- Renderer 维护 current readonly presentation replica，并作为受控 Input producer；
- Content 是 installation-scoped readonly definition authority；
- Desktop/Hostra 与 PWA 可以采用不同 process/worker/window topology，但对相同 logical scenario 保持等价 application semantics。

## 2. Authority partition

```text
Main
    Control Authority
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority

Realm State
    Session Shared Business State Authority
    Records / versions / OCC / commit revision

Subsystem
    Domain Execution / Local State Authority
    Input Interest / Render Domains

Renderer
    Readonly/current Presentation Replica
    authorized Input producer gate

Content
    Readonly Installation Definition Authority
```

一个 application fact 只能有一个 authoritative owner。Process、Worker、Socket、MessagePort、BrowserWindow、DOM、Service Worker 等 physical ownership 不产生第二份 application authority。

## 3. Game / Platform / Main boundary

Game Entry 描述 logical game，不携带平台 executable selection。Platform-specific launch profile 负责：

```text
Game Entry validation
→ current-platform manifest validation
→ exact logical-key join
→ executable / installation / hosting preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap + prepared platform capabilities
```

Main 只接收运行所需的 logical bootstrap，不接收 raw `game.json`、module path、URL、Node/Worker option、Hostra/PWA manifest 或任意 executable bytes。

因此：

```text
Game logical topology
!= platform executable binding
!= physical host composition
!= presentation bootstrap
```

正式边界见 [Game Package v1](../15-contracts/game-package-v1.md)、[Runtime Control](../15-contracts/runtime-control-profile-v1.md) 与对应 Platform profiles。

## 4. Runtime / State / Render flow

典型运行链：

```text
Platform PREPARE
→ Session composition
→ Main + RealmStateAuthority READY
→ RuntimeHosting launches Subsystem Runtime
→ Subsystem business behavior
→ RenderDomain authoritative updates
→ Render Update
→ Renderer current replica
→ Web presentation projection
```

Input 反向流动，但只能经过 current Renderer/Data/InputTarget/Activation/Interest gates；DOM 或业务 Web Component 不得反向成为 Store、Main、Realm State 或 Subsystem authority。

Realm State 与 Renderer Data 是两个不同 lifetime/currentness domain：共享业务状态不会因为 Renderer reload 或 Data reconnect 被重置；presentation 只能通过 Subsystem business logic → RenderDomain → Renderer projection 间接反映 Realm State。

## 5. Content 与 game libraries

Content 只提供 prepared installation 中的 readonly logical bytes/records/resources。Subsystem 通过 author-facing `ContentClient` 消费，不依赖 importer、Marshal、FSDB physical path 或平台 transport。

Repository taxonomy：

```text
packages/      framework/runtime/protocol/platform seams
game-libs/     reusable game-domain libraries
examples/      concrete games / fixtures / legal-local compatibility entry
apps/          concrete Desktop / PWA product compositions
tools/         import / fixture / developer tooling
```

主要业务依赖方向：

```text
examples → game-libs → framework public author APIs
```

Reusable game library 不是因为“可复用”就自动成为 `@loomrealm/*` framework package。

## 6. Physical platform composition

Desktop canonical ownership：

```text
Hostra shell
    Electron / BrowserWindow / host RPC
        ↓ HOSTRA_SUBCMD
LoomRealm Desktop process
    plain Node composition
        ↓ RuntimeHosting
Runner
        ↓
Subsystem Runtime
```

PWA canonical ownership：

```text
Browser Window
    Renderer / Input / Viewport / Presentation
        ↕ dedicated application ports
Session Worker
    Main + Realm State
        ↓
Dedicated Subsystem Workers

Service Worker
    Content / private executable / runtime-info physical serving boundary
```

两种 topology 不要求相同 physical implementation；要求相同逻辑 authority、formal contract 与 business-observable outcome。

## 7. Compatibility 与演进

`Frozen != Implemented != Qualified`。一旦形成真实 compatibility boundary，incompatible schema/identity/order/error/recovery/limit/encoding change 必须 version 或显式 migration。

没有真实 compatibility obligation 时，错误的 current-v1 设计可以按 [文档治理](./document-governance.md) 用 Accepted ADR 直接修正，但必须同步 Architecture、Contracts、Modules、tests 与 qualification input；不得制造 fake v2 或 dual parser 逃避治理。

## 8. Product invariants

1. logical game definition 与 physical platform binding 分离；
2. Main 只拥有 Control Authority，不吸收 Realm State 或业务 local state；
3. Realm State 只拥有 session shared mutable business truth；
4. Subsystem 是业务执行与 RenderDomain authority；
5. Renderer 是 readonly/current presentation replica，不是业务 authority；
6. Content 是 readonly installation definition authority；
7. physical host/composition 不获得 application authority；
8. Desktop/PWA 可以物理不同，但必须遵守同一逻辑 semantics；
9. framework、game library、concrete game 三层依赖不可反转；
10. 当前产品事实、工作进度、历史 evidence 分别由 Current docs、Issue/PR、ADR/Git/evidence 管理。

继续阅读：[系统架构](../10-architecture/system-overview.md) · [正式契约](../15-contracts/README.md) · [当前模块](../20-modules/core/README.md) · [开发与资格](../30-development/README.md)。
