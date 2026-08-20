# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo 物理目录、Game Package document capability、Game/Platform launcher packages、Main-facing bootstrap surface、Subsystem author/host、Runner/provisioning与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)  
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

document/contract capability
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

Target：

```text
packages/game-package/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── model.ts
│   ├── errors.ts
│   ├── validate.ts
│   └── snapshot.ts
└── test/
    ├── parse.test.mjs
    ├── schema.test.mjs
    ├── keys.test.mjs
    ├── snapshot.test.mjs
    ├── errors.test.mjs
    └── package-boundary.test.mjs
```

Only：

```text
GameEntryV1 document
Descriptor {key}
initial target/input
closed validation
validated detached immutable snapshot
```

Runtime dependency：

```text
@loomrealm/wire
```

No filesystem/Fetch/module resolution/Runtime side effect。

Primary Runtime-product consumers：`game-launcher-hostra/pwa`。

---

## 4. `packages/game-launcher-hostra`

Target：

```text
packages/game-launcher-hostra/
├── src/
│   ├── prepare/
│   │   ├── game-entry.ts
│   │   ├── logical-bootstrap.ts
│   │   └── prepare-hostra-game.ts
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

Owns：

```text
Game Entry consumption via @loomrealm/game-package
launch.hostra.json
exact Game key join
safe filesystem/install resolution
HostraLaunchPlan
LogicalGameBootstrap projection
RuntimeHosting / Node Runner / supervision integration
```

不包含 Renderer/DataBroker/Content完整 composition。

---

## 5. `packages/game-launcher-pwa`

Target：

```text
packages/game-launcher-pwa/
├── src/
│   ├── prepare/
│   │   ├── game-entry.ts
│   │   ├── logical-bootstrap.ts
│   │   └── prepare-pwa-game.ts
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

Owns PWA Game Entry consumption + manifest/preflight/Worker Runtime launch integration。

Renderer/SW/Data Broker仍在 composition/adapters。

---

## 6. `packages/main`

Main source should contain a logical bootstrap input surface, but no Game Entry parser：

```text
packages/main/src/
├── bootstrap/
│   └── logical-game-bootstrap.ts
├── runtime/
├── frame/
├── renderer-control/
├── data-authority/
└── platform/
```

`logical-game-bootstrap.ts` represents Main-facing facts only：

```text
subsystemKeys
initial {subsystemKey,input}
```

MUST NOT import：

```text
@loomrealm/game-package
@loomrealm/game-launcher-*
```

Exact type placement MAY be adjusted during M5/M6 if a smaller shared Main-facing surface is justified；it MUST NOT be placed back into Game Package merely for reuse。

---

## 7. `packages/subsystem`

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
└── test/
```

Exports：

```text
@loomrealm/subsystem
    business author API

@loomrealm/subsystem/host
    trusted Runner/integration API
```

Business package不得 import `/host`、Game Package、Launcher。

---

## 8. `packages/data`

```text
packages/data/src/
├── profile/
├── connection/
├── input/
├── render/
├── dispatcher/
└── testing/
```

```text
Profile composition != child state-machine merge
Connection != Input != Render
one Data dispatcher consumes carrier
```

Current profile：`loomrealm.renderer-data/1`。

---

## 9. Business Definition Build

Source：

```text
packages/map/src/subsystem.ts
```

Possible artifacts：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

MUST：

```text
default export SubsystemDefinitionFactory
business source platform-neutral
not Process/Worker entry glue
not dependent on Game Entry/Launch manifest
```

---

## 10. Runner Placement

Current launcher packages own Runtime launch integration；Runner code colocates there：

```text
packages/game-launcher-hostra/src/runner/
packages/game-launcher-pwa/src/runner/
```

Do not pre-create universal `subsystem-node/subsystem-worker` without real independent reuse。

---

## 11. Role-facing Port Placement

```text
packages/main/src/platform/
packages/subsystem/src/host/platform-ports.ts
packages/renderer/src/platform/
```

Typical：

```text
RuntimeHosting
RendererDataBinding
SubsystemDataBinding
```

System-level `DataConnectionBroker` stays composition/integration unless real shared capability emerges。

Concrete RuntimeHosting lives in matching launcher；Main only sees abstract port。

---

## 12. Desktop Composition Root

```text
apps/desktop/
├── Hostra game source/installation integration
├── @loomrealm/game-launcher-hostra prepare
├── Main/Renderer composition
├── Runtime/Renderer Control WS binding
├── DataConnectionBroker
├── Data WebSocket provisioning
├── Runner provisioning IPC coordination
└── Content HTTP/fs composition
```

`apps/desktop` MUST NOT reimplement Game Entry validator、Hostra manifest validator、exact join or Runner contract semantics。

---

## 13. PWA Composition Root

```text
apps/pwa/
├── PWA game source/installation integration
├── @loomrealm/game-launcher-pwa prepare
├── Main/Renderer composition
├── Runtime/Renderer Control MessagePort binding
├── DataConnectionBroker / MessageChannel transfer
├── Worker provisioning coordination
└── Content Service Worker/Fetch composition
```

Control/Data carrier只发送 string application units；Port object仅通过 bootstrap/provisioning transfer。

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

两个 Platform manifest可随 installation分发，但 parser/schema分别归 matching launcher。

禁止：

```text
one universal launch.json
launcher.type switch
options:any
```

---

## 15. Test Layout

```text
tests/fixtures
    raw Game Entries
    Hostra/PWA Launch Manifests
    Definition Modules/artifacts
    logical bootstrap expectations
    protocol traces/content fixtures

