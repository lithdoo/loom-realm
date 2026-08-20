# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：logical roles、Game/Platform launch boundary、Runner/role-facing ports、Renderer Data 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 系统/模块 | 入口 | 说明 |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Runtime/Frame/DataAuthority authority；只发 logical launch intent |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Control mirror、Input/Render replica/presentation |
| Game Package | [game-package](./game-package/README.md) | `{key}` logical topology、initial input、common validation |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra manifest/plan、Node Runner、WS/IPC/Data Broker/Content |
| PWA | [pwa-host](./pwa-host/README.md) | PWA manifest/plan、Worker Runner、Ports/Broker/SW |
| FSDB Content | [fsdb-content-service](./fsdb-content-service/README.md) | readonly Content realization |
| `loom.map` | [loom-map](./loom-map/README.md) | platform-neutral author-level business Subsystem |

---

## 2. Game / Platform Launch Boundary

```text
Game Entry
    {key...} + initial
        │
        ├─ Main logical topology
        │
        └─ Platform Launch Planner
             + launch.hostra.json / launch.pwa.json
             → exact key-set join
             → resolve all executable bindings
             → immutable LaunchPlan
```

Game Package不拥有 module；Main也不接触 module。

---

## 3. Definition Module / Runner

Platform artifact：Host-owned Node/Worker Runner。  
Business artifact：`.mjs` default `SubsystemDefinitionFactory`。

Runner从 frozen PlatformLaunchPlan加载业务 module并构造 role-local ports。

Hostra/PWA artifact MAY不同；ABI/observable semantics必须相同。

---

## 4. Role / Platform Ports

Platform向 Main、Renderer、Subsystem提供各自 local projections。Launcher package只实现 Runtime launch capability，不因此拥有 Renderer/DataAuthority/Content完整平台职责。

---

## 5. Runtime / Frame / Data / Render

Runtime Container、Frame、Input Interest、Render Domain、Data Connection各自有独立 owner/lifecycle。

Runtime Control = Control1 + Frame1；Renderer Data = Connection1 + Input1 + Render1。

Data provisioning不是 Runtime Control；Data loss不等于 Runtime/Frame failure。

---

## 6. Business Portability

```text
@loomrealm/map → @loomrealm/subsystem
```

业务 source不依赖 `/host`、transport、Launcher或 Platform config。

Cross-platform equivalence基于 logical scenario/result，而不是 same module bytes/path。

---

## 7. Package / Adapter Mapping

```text
low-level
    foundation / wire

contract/capability
    game-package / runtime-control / renderer-control / data / content

role
    main / subsystem / renderer / content-service

runtime launch integration
    game-launcher-hostra / game-launcher-pwa

technical adapters
    launcher-node / transport-* / content-*

composition roots
    apps/desktop / apps/pwa / apps/cli
```

---

## 8. Core Rules

1. Game Package只拥有 `{key}` logical topology；
2. Platform Launch Manifest拥有 executable binding；
3. exact join + full preflight必须先于 Runtime side effect；
4. Main只发 `launch(key)`；
5. Host-owned Runner与 business Definition分离；
6. Hostra/PWA launcher packages保持窄能力，不成为 mega-package；
7. author/host Subsystem surfaces分离；
8. Hostra/PWA比较 abstract application trace，不要求 same Definition Module artifact。
