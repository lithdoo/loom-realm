# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo物理目录、workspace分类、Subsystem Definition Module/Runner placement、Platform Composition Root、依赖方向与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-19

公开 package职责与发布边界以 [独立分包与发布架构](./package-architecture.md) 为权威来源。本文只回答代码放哪里。

---

## 1. 推荐顶层结构

```text
packages/
├── foundation/
├── wire/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── game-package/
│
├── main/
├── subsystem/
├── renderer/
├── content-service/
│
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
│
└── map/

apps/
├── desktop/
├── pwa/
└── cli/

tests/
├── fixtures/
├── subsystems/
├── integration/
├── platform/
└── e2e/
```

目标图不要求一次创建所有目录。

---

## 2. Package 分类

```text
foundation primitives
    foundation

wire primitives
    wire

contract/capability
    runtime-control / renderer-control / data / content / game-package

runtime/role
    main / subsystem / renderer / content-service

technical adapter/integration
    launcher-node / transport-* / content-*

business
    map / compatibility packages
```

---

## 3. Subsystem Role Package

建议：

```text
packages/subsystem/
├── src/
│   ├── definition/
│   ├── frame/
│   ├── input/
│   ├── render/
│   ├── content/
│   ├── platform/
│   └── internal/
└── test/
```

public author root：

```text
@loomrealm/subsystem
```

只暴露 business capabilities。

Host/composition integration可以使用受控 subpath：

```text
@loomrealm/subsystem/host
```

用于 `runSubsystem`、role-local Platform Port types等，不应被业务 package依赖。

---

## 4. Business Definition Module Placement

业务 package构建输出提供 Game Package v1声明的 `.mjs` Definition Module，例如：

```text
packages/map/
└── src/subsystem.ts

build/package output:
subsystems/loom-map/subsystem.mjs
```

该 `.mjs`：

```text
default export SubsystemDefinitionFactory
platform-neutral
not process/Worker entry glue
```

Desktop/PWA都加载同一业务 module ABI。

---

## 5. Platform Runner Placement

Runner与业务 module分离。

当前不为了目录对称预创建两个 runner package。

### Desktop

Host-owned Node Subsystem Runner MAY先放：

```text
apps/desktop/src/subsystem-runner/
```

如果出现独立复用价值，再抽入最小 technical integration package（可能与 `launcher-node` 合并或独立，按真实边界决定）。

### PWA

Worker Subsystem Runner MAY先放：

```text
apps/pwa/src/subsystem-runner/
```

同样按真实复用决定是否抽包。

两个 Runner都通过 `@loomrealm/subsystem/host`进入同一 role core。

---

## 6. Role-facing Platform Ports

```text
packages/main/src/platform/
packages/subsystem/src/platform/
packages/renderer/src/platform/
```

或 explicit subpath exports。

只有真实 composition/adapter需要的 types才公开；author entry不得 re-export MessageCarrier/bootstrap/generation等底层 mechanics。

System-level DataConnectionBroker不放入某个单一 role author surface。

---

## 7. Apps = Platform Composition Roots

### `apps/desktop`

```text
Node Runtime Hosting
Host-owned Node Subsystem Runner
Runtime/Renderer Control WebSocket bindings
Hostra Renderer Hosting
Desktop Data Broker
filesystem/HTTP Content
```

### `apps/pwa`

```text
DedicatedWorker Runtime Hosting
Worker Subsystem Runner
Runtime/Renderer Control MessagePort bindings
Window Renderer Hosting
MessageChannel Data Broker
Service Worker/Fetch Content
```

App glue负责构造 Main/Renderer/Subsystem-facing ports并启动/停止产品，但不得复制协议语义。

---

## 8. Technical Adapters

```text
packages/launcher-node/
packages/transport-websocket/
packages/transport-messageport/
packages/content-fs/
packages/content-http/
packages/content-service-worker/
```

Adapter实现单一技术能力，不拥有完整 Platform topology。

`launcher-node` 不等于 Game Package launcher declaration；Game Package现在只有 `{key,module}`。

---

## 9. Tests

```text
tests/fixtures
    Game Package {key,module}
    Definition Modules
    content samples
    abstract traces

tests/subsystems
    shared test Definition Modules

tests/integration
    role/package integration
    fake Platform ports

tests/platform
    Desktop Node Runner
    PWA Worker Runner
    Data brokers/adapters
    abstract-trace equivalence

tests/e2e
    Desktop
    PWA
```

可复用 protocol conformance fixture跟最近 capability package。

---

## 10. Typical Dependencies

```text
main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content

map
    → subsystem

Desktop/PWA Runner
    → subsystem/host + minimal platform adapters

apps/*
    → roles + adapters + business modules
```

禁止：

```text
map → platform adapter/runner
subsystem author core → WebSocket/MessagePort concrete API
main/renderer/subsystem → apps/*
wire/foundation → domain authority
business module → Hostra/PWA bootstrap
```

---

## 11. First-stage Creation Order

```text
foundation + wire
→ game-package {key,module}
→ runtime-control
→ subsystem host integration + main
→ Desktop Node Runner + launcher-node + transport-websocket
→ Frame vertical slice
→ renderer-control + data + renderer
→ Desktop Data broker
→ content stack
→ map Definition Module
→ apps/desktop
→ PWA Worker Runner + messageport/service-worker adapters
→ apps/pwa
→ cross-platform equivalence
```

---

## 12. Core Rules

1. repository layout实现 package architecture，不反向定义它；
2. Game Package v1只声明 `{key,module}`；
3. business Definition Module与 Platform Runner物理分离；
4. same business `.mjs`用于 Desktop/PWA；
5. Runner先 app-local，真实复用后再抽 package；
6. foundation/wire是底层且无 domain/platform authority；
7. role package通过 ports保持 platform-neutral；
8. apps是当前 Platform composition roots；
9. business package无平台分支；
10. physical layout不同但 shared application trace必须等价。
