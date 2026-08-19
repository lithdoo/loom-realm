# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo物理目录、Subsystem author/host surface、Definition Module/Runner、Platform provisioning、测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-19

公开 package职责以 package architecture为权威；本文只回答“代码放哪里”。

---

## 1. Top-level

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

tests/
├── fixtures/
├── subsystems/
├── integration/
├── platform/
└── e2e/
```

不要求一次创建所有目录。

---

## 2. Package Categories

```text
low-level
    foundation / wire

contract/capability
    game-package / runtime-control / renderer-control / data / content

role
    main / subsystem / renderer / content-service

technical adapter
    launcher-node / transport-* / content-*

business
    map / compatibility packages
```

---

## 3. `packages/subsystem`

目标：

```text
packages/subsystem/
├── src/
│   ├── index.ts                 author exports
│   ├── definition/
│   ├── frame/
│   ├── input/
│   ├── render/
│   ├── content/
│   ├── host/
│   │   ├── run-subsystem.ts
│   │   └── platform-ports.ts
│   └── internal/
│       ├── runtime-control-plane.ts
│       └── data-plane.ts
└── test/
```

Exports：

```text
@loomrealm/subsystem
    business author API

@loomrealm/subsystem/host
    trusted Runner/integration API
```

Business package不得 import `/host`。

---

## 4. `packages/data`

```text
packages/data/
└── src/
    ├── profile/
    ├── connection/
    ├── input/
    ├── render/
    ├── dispatcher/
    └── testing/
```

保持：

```text
Profile composition != child state-machine merge
Connection != Input != Render
one Data dispatcher consumes carrier
```

当前 Profile identity：`loomrealm.renderer-data/1`。

---

## 5. Business Definition Module

业务 source：

```text
packages/map/src/subsystem.ts
```

安装/构建输出：

```text
subsystems/loom-map/subsystem.mjs
```

要求：

```text
default export SubsystemDefinitionFactory
platform-neutral
not Process/Worker entry glue
```

---

## 6. Runner Placement

不预创建 Runner packages。

### Desktop

优先：

```text
apps/desktop/src/subsystem-runner/
├── entry.ts
├── bootstrap.ts
├── control-binding.ts
├── provisioning.ts
└── data-binding.ts
```

### PWA

优先：

```text
apps/pwa/src/subsystem-runner/
├── worker-entry.ts
├── bootstrap.ts
├── control-binding.ts
├── provisioning.ts
└── data-binding.ts
```

两个 Runner都通过 `@loomrealm/subsystem/host`进入同一 Role Core。

出现多个真实消费者后才考虑抽 `subsystem-node/subsystem-worker` technical helper。

---

## 7. Role-facing Port Placement

```text
packages/main/src/platform/
packages/subsystem/src/host/platform-ports.ts
packages/renderer/src/platform/
```

典型命名：

```text
RendererDataBinding
SubsystemDataBinding
```

不要用一个角色含糊接口同时表示两端。

System-level `DataConnectionBroker` 留在 composition/integration层或真实共享 capability，不进入任何 author surface。

---

## 8. Desktop Composition Root

```text
apps/desktop/
├── Main/Renderer composition
├── Hostra integration
├── Node Runtime Hosting/Runner
├── Runtime/Renderer Control WS binding
├── Runner Platform Provisioning IPC
├── DataConnectionBroker
├── Data WebSocket provisioning
└── Content HTTP/fs composition
```

Runner provisioning必须和 Runtime Control/stdout/Data application carrier物理/逻辑分离。

---

## 9. PWA Composition Root

```text
apps/pwa/
├── Main/Renderer composition
├── Worker Runtime Hosting/Runner
├── Runtime/Renderer Control MessagePort binding
├── Worker provisioning path
├── DataConnectionBroker / MessageChannel transfer
└── Content Service Worker/Fetch composition
```

Control/Data carrier只发送 string application units；Port object只通过 provisioning/bootstrap transfer。

---

## 10. Technical Adapters

```text
launcher-node
transport-websocket
transport-messageport
content-fs/http/service-worker
```

Adapter不拥有 Main DataAuthority/Frame recovery/complete Platform topology。

`transport-messageport` 接受 already-provisioned Port并提供 `MessageCarrier<string>`；创建/transfer Port属于 Platform Broker/Runner integration。

---

## 11. Test Layout

```text
tests/fixtures
    Game Package {key,module}
    Definition Modules
    protocol abstract traces
    content fixtures

tests/subsystems
    success/cancel/fail business Definitions
    exception/long-running/signal fixtures

tests/integration
    Runtime Control / Frame
    Renderer Control / Data Profile
    Subsystem SDK author-host boundary
    role-facing fake ports

tests/platform/desktop
    Node Runner
    provisioning IPC
    Data ticket/WS establishment

tests/platform/pwa
    Worker Runner
    provisioning Port
    MessageChannel transfer

tests/platform/equivalence
    same Definition Module abstract traces

tests/e2e
    desktop/
    pwa/
```

---

## 12. Typical Dependencies

```text
main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content / foundation as needed

map
    → subsystem

Desktop/PWA Runner
    → subsystem/host + minimal adapters

apps/*
    → roles + adapters + business modules
```

禁止：

```text
map → subsystem/host
map → Platform/Runner adapter
subsystem author root → concrete WebSocket/MessagePort
main/renderer/subsystem → apps/*
wire/foundation → domain authority
runtime-control → author SDK
```

---

## 13. Creation Order

```text
foundation + wire
→ game-package
→ runtime-control
→ subsystem author/host + main
→ Desktop Runner/Control adapter
→ Frame vertical slice
→ renderer-control
→ data Profile/Connection/dispatcher
→ Desktop Broker/provisioning
→ Input/Render
→ Content
→ map Definition Module
→ Desktop E2E
→ PWA Runner/adapters/provisioning
→ PWA E2E
→ cross-platform equivalence
```

---

## 14. Final Rules

1. repository layout只实现 package architecture；
2. author/host export surface物理分开；
3. Definition Module与 Runner分开；
4. RendererDataBinding/SubsystemDataBinding明确两端；
5. Data Profile/Connection/Input/Render在 data package内分域；
6. Runner/provisioning优先 app-local；
7. Foundation/Wire低层正交；
8. apps是最终 composition roots；
9. business无 Platform分支；
10. tests显式覆盖 Runtime-fatal continuation与 provisioning failure boundaries。