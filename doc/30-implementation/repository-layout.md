# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo 物理目录、Game Package、Runtime Control、Game/Platform launcher packages、Main-facing bootstrap surface、Subsystem author/host、Runner/provisioning与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

公开 package 职责以 package architecture为权威；本文只回答“代码放哪里”。

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

Current implemented layout：

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

Runtime dependency：`@loomrealm/wire` only。Primary Runtime-product consumers：`game-launcher-hostra/pwa`。

---

## 4. `packages/runtime-control`

M3 target first implementation：

```text
packages/runtime-control/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── scheduler.ts
│   ├── terminal.ts
│   ├── limits.ts
│   ├── encoding.ts
│   ├── dispatcher.ts
│   ├── writer.ts
│   ├── request-ids.ts
│   ├── pending.ts
│   ├── control/
│   │   ├── model.ts
│   │   ├── schema.ts
│   │   └── state.ts
│   ├── frame/
│   │   ├── model.ts
│   │   ├── schema.ts
│   │   └── errors.ts
│   ├── main-peer.ts
│   └── subsystem-peer.ts
└── test/
    ├── encoding.test.mjs
    ├── dispatcher.test.mjs
    ├── request-ids.test.mjs
    ├── control.test.mjs
    ├── frame.test.mjs
    ├── deadline.test.mjs
    ├── terminal.test.mjs
    └── package-boundary.test.mjs
```

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

Public package surface：

```text
@loomrealm/runtime-control
```

No first-release subpaths：

```text
/control
/frame
/profile
/testing
/internal
/node
/browser
```

Internal layout rules：

```text
one file/module owns carrier.messages() iteration
one dispatcher demuxes Control + Frame
one writer serializes all carrier.send calls
request-ids/pending are connection-wide
control/state owns only connection-local protocol legality
main-peer/subsystem-peer expose role-specific direction
```

MUST NOT create：

```text
generic-rpc/
schema-dsl/
transport/
Main authority implementation
Subsystem author API
```

`RuntimeControlScheduler` remains a package-local injected port；no generic Foundation Clock until independent reuse exists。

---

## 5. `packages/game-launcher-hostra`

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

Owns Game Entry consumption via Game Package、Hostra manifest/join/resolution/LaunchPlan、LogicalGameBootstrap projection、RuntimeHosting/Runner/supervision integration。

Does not contain complete Renderer/DataBroker/Content composition。

---

## 6. `packages/game-launcher-pwa`

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

Renderer/SW/Data Broker stay composition/adapters。

---

## 7. `packages/main`

Main source contains logical bootstrap/authority，but no Game parser：

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

M5 Main consumes Runtime Control through `MainRuntimeControlPeer`/binding adapter；Runtime Control package never imports Main implementation。

`logical-game-bootstrap.ts` contains only：

```text
subsystemKeys
initial {subsystemKey,input}
```

MUST NOT import Game Package/concrete Launcher。

---

## 8. `packages/subsystem`

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
│   │   ├── runtime-control-binding.ts
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

M4 `runtime-control-binding.ts` is the first real Subsystem-side consumer of `SubsystemRuntimeControlPeer`；it maps protocol call/return pending state to ordinary-input gating and maps typed outcomes into Frame business control flow。

Business package never imports `/host`、Runtime Control、Game Package、Launcher。

---

## 9. `packages/data`

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

## 10. Business Definition Build

Source：

```text
packages/map/src/subsystem.ts
```

Possible artifacts：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

MUST default-export `SubsystemDefinitionFactory`；business source remains platform-neutral and not Process/Worker entry glue。

---

## 11. Runner Placement

Current launcher packages own Runtime launch integration；Runner colocates there：

```text
packages/game-launcher-hostra/src/runner/
packages/game-launcher-pwa/src/runner/
```

Runner establishes/delivers physical Runtime Control carrier through platform adapter then hands it to role integration；Runner does not reimplement Runtime Control JSON-RPC/state semantics。

Do not pre-create universal `subsystem-node/subsystem-worker` without real independent reuse。

---

## 12. Role-facing Port Placement

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

Runtime Control scheduler/deadlines are protocol-mechanics constructor inputs, not Main application authority or Platform launch manifest fields。

System-level `DataConnectionBroker` stays composition/integration unless real shared capability emerges。

---

## 13. Desktop Composition Root

```text
apps/desktop/
├── Hostra game source/installation integration
├── @loomrealm/game-launcher-hostra prepare
├── Main/Renderer composition
├── Runtime/Renderer Control WebSocket carrier adapters
├── DataConnectionBroker
├── Data WebSocket provisioning
├── Runner provisioning IPC coordination
└── Content HTTP/fs composition
```

