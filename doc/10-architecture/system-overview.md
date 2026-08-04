# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-04

本文只描述系统划分与协作关系；精确 wire field 由 `15-contracts` 定义。

## 1. 顶层结构

```text
Game Package
├── Manifest / Entry
├── Subsystem Descriptors
├── Launcher Entries
└── Content / Resources
        │
        ├──────────────▶ LoomRealm Main
        │                  ├── Runtime Registry / Supervisor
        │                  ├── Frame Registry / Stack / Activation
        │                  ├── Input Target
        │                  └── Connection Authority
        │                           │
        │                           │ Control Plane
        │                           ▼
        │                  Subsystem Runtime Container
        │                  ├── authoritative business state
        │                  ├── 0..N Frame/Input Context
        │                  ├── 0..N Render Context
        │                  └── Renderer Data Endpoint
        │                           │
        │                           │ System Data Connection
        │                           ▼
        │                       Web Renderer
        │                       ├── Connection Registry
        │                       ├── Frame Input Registry
        │                       ├── Render Store / Scheduler
        │                       └── DOM / Canvas / WebGL
        │
        └──────────────▶ Readonly Content Service
```

## 2. 核心对象

### Subsystem

Descriptor identity = stable `key`。Legacy 数据协议可能仍有 `systemId`，但新 Frame / Call v1 不从它建立第二套 identity。

### Runtime Container

每 Subsystem 同时最多一个有效 Runtime Container：Desktop Process / PWA Dedicated Worker。它是执行与故障隔离单元，不等于 Frame。

### Frame

Frame 是 Main-owned call / ordinary User Input Context。

Batch A 已冻结：

```text
frameId
    Main-generated / Session unique / never reused

Frame → Subsystem
    permanent descriptor.key assignment

callerFrameId
    Main-owned / immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame owns current Activation
    unique / never reused / revoked forever
```

v1 无 Frame `ready / initialized / frame.status`。

### Render

Render 是 Subsystem-owned presentation Context。公共架构不定义 Frame→Render ownership。

## 3. Runtime 启动与结束

Desktop：

```text
validate descriptors
→ resolve launcher targets
→ create Launch Attempts / Tokens
→ register token before spawn
→ spawn + Supervisor
→ Subsystem connects Main
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

```text
spawn success ≠ connected ≠ identified ≠ ready
```

正常结束：

```text
Main shutdown intent
→ subsystem.shutdown(reason)
→ status(stopping) [optional]
→ Supervisor confirms Runtime exit
→ stopped
```

`shutdown Response ≠ stopped`；无 shutdown intent 的 Process/Control loss 是 failure。

## 4. Frame / Call Control

Subsystem Control 与 Frame / Call 是独立协议域，但可共享已认证 Control Connection。

当前 Frame / Call 状态：

```text
Batch A  Identity / Lifecycle / Activation              Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics   Frozen
Batch C-F                                                Draft
```

Batch B exact wire surface：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

关键边界：

- `callerFrameId` 由 Main 保存，不进入 Subsystem Frame wire；
- source Subsystem identity 来自 authenticated Control Connection；
- `frame.call` 只建立 Child call，不等待最终 outcome；
- Child outcome 经 `frame.return → Main → frame.resume` 交付；
- `frame.resume` 同时交付 outcome + replacement Activation；
- `frame.close` 无 reason；
- v1 无 `system.call / system.return / frame.result`。

Batch C 继续冻结这些 RPC 之间的事务顺序、Input Target commit barrier 与 rollback，不再改变字段。

## 5. Stack / Input Target

稳定状态：

```text
Stack Top
    active + current Activation

all lower live Frames
    suspended + no current Activation
```

事务中可短暂无 active Frame，但 Main 不得发布两个 ordinary Input Target。

合法 ordinary input 至少要求 active Frame + current Activation + Main-authorized Input Target。revoked Activation 永久拒绝。

## 6. 运行承载

```text
每 Subsystem 一个 Runtime Container
每 Container 0..N Frame/Input Context
每 Container 0..N Render Context
每 Container 与 Main 一条长期 Control Connection
每 Container 与 Renderer 最多一条 System Data Connection
```

Frame create/suspend/resume/close 不隐式创建、销毁或重启 Runtime/Data Connection/Render。

## 7. 通信系统

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1          Frozen
        Frame / Call Batch A/B        Frozen
        Frame / Call Batch C-F        Draft

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

User Input 继承 Frame current Activation；Render Update 使用独立 Render identity，不继承 Frame Activation epoch。

## 8. 状态所有权

```text
Main
    Session / Runtime Registry / Supervisor
    Runtime shutdown intent
    Frame identity / caller / lifecycle / Stack
    Activation / Input Target
    Connection Authority

Subsystem
    authoritative business state / rules
    Frame Input Contexts
    Render Registry / Render State
    shared resources/cache

Renderer
    read-only Main Control mirror
    Data Connection Registry
    Frame Input Registry
    Render Store / presentation state

Content Service
    installation registry / readonly delivery
```

## 9. Desktop / PWA Mapping

Desktop：Main Process + per-Subsystem Process + Hostra Renderer + Content Service；Control/Data 使用 localhost WebSocket，Content 使用 HTTP。

PWA：Main Dedicated Worker + per-Subsystem Dedicated Worker + Window Renderer + Service Worker；Control/Data 使用 MessagePort。

PWA Launcher/Credential/Transport Profile 尚未冻结，但必须保持 Subsystem Control v1 与 Frame Batch A/B 的应用层语义，不能因 MessagePort 改方法名或字段。

## 10. Render 与 Content

Renderer 不从 Frame Stack 推导 Render visibility/order/lifecycle，也不因 Frame closed 自动删除 Render。

Content API 只提供只读逻辑内容；Launcher 是独立 privileged capability。Desktop Node.js Process v1 不宣称 OS sandbox。

## 11. 核心不变量

1. Process/Worker 隔离粒度 = Subsystem；
2. Frame = Main-owned call/input Context；
3. Frame/Activation identity 不复用；
4. Caller relationship Main-owned，不进入 Subsystem Frame wire；
5. lifecycle 与 outcome 分离；
6. Batch B exactly seven JSON-RPC Requests；
7. `frame.call` 非 long-running result RPC；
8. `frame.resume` 同时 outcome + replacement Activation；
9. Render lifecycle 完全由 Subsystem 控制；
10. System Data Connection 不依赖 Frame 数量；
11. `spawn success ≠ connected ≠ identified ≠ ready`；
12. `stopped` 只来自实际 Runtime termination observation；
13. Subsystem Control 与 Frame / Call 是独立协议域；
14. Content API 与 Launcher 是不同能力边界。
