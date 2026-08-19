# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Game Package 进入 Session 后 Runtime/Renderer 的逻辑启动顺序、Subsystem Definition Module、Platform Runner、Control/Data carrier 建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)  
> 下层契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher / Runner Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)  
> 最近复核：2026-08-19

## 1. 设计目标

Main 是 Session / logical authority 编排者；Platform Composition 是物理 Runtime/Renderer/Connection/Content topology 的建立者。

```text
Game Package
    declares logical Subsystem topology + Definition Module

Main
    owns logical Session / Runtime / Frame / Data authority

Platform Composition
    realizes Process / Worker / Window / carrier / Runner / Content topology
```

业务 Subsystem Definition Module 不自己创建 Runtime、WebSocket、MessagePort 或 Worker。

---

## 2. Platform-neutral Subsystem Bootstrap

Game Package v1 Descriptor：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

其中：

```text
key     = application Subsystem identity
module  = package-local .mjs Subsystem Definition Module
```

`module` 不是 Node argv entry，也不是 Worker URL。

逻辑启动：

```text
validate complete Descriptor set
→ resolve each declared Definition Module for current installation/platform
→ create Launch Attempt
→ register bootstrap credential
→ Platform Runtime Hosting creates Runtime Container
→ Platform Subsystem Runner starts
→ Runner loads exactly descriptor.module
→ Runner obtains Subsystem-facing Platform Ports
→ Runtime Control carrier becomes available
→ subsystem.hello
→ identified
→ initialize
→ ready
```

```text
module resolved != Runtime created != connected != identified != ready
```

---

## 3. Runner Boundary

Platform-specific Runner 是业务 Definition Module 与物理 Runtime Container 之间的唯一 bootstrap integration layer。

```text
                     same Definition Module
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
        Desktop Node Runner      PWA Worker Runner
                 │                     │
          Node child process      Dedicated Worker
```

Runner负责：

```text
platform bootstrap material
Subsystem-facing Platform Ports
loading/validating Definition Module ABI
entering @loomrealm/subsystem host integration
```

业务 module 负责：

```text
business state
Frame handlers
Input/Render/Content usage
```

禁止业务 module 把 Platform Runner mechanics 当成业务 API。

---

## 4. Descriptor Validation / Module Resolution

Main/Game Package Validator 在任何 Runtime side effect 前完成：

```text
closed Descriptor schema
key uniqueness
initial target reference
module logical syntax / .mjs
```

当前 Platform 在业务代码执行前完成：

```text
module exists
belongs to selected installation
cannot escape installation namespace
can be loaded as ESM
```

Module load/default-export ABI failure属于 required Runtime bootstrap failure。

---

## 5. Runtime `ready` Boundary

`subsystem.status({state:"ready"})` 只表示 Runtime required initialization 已完成并能够承担 enclosing Runtime Control Profile。

不得推导：

```text
Renderer participant exists
DataAuthority exists
Data Connection exists
Frame exists
Render Domain exists
InputTarget exists
```

`ready` 不携 Data endpoint/ticket/Port。

---

## 6. Main / Platform Supervisor Boundary

Main public Runtime state：

```text
declared → starting → connected → identified → ready → stopping → stopped
                                  \→ failed
```

来源：

```text
starting    Main Launch Attempt + Platform launch intent
connected   Main accepted Control carrier
identified  subsystem.hello success
ready       subsystem.status(ready)
stopped     Supervisor observed actual Runtime termination
failed      Control/Runtime failure classification
```

PID/Worker handle/module path 都不是 Runtime identity。

---

## 7. Failure / Restart

以下均可导致 bootstrap failure：

```text
module resolve failure
Runner creation failure
module import/ABI validation failure
Runtime exits before ready
Control bootstrap failure
```

ready 后无 termination intent 的 Runtime exit/Control loss进入 Runtime failure。

当前不允许 Platform automatic restart；restart 必须是 fresh Launch Attempt + fresh Runtime + fresh bootstrap credential。

---

## 8. Renderer Bootstrap

```text
Main establishes Renderer intent
→ Platform Renderer Hosting realizes current Renderer participant
→ Renderer Control carrier established
→ renderer.hello
→ current full Authority Snapshot
```

Snapshot 只含 logical authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

不携 Data endpoint/ticket/Port/Hostra Window identity。