`apps/desktop` MUST NOT reimplement Game validation、Hostra manifest/join、Runtime Control schema/IDs/deadlines/dispatcher semantics。

---

## 14. PWA Composition Root

```text
apps/pwa/
├── PWA game source/installation integration
├── @loomrealm/game-launcher-pwa prepare
├── Main/Renderer composition
├── Runtime/Renderer Control MessagePort carrier adapters
├── DataConnectionBroker / MessageChannel transfer
├── Worker provisioning coordination
└── Content Service Worker/Fetch composition
```

Control/Data carrier only sends string application units；Port object only travels bootstrap/provisioning transfer。

PWA adapter does not create alternate structured Runtime Control application model。

---

## 15. Platform Config Placement

```text
Game common
    game.json

Hostra
    launch.hostra.json

PWA
    launch.pwa.json
```

Platform manifests never configure Runtime Control wire semantics/Request ID/deadline fields per business Game document。

No universal `launch.json` / `launcher.type` / `options:any`。

---

## 16. Test Layout

```text
tests/fixtures
    Game Entries / Launch Manifests / Definition artifacts
    Runtime Control abstract traces
    logical bootstrap/content expectations

tests/integration
    Game Package
    Runtime Control role-peer integration
    Main LogicalGameBootstrap
    role-facing fake ports

tests/platform/hostra
    launcher PREPARE
    Node Runner/Supervision
    Runtime Control WebSocket carrier binding
    provisioning IPC/Data WS

tests/platform/pwa
    launcher PREPARE
    Worker Runner/Supervision
    Runtime Control MessagePort carrier binding
    provisioning/MessageChannel

tests/platform/equivalence
    same logical Game + Runtime Control abstract trace

tests/e2e
    desktop/
    pwa/
```

M3 conformance is package-local；Hostra/PWA transport equivalence is later integration proof。

---

## 17. Typical Dependencies

```text
runtime-control
    → foundation + wire

main
    → runtime-control / renderer-control / wire as required

subsystem author root
    → data / content / foundation as exposed

subsystem host
    → runtime-control + role-local integrations

renderer
    → renderer-control / data / content / foundation as needed

map
    → subsystem author root

game-launcher-hostra
    → game-package + subsystem/host + launcher-node + required adapters

game-launcher-pwa
    → game-package + subsystem/host + Worker/MessagePort integration

apps/*
    → roles + matching launcher + adapters + business
```

Forbidden：

```text
runtime-control → main/subsystem implementation
runtime-control → Game Package/Launcher
runtime-control → WebSocket/MessagePort/Worker/node:*
main → game-package / game-launcher-*
map/business → runtime-control / game-package / launcher
map → subsystem/host
subsystem author root → concrete transport
apps/* duplicating Game/Launcher/Runtime Control semantics
wire/foundation → domain authority
```

---

## 18. Creation Order

```text
foundation + wire ✅
→ game-package ✅
→ runtime-control       ← M3 current
→ subsystem author/host
→ main LogicalGameBootstrap + fake RuntimeHosting
→ game-launcher-hostra
→ Desktop Frame vertical slice
→ renderer-control / data / Broker / Input / Render / Content
→ map / Desktop E2E
→ game-launcher-pwa
→ PWA adapters/provisioning/E2E
→ cross-platform equivalence
```

---

## 19. Final Rules

1. repository layout only realizes package architecture；
2. Game Package is document validation capability；
3. Runtime Control is root-only protocol mechanics capability depending on Foundation + Wire；
4. Runtime Control internal layout has one reader/dispatcher + one serialized writer + connection-wide IDs/pending；
5. role-specific peer files do not contain Main/Subsystem application authority；
6. matching Launchers own Runtime-product Game Entry consumption；
7. Main does not depend on Game Package/concrete Launcher；
8. Game common config and Platform executable config stay separate；
9. launcher packages own schema/planner/resolver/RuntimeHosting/Runner integration；
10. apps are final composition roots and do not duplicate lower-level semantics；
11. author/host export surface is split；business never imports Runtime Control directly；
12. Definition Module and Host-owned Runner are separate；
13. Data Broker stays composition/integration；
14. Foundation/Wire remain low-level orthogonal；
15. tests explicitly cover Runtime Control single reader/writer/ID/deadline/terminal mechanics and Game PREPARE zero-side-effect；
16. cross-platform equivalence does not require same artifact。
