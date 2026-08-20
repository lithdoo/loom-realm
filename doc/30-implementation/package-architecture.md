# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、document/contract capability、role、platform launch integration、technical adapter/Runner integration、composition root 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-20

本文是 package/publish boundary 的主要事实源；repository layout只实现本文，不反向定义它。

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

---

## 1. Dependency Layers

当前依赖方向不是一条简单线，而是两个低层 primitive 向不同 capability 分支：

```text
             @loomrealm/wire
             /             \
            ↓               ↓
 @loomrealm/game-package   protocol/domain capability packages
            ↓               ↓
 matching game-launcher-*  platform-neutral roles
            ↓               ↑
        apps/* composition ─┘
```

Business package只依赖最接近的 author-facing role SDK。

---

## 2. Foundation / Wire

```text
@loomrealm/foundation
    MessageCarrier
    deterministic memory carrier
    generic async/lifecycle primitives
    no JSON/domain/platform semantics

@loomrealm/wire
    JSON / JSON-RPC representation
    closed object / safe integer / UTF-8/depth primitives
    no carrier/lifecycle/domain authority
```

两者正交，不合并成 `common/utils`。

---

## 3. Document / Contract Capability Packages

```text
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
```

### `game-package`

定位：platform-neutral Game Entry document validation capability。

只处理：

```text
GameEntryV1
formatVersion
initial target/input
Descriptor {key}
complete logical key-set validation
validated detached immutable snapshot
```

主要 Runtime-product consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

明确不是：

```text
Main role dependency
business author dependency
filesystem loader
Platform manifest parser
RuntimeHosting
```

### `runtime-control`

```text
Subsystem Control v1
Frame / Call v1
Runtime Control Profile v1
```

### `data`

```text
Renderer Data Profile v1
Data Connection v1
User Input v1
Render Update v1
```

Profile composition不合并 child identity/lifecycle/authority。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role通过 ports消费 Platform，不 import concrete Hostra/PWA API。

### Main

Main consumes：

```text
LogicalGameBootstrap
runtime-control / renderer-control
Main-facing Platform ports
```

Main MUST NOT depend on：

```text
@loomrealm/game-package
@loomrealm/game-launcher-hostra/pwa
```

`LogicalGameBootstrap` 是 Main-facing logical input，不是 Game Entry document model。

### Subsystem dual surface

Author：

```text
@loomrealm/subsystem
    defineSubsystem
    Frame / FrameOutcome
    InputListener
    RenderDomain
    ContentClient
```

Trusted integration：

```text
@loomrealm/subsystem/host
    runSubsystem
    RuntimeControlBinding
    SubsystemDataBinding
    SubsystemLaunchContext
```

Business package MUST NOT depend on `/host`、Game Package 或 Launcher。

---

## 5. Platform Launch Integration Packages

当前两个窄 capability：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

各自拥有：

```text
Game Entry consumption orchestration via @loomrealm/game-package
own Platform Launch Manifest schema/parser
Game↔Platform exact key-set join
platform executable resolution/security preflight
immutable PlatformLaunchPlan
Main-facing LogicalGameBootstrap projection
Main-facing RuntimeHosting implementation
Host-owned Runner/bootstrap/supervision integration
Runner provisioning integration point
```

它们只解决 **Subsystem Runtime Game PREPARE + launch**。

不得扩大为：

```text
Renderer platform implementation
Main DataAuthority owner
full DataConnectionBroker
Content product
Hostra Shell/PWA browser mega abstraction
all-platform launcher registry
universal Game source/prepared schema
```

---

## 6. No Universal Launcher Schema

虽然两个 Platform manifest当前都可能出现：

```text
{key,module}
```

仍禁止抽成 common：

```text
PlatformLaunchOptions
launcher.type
options:any
```

同样，不因为两个 launcher 都返回“logical bootstrap + RuntimeHosting”就立即建立跨平台 `PreparedPlatformGame` npm package。

共享的是 semantics/ports，不是预测性的 universal DTO。

---

## 7. Definition Module vs Runner

```text
Business Definition Module
    .mjs
    default SubsystemDefinitionFactory
    author-level business implementation

Host-owned Runner
    physical entry
    imports exact plan-selected module
    constructs role-local ports
```

```text
business module != Node process entry
business module != Worker constructor entry
```

Hostra/PWA artifacts可不同；ABI/formal semantics/business-observable result必须等价。

---

## 8. Host Policy Injection

Game/platform config MAY select installation business artifact；Host policy注入：

```text
Node executable / Worker Runner entry
security policy
bootstrap credential sources
resource/timeouts
Control/provisioning facilities
CSP/same-origin policy
```

Manifest不能覆盖 trusted Runner/security boundary。

---

## 9. Technical Adapter / Integration

Candidates：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

Single capability only：

```text
transport-* != DataConnectionBroker
launcher-node != Game Package/Hostra Game Launcher
content-http != Content semantics
```

Adapter不拥有 complete Platform topology/application authority。