tests/integration
    Game Package
    Main LogicalGameBootstrap
    Runtime Control / Frame
    role-facing fake ports

tests/platform/hostra
    launcher prepare from Game source
    manifest/join/preflight
    Node Runner/Supervision
    provisioning IPC/Data WS

tests/platform/pwa
    launcher prepare from Game source
    manifest/join/preflight
    Worker Runner/Supervision
    provisioning/MessageChannel

tests/platform/equivalence
    same Game source
    equivalent LogicalGameBootstrap
    platform-specific bindings

tests/e2e
    desktop/
    pwa/
```

Critical PREPARE fault injection：

```text
invalid Game Entry
invalid Platform manifest
missing/extra key
invalid/outside module
hosting capability unavailable
```

Each proves：

```text
Process/Worker creation = 0
business module import = 0
Runtime Control establishment = 0
```

---

## 16. Typical Dependencies

```text
main
    → runtime-control / renderer-control / wire as required

subsystem
    → runtime-control / data / content / foundation

renderer
    → renderer-control / data / content / foundation as needed

map
    → subsystem

game-launcher-hostra
    → game-package + subsystem/host + launcher-node + required adapters

game-launcher-pwa
    → game-package + subsystem/host + required Worker/MessagePort integration

apps/*
    → roles + matching launcher + adapters + business
```

禁止：

```text
main → game-package
main → game-launcher-*
map/business → game-package
map/business → game-launcher-*
map → subsystem/host
subsystem author root → concrete transport
apps/* duplicating Game/Launcher validation semantics
wire/foundation → domain authority
```

---

## 17. Creation Order

```text
foundation + wire ✅
→ game-package
→ runtime-control
→ subsystem author/host
→ main LogicalGameBootstrap + fake RuntimeHosting
→ game-launcher-hostra (first Game Package runtime-product consumer)
→ Desktop Frame vertical slice
→ renderer-control / data / Broker / Input / Render / Content
→ map / Desktop E2E
→ game-launcher-pwa (second Game Package runtime-product consumer)
→ PWA adapters/provisioning/E2E
→ cross-platform equivalence
```

---

## 18. Final Rules

1. repository layout只实现 package architecture；
2. Game Package是 document validation capability；
3. matching Launchers own Runtime-product Game Entry consumption；
4. Main不依赖 Game Package/concrete Launcher；
5. Game common config与 Platform executable config分离；
6. launcher packages各自拥有 schema/planner/resolver/RuntimeHosting/Runner integration；
7. apps是最终 composition roots且不重复 lower-level semantics；
8. author/host export surface分离；
9. Definition Module与 Host-owned Runner分离；
10. Data Broker仍在 composition/integration；
11. Foundation/Wire低层正交；
12. business无 Game/Platform launch依赖；
13. tests显式覆盖 zero-side-effect PREPARE与 logical bootstrap projection；
14. cross-platform equivalence不要求 same Definition artifact。
