# LoomRealm

LoomRealm 是一个通过只读 Game Package 声明**逻辑游戏拓扑**、由 Main 编排独立 Subsystem Runtime，并由各 Platform Launcher/Composition 在 Hostra Desktop、PWA 等物理环境中完成 executable binding 与运行承载的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

推荐入口：

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [平台组合系统](./doc/10-architecture/platform-composition-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Game Package v1](./doc/15-contracts/game-package-v1.md)
- [Hostra Game Launcher / Node Runner Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [PWA Game Launcher / Worker Runner Profile v1](./doc/15-contracts/pwa-launcher-profile-v1.md)
- [Runtime Control Application Profile v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [独立分包与发布架构](./doc/30-implementation/package-architecture.md)
- [完整阅读指南](./doc/README.md)

## Game / Platform Launch 闭环

```text
Game Entry
    Descriptor {key}
    initial target/input
        │
        ├─ Main logical topology
        │
        └─ Current Platform Launch Manifest
              ├─ launch.hostra.json
              └─ launch.pwa.json
                    ↓
             exact key-set join
             full executable resolution
             hosting capability preflight
                    ↓
          immutable PlatformLaunchPlan
                    ↓
             Main launch(key)
                    ↓
          plan-bound RuntimeHosting
                    ↓
             Host-owned Runner
                    ↓
       platform-selected Definition Module
```

关键规则：**Game common config不包含 module；Main不接触 module；完整 game+platform preflight未闭合前不得产生 business Runtime side effect。**

Hostra/PWA可以选择不同 Definition artifact，但必须实现相同 `SubsystemDefinitionFactory` ABI，并在同一 logical scenario下得到等价 application result。

## 核心模型

```text
Game logical topology
→ Platform preflight plan
→ Main launches required Runtime keys
→ Subsystem Control binds identity / ready / shutdown / failed
→ Runtime Control Profile binds Control v1 + Frame / Call v1
→ Main owns Frame/Activation/InputTarget/DataAuthority
→ Renderer mirrors committed authority
→ Data Broker realizes authorized Renderer↔Subsystem carriers
→ User Input / Render Update operate on independent data protocol domains
→ Content uses independent readonly plane
```

核心边界：

```text
Game topology != Platform executable binding
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## 当前契约状态

```text
Game Package v1                         Active / Normative / Stabilizing
Hostra Game Launcher / Node Runner v1   Active / Normative / Stabilizing
PWA Game Launcher / Worker Runner v1    Active / Normative / Stabilizing
Subsystem Control Protocol v1           Active / Normative / Stabilizing
Runtime Control Profile v1              Active / Normative / Stabilizing
Frame / Call Protocol v1                Active / Normative / Frozen
Main ⇄ Renderer Control v1              Draft / near closure
Renderer Data Profile v1                Draft / stabilizing
User Input v1                           Core semantic closure reviewed
Render Update v1                        Closure candidate
Content API v1                          Active / Normative / Evolving
```

本次 Game/Launcher 变更直接更新 current v1；没有 v2、legacy `{key,module}` parser或兼容 alias。

## Runtime / Frame / Data

Frame v1继续保持 exact seven RPC、Response-before-dependent-RPC、ACK-before-publication、ambiguous timeout/loss → Runtime failure、no retry/replay、fixed-point unwind等 Frozen semantics。

Platform launch reset不改变 Runtime Control、Renderer Control、DataAuthority、Input、Render 或 Content application semantics。

## 分包与发布

```text
@loomrealm/game-package
    common logical topology

@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
    narrow platform Runtime launch capabilities

apps/desktop
apps/pwa
    full composition roots
```

Launcher package不会扩张成 Renderer/DataBroker/Content platform mega-package。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
