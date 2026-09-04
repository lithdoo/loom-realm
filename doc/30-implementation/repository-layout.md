# 仓库与目录方案

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：monorepo 物理目录、Game/Runtime/Renderer/Data packages、Main-facing bootstrap/authority surface、Runner provisioning、Desktop composition 与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 最近复核：2026-09-04

公开 package 职责以 package architecture为权威；本文只回答“当前/下一步代码放哪里”。

---

## 1. Top-level

```text
packages/
├── foundation/
├── platform-ports/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── content/                 // M12+
├── main/
├── subsystem/
├── renderer/
├── content-service/         // M12+
└── map/                     // M13+

apps/
├── desktop/                 // first materializes in M9
├── pwa/                     // later
└── cli/                     // later

tools/
└── fixtures/...
```

Do not create every target directory in advance。M9 creates `apps/desktop` because it now has a real one-app physical consumer；PWA/CLI remain demand-driven。

Root npm workspaces through M8：

```text
packages/*
```

M9 implementation changes this to：

```text
packages/*
apps/*
```

---

## 2. Package Categories

```text
low-level
    foundation / wire

shared Core↔Platform contract
    platform-ports

document/protocol capability
    game-package / runtime-control / renderer-control / data / content

role
    main / subsystem / renderer / content-service

runtime launch integration
    game-launcher-hostra / game-launcher-pwa

app composition
    apps/desktop / apps/pwa / apps/cli

business
    map / compatibility packages
```

Protocol package、process boundary、Platform composition与 milestone不等同。

---

## 3. `packages/platform-ports`

Current layout stays intentionally small：

```text
packages/platform-ports/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
└── test/
```

Frozen root surface through M9：

```text
M4
    DeadlineScheduler
    RuntimeControlBinding

M5
    RuntimeLaunchRequest
    MainRuntimeControlBinding
    HostedRuntime
    RuntimeHosting

M7
    OpaqueMaterialGenerator
    RendererControlBinding

M8
    RendererDataBinding
    SubsystemDataBinding
    SubsystemDataBindingResult

M9
    DataConnectionAuthorityEntry
    DataConnectionAuthorityView
    DataConnectionAuthoritySink
```

Runtime dependency remains exactly `@loomrealm/foundation`。

M9 types remain in `src/index.ts`; do not create `authority/`, `broker/`, EventBus or Platform mega-interface solely for three small structural types。

---

## 4. `packages/runtime-control` / `packages/renderer-control` / `packages/data`

These remain protocol-mechanics packages with no concrete Hostra/PWA transport authority。

```text
runtime-control
    Foundation + Wire

renderer-control
    Foundation + Wire

data
    Foundation + Wire
```

M9 MUST NOT add WS/IPC/Broker code or authority sink implementation to `packages/data`。

---

## 5. `packages/game-launcher-hostra`

Current M6 implementation remains the Runtime launch owner；M9 adds only child-owned provisioning integration。

Recommended current structure after M9：

```text
packages/game-launcher-hostra/
├── src/
│   ├── index.ts
│   ├── prepare.ts
│   ├── launch-plan.ts
│   ├── manifest.ts
│   ├── module-resolver.ts
│   ├── runtime-hosting.ts
│   ├── websocket-carrier.ts
│   └── runner/
│       ├── entry.ts / bootstrap.ts
│       └── data-provisioning.ts       // M9
└── test/
```

M9 public Hostra integration types may stay near `runtime-hosting.ts`/root export：

```text
HostraRuntimeDataPrepareRequest
HostraRuntimeDataProvisioner
onRuntimeDataProvisioner hook
```

Do not create generic `provisioning` npm package、RuntimeDirectory or DataConnectionBroker inside launcher。

---

## 6. `packages/game-launcher-pwa`

PWA package remains its own Game PREPARE/Worker Runtime launch integration。M9 MUST NOT modify it only for type symmetry。

PWA Data provisioning/MessageChannel mapping begins when its real platform slice is implemented (M16 full physical closure path)。

---

## 7. `packages/main`

Current layout may remain：

```text
packages/main/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── model.ts
│   ├── errors.ts
│   └── internal/
│       ├── main-session.ts
│       └── primitives.ts
└── test/
```

M9 does not justify a stateful `DataAuthorityManager` or `PlatformProjectionBus` directory。`MainSessionRuntime` may add small pure helpers/private projection records while remaining the single authority coordinator。

`model.ts` adds only optional：

```ts
readonly dataConnections?: DataConnectionAuthoritySink;
```

M9 main-session changes：

```text
retain current accepted Renderer token as inert correlation
include it in live opaque-material duplicate check
project exact full DataConnectionAuthorityView
call replace(null/view) inside existing mutation lane
```

No public Main Session controller。

---

## 8. `packages/subsystem`

Existing M8 role-facing Data path remains unchanged。

```text
packages/subsystem/src/host/
    run-subsystem.ts
    Runtime Control integration
    optional SubsystemDataBinding integration
```

M9 Runner provisioning implementation lives in Hostra launcher/Runner code, not in author-facing subsystem root。`SubsystemDataBinding.acquire()` continues to wait for an already-current-deliverable carrier。

---

## 9. `packages/renderer`

Existing M8 Renderer holder/reconciliation remains unchanged。

