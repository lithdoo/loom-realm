# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、contract/capability、role、platform launch integration、technical adapter、composition root 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[模块设计目录](../20-modules/README.md)  
> 最近复核：2026-08-20

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
 platform launch integration / technical adapter
          ↑
 composition root / product
```

Business package只依赖 author-facing role SDK。

---

## 2. Foundation / Wire

`@loomrealm/foundation` = carrier/async/lifecycle primitive；`@loomrealm/wire` = JSON/JSON-RPC representation/validation。两者无 domain/platform authority。

---

## 3. Contract / Capability Packages

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

不处理 module、Platform manifest、Process/Worker。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role通过 ports消费 Platform，不 import Hostra/PWA concrete API。

Subsystem dual surface保持：

```text
@loomrealm/subsystem       author API
@loomrealm/subsystem/host  trusted Runner integration
```

---

## 5. Platform Launch Integration Packages

明确创建两个窄能力 package：

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
DataAuthority owner
full DataConnectionBroker
Content product
Hostra Shell/PWA browser mega abstraction
all-platform launcher registry
```

---

## 6. No Universal Launcher Schema

虽然当前两个 manifest都可能出现：

```text
{key,module}
```

仍然禁止把它们抽成 common：

```text
PlatformLaunchOptions
launcher.type
options:any
```

原因：字段相似不代表 authority/validation/security/未来演化相同。唯一共享 join identity是 Game `subsystemKey`。

---

## 7. Host Policy Injection

Launcher package的 manifest parser与 Host policy必须分离。

Game/platform manifest MAY选择 installation business artifact；Host policy注入：

```text
Node executable / Worker Runner entry
security policy
bootstrap credential sources
resource/timeouts
Control/provisioning facilities
```

manifest不能覆盖 trusted Runner/security boundary。

---

## 8. Definition Module vs Runner

```text
Business Definition Module
    .mjs
    default SubsystemDefinitionFactory

Host-owned Runner
    physical entry
    imports exact plan-selected module
    constructs role-local ports
```

Hostra/PWA Definition artifact可不同，ABI/observable semantics相同。

---

## 9. Technical Adapters

候选：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

`game-launcher-hostra` MAY组合 `launcher-node`；`game-launcher-pwa` MAY组合 `transport-messageport`。Adapter不拥有 complete Platform topology/application authority。

---

## 10. Platform Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Desktop组合 Hostra launcher + roles + Renderer/Data Broker/Content/transport adapters。  
PWA组合 PWA launcher + roles + Renderer/Data Broker/Content/transport adapters。

Composition root可以依赖所有 lower-level packages，但不得重新实现 protocol/domain semantics。

---

## 11. Business Packages

```text
@loomrealm/map → @loomrealm/subsystem
```

Business source不得依赖 launcher package。Build系统可以生成 Hostra/PWA不同 artifact，由各自 launch manifest引用。

---

## 12. Dependency Graph

```text
game-launcher-hostra ─┐
                      ├→ game-package + subsystem/host + technical adapters
game-launcher-pwa ────┘

main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

map
    → subsystem

apps/*
    → roles + launcher integration + adapters + business
```

禁止：

```text
main → game-launcher-hostra/pwa
map → game-launcher-*
game-package → platform launcher
contract → role implementation
subsystem core → concrete transport
```

---

## 13. Target Workspace

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

不为了目标图预创建除当前明确设计的 package之外的空包。

---

## 14. Conformance Ownership

```text
game-package/testing
    common manifest/logical topology

game-launcher-hostra/testing
    Hostra manifest/join/preflight/Runner hosting

game-launcher-pwa/testing
    PWA manifest/join/preflight/Worker hosting

runtime-control/renderer-control/data/content
    protocol/profile fixtures
```

仓库级负责 cross-platform abstract-trace equivalence/E2E。

---

## 15. Core Rules

1. Game Package只定义 `{key}` logical topology；
2. Hostra/PWA executable config分属两个 launcher package；
3. 两 launcher不共享万能 schema；
4. exact join + full preflight先于 Runtime side effect；
5. Main只发 logical key；
6. Host-owned Runner与 Definition Module分离；
7. launcher package保持窄 Runtime launch capability；
8. author/host Subsystem surface分离；
9. Platform provisioning留在正确 integration层；
10. apps仍是完整 composition roots；
11. business只依赖 author SDK；
12. cross-platform equivalence不要求 same module artifact。
