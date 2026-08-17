# PWA Composition 设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Worker、Subsystem Worker、MessagePort、Service Worker、OPFS 的平台组合与安全边界  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 分包：[独立分包与发布架构](../../30-implementation/package-architecture.md)  
> 最近复核：2026-08-17

本文描述 **PWA 运行拓扑/composition**，不是 `@loomrealm/host-pwa` 公共包规范。PWA 默认在 `apps/pwa` 中组合可复用能力与浏览器 Adapter。

## 1. Authority / Topology

Window 只拥有浏览器 UI/gesture 能力和 Web Renderer，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state 或 Render authority。

Main Runtime Worker 拥有：

```text
Session
Runtime Registry
Frame Registry/Stack
transaction/error/failure-unwind coordinator
Activation/InputTarget
Renderer Control authority
DataAuthority
```

每个 declared Subsystem 一个 Dedicated Worker；一个 Worker 可承载 `0..N` Frame/Input Context、`0..N` Render Domains、一个 Main Control carrier。

Renderer 对每个 Subsystem 至多一条 current Data Connection。

可能的实现组合：

```text
apps/pwa
├── @loomrealm/main
├── @loomrealm/renderer
├── @loomrealm/transport-messageport
└── @loomrealm/content-service-worker
```

实际 package 创建按实现需求推进。

## 2. Worker / Control Bootstrap

Descriptor→Worker script 解析、bootstrap credential 传递、Control MessagePort 创建/转移是 **PWA composition/adapter implementation**，不是独立 LoomRealm application Profile。

Host/composition 必须保证 Control carrier 建立时已绑定预期 Runtime/Session bootstrap context；建立后 application semantics 直接使用：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

具体 Worker constructor options、MessageChannel 创建顺序、Port transfer API、内部 bootstrap object 结构可以调整，只要不改变协议行为与安全边界。

## 3. Runtime Control MessagePort Adapter

Authenticated Control Port 建立后：

```text
port established
→ subsystem.hello(protocolVersions includes 1)
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

`ready` 只表示 Runtime readiness，不携 Data Port/endpoint，也不表示 Renderer Data Connection 存在。

```text
one postMessage payload
=
one JSON-RPC application message object
```

Structured Clone 不得扩大 Frame value model；adapter 不 retry/replay。

必须保持：

```text
frame.call Response before dependent Child initialize/activate
frame.return Response before dependent close/resume
activate/resume ACK before InputTarget publication
```

failure unwind 只在 Main Worker；Window、Worker wrapper、MessagePort adapter、Data Connection 均不得修改 root/Stack/Activation。

## 4. Renderer Control

Window/Web Renderer 从 Main 获得：

```text
full Authority Snapshot
Runtime projection
Frame Stack / Activation / InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

Renderer Control 不携 Data MessagePort、endpoint 或 bearer Data credential。

Control loss：

```text
stop ordinary input
invalidate InputTarget/DataAuthority
retire old Renderer⇄Subsystem Data Connections
→ reconnect Renderer Control
→ current full Snapshot
```

Renderer Control bootstrap token/Port 如何交付属于 composition/adapter implementation，不定义 bootstrap Profile。

## 5. Renderer ⇄ Subsystem Data

PWA 使用 MessagePort carrier adapter：

```text
Main publishes DataAuthority(S,G)
→ composition creates MessageChannel/Port
→ securely binds carrier to Session/current Renderer/S/G
→ transfers endpoints
→ installs at most one current Data Connection
```

Port bootstrap 不进入 Renderer Control Snapshot，也不进入 Subsystem `ready`。

同 generation 仍授权时，旧 carrier retired 后 MAY 建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

MessagePort adapter 只负责 carrier semantics，不拥有 Data authority 或应用层 recovery。

## 6. User Input / Render

```text
current Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

fresh Data Connection 从 empty Interest 开始；State 重新 baseline；Event 不 replay。

标准 keyboard/pointer/gamepad canonical payload 由 User Input v1 定义；DOM/Gamepad API 如何变换到 canonical payload由 Renderer implementation 负责。

Render Update：

```text
Registry
Snapshot(revision)
Patch(R→R+1)
Event
```

fresh Data carrier 以 Registry + fresh Snapshots 恢复；`tag` 只作为 opaque string 传输。

## 7. Content Binding

PWA Content 主要依赖：

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

这些是技术实现；Content API logical route/cache/version/integrity semantics 保持一致。

PWA 使用 same-origin authority，不需要复制 Desktop bearer distribution 机制，也不存在 Content Access Profile。

## 8. Package Boundary

平台差异优先落在单一能力 Adapter，例如：

```text
transport-messageport
content-service-worker
```

不默认建立：

```text
@loomrealm/host-pwa
```

Worker lifecycle、Port transfer、Service Worker registration 等 glue 默认留在 `apps/pwa` composition root；只有证明被多个独立产品复用时才抽成新包。

## 9. Cross-platform Semantic Equivalence

Desktop/PWA 对相同 abstract trace 必须保持：

```text
Control Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired identity
User Input canonical semantics/recovery
Render authoritative recovery
Content logical API semantics
```

平台允许在 Worker/Port/WebSocket/token/ticket 创建方式上不同。

## 10. Core Invariants

- Phase 1 one Subsystem = one Dedicated Worker；
- Runtime Control = Control v1 + Frame v1；
- Control ready 不携 Data endpoint/Port；
- Structured Clone 不能扩大协议 JSON value model；
- no Frame retry/replay；
- fixed-point unwind 只在 Main Worker；
- Renderer Control 只复制 logical authority；
- Control/Data Port bootstrap 是 composition/adapter implementation，不形成 application Profile；
- Control loss 撤销 Input/Data authority；
- Data loss 不等于 Runtime/Frame failure；
- Frame lifecycle 不控制 Render/Data lifecycle；
- PWA platform module 不等于公共万能 package。
