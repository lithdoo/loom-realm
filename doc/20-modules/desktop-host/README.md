# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra Launch Manifest/Plan、Node Runner、WebSocket、Runner provisioning IPC、DataConnectionBroker、HTTP/filesystem 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-20

本文描述完整 Hostra Platform Composition；Subsystem launch planning/hosting可由窄包 `@loomrealm/game-launcher-hostra`实现，但本文不是一个 platform mega-package规范。

---

## 1. Composition

```text
Game Entry {key...}
        +
launch.hostra.json
        ↓
Hostra Launch Planner
        ↓
HostraLaunchPlan
        ↓
Hostra Desktop
├── Node RuntimeHosting / Supervisor
├── Host-owned Node Subsystem Runner
├── Runtime Control WebSocket
├── Runner Provisioning IPC
├── BrowserWindow Renderer
├── Renderer Control WebSocket
├── DataConnectionBroker / Data WebSocket
└── fs + localhost HTTP Content
```

---

## 2. Preflight

在 first process spawn前必须完成：

```text
Game validation
Hostra manifest validation
exact key-set join
all Hostra module resolution/containment
Node/Runner capability check
freeze HostraLaunchPlan
```

任何 preflight error = zero business Runtime process/module import/Control side effect。

---

## 3. Runtime Bootstrap

```text
Main launch(key)
→ Hostra RuntimeHosting plan lookup
→ Launch Attempt/token
→ provisioning capability
→ spawn Host-owned Node Runner
→ Runner imports exact planned module
→ Runtime Control WS
→ hello/identified/initialize/ready
```

`module valid != spawned != loaded != connected != identified != ready`。

---

## 4. Hostra Policy

`launch.hostra.json`可以选择 installation 内业务 `.mjs`，但不能选择 Node executable、Runner entry、shell/argv/env policy、Control endpoint/token或 Data ticket。

这些是 Host-owned deployment/security policy。

---

## 5. Control / Provisioning / Data

Runtime Control WebSocket：one text message = one UTF-8 JSON text JSON-RPC message。

Runner provisioning IPC与 Runtime Control/stdout/Data carrier独立，用于 later Data endpoint/ticket。

DataConnectionBroker绑定 current Session/Renderer/S/G/P，不 mint G/P。Provisioning failure != Runtime failure/Frame unwind。

---

## 6. Content / Renderer

Renderer Hosting、Renderer Control、Data Broker和 fs/HTTP Content仍是 Hostra composition职责，不被 `game-launcher-hostra` package吞并。

---

## 7. Cross-platform Equivalence

与 PWA共享 Game logical topology、Subsystem keys、protocol/role semantics与测试 scenario；不要求 module path/bytes、PID/Worker、IPC/Port、WS/MessagePort相同。

---

## 8. Tests

```text
Hostra manifest exact join/preflight
all modules resolved before spawn
Host-owned Runner process entry
business module exact planned import
Host policy cannot be overridden by manifest
Control JSON-text WS
provisioning distinct from Control/Data
Data offer S/G/P binding
actual process exit → stopped
Hostra/PWA abstract-trace equivalence
```

---

## 9. Final Invariants

1. Hostra Platform owns physical topology；
2. Hostra executable binding独立于 Game logical topology；
3. immutable LaunchPlan before process side effect；
4. Main launch只使用 key；
5. Host-owned Node Runner是 process entry；
6. launch manifest不能控制 Host security policy；
7. provisioning/Data failure domain与 Runtime/Frame分离；
8. Hostra/PWA logical application semantics等价。
