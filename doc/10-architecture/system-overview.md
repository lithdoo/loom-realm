# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-03

本文档只描述 LoomRealm 由哪些系统组成、各系统为什么存在以及它们如何协作。精确 Entry、Launcher、消息字段、模块拆分和分包方案由下层契约与模块文档定义。

## 1. 顶层结构

```text
游戏包
├── Manifest / Entry
├── Subsystem Descriptors
├── Launcher Entries
├── FSDB 数据
└── 资源主体
        │
        ├──────────────▶ LoomRealm Main
        │                  ├── Session / Subsystem Registry
        │                  ├── Launcher / Runtime Supervisor
        │                  ├── Frame Registry / Stack / Activation
        │                  ├── Input Target
        │                  └── Connection Authority
        │                           │
        │                           │ Control Plane
        │                           ▼
        │                  Subsystem Runtime Container
        │                  ├── 权威业务状态与规则
        │                  ├── 0..N Frame / Input Context
        │                  ├── 0..N Render Context
        │                  └── Renderer Data Endpoint
        │                           │
        │                           │ System Data Connection
        │                           ▼
        │                       Web Renderer
        │                       ├── System Connection Registry
        │                       ├── Render Store / Scheduler
        │                       ├── Frame Input Registry
        │                       └── DOM / Canvas / WebGL
        │
        └──────────────▶ Readonly Content Service
```

## 2. 核心对象

### Subsystem

Game Entry 中的 Subsystem Descriptor 使用唯一、稳定的 `key` 作为 Descriptor identity，例如 `loom.map`、`loom.menu`。

Legacy 数据协议仍可能使用 `systemId`。其 wire 迁移由对应协议版本冻结；新 Frame / Call v1 不使用旧 `systemId` 建立第二套 Frame ownership identity。

### Runtime Container

一个 Subsystem 对应一个有效 Runtime Container：Desktop 为独立 Process，PWA 为 Dedicated Worker。Container 是 Subsystem 级承载单元，不等于 Frame。

### Frame

Frame 是 Main-owned 的一次调用 / ordinary User Input Context。

Frame / Call v1 Batch A 已冻结：

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanently bound to descriptor.key

callerFrameId
    immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame owns current Activation
    Main-generated / Session unique / never reused
    revoked Activation never becomes valid again
```

v1 没有 Frame `ready / initialized / frame.status`。

Frame 不是 Render identity，也不是平台强制的业务状态所有权单元。

### Render

Render 是 Subsystem 完全拥有的呈现 Context。公共架构不定义 Frame 与 Render 的 ownership 关系。

## 3. Runtime 启动与结束

Desktop v1 启动：

```text
Main Control Endpoint ready
→ validate all Subsystem Descriptors
→ resolve launcher targets
→ create Launch Attempts / Tokens
→ token registration
→ spawn required Processes + Supervisor
→ Subsystem connects Main
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

正常结束：

```text
Main establishes shutdown intent
→ subsystem.shutdown(reason)
→ status(stopping) [optional]
→ Supervisor confirms Runtime exit
→ stopped
```

因此：

```text
shutdown Response ≠ stopped
status(stopping) ≠ stopped
```

没有 Main shutdown intent 的 Runtime exit 或 Control Connection loss 是 failure。

当前全部 Descriptor eager / required；不定义 lazy。Subsystem Control v1 不支持 same-attempt reconnect / resume / automatic restart，也不定义 application-level heartbeat。

## 4. 栈式运行系统

Frame / Call 是独立协议域，可以复用已认证 Main ⇄ Subsystem Control Connection，但不得重新定义 Runtime Bootstrap、Subsystem identity、ready、shutdown 或 restart。

Batch A 已冻结的稳定 Stack 关系：

```text
Stack Top
    active + current Activation

all lower live Frames
    suspended + no current Activation
```

事务切换期间可以短暂没有 active Frame，但 Main 不得发布两个同时有效的 ordinary Input Target。

Frame 只能在目标 Runtime `ready` 且没有 shutdown intent 时建立。

后续 Batch B-F 继续冻结 RPC Schema、Call transaction、error/timeout、Runtime failure unwind 和完整 profile。

详见：[栈式运行系统](./stack-runtime-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)。

## 5. 运行承载系统

