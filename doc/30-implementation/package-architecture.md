# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、contract/capability、role/author-host surface、platform launch integration、technical adapter/Runner integration、Platform composition 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-20

本文是 package/publish boundary 的主要事实源；repository layout只实现本文，不反向定义它。

```text
Protocol boundary
!= npm package boundary
!= runtime process boundary
!= platform boundary
```

---

## 1. Dependency Layers

```text
foundation     wire
     \         /
 contract / capability
          ↑
 platform-neutral role
          ↑
 platform launch integration / technical adapter / Runner integration
          ↑
 composition root / product
```

Business package只依赖最接近的 author-facing role SDK。

---

## 2. Foundation / Wire

```text
@loomrealm/foundation
    MessageCarrier
    deterministic memory carrier
    small generic async/lifecycle primitives
    no JSON/domain/platform semantics

@loomrealm/wire
    JSON / JSON-RPC representation
    closed object / safe integer / UTF-8/depth primitives
    no carrier/lifecycle/domain authority
```

两者正交，不合并成 `common/utils`。

---

## 3. Contract / Capability Packages

目标：

```text
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
```

### game-package

只处理：

```text
Game Entry formatVersion
initial target/input
Subsystem Descriptor {key}
complete logical key-set validation
```

不处理：

```text
module
Platform Launch Manifest
Node/Worker selection
Process/Worker creation
RuntimeHosting
```

### runtime-control

```text
Subsystem Control v1
Frame / Call v1
Runtime Control Profile v1
```

共享 dispatcher/Request ID machinery，但 protocol authority/version仍独立。

### data

```text
Renderer Data Profile v1
Data Connection v1
User Input v1
Render Update v1
```

可以共享 one Data dispatcher/testing infrastructure，但 Connection/Input/Render lifecycle/revision/authority不合并。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role通过 ports消费 Platform，不直接 import Hostra/PWA concrete API。

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

业务 package MUST NOT依赖 `/host`。

### Renderer

Renderer integration可定义：

```text
RendererControlBinding
RendererDataBinding
```

不要与 Subsystem side 的 `SubsystemDataBinding` 同名。

---

## 5. Platform Launch Integration Packages

当前明确创建两个窄能力 package：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们各自拥有：

```text
own Platform Launch Manifest schema/parser
Game key-set join
platform executable resolution
immutable PlatformLaunchPlan
Main-facing RuntimeHosting implementation
Host-owned Runner/bootstrap/supervision integration
Runner provisioning integration point
```

它们只解决 **Subsystem Runtime launch**。

不得扩大为：

```text
Renderer platform implementation
Main DataAuthority owner
full DataConnectionBroker
Content product
Hostra Shell/PWA browser mega abstraction
all-platform launcher registry
```

---

## 6. No Universal Launcher Schema

虽然当前两个 Platform manifest都可能出现：

```text
{key,module}
```

仍然禁止抽成 common：

```text
PlatformLaunchOptions
launcher.type
options:any
```

原因：字段相似不代表 authority/validation/security/未来演化相同。

唯一共享 join identity是 Game `subsystemKey`。

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

因此：

```text
business module != Node process entry
business module != Worker runner entry
```

Hostra/PWA Definition artifact可以不同；ABI/formal semantics/business-observable result必须等价。

---

## 8. Host Policy Injection

Launcher manifest与 Host policy必须分离。

Game/platform manifest MAY选择 installation 内 business artifact；Host policy注入：

```text
Node executable / Worker Runner entry
security policy
bootstrap credential sources
resource/timeouts
Control/provisioning facilities
CSP/same-origin policy
```

manifest不能覆盖 trusted Runner/security boundary。

---

## 9. Technical Adapter / Integration

候选：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

技术包只做单一 capability：

```text
transport-* != DataConnectionBroker
launcher-node != Game Package
content-http != Content semantics
```

`game-launcher-hostra` MAY组合 `launcher-node`；`game-launcher-pwa` MAY组合 `transport-messageport`。

Adapter不拥有 complete Platform topology/application authority。

---

## 10. Platform Provisioning Placement

System DataConnectionBroker负责 current Main `S/G/dataProfile` 的物理 realization。

```text
Hostra
    Broker + Runner provisioning IPC + transport-websocket

PWA
    Broker + Worker provisioning path + transport-messageport
```

Provisioning interface/encoding如果只有 app-local两端消费，就留在 `apps/*` internal code。

不得放入：

```text
runtime-control application methods
subsystem author API
Renderer Control Snapshot
Game Package
wire/foundation
```

Launcher package可以持有 Runner-side provisioning integration point，但不能因此成为 DataAuthority owner或完整 DataConnectionBroker。