---

## 9. Renderer ⇄ Subsystem Data Establishment

Main publishes：

```text
DataAuthority(S,G,P)
```

Platform Data Connection Broker：

```text
current authority
→ provision matching physical endpoints
→ bind Session/current Renderer/S/G
→ deliver role-local connection capability to Renderer + Subsystem Runner
→ install at most one current Data Connection
```

Endpoint/ticket/MessagePort 属于 Platform bootstrap material，不属于 `ready` 或 DataAuthority identity。

same generation 仍授权时可在 old carrier retired 后建立 fresh carrier。

---

## 10. Data Child-protocol Baseline

fresh Data Connection：

```text
User Input
    Interest Registry = empty
    retained Input State = empty
    Subsystem republishes current desired full registry

Render Update
    current Domain Registry
    fresh Snapshot for each current Domain
```

Data reconnect 不重建 business Runtime/Frame/Render objects。

---

## 11. Frame/Input / Render Independence

```text
Frame / Activation / InputTarget
    Main authority

Frame Input Interest
    Subsystem-owned configuration

Render Domain
    Subsystem-owned lifecycle/state

Data Connection
    independent carrier authority/lifecycle
```

禁止从任一 lifecycle 隐式推导另一域 lifecycle。

---

## 12. Hostra Desktop Realization

```text
Definition Module
    same package-local .mjs business module

Runtime Hosting
    Host-selected Node.js child process

Subsystem Runner
    Host-owned Node Runner process entry
    imports descriptor.module

Runtime Control
    localhost WebSocket

Renderer Hosting
    Hostra/Electron BrowserWindow

Renderer Control
    localhost WebSocket

Renderer⇄Subsystem Data
    Platform-brokered authenticated localhost carrier

Content
    filesystem-backed service + localhost HTTP
```

Desktop Game Package 不再声明 Node launcher type/env/argv。

---

## 13. PWA Realization

```text
Definition Module
    same package-local .mjs business module

Runtime Hosting
    per-Subsystem Dedicated Worker

Subsystem Runner
    Worker bootstrap/runtime shell
    imports descriptor.module

Runtime Control
    MessagePort

Renderer Hosting
    browser Window

Renderer Control
    MessagePort

Renderer⇄Subsystem Data
    MessageChannel + Port transfer

Content
    Fetch + Service Worker / OPFS
```

PWA 不需要第二份 platform-specific business Descriptor。

---

## 14. Renderer Reload

Renderer reload只重建 Renderer participant/control/data physical realization；不重新解释 Game Package Subsystem module或重启健康 Runtime。

Data fresh-baseline规则继续独立执行。

---

## 15. Trust Boundary

```text
validated module identity
!= executable sandbox
```

Desktop Node业务 module是 trusted executable code；PWA Worker提供不同物理隔离。签名/Publisher Trust/不可信 executable sandbox另行设计。

---

## 16. Recommended Session Startup

```text
1. create Session
2. initialize Platform facilities
3. read + validate Game Package Descriptor set
4. resolve required Definition Modules
5. create Launch Attempts + bootstrap auth
6. Platform Runtime Hosting starts per-Subsystem Runner containers
7. each Runner loads declared Definition Module
8. establish Runtime Control
9. hello → identified → ready
10. realize Renderer + Renderer Control
11. Main publishes DataAuthority
12. Platform Broker provisions Data connections
13. Input/Render fresh baselines
14. Main drives Frame lifecycle; Subsystem drives Render lifecycle
```

---

## 17. Core Invariants

1. Game Package声明 logical Subsystem + Definition Module，不声明物理 Runtime technology；
2. same Descriptor/module用于 Hostra Desktop 与 PWA；
3. Platform Runner是 Definition Module与物理 Runtime之间的 bootstrap layer；
4. business module不自己探测/创建平台资源；
5. `module resolved != Runtime created != connected != identified != ready`；
6. Runtime identity由 `descriptor.key` + `subsystem.hello`绑定；
7. `ready`不携 Data material；
8. stopped只来自 actual Runtime termination；
9. no automatic restart；
10. Data Connection Broker负责 actual Data carrier establishment；
11. Data loss不等于 Runtime/Frame failure；
12. Desktop/PWA physical bootstrap不同，但同一 business Definition Module产生等价 application semantics。
