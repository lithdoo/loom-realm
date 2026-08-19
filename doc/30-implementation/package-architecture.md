# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、contract/capability、role/author-host surface、technical adapter/Runner integration、Platform composition 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-19

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
 technical adapter / Runner integration
          ↑
 composition root / product
```

Business package只依赖最接近的 author-facing role SDK。

---

## 2. Foundation / Wire

```text
@loomrealm/foundation
    MessageCarrier<string>
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
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
@loomrealm/game-package
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

### game-package

只处理：

```text
Descriptor {key,module}
Definition Module logical validation
```

不创建 Process/Worker。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role通过 ports消费 Platform，不直接 import具体 Hostra/PWA API。

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

## 5. Definition Module vs Runner

```text
Business Definition Module
    .mjs
    default SubsystemDefinitionFactory
    platform-neutral

Platform Subsystem Runner
    Host-owned Runtime entry
    loads exact declared module
    constructs role-local ports
```

因此：

```text
business module != Node process entry
business module != Worker runner entry
```

Runner是否抽独立 package按真实复用决定。

---

## 6. Technical Adapter / Integration

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

Runner/provisioning glue优先 app-local；若多个独立消费者稳定复用，再抽类似：

```text
@loomrealm/subsystem-node     // optional future
@loomrealm/subsystem-worker   // optional future
```

这些若存在也是 technical integration，不是 business SDK/platform mega-package。

---

## 7. Platform Provisioning Placement

System DataConnectionBroker负责 current Main `S/G/dataProfile` 的物理 realization。

```text
Hostra
    broker + Runner provisioning IPC + transport-websocket

PWA
    broker + Worker provisioning path + transport-messageport
```

Provisioning interface/encoding如果只有 app-local两端消费，就留在 `apps/*` internal code。

不得放入：

```text
runtime-control application methods
subsystem author API
Renderer Control Snapshot
wire/foundation
```

---

## 8. Business Packages

```text
@loomrealm/map
```

依赖固定：

```text
map → @loomrealm/subsystem
```

构建输出可以产出：

```text
subsystems/loom-map/subsystem.mjs
```

但不包含 Platform Runner/bootstrap/provisioning分支。

---

## 9. Platform Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Desktop组合：

```text
Main/Renderer roles
Node Runtime Hosting/Runner
Runtime/Renderer Control WS
Runner provisioning IPC
Data Broker/Data WS
fs/HTTP Content
business Definition Modules
```

PWA组合：

```text
Main/Renderer roles
Worker Runtime Hosting/Runner
Runtime/Renderer Control MessagePort
Worker provisioning path
Data Broker/MessageChannel
SW/Fetch Content
same business Definition Modules
```

Composition root可以依赖全部 lower-level packages，但不得重新实现 protocol/domain semantics。

---

## 10. Platform Architecture != Platform Package

```text
Platform Composition = architecture responsibility
apps/*               = current final composition roots
platform-* package   = optional reusable artifact
```

不默认建立大而全 `platform-hostra/platform-pwa`。

---

## 11. Port Placement Rule

```text
single role consumes
    → role package integration subpath

multiple stable independent consumers
    → smallest shared interface/capability package

only one app glue consumes
    → app internal
```

因此 `DataConnectionBroker` system coordination不塞入 `@loomrealm/subsystem`；`SubsystemDataBinding` 可以在 subsystem host integration surface。

---

## 12. Dependency Graph

```text
main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content / foundation as required

map
    → subsystem

Runner/adapters
    → minimal role host/interface + foundation

apps/*
    → roles + adapters + business
```

禁止：

```text
map → subsystem/host
map → platform adapter
subsystem core → concrete WebSocket/MessagePort
main/renderer/subsystem → apps/*
contract → role implementation
wire/foundation → domain authority
runtime-control → author API
```

---

## 13. Target Workspace

按 demand-driven vertical slice逐步创建：

```text
packages/
├── foundation/
├── wire/
├── game-package/
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

不为了目标图预创建空 package。

---

## 14. Package Semver / Protocol Version

```text
npm semver != protocol/profile version
```

当前用户明确允许在实现冻结前对 v1文档做 breaking reset；一旦某协议真正 Frozen/发布，则必须按其兼容治理处理。

---

## 15. Conformance Ownership

```text
runtime-control/testing
renderer-control/testing
data/testing
content/testing
```

负责 reusable protocol/profile fixtures。

仓库级负责：

```text
Role SDK semantics
Runner/provisioning integration
Platform E2E
same Definition Module cross-platform equivalence
```

---

## 16. Core Rules

1. foundation/wire保持低层且正交；
2. Game Package只定义 `{key,module}`；
3. Definition Module与 Runner分离；
4. Subsystem author/host surface分离；
5. Renderer/Subsystem Data binding role名称分离；
6. `@loomrealm/data`实现 Data Profile/Connection/Input/Render，但不合并其状态机；
7. Platform provisioning留在正确 integration层，不进入 application protocols；
8. role package platform-neutral；
9. apps是当前 composition roots；
10. package只因真实消费者/替换/发布价值拆分；
11. business只依赖 author SDK；
12. Hostra/PWA同 Definition Module产生等价 application outcome。