# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：PWA 对系统级 Platform Composition 的 realization：Window、Main/Subsystem Worker、MessagePort/MessageChannel、Service Worker/OPFS 与安全边界  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 分包：[独立分包与发布架构](../../30-implementation/package-architecture.md)  
> 最近复核：2026-08-19

本文描述 **PWA Platform Composition realization**，不是 `@loomrealm/platform-pwa` 公共包规范。

---

## 1. Composition Boundary

```text
                LoomRealm logical roles
        Main / Renderer / Subsystem / Content
                         │
                    Platform Ports
                         │
                         ▼
                         PWA
```

Window/Worker/Port/Service Worker 只负责物理承载和平台能力，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state、DataAuthority 或 Render authority。

---

## 2. PWA Platform Mapping

```text
RuntimeHosting
    → per-Subsystem Dedicated Worker

RuntimeSupervisor
    → Worker error/termination observation

RuntimeControlBinding
    → transferred/authenticated MessagePort

RendererHosting
    → browser Window / Web application

RendererControlBinding
    → controlled MessagePort

DataConnectionBroker
    → MessageChannel + endpoint transfer

ContentBinding
    → same-origin Fetch + Service Worker / OPFS
```

这些实现与 Hostra Desktop 相同的 system Platform ports。

---

## 3. Runtime Hosting / Control Bootstrap

Descriptor→Worker script 解析、bootstrap credential 传递、Control MessagePort 创建/转移是 PWA composition/adapter implementation。

逻辑流程仍然是：

```text
Platform launches Dedicated Worker
→ Control Port available to Runtime
→ subsystem.hello
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

建立后 application semantics：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

`ready` 只表示 Runtime readiness，不携 Data Port/endpoint，也不表示 Renderer Data Connection 存在。

Structured Clone 不得扩大正式 Frame/User Input/Render JSON value model；adapter 不 retry/replay state-changing application operation。

---

## 4. Renderer Hosting / Control

Window/Web Renderer 是 Renderer participant 的物理宿主，不拥有 Main authority。

```text
Main Renderer intent
→ PWA composition uses current Window/Web application
→ establish Renderer Control Port
→ renderer.hello
→ current full Authority Snapshot
```

Renderer Control snapshot 只含 logical authority：

```text
Runtime projection
Frame Stack / Activation / InputTarget
DataAuthority {subsystemKey,generation,connectionProfile}
```

不携 Data MessagePort、endpoint、Port transfer object 或 platform credential。

---

## 5. Data Connection Broker

PWA Data establishment 是系统级 broker action：

```text
Main publishes DataAuthority(S,G)
→ composition creates MessageChannel
→ bind both ports to Session/current Renderer/S/G
→ transfer one endpoint to Renderer
→ transfer one endpoint to target Subsystem Worker
→ install at most one current Data Connection
```

Port bootstrap 不进入 Renderer Control Snapshot，也不进入 Subsystem `ready`。

同 generation 仍授权时，old carrier retired 后 MAY 建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

MessagePort adapter 只负责 carrier semantics，不拥有 Data authority 或 application recovery。

---

## 6. User Input / Render

User Input：

```text
Effective(F,A,C)
=
current Data Connection
∧ Main current InputTarget == (S,F,A)
∧ mirrored/local current Activation A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

fresh Data Connection：

```text
Frame Interest Registry = empty
retained Input State = empty
```

Subsystem 重新发布 current full Frame Interest Registry；`.state` fresh baseline；`.event` no replay。

Frame suspension可保留 local/old-carrier Frame Interest configuration；fresh Activation不得复用 old Activation Input State/Event。

Render Update fresh carrier：

```text
current Domain Registry
→ fresh Snapshot every current Domain
→ Patch/Event
```

Frame lifecycle不控制 Render/Data lifecycle。

---

## 7. Content Binding

PWA Content 主要组合：

```text
@loomrealm/content
@loomrealm/content-service-worker
```

底层 MAY 使用：

```text
same-origin Fetch
Service Worker
OPFS
Cache Storage
```

这些是 Platform realization；Content API logical route/cache/version/integrity/error semantics 与 Desktop 保持一致。

---

## 8. Browser / Worker Boundary

PWA composition 可以自由调整：

```text
Worker constructor options
startup message object
MessageChannel creation order
Port transfer mechanics
Service Worker registration
OPFS/cache implementation
```

只要不改变：

```text
Runtime identity/lifecycle
Frame transaction/recovery
Renderer authority
Data identity/current-retired semantics
User Input canonical semantics
Render authoritative recovery
Content logical API
```

这些平台机制默认不形成新的 application Profile。

---

## 9. Composition Root / Package Boundary

当前推荐实现位置：

```text
apps/pwa
```

可能组合：

```text
@loomrealm/main
@loomrealm/renderer
@loomrealm/subsystem consumers
@loomrealm/transport-messageport
@loomrealm/content-service-worker
```

Platform Architecture 不要求立即建立：

```text
@loomrealm/platform-pwa
```

只有 PWA composition glue 出现多个独立消费者、稳定 API 与独立发布价值时才抽包。

---

## 10. Cross-platform Semantic Equivalence

Hostra Desktop/PWA 对相同 abstract trace 必须保持：

```text
Control Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired identity
Frame-scoped User Input semantics/recovery
Render authoritative recovery
Content logical API semantics
```

允许 Worker/Port/WebSocket/token/ticket/HTTP/Service Worker creation sequence 不同。

---

## 11. Core Invariants

- PWA implements Platform Composition，不拥有 Main authority；
- Phase 1 one Subsystem = one Dedicated Worker；
- Runtime Control = Control v1 + Frame v1；
- Control ready 不携 Data endpoint/Port；
- Structured Clone 不能扩大 protocol JSON model；
- no Frame retry/replay；
- fixed-point unwind 只在 Main；
- Renderer Control只复制 logical authority；
- Data Connection Broker协调两端 Port，不拥有 generation；
- fresh Data Input Interest Registry empty；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Render/Data lifecycle；
- PWA Platform Architecture 不自动意味着公共万能 package。