---

## 10. Platform Provisioning Placement

System DataConnectionBroker负责 current Main `S/G/dataProfile` 的 physical realization。

```text
Hostra
    Broker + Runner provisioning IPC + transport-websocket

PWA
    Broker + Worker provisioning + transport-messageport
```

Provisioning interface/encoding如果只有 app-local consumers，就留在 `apps/*` internal code。

不得放入 Runtime Control、Subsystem author API、Renderer Control Snapshot、Game Package、Wire/Foundation。

Launcher package可持有 Runner-side provisioning integration point，但不是 DataAuthority owner/full Broker。

---

## 11. Business Packages

```text
@loomrealm/map
```

依赖固定：

```text
map → @loomrealm/subsystem
```

MUST NOT：

```text
map → game-package
map → game-launcher-*
map → subsystem/host
map → platform adapter
```

Build artifact MAY按平台不同；path/bytes不是 application identity。

---

## 12. Platform Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Desktop：

```text
Hostra Launcher prepare
Main/Renderer roles
Runtime/Renderer Control WS
Runner provisioning IPC
Data Broker/Data WS
fs/HTTP Content
business artifacts
```

PWA：

```text
PWA Launcher prepare
Main/Renderer roles
Runtime/Renderer Control MessagePort
Worker provisioning
Data Broker/MessageChannel
SW/Fetch Content
business artifacts
```

Composition root MAY depend on all lower-level packages but MUST NOT duplicate domain/protocol/Game/Launcher validation semantics。

---

## 13. Port Placement Rule

```text
single role consumes
    → role package integration surface

multiple stable independent consumers
    → smallest shared interface/capability package

only one app glue consumes
    → app internal
```

因此：

- `SubsystemDataBinding` 可在 subsystem host surface；
- `RendererDataBinding` 可在 renderer integration surface；
- `DataConnectionBroker` 不塞入 subsystem；
- RuntimeHosting concrete implementations在 matching launcher；
- Main只依赖 abstract port；
- `LogicalGameBootstrap` exact type placement在 M5/M6真实 integration时放在最小 Main-facing surface，不放回 Game Package。

---

## 14. Dependency Graph

```text
@loomrealm/wire
    ↓
@loomrealm/game-package
    ↓
┌──────────────────────────────┐
│ game-launcher-hostra         │
│ game-launcher-pwa            │
└──────────────────────────────┘
    ↓
apps/*

@loomrealm/main
    → runtime-control / renderer-control / wire as required

@loomrealm/subsystem
    → runtime-control / data / content / foundation

@loomrealm/renderer
    → renderer-control / data / content / foundation as required

@loomrealm/map
    → subsystem
```

禁止：

```text
main → game-package
main → game-launcher-*
map/business → game-package
map/business → game-launcher-*
game-package → launcher/Main
subsystem core → concrete WebSocket/MessagePort
main/renderer/subsystem → apps/*
contract → role implementation
wire/foundation → domain authority
runtime-control → author API
```

---

## 15. Target Workspace

Demand-driven：

```text
packages/
├── foundation/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── main/
├── subsystem/
├── renderer/
├── content-service/
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
└── map/

apps/
├── desktop/
├── pwa/
└── cli/
```

不为了目标图预建无真实 consumer 的 package。

---

## 16. Package Semver / Protocol Version

```text
npm semver != protocol/profile version
```

Game/Launcher consumer-boundary correction仍发生在 real compatibility boundary前，current v1直接更新；不创建 fake v2/adapter。

一旦真实 compatibility obligation形成，incompatible change必须 version/migrate。

---

## 17. Conformance Ownership

```text
game-package tests
    common Game Entry/document snapshot

game-launcher-hostra tests
    Hostra Game consumption + manifest/join/preflight/Runner hosting

game-launcher-pwa tests
    PWA Game consumption + manifest/join/preflight/Worker hosting

main tests
    LogicalGameBootstrap + authority/transactions
    no Game document parser dependency
```

Repository-level：Role SDK semantics、Runner/provisioning integration、Platform E2E、same Game/scenario cross-platform equivalence。

---

## 18. Core Rules

1. Foundation/Wire保持低层正交；
2. Game Package是 document validation capability，不是 Runtime role；
3. Runtime-product Game consumers是 matching Platform Launchers；
4. Main不依赖 Game Package/concrete Launcher；
5. Hostra/PWA executable config分属两个 launcher package；
6. full PREPARE先于 first Runtime side effect；
7. Main只消费 LogicalGameBootstrap并发 logical launch intent；
8. Host-owned Runner与 Definition Module分离；
9. launcher package保持窄 Runtime launch capability；
10. Subsystem author/host surface分离；
11. Platform provisioning留在正确 integration层；
12. apps是 current composition roots；
13. package只因真实消费者/替换/发布价值拆分；
14. business只依赖 author SDK；
15. Hostra/PWA equivalence比较 logical outcome/semantics，不要求 same artifact。