M9 provides a real Desktop `RendererDataBinding` realization from `apps/desktop`; it does not add Hostra/WebSocket imports to the platform-neutral renderer package。

---

## 10. `apps/desktop` — M9 First Real Layout

M9 creates a private app workspace. Exact private filenames may vary, but responsibility placement is frozen：

```text
apps/desktop/
├── package.json
├── tsconfig.json
├── src/
│   ├── data-broker.ts            // session-scoped Broker / sink
│   ├── data-websocket.ts         // two-sided loopback candidate/relay
│   └── renderer-data-binding.ts  // per-physical-Renderer delivery cells
└── test/
    ├── data-broker.test.*        // contract harness
    └── m9-vertical.test.*        // real Main/Runner/Data vertical
```

Equivalent private layout is allowed；ownership is not。

Desktop Broker owns：

```text
DataConnectionAuthoritySink realization
latest full Main view
per-S candidate/current slots
two-sided one-time WS capabilities
opaque relay gate
RendererDataBinding delivery
exact HostedRuntime→Hostra provisioner private WeakMap correlation
```

It MUST NOT own Game schema、Runtime/Renderer Control protocol parsing、Main authority、Input/Render business state or Content。

M9 `apps/desktop` is not yet a full Electron BrowserWindow app；M14 completes that product composition。

---

## 11. Hostra Runner Provisioning Placement

```text
Host process / runtime-hosting.ts
    owns child IPC endpoint + provisioner object

Runner bootstrap
    installs provisioning IPC listener
    constructs real SubsystemDataBinding

runner/data-provisioning.ts
    prepared candidate
    committed current-deliverable carrier
    Binding waiter
```

Data endpoint remains late; it MUST NOT be added to `RunnerBootstrapV1` startup material。

Hostra-private IPC messages：

```text
provision / prepared / commit / committed / revoke
```

No generic RPC layer。

---

## 12. Role-facing Port Placement Through M9

Shared Core↔Platform contracts live only in：

```text
packages/platform-ports/src/index.ts
```

Consumer/physical implementations stay with their owner：

```text
Main
    consumes DataConnectionAuthoritySink

Renderer
    consumes RendererDataBinding

Subsystem host
    consumes SubsystemDataBinding

apps/desktop
    implements DataConnectionAuthoritySink + RendererDataBinding

Hostra Runner integration
    implements SubsystemDataBinding delivery mechanics
```

`DataConnectionBroker` remains app composition, not shared port type。

---

## 13. Testing Placement

Keep evidence close to owners：

```text
packages/platform-ports/test
    exact M9 exported structural surface / Foundation-only dependency

packages/main/test
    sink optionality/full-view/token correlation/mutation ordering

packages/game-launcher-hostra/test
    provisioner handoff/IPC/Runner Data binding

apps/desktop/test
    Broker authority/candidate/install/retire harness
    real M9 Hostra vertical
```

Root script `test:m9` composes these gates。

M10/M11 business publication-baseline tests do not belong in M9 Broker tests。

---

## 14. Typical Dependencies Through M9

```text
platform-ports
    → foundation

runtime-control / renderer-control / data
    → foundation + wire

main
    → platform-ports + runtime-control + renderer-control + wire

subsystem/host
    → platform-ports + runtime-control + data

renderer
    → renderer-control + platform-ports + data

game-launcher-hostra
    → game-package + foundation + platform-ports + subsystem + wire + ws

apps/desktop
    → main/renderer + platform-ports + matching Hostra integration + protocol roles as composition needs
```

Forbidden：

```text
main → game-launcher-hostra/apps/desktop
renderer/subsystem business root → apps/desktop or concrete transport
platform-ports → main/protocol/concrete Platform
packages/data → WS/IPC/Broker
apps/desktop duplicating protocol validators
```

---

## 15. M9 Creation Order

```text
1. platform-ports exact authority sink types
2. MainPlatform optional sink + Main full-view projection
3. Hostra runtime→provisioner handoff
4. Runner provisioning IPC + current-deliverable SubsystemDataBinding
5. create apps/desktop workspace + workspace glob
6. Desktop Broker/two-sided WS/RendererDataBinding
7. Broker contract harness
8. real M9 vertical + root test:m9
```

This order minimizes circular construction and keeps M6/M8 regression paths usable throughout implementation。

---

## 16. Final Rules

1. repository layout realizes package architecture；it does not redefine authority；
2. `platform-ports` stays one small Foundation-only root module through M9；
3. Main adds no Data-specific authority registry/event bus；
4. Hostra launcher owns child provisioning mechanics but not Broker policy；
5. `apps/desktop` materializes at M9 because a real app-scoped Broker now exists；
6. Desktop Broker uses plain private records/maps, not a public ConnectionManager framework；
7. Data WebSocket/IPC never enters `@loomrealm/data`/Renderer/Subsystem author packages；
8. M8 Binding signatures stay unchanged；
9. Runner startup bootstrap stays Data-endpoint-free；
10. M9 tests stop at physical Data peer lifecycle and do not claim M10/M11 business baselines；
11. PWA/CLI directories remain uncreated until real consumers require them；
12. no generic RPC/registry/event/transaction/retry framework is created for M9。
