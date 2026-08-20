# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo物理目录、Game/Platform launch packages、Subsystem author/host surface、Definition Module/Runner、Platform provisioning与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-20

公开 package职责以 package architecture为权威；本文只回答“代码放哪里”。

---

## 1. Top-level

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

tests/
├── fixtures/
├── subsystems/
├── integration/
├── platform/
└── e2e/
```

不要求一次创建所有目录；按 vertical slice / real consumer逐步创建。

---

## 2. Package Categories

```text
low-level
    foundation / wire

contract/capability
    game-package / runtime-control / renderer-control / data / content

role
    main / subsystem / renderer / content-service

runtime launch integration
    game-launcher-hostra / game-launcher-pwa

technical adapter
    launcher-node / transport-* / content-*

business
    map / compatibility packages
```

---

## 3. `packages/game-package`

目标：

```text
packages/game-package/
├── src/
│   ├── model.ts
│   ├── parse.ts
│   ├── validate.ts
│   └── errors.ts
└── test/
```

只处理：

```text
game.json logical data
Descriptor {key}
initial target/input
complete key-set validation
```

无 filesystem/Fetch/module resolution/Runtime side effect依赖。

---

## 4. `packages/game-launcher-hostra`

目标：

```text
packages/game-launcher-hostra/
├── src/
│   ├── manifest/
│   ├── planner/
│   ├── module-resolver/
│   ├── runtime-hosting/
│   ├── runner/
│   │   ├── entry.ts
│   │   ├── bootstrap.ts
│   │   ├── control-binding.ts
│   │   ├── provisioning.ts
│   │   └── data-binding.ts
│   └── supervision/
└── test/
```

拥有 Hostra Subsystem Runtime launch capability：

```text
launch.hostra.json
→ exact Game key join
→ safe filesystem/install resolution
→ HostraLaunchPlan
→ Node Runner/Supervision integration
```

不包含 Renderer/DataBroker/Content完整 composition。

---

## 5. `packages/game-launcher-pwa`

目标：

```text
packages/game-launcher-pwa/
├── src/
│   ├── manifest/
│   ├── planner/
│   ├── module-resolver/
│   ├── runtime-hosting/
│   ├── runner/
│   │   ├── worker-entry.ts
│   │   ├── bootstrap.ts
│   │   ├── control-binding.ts
│   │   ├── provisioning.ts
│   │   └── data-binding.ts
│   └── supervision/
└── test/
```

Worker Runner与 PWA executable resolution在这里；Renderer/SW/Data Broker仍留在 composition/adapters。

---

## 6. `packages/subsystem`

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

Launcher packages依赖 `/host`；Business package不得 import `/host`。

---

## 7. `packages/data`

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

## 8. Business Definition Build

业务 source：

```text
packages/map/src/subsystem.ts
```

可能构建输出：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

也可两个 manifest指向同一 portable artifact。

要求：

```text
default export SubsystemDefinitionFactory
business source platform-neutral
not Process/Worker entry glue
not dependent on launch manifest
```

目录/path/bytes不是 cross-platform identity；Subsystem key + ABI/semantics才是。

---

## 9. Runner Placement

当前两个 launcher package已明确拥有对应 Runtime launch integration，因此 Runner代码优先与该 launcher package共置，而不是复制到 `apps/*`：

```text
packages/game-launcher-hostra/src/runner/
packages/game-launcher-pwa/src/runner/
```

`apps/desktop` / `apps/pwa` 仍负责完整 Platform composition与 Host product glue。

若未来 Runner出现独立消费者并需要再拆 technical helper，必须按真实复用决定，不预建万能 `subsystem-node/subsystem-worker`。

---

## 10. Role-facing Port Placement

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

Concrete Hostra/PWA `RuntimeHosting`实现分别在对应 `game-launcher-*` package；Main只依赖 abstract port。

---

## 11. Desktop Composition Root

```text
apps/desktop/
├── Main/Renderer composition
├── Hostra product/shell integration
├── @loomrealm/game-launcher-hostra integration
├── Runtime/Renderer Control WS binding
├── DataConnectionBroker
├── Data WebSocket provisioning
├── Runner Platform Provisioning IPC coordination
└── Content HTTP/fs composition
```

Runner provisioning必须和 Runtime Control/stdout/Data application carrier物理/逻辑分离。

不要在 app重复 Hostra manifest/planner/Runner contract semantics。

---

## 12. PWA Composition Root

```text
apps/pwa/
├── Main/Renderer composition
├── browser product integration
├── @loomrealm/game-launcher-pwa integration
├── Runtime/Renderer Control MessagePort binding
├── DataConnectionBroker / MessageChannel transfer
├── Worker provisioning coordination
└── Content Service Worker/Fetch composition
```

Control/Data carrier只发送 string application units；Port object只通过 provisioning/bootstrap transfer。

不要在 app重复 PWA manifest/planner/Runner contract semantics。

---

## 13. Technical Adapters

```text
launcher-node
transport-websocket
transport-messageport
content-fs/http/service-worker
```

Adapter不拥有 Main DataAuthority/Frame recovery/complete Platform topology。

`transport-messageport` 接受 already-provisioned Port并提供 payload 固定为 `string` 的 `MessageCarrier`；创建/transfer Port属于 Platform Broker/Runner integration。

---

## 14. Platform Config Placement

```text
Game common
    game.json

Hostra
    launch.hostra.json

PWA
    launch.pwa.json
```

两个 Platform manifest物理上可以随 installation/package一同分发，但 parser/schema分别归对应 launcher package。

禁止建立：

```text
one universal launch.json
launcher.type switch
options:any
```

除非未来真实 interoperability需求重新定义该边界。

---

## 15. Test Layout

```text
tests/fixtures
    Game Entries {key...}
    Hostra Launch Manifests
    PWA Launch Manifests
    Definition Modules / platform-specific artifacts
    protocol abstract traces
    content fixtures

tests/subsystems
    success/cancel/fail business Definitions
    exception/long-running/signal fixtures

tests/integration
    game-package
    Runtime Control / Frame
    Renderer Control / Data Profile
    Subsystem SDK author-host boundary
    role-facing fake ports

tests/platform/hostra
    manifest/join/preflight
    Node Runner/Supervision
    provisioning IPC
    Data ticket/WS establishment

tests/platform/pwa
    manifest/join/preflight
    Worker Runner/Supervision
    provisioning Port
    MessageChannel transfer

tests/platform/equivalence
    same logical Game/scenario with platform-specific bindings

tests/e2e
    desktop/
    pwa/
```

关键 preflight fault-injection：

```text
invalid Game Entry
invalid Platform manifest
missing/extra key
invalid module syntax
module outside installation
hosting capability unavailable
```

每一种都必须证明：

```text
Process/Worker creation = 0
business module import = 0
Runtime Control establishment = 0
```

---

## 16. Typical Dependencies

```text
main
    → runtime-control / renderer-control / game-package

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content / foundation as needed

map
    → subsystem

game-launcher-hostra
    → game-package + subsystem/host + launcher-node + minimal adapters

game-launcher-pwa
    → game-package + subsystem/host + minimal Worker/MessagePort integration

apps/*
    → roles + matching launcher + adapters + business modules
```

禁止：

```text
main → game-launcher-*
map → game-launcher-*
map → subsystem/host
map → Platform/Runner adapter
subsystem author root → concrete WebSocket/MessagePort
main/renderer/subsystem → apps/*
wire/foundation → domain authority
runtime-control → author SDK
```

---

## 17. Creation Order

```text
foundation + wire
→ game-package
→ runtime-control
→ subsystem author/host + main
→ game-launcher-hostra
→ Frame Desktop vertical slice
→ renderer-control
→ data Profile/Connection/dispatcher
→ Desktop Broker/provisioning
→ Input/Render
→ Content
→ map Definition Module/artifacts
→ Desktop E2E
→ game-launcher-pwa
→ PWA adapters/provisioning
→ PWA E2E
→ cross-platform equivalence
```

---

## 18. Final Rules

1. repository layout只实现 package architecture；
2. Game common config与 Platform executable config物理/逻辑分开；
3. `game-package`只处理 logical topology，不处理 module resolution；
4. two launcher packages各自拥有 schema/planner/resolver/RuntimeHosting/Runner integration；
5. author/host export surface物理分开；
6. Definition Module与 Host-owned Runner分开；
7. RendererDataBinding/SubsystemDataBinding明确两端；
8. Data Profile/Connection/Input/Render在 data package内分域；
9. system Data Broker仍在 composition/integration层；
10. Launcher package不膨胀为完整 Platform mega-package；
11. Foundation/Wire低层正交；
12. apps是最终 composition roots；
13. business无 Platform launch依赖/分支；
14. tests显式覆盖 zero-side-effect preflight、Runtime-fatal continuation与 provisioning failure boundaries；
15. cross-platform equivalence不要求 same Definition artifact。