核心规则：

```text
每个 Subsystem 一个 Runtime Container
每个 Container 0..N Frame / Input Context
每个 Container 0..N Render Context
每个 Container 与 Main 一条长期 Control Connection
每个 Container 与 Renderer 最多一条 System Data Connection
```

Frame create / suspend / resume / close 不隐式创建、销毁或重启 Runtime/Data Connection/Render。

## 6. 通信系统

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control Protocol v1          Frozen
        Frame / Call v1 Batch A                Frozen
        Frame / Call v1 Batch B-F              Draft

    Renderer ⇄ Main
        Draft target

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update Protocol
        User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

User Input 必须遵守 Frame Batch A 的 current Activation：旧/revoked Activation 永久拒绝。

Render Update 使用独立 Render identity，不继承 Frame Activation epoch。

## 7. 渲染系统

Renderer 接收各 Subsystem 发布的声明式 Render State，在本地维护 Render Store，并协调为可信 DOM、Canvas 或 WebGL 视图。

Renderer 不从 Frame Stack 推导 Render visibility/order/lifecycle，也不因 Frame `suspended / closing / closed` 自动删除 Render。

## 8. Storage / Launcher / Content

Content API 只提供只读逻辑数据与资源。受控 Subsystem Launcher 是 Main 的运行能力，不属于 Content API。

必须区分：

```text
Content API capability
    no arbitrary physical path / execution capability

Desktop Node.js Process OS capability
    v1 no sandbox; executable code is trusted
```

## 9. 状态所有权

```text
LoomRealm Main
    Session
    Subsystem Descriptor / Runtime Registry
    Launcher / Launch Attempt / Runtime Supervisor
    Runtime shutdown intent
    Frame identity / lifecycle / Stack
    Activation / Input Target
    Connection Authority

Subsystem Runtime Container
    authoritative business state / rules
    Frame Input Handler / internal associations
    Render Registry / Render State
    shared resources/cache

Web Renderer
    read-only Main Control mirror
    System Data Connection Registry
    Frame Input Registry
    Render Store
    non-authoritative presentation state

Content Service
    installation registry / readonly content delivery
```

## 10. Desktop 承载

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / Web Renderer
每个已声明 Subsystem 一个 Subsystem Process
```

通信：

```text
Main → Subsystem Process
    Desktop Node.js Launcher Profile v1

Subsystem ⇄ Main
    per-Subsystem Control WebSocket
    ├── Subsystem Control v1
    └── Frame / Call v1

Renderer ⇄ Main
    per-Session Control WebSocket

Renderer ⇄ Subsystem
    per-Subsystem Data WebSocket

Runtime / Renderer ⇄ Content
    localhost HTTP
```

## 11. PWA 承载

```text
Window
    Web Renderer

Main Runtime Dedicated Worker
    Session / Runtime Registry / Frame Stack / Activation / Input Target

每个 Subsystem 一个 Dedicated Worker
    Business Runtime / Frame Input Context / Render Context

Service Worker
    Readonly Content API
```

PWA Launcher / Bootstrap Credential / Control Transport Profile 尚未冻结，但不得改变 Subsystem Control v1 和 Frame Batch A 已 Frozen 的逻辑语义。

## 12. 核心不变量

1. Process / Worker 隔离粒度是 Subsystem，不是 Frame；
2. Frame 是 Main-owned call / ordinary User Input Context；
3. `frameId` Session 内唯一且不复用；
4. Frame 永久绑定 `descriptor.key` 与 immutable caller；
5. Frame lifecycle = `starting / active / suspended / closing / closed`；
6. Frame outcome 与 lifecycle 分离；
7. v1 无 Frame ready/status；
8. 只有 active Frame 有有效 Activation；
9. revoked Activation 永久失效；
10. Render lifecycle 完全由 Subsystem 控制；
11. Main 不维护 Render Registry；
12. System Data Connection 不依赖 Frame 数量；
13. `spawn success ≠ connected ≠ identified ≠ ready`；
14. Main 拥有正常 Runtime shutdown intent；
15. `stopped` 只来自实际 Runtime termination observation；
16. Subsystem Control 与 Frame / Call 是独立协议域；
17. Content API 与 Launcher 是不同能力边界。