---

## 11. Business Packages

```text
@loomrealm/map
```

依赖固定：

```text
map → @loomrealm/subsystem
```

Business source不得依赖 launcher package。

构建输出 MAY分别生成：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

也 MAY两个 manifest指向同一 portable artifact。

目录/path/bytes不是 application identity；Subsystem key + ABI/semantics才是。

---

## 12. Platform Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Desktop组合：

```text
Hostra launcher integration
Main/Renderer roles
Node Runtime Hosting/Runner
Runtime/Renderer Control WS
Runner provisioning IPC
Data Broker/Data WS
fs/HTTP Content
business modules
```

PWA组合：

```text
PWA launcher integration
Main/Renderer roles
Worker Runtime Hosting/Runner
Runtime/Renderer Control MessagePort
Worker provisioning path
Data Broker/MessageChannel
SW/Fetch Content
business modules
```

Composition root可以依赖全部 lower-level packages，但不得重新实现 protocol/domain semantics。

---

## 13. Platform Architecture != Platform Package

```text
Platform Composition = architecture responsibility
apps/*               = current final composition roots
platform-* package   = optional reusable artifact
```

不默认建立大而全 `platform-hostra/platform-pwa`。

两个 `game-launcher-*` package是窄 Runtime launch capability，不违反这条规则。

---

## 14. Port Placement Rule

```text
single role consumes
    → role package integration subpath

multiple stable independent consumers
    → smallest shared interface/capability package

only one app glue consumes
    → app internal
```

因此：

- `SubsystemDataBinding` 可以在 subsystem host integration surface；
- `RendererDataBinding` 可以在 renderer integration surface；
- `DataConnectionBroker` system coordination不塞入 `@loomrealm/subsystem`；
- Platform provisioning wire若只在某 app两端消费就保持 app-local；
- `RuntimeHosting` 的 concrete Hostra/PWA实现分别落在对应 launcher package；
- Main只依赖抽象 port，不依赖具体 launcher package。

---

## 15. Dependency Graph

```text
game-launcher-hostra ─┐
                      ├→ game-package + subsystem/host + technical adapters
game-launcher-pwa ────┘

main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content / foundation as required

map
    → subsystem

apps/*
    → roles + matching launcher + adapters + business
```

禁止：

```text
main → game-launcher-hostra/pwa
map → game-launcher-*
map → subsystem/host
map → platform adapter
game-package → platform launcher
subsystem core → concrete WebSocket/MessagePort
main/renderer/subsystem → apps/*
contract → role implementation
wire/foundation → domain authority
runtime-control → author API
```

---

## 16. Target Workspace

按 demand-driven vertical slice逐步创建：

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

不为了目标图预创建除当前 vertical slice确有设计/消费者之外的空 package。

---

## 17. Package Semver / Protocol Version

```text
npm semver != protocol/profile version
```

当前用户明确允许在真实 compatibility boundary形成前对 current v1做 breaking reset；因此本次 Game/Platform launch边界直接修改 current v1，不创建 v2。

一旦某协议/contract真正形成 compatibility obligation，则 incompatible change必须按对应 version/migration治理处理。

---

## 18. Conformance Ownership

```text
game-package/testing
    common Game Entry/logical topology

game-launcher-hostra/testing
    Hostra manifest/join/preflight/Runner hosting

game-launcher-pwa/testing
    PWA manifest/join/preflight/Worker hosting

runtime-control/testing
renderer-control/testing
data/testing
content/testing
    reusable protocol/profile fixtures
```

仓库级负责：

```text
Role SDK semantics
Runner/provisioning integration
Platform E2E
same logical Game/scenario cross-platform equivalence
```

---

## 19. Core Rules

1. foundation/wire保持低层且正交；
2. Game Package只定义 `{key}` logical topology与 initial business input；
3. Hostra/PWA executable config分属两个 launcher package；
4. 两 launcher不共享万能 schema；
5. exact join + full preflight先于 first Runtime side effect；
6. Main只发 logical key/Launch Attempt material；
7. Host-owned Runner与 Definition Module分离；
8. launcher package保持窄 Runtime launch capability；
9. Subsystem author/host surface分离；
10. Renderer/Subsystem Data binding role名称分离；
11. `@loomrealm/data`实现 Data Profile/Connection/Input/Render，但不合并其状态机；
12. Platform provisioning留在正确 integration层，不进入 application protocols/Game Package；
13. role package platform-neutral；
14. apps是当前 composition roots；
15. package只因真实消费者/替换/发布价值拆分；
16. business只依赖 author SDK；
17. Hostra/PWA cross-platform equivalence比较 logical outcome/semantics，不要求 same Definition artifact。
