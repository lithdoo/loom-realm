# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：基础 primitive、contract/capability、role、technical adapter/Runner、Platform Composition Root 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-19

本文是 package/publish boundary 的当前主要事实源；repository layout只实现本文，不反向定义 package architecture。

```text
Protocol boundary
!= npm package boundary
!= runtime process boundary
!= platform boundary
```

---

## 1. Dependency Layers

```text
foundation / wire
        ↑
contract / capability
        ↑
platform-neutral role
        ↑
technical adapter / Runner integration
        ↑
composition root / product
```

Business package依赖最接近的 platform-neutral author SDK，不依赖 Platform implementation。

---

## 2. Foundation vs Wire

```text
@loomrealm/foundation
    MessageCarrier
    small generic async/lifecycle/testing primitives
    no LoomRealm authority
    no platform concrete API

@loomrealm/wire
    JSON / JSON-RPC representation primitives
    closed shape / safe number / UTF-8/depth measurement
    no lifecycle/transport/domain authority
```

两者正交，不建立 `common/utils` 大包。

---

## 3. Contract / Capability Packages

目标候选：

```text
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
@loomrealm/game-package
```

同 package可以实现多个紧密共享基础设施的 protocol，但不得合并它们的 authority/lifecycle/version space。

Game Package当前核心：

```text
Subsystem Descriptor {key,module}
Definition Module logical identity / validation
```

不包含 Node/Worker runtime creation。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role packages通过 role-facing Platform ports消费基础设施，不直接 import Hostra/PWA concrete APIs。

### Subsystem

业务 author只依赖：

```text
@loomrealm/subsystem
```

Host/composition integration可使用受控 subpath，例如：

```text
@loomrealm/subsystem/host
```

其中放：

```text
runSubsystem
Subsystem Platform Port interfaces
Runtime/Data binding integration types
```

Author root不暴露 MessageCarrier/bootstrap/generation。

---

## 5. Subsystem Definition Module vs Runner

必须分离：

```text
Business Definition Module
    package-owned .mjs
    default export SubsystemDefinitionFactory
    platform-neutral

Platform Subsystem Runner
    Host/PWA-owned runtime bootstrap integration
    loads declared module
    constructs Subsystem-facing Platform Ports
```

因此：

```text
business module != Node process entry
business module != Worker bootstrap shell
```

Runner implementation是否形成独立 package按真实复用需求决定；架构不要求为了对称预建 `subsystem-node/subsystem-worker` package。

---

## 6. Technical Adapter Packages

技术差异优先按单一 capability拆，例如：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

`launcher-node` 可以实现 Desktop Node Runtime Hosting/Runner所需的稳定 technical primitives，但：

```text
launcher-node != Game Package Descriptor
launcher-node != business Subsystem
launcher-node != complete Hostra Platform
```

若 Runner glue只由 `apps/desktop` 使用，保留 app-local；出现独立消费者后再抽 stable package。

---

## 7. Business Packages

```text
@loomrealm/map
```

依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

构建输出可提供 Game Package声明的：

```text
subsystems/loom-map/subsystem.mjs
```

但 package中不包含 Hostra/PWA bootstrap分支。

---

## 8. Platform Composition Roots

当前：

```text
apps/desktop
apps/pwa
apps/cli
```

### Desktop

组合：

```text
Main/Renderer roles
Node Runtime Hosting
Host-owned Node Subsystem Runner
WebSocket adapters
Desktop Data broker
filesystem/HTTP Content
Hostra glue
business Definition Modules
```

### PWA

组合：

```text
Main/Renderer roles
DedicatedWorker Runtime Hosting
Worker Subsystem Runner
MessagePort/MessageChannel adapters
PWA Data broker
Service Worker/Fetch Content
same business Definition Modules
```

Composition root负责选择 implementation、构造 role ports、注入 bootstrap、建立 topology、start/stop product；不得重新实现 protocol/domain semantics。

---

## 9. Platform Architecture vs Platform Package

```text
Platform Composition = architecture concept
apps/*               = current realization/composition root
platform-* package   = optional reusable implementation artifact
```

不默认建立大而全：

```text
@loomrealm/platform-hostra
@loomrealm/platform-pwa
```

只有 multiple independent consumers + stable API + independent release value出现时才抽取。

---

## 10. Port Interface Placement

```text
single-role consumer
    → role package integration subpath

multiple stable consumers
    → minimal shared capability/interface package

app-local only
    → composition root internal
```

System-level DataConnectionBroker不应塞进 Subsystem author surface。

---

## 11. Typical Dependency Graph

```text
main
    → runtime-control
    → renderer-control
    → game-package
    → foundation/wire as required

subsystem
    → runtime-control
    → data
    → content
    → foundation as required

renderer
    → renderer-control
    → data
    → content

map
    → subsystem

technical adapters/runners
    → minimal role integration / foundation interfaces

apps/*
    → roles + adapters + business modules
```

禁止：

```text
main/subsystem/renderer → apps/*
map → platform adapter
subsystem → WebSocket/MessagePort concrete API
contract → role implementation
wire/foundation → domain authority
business module → Hostra/PWA bootstrap
```

---

## 12. Workspace Target

按真实 vertical slice逐步创建：

```text
packages/
├── foundation/
├── wire/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── game-package/
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

这不是要求立即创建全部空 package。

---

## 13. Package Semver vs Protocol Version

```text
npm package semver != protocol/profile/contract version
```

package API可因 implementation ergonomics/testing/performance变化而升级，而协议 version保持不变。

---

## 14. Conformance / Cross-platform Equivalence

protocol fixture跟最近 capability package；仓库级测试负责：

```text
role integration
Platform port fakes
technical adapter/Runner contract
Desktop E2E
PWA E2E
same Game Package + same Definition Modules abstract-trace equivalence
```

---

## 15. Core Rules

1. foundation/wire保持底层且无 domain/platform authority；
2. Game Package定义 `{key,module}`，不定义 Runtime technology；
3. business Definition Module与 Platform Runner分离；
4. role package platform-neutral；
5. technical adapter/Runner不拥有 application authority；
6. apps是当前 Platform composition roots；
7. business package只依赖 role author SDK；
8. Platform Architecture不自动产生 platform npm package；
9. package按真实消费者/稳定能力拆，不为目录对称拆；
10. Hostra/PWA用相同 Descriptor/module产生等价 application outcome。
