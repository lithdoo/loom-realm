# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA 对系统级 Platform Composition 的 realization：Window、Main/Subsystem Worker、Worker Subsystem Runner、MessagePort/MessageChannel、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 最近复核：2026-08-19

本文描述 PWA Platform Composition realization，不是 `@loomrealm/platform-pwa` 包规范。

---

## 1. Composition Boundary

```text
Game Package {key,module}
        ↓
PWA Platform
├── Runtime Hosting / Supervision
├── Worker Subsystem Runner
├── Runtime / Renderer Control binding
├── Renderer Hosting
├── Data Connection Broker
└── Content Binding
        ↓
platform-neutral LoomRealm roles
```

Window/Worker/Port/Service Worker只负责物理承载，不拥有 Frame/Activation/InputTarget/DataAuthority/Render authority。

---

## 2. PWA Mapping

```text
Subsystem Definition Module
    → same package-local .mjs declared by Game Package

RuntimeHosting
    → per-Subsystem Dedicated Worker

SubsystemRunner
    → PWA Worker runtime shell
    → imports descriptor.module

RuntimeControlBinding
    → transferred/authenticated MessagePort

RendererHosting
    → browser Window

RendererControlBinding
    → controlled MessagePort

DataConnectionBroker
    → MessageChannel + endpoint transfer

ContentBinding
    → same-origin Fetch + Service Worker / OPFS
```

Game Package不需要 Worker-specific Descriptor。

---

## 3. Worker Subsystem Runner

PWA Worker是 Platform Runtime Container；Worker内先运行 LoomRealm Subsystem Runner/bootstrap shell，再加载业务 Definition Module。

```text
Dedicated Worker
    PWA Runner
        ↓ import
    game-owned descriptor.module
        ↓
    @loomrealm/subsystem host integration
```

Runner负责：

```text
receive/validate platform bootstrap
resolve/import exact declared .mjs module
validate Subsystem Definition Module ABI
construct Subsystem-facing Platform Ports
start Subsystem role
```

业务 module不得自己创建 Worker、寻找 MessagePort或分支 PWA业务逻辑。

---

## 4. Runtime Bootstrap / Control

```text
validate Game Package Descriptor set
→ resolve descriptor.module in current installation
→ create Launch Attempt/bootstrap auth
→ create Dedicated Worker running PWA Runner
→ Runner imports module
→ Runtime Control Port available
→ subsystem.hello
→ identified
→ ready
```

`ready`不携 Data Port/endpoint，也不表示 Renderer Data Connection存在。

Structured Clone不能扩大正式 application payload数据模型。

---

## 5. Renderer Hosting / Control

Window/Web Renderer是 Renderer participant的物理宿主。

```text
Main Renderer intent
→ current Window/Web application
→ Renderer Control MessagePort
→ renderer.hello
→ full current Authority Snapshot
```

Snapshot不携 Data MessagePort或 platform credential。

---

## 6. Data Connection Broker

```text
Main current DataAuthority(S,G)
→ PWA DataConnectionBroker
→ create MessageChannel
→ bind both endpoints to Session/current Renderer/S/G
→ transfer endpoint to Renderer
→ transfer endpoint to target Subsystem Runner
→ install at most one current Data Connection
```

Port transfer/bootstrap不进入 Renderer Control Snapshot或 Runtime `ready`。

same generation仍授权时，old carrier retired后可以建立 fresh carrier。

---

## 7. User Input / Render

fresh Data Connection：

```text
User Input
    Frame Interest Registry = empty remotely
    retained Input State = empty
    Subsystem republishes desired full registry

Render Update
    current Domain Registry
    fresh Snapshot per current Domain
```

Frame suspension可保留 Frame Interest configuration；fresh Activation不复用旧 Input State/Event。

Frame lifecycle不控制 Render/Data lifecycle。

---

## 8. Content

PWA Content可组合 same-origin Fetch、Service Worker、OPFS/Cache Storage，但 logical Content API语义与 Desktop一致。

Definition Module executable loading属于 Platform Runner capability，不通过 ordinary Content API赋予业务任意 executable access。

---

## 9. Browser / Worker Boundary

PWA implementation可以改变：

```text
Worker constructor options
startup message shape
MessageChannel creation order
Port transfer mechanics
module URL materialization
Service Worker registration
OPFS/cache implementation
```

只要不改变：

```text
same descriptor.module identity
Subsystem Definition Module ABI
Runtime identity/lifecycle
Frame transaction/recovery
Renderer/Data authority
User Input semantics
Render recovery
Content logical API
```

这些 platform bootstrap mechanisms默认不形成 application Protocol。

---

## 10. Composition Root / Package Boundary

当前实现位置：

```text
apps/pwa
```

可能组合：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/transport-messageport
@loomrealm/content-service-worker
Worker/Port integration glue
business Subsystem modules
```

若 Worker Subsystem Runner出现稳定复用价值，可按真实消费者抽成 technical integration package；不因为平台存在就创建大而全 `platform-pwa` 包。

---

## 11. Cross-platform Equivalence

Hostra Desktop/PWA必须使用相同：

```text
Game Package logical Descriptor {key,module}
Subsystem Definition Module
business trace
```

并保持：

```text
Runtime lifecycle
Frame authority/outcome/unwind
Renderer authority
Data current/retired identity
Frame-scoped Input semantics
Render recovery
Content logical semantics
```

允许 Worker/Port/WS/HTTP等 physical trace不同。

---

## 12. Core Invariants

- Game Package只声明 `key + module`；
- PWA Worker Runner加载同一 platform-neutral `.mjs` business module；
- no Worker-specific business Descriptor；
- Runner拥有 bootstrap/ports，business module不拥有平台 mechanics；
- Runtime Control = Control v1 + Frame v1；
- ready不携 Data endpoint/Port；
- Data Broker协调两端 Port但不拥有 generation；
- Data loss不等于 Runtime/Frame failure；
- Structured Clone不扩大 application payload模型；
- PWA与Hostra共享同一 business Definition Module ABI。
