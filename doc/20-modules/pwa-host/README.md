# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA Launch Manifest/Plan、Worker RuntimeHosting/Runner、MessagePort/MessageChannel、Worker provisioning、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)  
> 最近复核：2026-08-20

---

## 1. Composition

```text
Game Entry {key...}
        +
launch.pwa.json
        ↓
PWA Launch Planner
        ↓
PwaLaunchPlan
        ↓
PWA Platform
├── Worker RuntimeHosting / Supervision
├── Host-owned Worker Subsystem Runner
├── Runtime Control MessagePort
├── Worker Provisioning Path
├── browser Window Renderer
├── Renderer Control MessagePort
├── DataConnectionBroker / MessageChannel
└── Fetch + Service Worker / OPFS Content
```

---

## 2. Preflight

在 first Worker creation前完成：

```text
Game validation
PWA manifest validation
exact key-set join
all installation/same-origin module resolution
Worker/MessageChannel/security capability validation
freeze PwaLaunchPlan
```

任何 preflight failure = zero business Worker/module import/Runtime Control side effect。

---

## 3. Worker Bootstrap

```text
Main launch(key)
→ PWA RuntimeHosting plan lookup
→ create Host-owned Worker Runner
→ provisioning capability
→ Runner imports exact planned module
→ Runtime Control Port
→ hello/identified/initialize/ready
```

Host-owned Worker Runner是 constructor entry；business module不是 Worker constructor target。

---

## 4. PWA Policy

`launch.pwa.json`只选择 validated installation 内的 business `.mjs` artifact。

不能选择：Host-owned Runner URL、arbitrary external URL、Control/Data Ports、credential、CSP/same-origin policy、Service Worker policy。

---

## 5. Runtime Control / Provisioning

Runtime Control application unit：`postMessage(string)` = one UTF-8 JSON text JSON-RPC message。

Worker provisioning path独立于 Control/Data application carrier，负责 later transferred Data Port。

Structured Clone只用于 bootstrap/Port transfer。

---

## 6. Data / Content / Renderer

DataConnectionBroker创建/绑定 matching S/G/P MessageChannel，不 mint G/P；transfer/install failure不失败 Runtime/Frame。

Renderer、SW/Fetch/OPFS Content仍由完整 PWA composition组装，不被 `game-launcher-pwa` package吞并。

---

## 7. Cross-platform Equivalence

与 Hostra共享 Game logical topology/keys/formal semantics/logical scenario；不要求 Definition Module artifact/path、Worker/PID、Port/WS、SW/HTTP相同。

---

## 8. Tests

```text
PWA manifest exact join/preflight
all modules resolved before Worker creation
Host-owned Worker Runner constructor entry
planned business module exact import
host policy not manifest-controlled
Runtime Control postMessage(string)
provisioning path distinct from Control/Data
Data Port S/G/P binding
actual Worker termination → stopped
Hostra/PWA abstract-trace equivalence
```

---

## 9. Final Invariants

1. PWA executable binding独立于 Game topology；
2. immutable LaunchPlan before Worker side effect；
3. Main launch只使用 key；
4. Host-owned Worker Runner是 physical entry；
5. launch manifest不能控制 Host browser/security policy；
6. provisioning/Data failure domain与 Runtime/Frame分离；
7. Hostra/PWA application semantics等价。
